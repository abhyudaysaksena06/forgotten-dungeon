"""Convert a Blender 5.x room (.blend or .blend1, zstd-compressed or not) into the game's room
files without Blender:

    python3 tools/blender/blend2room.py <source.blend> client/public/models/room_1.glb [--report]

Writes the room exactly as modelled: every visible mesh with its Principled BSDF material (base
colour or packed image texture, metallic, roughness, emission and its strength), the point and spot
lamps (KHR_lights_punctual, in the same units Blender's exporter uses, which the client converts
back), and the spawn_* / door empties. Blender's Z-up becomes glTF's Y-up. Faces of any size are
ear-clipped; flat-shaded meshes keep hard normals, smooth ones get area-weighted vertex normals.

It reads the file through its own SDNA (tools/blender/blendfile.py), so it works where Blender
isn't installed. It supports what procedural room scenes use: meshes (attribute storage of Blender
4.5+, or classic CustomData), Principled BSDF materials, Image Texture nodes with packed images,
point and spot lamps, empties, and loc/rot/scale transforms with parents. Modifiers are not
evaluated: apply them in Blender before saving if a room uses any (the converter warns).
"""
import json
import math
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from blendfile import Blend, load  # noqa: E402

OB_TYPES = {0: 'EMPTY', 1: 'MESH', 10: 'LAMP', 11: 'CAMERA'}
LIGHT_W_TO_CD = 683 / (4 * math.pi)  # what Blender's glTF exporter does; the client divides by 683


# ---------- small vector maths ----------

def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def mat_from_trs(loc, rot, size, rotmode, quat):
    if rotmode == 0:  # quaternion
        w, x, y, z = quat
        n = math.sqrt(w * w + x * x + y * y + z * z) or 1.0
        w, x, y, z = w / n, x / n, y / n, z / n
        r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
             [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
             [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    else:
        # Euler; Blender's rotmode 1..6 = XYZ, XZY, YXZ, YZX, ZXY, ZYX (applied in that order)
        order = {1: 'XYZ', 2: 'XZY', 3: 'YXZ', 4: 'YZX', 5: 'ZXY', 6: 'ZYX'}.get(rotmode, 'XYZ')
        mats = {}
        cx, sx = math.cos(rot[0]), math.sin(rot[0])
        cy, sy = math.cos(rot[1]), math.sin(rot[1])
        cz, sz = math.cos(rot[2]), math.sin(rot[2])
        mats['X'] = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
        mats['Y'] = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
        mats['Z'] = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
        r = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
        for axis in order:  # first axis is applied first: R = ... * R2 * R1
            m = mats[axis]
            r = [[sum(m[i][k] * r[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return [[r[0][0] * size[0], r[0][1] * size[1], r[0][2] * size[2], loc[0]],
            [r[1][0] * size[0], r[1][1] * size[1], r[1][2] * size[2], loc[1]],
            [r[2][0] * size[0], r[2][1] * size[1], r[2][2] * size[2], loc[2]],
            [0, 0, 0, 1]]


def mat4_from_dna(flat):
    # DNA float[4][4] is column-major (m[col][row])
    return [[flat[c * 4 + r] for c in range(4)] for r in range(4)]


def decompose(m):
    t = [m[0][3], m[1][3], m[2][3]]
    cols = [[m[0][c], m[1][c], m[2][c]] for c in range(3)]
    s = [math.sqrt(sum(v * v for v in col)) or 1.0 for col in cols]
    r = [[cols[c][rr] / s[c] for c in range(3)] for rr in range(3)]
    det = (r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0])
           + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]))
    if det < 0:
        s[0] = -s[0]
        r = [[-r[0][0], r[0][1], r[0][2]], [-r[1][0], r[1][1], r[1][2]], [-r[2][0], r[2][1], r[2][2]]]
    tr = r[0][0] + r[1][1] + r[2][2]
    if tr > 0:
        k = math.sqrt(tr + 1.0) * 2
        q = [(r[2][1] - r[1][2]) / k, (r[0][2] - r[2][0]) / k, (r[1][0] - r[0][1]) / k, 0.25 * k]
    elif r[0][0] > r[1][1] and r[0][0] > r[2][2]:
        k = math.sqrt(1.0 + r[0][0] - r[1][1] - r[2][2]) * 2
        q = [0.25 * k, (r[0][1] + r[1][0]) / k, (r[0][2] + r[2][0]) / k, (r[2][1] - r[1][2]) / k]
    elif r[1][1] > r[2][2]:
        k = math.sqrt(1.0 + r[1][1] - r[0][0] - r[2][2]) * 2
        q = [(r[0][1] + r[1][0]) / k, 0.25 * k, (r[1][2] + r[2][1]) / k, (r[0][2] - r[2][0]) / k]
    else:
        k = math.sqrt(1.0 + r[2][2] - r[0][0] - r[1][1]) * 2
        q = [(r[0][2] + r[2][0]) / k, (r[1][2] + r[2][1]) / k, 0.25 * k, (r[1][0] - r[0][1]) / k]
    return t, q, s  # q as (x, y, z, w)


def yup(v):  # Blender Z-up -> glTF Y-up
    return [v[0], v[2], -v[1]]


def quat_yup(q):  # rotation quaternion (x, y, z, w) through the same basis change
    return [q[0], q[2], -q[1], q[3]]


def quat_mul(a, b):  # (x, y, z, w)
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz]


# ---------- triangulation ----------

def newell(pts):
    nx = ny = nz = 0.0
    for i in range(len(pts)):
        x0, y0, z0 = pts[i]
        x1, y1, z1 = pts[(i + 1) % len(pts)]
        nx += (y0 - y1) * (z0 + z1)
        ny += (z0 - z1) * (x0 + x1)
        nz += (x0 - x1) * (y0 + y1)
    return [nx, ny, nz]


def ear_clip(pts):
    """Triangles (as index triples into pts) for a planar-ish polygon of any size."""
    n = len(pts)
    if n == 3:
        return [(0, 1, 2)]
    nrm = newell(pts)
    ax = max(range(3), key=lambda i: abs(nrm[i]))
    u, v = [(1, 2), (2, 0), (0, 1)][ax]
    flip = nrm[ax] < 0
    p2 = [(p[u], p[v]) for p in pts]
    if flip:
        p2 = [(x, -y) for x, y in p2]

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    idx = list(range(n))
    tris = []
    guard = 0
    while len(idx) > 3 and guard < n * n:
        guard += 1
        clipped = False
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = p2[i0], p2[i1], p2[i2]
            if cross(a, b, c) <= 1e-12:
                continue  # reflex or degenerate corner
            inside = False
            for j in idx:
                if j in (i0, i1, i2):
                    continue
                p = p2[j]
                if cross(a, b, p) >= 0 and cross(b, c, p) >= 0 and cross(c, a, p) >= 0:
                    inside = True
                    break
            if inside:
                continue
            tris.append((i0, i1, i2))
            idx.pop(k)
            clipped = True
            break
        if not clipped:  # degenerate leftovers: fan the rest
            break
    for k in range(1, len(idx) - 1):
        tris.append((idx[0], idx[k], idx[k + 1]))
    return tris


# ---------- reading the scene ----------

def read_mesh(b, blk):
    b.use(blk)
    o = blk['off']
    nv, nf, nl = b.get('Mesh', o, 'totvert'), b.get('Mesh', o, 'totpoly'), b.get('Mesh', o, 'totloop')
    attrs = {}
    if b.has('Mesh', 'attribute_storage'):
        st = o + b.field_offset('Mesh', 'attribute_storage')
        n = b.get('AttributeStorage', st, 'dna_attributes_num')
        ab = b.block_of(b.get('AttributeStorage', st, 'dna_attributes'))
        for k in range(min(n, ab['len'] // 24) if ab else 0):
            ao = ab['off'] + k * 24
            name = b.cstr(b.get('Attribute', ao, 'name'))
            dt, dom, stype = b.get('Attribute', ao, 'data_type'), b.get('Attribute', ao, 'domain'), b.get('Attribute', ao, 'storage_type')
            holder = b.block_of(b.get('Attribute', ao, 'data'))
            if not holder or name is None:
                continue
            raw = b.block_of(b.get('AttributeArray' if stype == 0 else 'AttributeSingle', holder['off'], 'data'))
            if not raw:
                continue
            attrs[name] = (dt, dom, stype, raw)
    # classic CustomData layers (older files, and anything not in attribute storage)
    for cd, dom in (('vdata', 0), ('edata', 1), ('pdata', 2), ('ldata', 3)):
        if not b.has('Mesh', cd):
            continue
        co = o + b.field_offset('Mesh', cd)
        tl = b.get('CustomData', co, 'totlayer')
        lp = b.block_of(b.get('CustomData', co, 'layers'))
        for k in range(tl if lp else 0):
            lo = lp['off'] + k * b.struct_size('CustomDataLayer')
            name = b.get('CustomDataLayer', lo, 'name')
            raw = b.block_of(b.get('CustomDataLayer', lo, 'data'))
            if raw and name and name not in attrs:
                attrs[name] = ('cd%d' % b.get('CustomDataLayer', lo, 'type'), dom, 0, raw)

    def arr(name, fmt, count):
        """count elements of a homogeneous format ('fff', 'ff', 'i', 'B'), tuples when wider than one."""
        a = attrs.get(name)
        if not a:
            return None
        raw, w = a[3], len(fmt)
        if a[2] == 1:  # one value for the whole domain
            v = struct.unpack_from('<%d%s' % (w, fmt[0]), b.d, raw['off'])
            return [v if w > 1 else v[0]] * count
        cnt = min(count, raw['len'] // struct.calcsize('<' + fmt))
        flat = struct.unpack_from('<%d%s' % (cnt * w, fmt[0]), b.d, raw['off'])
        return list(flat) if w == 1 else [tuple(flat[i * w:(i + 1) * w]) for i in range(cnt)]

    pos = arr('position', 'fff', nv)
    corner_vert = arr('.corner_vert', 'i', nl)
    offsets = b.raw_array(b.get('Mesh', o, 'poly_offset_indices'), 'i') if nf else []
    sharp = arr('sharp_face', 'B', nf) or [0] * nf
    mat_index = arr('material_index', 'i', nf) or [0] * nf
    uv_name = None
    for name, a in attrs.items():
        if a[1] == 3 and (a[0] == 6 or a[0] == 'cd49') and not name.startswith('.') and name != 'position':
            uv_name = name
            break
    uv = arr(uv_name, 'ff', nl) if uv_name else None
    mats = []
    mp = b.raw_array(b.get('Mesh', o, 'mat'), 'Q') if b.get('Mesh', o, 'totcol') else []
    for p in mp or []:
        mats.append(b.id_name(p))
    return {'pos': pos, 'corner_vert': corner_vert, 'offsets': list(offsets or []), 'sharp': sharp, 'mat_index': mat_index,
            'uv': uv, 'mats': mats, 'nv': nv, 'nf': nf}


def socket_value(b, sock):
    dv = b.block_of(b.get('bNodeSocket', sock['off'], 'default_value'))
    idn = b.get('bNodeSocket', sock['off'], 'idname')
    if not dv:
        return None
    if 'Color' in idn:
        return list(struct.unpack_from('<4f', b.d, dv['off']))
    if 'Float' in idn:
        return struct.unpack_from('<f', b.d, dv['off'] + 4)[0]
    return None


def read_material(b, blk):
    b.use(blk)
    o = blk['off']
    out = {'name': b.id_name_of(blk)[2:], 'base': [b.get('Material', o, c) for c in 'rgb'] + [1.0], 'metallic': b.get('Material', o, 'metallic'),
           'roughness': b.get('Material', o, 'roughness'), 'emission': [0, 0, 0], 'emission_strength': 0.0, 'alpha': 1.0, 'image': None}
    nt = b.block_of(b.get('Material', o, 'nodetree'))  # embedded: DATA in the material's scope
    if not nt:
        return out
    nodes = b.listbase(nt['off'] + b.field_offset('bNodeTree', 'nodes'), 'bNode')
    links = b.listbase(nt['off'] + b.field_offset('bNodeTree', 'links'), 'bNodeLink')
    from_node = {b.get('bNodeLink', l['off'], 'tosock'): b.get('bNodeLink', l['off'], 'fromnode') for l in links}
    node_by_ptr = {n['old']: n for n in nodes}
    principled = next((n for n in nodes if b.get('bNode', n['off'], 'idname') == 'ShaderNodeBsdfPrincipled'), None)
    if not principled:
        return out
    for s in b.listbase(principled['off'] + b.field_offset('bNode', 'inputs'), 'bNodeSocket'):
        name = b.get('bNodeSocket', s['off'], 'name')
        linked = node_by_ptr.get(from_node.get(s['old']))
        val = socket_value(b, s)
        if name == 'Base Color':
            if linked is not None and b.get('bNode', linked['off'], 'idname') == 'ShaderNodeTexImage':
                img = b.id_block(b.get('bNode', linked['off'], 'id'))
                out['image'] = b.id_name_of(img)[2:] if img else None
                out['base'] = [1.0, 1.0, 1.0, 1.0]
            elif val:
                out['base'] = val
        elif name == 'Metallic' and val is not None:
            out['metallic'] = val
        elif name == 'Roughness' and val is not None:
            out['roughness'] = val
        elif name == 'Emission Color' and val:
            out['emission'] = val[:3]
        elif name == 'Emission Strength' and val is not None:
            out['emission_strength'] = val
        elif name == 'Alpha' and val is not None:
            out['alpha'] = val
    return out


def read_image(b, blk):
    b.use(blk)
    o = blk['off']
    pf = b.block_of(b.get('Image', o, 'packedfile'))
    if not pf:
        return None
    size = b.get('PackedFile', pf['off'], 'size')
    raw = b.block_of(b.get('PackedFile', pf['off'], 'data'))
    if not raw:
        return None
    data = b.d[raw['off']:raw['off'] + size]
    mime = 'image/png' if data[:4] == b'\x89PNG' else 'image/jpeg' if data[:2] == b'\xff\xd8' else None
    return (data, mime) if mime else None


def read_scene(path):
    b = Blend(load(path))
    meshes = {b.id_name_of(blk): (blk, None) for blk in b.ids('ME')}
    materials = {b.id_name_of(blk): read_material(b, blk) for blk in b.ids('MA')}
    images = {}
    for blk in b.ids('IM'):
        img = read_image(b, blk)
        if img:
            images[b.id_name_of(blk)[2:]] = img
    lamp = 'Lamp' if 'Lamp' in b.struct_by_name else 'Light'
    lights = {}
    for blk in b.ids('LA'):
        b.use(blk)
        o = blk['off']
        lights[b.id_name_of(blk)] = {'type': b.get(lamp, o, 'type'), 'color': [b.get(lamp, o, c) for c in 'rgb'],
                                     'energy': b.get(lamp, o, 'energy'), 'spotsize': b.get(lamp, o, 'spotsize'),
                                     'spotblend': b.get(lamp, o, 'spotblend')}
    objects = []
    warnings = []
    for blk in b.ids('OB'):
        b.use(blk)
        o = blk['off']
        name = b.id_name_of(blk)[2:]
        t = OB_TYPES.get(b.get('Object', o, 'type'))
        hidden = False
        if b.has('Object', 'visibility_flag'):
            hidden = bool(b.get('Object', o, 'visibility_flag') & (1 << 2))  # OB_HIDE_RENDER
        mods = b.listbase(o + b.field_offset('Object', 'modifiers'), 'ModifierData')
        if mods:
            warnings.append(f'{name}: {len(mods)} modifier(s) not applied')
        loc = b.get('Object', o, 'loc')
        dloc = b.get('Object', o, 'dloc')
        local = mat_from_trs([loc[i] + dloc[i] for i in range(3)], [b.get('Object', o, 'rot')[i] + b.get('Object', o, 'drot')[i] for i in range(3)],
                             [b.get('Object', o, 'size')[i] * b.get('Object', o, 'dscale')[i] for i in range(3)],
                             b.get('Object', o, 'rotmode'), b.get('Object', o, 'quat'))
        parent = b.id_block(b.get('Object', o, 'parent'))
        data = b.id_block(b.get('Object', o, 'data'))
        objects.append({'name': name, 'type': t, 'hidden': hidden, 'local': local,
                        'parentinv': mat4_from_dna(b.get('Object', o, 'parentinv')),
                        'parent': b.id_name_of(parent)[2:] if parent else None,
                        'data': b.id_name_of(data) if data else None})
    by_name = {ob['name']: ob for ob in objects}

    def world(ob, depth=0):
        if ob['parent'] and ob['parent'] in by_name and depth < 32:
            return mat_mul(mat_mul(world(by_name[ob['parent']], depth + 1), ob['parentinv']), ob['local'])
        return ob['local']

    for ob in objects:
        ob['world'] = world(ob)
    mesh_data = {}
    for ob in objects:
        if ob['type'] == 'MESH' and ob['data'] in meshes and ob['data'] not in mesh_data:
            mesh_data[ob['data']] = read_mesh(b, meshes[ob['data']][0])
    return {'objects': objects, 'meshes': mesh_data, 'materials': materials, 'images': images, 'lights': lights, 'warnings': warnings}


# ---------- building the glTF ----------

def build_primitives(m):
    """Per material slot: (positions, normals, uvs, indices) in glTF space."""
    pos, cv, offs = m['pos'], m['corner_vert'], m['offsets']
    if not pos or not cv or not offs:
        return {}
    nf = len(offs) - 1
    face_n = []
    vnorm = [[0.0, 0.0, 0.0] for _ in pos]
    for f in range(nf):
        verts = cv[offs[f]:offs[f + 1]]
        nrm = newell([pos[v] for v in verts])
        face_n.append(nrm)
        if not m['sharp'][f]:
            for v in verts:
                vn = vnorm[v]
                vn[0] += nrm[0]
                vn[1] += nrm[1]
                vn[2] += nrm[2]

    def unit(v):
        n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
        return [v[0] / n, v[1] / n, v[2] / n] if n > 1e-20 else [0.0, 0.0, 1.0]

    prims = {}
    for f in range(nf):
        slot = m['mat_index'][f] if f < len(m['mat_index']) else 0
        P = prims.setdefault(slot, {'key': {}, 'pos': [], 'nrm': [], 'uv': [], 'idx': []})
        corners = list(range(offs[f], offs[f + 1]))
        verts = [cv[c] for c in corners]
        fn = unit(face_n[f])
        local = []
        for c, v in zip(corners, verts):
            n = fn if m['sharp'][f] else unit(vnorm[v])
            uvv = m['uv'][c] if m['uv'] and c < len(m['uv']) else (0.0, 0.0)
            key = (v, round(uvv[0], 6), round(uvv[1], 6), f if m['sharp'][f] else -1)
            i = P['key'].get(key)
            if i is None:
                i = len(P['pos'])
                P['key'][key] = i
                P['pos'].append(yup(pos[v]))
                P['nrm'].append(yup(n))
                P['uv'].append([uvv[0], 1.0 - uvv[1]])
            local.append(i)
        for a, bb, c in ear_clip([pos[v] for v in verts]):
            P['idx'].extend([local[a], local[bb], local[c]])
    return prims


class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.j = {'asset': {'version': '2.0', 'generator': 'forgotten-dungeon blend2room.py'}, 'scene': 0, 'scenes': [{'nodes': []}],
                  'nodes': [], 'meshes': [], 'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': [{'byteLength': 0}]}

    def view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            v['target'] = target
        self.j['bufferViews'].append(v)
        return len(self.j['bufferViews']) - 1

    def accessor(self, values, kind, comp=5126, target=34962, minmax=False):
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[kind]
        flat = [x for v in values for x in (v if width > 1 else [v])]
        fmt = {5126: 'f', 5125: 'I', 5123: 'H'}[comp]
        bv = self.view(struct.pack('<%d%s' % (len(flat), fmt), *flat), target)
        acc = {'bufferView': bv, 'componentType': comp, 'count': len(values), 'type': kind}
        if minmax:
            acc['min'] = [min(v[i] for v in values) for i in range(width)]
            acc['max'] = [max(v[i] for v in values) for i in range(width)]
        self.j['accessors'].append(acc)
        return len(self.j['accessors']) - 1

    def write(self, path):
        self.j['buffers'][0]['byteLength'] = len(self.bin)
        js = json.dumps(self.j, separators=(',', ':')).encode()
        js += b' ' * ((4 - len(js) % 4) % 4)
        while len(self.bin) % 4:
            self.bin.append(0)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total))
            f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin))


def convert(scene, out):
    g = GLB()
    j = g.j
    used_ext = set()
    # materials and textures
    mat_index = {}
    tex_index = {}
    for name, m in scene['materials'].items():
        pbr = {'baseColorFactor': [max(0.0, min(1.0, c)) for c in m['base'][:3]] + [m['alpha']],
               'metallicFactor': m['metallic'], 'roughnessFactor': m['roughness']}
        if m['image'] and m['image'] in scene['images']:
            if m['image'] not in tex_index:
                data, mime = scene['images'][m['image']]
                j.setdefault('images', []).append({'name': m['image'], 'mimeType': mime, 'bufferView': g.view(data)})
                j.setdefault('samplers', [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}])
                j.setdefault('textures', []).append({'sampler': 0, 'source': len(j['images']) - 1})
                tex_index[m['image']] = len(j['textures']) - 1
            pbr['baseColorTexture'] = {'index': tex_index[m['image']]}
        mat = {'name': m['name'], 'pbrMetallicRoughness': pbr}
        strength = m['emission_strength']
        if strength > 0 and any(c > 0 for c in m['emission']):
            e = [max(0.0, c) for c in m['emission']]
            peak = max(e)
            if peak > 1:
                e = [c / peak for c in e]
                strength *= peak
            mat['emissiveFactor'] = e
            if strength != 1:
                mat['extensions'] = {'KHR_materials_emissive_strength': {'emissiveStrength': strength}}
                used_ext.add('KHR_materials_emissive_strength')
        if m['alpha'] < 1:
            mat['alphaMode'] = 'BLEND'
        j['materials'].append(mat)
        mat_index['MA' + m['name']] = len(j['materials']) - 1
    # meshes
    mesh_index = {}
    for mname, m in scene['meshes'].items():
        prims = []
        for slot, P in sorted(build_primitives(m).items()):
            if not P['idx']:
                continue
            a_pos = g.accessor(P['pos'], 'VEC3', minmax=True)
            a_nrm = g.accessor(P['nrm'], 'VEC3')
            a_uv = g.accessor(P['uv'], 'VEC2')
            comp = 5123 if len(P['pos']) < 65536 else 5125
            a_idx = g.accessor(P['idx'], 'SCALAR', comp=comp, target=34963)
            prim = {'attributes': {'POSITION': a_pos, 'NORMAL': a_nrm, 'TEXCOORD_0': a_uv}, 'indices': a_idx, 'mode': 4}
            mats = m['mats']
            if slot < len(mats) and mats[slot] in mat_index:
                prim['material'] = mat_index[mats[slot]]
            prims.append(prim)
        if prims:
            j['meshes'].append({'name': mname[2:], 'primitives': prims})
            mesh_index[mname] = len(j['meshes']) - 1
    # lights
    lights = []
    light_index = {}
    for lname, L in scene['lights'].items():
        if L['type'] not in (0, 2):  # point and spot only (glTF has no area lamps)
            continue
        entry = {'name': lname[2:], 'type': 'point' if L['type'] == 0 else 'spot', 'color': L['color'], 'intensity': L['energy'] * LIGHT_W_TO_CD}
        if L['type'] == 2:
            outer = L['spotsize'] / 2
            entry['spot'] = {'outerConeAngle': outer, 'innerConeAngle': outer * (1 - L['spotblend'])}
        lights.append(entry)
        light_index[lname] = len(lights) - 1
    if lights:
        j['extensions'] = {'KHR_lights_punctual': {'lights': lights}}
        used_ext.add('KHR_lights_punctual')
    # nodes: every object at the root with its world transform (parents are baked in)
    correction = [-math.sqrt(0.5), 0.0, 0.0, math.sqrt(0.5)]  # lamps point down local -Z in both
    for ob in scene['objects']:
        if ob['hidden'] or ob['type'] not in ('MESH', 'EMPTY', 'LAMP'):
            continue
        t, q, s = decompose(ob['world'])
        node = {'name': ob['name'], 'translation': yup(t), 'rotation': quat_yup(q), 'scale': [s[0], s[2], s[1]]}
        if ob['type'] == 'MESH':
            if ob['data'] not in mesh_index:
                continue
            node['mesh'] = mesh_index[ob['data']]
        elif ob['type'] == 'LAMP':
            if ob['data'] not in light_index:
                continue
            node['rotation'] = quat_mul(node['rotation'], correction)
            node['extensions'] = {'KHR_lights_punctual': {'light': light_index[ob['data']]}}
        j['nodes'].append(node)
        j['scenes'][0]['nodes'].append(len(j['nodes']) - 1)
    if used_ext:
        j['extensionsUsed'] = sorted(used_ext)
    for k in ('images', 'samplers', 'textures'):
        if k in j and not j[k]:
            del j[k]
    g.write(out)
    return g


def report(scene):
    rows = []
    for ob in scene['objects']:
        if ob['type'] != 'MESH' or ob['hidden'] or ob['data'] not in scene['meshes']:
            continue
        m = scene['meshes'][ob['data']]
        if not m['pos']:
            continue
        w = ob['world']
        pts = [[w[r][0] * p[0] + w[r][1] * p[1] + w[r][2] * p[2] + w[r][3] for r in range(3)] for p in m['pos']]
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
        rows.append((ob['name'], [round(x, 2) for x in lo], [round(x, 2) for x in hi], m['nf']))
    return rows


# ---------- the game's layout (same rules as prepare_room.py) ----------

STANDING = 0.6  # props at least this tall block movement (barrels and crates included)
MAX_PROP = 9.0  # footprints wider than this (joined decoration, whole walls) are not props


def _pt(x, y, z=0.0):
    return [round(x, 3), round(z, 3), round(-y, 3)]


def _box(lo, hi):
    return {'kind': 'box', 'minX': round(lo[0], 3), 'maxX': round(hi[0], 3), 'minZ': round(-hi[1], 3), 'maxZ': round(-lo[1], 3)}


def in_walk(x, y, walk, margin=0.0):
    for b in walk.get('boxes', []):
        if b[0] - margin <= x <= b[1] + margin and b[2] - margin <= y <= b[3] + margin:
            return True
    for c in walk.get('circles', []):
        if math.hypot(x - c[0], y - c[1]) <= c[2] + margin:
            return True
    return False


def layout(scene, cfg):
    walk = cfg['walk']
    bounds = [_box((b[0], b[2]), (b[1], b[3])) for b in walk.get('boxes', [])]
    bounds += [{'kind': 'circle', 'x': c[0], 'z': -c[1], 'r': c[2]} for c in walk.get('circles', [])]
    steps = [{**_box((s[0], s[2]), (s[1], s[3])), 'top': s[4]} for s in cfg.get('steps', [])]
    colliders, made = [], []
    for name, lo, hi, _ in report(scene):
        w, d, h = hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]
        cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
        if lo[2] < 1.2 and h >= STANDING and hi[2] > STANDING and math.hypot(w, d) <= MAX_PROP and in_walk(cx, cy, walk, margin=1.0):
            colliders.append(_box((lo[0], lo[1]), (hi[0], hi[1])))
            made.append(name)
    own = {'party': {}, 'enemies': {}, 'npcs': {}, 'boss': None}
    for ob in scene['objects']:
        n = ob['name'].lower()
        p = [ob['world'][0][3], ob['world'][1][3], ob['world'][2][3]]
        if math.hypot(*p) < 1e-4:
            continue
        m = re.match(r'^spawn_(party|player|enemy|npc)_?(\d+)', n)
        if m:
            own['enemies' if m.group(1) == 'enemy' else 'npcs' if m.group(1) == 'npc' else 'party'][int(m.group(2))] = _pt(*p)
        elif n.startswith('spawn_boss'):
            own['boss'] = _pt(*p)
    sp = cfg['spawns']

    prefer = set(cfg.get('prefer_settings', []))  # kinds where rooms.json's spawns win over the empties

    def merged(kind):
        mine = [own[kind][i] for i in sorted(own[kind])]
        extra = [_pt(x, y) for x, y in sp.get(kind, [])]
        if kind in prefer and extra:
            return extra
        return mine + extra[len(mine):]

    spawns = {'party': merged('party'), 'enemies': merged('enemies'),
              'boss': own['boss'] or (_pt(*sp['boss']) if sp.get('boss') else None), 'npcs': merged('npcs')}
    print('blockers:', made)
    out = {'bounds': bounds, 'colliders': colliders, 'steps': steps, 'spawns': spawns}
    if cfg.get('view'):  # the camera's area (up to the inner walls), when wider than the floor
        out['view'] = [_box((b[0], b[2]), (b[1], b[3])) for b in cfg['view'].get('boxes', [])]
    if cfg.get('ceiling'):
        out['ceiling'] = cfg['ceiling']
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    src, out = args[0], args[1]
    scene = read_scene(src)
    for w in scene['warnings']:
        print('warning:', w)
    convert(scene, out)
    print('wrote', out, os.path.getsize(out) // 1024, 'KB:', len(scene['meshes']), 'meshes,', len(scene['materials']), 'materials,',
          len(scene['images']), 'packed images,', len(scene['lights']), 'lamps')
    if '--report' in sys.argv:
        json.dump(report(scene), open(out + '.report.json', 'w'), indent=0)
    key = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--layout=')), None)
    if key:  # the room's settings in rooms.json: walk area, steps, extra spawns
        with open(os.path.join(HERE, 'rooms.json'), encoding='utf-8') as f:
            cfg = json.load(f)[key]
        path = out[:-4] + '.layout.json'
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(layout(scene, cfg), f, indent=1)
        print('wrote', path)


if __name__ == '__main__':
    main()

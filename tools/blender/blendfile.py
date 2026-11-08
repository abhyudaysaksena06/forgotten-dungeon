"""Read .blend files without Blender, through the SDNA every file carries (so structs decode by name).

Handles the classic 12-byte header and Blender 5's "BLENDER17-01" large-block header, and files
saved with compression (zstd, seekable format: decompressed with Node's built-in zstd, as this
project already needs Node and Python 3.13 has no zstd module).

Blender 5 writes pointer values that are only unique within one ID's data (an ID block followed by
its DATA blocks), so pointers resolve inside the current ID's scope first (see Blend.use), then
among ID blocks.
"""
import re
import struct
import subprocess

ZSTD_MAGIC = b'\x28\xb5\x2f\xfd'

_NODE_ZSTD = r"""
const z = require('zlib'), fs = require('fs');
const raw = fs.readFileSync(process.argv[1]);
let out;
if (raw.readUInt32LE(raw.length - 4) === 0x8f92eab1) {           // seekable zstd: one frame per entry
  const n = raw.readUInt32LE(raw.length - 9), desc = raw[raw.length - 5], entry = desc & 0x80 ? 12 : 8;
  const table = raw.length - 9 - n * entry, parts = [];
  let off = 0;
  for (let i = 0; i < n; i++) { const c = raw.readUInt32LE(table + i * entry); parts.push(z.zstdDecompressSync(raw.subarray(off, off + c))); off += c; }
  out = Buffer.concat(parts);
} else out = z.zstdDecompressSync(raw);
process.stdout.write(out);
"""


def load(path):
    """The file's bytes, decompressed if Blender saved it compressed."""
    with open(path, 'rb') as f:
        data = f.read()
    if data[:4] == ZSTD_MAGIC:
        data = subprocess.run(['node', '-e', _NODE_ZSTD, path], check=True, capture_output=True).stdout
    return data


class Struct:
    def __init__(self, name, size, fields):
        self.name = name
        self.size = size
        self.fields = fields  # (name, type, offset, count, is_pointer, dims)
        self.by_name = {f[0]: f for f in fields}


class Blend:
    PRIM = {'char': 'b', 'uchar': 'B', 'short': 'h', 'ushort': 'H', 'int': 'i', 'uint': 'I', 'float': 'f', 'double': 'd',
            'int64_t': 'q', 'uint64_t': 'Q', 'int8_t': 'b', 'uint8_t': 'B', 'int16_t': 'h', 'uint16_t': 'H', 'int32_t': 'i',
            'uint32_t': 'I', 'bool': 'B', 'long': 'q', 'ulong': 'Q'}

    def __init__(self, data):
        d = data
        self.d = d
        if d[:7] != b'BLENDER':
            raise ValueError('not a .blend file')
        if d[7:9].isdigit():  # BLENDER17-01v0503
            off = int(d[7:9])
            self.large = d[10:12] == b'01'
            self.ptr = 8
        else:
            off = 12
            self.large = False
            self.ptr = 8 if d[7:8] == b'-' else 4
            if self.ptr == 4:
                raise ValueError('32-bit .blend files are not supported')
        self.blocks = []
        while off < len(d):
            code = d[off:off + 4]
            if self.large:
                sdna, old, length, nr = struct.unpack_from('<iQqq', d, off + 4)
                off += 32
            else:
                length, old, sdna, nr = struct.unpack_from('<iQii', d, off + 4)
                off += 24
            self.blocks.append({'code': code, 'sdna': sdna, 'old': old, 'len': length, 'nr': nr, 'off': off})
            off += length
            if code == b'ENDB':
                break
        self.by_old = {}
        self._scope_of = {}
        scope = None
        for blk in self.blocks:
            if blk['code'] == b'DATA':
                if scope is not None:
                    scope['data'].setdefault(blk['old'], blk)
                    self._scope_of[id(blk)] = scope
                continue
            scope = {'id': blk, 'data': {}}
            self._scope_of[id(blk)] = scope
            if blk['old']:
                self.by_old.setdefault(blk['old'], blk)
        self.scope = None
        self._parse_sdna(next(b['off'] for b in self.blocks if b['code'] == b'DNA1'))

    def _parse_sdna(self, off):
        d = self.d
        start = off

        def align(o):  # SDNA pads to 4 bytes relative to its block
            return start + ((o - start + 3) & ~3)

        def strings(off, tag):
            assert d[off:off + 4] == tag, tag
            n = struct.unpack_from('<i', d, off + 4)[0]
            off += 8
            out = []
            for _ in range(n):
                e = d.index(b'\0', off)
                out.append(d[off:e].decode('latin1'))
                off = e + 1
            return out, align(off)

        names, off = strings(off + 4, b'NAME')
        types, off = strings(off, b'TYPE')
        assert d[off:off + 4] == b'TLEN'
        tlen = list(struct.unpack_from('<%dh' % len(types), d, off + 4))
        off = align(off + 4 + 2 * len(types))
        assert d[off:off + 4] == b'STRC'
        n = struct.unpack_from('<i', d, off + 4)[0]
        off += 8
        self.structs = []
        self.struct_by_name = {}
        for _ in range(n):
            t, nf = struct.unpack_from('<hh', d, off)
            off += 4
            fields, pos = [], 0
            for _ in range(nf):
                ft, fn = struct.unpack_from('<hh', d, off)
                off += 4
                raw = names[fn]
                is_ptr = raw.startswith('*') or raw.startswith('(*')
                dims = [int(x) for x in re.findall(r'\[(\d+)\]', raw)]
                count = 1
                for x in dims:
                    count *= x
                clean = raw.replace('*', '').replace('(', '').replace(')', '').split('[')[0]
                fields.append((clean, types[ft], pos, count, is_ptr, dims))
                pos += (self.ptr if is_ptr else tlen[ft]) * count
            s = Struct(types[t], tlen[t], fields)
            self.structs.append(s)
            self.struct_by_name[types[t]] = s

    # ---- access ----
    def has(self, sname, field):
        s = self.struct_by_name.get(sname)
        return bool(s) and field in s.by_name

    def field_offset(self, sname, field):
        return self.struct_by_name[sname].by_name[field][2]

    def struct_size(self, sname):
        return self.struct_by_name[sname].size

    def get(self, sname, off, field):
        fname, ftype, pos, count, is_ptr, dims = self.struct_by_name[sname].by_name[field]
        o = off + pos
        if is_ptr:
            vals = struct.unpack_from('<%dQ' % count, self.d, o)
            return vals[0] if count == 1 else list(vals)
        if ftype == 'char' and dims:
            return self.d[o:o + count].split(b'\0')[0].decode('utf8', 'replace')
        if ftype in self.PRIM:
            vals = struct.unpack_from('<%d%s' % (count, self.PRIM[ftype]), self.d, o)
            return vals[0] if count == 1 else list(vals)
        return o  # a nested struct: its absolute offset

    def use(self, blk):
        """Resolve DATA pointers within this block's ID from now on."""
        self.scope = self._scope_of.get(id(blk))
        return blk

    def block_of(self, ptr):
        if not ptr:
            return None
        if self.scope is not None:
            hit = self.scope['data'].get(ptr)
            if hit is not None:
                return hit
        return self.by_old.get(ptr)

    def id_block(self, ptr):
        return self.by_old.get(ptr) if ptr else None

    def id_name_of(self, blk):
        s = self.structs[blk['sdna']]
        return self.get('ID', blk['off'] + s.by_name['id'][2], 'name')

    def id_name(self, ptr):
        blk = self.id_block(ptr)
        return self.id_name_of(blk) if blk else None

    def ids(self, code):
        c = code.encode('latin1').ljust(4, b'\0')
        return [b for b in self.blocks if b['code'] == c]

    def cstr(self, ptr):
        blk = self.block_of(ptr)
        return self.d[blk['off']:blk['off'] + blk['len']].split(b'\0')[0].decode('utf8', 'replace') if blk else None

    def listbase(self, off_of_listbase, item):
        out, seen = [], set()
        p = struct.unpack_from('<Q', self.d, off_of_listbase)[0]
        while p and p not in seen:
            seen.add(p)
            b = self.block_of(p)
            if not b:
                break
            out.append(b)
            p = self.get(item, b['off'], 'next') if self.has(item, 'next') else 0
        return out

    def raw_array(self, ptr, fmt):
        b = self.block_of(ptr)
        if not b:
            return None
        n = b['len'] // struct.calcsize('<' + fmt)
        return struct.unpack_from('<%d%s' % (n, fmt), self.d, b['off'])

"""Give a rigged character the animation clips the game plays, if it doesn't have them yet.

    blender -b kael.blend --python tools/blender/make_clips.py -- [--save] [--replace]

Clips: idle, run, jump, attack, skill, hit, defend, death, victory (and, for Morvath, boss_strike,
boss_sweep, transform, armour_break). Clips the file already has are kept unless --replace.

The poses are simple and procedural, enough to read well in the game until hand-made clips arrive.
Bones are found by name (Mixamo "mixamorig:LeftUpLeg", Rigify "thigh_fk.L", plain "thigh.L" or
"upper_leg_l" all work), and every rotation is worked out from the bone's rest pose, so T-pose and
A-pose rigs both work. The character should face -Y (Blender's front view), feet on the ground.
"""
import math
import re
import sys

import bpy
from mathutils import Quaternion, Vector

FPS = 30
CHAR_CLIPS = ["idle", "run", "jump", "attack", "skill", "hit", "defend", "death", "victory"]
BOSS_CLIPS = ["boss_strike", "boss_sweep", "transform", "armour_break"]
SKIP = ("twist", "mch", "tweak", "ik", "pole", "parent", "socket", "end", "nub", "top", "target")
FORWARD = Vector((0, -1, 0))  # the character faces -Y
X = Vector((1, 0, 0))
Z = Vector((0, 0, 1))


def clip_key(name):
    return name.split("|")[-1].strip().lower().replace(" ", "_").replace("-", "_")


def core_name(name):
    """'mixamorig:LeftUpLeg' -> ('upleg', 'l'); 'thigh_fk.L' -> ('thigh_fk', 'l')."""
    n = name.lower()
    n = re.sub(r"^(mixamorig\d*[:_]|def[-_]|org[-_]|orig[-_]|bip\d*[ _]|cc_base_)", "", n)
    side = None
    for pattern, s in ((r"^left[_ ]?|[._\- ]l$|[._\- ]left$|left$", "l"), (r"^right[_ ]?|[._\- ]r$|[._\- ]right$|right$", "r")):
        if re.search(pattern, n):
            side = s
            n = re.sub(pattern, "", n)
            break
    if side is None:  # "_l_" in the middle, e.g. "upper_arm_l_fk"
        m = re.search(r"[._](l|r)[._]", n)
        if m:
            side = m.group(1)
            n = n[: m.start()] + "_" + n[m.end():]
    return n.strip("._- "), side


def find_bones(arm):
    named = [(pb, *core_name(pb.name)) for pb in arm.pose.bones]
    fk_rig = any(c.endswith("_fk") for _, c, _ in named)

    def pick(test, side=None):
        found = [pb for pb, c, s in named if s == side and test(c) and not any(k in c for k in SKIP)]
        if fk_rig:
            found.sort(key=lambda pb: 0 if core_name(pb.name)[0].endswith("_fk") else 1)
        return found[0] if found else None

    bones = {
        "hips": pick(lambda c: c in ("hips", "pelvis", "torso", "root_hips") or c.startswith("hips")),
        "head": pick(lambda c: c == "head" or c.startswith("head")),
    }
    spines = [pb for pb, c, s in named if s is None and ("spine" in c or "chest" in c) and not any(k in c for k in SKIP)]
    bones["spine"] = spines[0] if spines else None
    bones["chest"] = spines[-1] if spines else None
    base = lambda c: c[:-3] if c.endswith("_fk") else c  # noqa: E731
    for s in ("l", "r"):
        bones["thigh_" + s] = pick(lambda c: base(c) in ("thigh", "upleg", "upperleg", "upper_leg", "leg_upper", "thighs"), s)
        bones["shin_" + s] = pick(lambda c: base(c) in ("leg", "shin", "calf", "lowerleg", "lower_leg", "leg_lower", "knee"), s)
        bones["arm_" + s] = pick(lambda c: base(c) in ("arm", "upperarm", "upper_arm", "arm_upper", "uparm"), s)
        bones["forearm_" + s] = pick(lambda c: base(c) in ("forearm", "lowerarm", "lower_arm", "arm_lower", "elbow"), s)
    return bones


def rest_dir(pb):
    b = pb.bone
    return (b.tail_local - b.head_local).normalized()


class Poser:
    """Turns 'swing this limb forward by 30 degrees' into keyframes on a rig of any orientation."""

    def __init__(self, arm, bones):
        self.arm = arm
        self.b = bones
        self.down = {}  # T-pose arms are lowered first, so swings start from arms at the sides
        for s in ("l", "r"):
            pb = bones["arm_" + s]
            if pb:
                d = rest_dir(pb)
                angle = d.angle(Vector((0, 0, -1)))
                if angle > 0.6:
                    self.down[pb.name] = Quaternion(d.cross(Vector((0, 0, -1))).normalized(), angle - 0.25)
        hips = bones["hips"]
        self.hip_height = hips.bone.head_local.z if hips else 1.0

    def armature_rot(self, pb, q):
        """A rotation given in armature space, as this bone's own pose rotation."""
        r = pb.bone.matrix_local.to_quaternion()
        return r.inverted() @ q @ r

    def rot(self, part, **moves):
        pb = self.b.get(part)
        if not pb:
            return
        q = Quaternion()
        if pb.name in self.down:
            q = self.down[pb.name]
        d = rest_dir(pb)
        if "swing" in moves:  # end of the bone moves forward (-Y) for positive angles
            sign = -1 if d.z < 0 or pb.name in self.down else 1
            q = Quaternion(X, sign * math.radians(moves["swing"])) @ q
        if "lean" in moves:  # spine and head: positive leans forward
            q = Quaternion(X, math.radians(moves["lean"])) @ q
        if "twist" in moves:
            q = Quaternion(Z, math.radians(moves["twist"])) @ q
        pose = self.armature_rot(pb, q)
        if "bend" in moves:  # elbows bend forward, knees bend back, in the bone's own frame
            towards = FORWARD if part.startswith("forearm") else -FORWARD
            axis = d.cross(towards)
            if axis.length > 1e-4:
                pose = pose @ self.armature_rot(pb, Quaternion(axis.normalized(), math.radians(moves["bend"])))
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = pose

    def lift(self, dz):
        pb = self.b.get("hips")
        if not pb:
            return
        r = pb.bone.matrix_local.to_quaternion()
        pb.location = r.inverted() @ Vector((0, 0, dz))

    def key(self, frame):
        for pb in {p for p in self.b.values() if p}:
            pb.keyframe_insert("rotation_quaternion", frame=frame)
            if pb == self.b.get("hips"):
                pb.keyframe_insert("location", frame=frame)

    def reset(self):
        for pb in self.arm.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = Quaternion()
            pb.location = Vector()
        for s in ("l", "r"):  # arms rest at the sides
            self.rot("arm_" + s)


def both(p, part, **moves):
    p.rot(part + "_l", **moves)
    p.rot(part + "_r", **moves)


# Each clip: a list of (frame, pose function).
def clip_idle(p):
    def at(lean, arms):
        def f():
            p.rot("chest", lean=lean)
            both(p, "arm", swing=arms)
            both(p, "forearm", bend=12)
        return f
    return [(0, at(2, 3)), (30, at(0, 6)), (60, at(2, 3))]


def clip_run(p):
    def stride(phase):
        def f():
            s = math.sin(phase)
            p.rot("thigh_l", swing=38 * s)
            p.rot("thigh_r", swing=-38 * s)
            p.rot("shin_l", bend=15 + 55 * max(0, -math.cos(phase)))
            p.rot("shin_r", bend=15 + 55 * max(0, math.cos(phase)))
            p.rot("arm_l", swing=-32 * s)
            p.rot("arm_r", swing=32 * s)
            both(p, "forearm", bend=70)
            p.rot("spine", lean=10)
            p.lift(abs(math.cos(phase)) * 0.04 * p.hip_height)
        return f
    return [(i * 5, stride(i * math.pi / 2)) for i in range(5)]


def clip_jump(p):
    def tuck(k):
        def f():
            both(p, "thigh", swing=55 * k)
            both(p, "shin", bend=85 * k)
            both(p, "arm", swing=110 * k)
            both(p, "forearm", bend=30)
        return f
    return [(0, tuck(0.3)), (8, tuck(1)), (18, tuck(0.6))]


def clip_attack(p, side="r"):
    other = "l" if side == "r" else "r"

    def at(arm, twist, lean, fore):
        def f():
            p.rot("arm_" + side, swing=arm)
            p.rot("forearm_" + side, bend=fore)
            p.rot("arm_" + other, swing=-15)
            p.rot("chest", twist=twist, lean=lean)
            p.rot("thigh_l", swing=15)
            p.rot("thigh_r", swing=-10)
        return f
    return [(0, at(0, 0, 0, 20)), (5, at(150, 18, -5, 60)), (9, at(40, -22, 14, 5)), (16, at(0, 0, 0, 20))]


def clip_skill(p, twist=0):
    def at(arms, lean, tw):
        def f():
            both(p, "arm", swing=arms)
            both(p, "forearm", bend=15)
            p.rot("chest", lean=lean, twist=tw)
            p.rot("head", lean=-lean / 2)
        return f
    return [(0, at(0, 0, 0)), (8, at(100, -10, twist)), (16, at(110, 12, -twist)), (24, at(0, 0, 0))]


def clip_hit(p):
    def at(k):
        def f():
            p.rot("chest", lean=-18 * k)
            p.rot("head", lean=-15 * k)
            both(p, "arm", swing=-20 * k)
            both(p, "shin", bend=20 * k)
        return f
    return [(0, at(0)), (3, at(1)), (12, at(0))]


def clip_defend(p):
    def at(k):
        def f():
            both(p, "arm", swing=75 * k)
            both(p, "forearm", bend=80 * k)
            p.rot("chest", lean=8 * k)
            both(p, "thigh", swing=15 * k)
            both(p, "shin", bend=25 * k)
        return f
    return [(0, at(0)), (5, at(1)), (16, at(1))]


def clip_death(p):
    def at(k):
        def f():
            p.rot("hips", lean=-82 * k)
            both(p, "arm", swing=60 * k)
            p.rot("head", lean=-20 * k)
            p.lift(-0.72 * p.hip_height * k)
        return f
    return [(0, at(0)), (10, at(0.5)), (24, at(1))]


def clip_victory(p):
    def at(k, hop):
        def f():
            both(p, "arm", swing=165 * k)
            both(p, "forearm", bend=10)
            p.rot("chest", lean=-8 * k)
            p.lift(hop * p.hip_height)
        return f
    return [(0, at(0, 0)), (8, at(1, 0.08)), (20, at(1, 0)), (30, at(0.9, 0))]


BUILDERS = {
    "idle": clip_idle,
    "run": clip_run,
    "jump": clip_jump,
    "attack": clip_attack,
    "skill": clip_skill,
    "hit": clip_hit,
    "defend": clip_defend,
    "death": clip_death,
    "victory": clip_victory,
    "boss_strike": clip_attack,
    "boss_sweep": lambda p: clip_skill(p, twist=35),
    "transform": clip_skill,
    "armour_break": clip_hit,
}


def make_clips(arm=None, names=None, replace=False):
    arm = arm or next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if not arm:
        print("make_clips: no armature in this file")
        return []
    names = names or CHAR_CLIPS
    have = {clip_key(a.name): a for a in bpy.data.actions}
    bones = find_bones(arm)
    found = {k: v.name for k, v in bones.items() if v}
    print("make_clips: bones found:", found)
    missing_parts = [k for k, v in bones.items() if not v]
    if missing_parts:
        print("make_clips: no bone found for", missing_parts, "(those parts stay still)")
    # Rigify: drive the FK controls.
    for pb in arm.pose.bones:
        if "IK_FK" in pb.keys():
            pb["IK_FK"] = 1.0
    p = Poser(arm, bones)
    arm.animation_data_create()
    made = []
    for name in names:
        if name in have and not replace:
            continue
        if name in have:
            bpy.data.actions.remove(have[name])
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        arm.animation_data.action = action
        for frame, pose in BUILDERS[name](p):
            p.reset()
            pose()
            p.key(frame)
        made.append(name)
    idle = bpy.data.actions.get("idle")
    arm.animation_data.action = idle
    p.reset()
    print("make_clips: made", made or "nothing (all clips already there)")
    return made


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    names = CHAR_CLIPS + (BOSS_CLIPS if "--boss" in argv else [])
    make_clips(names=names, replace="--replace" in argv)
    if "--save" in argv:
        bpy.ops.wm.save_mainfile()

# Assemble the 30 fps sequence from rendered frames (out/frames/element-N.jpeg).
#   python scripts/assemble.py plan      -> out/odd.json: odd frames that must be rendered (motion, cuts, kicks)
#   python scripts/assemble.py build     -> out/seq/NNNN.jpg for every frame (rendered, or a blend of the even neighbours)
# Odd frames are blended only in calm moments: never next to a hard cut / camera cut / crossfade / flash or inside a
# kick window, and only when the two even neighbours differ little (mean abs luma at 270x480 <= THR).
import sys, os, json
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = os.path.join(ROOT, "out", "frames")
TOTAL, FPS, THR = 1897, 30, 10.0
CUTS = [0, 121, 290, 385, 514, 600, 651, 766, 892, 1127, 1435, 1528, 1580, 1670, 1754]
CAMCUTS = [66, 202, 253, 322, 433, 470, 681, 721, 855, 928, 962, 1003, 1068, 1198, 1238, 1368, 1477, 1630, 1730, 1788]
XFADE = {892: 8, 1435: 8, 1528: 8, 1580: 8}
KICKS = [11.05, 11.5, 11.95, 12.35, 17.87, 19.32, 26.09, 27.0, 28.14, 31.05, 36.84]
p = lambda f: os.path.join(FR, f"element-{f}.jpeg")


def small(f):
    return np.asarray(Image.open(p(f)).convert("L").resize((270, 480)), np.float32)


def must_render(f):
    for c in CUTS + CAMCUTS:
        if abs(f - c) <= 1:
            return True
    for c, w in XFADE.items():
        if c - w // 2 - 1 <= f <= c + w // 2 + 1:
            return True
    for k in KICKS:
        if 0 <= f - k * FPS <= 8:
            return True
    return f + 1 >= TOTAL


def plan():
    odd = []
    for f in range(1, TOTAL, 2):
        if must_render(f) or not (os.path.exists(p(f - 1)) and os.path.exists(p(f + 1))):
            odd.append(f); continue
        if np.abs(small(f - 1) - small(f + 1)).mean() > THR:
            odd.append(f)
    json.dump(odd, open(os.path.join(ROOT, "out", "odd.json"), "w"))
    print(f"{len(odd)} odd frames to render of {len(range(1, TOTAL, 2))}")


def build():
    out = os.path.join(ROOT, "out", "seq"); os.makedirs(out, exist_ok=True)
    blended = missing = 0
    for f in range(TOTAL):
        dst = os.path.join(out, f"{f:04d}.jpg")
        if os.path.exists(p(f)):
            Image.open(p(f)).convert("RGB").save(dst, quality=95); continue
        a, b = p(f - 1), p(f + 1)
        if os.path.exists(a) and os.path.exists(b):
            im = Image.blend(Image.open(a).convert("RGB"), Image.open(b).convert("RGB"), 0.5); blended += 1
        else:
            src = a if os.path.exists(a) else b; im = Image.open(src).convert("RGB"); missing += 1
        im.save(dst, quality=95)
    print(f"built {TOTAL} frames: {blended} blended, {missing} held (missing neighbour)")


if __name__ == "__main__":
    {"plan": plan, "build": build}[sys.argv[1]]()

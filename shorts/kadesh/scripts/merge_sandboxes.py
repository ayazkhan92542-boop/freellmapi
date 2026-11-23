# Merge look sandboxes back into the main project folder, by owned file.
# Backs up main first (backup/<name>_<time>/), copies each sandbox's owned files, reports skipped/unchanged ones.
# Usage: python scripts/merge_sandboxes.py <name> [cam,world,mat,char,post]
#   <name>   = project folder name under src/videos/ (e.g. bridge); sandboxes are src/videos/<name>_<box>/
#   ROOT     = env REMOTION_ROOT (default: current directory)
import filecmp, os, shutil, sys, time

name = sys.argv[1]
ROOT = os.path.expanduser(os.environ.get("REMOTION_ROOT", os.getcwd()))
MAIN = os.path.join(ROOT, "src/videos", name)
OWN = {
    "cam": ["story.ts"],
    "world": ["world.ts", "lights.ts", "shade.ts", "grade.ts"],
    "mat": ["paint.ts", "build.ts"],
    "char": ["toon.ts", "cast.ts", "cardshade.ts"],
    "post": ["ink.ts", f"{name.capitalize()}.tsx", "Bridge.tsx", "lensblur.ts"],
}
which = sys.argv[2].split(",") if len(sys.argv) > 2 else list(OWN)
bak = os.path.join(ROOT, "backup", time.strftime(f"{name}_%Y%m%d_%H%M%S"))
shutil.copytree(MAIN, bak)
print("backup ->", bak)
for box in which:
    src = os.path.join(ROOT, f"src/videos/{name}_{box}")
    for f in OWN[box]:
        a, b = os.path.join(src, f), os.path.join(MAIN, f)
        if not os.path.exists(a):
            continue
        if os.path.exists(b) and filecmp.cmp(a, b, shallow=False):
            print(f"  {box}: {f} unchanged")
            continue
        shutil.copy2(a, b)
        print(f"  {box}: {f} -> main")

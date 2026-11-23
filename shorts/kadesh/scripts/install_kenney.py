# Copy the Kenney (CC0) models that build.ts / world.ts load into public/bridge/kenney/.
# Usage: python scripts/install_kenney.py <dest public/bridge/kenney> <zip-or-folder> [<zip-or-folder> ...]
# Download the kits yourself from kenney.nl (CC0): "Nature Kit" and "Fantasy Town Kit" (GLB format), pass the
# unzipped folders or the zips. Files are matched by exact name (case-insensitive). Missing ones are fine:
# world.ts skips absent models and build.ts draws trees/bushes/flowers/grass procedurally (VEG), so only the
# props (cart, stalls, banners, windmill, canoe, lantern, lily pads) disappear.
import os, shutil, sys, zipfile, tempfile

WANT = ["tree_oak", "tree_default", "tree_detailed", "tree_fat", "tree_cone", "tree-high-round", "tree", "plant_bushLarge",
        "plant_bushDetailed", "plant_bush", "hedge", "flower_redA", "flower_yellowA", "flower_purpleA", "grass_large", "grass",
        "lily_large", "lantern", "cart", "stall-red", "stall-green", "stall-bench", "banner-red", "banner-green", "windmill", "canoe"]

def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    dest, srcs = sys.argv[1], sys.argv[2:]
    os.makedirs(dest, exist_ok=True)
    roots, tmp = [], tempfile.mkdtemp()
    for s in srcs:
        if s.lower().endswith(".zip"):
            d = os.path.join(tmp, os.path.basename(s)); zipfile.ZipFile(s).extractall(d); roots.append(d)
        else:
            roots.append(s)
    index = {}
    for r in roots:
        for dp, _, fs in os.walk(r):
            for f in fs:
                if f.lower().endswith(".glb"):
                    index.setdefault(os.path.splitext(f)[0].lower(), os.path.join(dp, f))
    got, miss = [], []
    for n in WANT:
        p = index.get(n.lower())
        if p:
            shutil.copy(p, os.path.join(dest, n + ".glb")); got.append(n)
        else:
            miss.append(n)
    print(f"copied {len(got)}/{len(WANT)} to {dest}")
    if miss:
        print("missing (skipped at render time):", ", ".join(miss))
    shutil.rmtree(tmp, ignore_errors=True)

main()

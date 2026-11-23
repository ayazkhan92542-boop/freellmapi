// Render look-check stills (JPEG) of a Remotion composition at chosen frames.
// Usage: node scripts/bridge-stills.mjs <outPrefix> <frame,frame,...> [scale=0.5]
//   env BRIDGE_ENTRY  Remotion entry (default src/index.ts); a sandbox copy: src/sandboxes/<n>/index.tsx
//   env BRIDGE_COMP   composition id (default BridgeShort)
//   env REMOTION_TMP  big-drive temp folder for the webpack bundle (default ./.remotion-tmp); every bundle copies public/
// Needs: npm i @remotion/bundler @remotion/renderer (same version as remotion).
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const [prefix, frameList, scaleArg] = process.argv.slice(2);
if (!prefix || !frameList) { console.error("usage: node scripts/bridge-stills.mjs <outPrefix> <frames> [scale]"); process.exit(1); }
const tmp = path.resolve(process.env.REMOTION_TMP || ".remotion-tmp");
fs.mkdirSync(tmp, { recursive: true });
process.env.TEMP = tmp; process.env.TMP = tmp; process.env.TMPDIR = tmp;
const entry = path.resolve(process.env.BRIDGE_ENTRY || "src/index.ts");
const id = process.env.BRIDGE_COMP || "ArcoleShort";
const browserExecutable = process.env.BROWSER || undefined;
const gl = process.env.GL || "swangle";
const scale = Number(scaleArg || 0.5);

const serveUrl = await bundle({ entryPoint: entry });
const comp = await selectComposition({ serveUrl, id, browserExecutable });
fs.mkdirSync(path.dirname(path.resolve(prefix)), { recursive: true });
for (const f of frameList.split(",").map(Number)) {
  const output = `${prefix}${String(f).padStart(4, "0")}.jpg`;
  await renderStill({ composition: comp, serveUrl, frame: f, output, imageFormat: "jpeg", jpegQuality: 90, scale,
    browserExecutable, chromiumOptions: { gl }, timeoutInMilliseconds: 600000 });
  console.log("wrote", output);
}

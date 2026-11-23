// Resumable frame renderer for slow software GL. Renders the frames this worker owns (frame % STEP === PARITY, or an
// explicit list in FRAMES_FILE) in chunks, writes out/<dir>/element-N.jpeg (unpadded), skips files > 2 KB, retries.
// Usage: PARITY=0 STEP=2 SCALE=0.6667 OUT=out/frames node scripts/render-frames.mjs
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderFrames, selectComposition } from "@remotion/renderer";

const tmp = path.resolve(process.env.REMOTION_TMP || ".remotion-tmp");
fs.mkdirSync(tmp, { recursive: true });
process.env.TEMP = tmp; process.env.TMP = tmp; process.env.TMPDIR = tmp;
const OUT = path.resolve(process.env.OUT || "out/frames");
const STEP = Number(process.env.STEP || 2), PARITY = Number(process.env.PARITY || 0), WORKERS = Number(process.env.WORKERS || 1);
const SCALE = Number(process.env.SCALE || 0.6667);
const browserExecutable = process.env.BROWSER || undefined;
const id = process.env.BRIDGE_COMP || "ArcoleShort";
fs.mkdirSync(OUT, { recursive: true });
const done = (f) => { try { return fs.statSync(path.join(OUT, `element-${f}.jpeg`)).size > 2048; } catch { return false; } };

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const comp = await selectComposition({ serveUrl, id, browserExecutable });
let all = [];
if (process.env.FRAMES_FILE) all = JSON.parse(fs.readFileSync(process.env.FRAMES_FILE, "utf8"));
else for (let f = 0; f < comp.durationInFrames; f += STEP) all.push(f);
const per = Math.ceil(all.length / WORKERS);
const want = all.slice(PARITY * per, (PARITY + 1) * per);
const todo = want.filter((f) => !done(f));
console.log(`worker ${PARITY}: ${todo.length} of ${want.length} frames to render`);
// runs of frames with a constant spacing, rendered in one page (the world is built once per run)
const runs = [];
for (const f of todo) {
  const r = runs[runs.length - 1];
  // everyNthFrame steps from frame 0, so a spaced run must start on a multiple of its spacing
  if (r && r.length < 40 && (r.length === 1 ? f - r[0] === 1 || (f - r[0] === 2 && r[0] % 2 === 0) : f - r[r.length - 1] === r[1] - r[0])) r.push(f); else runs.push([f]);
}
for (const run of runs) {
  const step = run.length > 1 ? run[1] - run[0] : 1;
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    const dir = path.join(tmp, `w${PARITY}_${run[0]}`);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    try {
      const t0 = Date.now();
      await renderFrames({ composition: comp, serveUrl, outputDir: dir, imageFormat: "jpeg", jpegQuality: 92, frameRange: [run[0], run[run.length - 1]],
        everyNthFrame: step, concurrency: 1, scale: SCALE, browserExecutable, chromiumOptions: { gl: process.env.GL || "swangle" },
        timeoutInMilliseconds: 900000, onStart: () => {} });
      const got = fs.readdirSync(dir).filter((n) => n.endsWith(".jpeg")).sort((a, b) => Number(a.match(/(\d+)\.jpeg$/)[1]) - Number(b.match(/(\d+)\.jpeg$/)[1]));
      if (got.length !== run.length) throw new Error(`got ${got.length} files for ${run.length} frames`);
      got.forEach((n, k) => fs.renameSync(path.join(dir, n), path.join(OUT, `element-${run[k]}.jpeg`)));
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`frames ${run[0]}..${run[run.length - 1]} (${run.length}) ${((Date.now() - t0) / 1000 / run.length).toFixed(1)} s/frame`);
      ok = true;
    } catch (e) { console.log(`run ${run[0]} attempt ${attempt} failed: ${String(e).slice(0, 300)}`); }
  }
  if (!ok) console.log(`GIVING UP run ${run[0]}..${run[run.length - 1]}`);
}
console.log(`worker ${PARITY} finished`);

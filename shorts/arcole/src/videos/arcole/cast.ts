// Our cast as lit flat sprites in the 3D world (template infrastructure: canvas pool, lit cards, contact blobs,
// blinks) + the Arcole staging per shot: Napoleon, the French column, the Austrian line, the riders and trumpeters,
// the painter, the night walker. Cards, effects and blobs live on the NOINK layer.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxNote, fxBurst, fxSplash, fxStars, fxRing, fxShadow, fxContact, fxPuff,
  Outfit, Expr, FrontOpts, SideOpts, french, NAPOLEON, MUDDY, AIDE, OFFICER_FR, austrian, guide, PAINTER, WALKER, horseRider,
  fxMuzzle, fxSmoke, fxBlast, fxTap, fxBulb, fxCrowdShadow, HORSE_GROUND, fxBicorne,
} from "./toon";
import {
  FPS, DK, FILES, SHOTS, V3, smooth, clamp01, lin, napZ, colFront, FALL0, FALL1, NAP_FALL, SINK, napRise, rideX, RIDERS, RIDE_Z, BLOW_Z,
  AUS_Z, STREET_X, walkZ, EASEL, groundY,
} from "./story";
import { LIGHTS } from "./lights";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing" | "horse"; sq?: [number, number]; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const vOf = (i: number) => (i * 7 + (i >> 2)) % 4;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" | "night" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden" | "night", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33], night: [0.3, 0.3, 0.45] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

// ================= Arcole staging =================
export type Stage = { places: Place[]; fx: FxPlace[] };
const FR = [0, 1, 2, 3].map((v) => french(v));
const AU = [0, 1, 2, 3].map((v) => austrian(v));
const GU = [0, 1, 2, 3].map((v) => guide(v));
const NAP = (muddy = false): Who => ({ i: 900, o: muddy ? MUDDY : NAPOLEON, okey: muddy ? "napm" : "nap" });
const NAPHAT: Outfit = { ...NAPOLEON, hat: null, hair: "#3a2a1e" };
const MUDNH: Outfit = { ...MUDDY, hat: null, hair: "#3a2a1e" };
const frW = (i: number): Who => ({ i, o: FR[i % 4], okey: `fr${i % 4}` });
const auW = (i: number): Who => ({ i: i + 300, o: AU[i % 4], okey: `au${i % 4}` });
const FRONT = { side: false, mirror: false };
const L2 = LEAD;
const stand = (cam: CamInfo, out: Stage, who: Who, x: number, z: number, fo: FrontOpts, y = groundY(x, z), shadow = true) => {
  out.places.push(person(cam, who, x, y, z, FRONT, { mode: "stand", ...fo }, {}));
  if (shadow) blob(out, x, y, z);
};
/** someone moving along (dx, dz): side view when the lens sees them from the side, else front; runs at `rate` cycles/s */
const mover = (cam: CamInfo, out: Stage, who: Who, x: number, z: number, dx: number, dz: number, t: number, o: { rate?: number; expr?: Expr; run?: boolean; fo?: FrontOpts; so?: SideOpts; y?: number }) => {
  const y = o.y ?? groundY(x, z), ph = q(((t * (o.rate ?? 1.6) + hh(who.i, 5)) % 1), 60), expr = o.expr ?? "stern";
  const view = viewOf(cam, x, z, dx, dz), blink = lidAt(t, who.i);
  const tl = Math.hypot(cam.pos.x - x, cam.pos.z - z) || 1, away = ((cam.pos.x - x) * dx + (cam.pos.z - z) * dz) / (tl * (Math.hypot(dx, dz) || 1)) < -0.57;
  const fo: FrontOpts = { mode: "march", phase: ph, expr, blink, lift: o.run ? 80 : 60, back: away, ...o.fo };
  const so: SideOpts = { mode: "march", phase: ph, expr, blink, stomp: o.run ? 1.3 : 1, stride: view.fs * (o.run ? 1.25 : 1), run: o.run, ...o.so };
  out.places.push(person(cam, who, x, y, z, view, fo, so));
  blob(out, x, y, z);
};
const burst = (out: Stage, t: number, t0: number, x: number, y: number, z: number, w = 1.0, dur = 0.2) => {
  if (t < t0 || t >= t0 + dur) return;
  const u = q((t - t0) / dur, 30);
  out.fx.push({ key: `burst${u}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, u), x, y, z, w, h: w });
};
const muzzle = (out: Stage, t: number, t0: number, x: number, y: number, z: number, i: number) => {
  const tf = t0 + hh(i, 21) * 0.12;
  if (t >= tf && t < tf + 0.2) { const u = q((t - tf) / 0.2, 30); out.fx.push({ key: `muz${u}`, cw: 400, ch: 400, draw: (p) => fxMuzzle(p, u), x, y, z, w: 1.3, h: 1.3 }); }
  if (t >= tf && t < tf + 3.2) {
    const u = q((t - tf) / 3.2, 40);
    out.fx.push({ key: `smk${u}`, cw: 400, ch: 400, draw: (p) => fxSmoke(p, u), x: x + 0.3 * u, y: y + 0.6 * u, z: z - 0.7 - 1.0 * u, w: 2.4 + 3.6 * u, h: 2.4 + 3.6 * u, soft: true });
  }
};
/** a horse + rider card: (x, z) hooves, facing (dx, dz) along the ground; trumpet raised or not */
const SUH = 0.00216;
const horse = (cam: CamInfo, out: Stage, i: number, x: number, z: number, dx: number, dz: number, t: number, o: { rate?: number; trumpet?: boolean; expr?: Expr; ghost?: string; scale?: number; y?: number }) => {
  const sc = o.scale ?? 1, y = o.y ?? groundY(x, z);
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.5, z)) / sc;
  const k = d < 5 ? 1.1 : d < 10 ? 0.7 : d < 22 ? 0.36 : 0.18;
  const mirror = dx * cam.right.x + dz * cam.right.z < 0;
  const ph = o.rate ? q(((t * o.rate + hh(i, 3)) % 1), 24) : 0, light = light2D(cam, mirror), blink = o.ghost ? 0 : lidAt(t, i + 500);
  const rider = GU[i % 4], expr = o.expr ?? "grin", coat = ["#8a5434", "#5a3b2a", "#a9773f", "#3a2a24"][i % 4], seed = (i % 7) + 1;
  const key = `H|${i % 4}|${ph}|${o.trumpet ? 1 : 0}|${expr}|${q(light)}|${blink}|${o.ghost ?? ""}`;
  out.places.push({ key, x, y, z, scale: sc, mirror, geo: "horse", yaw: Math.atan2(cam.pos.x - x, cam.pos.z - z),
    draw: (p) => horseRider(p, rider, { phase: ph, expr, trumpet: !!o.trumpet, blink, light, seed, coat, ghost: o.ghost }),
    size: [Math.round(1400 * k), Math.round(1400 * k), k] });
  if (!o.ghost) blob(out, x, y, z, 2.2 * sc);
  if (o.trumpet && !o.ghost) {
    const s = mirror ? -1 : 1, u = q(((t * 1.4 + hh(i, 4)) % 1), 30);
    const bx = x + cam.right.x * s * 1.05 * sc, bz = z + cam.right.z * s * 1.05 * sc;
    out.fx.push({ key: `blast${u}|${s}`, cw: 500, ch: 500, draw: (p) => { if (s < 0) { p.g.translate(500, 0); p.g.scale(-1, 1); } fxBlast(p, u); }, x: bx, y: y + 2.1 * sc, z: bz, w: 1.3 * sc, h: 1.3 * sc });
  }
};
const notes = (out: Stage, cam: CamInfo, t: number, x: number, y: number, z: number, n = 4, dir = 1) => {
  for (let k = 0; k < n; k++) {
    const age = ((t * 0.9 + k / n) % 1), pop = Math.min(1, age * 7) * (age > 0.82 ? (1 - age) / 0.18 : 1);
    if (pop <= 0.02) continue;
    const kind = k % 2, side = dir * (0.3 + 0.9 * age);
    out.fx.push({ key: `note${kind}`, cw: 220, ch: 260, draw: (p) => fxNote(p, kind), x: x + cam.right.x * side, y: y + 0.6 * age + 0.1 * Math.sin(age * 9 + k), z: z + cam.right.z * side,
      w: 0.26 * pop, h: 0.3 * pop, rot: 0.3 * Math.sin(age * 6 + k) });
  }
};
const growl = (out: Stage, t: number, x: number, y: number, z: number, i: number) => {
  const u = q((t * 1.3 + hh(i, 2)) % 1, 30);
  out.fx.push({ key: `tap${u}`, cw: 300, ch: 300, draw: (p) => fxTap(p, u), x, y, z, w: 0.45, h: 0.45, rot: 1.6 });
};

/** the Austrian line at the bridge head, facing the French (-z); aim + volley at tv */
const austrianLine = (cam: CamInfo, t: number, out: Stage, o: { aim?: number; volley?: number; expr?: Expr }) => {
  let i = 0;
  for (const z of AUS_Z) for (let k = 0; k < 7; k++, i++) {
    const x = -3.6 + k * 1.2 + (z === AUS_Z[1] ? 0.6 : 0) + (hh(i, 7) - 0.5) * 0.2, who = auW(i);
    const aiming = o.aim !== undefined && t >= o.aim;
    const view = viewOf(cam, x, z, 0, -1);
    const so: SideOpts = { mode: "stand", expr: o.expr ?? "stern", blink: lidAt(t, who.i), aim: aiming };
    const behind = cam.pos.z > z + 1 && !view.side;
    out.places.push(person(cam, who, x, DK, z, aiming ? { side: true, mirror: view.mirror } : FRONT, { mode: "stand", expr: o.expr ?? "stern", blink: lidAt(t, who.i), back: behind }, so));
    blob(out, x, DK, z);
    if (aiming && o.volley !== undefined) muzzle(out, t, o.volley, x, DK + 1.12, z - 0.95, i);
  }
};
/** the French column on the dike: rows behind z0 (toward -z), running along dir */
const column = (cam: CamInfo, t: number, out: Stage, z0: number, rows: number, dir: number, o: { run?: boolean; expr?: (i: number) => Expr; rate?: number; standing?: boolean }) => {
  for (let i = 0; i < rows * 3; i++) {
    const r = Math.floor(i / 3), x = FILES[i % 3] + (hh(i) - 0.5) * 0.15, z = z0 - r * 1.4 + (hh(i, 2) - 0.5) * 0.2;
    const expr = o.expr ? o.expr(i) : "stern";
    if (o.standing) stand(cam, out, frW(i), x, z, { expr, blink: lidAt(t, i) });
    else mover(cam, out, frW(i), x, z, 0, dir, t, { run: o.run, expr, rate: o.rate ?? 1.6 });
  }
};
const reedRiders = (cam: CamInfo, t: number, out: Stage, x0: number, z: number, dir: number, n: number, trumpets: boolean, rate = 1.8) => {
  for (let i = 0; i < n; i++) horse(cam, out, i, x0 - dir * i * 2.4, z + (hh(i, 9) - 0.5) * 1.2, dir, 0, t, { rate, trumpet: trumpets && i < 4, expr: i < 4 ? "grin" : "stern" });
};

// ---------------- per shot ----------------
const hook = (cam: CamInfo, t: number, out: Stage) => {
  stand(cam, out, NAP(), 0, -40, { expr: t < 0.9 ? "smile" : "smile_closed", blink: lidAt(t, 900), prop: t >= 0.68 ? "fist" : null });
  column(cam, t, out, -42.6, 3, 1, { standing: true, expr: (i) => (i % 2 ? "grin" : "smile") });
  for (let i = 0; i < 4; i++) horse(cam, out, i, 31.5 - i * 3.2, BLOW_Z + (i % 2) * 0.8, 1, 0, t, { trumpet: t >= 1.72 - L2, expr: "grin" });
};
const intro = (cam: CamInfo, t: number, out: Stage) => {
  stand(cam, out, NAP(), 0, -40, { expr: t < 8.4 ? "stern" : "grin", blink: lidAt(t, 900) });
  const hungry = t >= 10.0 - L2;
  column(cam, t, out, -42.4, 5, 1, { standing: true, expr: (i) => (hungry ? (i % 3 ? "nervous" : "pained") : i % 2 ? "neutral" : "stern") });
  if (hungry) for (const i of [1, 3, 5]) growl(out, t, FILES[i % 3] + 0.25, DK + 0.9, -42.4 - Math.floor(i / 3) * 1.4 + 0.05, i);
  austrianLine(cam, t, out, {});
};
const charge = (cam: CamInfo, t: number, out: Stage) => {
  const back = t >= 17.9;
  const F = colFront(t);
  column(cam, t, out, F, 9, back ? -1 : 1, { run: true, rate: 1.7, expr: (i) => (back ? (i % 2 ? "shock" : "nervous") : i % 3 ? "stern" : "grin") });
  austrianLine(cam, t, out, { aim: 17.3, volley: 17.87 - 0.05 });
};
const flag = (cam: CamInfo, t: number, out: Stage) => {
  const has = t >= 19.62 - L2;
  if (t < 20.6) {
    stand(cam, out, NAP(), 0, -40, { expr: has ? "stern" : "neutral", prop: has ? ["flag", q((t * 0.9) % 1, 30)] : null, blink: lidAt(t, 900) });
    burst(out, t, 19.62 - L2, 0.55, DK + 2.6, -40.1, 1.1);
    column(cam, t, out, -42.6, 3, 1, { standing: true, expr: (i) => (has ? "shock" : "neutral") });
  } else {
    const z = napZ(t);
    mover(cam, out, NAP(), 0, z, 0, 1, t, { run: true, rate: 1.7, expr: "stern", fo: { prop: ["flag", q((t * 1.2) % 1, 30)], mode: "march" } });
    column(cam, t, out, z - 2.2, 6, 1, { run: true, rate: 1.7, expr: (i) => (i % 3 ? "stern" : "nervous") });
  }
};
const fire = (cam: CamInfo, t: number, out: Stage) => {
  if (t < 23.4) { austrianLine(cam, t, out, { aim: 21.9, volley: 22.95 - 0.05 }); return; }
  if (t < 25.35) {
    const u = clamp01((t - 24.2) / 0.55);
    stand(cam, out, NAP(), 0.6, -24, { expr: t < 24.3 ? "stern" : "shock", prop: ["flag", q((t * 0.9) % 1, 30)], blink: lidAt(t, 900) });
    if (u <= 0) stand(cam, out, { i: 901, o: AIDE, okey: "aide" }, -0.7, -24.3, { expr: "stern", blink: lidAt(t, 901) });
    else out.places.push({ ...person(cam, { i: 901, o: AIDE, okey: "aide" }, -0.7 - 1.6 * u, DK - 1.6 * u * u, -24.6, FRONT, { mode: "fall", expr: "shock", tilt: -70 * u }, {}), sq: [1 - 0.1 * Math.sin(Math.PI * u), 1 + 0.15 * Math.sin(Math.PI * u)] });
    burst(out, t, 24.2, -0.6, DK + 1.5, -24.2, 0.8, 0.15);
    column(cam, t, out, -26.8, 3, 1, { standing: true, expr: (i) => (t > 24.3 ? "shock" : "stern") });
    for (let k = 0; k < 3; k++) { const u2 = q(((t - 23 + k * 0.7) % 2.1) / 2.1, 30); out.fx.push({ key: `smk${u2}`, cw: 400, ch: 400, draw: (p) => fxSmoke(p, u2), x: 3 - k * 2.5, y: DK + 2.2 + k * 0.3, z: -19 + k, w: 3 + 2 * u2, h: 3 + 2 * u2, soft: true }); }
    return;
  }
  // the retreat sweeps the general off the dike
  for (let i = 0; i < 21; i++) {
    const r = Math.floor(i / 3), x = FILES[i % 3] * 0.9 + (hh(i) - 0.5) * 0.2, z = -15 - r * 1.6 - 4.6 * (t - 25.4);
    if (z > -10 || z < -44) continue;
    mover(cam, out, frW(i), x, z, 0, -1, t, { run: true, rate: 1.8, expr: i % 2 ? "shock" : "nervous" });
  }
  const u = clamp01((t - FALL0) / (FALL1 - FALL0));
  const HATLAND = FALL1 + 0.4;
  if (t < FALL0) {
    // anticipation: a bump from the runners, a squash before he goes
    const k = clamp01((t - (FALL0 - 0.25)) / 0.25);
    out.places.push({ ...person(cam, NAP(), NAP_FALL.x0, DK, NAP_FALL.z, FRONT, { mode: "stand", expr: t < 26.1 ? "stern" : "shock", prop: ["flag", q((t * 0.9) % 1, 30)], blink: lidAt(t, 900), tilt: -10 * k }, {}), sq: [1 + 0.12 * k, 1 - 0.1 * k] });
    blob(out, NAP_FALL.x0, DK, NAP_FALL.z);
  } else if (t < FALL1 + 0.05) {
    const x = NAP_FALL.x0 + (NAP_FALL.x1 - NAP_FALL.x0) * u, y = DK * (1 - u) + 1.5 * 4 * u * (1 - u), s = Math.sin(Math.PI * u);
    out.places.push({ ...person(cam, { i: 900, o: NAPHAT, okey: "napnh" }, x, y, NAP_FALL.z, FRONT, { mode: "fall", expr: "shock", tilt: -330 * u }, {}), sq: [1 - 0.12 * s, 1 + 0.2 * s] });
  } else {
    const y = Math.max(SINK, 0 - (t - FALL1) * 4), k = Math.max(0, 1 - (t - FALL1) / 0.25);
    out.places.push({ ...person(cam, t < HATLAND ? { i: 900, o: MUDNH, okey: "napmnh" } : NAP(true), NAP_FALL.x1, y, NAP_FALL.z, FRONT, { mode: "stand", expr: "shock", blink: 0 }, {}), sq: [1 + 0.25 * k, 1 - 0.22 * k] });
  }
  // the hat flies higher and drops back onto his head
  if (t >= FALL0 && t < HATLAND) {
    const h = clamp01((t - FALL0) / (HATLAND - FALL0)), x = NAP_FALL.x0 + (NAP_FALL.x1 - NAP_FALL.x0) * h;
    const y = (DK + 1.65) * (1 - h) + 0.5 * h + 3.2 * 4 * h * (1 - h);
    out.fx.push({ key: "bicorne", cw: 300, ch: 160, draw: fxBicorne, x, y, z: NAP_FALL.z - 0.05, w: 0.62, h: 0.33, rot: 9 * h });
  }
  if (t >= FALL1 && t < FALL1 + 1.0) {
    const u2 = q((t - FALL1) / 1.0, 30);
    out.fx.push({ key: `msplash${u2}`, cw: 800, ch: 800, draw: (p) => fxSplash(p, u2, true), x: NAP_FALL.x1, y: 1.9, z: NAP_FALL.z, w: 5, h: 5 });
  }
};
const mud = (cam: CamInfo, t: number, out: Stage) => {
  const rise = t >= 30.7;
  const y = rise ? napRise(t) : SINK, x = rise ? NAP_FALL.x1 - 1.1 * smooth((t - 31.55) / 0.75) : NAP_FALL.x1;
  stand(cam, out, NAP(true), x, NAP_FALL.z, { expr: rise ? (t > 31.9 ? "dazed" : "pained") : "neutral", blink: lidAt(t, 900), headTilt: rise ? 0 : -4 }, y, false);
  out.fx.push({ key: `ring${q((t * 0.4) % 1, 30)}`, cw: 600, ch: 600, draw: (p) => fxRing(p, q((t * 0.4) % 1, 30)), x, y: 0.06, z: NAP_FALL.z, w: 1.6, h: 1.6, flat: true });
  if (rise) for (const [k, dz] of [[0, 0.55], [1, -0.6]] as const)
    stand(cam, out, { i: 902 + k, o: OFFICER_FR, okey: "offr" }, 5.75, NAP_FALL.z + dz, { expr: "pained", blink: lidAt(t, 902 + k), tilt: 12 }, 0.02);
};
const think = (cam: CamInfo, t: number, out: Stage) => {
  stand(cam, out, NAP(), 0, -45, { expr: t < 33.45 ? "stern" : "grin", blink: lidAt(t, 900), headTilt: t < 33.45 ? 5 : 0, prop: t >= 33.4 ? "point" : null });
  column(cam, t, out, -47.6, 3, 1, { standing: true, expr: (i) => (i % 2 ? "dazed" : "neutral") });
  if (t >= 33.45) { const u = q(Math.min(1, (t - 33.45) / 0.6), 30); out.fx.push({ key: `bulb${u}`, cw: 300, ch: 400, draw: (p) => fxBulb(p, u), x: 0.15, y: DK + 2.6, z: -45, w: 0.6, h: 0.8 }); }
};
const ride = (cam: CamInfo, t: number, out: Stage) => {
  if (t < 37.4) reedRiders(cam, t, out, rideX(t), RIDE_Z, 1, RIDERS, false);
  else {
    for (let i = 0; i < RIDERS; i++) horse(cam, out, i, 27 - 2.4 * (t - 37.4) + (i % 4) * 2.7 + Math.floor(i / 4) * 1.2, 19 + Math.floor(i / 4) * 2.3, -1, 0, t, { rate: 1.8, expr: "grin" });
    austrianLine(cam, t, out, { expr: "dazed" });
  }
};
const blow = (cam: CamInfo, t: number, out: Stage) => {
  for (let i = 0; i < 4; i++) horse(cam, out, i, 27.5 - i * 3.0, BLOW_Z - 1.4 + i * 1.25, 0, -1, t, { trumpet: t >= 39.52 - L2, expr: t >= 40.45 - L2 ? "laugh" : "grin" });
  for (let i = 4; i < RIDERS; i++) horse(cam, out, i, 26.5 - (i - 4) * 3.0, BLOW_Z + 3.4 + (i - 4) * 1.0, 0, -1, t, { expr: "grin" });
};
const panic = (cam: CamInfo, t: number, out: Stage) => {
  let i = 0;
  for (const z of AUS_Z) for (let k = 0; k < 7; k++, i++) {
    const x0 = -3.6 + k * 1.2 + (z === AUS_Z[1] ? 0.6 : 0), who = auW(i);
    const heard = t >= 42.49 - L2, panicked = t >= 43.67 - L2, run = t >= 44.0 + hh(i, 4) * 0.25;
    if (run) { mover(cam, out, who, x0 + (hh(i, 5) - 0.5) * 2, z + 5.2 * (t - 44.0), (hh(i, 5) - 0.5) * 0.4, 1, t, { run: true, rate: 1.9, expr: i % 2 ? "shock" : "nervous" }); continue; }
    const expr: Expr = panicked ? (i % 2 ? "shock" : "nervous") : heard ? "shock" : "neutral";
    const look = panicked ? (Math.floor(t * 6 + i) % 2 ? 1 : -1) : 0;
    const hop = heard ? 0.32 * Math.max(0, Math.sin(Math.PI * clamp01((t - 42.42 - hh(i, 6) * 0.08) / 0.32))) : 0;
    out.places.push({ ...person(cam, who, x0, DK + hop, z, FRONT, { mode: "stand", expr, look, blink: heard ? lidAt(t, who.i) : 0.5 }, {}), sq: hop > 0.05 ? [0.92, 1.1] : undefined });
    blob(out, x0, DK, z, 1, hop > 0.1 ? 0.6 : 1);
  }
};
const reeds = (cam: CamInfo, t: number, out: Stage) => {
  if (t < 48.0) return;
  stand(cam, out, { i: 302, o: austrian(2, { rifle: false }), okey: "auE2" }, -24, -17.4, { expr: t < 49.3 ? "nervous" : "shock", prop: "ear", look: 1, blink: lidAt(t, 302) }, 0);
  notes(out, cam, t, -25.3, 1.9, -17.2, 4, 1);
};
const street = (cam: CamInfo, t: number, out: Stage) => {
  const z = walkZ(t), dart = t >= 52.59 - L2 && t < 54.0;
  const expr: Expr = t >= 54.02 - L2 ? "shock" : "nervous", look = dart ? (Math.floor(t * 3.3) % 2 ? 1 : -1) : 0;
  const ph = q(((t * 0.85) % 1), 60);
  out.places.push(person(cam, { i: 950, o: WALKER, okey: "walk" }, STREET_X, 0, z, FRONT, { mode: "stroll", phase: ph, expr, look, blink: lidAt(t, 950) }, {}));
  blob(out, STREET_X, 0, z);
  for (let k = 0; k < 3; k++) {
    const t0 = Math.floor((t - 50.3) / 0.55) * 0.55 + 50.3 - k * 0.55, u = q((t - t0) / 1.4, 30);
    if (u < 0 || u >= 1) continue;
    out.fx.push({ key: `tap${u}`, cw: 300, ch: 300, draw: (p) => fxTap(p, u), x: STREET_X + (k % 2 ? 0.35 : -0.35), y: 0.35, z: walkZ(t0) + 3.2, w: 0.6, h: 0.6 });
  }
  if (t >= 54.0) {
    const g = smooth((t - 54.0) / 0.5);
    out.fx.push({ key: "crowdshadow", cw: 1600, ch: 800, draw: (p) => fxCrowdShadow(p, 3), x: STREET_X, y: 2.6 * g, z: z + 5.5, w: 11, h: 5.2 * g, soft: true });
  }
};
const regiment = (cam: CamInfo, t: number, out: Stage) => {
  for (let i = 0; i < 4; i++) horse(cam, out, i, 20 + i * 3.4, -17 + (i % 2) * 1.2, 1, 0, t, { trumpet: true, expr: "grin" });
  stand(cam, out, { i: 305, o: austrian(1, { rifle: false }), okey: "auE1" }, 9.5, 10.6, { expr: t >= 57.4 ? "shock" : "nervous", prop: "ear", look: -1, blink: lidAt(t, 305) });
  if (t >= 57.49 - L2) for (let i = 0; i < 26; i++) {
    const g = smooth((t - 57.42 - hh(i, 8) * 0.35) / 0.25);
    if (g <= 0.02) continue;
    horse(cam, out, 40 + i, 9 + (i % 13) * 3.0 + hh(i) * 1.5, -20 - Math.floor(i / 13) * 3.2 - hh(i, 2) * 1.2, 1, 0, t, { ghost: "#2a2246", scale: 2.7 * g });
  }
};
const painter = (cam: CamInfo, t: number, out: Stage) => {
  stand(cam, out, { i: 960, o: PAINTER, okey: "paint" }, 1.3, -16.7, { expr: t > 60.9 ? "grin" : "smile", prop: ["brush", q((t * 1.4) % 1, 30)], blink: lidAt(t, 960), facing: -1 });
  if (t >= 61.0) for (let k = 0; k < 2; k++) burst(out, t, 61.0 + k * 0.25, EASEL[0] - 0.3 + k * 0.6, DK + 1.9 - k * 0.3, EASEL[2] - 0.15, 0.7, 0.3);
};
const painting = (cam: CamInfo, t: number, out: Stage) => {
  if (t < 66.2) return;
  stand(cam, out, NAP(true), 1.95, -15.6, { expr: "neutral", blink: lidAt(t, 900), facing: -1 });
  stand(cam, out, { i: 960, o: PAINTER, okey: "paint" }, -1.35, -16.5, { expr: "grin", prop: ["brush", q((t * 1.4) % 1, 30)], blink: lidAt(t, 960), facing: 1 });
};

/** everything with a face in shot `id` at time t */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light;
  findSun(cam, SUN);
  ({ hook, intro, charge, flag, fire, mud, think, ride, blow, panic, reeds, street, regiment, painter, painting } as Record<string, (c: CamInfo, t: number, o: Stage) => void>)[s.crowd](cam, t, out);
  return out;
};
export { FPS };

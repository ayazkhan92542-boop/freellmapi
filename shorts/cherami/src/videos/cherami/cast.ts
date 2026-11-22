// Our cast as lit flat sprites in the 3D world (template infrastructure: canvas pool, lit cards, contact blobs,
// blinks) + the Arcole staging per shot: Napoleon, the French column, the Austrian line, the riders and trumpeters,
// the painter, the night walker. Cards, effects and blobs live on the NOINK layer.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxNote, fxBurst, fxStars, fxShadow, fxContact, fxSmoke, fxMuzzle, fxBulb,
  Outfit, Expr, FrontOpts, SideOpts, doughboy, MAJOR, SIGNAL, german, GENERAL_FR, SCIENTIST, visitor, pigeon, PigeonOpts, PigeonExpr,
  fxDirt, fxFeathers, fxZip, fxMap, fxSunPoint, fxField, fxPhone, fxHelix, fxBubble, fxMessage, fxHome, fxBasket,
} from "./toon";
import { FPS, SHOTS, V3, smooth, clamp01, HQ, LOFT, BOARD_Y, TABLE, MUSEUM, CASE_Y, LAB, flyX, flyY, LAND_T, SHELLS, groundY } from "./story";
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
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing" | "horse" | "pigeon"; sq?: [number, number]; roll?: number; size?: [number, number, number];
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

// ================= Cher Ami staging =================
export type Stage = { places: Place[]; fx: FxPlace[] };
const DB = [0, 1, 2, 3].map((v) => doughboy(v));
const DBN = [0, 1, 2, 3].map((v) => doughboy(v, { rifle: false }));
const GE = [0, 1, 2].map((v) => german(v));
const FRONT = { side: false, mirror: false };
const L2 = LEAD;
const dbW = (i: number, rifle = true): Who => ({ i, o: (rifle ? DB : DBN)[i % 4], okey: `db${rifle ? "" : "n"}${i % 4}` });
const stand = (cam: CamInfo, out: Stage, who: Who, x: number, z: number, fo: FrontOpts, y = groundY(x, z), shadow = true) => {
  out.places.push(person(cam, who, x, y, z, FRONT, { mode: "stand", ...fo }, {}));
  if (shadow) blob(out, x, y, z);
};
const sit = (cam: CamInfo, out: Stage, who: Who, x: number, z: number, fo: FrontOpts) => {
  out.places.push(person(cam, who, x, 0, z, FRONT, { mode: "sit", ...fo }, {}));
  blob(out, x, 0, z, 1.05);
};
const mover = (cam: CamInfo, out: Stage, who: Who, x: number, z: number, dx: number, dz: number, t: number, o: { rate?: number; expr?: Expr; run?: boolean; fo?: FrontOpts }) => {
  const ph = q(((t * (o.rate ?? 1.0) + hh(who.i, 5)) % 1), 60), expr = o.expr ?? "smile";
  const view = viewOf(cam, x, z, dx, dz), blink = lidAt(t, who.i);
  const tl = Math.hypot(cam.pos.x - x, cam.pos.z - z) || 1, away = ((cam.pos.x - x) * dx + (cam.pos.z - z) * dz) / (tl * (Math.hypot(dx, dz) || 1)) < -0.57;
  const fo: FrontOpts = { mode: "stroll", phase: ph, expr, blink, lift: 50, back: away, ...o.fo };
  const so: SideOpts = { mode: "march", phase: ph, expr, blink, stomp: 0.7, stride: view.fs * 0.8 };
  out.places.push(person(cam, who, x, 0, z, view, fo, so));
  blob(out, x, 0, z);
};
const burst = (out: Stage, t: number, t0: number, x: number, y: number, z: number, w = 1.0, dur = 0.25) => {
  if (t < t0 || t >= t0 + dur) return;
  const u = q((t - t0) / dur, 30);
  out.fx.push({ key: `burst${u}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, u), x, y, z, w, h: w });
};
const once = (out: Stage, t: number, t0: number, dur: number, key: string, cw: number, ch: number, draw: (p: Pen, u: number) => void, x: number, y: number, z: number, w: number, h: number, soft = false) => {
  if (t < t0 || t >= t0 + dur) return;
  const u = q((t - t0) / dur, 30);
  out.fx.push({ key: `${key}${u}`, cw, ch, draw: (p) => draw(p, u), x, y, z, w, h, soft });
};

// ---- the pigeon card: 600 x 600 design, 0.8 m wide; standing feet at y = 575, flying body centre at 300 ----
const PSU = 0.8 / 600;
export const PIGEON_FOOT = (575 - 300) * PSU;
type Bird = PigeonOpts & { i: number; x: number; y: number; z: number; dx?: number; dz?: number; roll?: number; scale?: number };
const bird = (cam: CamInfo, out: Stage, b: Bird) => {
  const sc = b.scale ?? 1, d = cam.pos.distanceTo(tmp.set(b.x, b.y + 0.3, b.z)) / sc;
  const k = d < 1.8 ? 1.4 : d < 4 ? 0.9 : d < 10 ? 0.5 : 0.28;
  const mirror = b.view === "side" && (b.dx ?? 1) * cam.right.x + (b.dz ?? 0) * cam.right.z < 0;
  const blink = b.expr === "happy" || b.expr === "wink" ? 0 : lidAt(b.blink ?? 0, b.i + 700);
  const o: PigeonOpts = { ...b, blink, flap: b.flap !== undefined ? q(b.flap, 24) : undefined };
  const key = `P|${JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v))}`;
  out.places.push({ key, x: b.x, y: b.y, z: b.z, scale: sc, mirror, geo: "pigeon", roll: b.roll, yaw: Math.atan2(cam.pos.x - b.x, cam.pos.z - b.z),
    draw: (p) => pigeon(p, o), size: [Math.round(600 * k), Math.round(600 * k), k] });
  if (!b.fly) blob(out, b.x, b.y, b.z, 0.35 * sc);
};
const feathers = (out: Stage, t: number, t0: number, x: number, y: number, z: number, w = 1.6) =>
  once(out, t, t0, 1.1, "feath", 400, 400, (p, u) => fxFeathers(p, u), x, y, z, w, w);

// ---------------- the pocket in the forest ----------------
const POCKET: [number, number, "sit" | "stand"][] = [[-1.2, 2.6, "sit"], [1.4, 2.2, "sit"], [2.8, 0.8, "sit"], [-2.9, 0.4, "sit"], [0.4, 3.8, "stand"],
  [-3.6, 2.9, "stand"], [3.4, 3.4, "sit"], [-0.2, 5.4, "sit"], [2.2, 5.6, "stand"], [-2.4, 5.2, "sit"], [4.6, 2.0, "stand"], [-4.8, 1.6, "sit"]];
const pocket = (cam: CamInfo, t: number, out: Stage, expr: (i: number) => Expr, look = 0) => {
  POCKET.forEach(([x, z, m], i) => {
    const who = dbW(i, m === "stand");
    if (m === "sit") sit(cam, out, who, x, z, { expr: expr(i), blink: lidAt(t, i), look });
    else stand(cam, out, who, x, z, { expr: expr(i), blink: lidAt(t, i), look });
  });
};
const MAJ: Who = { i: 50, o: MAJOR, okey: "maj" };
const SIG: Who = { i: 51, o: SIGNAL, okey: "sig" };
const germansRing = (cam: CamInfo, t: number, out: Stage, aim = false, fire?: number) => {
  for (let i = 0; i < 18; i++) {
    const a = -0.4 + (i / 17) * (Math.PI + 0.8), r = 15 + 5 * hh(i, 3), x = Math.cos(a) * r * 1.1, z = 3 + Math.sin(a) * r;
    const who: Who = { i: 200 + i, o: GE[i % 3], okey: `ge${i % 3}` };
    if (aim) {
      const view = viewOf(cam, x, z, 1, 0);
      out.places.push({ ...person(cam, who, x, 0, z, { side: true, mirror: view.mirror }, {}, { mode: "stand", expr: "stern", aim: true, blink: lidAt(t, who.i) }), roll: view.mirror ? -0.45 : 0.45 });
      blob(out, x, 0, z);
      if (fire !== undefined) {
        const tf = fire + hh(i, 4) * 1.9, s = view.mirror ? -1 : 1;
        once(out, t, tf, 0.18, "muz", 400, 400, (p, u) => fxMuzzle(p, u), x + cam.right.x * s * 0.95, 1.75, z + cam.right.z * s * 0.95, 1.0, 1.0);
        once(out, t, tf, 2.5, "smk", 400, 400, (p, u) => fxSmoke(p, u), x + cam.right.x * s * 1.1, 2.0, z + cam.right.z * s * 1.1, 2.0, 2.0, true);
      }
    } else stand(cam, out, who, x, z, { expr: "stern", blink: lidAt(t, who.i) });
  }
};

// ---------------- per shot ----------------
const hook = (cam: CamInfo, t: number, out: Stage) => {
  const strut = Math.max(0, Math.sin(t * 5.2));
  bird(cam, out, { i: 0, view: "side", x: TABLE[0] - 0.2 + 0.12 * Math.sin(t * 2.6), y: 1.0 + 0.03 * strut, z: TABLE[2], dx: 1, expr: t > 2.3 ? "proud" : "determined", eye: "patch", leg: "peg", medal: true, tilt: -4 * strut, blink: t });
  burst(out, t, 2.44 - L2, TABLE[0] + 0.15, 1.45, TABLE[2] - 0.1, 0.7, 0.3);
  for (let i = 0; i < 5; i++) stand(cam, out, dbW(i, false), TABLE[0] - 2.4 + i * 1.2, TABLE[2] + 3.2 + (i % 2) * 0.6, { expr: "smile", prop: "point", blink: lidAt(t, i) });
};
const forest = (cam: CamInfo, t: number, out: Stage) => {
  pocket(cam, t, out, (i) => (i % 3 ? "nervous" : "stern"), t > 8.6 ? (Math.floor(t * 3) % 2 ? 1 : -1) : 0);
  stand(cam, out, MAJ, 0, 1.5, { expr: "stern", blink: lidAt(t, 50) });
  germansRing(cam, t, out);
};
const SHELL_AT: V3[] = [[2.6, 0, 6.5], [-3.8, 0, 4.4], [4.6, 0, -1.2], [-1.2, 0, 8.2]];
const shell = (cam: CamInfo, t: number, out: Stage) => {
  const bad = t >= 10.7 - L2;
  pocket(cam, t, out, (i) => (bad ? (i % 2 ? "shock" : "nervous") : i % 2 ? "smile" : "relief"));
  stand(cam, out, MAJ, 0, 1.5, { expr: bad ? "shock" : "smile", blink: lidAt(t, 50) });
  SHELLS.forEach((ts, k) => {
    const [x, , z] = SHELL_AT[k];
    once(out, t, ts, 1.3, "dirt", 600, 600, (p, u) => fxDirt(p, u), x, 2.9, z, 6.2, 6.2);
  });
};
const radio = (cam: CamInfo, t: number, out: Stage) => {
  pocket(cam, t, out, (i) => (i % 2 ? "nervous" : "stern"));
  stand(cam, out, MAJ, 0, 1.5, { expr: t < 13.6 ? "nervous" : "pained", prop: t >= 13.45 && t < 14.6 ? "shrug" : null, blink: lidAt(t, 50) });
  stand(cam, out, SIG, -2.0, 1.2, { expr: t > 15.8 ? "smile" : "neutral", blink: lidAt(t, 51) });
  out.fx.push({ key: "basket", cw: 500, ch: 360, draw: fxBasket, x: -2.0, y: 0.38, z: 0.75, w: 0.75, h: 0.54 });
  if (t >= 15.85 - L2) for (let k = 0; k < 3; k++) {
    const pop = smooth((t - 15.85 - k * 0.12) / 0.25);
    if (pop > 0) bird(cam, out, { i: 10 + k, view: "front", x: -2.22 + k * 0.22, y: 0.52 - 0.35 * (1 - pop), z: 0.74, expr: k === 1 ? "determined" : "neutral", scale: 0.42, blink: t + k });
  }
};
const launch = (t0: number, t: number, x0: number, z0: number) => {
  const u = clamp01((t - t0) / 1.0);
  return { x: x0 + 0.6 * u, y: 1.25 + 4.0 * u, z: z0 + 2.2 * u, flap: (t * 3.2) % 1 };
};
const first = (cam: CamInfo, t: number, out: Stage) => {
  pocket(cam, t, out, (i) => (t > 17.9 ? "shock" : "nervous"), -1);
  for (const [k, t0, hit] of [[0, 17.05, 17.87], [1, 18.55, 19.32]] as const) {
    if (t < t0) continue;
    if (t < hit) { const b = launch(t0, t, 0.3, 0.8); bird(cam, out, { i: 20 + k, view: "side", fly: true, flap: b.flap, x: b.x, y: b.y, z: b.z, dx: 1, expr: "determined" }); }
    else if (t < hit + 0.9) { const b = launch(t0, hit, 0.3, 0.8), fall = (t - hit); bird(cam, out, { i: 20 + k, view: "side", fly: true, flap: 0, x: b.x + 0.8 * fall, y: b.y - 6 * fall * fall, z: b.z, dx: 1, expr: "dazed", roll: 2.5 * fall }); }
    const b = launch(t0, hit, 0.3, 0.8);
    feathers(out, t, hit, b.x, b.y, b.z);
  }
};
const last = (cam: CamInfo, t: number, out: Stage) => {
  stand(cam, out, SIG, -2.0, 1.2, { expr: "smile", prop: "hold", blink: lidAt(t, 51) });
  bird(cam, out, { i: 0, view: "front", x: -2.0, y: 0.98, z: 1.0, expr: t > 20.7 ? "determined" : "neutral", scale: 0.55, blink: t });
  if (t > 20.82 - L2) { const u = q(((t - 20.8) * 1.5) % 1, 30); out.fx.push({ key: `stars${u}`, cw: 420, ch: 210, draw: (p) => fxStars(p, u), x: -2.0, y: 1.62, z: 0.95, w: 0.5, h: 0.25 }); }
  pocket(cam, t, out, () => "smile");
};
const takeoff = (cam: CamInfo, t: number, out: Stage) => {
  if (t < 22.7) {
    stand(cam, out, SIG, -2.0, 1.2, { expr: "grin", prop: t < 21.95 ? "hold" : "fist", blink: lidAt(t, 51) });
    const b = t < 21.95 ? { x: -2.0, y: 0.98, z: 1.0, flap: 0 } : launch(21.95, t, -2.0, 1.0);
    bird(cam, out, t < 21.95 ? { i: 0, view: "front", x: b.x, y: b.y, z: b.z, expr: "determined", scale: 0.55, blink: t } : { i: 0, view: "side", fly: true, flap: (t * 3.4) % 1, x: b.x, y: b.y, z: b.z, dx: 1, expr: "determined", capsule: true });
    pocket(cam, t, out, () => "grin");
  } else if (t < 24.03) {
    germansRing(cam, t, out, true, 23.9 - 1.0);
  } else {
    bird(cam, out, { i: 0, view: "side", fly: true, flap: (t * 3.6) % 1, x: flyX(t), y: flyY(t), z: 28, dx: 1, expr: "determined", capsule: true, tilt: 8 * Math.sin(t * 7) });
    for (let k = 0; k < 4; k++) once(out, t, 24.1 + k * 0.33, 0.3, "zip", 400, 160, (p, u) => fxZip(p, u), flyX(t) + 0.3 - k * 0.2, flyY(t) + (k % 2 ? 0.55 : -0.5), 27.6, 1.6, 0.64);
  }
};
const hit = (cam: CamInfo, t: number, out: Stage) => {
  const eye = t >= 27.0 - L2, leg = t >= 28.14 - L2, hurt = t >= 26.09 - L2 && t < 28.6;
  const x = flyX(t), y = flyY(t) - (hurt ? 0.25 * Math.sin((t - 26) * 9) : 0);
  bird(cam, out, { i: 0, view: "side", fly: true, flap: (t * (t > 28.6 ? 4.4 : 3.4)) % 1, x, y, z: 28, dx: 1, expr: t > 28.6 ? "determined" : hurt ? "pained" : "determined",
    eye: eye ? "patch" : "ok", leg: leg ? "hang" : "two", capsule: true, tilt: hurt ? 10 * Math.sin((t - 26) * 6) : 0 });
  for (const th of [26.09, 27.0, 28.14]) { feathers(out, t, th, flyX(th) + 0.1, flyY(th), 27.8, 1.4); burst(out, t, th, flyX(th) + 0.2, flyY(th), 27.7, 0.9, 0.2); }
  for (let k = 0; k < 6; k++) once(out, t, 25.6 + k * 0.45, 0.3, "zip", 400, 160, (p, u) => fxZip(p, u), x + 0.4 - (k % 3) * 0.3, y + (k % 2 ? 0.6 : -0.55), 27.6, 1.6, 0.64);
};
const land = (cam: CamInfo, t: number, out: Stage) => {
  const bx = LOFT[0], bz = LOFT[2] - 2.9;
  if (t < LAND_T) {
    const u = clamp01((t - 29.75) / (LAND_T - 29.75)), e = 1 - (1 - u) ** 2;
    bird(cam, out, { i: 0, view: "side", fly: true, flap: (t * 3.0) % 1, x: bx - 14 + 14 * e, y: 11 - (11 - BOARD_Y - 0.37) * e, z: bz - 30 + 30 * e, dx: 0.4, dz: 1, expr: "determined", eye: "patch", leg: "hang", capsule: true });
  } else if (t < 32.0) {
    const k = Math.max(0, 1 - (t - LAND_T) / 0.25);
    out.places.push(...[]); bird(cam, out, { i: 0, view: "side", x: bx, y: BOARD_Y, z: bz, dx: 1, expr: k > 0 ? "shock" : "dazed", eye: "patch", leg: "two", capsule: true, blink: t });
    if (k > 0) out.places[out.places.length - 1].sq = [1 + 0.3 * k, 1 - 0.28 * k];
  }
  if (t >= 32.0 && t < 35.4) {
    stand(cam, out, SIG, LOFT[0] + 0.2, LOFT[2] - 1.6, { expr: t > 33.4 ? "shock" : "neutral", prop: "hold", blink: lidAt(t, 51) });
    if (t >= 32.5) out.fx.push({ key: "msg", cw: 400, ch: 260, draw: fxMessage, x: LOFT[0] + 0.15, y: 1.33, z: LOFT[2] - 1.85, w: 0.5, h: 0.33 });
  }
  if (t >= 35.4) {
    stand(cam, out, { i: 52, o: { ...MAJOR, build: "stout", moustache: "#5a3b2a" }, okey: "col" }, HQ[0] - 10, HQ[2] + 11, { expr: t > 36.8 ? "shock" : "stern", prop: "phone", blink: lidAt(t, 52) });
    if (t > 36.8) burst(out, t, 36.84 - L2, HQ[0] - 9.6, 2.0, HQ[2] + 10.8, 0.9, 0.35);
  }
};
const explain = (cam: CamInfo, t: number, out: Stage) => {
  if (t < 39.95) {
    bird(cam, out, { i: 30, view: "side", x: LOFT[0], y: BOARD_Y, z: LOFT[2] - 2.9, dx: 1, expr: t > 39.0 ? "proud" : "neutral", blink: t });
    if (t >= 39.05) { const u = clamp01((t - 39.05) / 0.9); out.fx.push({ key: "map", cw: 400, ch: 300, draw: fxMap, x: LOFT[0] - 0.3 - 2.5 * u, y: BOARD_Y + 0.4 + 1.8 * u - 3 * u * u, z: LOFT[2] - 3.2, w: 0.7, h: 0.52, rot: 4 * u }); }
    else out.fx.push({ key: "map", cw: 400, ch: 300, draw: fxMap, x: LOFT[0] - 0.4, y: BOARD_Y + 0.2, z: LOFT[2] - 3.1, w: 0.6, h: 0.45, rot: 0.2 });
    return;
  }
  if (t < 41.27) {
    bird(cam, out, { i: 30, view: "side", x: LOFT[0] + 0.4, y: BOARD_Y, z: LOFT[2] - 2.9, dx: -1, expr: "happy", blink: t });
    once(out, t, 40.5, 0.8, "home", 300, 300, (p, u) => fxHome(p, smooth(u * 2)), LOFT[0], 9.2, LOFT[2], 3.2, 3.2);
    if (t >= 40.5 + 0.8) out.fx.push({ key: "home1", cw: 300, ch: 300, draw: (p) => fxHome(p, 1), x: LOFT[0], y: 9.2, z: LOFT[2], w: 3.2, h: 3.2 });
    return;
  }
  const u = t - 41.27, px = HQ[0] - 70 + 6 * u + 3, pz = -60 + 9 * u + 4, py = 17.5;
  bird(cam, out, { i: 30, view: "side", fly: true, flap: (t * 3.2) % 1, x: px, y: py - 0.3, z: pz, dx: 6, dz: 9, expr: "determined" });
  const ahead = (d: number, up: number, side: number) => ({ x: px + 0.55 * d + side * cam.right.x, y: py + up, z: pz + 0.83 * d + side * cam.right.z });
  if (t >= 42.8 - L2) { const s = smooth((t - 42.8) / 0.3), a = ahead(9, 3.5, 2.2); out.fx.push({ key: `sun${q((t * 0.3) % 1, 30)}`, cw: 500, ch: 500, draw: (p) => fxSunPoint(p, q((t * 0.3) % 1, 30)), ...a, w: 3.4 * s, h: 3.4 * s }); }
  if (t >= 43.6 - L2 && t < 45.5) { const a = ahead(6, 0.5, -0.8); out.fx.push({ key: `field${q((t * 0.5) % 1, 30)}`, cw: 800, ch: 800, draw: (p) => fxField(p, q((t * 0.5) % 1, 30)), ...a, w: 5.5, h: 5.5, soft: true }); }
  if (t >= 44.4 && t < 45.5) for (let k = 0; k < 6; k++) { const a = ahead(1.2 + k * 1.3, -0.2, 0); out.fx.push({ key: "dash", cw: 120, ch: 60, draw: (p) => p.stroke([[10, 30], [110, 30]], 26, "#fff3b0"), ...a, w: 0.5, h: 0.25 }); }
  if (t >= 45.55 - L2) { const s = smooth((t - 45.55) / 0.3), a = ahead(3.2, 0.3, 1.1); out.fx.push({ key: `phone${q(s, 20)}`, cw: 300, ch: 520, draw: (p) => fxPhone(p, q(s, 20)), ...a, w: 1.15, h: 2.0 }); }
};
const legShot = (cam: CamInfo, t: number, out: Stage) => {
  if (t < 49.2) {
    for (let i = 0; i < 9; i++) { const x = -3 + (i % 3) * 2.2 + hh(i) * 0.6, z = 5 - Math.floor(i / 3) * 1.6 - 1.4 * (t - 47.8); mover(cam, out, i === 4 ? MAJ : dbW(i), x, z, 0, -1, t, { expr: i % 2 ? "grin" : "smile_closed" }); }
    return;
  }
  sit(cam, out, dbW(3, false), HQ[0] + 8.9, HQ[2] - 9.0, { expr: t > 50.2 ? "grin" : "smile", prop: ["knife", q((t * 1.6) % 1, 30)], blink: lidAt(t, 3) });
  const peg = t >= 50.15 - L2;
  bird(cam, out, { i: 0, view: "side", x: HQ[0] + 7.9, y: 0, z: HQ[2] - 9.3, dx: 1, expr: peg ? "happy" : "neutral", eye: "patch", leg: peg ? "peg" : "hang", blink: t });
  burst(out, t, 50.15 - L2, HQ[0] + 8.0, 0.25, HQ[2] - 9.4, 0.55, 0.3);
};
const medal = (cam: CamInfo, t: number, out: Stage) => {
  const got = t >= 52.0 - L2;
  bird(cam, out, { i: 0, view: "front", x: TABLE[0], y: 1.0, z: TABLE[2] + 0.1, expr: got ? "proud" : "neutral", eye: "patch", leg: "peg", medal: got, scale: 0.85, blink: t });
  stand(cam, out, { i: 60, o: GENERAL_FR, okey: "gen" }, TABLE[0] + 0.95, TABLE[2] + 0.55, { expr: got ? "grin" : "smile", prop: got ? null : "point", blink: lidAt(t, 60) });
  burst(out, t, 52.0 - L2, TABLE[0], 1.45, TABLE[2] - 0.05, 0.7, 0.35);
  for (let i = 0; i < 4; i++) stand(cam, out, dbW(i, false), TABLE[0] - 2.2 + i * 1.3, TABLE[2] + 3.0, { expr: got ? "grin" : "smile", prop: got && i % 2 ? "fist" : null, blink: lidAt(t, i) });
};
const caseBird = (cam: CamInfo, t: number, out: Stage, bow: boolean, expr: PigeonExpr) =>
  bird(cam, out, { i: 0, view: "front", x: MUSEUM[0], y: CASE_Y, z: MUSEUM[2], expr, eye: "patch", leg: "peg", medal: true, bow, grey: true, scale: 0.75, blink: 0 });
const VIS: [number, number][] = [[-1.7, -1.3], [1.6, -1.1], [-2.5, 0.6], [2.4, 0.9]];
const she = (cam: CamInfo, t: number, out: Stage) => {
  caseBird(cam, t, out, true, "neutral");
  VIS.forEach(([dx, dz], i) => {
    stand(cam, out, { i: 80 + i, o: visitor(i), okey: `vis${i}` }, MUSEUM[0] + dx, MUSEUM[2] + dz, { expr: "smile", prop: i % 2 ? "point" : null, blink: lidAt(t, 80 + i) }, 0);
    const t0 = 53.4 + i * 0.35;
    if (t >= t0) { const s = smooth((t - t0) / 0.2); out.fx.push({ key: "bubbleBow", cw: 320, ch: 260, draw: (p) => fxBubble(p, "bow"), x: MUSEUM[0] + dx + 0.3, y: 2.3, z: MUSEUM[2] + dz, w: 0.75 * s, h: 0.61 * s }); }
  });
};
const dna = (cam: CamInfo, t: number, out: Stage) => {
  stand(cam, out, { i: 90, o: SCIENTIST, okey: "sci" }, LAB[0] + 0.1, LAB[2] + 0.75, { expr: t > 57.75 ? "shock" : "neutral", look: -1, blink: lidAt(t, 90) });
  const u = q((t * 0.5) % 1, 40);
  out.fx.push({ key: `helix${u}`, cw: 300, ch: 600, draw: (p) => fxHelix(p, u), x: LAB[0] - 0.75, y: 1.75, z: LAB[2] + 0.4, w: 0.5, h: 1.0 });
  if (t > 57.75) { const s = Math.min(1, (t - 57.75) / 0.2); out.fx.push({ key: `bulb${q(s, 20)}`, cw: 300, ch: 400, draw: (p) => fxBulb(p, q(s, 20)), x: LAB[0] + 0.15, y: 2.45, z: LAB[2] + 0.7, w: 0.5, h: 0.66 }); }
};
const boy = (cam: CamInfo, t: number, out: Stage) => {
  const off = t >= 59.22 - L2;
  caseBird(cam, t, out, !off, t > 61.4 ? "wink" : off ? "proud" : "neutral");
  if (off && t < 60.4) { const u = (t - 59.2) / 1.2; out.fx.push({ key: "bow", cw: 320, ch: 260, draw: (p) => fxBubble(p, "bow"), x: MUSEUM[0] + 0.3 + 0.9 * u, y: CASE_Y + 0.75 + 1.2 * u - 2 * u * u, z: MUSEUM[2] - 0.2, w: 0.3, h: 0.24, rot: 6 * u }); }
  burst(out, t, 59.22 - L2, MUSEUM[0], CASE_Y + 0.55, MUSEUM[2] - 0.3, 0.8, 0.3);
  if (t >= 59.8) VIS.forEach(([dx, dz], i) => {
    stand(cam, out, { i: 80 + i, o: visitor(i), okey: `vis${i}` }, MUSEUM[0] + dx, MUSEUM[2] + dz, { expr: i % 2 ? "laugh" : "grin", blink: lidAt(t, 80 + i) }, 0);
    const t0 = 59.9 + i * 0.3;
    if (t >= t0) { const s = smooth((t - t0) / 0.2); out.fx.push({ key: "bubbleBoy", cw: 320, ch: 260, draw: (p) => fxBubble(p, "boy"), x: MUSEUM[0] + dx + 0.3, y: 2.3, z: MUSEUM[2] + dz, w: 0.75 * s, h: 0.61 * s }); }
  });
};

export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light;
  findSun(cam, SUN);
  ({ hook, forest, shell, radio, first, last, takeoff, hit, land, explain, leg: legShot, medal, she, dna, boy } as Record<string, (c: CamInfo, t: number, o: Stage) => void>)[s.crowd](cam, t, out);
  return out;
};
export { FPS };

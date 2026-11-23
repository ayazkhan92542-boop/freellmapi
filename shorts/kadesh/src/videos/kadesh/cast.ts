// Our cast as lit flat sprites in the 3D world (template infrastructure: canvas pool, lit cards, contact blobs,
// blinks) + the Arcole staging per shot: Napoleon, the French column, the Austrian line, the riders and trumpeters,
// the painter, the night walker. Cards, effects and blobs live on the NOINK layer.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxBurst, fxStars, fxShadow, fxContact, fxBubble, fxBulb,
  Outfit, Expr, FrontOpts, SideOpts, RAMESSES, egyptian, hittite, HITTITE_KING, nomad, SCRIBE, UN_GUARD, visitor, chariot, fxReel, fxDust, fxMotes, fxTablet,
} from "./toon";
import { FPS, SHOTS, V3, smooth, clamp01, CITY, MOUND_H, CAMP, TEMPLE, UN, HERO, raceZ, chargeZ, ARMY2_X, groundY } from "./story";
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
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing" | "horse" | "pigeon" | "chariot"; sq?: [number, number]; roll?: number; size?: [number, number, number];
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

// ================= Kadesh staging =================
export type Stage = { places: Place[]; fx: FxPlace[] };
const EG = [0, 1, 2, 3].map((v) => egyptian(v));
const HI = [0, 1, 2].map((v) => hittite(v));
const FRONT = { side: false, mirror: false };
const L2 = LEAD;
const egW = (i: number): Who => ({ i, o: EG[i % 4], okey: `eg${i % 4}` });
const hiW = (i: number): Who => ({ i: i + 300, o: HI[i % 3], okey: `hi${i % 3}` });
const RAM: Who = { i: 900, o: RAMESSES, okey: "ram" };
const KING: Who = { i: 901, o: HITTITE_KING, okey: "hking" };
const stand = (cam: CamInfo, out: Stage, who: Who, x: number, z: number, fo: FrontOpts, y = groundY(x, z), shadow = true) => {
  out.places.push(person(cam, who, x, y, z, FRONT, { mode: "stand", ...fo }, {}));
  if (shadow) blob(out, x, y, z);
};
const sit = (cam: CamInfo, out: Stage, who: Who, x: number, z: number, fo: FrontOpts) => {
  const y = groundY(x, z); out.places.push(person(cam, who, x, y, z, FRONT, { mode: "sit", ...fo }, {})); blob(out, x, y, z, 1.05);
};
const mover = (cam: CamInfo, out: Stage, who: Who, x: number, z: number, dx: number, dz: number, t: number, o: { rate?: number; expr?: Expr; run?: boolean; fo?: FrontOpts; y?: number }) => {
  const y = o.y ?? groundY(x, z), ph = q(((t * (o.rate ?? 1.6) + hh(who.i, 5)) % 1), 60), expr = o.expr ?? "stern";
  const view = viewOf(cam, x, z, dx, dz), blink = lidAt(t, who.i);
  const tl = Math.hypot(cam.pos.x - x, cam.pos.z - z) || 1, away = ((cam.pos.x - x) * dx + (cam.pos.z - z) * dz) / (tl * (Math.hypot(dx, dz) || 1)) < -0.57;
  const fo: FrontOpts = { mode: "march", phase: ph, expr, blink, lift: o.run ? 80 : 60, back: away, ...o.fo };
  const so: SideOpts = { mode: "march", phase: ph, expr, blink, stomp: o.run ? 1.3 : 1, stride: view.fs * (o.run ? 1.25 : 1), run: o.run };
  out.places.push(person(cam, who, x, y, z, view, fo, so));
  blob(out, x, y, z);
};
const once = (out: Stage, t: number, t0: number, dur: number, key: string, cw: number, ch: number, draw: (p: Pen, u: number) => void, x: number, y: number, z: number, w: number, h: number, soft = false) => {
  if (t < t0 || t >= t0 + dur) return;
  const u = q((t - t0) / dur, 30);
  out.fx.push({ key: `${key}${u}`, cw, ch, draw: (p) => draw(p, u), x, y, z, w, h, soft });
};
const burst = (out: Stage, t: number, t0: number, x: number, y: number, z: number, w = 1.0, dur = 0.25) =>
  once(out, t, t0, dur, "burst", 500, 500, (p, u) => fxBurst(p, u), x, y, z, w, w);
const bubble = (out: Stage, t: number, t0: number, icon: "far" | "scared", x: number, y: number, z: number) => {
  if (t < t0) return; const s = smooth((t - t0) / 0.2);
  out.fx.push({ key: `bub${icon}`, cw: 320, ch: 260, draw: (p) => fxBubble(p, icon), x, y, z, w: 1.0 * s, h: 0.81 * s });
};
const dustTrail = (out: Stage, t: number, x: number, z: number, dx: number, dz: number, k: number) => {
  for (let j = 0; j < 3; j++) {
    const u = q(((t * 1.6 + j / 3 + hh(k, 3)) % 1), 24);
    out.fx.push({ key: `dust${u}`, cw: 400, ch: 300, draw: (p) => fxDust(p, u), x: x - dx * (1.5 + 2.5 * u), y: 0.7 + 0.6 * u, z: z - dz * (1.5 + 2.5 * u), w: 2.2 + 2 * u, h: 1.65 + 1.5 * u, soft: true });
  }
};
const motes = (out: Stage, cam: CamInfo, t: number) => {
  for (let j = 0; j < 2; j++) {
    const s = q(((t * 0.08 + j * 0.5) % 1), 40), d = 3 + j * 2.5;
    const fx2 = cam.pos.x + (cam.right.z * -1) * 0 + cam.right.x * (s * 4 - 2), fz = cam.pos.z + cam.right.z * (s * 4 - 2);
    out.fx.push({ key: `motes${j}`, cw: 600, ch: 600, draw: (p) => fxMotes(p, j * 7), x: fx2 + (cam.right.z) * d, y: cam.pos.y + 0.2 * Math.sin(t + j), z: fz - (cam.right.x) * d, w: 3.5, h: 3.5, soft: true });
  }
};
/** a chariot card (2000 x 1400 design, 4.32 m wide); faces (dx, dz) */
const SUC = 0.00216;
const car = (cam: CamInfo, out: Stage, i: number, rider: Outfit | null, x: number, z: number, dx: number, dz: number, t: number, o: { rate?: number; expr?: Expr; egypt?: boolean; tilt?: number; dust?: boolean; scale?: number }) => {
  const sc = o.scale ?? 1, y = groundY(x, z), d = cam.pos.distanceTo(tmp.set(x, y + 1.5, z)) / sc;
  const k = d < 6 ? 0.9 : d < 14 ? 0.55 : d < 30 ? 0.3 : 0.16;
  const mirror = dx * cam.right.x + dz * cam.right.z < 0, light = light2D(cam, mirror);
  const ph = o.rate ? q(((t * o.rate + hh(i, 3)) % 1), 24) : 0, expr = o.expr ?? "stern", blink = lidAt(t, i + 600);
  const key = `C|${rider ? JSON.stringify(rider).length + (rider.hat ?? "") + rider.jacket : "none"}|${ph}|${expr}|${q(light)}|${blink}|${o.egypt ? 1 : 0}|${q(o.tilt ?? 0, 10)}`;
  out.places.push({ key, x, y, z, scale: sc, mirror, geo: "chariot", yaw: Math.atan2(cam.pos.x - x, cam.pos.z - z),
    draw: (p) => chariot(p, rider, { phase: ph, expr, blink, light, seed: (i % 7) + 1, egypt: o.egypt, tilt: o.tilt }), size: [Math.round(2000 * k), Math.round(1400 * k), k] });
  blob(out, x, y, z, 2.6 * sc);
  if (o.dust) dustTrail(out, t, x, z, dx, dz, i);
};

// ---------------- per shot ----------------
const hook = (cam: CamInfo, t: number, out: Stage) => {
  motes(out, cam, t);
  if (t < 1.6) { car(cam, out, 0, RAMESSES, HERO[0], HERO[2], 1, 0, t, { rate: 1.4, expr: "grin", egypt: true, dust: true }); return; }
  if (t < 5.65) {
    const k = clamp01((t - 1.62) / 0.3);
    car(cam, out, 0, null, HERO[0] + 5.6, HERO[2] + 0.3, 1, 0, t, { egypt: true, tilt: -70 * k });
    sit(cam, out, RAM, HERO[0] + 4.2, HERO[2] - 0.6, { expr: k < 1 ? "shock" : "dazed", blink: 0 });
    once(out, t, 1.62, 1.2, "dust", 400, 300, (p, u) => fxDust(p, u), HERO[0] + 5, 1.0, HERO[2], 4.5, 3.4, true);
    if (t > 2.0) { const u = q(((t - 2) * 0.9) % 1, 30); out.fx.push({ key: `stars${u}`, cw: 420, ch: 210, draw: (p) => fxStars(p, u), x: HERO[0] + 4.2, y: 1.85, z: HERO[2] - 0.6, w: 0.9, h: 0.45 }); }
    return;
  }
  for (let k = 0; k < 2; k++) stand(cam, out, { i: 950 + k, o: SCRIBE, okey: "scribe" }, TEMPLE[0] - 2.4 + k * 4.6, TEMPLE[2] + 8.6, { expr: "smile", prop: ["knife", q((t * 1.6 + k * 0.3) % 1, 30)], blink: lidAt(t, 950 + k) });
  if (t >= 7.7) for (let k = 0; k < 3; k++) burst(out, t, 7.7 + k * 0.18, TEMPLE[0] - 2 + k * 2, 5.5 + k * 0.7, TEMPLE[2] + 9.6, 1.6, 0.35);
};
const marchShot = (cam: CamInfo, t: number, out: Stage) => {
  motes(out, cam, t);
  if (t < 13.6) return;
  const z = -40 + 1.3 * (t - 13.67);
  car(cam, out, 0, RAMESSES, 0, z + 4.5, 0, 1, t, { rate: 0.7, expr: "stern", egypt: true });
  for (let i = 0; i < 24; i++) { const r = Math.floor(i / 3), x = (i % 3 - 1) * 1.1, zz = z + 0.5 - r * 1.4 - Math.floor(r / 2) * 0.8; mover(cam, out, egW(i), x, zz, 0, 1, t, { rate: 1.0, expr: i % 3 ? "stern" : "smile" }); }
};
const nomads = (cam: CamInfo, t: number, out: Stage) => {
  const [cx, , cz] = CAMP;
  stand(cam, out, RAM, cx + 0.8, cz + 0.4, { expr: t > 20.9 ? "grin" : "smile", blink: lidAt(t, 900) });
  for (let k = 0; k < 2; k++) {
    const u = clamp01((t - 17.1 - k * 0.3) / 2.0), x = cx - 7 + (6.2 - k * 1.0) * u, z = cz - 0.2 + k * 0.5;
    const who: Who = { i: 960 + k, o: nomad(k), okey: `nom${k}` };
    if (u < 1) mover(cam, out, who, x, z, 1, 0, t, { rate: 1.0, expr: "smile" }); else stand(cam, out, who, x, z, { expr: t > 21 ? "grin" : "smile", prop: k === 0 && t > 20.2 ? "point" : null, blink: lidAt(t, 960 + k) });
  }
  bubble(out, t, 21.0, "far", cx - 0.6, 2.6, cz - 0.3);
  bubble(out, t, 22.1, "scared", cx - 1.7, 2.7, cz + 0.2);
  for (let i = 0; i < 4; i++) stand(cam, out, egW(i + 30), cx + 2.6 + i * 1.1, cz + 2.4 + (i % 2) * 0.8, { expr: "stern", blink: lidAt(t, i + 30) });
};
const race = (cam: CamInfo, t: number, out: Stage) => {
  motes(out, cam, t);
  const [cx, , cz] = CAMP;
  if (t < 25.0) { stand(cam, out, RAM, cx, cz + 0.5, { expr: t > 23.9 ? "laugh" : "grin", prop: "fist", blink: lidAt(t, 900) }); return; }
  if (t < 27.53) {
    const z = raceZ(t);
    car(cam, out, 0, RAMESSES, 0, z + 2.5, 0, 1, t, { rate: 2.2, expr: "laugh", egypt: true, dust: true });
    for (let i = 0; i < 9; i++) mover(cam, out, egW(i), (i % 3 - 1) * 1.2, z - 2 - Math.floor(i / 3) * 1.5, 0, 1, t, { run: true, rate: 1.9, expr: "nervous" });
    return;
  }
  for (let i = 0; i < 6; i++) stand(cam, out, egW(i + 40), cx - 3 + (i % 3) * 3, cz - 1 + Math.floor(i / 3) * 4, { expr: "smile", blink: lidAt(t, i + 40) });
};
const spies = (cam: CamInfo, t: number, out: Stage) => {
  const [cx, , cz] = CAMP, rev = t >= 29.2 - L2;
  for (let k = 0; k < 2; k++) {
    const who: Who = rev ? { i: 970 + k, o: hittite(k, { rifle: false }), okey: `hiS${k}` } : { i: 960 + k, o: nomad(k), okey: `nom${k}` };
    stand(cam, out, who, cx + 7.6 + k * 0.9, cz - 6.3 + k * 0.2, { expr: rev ? (k ? "grin" : "laugh") : "smile_closed", look: rev ? 0 : -1, blink: lidAt(t, 960 + k) });
    once(out, t, 29.15, 0.35, "dust", 400, 300, (p, u) => fxDust(p, u), cx + 7.6 + k * 0.9, 1.0, cz - 6.5 + k * 0.2, 1.6, 1.2, true);
  }
};
const charge = (cam: CamInfo, t: number, out: Stage) => {
  motes(out, cam, t);
  if (t < 33.7) {
    for (let i = 0; i < 12; i++) {
      const lag = (i % 4) * 0.25 + Math.floor(i / 4) * 0.4, z = chargeZ(t - lag), x = 4 + (i % 4) * 4.5 + Math.floor(i / 4) * 2 - 0.45 * (70 - z);
      if (z > 82) continue;
      car(cam, out, 10 + i, hittite(i % 3), x, z, -0.45, -1, t, { rate: 2.4, expr: i % 2 ? "laugh" : "grin", dust: true });
    }
    return;
  }
  for (let i = 0; i < 18; i++) {
    const r = Math.floor(i / 3), x = ARMY2_X + (i % 3 - 1) * 1.1, z = 2 + r * 1.4;
    const hitT = 33.8 + (r % 3) * 0.15 + (i % 3) * 0.05;
    if (t < hitT) mover(cam, out, egW(i), x, z, 0, 1, t, { rate: 1.0, expr: "neutral" });
    else { const u = clamp01((t - hitT) / 0.5); out.places.push(person(cam, egW(i), x - 1.5 * u, 1.2 * Math.sin(Math.PI * u), z, FRONT, { mode: "fall", expr: "shock", tilt: (i % 2 ? 1 : -1) * 80 * u }, {})); }
  }
  for (let k = 0; k < 3; k++) {
    const x = ARMY2_X + 14 - 16 * (t - 33.6 - k * 0.2), z = 4 + k * 3;
    car(cam, out, 20 + k, hittite(k), x, z, -1, 0, t, { rate: 2.6, expr: "laugh", dust: true });
  }
};
const campCrash = (cam: CamInfo, t: number, out: Stage) => {
  const [cx, , cz] = CAMP;
  car(cam, out, 30, hittite(1), cx + 9 - 9.5 * (t - 35.95), cz + 0.6, -1, 0, t, { rate: 2.6, expr: "laugh", dust: true });
  for (let i = 0; i < 6; i++) mover(cam, out, egW(i + 50), cx - 2 - (i % 3) * 1.4 - 3 * Math.max(0, t - 36.4), cz - 2 + Math.floor(i / 3) * 3, -1, 0, t, { run: true, rate: 2, expr: "shock" });
};
const legend = (cam: CamInfo, t: number, out: Stage) => {
  if (t < 40.8) {
    const [cx, , cz] = CAMP;
    stand(cam, out, RAM, cx, cz + 2, { expr: t > 39.6 ? "shock" : "stern", look: t > 39.6 ? (Math.floor(t * 3) % 2 ? 1 : -1) : 0, blink: lidAt(t, 900) });
    for (let i = 0; i < 10; i++) {
      const run = t > 38.9 + (i % 4) * 0.08, x = cx - 4 + (i % 5) * 2, z0 = cz + 4 + Math.floor(i / 5) * 1.6;
      if (run) mover(cam, out, egW(i), x + (i % 2 ? 0.5 : -0.5) * (t - 38.9), z0 + 4.2 * (t - 38.9), 0, 1, t, { run: true, rate: 2, expr: "shock" });
      else stand(cam, out, egW(i), x, z0, { expr: "nervous", blink: lidAt(t, i) });
    }
    return;
  }
  const x = HERO[0] + 2.2 * (t - 40.8);
  car(cam, out, 0, RAMESSES, x, HERO[2], 1, 0, t, { rate: 2.4, expr: "stern", egypt: true, dust: true });
  const g = q(((t * 2) % 1), 20);
  out.fx.push({ key: `glow${g}`, cw: 500, ch: 500, draw: (p) => fxBurst(p, g, "#fff3b0", 14, 60, 240), x: x - 0.6, y: 2.4, z: HERO[2] - 0.2, w: 3.4, h: 3.4 });
  for (let i = 0; i < 24; i++) stand(cam, out, hiW(i), HERO[0] + 11 + (i % 6) * 1.2 + hh(i) * 0.4, HERO[2] - 2 + Math.floor(i / 6) * 1.3, { expr: t > 42.5 ? "shock" : "nervous", blink: lidAt(t, i + 300) });
};
const rescue = (cam: CamInfo, t: number, out: Stage) => {
  motes(out, cam, t);
  for (let i = 0; i < 21; i++) { const r = Math.floor(i / 7), x = -6 + (i % 7) * 2 + hh(i) * 0.4, z = -40 - r * 1.6 - 2.2 * (t - 43.8); mover(cam, out, egW(i), x, z, 0, -1, t, { rate: 1.6, expr: i % 3 ? "grin" : "stern", fo: i === 3 ? { prop: "fist" } : undefined }); }
};
const draw = (cam: CamInfo, t: number, out: Stage) => {
  if (t < 50.45) {
    const sitters: [number, number, number][] = [[-2.4, 31, 0], [-1.0, 33, 1], [0.6, 31.6, 0], [2.0, 33.4, 1], [3.2, 31.2, 0], [-3.4, 33.6, 1]];
    sitters.forEach(([x, z, h], i) => sit(cam, out, h ? hiW(i) : egW(i), x, z, { expr: i % 2 ? "dazed" : "pained", blink: lidAt(t, i) }));
    stand(cam, out, RAM, 0.2, 30.2, { expr: "nervous", prop: t > 48.4 ? "shrug" : null, blink: lidAt(t, 900) });
    return;
  }
  const wz = CITY[2] - 22 + 0.4, wy = MOUND_H + 4.2;
  stand(cam, out, KING, 0, wz, { expr: "laugh", prop: "fist", blink: lidAt(t, 901) }, wy, false);
  for (let k = 0; k < 4; k++) stand(cam, out, hiW(k + 40), -3 + k * 2 + (k > 1 ? 0.8 : 0), wz, { expr: "grin", prop: k % 2 ? "point" : "fist", blink: lidAt(t, k + 340) }, wy, false);
};
const feed = (cam: CamInfo, t: number, out: Stage) => {
  if (t >= 55.4) return;
  stand(cam, out, RAM, TEMPLE[0] - 3.0, TEMPLE[2] - 1.6, { expr: "smile", prop: "point", blink: lidAt(t, 900) });
  stand(cam, out, { i: 950, o: SCRIBE, okey: "scribe" }, TEMPLE[0] - 4.3, TEMPLE[2] - 1.2, { expr: "neutral", prop: ["knife", q((t * 1.6) % 1, 30)], blink: lidAt(t, 950) });
};
const reel = (cam: CamInfo, t: number, out: Stage) => {
  const torn = smooth((t - 59.85) / 0.8);
  out.fx.push({ key: `reel${q(torn, 30)}`, cw: 1800, ch: 700, draw: (p) => fxReel(p, q(torn, 30)), x: TEMPLE[0], y: 3.0, z: TEMPLE[2] + 0.6, w: 4.6, h: 1.79 });
};
const carve = (cam: CamInfo, t: number, out: Stage) => {
  for (let k = 0; k < 4; k++) {
    const y = k < 2 ? 0 : 3.05, x = TEMPLE[0] + 3.6 + k * 1.3;
    stand(cam, out, { i: 950 + k, o: SCRIBE, okey: "scribe" }, x, TEMPLE[2] + 8.7, { expr: k % 2 ? "grin" : "smile", prop: ["knife", q((t * 1.7 + k * 0.25) % 1, 30)], blink: lidAt(t, 950 + k) }, y, k < 2);
  }
  if (t > 67.7) for (let k = 0; k < 3; k++) burst(out, t, 67.7 + k * 0.15, TEMPLE[0] - 3 + k * 3, 4 + k, TEMPLE[2] + 9.5, 2.0, 0.35);
};
const treaty = (cam: CamInfo, t: number, out: Stage) => {
  const [cx, , cz] = CAMP;
  stand(cam, out, RAM, cx - 0.85, cz + 0.8, { expr: "smile", prop: "hold", blink: lidAt(t, 900), facing: 1 });
  stand(cam, out, KING, cx + 0.85, cz + 0.8, { expr: "smile", prop: "hold", blink: lidAt(t, 901), facing: -1 });
  out.fx.push({ key: "tablet", cw: 500, ch: 640, draw: fxTablet, x: cx, y: 1.05, z: cz + 0.55, w: 0.42, h: 0.54 });
  burst(out, t, 71.25 - L2, cx, 1.3, cz + 0.4, 0.9, 0.4);
};
const un = (cam: CamInfo, t: number, out: Stage) => {
  stand(cam, out, { i: 980, o: UN_GUARD, okey: "guard" }, UN[0] + 3.2, UN[2] + 4.6, { expr: "neutral", blink: lidAt(t, 980) }, 0);
  for (let i = 0; i < 5; i++) { const x = UN[0] - 4 + i * 1.8 + 0.5 * (t - 74), z = UN[2] + 1.5 + (i % 2) * 1.2; mover(cam, out, { i: 985 + i, o: visitor(i), okey: `vis${i}` }, x, z, 1, 0, t, { rate: 0.9, expr: i % 2 ? "smile" : "neutral", y: 0 }); }
};

export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light;
  findSun(cam, SUN);
  ({ hook, march: marchShot, nomads, race, spies, charge, camp: campCrash, legend, rescue, draw, feed, reel, carve, treaty, un } as Record<string, (c: CamInfo, t: number, o: Stage) => void>)[s.crowd](cam, t, out);
  return out;
};
export { FPS };

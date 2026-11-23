// Our own flat 2D cartoon cast (riflemen, officer, townsfolk, kid, parent) + 2D effects, drawn on a canvas.
// Construction v2 (characters.md, our own cast): superellipse heads (pointed crown 1.75 / full jaw 2.3, chin taper,
// seeded side bulge + tilt), bean torsos, single-stroke limbs with ink-dot hands, a thick-thin plum outline weighted
// away from the light, soft painted crescents, deadpan lidded eyes, no blush, no catchlights.
// Design space 600 x 1000 units (soles at y = 975); the canvas transform scales it.
export const INK = "#241726";
export const SKIN = "#ffe2c2";
const WHITE = "#ffffff";
const MOUTH = "#5a1e28";
const TONGUE = "#e86e78";
type C3 = [number, number, number];
const SH_SKIN: C3 = [0.96, 0.86, 0.84]; // measured shadow/lit ratio on skin heads
const SH_CLOTH: C3 = [0.64, 0.66, 0.74]; // torsos: lit side -> far side ~0.65
const SH_FELT: C3 = [0.62, 0.62, 0.7];

export type Build = "adult" | "stout" | "kid";
export type Outfit = {
  jacket: string; pants: string; boots: string; hat?: string | null; belt?: string | null; buttons?: string; rifle?: boolean;
  sash?: string; sword?: boolean; moustache?: string; skin?: string; head?: number; cap?: string; hair?: string; dress?: string; mud?: boolean;
  spear?: boolean; collar?: string; beard?: string;
  build?: Build;
};
type P2 = [number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const mul = (c: string, m: C3) => {
  const n = parseInt(c.slice(1), 16);
  const ch = (v: number, k: number) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255, m[0])}${ch((n >> 8) & 255, m[1])}${ch(n & 255, m[2])}`;
};
export const shade = (c: string, k: number) => mul(c, [k, k, k]);
export const mix = (a: string, b: string, t: number) => {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
};
/** deterministic per-character random in [0, 1) */
const rnd = (seed: number, k: number) => { const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const rotPts = (pts: P2[], a: number, cx: number, cy: number): P2[] =>
  pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
const rotAbout = (q: P2, a: number, c: P2): P2 => rotPts([q], a, c[0], c[1])[0];
const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** smooth curve from a through (near) k to b, as a polyline */
const curve = (a: P2, k: P2, b: P2, n = 10): P2[] => {
  const c: P2 = [2 * k[0] - (a[0] + b[0]) / 2, 2 * k[1] - (a[1] + b[1]) / 2], out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    out.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]);
  }
  return out;
};

export const RIFLEMAN: Outfit = { jacket: "#357650", pants: "#3d4440", boots: INK, hat: "shako", belt: "#f1efe6", buttons: "#d9dde0", rifle: true };
export const OFFICER: Outfit = { ...RIFLEMAN, hat: "shako_tall", buttons: "#e8c45a", sash: "#c0353a", sword: true, moustache: "#4a3020", rifle: false, belt: null, build: "stout" };
export const KID: Outfit = { jacket: "#f08a2c", pants: "#3b5b9a", boots: "#f4f1ea", hat: "cap", cap: "#e2453c", build: "kid" };
export const PARENT: Outfit = { jacket: "#7b5ac9", pants: "#3b3f52", boots: "#5a3b2a", hat: "hair", hair: "#5a3b2a" };
export const SKINS = [SKIN, "#f5c9a0", "#ecd0b6", "#c99067"];

export const soldier = (v = 0, extra: Partial<Outfit> = {}): Outfit => {
  const o: Outfit = { ...RIFLEMAN, skin: SKINS[v % 4] };
  if (v % 4 === 1) o.moustache = "#4a3426";
  if (v % 4 === 3) o.moustache = "#2a201a";
  return { ...o, ...extra };
};

export const townsfolk = (v = 0): Outfit => {
  const coats = ["#3f6fb5", "#8c3b4a", "#5d7a3a", "#b5653f", "#2f5f6a", "#7b5ac9"];
  const o: Outfit = { jacket: coats[v % 6], pants: "#3b3f52", boots: "#4a3426", skin: SKINS[v % 4] };
  return v % 2 ? { ...o, hat: "bonnet", dress: ["#d9a441", "#c25a7a", "#5a8fc2"][v % 3] } : { ...o, hat: "tophat" };
};

export class Pen {
  g: CanvasRenderingContext2D;
  ol = 12;
  /** [angle, cx, cy] rotation about (cx, cy), optional post-translation [.., dx, dy] */
  rot: number[] | null = null;
  constructor(g: CanvasRenderingContext2D) { this.g = g; }
  P(x: number, y: number): P2 {
    if (!this.rot) return [x, y];
    const r = this.rot, a = r[0], cx = r[1], cy = r[2], dx = r.length > 3 ? r[3] : 0, dy = r.length > 4 ? r[4] : 0, c = Math.cos(a), s = Math.sin(a);
    return [cx + (x - cx) * c - (y - cy) * s + dx, cy + (x - cx) * s + (y - cy) * c + dy];
  }
  path(pts: P2[], close: boolean) {
    const g = this.g;
    g.beginPath();
    pts.forEach((p, i) => { const [x, y] = this.P(p[0], p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    if (close) g.closePath();
  }
  /** filled shape with an ink outline; fill=null draws the outline only */
  poly(pts: P2[], fill: string | null, ol?: number) {
    const g = this.g, w = ol ?? this.ol;
    this.path(pts, true);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (w) { g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke(); }
  }
  ell(cx: number, cy: number, rx: number, ry: number, fill: string | null, ol?: number, a0 = 0, a1 = 360, rot = 0) {
    this.poly(ellPts(cx, cy, rx, ry, a0, a1, rot), fill, ol);
  }
  /** thick round-capped limb with an ink rim (effects, rope) */
  line(pts: P2[], fill: string, w: number, ink = true) {
    const g = this.g;
    g.lineCap = "round"; g.lineJoin = "round";
    if (ink) { this.path(pts, false); g.strokeStyle = INK; g.lineWidth = w + 2 * this.ol * 0.9; g.stroke(); }
    this.path(pts, false); g.strokeStyle = fill; g.lineWidth = w; g.stroke();
  }
  stroke(pts: P2[], w: number, fill = INK) {
    const g = this.g;
    g.lineCap = "round"; g.lineJoin = "round";
    this.path(pts, false); g.strokeStyle = fill; g.lineWidth = w; g.stroke();
  }
  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w: number, fill = INK) {
    const pts: P2[] = [];
    for (let i = 0; i <= 24; i++) pts.push([cx + rx * Math.cos(rad(a0 + ((a1 - a0) * i) / 24)), cy + ry * Math.sin(rad(a0 + ((a1 - a0) * i) / 24))]);
    this.stroke(pts, w, fill);
  }
  dot(cx: number, cy: number, r: number, fill = INK) {
    const [x, y] = this.P(cx, cy);
    this.g.beginPath(); this.g.arc(x, y, r, 0, Math.PI * 2); this.g.fillStyle = fill; this.g.fill();
  }
  /** draw with a closed shape as clip */
  clip(pts: P2[], fn: () => void) { const g = this.g; g.save(); this.path(pts, true); g.clip(); fn(); g.restore(); }
  /** flat fill + soft crescent on the side away from the light (light = canvas angle the light comes FROM).
   *  Radial ramp centred `shift` R toward the light: flat out to ~0.6 R on the far side, full shadow by ~0.8 R. */
  shadedFill(pts: P2[], base: string, shadow: string, light: number, R: number, shift = 0.45, r0 = 1.05, r1 = 1.25) {
    const g = this.g, n = pts.length;
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x / n; cy += y / n; }
    const [gx, gy] = this.P(cx + Math.cos(light) * shift * R, cy + Math.sin(light) * shift * R);
    const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r1 * R);
    gr.addColorStop(0, base); gr.addColorStop(r0 / r1, base); gr.addColorStop(1, shadow);
    this.path(pts, true); g.fillStyle = gr; g.fill();
  }
  /** broad gradient across a shape along the light: lit edge = base, far edge = shadow (torsos, coats) */
  gradFill(pts: P2[], base: string, shadow: string, light: number, flat = 0.22) {
    const g = this.g, dx = Math.cos(light), dy = Math.sin(light), n = pts.length;
    let cx = 0, cy = 0, lo = Infinity, hi = -Infinity;
    for (const [x, y] of pts) { cx += x / n; cy += y / n; const d = x * dx + y * dy; lo = Math.min(lo, d); hi = Math.max(hi, d); }
    const dc = cx * dx + cy * dy;
    const [ax, ay] = this.P(cx + dx * (hi - dc), cy + dy * (hi - dc)), [bx, by] = this.P(cx + dx * (lo - dc), cy + dy * (lo - dc));
    const gr = g.createLinearGradient(ax, ay, bx, by);
    gr.addColorStop(0, base); gr.addColorStop(flat, base); gr.addColorStop(1, shadow);
    this.path(pts, true); g.fillStyle = gr; g.fill();
  }
  /** thick-thin ink ring: w(θ) = w0 (1 + k cos(θ − thick)), θ from the contour centroid (canvas angles) */
  inkRing(pts: P2[], w0: number, thick: number, k = 0.45, col = INK) {
    const n = pts.length;
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x / n; cy += y / n; }
    const out: P2[] = [], inn: P2[] = [];
    pts.forEach((q, i) => {
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      let nx = b[1] - a[1], ny = a[0] - b[0]; // outward normal for clockwise-on-screen contours
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const h = 0.5 * w0 * (1 + k * Math.cos(Math.atan2(q[1] - cy, q[0] - cx) - thick));
      out.push([q[0] + nx * h, q[1] + ny * h]); inn.push([q[0] - nx * h, q[1] - ny * h]);
    });
    const g = this.g;
    const trace = (r: P2[]) => { r.forEach(([x0, y0], i) => { const [x, y] = this.P(x0, y0); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); };
    g.beginPath(); trace(out); trace(inn.reverse());
    g.fillStyle = col; g.fill("evenodd");
  }
  /** flat strap with a thin ink rim (cross belts, sash, rifle, handles) */
  band(pts: P2[], fill: string, w: number, rim: number, cap: CanvasLineCap = "butt") {
    const g = this.g; g.lineCap = cap; g.lineJoin = "round";
    this.path(pts, false); g.strokeStyle = INK; g.lineWidth = w + 2 * rim; g.stroke();
    this.path(pts, false); g.strokeStyle = fill; g.lineWidth = w; g.stroke();
    g.lineCap = "round";
  }
}

const ellPts = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360, rot = 0, n = 48): P2[] => {
  const r = rad(rot), pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), x = rx * Math.cos(a), y = ry * Math.sin(a);
    pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
  }
  return pts;
};

const rrect = (x0: number, y0: number, x1: number, y1: number, r: number, n = 8): P2[] => {
  const pts: P2[] = [];
  for (const [cx, cy, a] of [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]])
    for (let i = 0; i <= n; i++) pts.push([cx + r * Math.cos(rad(a + (90 * i) / n)), cy + r * Math.sin(rad(a + (90 * i) / n))]);
  return pts;
};

/** tapered stroke, thick end at a: brows, moustache halves */
const taper = (p: Pen, a: P2, b: P2, wa: number, wb: number, col = INK) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  p.poly([[a[0] + nx * wa / 2, a[1] + ny * wa / 2], [b[0] + nx * wb / 2, b[1] + ny * wb / 2],
    [b[0] - nx * wb / 2, b[1] - ny * wb / 2], [a[0] - nx * wa / 2, a[1] - ny * wa / 2]], col, 0);
  p.dot(a[0], a[1], wa / 2, col); p.dot(b[0], b[1], wb / 2, col);
};

// ---------------- contours ----------------
export type Blob = { a: number; b: number; nTop: number; nBot: number; egg: number; asym: number; rot: number; noise: number; seed: number };

/** superellipse "bean": separate crown / jaw exponents, egg taper (neg = narrower chin), one-side bulge, soft noise.
 *  Points run right -> down -> left -> up (clockwise on screen). */
export const blobPts = (cx: number, cy: number, B: Blob, n = 72): P2[] => {
  const ph = [rnd(B.seed, 11), rnd(B.seed, 12), rnd(B.seed, 13)].map((v) => v * Math.PI * 2);
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), e = 2 / (s < 0 ? B.nTop : B.nBot);
    let X = Math.sign(c) * Math.abs(c) ** e;
    const Y = Math.sign(s) * Math.abs(s) ** e;
    X *= (1 + B.egg * Y) * (1 + B.asym * Math.sign(X));
    const r = 1 + B.noise * (Math.cos(2 * t + ph[0]) + 0.7 * Math.cos(3 * t + ph[1]) + 0.5 * Math.cos(4 * t + ph[2]));
    const x = B.a * X * r, y = B.b * Y * r;
    pts.push([cx + x * Math.cos(B.rot) - y * Math.sin(B.rot), cy + x * Math.sin(B.rot) + y * Math.cos(B.rot)]);
  }
  return pts;
};

/** measured head: H/W 0.94, slightly pointed crown (1.75), fuller jaw (2.3), chin taper -0.12, 8 % bulge to the facing side */
export const headBlob = (seed: number, a = 118, facing = 0): Blob => ({
  a, b: a * (0.94 + 0.08 * (rnd(seed, 1) - 0.5)),
  nTop: 1.75 + 0.3 * (rnd(seed, 2) - 0.5), nBot: 2.3 + 0.3 * (rnd(seed, 3) - 0.5),
  egg: -0.12 + 0.06 * (rnd(seed, 4) - 0.5),
  asym: (0.06 + 0.04 * rnd(seed, 5)) * (facing || (rnd(seed, 6) < 0.5 ? -1 : 1)),
  rot: rad(8 * (rnd(seed, 7) - 0.5)), noise: 0.008, seed,
});

/** thickest outline direction: away from the light, pulled toward the ground (64 deg measured for upper-left light) */
export const thickAngle = (light: number) => Math.atan2(-Math.sin(light) + 0.8, -Math.cos(light));
const DEF_LIGHT = rad(-120);

// ---------------- faces ----------------
export type Expr = "neutral" | "stern" | "grin" | "laugh" | "whistle" | "nervous" | "shock" | "relief" | "relief_open" | "dazed"
  | "pained" | "smile" | "smile_closed" | "lick";
type EyeK = "dot" | "small" | "lid" | "slit" | "happy" | "dash" | "squeeze" | "shock" | "shockHalf" | "spiral";
type MouthK = "dash" | "frown" | "smirk" | "smile" | "smileWide" | "grin" | "laugh" | "o" | "O" | "wave" | "teeth" | "lick";
/** eyes [back, front], brows [inner, outer] offsets in u (+ = down), mouth kind */
const FACE: Record<Expr, { eye: [EyeK, EyeK]; brow: [number, number]; mouth: MouthK }> = {
  neutral: { eye: ["lid", "lid"], brow: [0, -1], mouth: "dash" },
  stern: { eye: ["lid", "lid"], brow: [3, -2], mouth: "frown" },
  grin: { eye: ["happy", "happy"], brow: [-3, -3], mouth: "grin" },
  laugh: { eye: ["squeeze", "squeeze"], brow: [-4, -4], mouth: "laugh" },
  whistle: { eye: ["dash", "dash"], brow: [-2, -4], mouth: "o" },
  nervous: { eye: ["small", "small"], brow: [-3, 2], mouth: "wave" },
  shock: { eye: ["shock", "shock"], brow: [-7, -6], mouth: "O" },
  relief: { eye: ["happy", "happy"], brow: [-2, 1], mouth: "smileWide" },
  relief_open: { eye: ["happy", "happy"], brow: [-2, 1], mouth: "grin" },
  dazed: { eye: ["spiral", "spiral"], brow: [-3, 2], mouth: "wave" },
  pained: { eye: ["squeeze", "lid"], brow: [-3, 2], mouth: "teeth" },
  smile: { eye: ["dot", "dot"], brow: [0, -1], mouth: "smirk" },
  smile_closed: { eye: ["happy", "happy"], brow: [0, -1], mouth: "smile" },
  lick: { eye: ["dot", "dot"], brow: [0, -1], mouth: "lick" },
};
const halfLid = (k: EyeK): EyeK => (k === "dot" || k === "small" ? "lid" : k === "lid" ? "slit" : k === "shock" ? "shockHalf" : k);
const eyeKind = (k: EyeK, lid: number): EyeK =>
  lid >= 1 && k !== "happy" && k !== "squeeze" && k !== "spiral" ? "dash" : lid > 0 ? halfLid(k) : k;
const lidOf = (b: boolean | number | undefined) => (b === true ? 1 : Number(b) || 0);

const eye = (p: Pen, kind: EyeK, x: number, ey: number, u: number, side: number, look: number, skin: string) => {
  const lx = x + look * 3 * u, lw = 3.8 * u;
  switch (kind) {
    case "dot": p.ell(lx, ey, 3.8 * u, 5.5 * u, INK, 0); break;
    case "small": p.ell(lx, ey, 3 * u, 4.4 * u, INK, 0); break;
    case "lid": p.ell(lx, ey - u, 7 * u, 6 * u, INK, 0, 0, 180); p.stroke([[x - 9 * u, ey - u], [x + 9 * u, ey - u]], lw); break;
    case "slit": p.ell(lx, ey, 7 * u, 2.6 * u, INK, 0, 0, 180); p.stroke([[x - 9 * u, ey], [x + 9 * u, ey]], lw); break;
    case "happy": p.arc(x, ey + 3 * u, 8 * u, 6 * u, 200, 340, lw); break;
    case "dash": p.stroke([[x - 8.5 * u, ey], [x + 8.5 * u, ey]], lw); break;
    case "squeeze": p.stroke([[x + 6 * u * side, ey - 5 * u], [x - 6 * u * side, ey], [x + 6 * u * side, ey + 5 * u]], lw); break;
    case "shock": case "shockHalf":
      p.ell(x, ey, 11 * u, 11 * u, WHITE, 2.6 * u); p.dot(lx - side * 1.5 * u, ey + 1.5 * u, 3 * u);
      if (kind === "shockHalf") { p.ell(x, ey, 11 * u, 11 * u, skin, 0, 180, 360); p.stroke([[x - 11 * u, ey], [x + 11 * u, ey]], 2.6 * u); }
      break;
    default: {
      const s: P2[] = [];
      for (let t = 1; t < 15; t++) s.push([x + Math.cos(t * 0.9) * t * 0.55 * u, ey + Math.sin(t * 0.9) * t * 0.55 * u]);
      p.stroke(s, 2.4 * u);
    }
  }
};

/** open "D" mouth with a white teeth band (+ tongue) */
const dmouth = (p: Pen, mx: number, y: number, rx: number, ry: number, u: number, tongue = false) => {
  p.ell(mx, y, rx, ry, MOUTH, 0, 0, 180);
  p.clip([[mx - rx, y], [mx + rx, y], [mx + rx, y + 3 * u], [mx - rx, y + 3 * u]], () => p.ell(mx, y, rx, ry, WHITE, 0, 0, 180));
  if (tongue) p.ell(mx + 2 * u, y + 0.62 * ry, 0.4 * rx, 0.28 * ry, TONGUE, 0);
  p.ell(mx, y, rx, ry, null, 3 * u, 0, 180);
};

const mouth = (p: Pen, kind: MouthK, mx: number, my: number, u: number, k = 1) => {
  const mw = 4 * u;
  switch (kind) {
    case "dash": p.stroke([[mx - 5.5 * u * k, my], [mx + 5.5 * u * k, my - 0.8 * u]], mw); break;
    case "frown": p.arc(mx, my + 3 * u, 6.5 * u * k, 3.5 * u, 200, 340, mw); break;
    case "smirk": p.arc(mx + u, my - 3 * u, 7 * u * k, 4 * u, 10, 150, mw); break;
    case "smile": p.arc(mx, my - 3 * u, 8 * u * k, 4.5 * u, 20, 160, mw); break;
    case "smileWide": p.arc(mx, my - 4 * u, 11 * u * k, 6 * u, 15, 165, mw); break;
    case "grin": dmouth(p, mx, my - u, 12 * u * k, 8 * u, u); break;
    case "laugh": dmouth(p, mx, my, 16 * u * k, 11 * u, u, true); break;
    case "o": p.ell(mx + 4 * u, my, 3.5 * u, 4 * u, MOUTH, 2.8 * u); break;
    case "O": p.ell(mx, my + 2 * u, 9 * u * k, 11 * u, MOUTH, 3.2 * u); break;
    case "wave": { const s: P2[] = []; for (let i = 0; i <= 12; i++) s.push([mx - 9 * u * k + i * 1.5 * u * k, my + 1.5 * u * Math.sin(i * 1.3)]); p.stroke(s, 3 * u); break; }
    case "teeth":
      p.poly([[mx - 12 * u * k, my - 4 * u], [mx + 12 * u * k, my - 4 * u], [mx + 11 * u * k, my + 4 * u], [mx - 11 * u * k, my + 4 * u]], WHITE, 3 * u);
      for (const j of [-1, 0, 1]) p.stroke([[mx + j * 6 * u * k, my - 4 * u], [mx + j * 6 * u * k, my + 4 * u]], 1.5 * u);
      break;
    case "lick": p.arc(mx, my - 3 * u, 8 * u * k, 4.5 * u, 20, 160, mw); p.ell(mx + 6 * u * k, my + 3 * u, 3.6 * u, 4.6 * u, TONGUE, 2.4 * u); break;
  }
};

/** face v2 (front / 3-4). u = 1 % of the head path width W. Eyes 26u apart on the centre line, brows 20u up, mouth 20u
 *  down, everything slid toward the facing side. No blush, no catchlights. */
const faceFront = (p: Pen, cx: number, cy: number, W: number, expr: Expr, facing: number, look: number, lid: number, brim: boolean,
  skin: string, moustache?: string, stout = false) => {
  const u = W / 100, F = FACE[expr], fx = cx + 7 * u * facing;
  const ex = (F.eye[0] === "shock" ? 12 : 13) * u, ey = cy;
  for (const side of [-1, 1]) {
    const x = fx + side * ex;
    const kind = eyeKind(F.eye[(facing ? side === facing : side > 0) ? 1 : 0], lid);
    eye(p, kind, x, ey, u, side, look, skin);
    const [dI, dO] = F.brow, by = ey - (brim ? 17 : 20) * u;
    if (kind === "shock" || kind === "shockHalf") p.arc(x, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
    else taper(p, [x - side * 8.5 * u, by + dI * u], [x + side * 8.5 * u, by + dO * u], 5 * u, 2.5 * u);
  }
  const mx = cx + 8 * u * facing, my = cy + 20 * u;
  mouth(p, F.mouth, mx, my, u);
  if (moustache) for (const s of [-1, 1])
    taper(p, [mx + s * 1.5 * u, cy + 12.5 * u], [mx + s * (stout ? 19 : 15) * u, cy + (stout ? 10.5 : 15) * u], stout ? 5.5 * u : 4.5 * u, 1.6 * u, moustache);
  if (expr === "nervous") p.ell(cx + 40 * u * (facing || 1), cy - 22 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
};

/** profile face (facing screen-right): one eye, brow, nose tick, mouth near the front edge; no skin bump nose, no ear */
const faceSide = (p: Pen, hx: number, hy: number, W: number, expr: Expr, lid: number, brim: boolean, skin: string, moustache?: string, stout = false) => {
  const u = W / 100, F = FACE[expr], ex = hx + 27 * u, ey = hy;
  const kind = eyeKind(F.eye[1], lid);
  eye(p, kind, ex, ey, u, 1, 0.6, skin);
  const by = ey - (brim ? 17 : 20) * u, [dI, dO] = F.brow;
  if (kind === "shock" || kind === "shockHalf") p.arc(ex, by - 6 * u, 9 * u, 3 * u, 200, 340, 4 * u);
  else taper(p, [ex + 8 * u, by + dI * u], [ex - 7 * u, by - u + dO * u], 5 * u, 2.5 * u);
  p.stroke([[hx + 44 * u, hy + 4 * u], [hx + 47.5 * u, hy + 9 * u], [hx + 43 * u, hy + 10 * u]], 3 * u);
  mouth(p, F.mouth, hx + 33 * u, hy + 21 * u, u, 0.62);
  if (moustache) taper(p, [hx + 41 * u, hy + 13.5 * u], [hx + 25 * u, hy + (stout ? 11.5 : 16) * u], stout ? 5.5 * u : 4.5 * u, 1.6 * u, moustache);
  if (expr === "nervous") p.ell(hx - 30 * u, hy - 24 * u, 3 * u, 5 * u, "#9fd4ff", 2 * u);
};

// ---------------- hats ----------------
const BONNET = "#e9cf8f", BONNET_BRIM = "#d6b46a";
/** parts of a hat that sit behind the head (bonnet) */
const hatBehind = (p: Pen, o: Outfit, H: Blob, cx: number, hc: number, light: number, thick: number, ow: number, side: boolean) => {
  if (o.hat !== "bonnet") return;
  const bb = blobPts(cx - (side ? 12 : 0) * (H.a / 50), hc - 0.07 * 2 * H.b, { ...H, a: H.a * 1.17, b: H.b * 1.13, asym: 0, egg: 0.04, seed: H.seed + 3 });
  p.shadedFill(bb, BONNET, mul(BONNET, SH_CLOTH), light, H.a * 1.17);
  p.inkRing(bb, ow * 0.85, thick);
};

let HAT_BACK = false;
const hatOn = (p: Pen, o: Outfit, hp: P2[], H: Blob, cx: number, hc: number, light: number, seed: number, facing: number, side: boolean) => {
  const W = 2 * H.a, HH = 2 * H.b, u = W / 100, crown = hc - H.b, ow = 0.85 * 5 * u;
  const a = H.rot + rad(4 * (rnd(seed, 20) - 0.5)); // tilt with the head, +-2 deg extra
  const R = (pts: P2[]) => rotPts(pts, a, cx, hc);
  const sag = (yb: number, wb: number): P2[] => {
    const base: P2[] = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; base.push([cx + wb * (2 * t - 1), yb + 3 * u * (1 - (2 * t - 1) ** 2)]); }
    return base;
  };
  if (o.hat === "shako" || o.hat === "shako_tall") {
    const tall = o.hat === "shako_tall", yb = crown + 0.25 * HH, ht = (tall ? 0.66 : 0.56) * HH, wb = 46 * u, wt = 52 * u;
    const body = R([...sag(yb, wb).reverse(), [cx - wt, yb - ht], [cx + wt, yb - ht]]);
    p.shadedFill(body, "#3a3d47", "#24262d", light, wt, 0.4);
    if (tall) p.clip(body, () => p.band(R([[cx - wt - 5 * u, yb - ht + 0.07 * HH], [cx + wt + 5 * u, yb - ht + 0.07 * HH]]), "#e8c45a", 0.06 * HH, 1.5 * u));
    p.poly(body, null, ow);
    const deg = (a * 180) / Math.PI;
    if (side) {
      p.poly(R([[cx + 36 * u, yb - 1 * u], [cx + 60 * u, yb + 8 * u], [cx + 34 * u, yb + 6 * u]]), "#16171b", 2.5 * u);
      const [tx, ty] = R([[cx + 24 * u, yb - ht - 6 * u]])[0];
      p.ell(tx, ty, 7 * u, 7 * u, "#2b7a4b", 2.5 * u);
    } else {
      const [px, py] = R([[cx + 3 * u * facing, yb + 3 * u]])[0];
      p.ell(px, py, 34 * u, 0.045 * HH, "#16171b", 2.5 * u, 0, 180, deg); // peak
      const [bx, by] = R([[cx, yb - 0.45 * ht]])[0];
      p.ell(bx, by, 7 * u, 6 * u, tall ? "#e8c45a" : "#c9ccd2", 2 * u, 0, 360, deg); // badge plate
      p.arc(bx, by, 3.5 * u, 2.8 * u, 200, 500, 1.6 * u);
      const [tx, ty] = R([[cx, yb - ht - 6 * u]])[0];
      p.ell(tx, ty, 7 * u, 7 * u, "#2b7a4b", 2.5 * u); // green tuft
    }
  } else if (o.hat === "cap" || o.hat === "hair") {
    const cut = crown + (o.hat === "cap" ? 0.3 : 0.42) * HH;
    const keep = (x: number, y: number) => y < cut || (side && o.hat === "hair" && x < cx - 6 * u && y < hc + 0.42 * H.b);
    // start the arc at the first kept point after a dropped one, so the kept run is contiguous and the cut closes it
    const n = hp.length, startIdx = Math.max(0, hp.findIndex(([x, y], i) => keep(x, y) && !keep(hp[(i + n - 1) % n][0], hp[(i + n - 1) % n][1])));
    const arc = [...hp.slice(startIdx), ...hp.slice(0, startIdx)].filter(([x, y]) => keep(x, y))
      .map(([x, y]) => [cx + (x - cx) * 1.03, hc + (y - hc) * 1.03] as P2);
    if (arc.length < 3) return;
    if (o.hat === "hair") { // scalloped lower edge
      const [x0, y0] = arc[arc.length - 1], [x1, y1] = arc[0];
      for (let i = 1; i < 6; i++) arc.push([x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6 + (i % 2 ? 4 * u : 0)]);
    }
    const col = o.hat === "cap" ? o.cap! : o.hair!;
    p.shadedFill(arc, col, mul(col, SH_FELT), light, H.a, 0.35);
    p.poly(arc, null, ow);
    if (o.hat === "hair") {
      const s = side ? -1 : facing || 1;
      p.stroke([[cx + s * 10 * u, cut - 30 * u], [cx + s * 2 * u, cut - 12 * u]], 1.2 * u);
    }
    if (o.hat === "cap") {
      const deg = (a * 180) / Math.PI;
      if (side) p.poly(R([[cx + 40 * u, cut - 2 * u], [cx + 74 * u, cut + 4 * u], [cx + 40 * u, cut + 6 * u]]), shade(col, 0.8), ow);
      else {
        const s = facing || (rnd(seed, 21) < 0.5 ? -1 : 1), [px, py] = R([[cx + s * 4 * u, cut + 1.5 * u]])[0];
        p.ell(px, py, 32 * u, 0.06 * HH, shade(col, 0.8), ow, 0, 180, deg);
      }
    }
  } else if (o.hat === "tophat") {
    const yb = crown + 0.22 * HH, ht = 0.8 * HH, wb = 0.31 * W, wt = 0.33 * W, col = "#2e2a36";
    const body = R([...sag(yb, wb).reverse(), [cx - wt, yb - ht], [cx + wt, yb - ht]]);
    p.shadedFill(body, col, mul(col, SH_FELT), light, wt, 0.4);
    p.clip(body, () => p.band(R([[cx - wt - 4 * u, yb - 0.13 * HH], [cx + wt + 4 * u, yb - 0.13 * HH]]), shade(o.jacket, 0.9), 0.14 * HH, 0.8 * u));
    p.poly(body, null, ow);
    const [bx, by] = R([[cx, yb + 1 * u]])[0];
    p.ell(bx, by, 0.45 * W, 0.05 * HH, "#1d1b22", ow, 0, 360, (a * 180) / Math.PI);
  } else if (o.hat === "bicorne" || o.hat === "bicorne_gen") {
    const gen = o.hat === "bicorne_gen", yb = crown + 0.2 * HH, col = "#23242c";
    if (side) {
      const body = R([[cx - 34 * u, yb + 2 * u], [cx - 26 * u, yb - 0.3 * HH], [cx - 6 * u, yb - 0.52 * HH], [cx + 14 * u, yb - 0.5 * HH], [cx + 30 * u, yb - 0.28 * HH], [cx + 36 * u, yb + 2 * u]]);
      p.shadedFill(body, col, "#15161b", light, 40 * u, 0.4);
      if (gen) p.clip(body, () => p.band(R([[cx - 40 * u, yb - 0.04 * HH], [cx + 40 * u, yb - 0.04 * HH]]), "#e8c45a", 0.05 * HH, 1.2 * u));
      p.poly(body, null, ow);
      const [kx, ky] = R([[cx + 12 * u, yb - 0.2 * HH]])[0];
      p.ell(kx, ky, 8 * u, 8 * u, "#2f4f9a", 2 * u); p.ell(kx, ky, 5 * u, 5 * u, "#f4f0e6", 0); p.ell(kx, ky, 2.6 * u, 2.6 * u, "#c8323a", 0);
    } else {
      const s = gen ? 1.08 : 1, wing = 66 * u * s, top: P2[] = [];
      for (let i = 0; i <= 16; i++) { const k = i / 16, x = -1 + 2 * k; top.push([cx + wing * x, yb - 0.38 * HH * s * (1 - x * x) ** 0.8 - 0.07 * HH * x * x]); }
      const bot: P2[] = [];
      for (let i = 16; i >= 0; i--) { const x = -1 + 2 * (i / 16); bot.push([cx + wing * x * 0.96, yb + 4 * u - 0.03 * HH * x * x]); }
      const body = R([...top, ...bot]);
      p.shadedFill(body, col, "#15161b", light, wing, 0.4);
      if (gen) p.clip(body, () => p.stroke(R(top.map(([x, y]) => [x, y + 3 * u] as P2)), 6 * u, "#e8c45a"));
      p.poly(body, null, ow);
      const [kx, ky] = R([[cx + 26 * u, yb - 0.22 * HH]])[0];
      if (!HAT_BACK) { p.ell(kx, ky, 9 * u, 9 * u, "#2f4f9a", 2 * u); p.ell(kx, ky, 6 * u, 6 * u, "#f4f0e6", 0); p.ell(kx, ky, 3 * u, 3 * u, "#c8323a", 0); }
    }
  } else if (o.hat === "kasket") {
    const yb = crown + 0.24 * HH, ht = 0.4 * HH, wb = 47 * u, col = "#26262c";
    if (side) {
      const body = R([[cx - 40 * u, yb + 2 * u], [cx - 42 * u, yb - 0.6 * ht], [cx - 20 * u, yb - ht], [cx + 22 * u, yb - ht], [cx + 40 * u, yb - 0.5 * ht], [cx + 40 * u, yb + 2 * u]]);
      p.shadedFill(body, col, "#141418", light, wb, 0.4); p.poly(body, null, ow);
      p.poly(R([[cx + 34 * u, yb - 2 * u], [cx + 64 * u, yb + 7 * u], [cx + 34 * u, yb + 6 * u]]), "#141418", 2.5 * u);
      p.poly(R([[cx + 22 * u, yb - 0.25 * ht], [cx + 38 * u, yb - 0.22 * ht], [cx + 38 * u, yb - 0.85 * ht], [cx + 18 * u, yb - 0.95 * ht]]), "#d9b24a", 2 * u);
    } else {
      const body = R([...sag(yb, wb).reverse(), [cx - wb, yb - 0.7 * ht], [cx - 0.6 * wb, yb - ht], [cx + 0.6 * wb, yb - ht], [cx + wb, yb - 0.7 * ht]]);
      p.shadedFill(body, col, "#141418", light, wb, 0.4); p.poly(body, null, ow);
      if (!HAT_BACK) {
        p.poly(R([[cx - 22 * u, yb - 0.12 * ht], [cx + 22 * u, yb - 0.12 * ht], [cx + 22 * u, yb - 0.82 * ht], [cx - 22 * u, yb - 0.9 * ht]]), "#d9b24a", 2 * u);
        const [bx, by] = R([[cx, yb - 0.5 * ht]])[0];
        p.ell(bx, by, 6 * u, 6 * u, "#26262c", 0);
      }
      const [px, py] = R([[cx + 3 * u * facing, yb + 3 * u]])[0];
      p.ell(px, py, 34 * u, 0.045 * HH, "#141418", 2.5 * u, 0, 180, (a * 180) / Math.PI);
    }
  } else if (o.hat === "colpack") {
    const yb = crown + 0.22 * HH, ht = 0.62 * HH, wb = 46 * u, wt = 44 * u, col = "#4a3222";
    const body = R([...sag(yb, wb).reverse(), [cx - wt, yb - 0.85 * ht], [cx - 0.7 * wt, yb - ht], [cx + 0.7 * wt, yb - ht], [cx + wt, yb - 0.85 * ht]]);
    p.shadedFill(body, col, "#2c1d14", light, wt, 0.4);
    p.clip(body, () => { for (let i = 0; i < 9; i++) p.stroke(R([[cx - wt + i * 11 * u, yb - 0.1 * ht], [cx - wt + i * 11 * u + 3 * u, yb - 0.9 * ht]]), 1.6 * u, "#2c1d14"); });
    p.poly(body, null, ow);
    p.poly(R([[cx + (side ? -wt : wt * 0.2), yb - ht + 4 * u], [cx + (side ? -wt - 24 * u : wt + 18 * u), yb - 0.55 * ht], [cx + (side ? -wt + 6 * u : wt * 0.55), yb - 0.7 * ht]]), "#c8323a", 2 * u);
    const [tx, ty] = R([[cx + (side ? 10 * u : -18 * u), yb - ht - 14 * u]])[0];
    p.ell(tx, ty, 6 * u, 16 * u, "#2f8a4f", 2 * u);
  } else if (o.hat === "khepresh") {
    // the blue war crown: tall bulb with gold discs and a cobra
    const yb = crown + 0.22 * HH, col = "#2f5fb5";
    const pts: P2[] = [];
    for (let i = 0; i <= 20; i++) { const a2 = Math.PI * (1 + i / 20); pts.push([cx + 50 * u * Math.cos(a2) + (side ? -10 * u * Math.sin(a2) : 0), yb - 0.15 * HH + 0.62 * HH * Math.sin(a2) * (1 + 0.12 * Math.cos(a2))]); }
    pts.push([cx + 50 * u, yb + 4 * u], [cx - 50 * u, yb + 4 * u]);
    const b = R(pts); p.shadedFill(b, col, "#1f3f80", light, 55 * u, 0.4);
    p.clip(b, () => { for (let r = 0; r < 4; r++) for (let c = -3; c <= 3; c++) p.ell(cx + c * 14 * u + (r % 2) * 7 * u, yb - 0.12 * HH - r * 0.14 * HH, 3 * u, 3 * u, "#e8c45a", 0); });
    p.poly(b, null, ow);
    p.band(R([[cx - 50 * u, yb - 1 * u], [cx + 50 * u, yb - 1 * u]]), "#e8c45a", 0.05 * HH, 1.2 * u);
    const [kx, ky] = R([[cx + (side ? 46 * u : 0), yb - 0.08 * HH]])[0];
    p.ell(kx, ky, 6 * u, 10 * u, "#e8c45a", 2 * u); p.ell(kx, ky - 8 * u, 4 * u, 4 * u, "#e8c45a", 1.5 * u);
  } else if (o.hat === "headcloth") {
    const yb = crown + 0.3 * HH, col = o.cap ?? "#f2ead8";
    const pts: P2[] = [];
    for (let i = 0; i <= 16; i++) { const a2 = Math.PI * (1 + i / 16); pts.push([cx + 56 * u * Math.cos(a2), yb - 0.05 * HH + 0.48 * HH * Math.sin(a2)]); }
    pts.push([cx + 60 * u, yb + 0.38 * HH], [cx + 44 * u, yb + 0.4 * HH], [cx + 40 * u, yb], [cx - 40 * u, yb], [cx - 44 * u, yb + 0.4 * HH], [cx - 60 * u, yb + 0.38 * HH]);
    const b = R(pts); p.shadedFill(b, col, mul(col, SH_CLOTH), light, 58 * u, 0.4);
    if (!o.cap) p.clip(b, () => { for (let k = -5; k <= 5; k++) p.stroke(R([[cx + k * 11 * u, yb - 0.5 * HH], [cx + k * 13 * u, yb + 0.45 * HH]]), 4 * u, "#3f6fb5"); });
    p.poly(b, null, ow);
  } else if (o.hat === "hittite") {
    const yb = crown + 0.22 * HH, col = o.cap ?? "#8a5a3a";
    const b = R([[cx - 48 * u, yb + 3 * u], [cx - 30 * u, yb - 0.5 * HH], [cx + (side ? 20 : 6) * u, yb - 0.95 * HH], [cx + 32 * u, yb - 0.45 * HH], [cx + 48 * u, yb + 3 * u]]);
    p.shadedFill(b, col, mul(col, SH_FELT), light, 50 * u, 0.4); p.poly(b, null, ow);
    p.band(R([[cx - 50 * u, yb - 2 * u], [cx + 50 * u, yb - 2 * u]]), "#e8c45a", 0.05 * HH, 1.2 * u);
    if (o.hair) p.line(R([[cx - 40 * u, yb + 6 * u], [cx - 56 * u, yb + 0.35 * HH], [cx - 50 * u, yb + 0.7 * HH]]), o.hair, 12 * u);
  } else if (o.hat === "wrap") {
    const yb = crown + 0.3 * HH, col = o.cap ?? "#c9a06a";
    const b = R(ellPts(cx, yb - 0.18 * HH, 58 * u, 0.34 * HH, 180, 360).concat([[cx + 58 * u, yb + 0.05 * HH], [cx - 58 * u, yb + 0.05 * HH]] as P2[]));
    p.shadedFill(b, col, mul(col, SH_FELT), light, 58 * u, 0.4);
    p.clip(b, () => { for (let k = 0; k < 4; k++) p.stroke(R([[cx - 60 * u, yb - 0.3 * HH + k * 0.09 * HH], [cx + 60 * u, yb - 0.25 * HH + k * 0.09 * HH]]), 2.5 * u, mul(col, [0.75, 0.75, 0.75])); });
    p.poly(b, null, ow);
  } else if (o.hat === "brodie") {
    // WWI British-pattern steel helmet: shallow dome over a wide flat brim
    const yb = crown + 0.27 * HH, col = "#5f5d3a", wb = 70 * u;
    const dome: P2[] = [];
    for (let i = 0; i <= 16; i++) { const a2 = Math.PI * (1 + i / 16); dome.push([cx + 40 * u * Math.cos(a2), yb - 4 * u + 0.3 * HH * Math.sin(a2)]); }
    const brimP = R(ellPts(cx + (side ? 6 * u : 0), yb, wb, (side ? 0.05 : 0.08) * HH, 0, 360, 0));
    p.shadedFill(brimP, col, "#3c3b25", light, wb, 0.4); p.poly(brimP, null, ow);
    const d = R(dome); p.shadedFill(d, col, "#3c3b25", light, 40 * u, 0.4); p.poly(d, null, ow);
    p.stroke(R([[cx - 30 * u, yb - 0.12 * HH], [cx - 14 * u, yb - 0.22 * HH]]), 2.5 * u, "#8a8758");
  } else if (o.hat === "stahl") {
    // coal-scuttle steel helmet: deep dome, flared skirt over the ears
    const yb = crown + 0.36 * HH, col = "#6e7369";
    const pts: P2[] = [];
    for (let i = 0; i <= 18; i++) { const a2 = Math.PI * (1 + i / 18); pts.push([cx + 52 * u * Math.cos(a2), yb - 0.18 * HH + 0.42 * HH * Math.sin(a2)]); }
    pts.push([cx + 58 * u, yb + 0.06 * HH], [cx + 44 * u, yb + 0.02 * HH], [cx - 44 * u, yb + 0.02 * HH], [cx - 58 * u, yb + 0.06 * HH]);
    const b = R(pts); p.shadedFill(b, col, "#474a44", light, 55 * u, 0.4); p.poly(b, null, ow);
  } else if (o.hat === "kepi") {
    const yb = crown + 0.24 * HH, ht = 0.42 * HH, wb = 44 * u, wt = 38 * u, col = "#c8323a";
    const body = R([...sag(yb, wb).reverse(), [cx - wt, yb - ht], [cx + wt, yb - ht]]);
    p.shadedFill(body, col, "#8a2228", light, wt, 0.4);
    p.clip(body, () => { p.band(R([[cx - 50 * u, yb - 0.08 * HH], [cx + 50 * u, yb - 0.08 * HH]]), "#2c3e6e", 0.12 * HH, 1 * u); p.band(R([[cx - 50 * u, yb - ht + 0.06 * HH], [cx + 50 * u, yb - ht + 0.06 * HH]]), "#e8c45a", 0.05 * HH, 1 * u); });
    p.poly(body, null, ow);
    const [px, py] = R([[cx + 3 * u * facing, yb + 3 * u]])[0];
    p.ell(px, py, 34 * u, 0.045 * HH, "#16171b", 2.5 * u, 0, 180, (a * 180) / Math.PI);
  } else if (o.hat === "beret") {
    const [bx, by] = R([[cx + (side ? 4 * u : 0), crown + 0.06 * HH]])[0];
    p.ell(bx, by, 0.52 * W, 0.12 * HH, o.cap ?? "#3b3f6b", ow, 0, 360, (a * 180) / Math.PI);
    const [nx, ny] = R([[cx + (side ? 4 * u : 0), crown - 0.07 * HH]])[0];
    p.ell(nx, ny, 4 * u, 6 * u, o.cap ?? "#3b3f6b", 2 * u);
  } else if (o.hat === "bonnet") {
    const [bx, by] = R([[cx + (side ? 6 * u : 0), crown + 0.16 * HH]])[0];
    p.arc(bx, by, 0.5 * W, 0.2 * HH, 200, 340, 7 * u, BONNET_BRIM);
    p.arc(bx, by, 0.5 * W + 3.5 * u, 0.2 * HH + 3.5 * u, 200, 340, 1.2 * u);
    const cy = hc + H.b * 0.98;
    p.stroke([[cx - 14 * u, cy - 4 * u], [cx, cy + 2 * u], [cx + 14 * u, cy - 4 * u]], 2 * u, BONNET_BRIM);
  }
};

// ---------------- bodies ----------------
export type Arms = [P2[], P2[]];
/** held prop; for the hammer the number is the strike 0 (raised) .. 1 (struck) */
export type Prop = null | "icecream" | "shako" | "ear" | "point" | "fist" | "shrug" | "phone" | "hold" | ["knife", number] | ["hammer", number] | ["flag", number] | ["brush", number];

const BUILD: Record<Build, { a: number; torso: number; legs: number; tw: number }> = {
  adult: { a: 118, torso: 1.1, legs: 1.4, tw: 0.8 },
  stout: { a: 118, torso: 1.15, legs: 1.32, tw: 0.92 },
  kid: { a: 112, torso: 0.85, legs: 1.0, tw: 0.72 },
};

export type FrontOpts = {
  phase?: number; expr?: Expr; mode?: "march" | "stroll" | "stand" | "sit" | "fall"; look?: number; blink?: boolean | number; lift?: number;
  prop?: Prop; tilt?: number; headTilt?: number; wave?: number;
  /** seen from behind: no face, no buttons, hair at the nape */
  back?: boolean;
  /** canvas angle the key light comes FROM (painted crescent + thick outline side) */
  light?: number; facing?: -1 | 0 | 1; seed?: number;
};

const skinOf = (o: Outfit) => o.skin ?? SKIN;
const footStroke = (p: Pen, a: P2, b: P2, w: number, col: string) => {
  if (col !== INK) p.stroke([a, b], w + 3, INK);
  p.stroke([a, b], w, col);
};

export const bodyFront = (p: Pen, o: Outfit, opts: FrontOpts) => {
  const { phase = 0, expr = "neutral", mode = "march", look = 0, blink = false, lift = 60, prop = null, tilt = 0, headTilt = 0, wave, back = false,
    light = DEF_LIGHT, facing = 0, seed = 1 } = opts;
  const Bd = BUILD[o.build ?? "adult"], skin = o.skin ?? SKIN, two = Math.PI * 2, lid = lidOf(blink);
  const H = headBlob(seed, Bd.a, facing), W = 2 * H.a, HH = 2 * H.b, u = W / 100;
  const tall = (1 + Bd.torso + Bd.legs) * HH, sole = 975;
  // body bob 5 % (march) / 3 % (stroll) of the height, lowest at contact (phase 0 and 0.5)
  const bob = mode === "march" ? 0.025 * tall * Math.cos(2 * two * phase) : mode === "stroll" ? 0.015 * tall * Math.cos(2 * two * phase) : 0;
  const torsoBot = mode === "sit" ? sole - 0.2 * HH : sole - Bd.legs * HH + bob;
  const chin = torsoBot - Bd.torso * HH, hc = chin - H.b, crown = hc - H.b, hipY = torsoBot - 0.12 * HH;
  const thick = thickAngle(light), ow = 5 * u;
  const legCol = mix(o.pants, INK, 0.55), armCol = mix(o.jacket, INK, 0.5), footCol = o.boots;
  const legW = 5.8 * u, footW = 7.5 * u;
  // ---- legs + feet (not rotated) ----
  p.rot = null;
  if (mode === "sit") {
    for (const side of [-1, 1]) {
      const h: P2 = [300 + side * 15 * u, hipY], k: P2 = [300 + side * 36 * u, hipY + 0.2 * HH], f: P2 = [300 + side * 44 * u, sole - 8 * u];
      p.stroke(curve(h, k, f), legW, legCol);
      footStroke(p, [f[0] - side * 2 * u, f[1]], [f[0] + side * 12 * u, f[1] - 5 * u], footW, footCol);
    }
  } else if (mode === "fall") {
    const legs: [P2, P2, P2][] = [
      [[300 - 15 * u, hipY], [300 - 46 * u, hipY + 0.5 * HH], [300 - 70 * u, hipY + 0.72 * HH]],
      [[300 + 15 * u, hipY], [300 + 50 * u, hipY + 0.45 * HH], [300 + 76 * u, hipY + 0.22 * HH]],
    ];
    legs.forEach(([h, k, f], i) => {
      p.stroke(curve(h, k, f), legW, legCol);
      footStroke(p, f, [f[0] + (i ? 14 : -14) * u, f[1] + (i ? -6 : 4) * u], footW, footCol);
    });
  } else if (o.dress) {
    for (const side of [-1, 1]) {
      const fx = 300 + side * 12 * u, fy = sole - 4 * u;
      p.stroke([[fx, sole - 0.4 * HH], [fx + side * u, fy]], legW, legCol);
      footStroke(p, [fx - side * 3 * u, fy], [fx + side * 12 * u, fy + u], footW, footCol);
    }
  } else {
    const L = mode === "march" ? lift * 1.25 : mode === "stroll" ? lift * 0.55 : 0;
    for (const [side, ph] of [[-1, 0], [1, 0.5]] as const) {
      const up = Math.max(0, Math.sin(two * (phase + ph))) * L;
      const hx = 300 + side * 15 * u, fx = 300 + side * 22 * u, fy = sole - 4 * u - up;
      const k: P2 = [(hx + fx) / 2 + side * (1.5 * u + up * 0.16), (hipY + fy) / 2 - up * 0.08];
      p.stroke(curve([hx, hipY], k, [fx, fy]), legW, legCol);
      footStroke(p, [fx - side * 3 * u, fy], [fx + side * 13 * u, fy + 0.5 * u], footW, footCol);
    }
  }
  // ---- upper body: rotates about the hips (tilt + a small weight-shift sway on every step) ----
  const sway = mode === "march" ? 1.6 * Math.sin(two * phase) : mode === "stroll" ? 1.0 * Math.sin(two * phase) : 0;
  const A = tilt + sway;
  p.rot = A ? [rad(A), 300, hipY] : null;
  const dress = !!o.dress && mode !== "sit" && mode !== "fall";
  const T: Blob = { a: ((Bd.tw / 2) * W) / 1.06, b: 0.5 * (torsoBot - (chin - 0.25 * HH)), nTop: 2.2, nBot: 2.6, egg: o.build === "stout" ? 0.17 : 0.12,
    asym: 0.04 * facing, rot: 0, noise: 0.006, seed: seed + 7 };
  const tcx = 300 + 3 * u * facing, tcy = torsoBot - T.b, tp = blobPts(tcx, tcy, T);
  const sh = (side: number): P2 => [tcx + side * 0.85 * T.a, chin + 0.12 * HH];
  const hang = (side: number, fwd: number): [P2, P2, P2] => {
    const S = sh(side), ex = tcx + side * (1.12 * T.a + 4 * u);
    const hx = ex + side * 3 * u - side * 6 * u * Math.max(0, fwd) + side * 4 * u * Math.max(0, -fwd);
    return [S, [ex, S[1] + 0.48 * HH], [hx, chin + 1.04 * HH - Math.abs(fwd) * 9 * u]];
  };
  const sw = mode === "march" || mode === "stroll" ? Math.sin(two * phase) : 0;
  // rifle at the order: butt by the right hip, held by the hanging right hand, muzzle past the crown
  const R0: P2 = [300 + 47 * u, torsoBot + 0.12 * HH], R1: P2 = [300 + 64 * u, crown - 0.32 * HH];
  const rifle = !!o.rifle && (mode === "march" || mode === "stand" || mode === "stroll");
  type Arm = { pts: [P2, P2, P2]; front: boolean };
  const arms: Arm[] = [];
  if (mode === "sit") for (const side of [-1, 1]) arms.push({ pts: [sh(side), [tcx + side * (1.1 * T.a + 6 * u), sh(side)[1] + 0.4 * HH], [tcx + side * (1.2 * T.a + 10 * u), torsoBot + 0.04 * HH]], front: false });
  else if (mode === "fall") for (const side of [-1, 1]) arms.push({ pts: [sh(side), [tcx + side * (1.15 * T.a + 12 * u), sh(side)[1] - 0.25 * HH], [tcx + side * (1.3 * T.a + 24 * u), sh(side)[1] - 0.68 * HH]], front: false });
  else {
    arms.push({ pts: prop === "shako" ? hang(-1, 0) : hang(-1, -sw), front: false });
    if (rifle) {
      const G = lerp2(R0, R1, 0.1);
      arms.push({ pts: [sh(1), [tcx + 1.12 * T.a + 5 * u, sh(1)[1] + 0.45 * HH], G], front: false });
    } else if (wave !== undefined) {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.1 * T.a + 10 * u + 3 * u * wave, S[1] - 0.22 * HH], [tcx + 1.18 * T.a + 16 * u + 12 * u * wave, S[1] - 0.6 * HH]], front: false });
    } else if (prop === "icecream") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.05 * T.a + 4 * u, S[1] + 0.45 * HH], [tcx + 0.5 * T.a, S[1] + 0.4 * HH]], front: true });
    } else if (Array.isArray(prop) && prop[0] === "flag") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.15 * T.a + 10 * u, S[1] - 0.28 * HH], [tcx + 1.05 * T.a + 12 * u, S[1] - 0.66 * HH]], front: true });
    } else if (prop === "shrug" || prop === "hold") {
      const S = sh(1), up = prop === "shrug" ? -0.25 : 0.35, out = prop === "shrug" ? 1.5 : 0.35;
      arms.push({ pts: [S, [tcx + 1.25 * T.a + 10 * u, S[1] + 0.32 * HH], [tcx + out * T.a + 14 * u, S[1] + up * HH]], front: true });
      arms[0] = { pts: [sh(-1), [tcx - 1.25 * T.a - 10 * u, sh(-1)[1] + 0.32 * HH], [tcx - out * T.a - 14 * u, sh(-1)[1] + up * HH]], front: true };
    } else if (prop === "phone") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.25 * T.a + 12 * u, S[1] + 0.05 * HH], [300 + 0.5 * W, hc + 0.12 * HH]], front: true });
    } else if (Array.isArray(prop) && prop[0] === "knife") {
      const S = sh(1), k = Math.sin(prop[1] * Math.PI * 2);
      arms.push({ pts: [S, [tcx + 1.1 * T.a + 8 * u, S[1] + 0.35 * HH], [tcx + 0.3 * T.a + 10 * k * u, S[1] + 0.5 * HH]], front: true });
      arms[0] = { pts: [sh(-1), [tcx - 1.1 * T.a - 8 * u, sh(-1)[1] + 0.35 * HH], [tcx - 0.25 * T.a, sh(-1)[1] + 0.55 * HH]], front: true };
    } else if (prop === "point") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.3 * T.a + 16 * u, S[1] - 0.12 * HH], [tcx + 1.55 * T.a + 34 * u, S[1] - 0.34 * HH]], front: true });
    } else if (prop === "fist") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.25 * T.a + 14 * u, S[1] - 0.3 * HH], [tcx + 1.1 * T.a + 12 * u, S[1] - 0.78 * HH]], front: true });
    } else if (prop === "ear") {
      const S = sh(1);
      arms.push({ pts: [S, [tcx + 1.25 * T.a + 12 * u, S[1] + 0.05 * HH], [300 + 0.56 * W, hc + 0.04 * HH]], front: true });
    } else if (Array.isArray(prop)) {
      const S = sh(1), k = clamp(prop[1], 0, 1);
      const E = lerp2([tcx + 1.1 * T.a + 10 * u, S[1] - 0.15 * HH], [tcx + 1.2 * T.a + 10 * u, S[1] + 0.3 * HH], k);
      const Hd = lerp2([tcx + 1.15 * T.a + 14 * u, S[1] - 0.55 * HH], [tcx + 1.45 * T.a + 22 * u, S[1] + 0.35 * HH], k);
      arms.push({ pts: [S, E, Hd], front: true });
    } else arms.push({ pts: hang(1, sw), front: false });
  }
  const drawArm = (a: Arm) => { p.stroke(curve(a.pts[0], a.pts[1], a.pts[2]), 5.2 * u, armCol); p.dot(a.pts[2][0], a.pts[2][1], 5.5 * u); };
  // behind the body: rifle, sword, arms
  if (rifle) {
    if (o.spear) {
      const T1: P2 = [R1[0] + (R1[0] - R0[0]) * 0.12, R1[1] - 0.22 * HH];
      p.band([R0, T1], "#8a5a34", 4 * u, 1.4 * u, "round");
      p.poly([[T1[0] - 6 * u, T1[1] + 4 * u], [T1[0] + 6 * u, T1[1] + 4 * u], [T1[0] + 1 * u, T1[1] - 22 * u]], "#c9932e", 1.6 * u);
    } else {
      p.band([R0, R1], "#7a4b2a", 5 * u, 1.5 * u, "round");
      p.band([lerp2(R0, R1, 0.6), R1], "#8d949c", 2.4 * u, 1.2 * u, "round");
    }
  }
  if (o.sword && mode !== "sit") {
    const s0: P2 = [tcx - 0.75 * T.a, torsoBot - 0.2 * HH];
    p.band([s0, [s0[0] - Math.sin(rad(25)) * 0.8 * HH, s0[1] + Math.cos(rad(25)) * 0.8 * HH]], "#c9ccd2", 3 * u, 1.2 * u, "round");
  }
  for (const a of arms) if (!a.front) drawArm(a);
  // torso / dress: shaded fill -> clothing clipped to it -> thick-thin ink ring
  if (dress) {
    const D: Blob = { a: 0.5 * W * 0.98, b: 0.5 * ((sole - 0.35 * HH) - (chin - 0.2 * HH)), nTop: 2.0, nBot: 3.0, egg: 0.35, asym: 0.03 * facing, rot: 0, noise: 0.006, seed: seed + 9 };
    const dp = blobPts(300, sole - 0.35 * HH - D.b, D);
    p.gradFill(dp, o.dress!, mul(o.dress!, SH_CLOTH), light);
    p.inkRing(dp, ow, thick);
    const Sw: Blob = { a: 0.37 * W, b: 0.3 * HH, nTop: 2.2, nBot: 2.4, egg: 0.1, asym: 0, rot: 0, noise: 0.006, seed: seed + 8 };
    const sp = blobPts(300, chin + 0.12 * HH, Sw);
    p.gradFill(sp, o.jacket, mul(o.jacket, SH_CLOTH), light);
    p.inkRing(sp, ow * 0.9, thick);
  } else {
    p.gradFill(tp, o.jacket, mul(o.jacket, SH_CLOTH), light);
    p.clip(tp, () => {
      if (o.belt) {
        for (const s of [-1, 1]) p.band([[tcx - s * 0.75 * T.a, chin - 0.05 * HH], [tcx + s * 0.8 * T.a, torsoBot - 0.1 * HH]], o.belt!, 5.5 * u, 1.8 * u);
        const xc = tcx + 0.025 * T.a, yc = chin - 0.05 * HH + (torsoBot - 0.1 * HH - (chin - 0.05 * HH)) * (0.75 / 1.55);
        p.poly([[xc - 3.5 * u, yc - 3.5 * u], [xc + 3.5 * u, yc - 3.5 * u], [xc + 3.5 * u, yc + 3.5 * u], [xc - 3.5 * u, yc + 3.5 * u]], "#d9dde0", 1.5 * u);
      }
      if (o.sash) p.band([[tcx - 1.3 * T.a, torsoBot - 0.32 * HH], [tcx + 1.3 * T.a, torsoBot - 0.32 * HH]], o.sash, 0.13 * HH, 1.8 * u);
      for (let i = 0; i < 4; i++) {
        const y = chin + 0.12 * HH + i * 0.2 * HH;
        if (o.sash && Math.abs(y - (torsoBot - 0.32 * HH)) < 0.08 * HH) continue;
        if (!back) { p.dot(tcx + 2 * u * facing, y, 2.2 * u + 0.8 * u, INK); p.dot(tcx + 2 * u * facing, y, 2.2 * u, o.buttons ?? shade(o.jacket, 0.7)); }
      }
    });
    if (o.sash) { const s = facing || 1; p.poly([[tcx + s * 0.55 * T.a, torsoBot - 0.3 * HH], [tcx + s * 0.75 * T.a, torsoBot + 0.05 * HH], [tcx + s * 0.45 * T.a, torsoBot + 0.02 * HH]], o.sash, 1.6 * u); }
    p.inkRing(tp, ow, thick);
  }
  if (o.collar && !back) { const cp = ellPts(tcx, chin + 0.02 * HH, 0.95 * T.a, 0.2 * HH, 0, 180); p.poly(cp, o.collar, 1.6 * u); p.clip(cp, () => { p.arc(tcx, chin + 0.02 * HH, 0.75 * T.a, 0.13 * HH, 10, 170, 3 * u, "#2f6fb5"); p.arc(tcx, chin + 0.02 * HH, 0.5 * T.a, 0.07 * HH, 10, 170, 3 * u, "#c8323a"); }); }
  // in front of the body: hands holding props
  for (const a of arms) if (a.front) {
    drawArm(a);
    const [hx, hy] = a.pts[2];
    if (prop === "icecream") {
      p.poly([[hx - 8 * u, hy - 12 * u], [hx + 8 * u, hy - 12 * u], [hx, hy + 7 * u]], "#e0a35a", 1.8 * u);
      p.ell(hx, hy - 19 * u, 11 * u, 10 * u, "#f7c6d9", 2.2 * u);
      p.dot(hx, hy, 5.5 * u);
    } else if (Array.isArray(prop) && prop[0] === "flag") {
      // tricolour on a pole, waving (prop[1] = wave phase 0..1)
      const top: P2 = [hx, hy - 1.25 * HH], bot: P2 = [hx, hy + 0.45 * HH], fw = 0.95 * HH, fh = 0.62 * HH, ph = prop[1] * Math.PI * 2;
      const edge = (k: number, y: number): P2 => [top[0] + 4 * u + k * fw, top[1] + y + 0.06 * HH * Math.sin(ph + k * 4) * k];
      const stripe = (k0: number, k1: number, col: string) => {
        const pts: P2[] = [];
        for (let i = 0; i <= 6; i++) pts.push(edge(k0 + ((k1 - k0) * i) / 6, 0));
        for (let i = 6; i >= 0; i--) pts.push(edge(k0 + ((k1 - k0) * i) / 6, fh));
        p.poly(pts, col, 0);
      };
      stripe(0, 1 / 3, "#2f4f9a"); stripe(1 / 3, 2 / 3, "#f4f0e6"); stripe(2 / 3, 1, "#c8323a");
      const outline: P2[] = [];
      for (let i = 0; i <= 12; i++) outline.push(edge(i / 12, 0));
      for (let i = 12; i >= 0; i--) outline.push(edge(i / 12, fh));
      p.poly(outline, null, 2.6 * u);
      p.band([bot, top], "#7a4b2a", 4 * u, 1.4 * u, "round");
      p.ell(top[0], top[1] - 5 * u, 6 * u, 8 * u, "#e8c45a", 1.6 * u);
      p.dot(hx, hy, 5.5 * u);
    } else if (prop === "shrug" || prop === "hold") {
      p.dot(hx, hy, 6 * u); const [lx, ly] = arms[0].pts[2]; p.dot(lx, ly, 6 * u);
    } else if (prop === "phone") {
      p.band([[hx - 4 * u, hy - 14 * u], [hx + 2 * u, hy + 16 * u]], "#1d1b22", 6 * u, 1.5 * u, "round");
      p.ell(hx - 4 * u, hy - 16 * u, 6 * u, 5 * u, "#1d1b22", 1.5 * u); p.ell(hx + 3 * u, hy + 18 * u, 7 * u, 5 * u, "#1d1b22", 1.5 * u);
      p.dot(hx, hy, 6 * u);
    } else if (Array.isArray(prop) && prop[0] === "knife") {
      p.band([[hx, hy], [hx + 10 * u, hy - 16 * u]], "#c9ccd2", 3 * u, 1 * u, "round");
      p.dot(hx, hy, 6 * u); const [lx, ly] = arms[0].pts[2]; p.ell(lx + 4 * u, ly - 4 * u, 6 * u, 3 * u, "#c9965a", 1.5 * u); p.dot(lx, ly, 6 * u);
    } else if (prop === "point") {
      p.stroke([[hx, hy], [hx + 12 * u, hy - 8 * u]], 3.2 * u); p.dot(hx, hy, 6 * u);
    } else if (prop === "fist") {
      p.ell(hx, hy, 8 * u, 8 * u, INK, 0);
    } else if (prop === "ear") {
      p.ell(hx, hy, 7 * u, 10 * u, skinOf(o), 2 * u, 90, 270);
    } else if (Array.isArray(prop) && prop[0] === "brush") {
      const k = clamp(prop[1], 0, 1), ang = rad(-40 + 30 * Math.sin(k * Math.PI * 2));
      const Rh = (pts: P2[]) => rotPts(pts, ang, hx, hy);
      p.band(Rh([[hx, hy + 10 * u], [hx, hy - 40 * u]]), "#a8744a", 3 * u, 1.2 * u, "round");
      p.poly(Rh([[hx - 4 * u, hy - 40 * u], [hx + 4 * u, hy - 40 * u], [hx + 2 * u, hy - 52 * u], [hx - 2 * u, hy - 52 * u]]), "#c8323a", 1.2 * u);
      p.dot(hx, hy, 5.5 * u);
    } else if (Array.isArray(prop)) {
      const ang = rad(-70 + 105 * clamp(prop[1], 0, 1));
      const Rh = (pts: P2[]) => rotPts(pts, ang, hx, hy);
      p.band(Rh([[hx, hy + 12 * u], [hx, hy - 44 * u]]), "#8a5a34", 5 * u, 1.5 * u, "round");
      p.poly(Rh([[hx - 12 * u, hy - 58 * u], [hx + 20 * u, hy - 58 * u], [hx + 20 * u, hy - 42 * u], [hx - 12 * u, hy - 42 * u]]), "#7d848c", 2.2 * u);
      p.dot(hx, hy, 5.5 * u);
    }
  }
  if (prop === "shako") { // carried by the left hand
    const [hx, hy] = arms[0].pts[2];
    p.poly([[hx - 14 * u, hy + 3 * u], [hx + 14 * u, hy + 3 * u], [hx + 16 * u, hy + 30 * u], [hx - 16 * u, hy + 30 * u]], "#3a3d47", 2.2 * u);
    p.ell(hx, hy + 31 * u, 3.5 * u, 3.5 * u, "#2b7a4b", 1.5 * u);
    p.dot(hx, hy, 5.5 * u);
  }
  // ---- head: rotates with the body, plus its own tilt about the chin ----
  const Ah = A + headTilt, [cpx, cpy] = rotAbout([300, chin], rad(A), [300, hipY]);
  p.rot = Ah ? [rad(Ah), 300, chin, cpx - 300, cpy - chin] : null;
  hatBehind(p, o, H, 300, hc, light, thick, ow, false);
  const hp = blobPts(300, hc, H);
  p.shadedFill(hp, skin, mul(skin, SH_SKIN), light, H.a);
  p.inkRing(hp, ow, thick);
  if (back) p.clip(hp, () => p.ell(300, hc + 0.3 * H.b, 0.62 * H.a, 0.62 * H.b, o.hair ?? "#3a2a1e", 0));
  HAT_BACK = back;
  hatOn(p, o, hp, H, 300, hc, light, seed, facing, false);
  HAT_BACK = false;
  const brim = !!o.hat && o.hat !== "hair" && o.hat !== "bonnet" && o.hat !== "cap";
  if (!back) faceFront(p, 300, hc, W, expr, facing, look, lid, brim, skin, o.moustache, o.build === "stout");
  if (o.beard && !back) { const bp = ellPts(300 + 6 * u * facing, hc + 0.72 * H.b, 0.42 * H.a, 0.36 * H.b, 0, 180); p.poly(bp, o.beard, 2 * u); }
  if (o.mud) { // mud dripping off the hat and down the face
    for (const [dx, len] of [[-0.55, 0.32], [-0.18, 0.5], [0.3, 0.26], [0.6, 0.4]] as const) {
      const x = 300 + dx * H.a, y0 = hc - 0.62 * H.b;
      p.poly([[x - 4 * u, y0], [x + 4 * u, y0], [x + 3 * u, y0 + len * H.b], [x, y0 + len * H.b + 5 * u], [x - 3 * u, y0 + len * H.b]], "#5d4630", 0);
    }
    p.ell(300 - 0.3 * H.a, hc + 0.55 * H.b, 9 * u, 6 * u, "#5d4630", 0);
    p.ell(300 + 0.45 * H.a, hc + 0.2 * H.b, 6 * u, 4 * u, "#6b5236", 0);
  }
  p.rot = null;
};

export type SideOpts = {
  phase?: number; expr?: Expr; mode?: "march" | "stand" | "swing" | "push"; blink?: boolean | number; stomp?: number; pose?: number;
  /** step length as a multiple of 0.8 m (370 units): matches 1.6 m/s at 2 steps/s; scale by the view's foreshortening */
  stride?: number; light?: number; seed?: number;
  /** push mode: where the hands land at pose 1, in final canvas units (e.g. the swing kid's back) */
  hand?: [number, number];
  /** trumpet raised to the mouth / musket levelled at the shoulder / running lean */
  trumpet?: boolean; aim?: boolean; run?: boolean;
};

/** two-bone leg, knee bending forward (+x) */
const ik = (hip: P2, ank: P2, l1: number, l2: number): P2 => {
  const dx = ank[0] - hip[0], dy = ank[1] - hip[1], d = clamp(Math.hypot(dx, dy), 1, l1 + l2 - 0.01);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), k = Math.atan2(dy, dx) - A;
  return [hip[0] + l1 * Math.cos(k), hip[1] + l1 * Math.sin(k)];
};

/** hip height of the seated kid in `swing` mode (design units); swingKid seats the torso bottom on the plank */
const SWING_HIP = 733;

/** side view facing screen-right; march footfalls land at phase 0 (near foot) and 0.5 (far foot), like the front view.
 *  The stance foot is planted: it slides back at exactly the walking speed while the hip rises and falls over it. */
export const bodySide = (p: Pen, o: Outfit, opts: SideOpts) => {
  const { phase = 0, expr = "neutral", mode = "march", blink = false, stomp = 1, pose = 0, stride = 1, light = DEF_LIGHT, seed = 1 } = opts;
  const Bd = BUILD[o.build ?? "adult"], skin = o.skin ?? SKIN, two = Math.PI * 2, lid = lidOf(blink);
  const H: Blob = { ...headBlob(seed, Bd.a, 1), asym: 0.12, rot: rad(3 + 3 * (rnd(seed, 7) - 0.5)) };
  const W = 2 * H.a, HH = 2 * H.b, u = W / 100, sole = 975, ankY = sole - 4 * u;
  const thick = thickAngle(light), ow = 5 * u;
  const legLen = (Bd.legs + 0.12) * HH - 4 * u, l1 = legLen / 2, l2 = legLen / 2;
  const nearCol = mix(o.pants, INK, 0.55), farCol = mix(o.pants, INK, 0.75), footCol = o.boots;
  type LegS = { ank: P2; pitch: number; near: boolean };
  const legs: LegS[] = [];
  let hipY = ankY - legLen * 0.995, lean = 0, nearFwd = 0;
  if (mode === "march") {
    const S = 370 * stride, liftH = Math.max(22, 40 + 70 * (stomp - 1));
    const st = (ph: number) => {
      const c = (((phase + ph) % 1) + 1) % 1;
      if (c < 0.5) { const s = c / 0.5; return { x: S / 2 - S * s, h: 0, stance: true, s }; }
      const s = (c - 0.5) / 0.5; // swing: cycloid in world space, so the foot leaves and lands at zero ground speed
      return { x: -S / 2 + S * s - (S / Math.PI) * Math.sin(2 * Math.PI * s), h: liftH * Math.sin(Math.PI * s), stance: false, s };
    };
    const nL = st(0), fL = st(0.5), stance = nL.stance ? nL : fL;
    const Leff = legLen * (1 - 0.035 * Math.sin(Math.PI * stance.s));
    hipY = ankY - Math.sqrt(Math.max(1, Leff * Leff - stance.x * stance.x));
    for (const [L, near] of [[fL, false], [nL, true]] as const)
      legs.push({ ank: [300 + L.x, ankY - L.h], pitch: L.stance ? 0 : rad(35 * Math.sin(Math.PI * L.s) * (1 - 1.6 * L.s)), near });
    lean = 4 + 3 * Math.cos(2 * two * phase) + (opts.run ? 9 : 0); // 7 deg at contact, 1 deg at passing
    nearFwd = nL.x / (S / 2);
  } else if (mode === "push") {
    hipY = ankY - 0.87 * legLen;
    legs.push({ ank: [300 - 0.5 * legLen, ankY], pitch: rad(-8), near: false }, { ank: [300 + 0.32 * legLen, ankY], pitch: 0, near: true });
    lean = 14 * pose;
  } else if (mode === "swing") {
    hipY = SWING_HIP;
    const a = rad(60 * pose);
    for (const [dx, near] of [[-6, false], [0, true]] as const) {
      const knee: P2 = [300 + l1 * 0.98 + dx * u, hipY + 6 * u];
      legs.push({ ank: [knee[0] + l2 * Math.sin(a), knee[1] + l2 * Math.cos(a)], pitch: -a * 0.5, near });
    }
  } else {
    legs.push({ ank: [300 - 4 * u, ankY], pitch: 0, near: false }, { ank: [300 + 4 * u, ankY], pitch: 0, near: true });
  }
  const torsoBot = hipY + 0.12 * HH, chin = torsoBot - Bd.torso * HH, hc = chin - H.b, crown = hc - H.b, hip: P2 = [300, hipY];
  p.rot = null;
  for (const L of legs) {
    const knee = mode === "swing" ? ([300 + l1 * 0.98 + (L.near ? 0 : -6 * u), hipY + 6 * u] as P2) : ik(hip, L.ank, l1, l2);
    const hp0: P2 = [300 + (L.near ? 0 : -5 * u), hipY];
    p.stroke([hp0, knee, L.ank], 5.8 * u, L.near ? nearCol : farCol);
    const c = Math.cos(L.pitch), s = Math.sin(L.pitch);
    footStroke(p, [L.ank[0] - 3 * u * c, L.ank[1] - 3 * u * s], [L.ank[0] + 13 * u * c, L.ank[1] + 13 * u * s + 0.5 * u],
      7.5 * u, L.near ? footCol : footCol === INK ? INK : shade(footCol, 0.82));
  }
  // ---- upper body leans about the hip ----
  p.rot = lean ? [rad(lean), 300, hipY] : null;
  const T: Blob = { a: (o.build === "stout" ? 0.36 : 0.31) * W, b: 0.5 * (torsoBot - (chin - 0.25 * HH)), nTop: 2.2, nBot: 2.5, egg: 0.1, asym: 0.06,
    rot: 0, noise: 0.006, seed: seed + 7 };
  const tcx = 300 + 2 * u, tcy = torsoBot - T.b, tp = blobPts(tcx, tcy, T);
  const armCol = mix(o.jacket, INK, 0.5), farArm = mix(o.jacket, INK, 0.68);
  const S: P2 = [tcx + 0.05 * T.a, chin + 0.14 * HH], aLen = 0.95 * HH;
  const swingArm = (ang: number): [P2, P2, P2] => {
    const e: P2 = [S[0] + Math.sin(ang) * aLen * 0.5, S[1] + Math.cos(ang) * aLen * 0.5], a2 = ang + rad(16) * Math.sign(ang || 1);
    return [S, e, [e[0] + Math.sin(a2) * aLen * 0.5, e[1] + Math.cos(a2) * aLen * 0.5]];
  };
  const rifle = !!o.rifle && !opts.aim && !opts.trumpet && (mode === "march" || mode === "stand");
  const B0: P2 = [tcx + 0.72 * T.a, chin + 0.58 * HH], B1: P2 = [tcx - 0.95 * T.a - 22 * u, crown - 0.4 * HH];
  let near: [P2, P2, P2], far: [P2, P2, P2] | null;
  if (mode === "swing") { near = [S, [S[0] + 12 * u, S[1] - 0.16 * HH], [300 + 6 * u, chin - 0.3 * HH]]; far = [S, [S[0] + 8 * u, S[1] - 0.18 * HH], [300 + 2 * u, chin - 0.36 * HH]]; }
  else if (mode === "push") {
    const reach = 0.55 * HH + 0.45 * HH * pose;
    let hN: P2 = [S[0] + reach, S[1] + 0.06 * HH];
    if (opts.hand) {
      // target is in final canvas units; the arm is drawn inside the lean rotation, so undo it
      const th = -rad(lean), dx = opts.hand[0] - 300, dy = opts.hand[1] - hipY;
      const tg: P2 = [300 + dx * Math.cos(th) - dy * Math.sin(th), hipY + dx * Math.sin(th) + dy * Math.cos(th)];
      hN = [hN[0] + (tg[0] - hN[0]) * pose, hN[1] + (tg[1] - hN[1]) * pose];
    }
    near = [S, [(S[0] + hN[0]) / 2, (S[1] + hN[1]) / 2 + 0.06 * HH], hN];
    far = [S, [(S[0] + hN[0]) / 2 - 4 * u, (S[1] + hN[1]) / 2 - 0.02 * HH], [hN[0] - 6 * u, hN[1] - 0.08 * HH]];
  } else if (rifle) { near = [S, [S[0] - 4 * u, S[1] + 0.42 * HH], B0]; far = mode === "march" ? swingArm(rad(30) * nearFwd) : swingArm(0); }
  else { near = swingArm(rad(-30) * nearFwd); far = mode === "march" ? swingArm(rad(30) * nearFwd) : null; }
  const A0: P2 = [tcx - 0.55 * T.a, chin + 0.36 * HH], A1: P2 = [tcx + 1.7 * HH, chin + 0.24 * HH];
  if (opts.aim) { near = [S, [S[0] + 0.2 * HH, S[1] + 0.3 * HH], lerp2(A0, A1, 0.42)]; far = [S, [S[0] + 0.1 * HH, S[1] + 0.28 * HH], lerp2(A0, A1, 0.2)]; }
  const mouthP: P2 = [300 + 4 * u + 36 * u, hc + 21 * u];
  if (opts.trumpet) { near = [S, [S[0] + 0.3 * HH, S[1] + 0.22 * HH], [mouthP[0] + 8 * u, mouthP[1] + 6 * u]]; far = [S, [S[0] + 0.26 * HH, S[1] + 0.24 * HH], [mouthP[0] + 0.28 * HH, mouthP[1] + 2 * u]]; }
  if (far) { p.stroke(curve(far[0], far[1], far[2]), 5.2 * u, farArm); p.dot(far[2][0], far[2][1], 5.5 * u); }
  p.gradFill(tp, o.jacket, mul(o.jacket, SH_CLOTH), light);
  p.clip(tp, () => {
    if (o.belt) p.band([[tcx - 0.65 * T.a, chin - 0.05 * HH], [tcx + 0.75 * T.a, torsoBot - 0.1 * HH]], o.belt!, 5.5 * u, 1.8 * u);
    if (o.sash) p.band([[tcx - 1.3 * T.a, torsoBot - 0.32 * HH], [tcx + 1.3 * T.a, torsoBot - 0.32 * HH]], o.sash, 0.13 * HH, 1.8 * u);
    if (!o.dress) for (let i = 0; i < 3; i++) { const y = chin + 0.16 * HH + i * 0.24 * HH; p.dot(tcx + 0.8 * T.a, y, 3 * u, INK); p.dot(tcx + 0.8 * T.a, y, 2.2 * u, o.buttons ?? shade(o.jacket, 0.7)); }
  });
  p.inkRing(tp, ow, thick);
  if (opts.aim) {
    p.band([A0, A1], "#7a4b2a", 5 * u, 1.5 * u, "round");
    p.band([lerp2(A0, A1, 0.5), A1], "#8d949c", 2.4 * u, 1.2 * u, "round");
  }
  if (rifle) {
    if (o.spear) { p.band([B0, B1], "#8a5a34", 4 * u, 1.4 * u, "round"); p.poly([[B1[0] - 5 * u, B1[1] + 6 * u], [B1[0] + 7 * u, B1[1] + 2 * u], [B1[0] - 6 * u, B1[1] - 18 * u]], "#c9932e", 1.6 * u); }
    else { p.band([B0, B1], "#7a4b2a", 5 * u, 1.5 * u, "round"); p.band([lerp2(B0, B1, 0.6), B1], "#8d949c", 2.4 * u, 1.2 * u, "round"); }
  }
  p.stroke(curve(near[0], near[1], near[2]), 5.2 * u, armCol); p.dot(near[2][0], near[2][1], 5.5 * u);
  // ---- head ----
  const hx = 300 + 4 * u;
  hatBehind(p, o, H, hx, hc, light, thick, ow, true);
  const hp = blobPts(hx, hc, H);
  p.shadedFill(hp, skin, mul(skin, SH_SKIN), light, H.a);
  p.inkRing(hp, ow, thick);
  hatOn(p, o, hp, H, hx, hc, light, seed, 1, true);
  const brim = !!o.hat && o.hat !== "hair" && o.hat !== "bonnet" && o.hat !== "cap";
  faceSide(p, hx, hc, W, expr, lid, brim, skin, o.moustache, o.build === "stout");
  if (opts.trumpet) {
    const m0: P2 = [mouthP[0] + 2 * u, mouthP[1]], m1: P2 = [m0[0] + 0.62 * HH, m0[1] - 0.14 * HH];
    p.band([m0, m1], "#f0c04a", 4 * u, 1.3 * u, "round");
    const dx = m1[0] - m0[0], dy = m1[1] - m0[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l, ex: P2 = [m1[0] + dx / l * 18 * u, m1[1] + dy / l * 18 * u];
    p.poly([[m1[0] + nx * 3 * u, m1[1] + ny * 3 * u], [ex[0] + nx * 15 * u, ex[1] + ny * 15 * u], [ex[0] - nx * 15 * u, ex[1] - ny * 15 * u], [m1[0] - nx * 3 * u, m1[1] - ny * 3 * u]], "#f0c04a", 2 * u);
    p.ell(ex[0], ex[1], 4 * u, 15 * u, "#b8862a", 1.6 * u, 0, 360, (Math.atan2(dy, dx) * 180) / Math.PI);
    p.dot(near[2][0], near[2][1], 5.5 * u);
  }
  p.rot = null;
};

/** rope + seat + seated kid on a 700 x 2300 canvas; the pivot is design (350, 20); kid drawn at 0.92 scale */
export const swingKid = (p: Pen, o: Outfit, kick: number, expr: Expr, light = DEF_LIGHT, blink: number = 0) => {
  const rope = 1830, k = 1.1, HH = 2 * headBlob(5, BUILD[o.build ?? "adult"].a, 1).b;
  // two ropes from the pivot to the ends of a wide plank, the kid framed between them: a single rope behind the kid
  // ended at the cap and read as a hanging. Far rope behind the kid, near rope drawn over (clear of the face).
  const seat = rope + 18, x0 = 150, x1 = 550;
  p.line([[350, 20], [x0 + 16, seat + 4]], "#a07a4c", 10);
  p.poly(rrect(x0, seat, x1, seat + 36, 10), "#b5653f", 9);
  const g = p.g;
  g.save();
  g.translate(350 - 300 * k, rope + 18 - (SWING_HIP + 0.12 * HH) * k);
  g.scale(k, k);
  bodySide(new Pen(g), o, { expr, mode: "swing", pose: kick, light, seed: 5, blink });
  g.restore();
  p.line([[350, 20], [x1 - 16, seat + 4]], "#a07a4c", 10);
};

// ---------------- effects ----------------
export const fxNote = (p: Pen, kind: number, col = "#1f2a44") => {
  p.ell(70, 200, 46, 34, col, 8, 0, 360, -20);
  p.stroke([[110, 190], [110, 40]], 14);
  if (kind === 0) p.poly([[110, 40], [170, 70], [170, 110], [110, 82]], col, 8);
  else {
    p.ell(150, 170, 40, 30, col, 8, 0, 360, -20);
    p.stroke([[186, 160], [186, 20]], 14);
    p.poly([[110, 40], [186, 20], [186, 50], [110, 70]], col, 8);
  }
};

/** spark / impact star on a 500 x 500 canvas; t in 0..1 */
export const fxBurst = (p: Pen, t: number, col = "#fff3b0", rays = 10, r0 = 40, r1 = 230) => {
  const c = 250, e = 1 - (1 - t) ** 3;
  for (let i = 0; i < rays; i++) {
    const a = rad((i * 360) / rays + 7 * (i % 2)), ra = r0 + (r1 - r0) * e * (0.75 + 0.25 * (i % 2));
    p.poly([[c + r0 * 0.5 * Math.cos(a + 0.18), c + r0 * 0.5 * Math.sin(a + 0.18)], [c + ra * Math.cos(a), c + ra * Math.sin(a)],
      [c + r0 * 0.5 * Math.cos(a - 0.18), c + r0 * 0.5 * Math.sin(a - 0.18)]], col, Math.max(3, 8 * (1 - t)));
  }
  if (t < 0.5) p.ell(c, c, r0 * (1.4 - t), r0 * (1.4 - t), WHITE, 8);
};

/** water splash crown on an 800 x 800 canvas; t in 0..1 */
export const fxSplash = (p: Pen, t: number, mud = false) => {
  const c = 400, size = 800, rise = Math.sin(Math.min(1, t * 1.3) * Math.PI);
  const blue = mud ? "#8a6a45" : "#bfe8ff", deep = mud ? "#5d4630" : "#6cc0f0";
  if (rise > 0.02) {
    const pts: P2[] = [];
    for (let i = 0; i < 19; i++) {
      const h = (i % 2 ? 260 : 130) * rise * (0.7 + 0.3 * Math.sin(i * 1.7));
      pts.push([c - 330 + (660 * i) / 18, size - 120 - h]);
    }
    p.poly([...pts, [c + 330, size - 90], [c - 330, size - 90]], blue, 10);
    p.ell(c, size - 100, 360, 46, deep, 10);
  }
  for (let i = 0; i < 8; i++) {
    const a = rad(200 + i * 18), d = 120 + 380 * t, y = size - 160 + d * Math.sin(a) + 520 * t * t, r = 26 * (1 - t) + 6;
    if (t > 0.08 && y < size - 40) p.ell(c + d * Math.cos(a), y, r, r * 1.25, blue, 7);
  }
};

/** dust puff on a 300 x 300 canvas; t in 0..1 */
export const fxPuff = (p: Pen, t: number) => {
  for (let i = 0; i < 5; i++) {
    const a = rad(160 + i * 55), d = 40 + 70 * t, r = (34 + 20 * (i % 2)) * (1 - 0.6 * t);
    p.ell(150 + d * Math.cos(a), 180 + d * 0.45 * Math.sin(a), r, r * 0.8, `rgba(238,225,205,${(1 - t).toFixed(3)})`, 0);
  }
};

/** circling stars on a 420 x 210 canvas */
export const fxStars = (p: Pen, t: number) => {
  for (let i = 0; i < 4; i++) {
    const a = t * Math.PI * 2 + (i * Math.PI) / 2, x = 210 + 150 * Math.cos(a), y = 110 + 40 * Math.sin(a), pts: P2[] = [];
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 14 : 34, b = rad(k * 36 - 90); pts.push([x + r * Math.cos(b), y + r * Math.sin(b)]); }
    p.poly(pts, "#ffd84a", 6);
  }
};

/** three jittering strain ticks on a 300 x 300 canvas */
export const fxCreak = (p: Pen, t: number) => {
  const j = 6 * Math.sin(t * 40);
  for (const a of [-30, 0, 30]) {
    const b = rad(a - 90);
    p.stroke([[150 + 70 * Math.cos(b) + j, 230 + 70 * Math.sin(b)], [150 + 100 * Math.cos(b) + 10 + j, 230 + 100 * Math.sin(b)],
      [150 + 130 * Math.cos(b) + j, 230 + 130 * Math.sin(b)]], 10);
  }
};

/** flat water ring (drawn top-down) on a 600 x 600 canvas; t in 0..1 */
export const fxRing = (p: Pen, t: number) => {
  // thin light water rings (white crest, pale blue trailing rings), thinning as they spread
  const g = p.g;
  for (let k = 0; k < 3; k++) {
    const u = t - k * 0.22;
    if (u <= 0 || u >= 1) continue;
    g.beginPath(); g.ellipse(300, 300, 60 + 230 * u, 60 + 230 * u, 0, 0, Math.PI * 2);
    g.strokeStyle = k === 0 ? "#f6fcff" : "#cfe8fa"; g.lineWidth = 9 * (1 - u) + 3; g.stroke();
  }
};

/** text-free sign on a 700 x 520 canvas: "no marching in step on the bridge". A bridge (deck + arch + piers), four
 *  identical pairs of marching legs in the same stride (in step), a bold red X over all of it. */
export const fxSign = (p: Pen) => {
  const g = p.g, RED = "#d42f2f";
  p.poly(rrect(14, 14, 686, 506, 40), "#f6ecd2", 0);
  p.poly(rrect(14, 14, 686, 506, 40), null, 14);
  // bridge: deck, stone arch underneath, two piers
  p.poly(rrect(70, 352, 630, 384, 8), "#8a5a3a", 9);
  g.beginPath(); g.moveTo(112, 470); g.quadraticCurveTo(350, 300, 588, 470);
  g.strokeStyle = INK; g.lineWidth = 16; g.lineCap = "round"; g.stroke();
  for (const x of [88, 612]) p.poly(rrect(x - 16, 384, x + 16, 470, 4), "#8a5a3a", 9);
  // four identical soldiers' legs mid-stride: same leg forward on every one = in step
  for (const x of [150, 278, 406, 534]) {
    p.poly(rrect(x - 30, 150, x + 30, 214, 14), "#357650", 9);                  // coat hem
    p.stroke([[x - 8, 210], [x + 34, 262], [x + 46, 338]], 15, INK);           // front leg
    p.stroke([[x + 6, 210], [x - 12, 274], [x - 36, 336]], 15, INK);           // back leg
    p.poly(rrect(x + 30, 330, x + 74, 350, 9), INK, 0);                          // boots point forward
    p.poly(rrect(x - 52, 328, x - 8, 348, 9), INK, 0);
  }
  // big red X
  for (const [a, b] of [[[96, 70], [604, 452]], [[604, 70], [96, 452]]] as [[number, number], [number, number]][]) {
    p.stroke([a, b], 58, "#ffffff");
    p.stroke([a, b], 42, RED);
  }
};

/** soft cartoon cloud on a 600 x 300 canvas */
export const fxCloud = (p: Pen, seed: number) => {
  const blobs: [number, number, number][] = [[150, 190, 80], [250, 150, 105], [360, 160, 95], [450, 195, 70], [300, 210, 90]];
  for (const [x, y, r] of blobs) p.ell(x + ((seed * 37) % 20) - 10, y, r, r * 0.8, "#ffffff", 0);
  p.ell(300, 235, 230, 40, "#ffffff", 0);
};

/** cast shadow on a 128 x 256 canvas: dark soft contact pool at the feet (y 205) and a softer tail that runs up the
 *  canvas = away from the sun, fading with distance; multiply colour (sRGB-encoded linear ratio), white = no change */
export const fxShadow = (p: Pen, col: string) => {
  const g = p.g;
  g.fillStyle = WHITE; g.fillRect(0, 0, 128, 256);
  g.save(); g.filter = "blur(9px)";
  const lg = g.createLinearGradient(0, 205, 0, 22);
  lg.addColorStop(0, mix(col, WHITE, 0.08)); lg.addColorStop(0.55, mix(col, WHITE, 0.3)); lg.addColorStop(1, mix(col, WHITE, 0.85));
  g.fillStyle = lg;
  g.beginPath(); g.moveTo(40, 205); g.bezierCurveTo(36, 120, 46, 50, 64, 30); g.bezierCurveTo(82, 50, 92, 120, 88, 205); g.closePath(); g.fill();
  g.fillStyle = col; g.beginPath(); g.ellipse(64, 205, 30, 17, 0, 0, Math.PI * 2); g.fill();
  g.restore();
};

/** tight contact shadow right under the feet on a 128 x 128 canvas: dark core, short fall-off (multiply colour) */
export const fxContact = (p: Pen, col: string) => {
  const g = p.g;
  g.fillStyle = WHITE; g.fillRect(0, 0, 128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [r, k] of [[0, 0], [0.32, 0.02], [0.5, 0.22], [0.66, 0.58], [0.82, 0.88], [1, 1]] as const) gr.addColorStop(r, mix(col, WHITE, k));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
};

/** floating wooden plank, side-on, on a 320 x 110 canvas */
export const fxPlank = (p: Pen) => {
  p.poly(rrect(14, 30, 306, 78, 10), "#a8744a", 9);
  p.line([[40, 46], [150, 44], [270, 50]], "#7d5234", 4);
  p.line([[60, 62], [200, 64], [284, 60]], "#7d5234", 4);
  p.dot(36, 54, 5, INK); p.dot(284, 54, 5, INK);
};

/** floating marching drum (no text) on a 260 x 240 canvas: white shell, red hoops, ink zig-zag cord */
export const fxDrum = (p: Pen) => {
  p.poly(rrect(40, 70, 220, 190, 16), "#f1ece0", 9);
  p.poly(rrect(32, 58, 228, 86, 12), "#c9373a", 8);
  p.poly(rrect(32, 176, 228, 204, 12), "#c9373a", 8);
  p.line([[52, 88], [82, 172], [112, 88], [142, 172], [172, 88], [202, 172]], INK, 6);
  p.ell(130, 58, 98, 18, "#f7f3ea", 8);
};

/** soft ground contact blob on a 128 x 128 canvas, multiply colour (sRGB-encoded linear ratio) in the centre */
export const fxBlob = (p: Pen, col: string) => {
  const g = p.g;
  g.fillStyle = WHITE; g.fillRect(0, 0, 128, 128);
  // soft contact shadow: flat core, then a long smooth (roughly gaussian) fall-off to white = no change
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [r, k] of [[0, 0], [0.5, 0.04], [0.64, 0.18], [0.76, 0.42], [0.87, 0.72], [0.95, 0.92], [1, 1]] as const) gr.addColorStop(r, mix(col, WHITE, k));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
};

// ================= Arcole cast (our own designs) =================
/** French line infantry 1796: blue coat, white belts and breeches, bicorne */
export const french = (v = 0, extra: Partial<Outfit> = {}): Outfit => {
  const o: Outfit = { jacket: "#2f4f9a", pants: "#e9e4d6", boots: INK, hat: "bicorne", belt: "#f4f1e8", buttons: "#e8c45a", rifle: true, skin: SKINS[v % 4] };
  if (v % 4 === 1) o.moustache = "#4a3426";
  if (v % 4 === 3) o.moustache = "#2a201a";
  return { ...o, ...extra };
};
/** the young general: thin, long dark hair under a gold-edged bicorne, tricolour sash, sword */
export const NAPOLEON: Outfit = { jacket: "#2a3f7e", pants: "#ece6d4", boots: INK, hat: "bicorne_gen", buttons: "#e8c45a", sash: "#c8323a", sword: true, skin: "#ffe6cc" };
export const MUDDY: Outfit = { ...NAPOLEON, jacket: "#6b4f33", pants: "#8a6a45", buttons: "#7d5f3c", sash: "#7a4a35", skin: "#c9a07a", mud: true };
export const AIDE: Outfit = { ...NAPOLEON, hat: "bicorne", sash: "#e8c45a", jacket: "#344d8e", moustache: "#5a3b2a", skin: SKINS[1] };
export const OFFICER_FR: Outfit = { ...NAPOLEON, hat: "bicorne_gen", sash: "#e8c45a", jacket: "#2f4f9a", moustache: "#4a3020", build: "stout", skin: SKINS[2] };
/** Austrian infantry 1796: white coat, red facings, black leather kasket with a brass plate */
export const austrian = (v = 0, extra: Partial<Outfit> = {}): Outfit => {
  const o: Outfit = { jacket: "#f1ede2", pants: "#e6e1d3", boots: INK, hat: "kasket", belt: "#c8323a", buttons: "#e8c45a", rifle: true, skin: SKINS[(v + 2) % 4] };
  if (v % 3 === 1) o.moustache = "#3a2a1e";
  return { ...o, ...extra };
};
/** mounted guide / trumpeter: green coat, red sash, fur colpack */
export const guide = (v = 0): Outfit => ({ jacket: "#2f6a43", pants: "#c8323a", boots: INK, hat: "colpack", buttons: "#e8c45a", sash: "#e8c45a", skin: SKINS[v % 4], moustache: v % 2 ? "#3a2a1e" : undefined });
export const PAINTER: Outfit = { jacket: "#c9b48f", pants: "#4a4a5a", boots: "#5a3b2a", hat: "beret", cap: "#7a2f4a", skin: SKINS[1], moustache: "#6a4a2a", build: "stout" };
export const WALKER: Outfit = { jacket: "#5d6a8a", pants: "#3b3f52", boots: "#3a2a1e", hat: "tophat", skin: SKINS[0] };

/** a horse with a rider, side view facing screen-right, on a 1400 x 1400 design canvas (hooves at y = 1375).
 *  phase: trot cycle 0..1; the rider is drawn with bodySide, clipped above the saddle, the near leg drawn over the barrel. */
export const HORSE_GROUND = 1375;
export const horseRider = (p: Pen, rider: Outfit, o: { phase: number; expr: Expr; trumpet: boolean; blink: number; light?: number; seed?: number; coat?: string; mane?: string; ghost?: string; noRider?: boolean }) => {
  const g = p.g, coat = o.ghost ?? o.coat ?? "#8a5434", mane = o.ghost ?? o.mane ?? "#3a2418", ph = o.phase * Math.PI * 2, gy = HORSE_GROUND;
  const ink = o.ghost ? o.ghost : INK, ol = o.ghost ? 0 : 9;
  const bob = 10 * Math.sin(ph * 2);
  const bx = 700, by = gy - 500 + bob;
  const legs = (far: boolean) => {
    const col = far ? shade(coat, 0.72) : coat;
    for (const [x0, off] of [[bx + 175, 0], [bx - 185, 0.5]] as const) {
      const sw = Math.sin(ph + (far ? Math.PI : 0) + off * Math.PI * 2), lift = Math.max(0, sw) * 70;
      const hip: P2 = [x0 + (far ? -18 : 0), by + 60], knee: P2 = [x0 + 24 * sw + (far ? -18 : 0), by + 250 - lift * 0.4], hoof: P2 = [x0 + 60 * sw + (far ? -18 : 0), gy - 14 - lift];
      if (!o.ghost) p.stroke([hip, knee, hoof], 62, ink);
      p.stroke([hip, knee, hoof], 44, col);
      p.ell(hoof[0] + 8, hoof[1] + 2, 30, 18, o.ghost ?? "#2a2026", 0);
    }
  };
  legs(true);
  // tail
  p.line([[bx - 250, by - 40], [bx - 330, by + 40], [bx - 315, by + 200]], mane, 36, !o.ghost);
  // rider body (upper half only), seated over the saddle
  const RS = 1.0;
  if (o.noRider) { /* chariot horse: no rider */ } else if (!o.ghost) {
    g.save();
    g.beginPath(); g.rect(0, 0, 1400, by - 60); g.clip();
    g.translate(bx - 300 * RS - 10, by - 160 - 640 * RS);
    g.scale(RS, RS);
    bodySide(new Pen(g), rider, { mode: "stand", expr: o.expr, blink: o.blink, light: o.light, seed: o.seed, trumpet: o.trumpet });
    g.restore();
  } else {
    // ghost rider: a flat silhouette (head, hat, torso)
    p.ell(bx, by - 230, 80, 120, o.ghost, 0); p.ell(bx + 10, by - 410, 70, 66, o.ghost, 0); p.ell(bx + 5, by - 500, 66, 70, o.ghost, 0);
    p.poly([[bx + 60, by - 350], [bx + 260, by - 420], [bx + 300, by - 380], [bx + 70, by - 320]], o.ghost, 0);
  }
  // barrel, neck, head
  const barrel: P2[] = [];
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; barrel.push([bx + 270 * Math.cos(a), by + 120 * Math.sin(a) * (Math.sin(a) > 0 ? 1.05 : 0.95)]); }
  const neck: P2[] = [[bx + 150, by - 90], [bx + 300, by - 330], [bx + 380, by - 380], [bx + 410, by - 300], [bx + 300, by - 120], [bx + 230, by + 60]];
  p.poly(neck, coat, ol); p.poly(barrel, coat, ol);
  if (!o.ghost) {
    p.clip(barrel, () => { p.ell(bx - 10, by + 95, 280, 60, shade(coat, 0.8), 0); });
    p.poly(barrel, null, ol);
    if (!o.noRider) { p.poly([[bx - 120, by - 110], [bx + 90, by - 112], [bx + 80, by + 20], [bx - 110, by + 22]], "#2f4f9a", 7); p.stroke([[bx - 105, by + 8], [bx + 70, by + 6]], 8, "#e8c45a"); }
    else { p.poly([[bx - 60, by - 118], [bx + 120, by - 120], [bx + 110, by - 40], [bx - 50, by - 38]], "#c8323a", 7); p.stroke([[bx + 30, by - 130], [bx + 30, by - 210]], 14, "#e8c45a"); p.ell(bx + 30, by - 225, 22, 30, "#3f8fd9", 5); }
  }
  const head = ellPtsX(bx + 440, by - 330, 110, 52, 38);
  p.poly(head, coat, ol);
  p.poly([[bx + 352, by - 410], [bx + 372, by - 470], [bx + 395, by - 400]], coat, ol); // ear
  p.line([[bx + 372, by - 392], [bx + 300, by - 345], [bx + 230, by - 230], [bx + 160, by - 100]], mane, 34, !o.ghost);
  if (!o.ghost) {
    p.dot(bx + 430, by - 358, 9, INK);
    p.dot(bx + 515, by - 282, 6, INK);
    p.stroke([[bx + 500, by - 270], [bx + 300, by - 190], [bx + 120, by - 150]], 4, "#3a2418"); // reins
  }
  legs(false);
  // rider's near leg over the barrel
  if (!o.ghost && !o.noRider) {
    const hip: P2 = [bx - 10, by - 80], knee: P2 = [bx + 70, by + 30], ank: P2 = [bx + 40, by + 160];
    p.stroke([hip, knee, ank], 34, INK); p.stroke([hip, knee, ank], 24, rider.pants);
    p.stroke([ank, [ank[0] + 48, ank[1] + 6]], 30, INK);
    p.stroke([[ank[0] - 8, ank[1] - 30], [ank[0] - 2, ank[1] + 10]], 30, INK);
  }
};
const ellPtsX = (cx: number, cy: number, rx: number, ry: number, rotDeg: number): P2[] => {
  const r = rad(rotDeg), pts: P2[] = [];
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2, x = rx * Math.cos(a), y = ry * Math.sin(a); pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]); }
  return pts;
};

/** muzzle flash on a 400 x 400 canvas, t 0..1 */
export const fxMuzzle = (p: Pen, t: number) => {
  const k = 1 - t, r = 60 + 130 * Math.sqrt(t);
  const pts: P2[] = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r * 0.45 : r; pts.push([200 + rr * Math.cos(a), 200 + rr * Math.sin(a)]); }
  p.g.globalAlpha = Math.max(0, k);
  p.poly(pts, "#ffd35a", 6); p.ell(200, 200, r * 0.35, r * 0.35, "#fff6c8", 0);
  p.g.globalAlpha = 1;
};
/** grey musket smoke puff on a 400 x 400 canvas, t 0..1 (grows and thins) */
export const fxSmoke = (p: Pen, t: number) => {
  p.g.globalAlpha = Math.max(0, 0.95 * (1 - t) ** 0.7);
  const s = 0.5 + 0.5 * t;
  for (const [x, y, r, c] of [[150, 220, 80, "#c9c6cf"], [230, 190, 95, "#dcd9e1"], [260, 245, 70, "#c9c6cf"], [190, 160, 70, "#e9e6ee"]] as const)
    p.ell(200 + (x - 200) * s, 200 + (y - 200) * s, r * s, r * 0.85 * s, c, 0);
  p.g.globalAlpha = 1;
};
/** trumpet blast: concentric sound arcs + notes, 500 x 500 canvas, t 0..1 cycles */
export const fxBlast = (p: Pen, t: number) => {
  for (let k = 0; k < 3; k++) {
    const u = (t + k / 3) % 1, r = 50 + 200 * u;
    p.g.globalAlpha = 1 - u;
    p.arc(100, 250, r, r, -50, 50, 26, INK);
    p.arc(100, 250, r, r, -50, 50, 16, "#fff3b0");
  }
  p.g.globalAlpha = 1;
};
/** footstep "tap" marks: three short strokes fanning out, 300 x 300 canvas */
export const fxTap = (p: Pen, t: number) => {
  p.g.globalAlpha = Math.max(0, 1 - t);
  for (const a of [-40, 0, 40]) {
    const r0 = 60 + 50 * t, r1 = 110 + 60 * t, aa = rad(a - 90);
    p.stroke([[150 + r0 * Math.cos(aa), 220 + r0 * Math.sin(aa)], [150 + r1 * Math.cos(aa), 220 + r1 * Math.sin(aa)]], 16, "#fff3b0");
  }
  p.g.globalAlpha = 1;
};
/** idea burst: light bulb, 300 x 400 canvas */
export const fxBulb = (p: Pen, t: number) => {
  const s = Math.min(1, t * 4);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.stroke([[150 + 95 * s * Math.cos(a), 150 + 95 * s * Math.sin(a)], [150 + 130 * s * Math.cos(a), 150 + 130 * s * Math.sin(a)]], 12, "#fff3b0"); }
  p.ell(150, 150, 70 * s, 72 * s, "#ffe066", 9);
  p.poly([[120, 215], [180, 215], [175, 265], [125, 265]].map(([x, y]) => [150 + (x - 150) * s, 150 + (y - 150) * s] as P2), "#9aa0aa", 8);
};
/** a looming wall shadow of a whole crowd of soldiers (dark violet, soft edged), 1600 x 800 canvas */
export const fxCrowdShadow = (p: Pen, seed: number, col = "#1a1430") => {
  const g = p.g;
  g.save(); g.filter = "blur(3px)";
  for (let i = 0; i < 14; i++) {
    const x = 60 + i * 110 + ((i * 37 + seed) % 30), h = 560 + ((i * 53) % 140), w = 90;
    p.ell(x, 800 - h * 0.4, w, h * 0.42, col, 0); // body
    p.ell(x, 800 - h * 0.86, 52, 50, col, 0); // head
    p.ell(x, 800 - h * 0.98, 92, 26, col, 0); // bicorne
    p.poly([[x + 40, 800 - h * 0.7], [x + 60, 800 - h * 1.12], [x + 72, 800 - h * 1.1], [x + 56, 800 - h * 0.68]], col, 0); // musket
  }
  g.restore();
};
/** the painting: gold frame, heroic general on the bridge with the flag, battle smoke (1000 x 780 canvas) */
export const fxPainting = (p: Pen) => {
  const g = p.g;
  const sky = g.createLinearGradient(0, 40, 0, 740); sky.addColorStop(0, "#f2b56b"); sky.addColorStop(0.55, "#f7dca0"); sky.addColorStop(1, "#c98e5a");
  g.fillStyle = sky; g.fillRect(40, 40, 920, 700);
  for (const [x, y, r] of [[200, 330, 120], [320, 300, 90], [760, 320, 130], [860, 360, 90], [120, 420, 80]] as const) p.ell(x, y, r, r * 0.6, "#e8d6c0", 0);
  // bridge in perspective
  p.poly([[40, 610], [960, 560], [960, 640], [40, 720]], "#6b4a30", 6);
  p.poly([[40, 560], [960, 520], [960, 540], [40, 585]], "#8a6040", 5);
  for (let i = 0; i < 12; i++) { const x = 60 + i * 80; p.stroke([[x, 585 - i * 3.5], [x, 640 - i * 4]], 8, "#5a3a24"); }
  // tiny soldiers following
  for (let i = 0; i < 9; i++) { const x = 90 + i * 34, y = 600 - i * 1.5; p.ell(x, y - 30, 12, 22, "#2f4f9a", 3); p.ell(x, y - 60, 10, 10, "#ffe2c2", 3); p.ell(x, y - 70, 16, 5, "#23242c", 0); }
  // the hero
  g.save(); g.translate(390, 20); g.scale(0.66, 0.66);
  bodyFront(new Pen(g), NAPOLEON, { mode: "march", phase: 0.15, expr: "stern", prop: ["flag", 0.3], tilt: -8, facing: 1, light: rad(-140), seed: 3, lift: 90 });
  g.restore();
  // varnish glow + frame
  const v = g.createRadialGradient(500, 380, 100, 500, 380, 560); v.addColorStop(0, "rgba(255,240,200,0)"); v.addColorStop(1, "rgba(80,40,10,0.35)");
  g.fillStyle = v; g.fillRect(40, 40, 920, 700);
  g.lineJoin = "miter";
  g.strokeStyle = "#c9932e"; g.lineWidth = 56; g.strokeRect(28, 28, 944, 724);
  g.strokeStyle = "#f2cf6a"; g.lineWidth = 14; g.strokeRect(36, 36, 928, 708);
  g.strokeStyle = INK; g.lineWidth = 8; g.strokeRect(4, 4, 992, 772); g.strokeRect(54, 54, 892, 672);
};
/** tall marsh reeds clump (alpha cut-out) on a 512 x 512 canvas, base at the bottom */
export const reedClump = (p: Pen, seed: number) => {
  const r = (k: number) => rnd(seed, k);
  const cols = ["#7d9a3c", "#8faa48", "#6b8a34", "#a7b65a", "#5f7d30"];
  for (let i = 0; i < 26; i++) {
    const x0 = 120 + r(i) * 272, lean = (r(i + 40) - 0.5) * 120, h = 300 + r(i + 80) * 200;
    const col = cols[i % 5];
    p.stroke([[x0, 512], [x0 + lean * 0.4, 512 - h * 0.6], [x0 + lean, 512 - h]], 13, INK);
    p.stroke([[x0, 512], [x0 + lean * 0.4, 512 - h * 0.6], [x0 + lean, 512 - h]], 8, col);
    if (i % 3 === 0) p.ell(x0 + lean, 512 - h - 18, 9, 26, "#6b4a2b", 4, 0, 360, (lean / 3));
  }
};

/** a bicorne on its own (flying off a head), 300 x 160 canvas */
export const fxBicorne = (p: Pen) => {
  const top: P2[] = [], bot: P2[] = [];
  for (let i = 0; i <= 16; i++) { const x = -1 + 2 * (i / 16); top.push([150 + 130 * x, 120 - 85 * (1 - x * x) ** 0.8 - 14 * x * x]); }
  for (let i = 16; i >= 0; i--) { const x = -1 + 2 * (i / 16); bot.push([150 + 125 * x, 128 - 6 * x * x]); }
  p.poly([...top, ...bot], "#23242c", 8);
  p.stroke(top.map(([x, y]) => [x, y + 6] as P2), 10, "#e8c45a");
  p.ell(200, 78, 18, 18, "#2f4f9a", 4); p.ell(200, 78, 12, 12, "#f4f0e6", 0); p.ell(200, 78, 6, 6, "#c8323a", 0);
};
/** low grass tuft with a few wild flowers (alpha cut-out), 256 x 256, base at the bottom */
export const flowerTuft = (p: Pen, seed: number) => {
  const r = (k: number) => rnd(seed, k);
  for (let i = 0; i < 16; i++) {
    const x0 = 40 + r(i) * 176, lean = (r(i + 30) - 0.5) * 60, h = 70 + r(i + 60) * 110;
    p.stroke([[x0, 256], [x0 + lean * 0.5, 256 - h * 0.6], [x0 + lean, 256 - h]], 9, INK);
    p.stroke([[x0, 256], [x0 + lean * 0.5, 256 - h * 0.6], [x0 + lean, 256 - h]], 5, ["#6f9a3a", "#88ad48", "#5f8a32"][i % 3]);
  }
  const cols = ["#f4d03f", "#ffffff", "#e86e9a", "#c9a0e8"];
  for (let i = 0; i < 4; i++) {
    const x = 60 + r(i + 90) * 136, y = 256 - 90 - r(i + 95) * 90, c = cols[(seed + i) % 4];
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; p.ell(x + 11 * Math.cos(a), y + 11 * Math.sin(a), 8, 8, c, 3); }
    p.ell(x, y, 6, 6, "#e8a33a", 2);
  }
};

// ================= Cher Ami cast (our own designs) =================
export const doughboy = (v = 0, extra: Partial<Outfit> = {}): Outfit => {
  const o: Outfit = { jacket: "#6f6c42", pants: "#6f6c42", boots: "#4a3a2a", hat: "brodie", belt: "#b8a46a", buttons: "#8a7a4a", rifle: true, skin: SKINS[v % 4] };
  if (v % 4 === 1) o.moustache = "#4a3426";
  return { ...o, ...extra };
};
export const MAJOR: Outfit = { ...doughboy(0), rifle: false, belt: null, sash: "#8a6a3a", buttons: "#e8c45a", skin: "#ffe6cc" };
export const SIGNAL: Outfit = { ...doughboy(2), rifle: false, hat: "brodie" };
export const german = (v = 0): Outfit => ({ jacket: "#7d8278", pants: "#5f6358", boots: "#2a2620", hat: "stahl", belt: "#3a3026", buttons: "#c9ccd2", rifle: true, skin: SKINS[(v + 1) % 4], moustache: v % 3 === 1 ? "#3a2a1e" : undefined });
export const GENERAL_FR: Outfit = { jacket: "#7f93b5", pants: "#7f93b5", boots: INK, hat: "kepi", buttons: "#e8c45a", sash: "#c8323a", moustache: "#e9e6dc", build: "stout", skin: SKINS[1], sword: true };
export const SCIENTIST: Outfit = { jacket: "#f4f2ec", pants: "#3b3f52", boots: "#3a2a1e", hat: "hair", hair: "#6a4a2a", skin: SKINS[2], buttons: "#c9ccd2" };
export const visitor = (v = 0): Outfit => ({ jacket: ["#3f6fb5", "#c25a7a", "#5d7a3a", "#d9a441", "#7b5ac9"][v % 5], pants: "#3b3f52", boots: "#4a3426", hat: v % 3 === 2 ? "cap" : "hair", cap: "#e2453c",
  hair: ["#2a1e16", "#8a5a2a", "#d9b26a", "#5a3b2a"][v % 4], skin: SKINS[v % 4], build: v % 4 === 3 ? "kid" : "adult" });

export type PigeonExpr = "neutral" | "determined" | "happy" | "shock" | "proud" | "wink" | "dazed" | "pained";
export type PigeonOpts = { view: "side" | "front"; flap?: number; fly?: boolean; expr?: PigeonExpr; eye?: "ok" | "patch"; leg?: "two" | "hang" | "peg";
  medal?: boolean; bow?: boolean; capsule?: boolean; blink?: number; tilt?: number; grey?: boolean };
const PG = { body: "#9aa3b8", dark: "#6c7590", bar: "#3a3f52", neckG: "#4f9a7e", neckP: "#8a5aa8", beak: "#4a4650", cere: "#f2efe6", foot: "#e88a8a", iris: "#f08a2a" };
/** Cher Ami on a 600 x 600 canvas: standing feet at y = 575, flying body centred at (300, 300); side view faces right */
export const pigeon = (p: Pen, o: PigeonOpts) => {
  const flap = o.flap ?? 0, expr = o.expr ?? "neutral", fly = !!o.fly, blink = o.blink ?? 0;
  const C = o.grey ? { ...PG, body: "#b9b6ae", dark: "#8f8c84", neckG: "#8f8c84", neckP: "#8f8c84" } : PG;
  const g = p.g;
  g.save();
  if (o.tilt) { g.translate(300, 300); g.rotate(rad(o.tilt)); g.translate(-300, -300); }
  const eyeAt = (ex: number, ey: number, r: number, side: number) => {
    if (o.eye === "patch" && side >= 0) { p.ell(ex, ey, r * 1.15, r * 1.0, INK, 0); return; }
    const shut = blink > 0.5 || (expr === "wink" && side >= 0) || expr === "happy";
    if (shut) { p.arc(ex, ey + r * 0.2, r * 0.9, r * 0.6, 200, 340, r * 0.35); return; }
    const big = expr === "shock" ? 1.3 : 1;
    p.ell(ex, ey, r * big, r * big, "#ffffff", r * 0.22);
    p.ell(ex + r * 0.15, ey, r * 0.62 * big, r * 0.62 * big, C.iris, 0);
    p.ell(ex + r * 0.2, ey, r * 0.34 * big, r * 0.34 * big, INK, 0);
    if (expr === "dazed") p.arc(ex, ey, r * 0.7, r * 0.7, 0, 300, r * 0.2);
  };
  const brow = (ex: number, ey: number, r: number, mirror = 1) => {
    const k = expr === "determined" || expr === "pained" ? 1 : expr === "proud" ? -0.4 : expr === "shock" ? -1 : 0;
    if (k === 0) return;
    p.stroke([[ex - r * 1.1 * mirror, ey - r * 1.5 + (k > 0 ? -r * 0.5 : 0)], [ex + r * 1.0 * mirror, ey - r * 1.5 + (k > 0 ? r * 0.35 : -r * 0.3)]], r * 0.4);
  };
  if (o.view === "side") {
    const cy = fly ? 300 : 360, tiltB = fly ? -6 : -18;
    const wingA = fly ? Math.sin(flap * Math.PI * 2) : 0;
    const wing = (near: boolean) => {
      const sx = 290, sy = cy - 40, L = fly ? 250 : 0, a = rad(-90 * wingA - 10), col = near ? C.body : C.dark;
      if (!fly) return;
      const tip: P2 = [sx - 60 + L * Math.cos(a) * 0.55, sy + L * Math.sin(a)], mid: P2 = [sx - 120, sy + 0.5 * L * Math.sin(a)];
      p.poly([[sx + 40, sy], [tip[0] + 40, tip[1]], tip, [mid[0] - 40, mid[1] + 10], [sx - 70, sy + 10]], col, 9);
      if (near) for (let k = 0; k < 4; k++) p.stroke([[tip[0] + 30 - k * 22, tip[1] + 4], [tip[0] + 18 - k * 26, tip[1] + 40 + 6 * k]], 6, C.bar);
    };
    wing(false);
    // tail
    p.poly([[175, cy - 10], [40, cy - 40 + (fly ? 30 : 60)], [55, cy + (fly ? 30 : 70)], [190, cy + 30]], C.dark, 9);
    p.stroke([[60, cy - 22 + (fly ? 30 : 60)], [70, cy + 18 + (fly ? 0 : 40)]], 10, C.bar);
    // legs
    const legY = cy + 95;
    if (!fly) {
      p.stroke([[300, legY - 20], [292, 568]], 10, C.foot); p.stroke([[280, 572], [318, 572]], 9, C.foot);
      if (o.leg === "peg") p.band([[330, legY - 20], [334, 572]], "#a8744a", 12, 3, "round");
      else p.stroke([[335, legY - 20], [338, 568]], 10, C.foot), p.stroke([[322, 572], [360, 572]], 9, C.foot);
    } else if (o.leg === "hang") {
      const sw = 14 * Math.sin(flap * Math.PI * 2 + 1);
      p.stroke([[300, cy + 80], [296 + sw, cy + 170], [290 + sw * 1.4, cy + 210]], 9, C.foot);
      if (o.capsule) p.band([[293 + sw, cy + 150], [297 + sw, cy + 195]], "#c9ccd2", 14, 3, "round");
    } else {
      p.stroke([[285, cy + 85], [240, cy + 110]], 9, C.foot);
      if (o.capsule) p.band([[262, cy + 96], [236, cy + 112]], "#c9ccd2", 14, 3, "round");
    }
    // body
    const bp = ellPts(300, cy, 155, 100, 0, 360, tiltB);
    p.gradFill(bp, C.body, mul(C.body, [0.78, 0.8, 0.88]), rad(-110));
    p.clip(bp, () => { p.ell(360, cy + 35, 90, 60, "#b7bfd0", 0); if (!fly) for (let k = 0; k < 2; k++) p.stroke([[180 + k * 40, cy - 30 + k * 26], [300 + k * 30, cy - 50 + k * 30]], 12, C.bar); });
    p.poly(bp, null, 9);
    if (!fly) { const fw = ellPts(255, cy - 10, 105, 55, 0, 360, tiltB + 8); p.poly(fw, C.dark, 7); for (let k = 0; k < 2; k++) p.stroke([[190 + k * 36, cy - 20 + k * 20], [290 + k * 26, cy - 40 + k * 22]], 12, C.bar); }
    wing(true);
    if (o.medal) { p.stroke([[420, cy - 50], [408, cy + 10]], 16, "#2f8a4f"); p.stroke([[414, cy - 50], [404, cy + 10]], 5, "#c8323a"); p.poly([[405, cy + 5], [430, cy + 30], [405, cy + 55], [380, cy + 30]], "#c9932e", 5); }
    // neck + head
    const hx = fly ? 455 : 425, hy = fly ? cy - 55 : cy - 135;
    p.poly([[hx - 55, hy + 25], [hx - 20, hy + 10], [hx + 10, hy + 45], [hx - 15, cy - 25], [hx - 95, cy - 35]], C.body, 8);
    p.stroke([[hx - 70, hy + 50], [hx - 15, hy + 50]], 14, C.neckG); p.stroke([[hx - 75, hy + 66], [hx - 20, hy + 66]], 10, C.neckP);
    p.ell(hx, hy, 66, 60, C.body, 9);
    p.poly([[hx + 55, hy - 2], [hx + 112, hy + 14], [hx + 55, hy + 24]], C.beak, 6);
    p.ell(hx + 62, hy + 2, 14, 9, C.cere, 4);
    if (expr === "pained" || expr === "shock") p.poly([[hx + 58, hy + 18], [hx + 100, hy + 26], [hx + 60, hy + 36]], C.beak, 5);
    eyeAt(hx + 18, hy - 8, 17, 1); brow(hx + 18, hy - 8, 17);
    if (o.eye === "patch") p.stroke([[hx - 60, hy - 30], [hx + 50, hy - 2]], 7, INK);
    if (o.bow) { p.ell(hx - 25, hy - 62, 26, 18, "#f07aa8", 5, 0, 360, -20); p.ell(hx + 15, hy - 70, 26, 18, "#f07aa8", 5, 0, 360, 20); p.ell(hx - 5, hy - 64, 10, 10, "#d94f86", 4); }
  } else {
    // front view, standing (held in hands, on a pedestal)
    const cy = 400;
    p.stroke([[265, cy + 90], [262, 568]], 10, C.foot); p.stroke([[240, 572], [282, 572]], 9, C.foot);
    if (o.leg === "peg") p.band([[335, cy + 90], [338, 572]], "#a8744a", 13, 3, "round");
    else { p.stroke([[335, cy + 90], [338, 568]], 10, C.foot); p.stroke([[318, 572], [360, 572]], 9, C.foot); }
    for (const s of [-1, 1]) p.poly(ellPts(300 + s * 105, cy + 10, 55, 110, 0, 360, s * 12), C.dark, 8);
    const bp = ellPts(300, cy, 125, 125, 0, 360, 0);
    p.gradFill(bp, C.body, mul(C.body, [0.78, 0.8, 0.88]), rad(-110)); p.clip(bp, () => p.ell(300, cy + 45, 85, 70, "#b7bfd0", 0)); p.poly(bp, null, 9);
    p.ell(300, cy - 110, 80, 40, C.neckG, 7); p.stroke([[240, cy - 95], [360, cy - 95]], 14, C.neckP);
    const hy = cy - 190;
    p.ell(300, hy, 82, 76, C.body, 9);
    p.poly([[282, hy + 18], [318, hy + 18], [300, hy + 62]], C.beak, 6); p.ell(300, hy + 16, 16, 9, C.cere, 4);
    for (const s of [-1, 1]) { eyeAt(300 + s * 40, hy - 10, 18, s); brow(300 + s * 40, hy - 10, 18, -s); }
    if (o.eye === "patch") p.stroke([[220, hy - 45], [380, hy + 5]], 7, INK);
    if (o.medal) { p.poly([[280, cy - 70], [320, cy - 70], [312, cy - 10], [288, cy - 10]], "#2f8a4f", 5); p.stroke([[300, cy - 70], [300, cy - 10]], 8, "#c8323a"); p.poly([[300, cy - 15], [328, cy + 15], [300, cy + 45], [272, cy + 15]], "#c9932e", 6); p.ell(300, cy + 15, 9, 9, "#e8c45a", 3); }
    if (o.bow) { p.ell(275, hy - 70, 30, 20, "#f07aa8", 5, 0, 360, -20); p.ell(325, hy - 70, 30, 20, "#f07aa8", 5, 0, 360, 20); p.ell(300, hy - 70, 11, 11, "#d94f86", 4); }
    if (expr === "happy" || expr === "proud") p.arc(300, hy + 55, 24, 12, 20, 160, 6);
  }
  g.restore();
};

/** shell burst: dirt fountain + smoke ring on a 600 x 600 canvas (base at the bottom), t 0..1 */
export const fxDirt = (p: Pen, t: number) => {
  const k = Math.sin(Math.min(1, t * 1.6) * Math.PI) ** 0.6, fade = t > 0.7 ? (1 - t) / 0.3 : 1;
  p.g.globalAlpha = fade;
  const cols = ["#6b4f33", "#8a6a45", "#5d4630"];
  for (let i = 0; i < 9; i++) {
    const a = rad(-90 + (i - 4) * 16), h = 420 * k * (0.7 + 0.3 * Math.sin(i * 2.3)), w = 40 + 10 * (i % 3);
    p.ell(300 + Math.cos(a) * h * 0.55, 560 + Math.sin(a) * h, w, w * 1.4, cols[i % 3], 7);
  }
  for (let i = 0; i < 5; i++) p.ell(160 + i * 70, 560 - 40 * t, 50 + 50 * t, 30 + 25 * t, "#b9b2aa", 5);
  if (t < 0.3) { const r = 90 + 380 * t; const pts: P2[] = []; for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; pts.push([300 + (i % 2 ? r * 0.5 : r) * Math.cos(a), 470 + (i % 2 ? r * 0.5 : r) * Math.sin(a) * 0.7]); } p.poly(pts, "#ffd35a", 8); p.ell(300, 470, r * 0.3, r * 0.22, "#fff6c8", 0); }
  p.g.globalAlpha = 1;
};
/** feather poof (a pigeon hit), 400 x 400, t 0..1 */
export const fxFeathers = (p: Pen, t: number) => {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, d = 40 + 150 * Math.sqrt(t), y = 200 + d * Math.sin(a) + 90 * t * t;
    p.g.save(); p.g.globalAlpha = Math.max(0, 1 - t * 0.9);
    p.ell(200 + d * Math.cos(a), y, 30, 11, i % 3 ? "#d7dbe6" : "#9aa3b8", 4, 0, 360, (i * 47 + t * 200) % 360);
    p.g.restore();
  }
};
/** bullet whiz lines, 400 x 160, t 0..1 */
export const fxZip = (p: Pen, t: number) => {
  for (let i = 0; i < 3; i++) { const x0 = -120 + 520 * t + i * 30, y = 40 + i * 40; p.g.globalAlpha = 0.9; p.stroke([[x0, y], [x0 + 120, y]], 8, "#fff3b0"); p.stroke([[x0 + 100, y], [x0 + 130, y]], 10, "#ffffff"); }
  p.g.globalAlpha = 1;
};
/** folded paper map (thrown away), 400 x 300 */
export const fxMap = (p: Pen) => {
  p.poly([[20, 40], [140, 20], [260, 40], [380, 20], [380, 270], [260, 290], [140, 270], [20, 290]], "#efe1b8", 8);
  for (const x of [140, 260]) p.stroke([[x, 25], [x, 285]], 4, "#c9b88a");
  p.stroke([[50, 220], [120, 150], [200, 180], [300, 90], [350, 120]], 8, "#c8323a");
  p.ell(300, 90, 14, 14, "#c8323a", 4); p.ell(90, 100, 40, 25, "#9cc4a0", 4); p.ell(250, 230, 50, 25, "#9cc0e0", 4);
};
/** sun with a pointing ray, 500 x 500 */
export const fxSunPoint = (p: Pen, t: number) => {
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + t; p.stroke([[250 + 120 * Math.cos(a), 250 + 120 * Math.sin(a)], [250 + 175 * Math.cos(a), 250 + 175 * Math.sin(a)]], 18, "#ffd35a"); }
  p.ell(250, 250, 100, 100, "#ffe066", 10);
  p.arc(250, 260, 45, 30, 20, 160, 8); p.ell(215, 225, 9, 12, INK, 0); p.ell(285, 225, 9, 12, INK, 0);
};
/** the Earth's magnetic field: glowing curved lines (additive look), 800 x 800, t = drift */
export const fxField = (p: Pen, t: number) => {
  for (let k = 0; k < 6; k++) {
    const r = 120 + k * 55, ph = (t + k * 0.13) % 1;
    p.g.globalAlpha = 0.85;
    p.arc(400, 400, r, r * 1.35, 200, 340, 14, "#7fd9ff"); p.arc(400, 400, r, r * 1.35, 20, 160, 14, "#7fd9ff");
    const a = rad(200 + 140 * ph); p.ell(400 + r * Math.cos(a), 400 + r * 1.35 * Math.sin(a), 12, 12, "#ffffff", 0);
  }
  p.g.globalAlpha = 1;
  p.ell(400, 400, 70, 70, "#4f8fd9", 8); p.ell(380, 385, 30, 22, "#6fbf6f", 0);
};
/** a phone with one saved address (a house pin), 300 x 520 */
export const fxPhone = (p: Pen, pop: number) => {
  const g = p.g; g.save(); g.translate(150, 260); g.scale(pop, pop); g.translate(-150, -260);
  p.poly([[40, 20], [260, 20], [260, 500], [40, 500]], "#2a2c36", 10);
  p.poly([[58, 60], [242, 60], [242, 450], [58, 450]], "#e8f2ff", 0);
  p.poly([[100, 270], [150, 220], [200, 270], [200, 330], [100, 330]], "#f08a2a", 8); p.poly([[135, 290], [165, 290], [165, 330], [135, 330]], "#6b4f33", 5);
  p.ell(150, 180, 32, 32, "#c8323a", 7); p.ell(150, 180, 12, 12, "#ffffff", 0);
  g.restore();
};
/** DNA double helix, 300 x 600, t = rotation */
export const fxHelix = (p: Pen, t: number) => {
  for (let i = 0; i < 14; i++) {
    const y = 40 + i * 38, a = t * Math.PI * 2 + i * 0.55, x1 = 150 + 90 * Math.sin(a), x2 = 150 - 90 * Math.sin(a);
    p.stroke([[x1, y], [x2, y]], 7, ["#f07aa8", "#7fd9ff", "#ffd35a", "#8fdc8f"][i % 4]);
    p.ell(x1, y, 14, 14, "#4f6fd9", 4); p.ell(x2, y, 14, 14, "#d94f6f", 4);
  }
};
/** speech bubble with an icon (no words): a pink bow ("she") or a blue moustache ("he"), 320 x 260 */
export const fxBubble = (p: Pen, icon: "bow" | "boy" | "help" | "far" | "scared") => {
  p.poly([[20, 20], [300, 20], [300, 190], [130, 190], [80, 245], [90, 190], [20, 190]], "#ffffff", 8);
  if (icon === "bow") { p.ell(120, 105, 50, 34, "#f07aa8", 6, 0, 360, -20); p.ell(200, 105, 50, 34, "#f07aa8", 6, 0, 360, 20); p.ell(160, 105, 18, 18, "#d94f86", 5); }
  else if (icon === "boy") { p.ell(160, 105, 62, 62, "#7fb3ff", 6); p.arc(160, 120, 26, 16, 20, 160, 7); p.stroke([[128, 112], [160, 104], [192, 112]], 11, INK); p.ell(140, 85, 7, 9, INK, 0); p.ell(180, 85, 7, 9, INK, 0); }
  else if (icon === "far") { p.stroke([[40, 150], [280, 150]], 8, "#c9a06a"); p.poly([[250, 135], [285, 150], [250, 165]], "#c9a06a", 4); for (let k = 0; k < 4; k++) { const x = 205 + k * 18; p.ell(x, 128, 6, 9, "#9a4a3a", 2); p.poly([[x - 5, 120], [x + 5, 120], [x, 105]], "#8a5a3a", 2); } p.ell(70, 115, 24, 24, "#c99067", 4); p.ell(70, 92, 22, 14, "#2f5fb5", 3); }
  else if (icon === "scared") { p.ell(160, 105, 62, 62, "#e0b088", 6); p.poly([[115, 60], [205, 60], [160, 18]], "#8a5a3a", 5); p.ell(140, 95, 11, 13, "#ffffff", 3); p.ell(180, 95, 11, 13, "#ffffff", 3); p.ell(160, 135, 12, 16, "#5a1e28", 3); p.ell(210, 80, 7, 12, "#9fd4ff", 2); }
  else { p.stroke([[160, 55], [160, 125]], 22, "#c8323a"); p.ell(160, 160, 13, 13, "#c8323a", 0); }
};
/** handwritten message slip (scribbles, no legible words), 400 x 260 */
export const fxMessage = (p: Pen) => {
  p.poly([[15, 20], [385, 12], [390, 245], [12, 250]], "#f7f1dc", 7);
  for (let l = 0; l < 6; l++) { const pts: P2[] = []; for (let x = 40; x < (l === 5 ? 220 : 360); x += 14) pts.push([x, 55 + l * 32 + 6 * Math.sin(x * 0.3 + l)]); p.stroke(pts, 4, "#2a3a6a"); }
  p.stroke([[250, 225], [370, 205]], 6, "#c8323a"); p.stroke([[250, 205], [370, 225]], 6, "#c8323a");
};
/** a little house glowing "home", 300 x 300 */
export const fxHome = (p: Pen, pop: number) => {
  const g = p.g; g.save(); g.translate(150, 150); g.scale(pop, pop); g.translate(-150, -150);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; p.stroke([[150 + 105 * Math.cos(a), 160 + 105 * Math.sin(a)], [150 + 135 * Math.cos(a), 160 + 135 * Math.sin(a)]], 12, "#fff3b0"); }
  p.poly([[70, 160], [150, 80], [230, 160], [230, 240], [70, 240]], "#f2e2c0", 8); p.poly([[60, 165], [150, 72], [240, 165]], "#c8323a", 8);
  p.poly([[130, 190], [170, 190], [170, 240], [130, 240]], "#6b4f33", 5);
  g.restore();
};

/** wicker pigeon basket (front), 500 x 360 */
export const fxBasket = (p: Pen) => {
  p.poly([[40, 90], [460, 90], [430, 340], [70, 340]], "#c9965a", 9);
  for (let y = 120; y < 340; y += 34) p.stroke([[50 + (y - 90) * 0.12, y], [450 - (y - 90) * 0.12, y]], 6, "#9a6e3a");
  for (let x = 80; x < 440; x += 40) p.stroke([[x, 95], [x + (x < 250 ? 8 : -8), 335]], 5, "#a87a44");
  p.poly([[30, 70], [470, 70], [470, 100], [30, 100]], "#b5824a", 8);
  p.arc(250, 70, 150, 70, 180, 360, 14, "#8a5a2a");
};


// ================= Kadesh cast (our own designs) =================
const TAN = ["#c99067", "#b9805a", "#d9a47a", "#a8704c"];
export const RAMESSES: Outfit = { jacket: "#f4ecd8", pants: "#f4ecd8", boots: "#c9932e", hat: "khepresh", collar: "#e8c45a", sash: "#c8323a", buttons: "#f4ecd8", skin: "#c99067", dress: undefined };
export const egyptian = (v = 0, extra: Partial<Outfit> = {}): Outfit => ({ jacket: "#f2ead8", pants: "#f2ead8", boots: "#8a5a34", hat: "headcloth", belt: null, buttons: "#f2ead8", rifle: true, spear: true, skin: TAN[v % 4], ...extra });
export const hittite = (v = 0, extra: Partial<Outfit> = {}): Outfit => ({ jacket: ["#9a4a3a", "#8a5a2a", "#7a3a3a"][v % 3], pants: "#5a3a2a", boots: "#3a2a1e", hat: "hittite", hair: "#2a1e16", belt: "#e8c45a", buttons: "#e8c45a", rifle: true, spear: true, skin: ["#e0b088", "#d9a47a", "#c99067"][v % 3], beard: v % 2 ? "#2a1e16" : undefined, ...extra });
export const HITTITE_KING: Outfit = { ...hittite(0), jacket: "#6a3a8a", pants: "#4a2a5a", rifle: false, spear: false, cap: "#e8c45a", beard: "#2a1e16", collar: "#e8c45a", build: "stout" };
export const nomad = (v = 0): Outfit => ({ jacket: "#b98a5a", pants: "#8a6a45", boots: "#5a3b2a", hat: "wrap", cap: ["#c9a06a", "#a87a4a"][v % 2], dress: ["#a87a4a", "#9a7a5a"][v % 2], skin: TAN[(v + 1) % 4], beard: "#2a1e16" });
export const SCRIBE: Outfit = { jacket: "#f2ead8", pants: "#f2ead8", boots: "#8a5a34", hat: null, buttons: "#f2ead8", skin: TAN[2], collar: "#c9a06a" };
export const UN_GUARD: Outfit = { jacket: "#2f3f6a", pants: "#2f3f6a", boots: INK, hat: "cap", cap: "#2f3f6a", buttons: "#e8c45a", skin: SKINS[3] };

/** a war chariot side view (facing screen-right) on a 2000 x 1400 canvas (ground y = 1375): horse in front, wheeled box,
 *  the charioteer standing in it (drawn with bodySide), optional bow / spear. */
export const chariot = (p: Pen, rider: Outfit | null, o: { phase: number; expr: Expr; blink: number; light?: number; seed?: number; coat?: string; tilt?: number; crash?: number; egypt?: boolean }) => {
  const g = p.g;
  g.save();
  if (o.tilt) { g.translate(1000, 1375); g.rotate(rad(o.tilt)); g.translate(-1000, -1375); }
  // pole from box to horse
  p.band([[520, 1060], [980, 980]], "#8a5a34", 18, 5, "round");
  // horse at the front (shifted right by 600)
  g.save(); g.translate(600, 0);
  horseRider(p, rider ?? SCRIBE, { phase: o.phase, expr: "neutral", trumpet: false, blink: 0, light: o.light, seed: o.seed, coat: o.coat ?? (o.egypt ? "#e6dcc8" : "#5a3b2a"), mane: o.egypt ? "#8a6a45" : "#2a1e16", noRider: true });
  g.restore();
  // rider standing in the box
  if (rider) {
    g.save(); g.beginPath(); g.rect(0, 0, 2000, 1000); g.clip();
    g.translate(410, 990); g.scale(1.3, 1.3); g.translate(-300, -700);
    bodySide(p, rider, { mode: "stand", expr: o.expr, blink: o.blink, light: o.light, seed: o.seed, aim: false });
    g.restore();
  }
  // the box (front panel) and the wheel
  const col = o.egypt ? "#e8c45a" : "#9a6a3a";
  p.poly([[250, 900], [560, 900], [540, 1120], [270, 1120]], col, 9);
  p.stroke([[280, 960], [530, 960]], 10, o.egypt ? "#2f6fb5" : "#6a3a2a");
  const wy = 1375 - 175, sp = o.phase * Math.PI * 2;
  p.ell(400, wy, 175, 175, null, 22);
  p.ell(400, wy, 175, 175, null, 0);
  g.lineWidth = 16; g.strokeStyle = "#5a3b2a"; g.beginPath(); g.arc(400, wy, 168, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 6; k++) { const a = sp + (k * Math.PI) / 3; p.stroke([[400, wy], [400 + 165 * Math.cos(a), wy + 165 * Math.sin(a)]], 9, "#5a3b2a"); }
  p.ell(400, wy, 26, 26, col, 7);
  g.restore();
};

/** painted temple relief on sandstone (no words): giant Ramesses in his chariot shooting arrows, tiny enemies tumbling.
 *  variant: 0 = the big victory, 1 = smiting, 2 = receiving tribute, 3 = Ramesses falling over (the outtake). 1600 x 1000 */
export const fxRelief = (p: Pen, variant: number, paint = 1) => {
  const g = p.g;
  g.fillStyle = "#e2c48e"; g.fillRect(0, 0, 1600, 1000);
  for (let i = 0; i < 260; i++) { const x = (i * 97) % 1600, y = (i * 61) % 1000; g.fillStyle = i % 2 ? "rgba(150,110,60,0.12)" : "rgba(255,240,200,0.15)"; g.fillRect(x, y, 30 + (i % 5) * 9, 6); }
  g.strokeStyle = "rgba(120,84,40,0.5)"; g.lineWidth = 4; for (let y = 120; y < 1000; y += 120) { g.beginPath(); g.moveTo(0, y); g.lineTo(1600, y); g.stroke(); }
  const carve = "#7a542a", fill = (c: string) => (paint > 0 ? c : "#d2b47e");
  const fig = (x: number, y: number, s: number, c: string, fallen = 0) => {
    g.save(); g.translate(x, y); g.rotate(fallen); g.scale(s, s);
    p.ell(0, -150, 30, 30, fill("#c99067"), 6); p.poly([[-25, -120], [25, -120], [20, 0], [-20, 0]], fill(c), 6);
    p.stroke([[-10, 0], [-25, 80]], 10, carve); p.stroke([[10, 0], [25, 80]], 10, carve); p.stroke([[-20, -100], [-55, -50]], 9, carve); p.stroke([[20, -100], [60, -140]], 9, carve);
    g.restore();
  };
  g.save(); g.lineJoin = "round";
  if (variant === 3) {
    // the outtake: chariot upside down, Ramesses on his back with his crown off
    g.save(); g.translate(800, 620); g.rotate(2.6); p.poly([[-150, -60], [150, -60], [130, 60], [-130, 60]], fill("#e8c45a"), 8); p.ell(0, 100, 90, 90, null, 10); g.restore();
    fig(620, 800, 2.4, "#f4ecd8", -1.5); p.ell(500, 860, 50, 70, fill("#2f5fb5"), 7);
    for (let k = 0; k < 6; k++) fig(1000 + k * 90, 820, 0.9, "#9a4a3a", 0);
  } else {
    if (variant === 0) {
      // giant king in a chariot drawing a bow
      // horse (rearing), chariot box + wheel, giant king drawing a bow
      p.ell(900, 640, 210, 95, fill("#e6dcc8"), 8); p.stroke([[1050, 600], [1140, 480]], 46, fill("#e6dcc8")); p.ell(1170, 455, 62, 36, fill("#e6dcc8"), 7);
      for (const x of [760, 830, 960, 1030]) p.stroke([[x, 700], [x + 40, 880]], 20, carve);
      p.stroke([[620, 690], [760, 650]], 14, carve);
      p.poly([[360, 600], [640, 600], [620, 740], [380, 740]], fill("#e8c45a"), 8); p.ell(500, 800, 95, 95, null, 12);
      g.save(); g.translate(500, 600); g.scale(2.1, 2.1);
      p.poly([[-25, -120], [25, -120], [20, 0], [-20, 0]], fill("#f4ecd8"), 4); p.ell(0, -150, 30, 30, fill("#c99067"), 4); p.ell(0, -188, 30, 26, fill("#2f5fb5"), 4);
      p.arc(78, -100, 30, 62, 270, 450, 5, carve); p.stroke([[78, -160], [78, -38]], 2, carve); p.stroke([[20, -100], [78, -100]], 6, carve); p.stroke([[-20, -100], [40, -96]], 6, carve);
      g.restore();
      for (let k = 0; k < 9; k++) fig(1300 + (k % 3) * 90, 360 + Math.floor(k / 3) * 220, 0.8, "#9a4a3a", 0.6 + k * 0.4);
    } else if (variant === 1) {
      fig(600, 720, 3.6, "#f4ecd8"); p.ell(600, 140, 90, 100, fill("#2f5fb5"), 8);
      for (let k = 0; k < 6; k++) fig(1050 + (k % 3) * 120, 760 - Math.floor(k / 3) * 30, 1.0, "#9a4a3a", -0.3);
    } else {
      fig(500, 760, 3.2, "#f4ecd8"); p.ell(500, 210, 85, 95, fill("#2f5fb5"), 8);
      for (let k = 0; k < 5; k++) { fig(900 + k * 130, 840, 1.0, "#9a4a3a"); p.ell(930 + k * 130, 640, 34, 26, fill("#e8c45a"), 5); }
    }
  }
  g.restore();
  // carved border
  g.strokeStyle = "#7a542a"; g.lineWidth = 18; g.strokeRect(9, 9, 1582, 982);
};
/** film strip with three relief frames, the last torn (highlight reel), 1800 x 700 */
export const fxReel = (p: Pen, torn: number) => {
  const g = p.g;
  g.fillStyle = "#1d1b22"; g.fillRect(0, 0, 1800, 700);
  for (let x = 30; x < 1800; x += 90) { g.fillStyle = "#f4f0e6"; g.fillRect(x, 25, 40, 40); g.fillRect(x, 635, 40, 40); }
  for (let k = 0; k < 3; k++) {
    g.save(); g.translate(60 + k * 580, 100);
    if (k === 2) { g.translate(250 + 400 * torn, 250 * torn); g.rotate(0.6 * torn); g.translate(-250, 0); }
    g.scale(500 / 1600, 500 / 1000); fxRelief(p, k === 2 ? 3 : k, 1); g.restore();
  }
};
/** dust cloud puff (soft), 400 x 300, t 0..1 */
export const fxDust = (p: Pen, t: number) => {
  p.g.globalAlpha = Math.max(0, 0.9 * (1 - t));
  const s = 0.6 + 0.6 * t;
  for (const [x, y, r, c] of [[120, 200, 90, "#d9b884"], [210, 170, 110, "#e6cc98"], [300, 210, 80, "#d9b884"], [190, 230, 100, "#c9a06a"]] as const) p.ell(200 + (x - 200) * s, 260 - (260 - y) * s, r * s, r * 0.7 * s, c, 0);
  p.g.globalAlpha = 1;
};
/** sand motes drifting (soft specks), 600 x 600 */
export const fxMotes = (p: Pen, seed: number) => {
  for (let i = 0; i < 40; i++) { const x = (Math.sin(i * 12.9898 + seed) * 43758.5453 % 1 + 1) % 1, y = (Math.sin(i * 78.233 + seed) * 12345.678 % 1 + 1) % 1; p.ell(x * 600, y * 600, 3 + (i % 3), 3 + (i % 3), "#fff1cf", 0); }
};
/** copper replica of the treaty tablet (wedge-like marks, no legible text), 500 x 640 */
export const fxTablet = (p: Pen) => {
  p.poly([[40, 30], [460, 20], [470, 610], [30, 620]], "#b8743a", 10);
  for (let l = 0; l < 13; l++) for (let k = 0; k < 9; k++) { const x = 70 + k * 42 + (l % 2) * 12, y = 70 + l * 41; p.poly([[x, y], [x + 18, y + 4], [x + 4, y + 18]], "#7a4a24", 0); }
  p.ell(250, 330, 200, 280, null, 0);
};

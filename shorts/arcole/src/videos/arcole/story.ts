// Timeline of "The Battle Won by Four Trumpets" (Arcole, 15-17 Nov 1796): shots timed to voice/words.json,
// story positions (dike, bridge, mud pool, flank route) and the camera grammar of the template
// (smootherstep glides, creeping push-ins on every hold, flip kicks on impacts, cuts on big reframes).
export const FPS = 30;
export const TOTAL = 2054;
export const D0 = 0; // marsh ground level (houses default to this)
export const DK = 2.2; // dike crest, bridge deck and the far (Arcole) bank plateau
export const BR = 8; // bridge from z = -BR to +BR over the Alpone
export const FILES = [-1.1, 0, 1.1];
export const MUD = { x0: 6, x1: 13, z0: -34, z1: -21 };
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
export const lin = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};
/** ground height of the set at (x, z): dike, far plateau, marsh */
export const groundY = (x: number, z: number) => {
  if (z > BR - 0.5) return DK;
  if (z < -BR + 0.5 && x > 300) return 0;
  if (z < -BR) { const ax = Math.abs(x); return ax <= 2 ? DK : ax >= 5.5 ? 0 : DK * (5.5 - ax) / 3.5; }
  return ax0(x) ? DK : -0.6;
};
const ax0 = (x: number) => Math.abs(x) <= 2;

// ---------------- story positions ----------------
/** Napoleon's charge with the flag (shot 4b): running toward the bridge */
export const napZ = (t: number) => -40 + 3.4 * Math.max(0, t - 20.6);
/** the French column running down the dike (shot 3a) and back (3b) */
export const colFront = (t: number) => t < 17.9 ? -40 + 5.5 * (t - 12.85) : -12.2 - 4.6 * (t - 17.9);
/** Napoleon thrown off the dike by the retreat (shot 5c): 0..1 from "straight" to the splash */
export const FALL0 = 26.45, FALL1 = 27.0;
export const NAP_FALL = { x0: 1.1, x1: 8.6, z: -27.6 };
/** Napoleon's depth in the mud (head + hat above the surface), then hauled out (shot 6b) */
export const SINK = -1.22;
export const napRise = (t: number) => SINK + (-0.25 - SINK) * smooth((t - 31.55) / 0.75);
/** the flanking riders through the reeds (shot 8a) */
export const rideX = (t: number) => 18 + 3.2 * (t - 34.0);
export const RIDERS = 8;

// ---------------- shots ----------------
export type Light = "day" | "golden" | "night";
export type Crowd = "hook" | "intro" | "charge" | "flag" | "fire" | "mud" | "think" | "ride" | "blow" | "panic" | "reeds" | "street" | "regiment" | "painter" | "painting";
export type ShotDef = { id: number; a: number; b: number; light: Light; crowd: Crowd; tau: (t: number) => number; sunAz?: number; sunEl?: number };
const C: [Crowd, Light][] = [["hook", "day"], ["intro", "day"], ["charge", "day"], ["flag", "day"], ["fire", "day"], ["mud", "day"], ["think", "golden"],
  ["ride", "golden"], ["blow", "golden"], ["panic", "golden"], ["reeds", "day"], ["street", "night"], ["regiment", "day"], ["painter", "golden"], ["painting", "golden"]];
const CUTS = [0, 131, 385, 570, 663, 830, 980, 1033, 1176, 1248, 1349, 1508, 1661, 1754, 1854, TOTAL];
export const SHOTS: ShotDef[] = C.map(([crowd, light], i) => ({ id: i + 1, a: CUTS[i], b: CUTS[i + 1], light, crowd, tau: (t: number) => t }));
SHOTS[1].sunAz = 110; // establishing aerial: front-lit
SHOTS[11].sunAz = 40; SHOTS[11].sunEl = 25; // night street: moon ahead-right
for (const i of [6, 7, 8, 9, 13, 14]) { SHOTS[i].sunAz = 125; SHOTS[i].sunEl = 14; } // golden: low side-front sun, faces readable
/** crossfades (frames) at place/time changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 7: 8, 11: 8, 12: 8, 13: 8, 14: 8 };
export const FLASH_AT = 131;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mixC = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mixC(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
/** push-in factor since f0 (subject grows ~rate per frame), `punch` for the first n frames */
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });

export const RIDE_Z = -17; // near-marsh flank route (8a)
export const BLOW_Z = 30; // riders behind the Austrian lines (8b, 9, hook)
export const AUS_Z = [10.6, 12.0, 13.4];
export const STREET_X = 500;
export const walkZ = (t: number) => 12 - 1.15 * (t - 50.2);
export const EASEL: V3 = [0.2, DK, -16];

const CAMS: Record<number, Key[]> = {
  1: [
    { f: 0, s: (f) => dolly([0.9, DK + 1.75, -35.0], [0, DK + 1.2, -40], pushK(f, 0, 0.003), { fov: 38 }) }, // Napoleon, smug
    { f: 50, cut: true, s: (f) => dolly([32.2, DK + 2.0, BLOW_Z - 6.4], [30.9, DK + 1.85, BLOW_Z], pushK(f, 50, 0.0025, 0.006, 25), { fov: 40, roll: 0.03 }) }, // trumpeters
    { f: 78, dur: 34, s: (f) => dolly([27.5, DK + 6.0, BLOW_Z - 25], [26.6, DK + 1.2, BLOW_Z], pushK(f, 95, 0.002), { fov: 44 }) }, // pull back: only a few riders
  ],
  2: [
    { f: 127, s: (f) => zoom([46, 34, -92], [2, 0, -12], 44, pushK(f, 127, 0.0018)) }, // the swamp, the dike, the bridge, the village
    { f: 226, cut: true, s: (f) => dolly([1.0, DK + 1.8, -34.6], [0, DK + 1.15, -40], pushK(f, 226, 0.0025), { fov: 40 }) }, // Napoleon + hungry army
    { f: 290, dur: 24, s: (f) => dolly([1.8, DK + 1.7, -34.0], [0.4, DK + 1.1, -41], pushK(f, 300, 0.0025), { fov: 42, roll: -0.03 }) },
    { f: 324, cut: true, s: (f) => zoom([1.2, DK + 2.1, -31], [0, DK + 0.6, 0], 34, pushK(f, 324, 0.0025, 0.007, 30)) }, // one tiny bridge
  ],
  3: [
    { f: 385, s: (f) => { const F = colFront(T(f)); return dolly([6.0, DK + 1.2, F - 1], [0, DK + 1.0, F - 3], pushK(f, 385, 0.0015), { fov: 46 }); } }, // charge, tracking
    { f: 448, dur: 30, s: (f) => { const F = colFront(T(f)); return dolly([4.5, DK + 3.0, F - 9], [0, DK + 0.6, F + 6], pushK(f, 448, 0.002), { fov: 48, roll: 0.03 }); } },
    { f: 496, cut: true, s: (f) => dolly([-6.5, DK + 1.55, 10.2], [0, DK + 1.35, 12.6], pushK(f, 496, 0.0025), { fov: 44 }) }, // Austrian volley
    { f: 540, cut: true, s: (f) => { const F = colFront(T(f)); return dolly([8.5, DK + 1.6, F - 6.5], [0, DK + 1.0, F - 5], pushK(f, 540, 0.002), { fov: 48, roll: -0.03 }); } }, // shoved right back
  ],
  4: [
    { f: 570, s: (f) => dolly([0.7, DK + 1.75, -35.1], [0, DK + 1.45, -40], pushK(f, 570, 0.003, 0.007, 30), { fov: 40 }) },
    { f: 619, cut: true, s: (f) => { const z = napZ(T(f)); return { pos: [1.1, DK + 0.75, z + 5.2], look: [0, DK + 1.55, z], fov: 42, roll: -0.04 }; } },
  ],
  5: [
    { f: 663, s: (f) => dolly([6.5, DK + 1.55, 10.0], [0, DK + 1.35, 12.6], pushK(f, 663, 0.0025), { fov: 44 }) }, // volley
    { f: 707, cut: true, s: (f) => dolly([1.2, DK + 1.7, -19.4], [-0.1, DK + 1.15, -24], pushK(f, 707, 0.0025), { fov: 44 }) }, // the aide
    { f: 763, cut: true, s: (f) => zoom([11.5, DK + 2.3, -35.5], [4.2, 1.2, -27.6], 50, pushK(f, 763, 0.0018)) }, // swept off the dike
  ],
  6: [
    { f: 830, s: (f) => dolly([8.2, 0.62, -25.1], [8.6, 0.3, -27.6], pushK(f, 830, 0.0022, 0.006, 30), { fov: 40 }) }, // up to his neck
    { f: 921, cut: true, s: (f) => dolly([11.2, 1.35, -23.2], [7.4, 0.8, -27.8], pushK(f, 921, 0.0025), { fov: 42, roll: 0.03 }) }, // dragged out
  ],
  7: [{ f: 976, s: (f) => dolly([0.8, DK + 1.75, -40.2], [0, DK + 1.45, -45], pushK(f, 976, 0.003, 0.007, 30), { fov: 40 }) }],
  8: [
    { f: 1033, s: (f) => { const x = rideX(T(f)) - 6; return { pos: [x, 1.9, RIDE_Z - 9.5], look: [x + 0.8, 1.3, RIDE_Z], fov: 46 }; } },
    { f: 1123, cut: true, s: (f) => dolly([31, DK + 2.4, 12.5], [14, DK + 1.3, 17], pushK(f, 1123, 0.002), { fov: 46 }) }, // riders behind the Austrian flank
  ],
  9: [
    { f: 1176, s: (f) => dolly([36, DK + 2.3, BLOW_Z - 4.5], [24, DK + 1.9, BLOW_Z + 0.5], pushK(f, 1176, 0.0025, 0.007, 35), { fov: 44, roll: -0.04 }) },
    { f: 1205, dur: 20, s: (f) => dolly([36, DK + 2.3, BLOW_Z - 4.5], [24, DK + 1.9, BLOW_Z + 0.5], pushK(f, 1176, 0.0025, 0.007, 35), { fov: 44, roll: 0.04 }) },
  ],
  10: [
    { f: 1248, s: (f) => dolly([0.5, DK + 1.7, 7.8], [0, DK + 1.15, 12], pushK(f, 1248, 0.003), { fov: 42 }) },
    { f: 1306, dur: 18, s: (f) => dolly([0.3, DK + 1.7, 8.6], [0, DK + 1.3, 12], pushK(f, 1306, 0.002), { fov: 40, roll: 0.04 }) },
    { f: 1322, cut: true, s: (f) => zoom([-9, DK + 2.4, 13], [0, DK + 1.0, 19], 46, pushK(f, 1322, 0.002)) }, // pull back
  ],
  11: [
    { f: 1345, s: (f) => { const k = (f - 1345) * 0.035; return { pos: [-24, 1.35, -27 + k], look: [-24, 1.3, -17 + k], fov: 44, roll: 0.02 }; } }, // inside the reeds
    { f: 1442, cut: true, s: (f) => dolly([-23.0, 1.75, -21.6], [-24, 1.2, -17.4], pushK(f, 1442, 0.0025), { fov: 40 }) }, // ears decide
  ],
  12: [
    { f: 1504, s: (f) => { const z = walkZ(T(f)); return dolly([STREET_X + 0.5, 1.7, z - 5.2], [STREET_X, 1.2, z], pushK(f, 1504, 0.0015), { fov: 42 }); } },
    { f: 1578, cut: true, s: (f) => { const z = walkZ(T(f)); return { pos: [STREET_X + 0.3, 1.7, z - 3.0], look: [STREET_X, 1.3, z], fov: 40, roll: -0.03 }; } },
    { f: 1621, cut: true, s: (f) => { const z = walkZ(T(f)); return dolly([STREET_X + 1.0, 1.4, z - 6.4], [STREET_X, 2.2, z + 3], pushK(f, 1621, 0.002), { fov: 46, roll: 0.04 }); } },
  ],
  13: [
    { f: 1657, s: (f) => zoom([6.5, DK + 1.8, 9.2], [25, 1.6, -16.4], 20, pushK(f, 1657, 0.0018)) }, // tight on the four trumpeters
    { f: 1715, dur: 24, s: (f) => zoom([6.5, DK + 1.8, 9.2], [24, 3.2, -21], 50, pushK(f, 1715, 0.002), { roll: -0.03 }) }, // widen: a whole regiment
  ],
  14: [
    { f: 1750, s: (f) => dolly([4.6, DK + 1.7, -19.6], [0.8, DK + 1.35, -15.9], pushK(f, 1750, 0.002), { fov: 42 }) },
    { f: 1798, dur: 26, s: (f) => dolly([3.4, DK + 1.6, -18.6], [0.9, DK + 1.4, -15.9], pushK(f, 1798, 0.002, 0.006, 30), { fov: 40, roll: 0.03 }) },
  ],
  15: [
    { f: 1854, s: (f) => dolly([0.2, DK + 1.47, -17.75], [0.2, DK + 1.47, -16.04], pushK(f, 1854, 0.0012), { fov: 40 }) }, // the painting
    { f: 1988, cut: true, s: (f) => dolly([3.3, DK + 1.55, -21.9], [1.1, DK + 1.2, -15.9], pushK(f, 1988, 0.0018), { fov: 42 }) }, // the truth
  ],
};

// impact kicks: flip sign every frame, decay over 7 f
const KICKS: [number, number][] = [[17.87, 0.8], [22.95, 1.0], [27.0, 1.3], [40.45, 0.8], [57.49, 0.6]];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 13, focus: () => [0, DK + 1.6, -40] },
  { f: 50, cInf: 11 },
  { f: 78, dur: 34, cInf: 0 },
  { f: 131, cInf: 0 },
  { f: 226, cInf: 12, focus: () => [0, DK + 1.6, -40] },
  { f: 324, cInf: 0 },
  { f: 570, cInf: 13, focus: () => [0, DK + 1.7, -40] },
  { f: 619, cInf: 9, focus: (f) => [0, DK + 1.6, napZ(f / FPS)] },
  { f: 663, cInf: 0 },
  { f: 707, cInf: 11, focus: () => [0, DK + 1.5, -24] },
  { f: 763, cInf: 0 },
  { f: 830, cInf: 14, focus: () => [NAP_FALL.x1, 0.5, NAP_FALL.z] },
  { f: 921, cInf: 8 },
  { f: 980, cInf: 13, focus: () => [0, DK + 1.7, -45] },
  { f: 1033, cInf: 6 },
  { f: 1123, cInf: 0 },
  { f: 1176, cInf: 10 },
  { f: 1248, cInf: 12, focus: () => [0, DK + 1.6, 12] },
  { f: 1322, cInf: 0 },
  { f: 1349, cInf: 7 },
  { f: 1442, cInf: 13 },
  { f: 1508, cInf: 8, focus: (f) => [STREET_X, 1.5, walkZ(f / FPS)] },
  { f: 1578, cInf: 12, focus: (f) => [STREET_X, 1.6, walkZ(f / FPS)] },
  { f: 1621, cInf: 5, focus: (f) => [STREET_X, 1.6, walkZ(f / FPS)] },
  { f: 1661, cInf: 0 },
  { f: 1754, cInf: 9 },
  { f: 1854, cInf: 0 },
  { f: 1988, cInf: 8, focus: () => [1.4, DK + 1.4, -15.9] },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export const focusAt = (id: number, f: number): V3 => {
  const d = dofAt(f);
  return d.focus ? d.focus(f) : camAt(id, f).look;
};

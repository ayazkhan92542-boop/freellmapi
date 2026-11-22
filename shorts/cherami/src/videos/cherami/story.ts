// Timeline of "The One-Eyed, One-Legged War Hero" (Cher Ami, Argonne Forest, October 1918): shots timed to
// voice/words.json, story positions and the template's camera grammar (glides, creeping push-ins, kicks, cuts).
export const FPS = 30;
export const TOTAL = 1897;
export const D0 = 0;
export type V3 = [number, number, number];
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

// ---------------- sets ----------------
export const HQ: V3 = [300, 0, 0];          // headquarters field: pigeon loft, tents, ceremony table
export const LOFT: V3 = [304, 0, 18];       // loft building (landing board faces -z)
export const BOARD_Y = 4.25;                 // landing-board height
export const TABLE: V3 = [300, 0, 0];       // ceremony table (top at 1.0 m)
export const MUSEUM: V3 = [-300, 0, 0];     // museum room; glass case at its centre
export const CASE_Y = 1.15;                  // top of the pedestal inside the case
export const LAB: V3 = [-306, 0, -5];       // lab bench in the museum's back room corner
export const groundY = (_x: number, _z: number) => 0;

// ---------------- story positions ----------------
/** Cher Ami's flight through the forest (shots 7c-8): along +x at ~8 m, from the pocket outward */
export const flyX = (t: number) => -2 + 9.5 * (t - 22.0);
export const flyY = (t: number) => 7.5 + 0.6 * Math.sin(t * 2.1);
/** HQ approach (9a): from far -z toward the landing board */
export const LAND_T = 31.05;
export const SHELLS = [11.05, 11.5, 11.95, 12.35];

// ---------------- shots ----------------
export type Light = "day" | "golden" | "night";
export type Crowd = "hook" | "forest" | "shell" | "radio" | "first" | "last" | "takeoff" | "hit" | "land" | "explain" | "leg" | "medal" | "she" | "dna" | "boy";
export type ShotDef = { id: number; a: number; b: number; light: Light; crowd: Crowd; sunAz?: number; sunEl?: number };
const C: [Crowd, Light][] = [["hook", "day"], ["forest", "day"], ["shell", "day"], ["radio", "day"], ["first", "day"], ["last", "day"], ["takeoff", "day"],
  ["hit", "day"], ["land", "day"], ["explain", "day"], ["leg", "golden"], ["medal", "day"], ["she", "day"], ["dna", "day"], ["boy", "day"]];
const CUTS = [0, 121, 290, 385, 514, 600, 651, 766, 892, 1127, 1435, 1528, 1580, 1670, 1754, TOTAL];
export const SHOTS: ShotDef[] = C.map(([crowd, light], i) => ({ id: i + 1, a: CUTS[i], b: CUTS[i + 1], light, crowd }));
for (const i of [10]) { SHOTS[i].sunAz = 125; SHOTS[i].sunEl = 14; }
export const XFADE: Record<number, number> = { 9: 8, 11: 8, 12: 8, 13: 8 };
export const FLASH_AT = 121;
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
const at = (b: V3, dx: number, dy: number, dz: number): V3 => [b[0] + dx, b[1] + dy, b[2] + dz];

const CAMS: Record<number, Key[]> = {
  1: [
    { f: 0, s: (f) => dolly(at(TABLE, 0.9, 1.45, -1.9), at(TABLE, 0, 1.3, 0), pushK(f, 0, 0.003), { fov: 38, roll: 0.03 }) },
    { f: 66, dur: 22, s: (f) => dolly(at(TABLE, 0.5, 1.3, -1.35), at(TABLE, 0.05, 1.45, 0), pushK(f, 66, 0.003, 0.007, 30), { fov: 36, roll: -0.03 }) },
  ],
  2: [
    { f: 117, s: (f) => zoom([30, 34, -58], [0, 0, 0], 44, pushK(f, 117, 0.002)) },
    { f: 202, cut: true, s: (f) => dolly([1.5, 1.5, -7.5], [0, 1.0, 0], pushK(f, 202, 0.0025), { fov: 44 }) },
    { f: 253, dur: 30, s: (f) => dolly([3, 6.5, -14], [0, 1.2, 4], pushK(f, 253, 0.0015), { fov: 50, roll: 0.03 }) },
  ],
  3: [
    { f: 290, s: (f) => dolly([1.0, 1.45, -5.2], [0, 1.0, 0], pushK(f, 290, 0.0025), { fov: 46 }) },
    { f: 322, cut: true, s: (f) => zoom([-7, 3.2, -11], [0, 1.3, 1], 52, pushK(f, 322, 0.002)) },
  ],
  4: [
    { f: 385, s: (f) => dolly([0.6, 1.7, -2.6], [0, 1.25, 1.5], pushK(f, 385, 0.003, 0.007, 30), { fov: 40 }) },
    { f: 433, cut: true, s: (f) => dolly([-2.4, 1.55, -1.6], [-2.0, 0.85, 1.2], pushK(f, 433, 0.003), { fov: 42 }) },
    { f: 470, dur: 20, s: (f) => dolly([-2.15, 1.25, 0.0], [-2.0, 0.75, 1.2], pushK(f, 470, 0.003), { fov: 38, roll: 0.03 }) },
  ],
  5: [
    { f: 514, s: (f) => dolly([1.5, 1.0, -6.5], [0.5, 4.0, 1], pushK(f, 514, 0.0015), { fov: 52 }) },
  ],
  6: [
    { f: 600, s: (f) => dolly([-1.6, 1.62, -0.6], [-2.0, 1.32, 1.2], pushK(f, 600, 0.003, 0.008, 30), { fov: 36 }) },
  ],
  7: [
    { f: 651, s: (f) => dolly([-0.6, 0.9, -2.8], [-2.0, 3.0, 1.2], pushK(f, 651, 0.0015), { fov: 54, roll: 0.04 }) },
    { f: 681, cut: true, s: (f) => dolly([-8, 1.6, 15.5], [-4, 2.4, 19], pushK(f, 681, 0.0025), { fov: 46 }) },
    { f: 721, cut: true, s: (f) => { const x = flyX(T(f)), y = flyY(T(f)); return { pos: [x - 1.0, y + 0.4, 23.6], look: [x + 0.4, y + 0.1, 28], fov: 46, roll: -0.03 }; } },
  ],
  8: [
    { f: 766, s: (f) => { const x = flyX(T(f)), y = flyY(T(f)); return { pos: [x - 0.6, y + 0.3, 24.6], look: [x + 0.3, y + 0.1, 28], fov: 42, roll: 0.03 }; } },
    { f: 855, dur: 30, s: (f) => { const x = flyX(T(f)), y = flyY(T(f)); return { pos: [x + 3.5, y + 0.6, 24.2], look: [x - 0.2, y + 0.3, 28], fov: 46, roll: -0.04 }; } },
  ],
  9: [
    { f: 888, s: (f) => zoom(at(LOFT, -7, 2.0, -22), at(LOFT, 0, 3.6, 0), 46, pushK(f, 888, 0.002)) },
    { f: 928, dur: 20, s: (f) => zoom(at(LOFT, -7, 2.0, -22), at(LOFT, 0, 4.2, -0.6), 26, pushK(f, 928, 0.002)) },
    { f: 962, cut: true, s: (f) => dolly(at(LOFT, 1.4, 1.75, -4.8), at(LOFT, 0.2, 1.45, -1.6), pushK(f, 962, 0.003), { fov: 42 }) },
    { f: 1003, cut: true, s: (f) => dolly(at(LOFT, 0.35, 1.45, -3.3), at(LOFT, 0.15, 1.35, -1.75), pushK(f, 1003, 0.0018), { fov: 40 }) },
    { f: 1068, cut: true, s: (f) => dolly(at(HQ, -8.6, 1.7, 7.8), at(HQ, -10, 1.45, 11), pushK(f, 1068, 0.003, 0.008, 35), { fov: 40, roll: 0.04 }) },
  ],
  10: [
    { f: 1123, s: (f) => dolly(at(LOFT, 2.6, 5.3, -6.5), at(LOFT, 0, 5.2, -1), pushK(f, 1123, 0.0025), { fov: 42 }) },
    { f: 1198, cut: true, s: (f) => zoom(at(LOFT, -10, 3, -26), at(LOFT, 0, 4.5, 0), 40, pushK(f, 1198, 0.002)) },
    { f: 1238, cut: true, s: (f) => { const u = (T(f) - 41.27); return { pos: [HQ[0] - 70 + 6 * u, 16, -60 + 9 * u - 6], look: [HQ[0] - 70 + 6 * u + 3, 17.5, -60 + 9 * u + 4], fov: 54, roll: -0.03 }; } },
    { f: 1368, dur: 20, s: (f) => { const u = (T(f) - 41.27); return { pos: [HQ[0] - 70 + 6 * u - 1.5, 16.6, -60 + 9 * u - 4], look: [HQ[0] - 70 + 6 * u + 1.5, 17.6, -60 + 9 * u + 4], fov: 50, roll: 0.03 }; } },
  ],
  11: [
    { f: 1431, s: (f) => dolly([-2, 1.7, -14], [0, 1.2, -6], pushK(f, 1431, 0.002), { fov: 46 }) },
    { f: 1477, cut: true, s: (f) => dolly(at(HQ, 9.6, 1.25, -12.2), at(HQ, 8.2, 0.75, -9.4), pushK(f, 1477, 0.003, 0.007, 30), { fov: 40 }) },
  ],
  12: [
    { f: 1524, s: (f) => dolly(at(TABLE, 1.6, 1.7, -3.6), at(TABLE, 0.3, 1.35, 0.2), pushK(f, 1524, 0.003, 0.007, 30), { fov: 42 }) },
  ],
  13: [
    { f: 1576, s: (f) => zoom(at(MUSEUM, 3.5, 1.9, -6.5), at(MUSEUM, 0, 1.4, 0), 44, pushK(f, 1576, 0.002)) },
    { f: 1630, dur: 24, s: (f) => zoom(at(MUSEUM, 3.5, 1.9, -6.5), at(MUSEUM, 0, 1.55, 0), 30, pushK(f, 1630, 0.002), { roll: 0.03 }) },
  ],
  14: [
    { f: 1666, s: (f) => dolly(at(LAB, 1.6, 1.75, -3.2), at(LAB, 0, 1.45, 0.4), pushK(f, 1666, 0.003), { fov: 42 }) },
    { f: 1730, dur: 18, s: (f) => dolly(at(LAB, 0.8, 1.7, -2.2), at(LAB, 0, 1.55, 0.4), pushK(f, 1730, 0.003, 0.008, 25), { fov: 38, roll: -0.03 }) },
  ],
  15: [
    { f: 1754, s: (f) => dolly(at(MUSEUM, 0.3, 1.6, -2.3), at(MUSEUM, 0, 1.5, 0), pushK(f, 1754, 0.0025, 0.006, 30), { fov: 38 }) },
    { f: 1788, cut: true, s: (f) => zoom(at(MUSEUM, 2.8, 1.8, -5.8), at(MUSEUM, 0, 1.45, 0), 44, pushK(f, 1788, 0.0018)) },
  ],
};

const KICKS: [number, number][] = [[SHELLS[0], 0.9], [SHELLS[1], 0.7], [SHELLS[2], 1.0], [SHELLS[3], 0.8], [17.87, 0.5], [19.32, 0.5], [26.09, 0.9], [27.0, 0.7], [28.14, 0.7], [31.05, 0.5], [36.84, 0.6]];
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
  { f: 0, cInf: 13 }, { f: 121, cInf: 0 }, { f: 202, cInf: 9 }, { f: 253, dur: 30, cInf: 0 }, { f: 290, cInf: 10 }, { f: 322, cInf: 0 },
  { f: 385, cInf: 12 }, { f: 433, cInf: 11 }, { f: 514, cInf: 0 }, { f: 600, cInf: 14 }, { f: 651, cInf: 6 }, { f: 681, cInf: 8 },
  { f: 721, cInf: 10 }, { f: 892, cInf: 0 }, { f: 962, cInf: 11 }, { f: 1068, cInf: 11 }, { f: 1123, cInf: 9 }, { f: 1198, cInf: 0 },
  { f: 1435, cInf: 6 }, { f: 1477, cInf: 12 }, { f: 1528, cInf: 12 }, { f: 1580, cInf: 6 }, { f: 1670, cInf: 12 }, { f: 1754, cInf: 13 }, { f: 1788, cInf: 7 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export const focusAt = (id: number, f: number): V3 => { const d = dofAt(f); return d.focus ? d.focus(f) : camAt(id, f).look; };

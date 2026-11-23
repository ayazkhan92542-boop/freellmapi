// Timeline of "The Pharaoh Who Edited His Own War" (Battle of Kadesh, c. 1274 BC), timed to the user's voiceover
// (voice/words.json, aligned by DTW to a template read and checked against the pauses).
export const FPS = 30;
export const TOTAL = 2371;
export const D0 = 0;
export type V3 = [number, number, number];
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

// ---------------- sets ----------------
export const CITY: V3 = [0, 0, 95];       // Kadesh on its mound
export const MOUND_H = 5;
export const RIVER_Z = 58;                // the Orontes runs along x in front of the city
export const CAMP: V3 = [-6, 0, 22];      // Egyptian camp (Ramesses' tent at its centre)
export const TEMPLE: V3 = [300, 0, 0];    // temple wall (faces -z), reliefs from y 1.5 to 11
export const UN: V3 = [-300, 0, 0];       // UN hallway; the treaty replica hangs on the back wall (z = +6)
export const groundY = (x: number, z: number) => {
  const d = Math.hypot(x - CITY[0], z - CITY[2]);
  return d < 26 ? MOUND_H : d < 34 ? MOUND_H * (34 - d) / 8 : 0;
};

// ---------------- story positions ----------------
/** Ramesses racing ahead (4): along +z on the plain */
export const raceZ = (t: number) => -20 + 11 * (t - 24.8);
/** Hittite chariots charging (6a): from behind the city toward the plain */
export const chargeZ = (t: number) => 70 - 13 * (t - 30.4);
/** the Egyptian second army marching (6b) along +z at x = 18 */
export const ARMY2_X = 18;

// ---------------- shots ----------------
export type Light = "day" | "golden" | "night";
export type Crowd = "hook" | "march" | "nomads" | "race" | "spies" | "charge" | "camp" | "legend" | "rescue" | "draw" | "feed" | "reel" | "carve" | "treaty" | "un";
export type ShotDef = { id: number; a: number; b: number; light: Light; crowd: Crowd; sunAz?: number; sunEl?: number };
const C: [Crowd, Light][] = [["hook", "day"], ["march", "day"], ["nomads", "day"], ["race", "day"], ["spies", "day"], ["charge", "day"], ["camp", "day"],
  ["legend", "golden"], ["rescue", "day"], ["draw", "day"], ["feed", "day"], ["reel", "golden"], ["carve", "day"], ["treaty", "golden"], ["un", "day"]];
const CUTS = [0, 265, 513, 699, 855, 911, 1079, 1134, 1315, 1408, 1575, 1750, 1860, 2066, 2219, TOTAL];
export const SHOTS: ShotDef[] = C.map(([crowd, light], i) => ({ id: i + 1, a: CUTS[i], b: CUTS[i + 1], light, crowd }));
for (const i of [7, 11, 13]) { SHOTS[i].sunAz = 125; SHOTS[i].sunEl = 16; }
export const XFADE: Record<number, number> = { 8: 8, 9: 8, 11: 8, 14: 8, 15: 8 };
export const FLASH_AT = 265;
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

/** where the hook / legend chariot stands (on the plain, facing +x) */
export const HERO: V3 = [40, 0, -30];
const CAMS: Record<number, Key[]> = {
  1: [
    { f: 0, s: (f) => dolly(at(HERO, 1.2, 1.9, -5.8), at(HERO, 0.6, 1.9, 0), pushK(f, 0, 0.003), { fov: 42, roll: 0.03 }) },
    { f: 49, cut: true, s: (f) => dolly(at(HERO, 6.5, 1.2, -6.5), at(HERO, 5.0, 0.6, 0), pushK(f, 49, 0.0025, 0.007, 30), { fov: 44, roll: -0.05 }) },
    { f: 171, cut: true, s: (f) => zoom(at(TEMPLE, 0, 3.0, -16), at(TEMPLE, 0, 4.5 + 2.0 * clamp01((f - 171) / 80), 10), 50, pushK(f, 171, 0.002)) },
  ],
  2: [
    { f: 261, s: (f) => zoom([-55, 42, -40], [0, 0, 60], 46, pushK(f, 261, 0.0018)) },
    { f: 410, cut: true, s: (f) => { const z = -40 + 1.3 * (T(f) - 13.67); return dolly([7.5, 1.6, z + 2], [0, 1.4, z + 4], pushK(f, 410, 0.0015), { fov: 46 }); } },
  ],
  3: [
    { f: 513, s: (f) => dolly(at(CAMP, 3.2, 1.7, -6.5), at(CAMP, 0.6, 1.25, 0), pushK(f, 513, 0.0022), { fov: 44 }) },
    { f: 636, dur: 22, s: (f) => dolly(at(CAMP, 2.0, 1.6, -4.4), at(CAMP, 0.9, 1.6, 0.3), pushK(f, 636, 0.0025), { fov: 40, roll: 0.03 }) },
  ],
  4: [
    { f: 699, s: (f) => dolly(at(CAMP, 0.6, 1.75, -3.4), at(CAMP, 0, 1.45, 0.5), pushK(f, 699, 0.003, 0.008, 30), { fov: 40 }) },
    { f: 750, cut: true, s: (f) => { const z = raceZ(T(f)); return { pos: [9, 1.5, z - 1], look: [0, 1.2, z + 2.5], fov: 48, roll: -0.03 }; } },
    { f: 826, cut: true, s: (f) => zoom(at(CAMP, -4, 6, -16), at(CAMP, 0, 1, 2), 50, pushK(f, 826, 0.002)) },
  ],
  5: [{ f: 855, s: (f) => dolly(at(CAMP, 9.5, 1.65, -9.6), at(CAMP, 8.0, 1.3, -6.4), pushK(f, 855, 0.003, 0.007, 30), { fov: 42 }) }],
  6: [
    { f: 911, s: (f) => zoom([22, 3.2, 38], [10, MOUND_H + 2, 78], 48, pushK(f, 911, 0.002)) },
    { f: 1012, cut: true, s: (f) => dolly([ARMY2_X + 10, 2.2, 2], [ARMY2_X, 1.2, 6], pushK(f, 1012, 0.002), { fov: 50, roll: 0.04 }) },
  ],
  7: [{ f: 1079, s: (f) => dolly(at(CAMP, 7.5, 2.4, -9), at(CAMP, 0, 1.4, 0), pushK(f, 1079, 0.002), { fov: 48, roll: -0.04 }) }],
  8: [
    { f: 1130, s: (f) => dolly(at(CAMP, 1.0, 1.8, -7.5), at(CAMP, 0, 1.4, 2), pushK(f, 1130, 0.002), { fov: 46 }) },
    { f: 1225, cut: true, s: (f) => dolly(at(HERO, 2.8, 1.5, -6.6), at(HERO, 2.0, 1.9, 0), pushK(f, 1225, 0.002, 0.006, 30), { fov: 44, roll: 0.05 }) },
  ],
  9: [{ f: 1311, s: (f) => zoom([20, 2.2, -64], [0, 2.5, -42], 46, pushK(f, 1311, 0.002)) }],
  10: [
    { f: 1404, s: (f) => dolly([6, 2.0, 24], [0, 1.0, 32], pushK(f, 1404, 0.002), { fov: 46 }) },
    { f: 1515, cut: true, s: (f) => zoom([-6, 3, 52], [0, MOUND_H + 3.5, 72], 36, pushK(f, 1515, 0.0025, 0.006, 30)) },
  ],
  11: [
    { f: 1571, s: (f) => dolly(at(TEMPLE, -3.5, 1.7, -5.5), at(TEMPLE, -3.5, 1.4, -2), pushK(f, 1571, 0.0025), { fov: 42 }) },
    { f: 1663, cut: true, s: (f) => { const u = clamp01((f - 1663) / 85); return { pos: at(TEMPLE, 0, 2 + 6 * u, -10), look: at(TEMPLE, 0, 2.6 + 6 * u, 10), fov: 44 }; } },
  ],
  12: [
    { f: 1746, s: (f) => dolly(at(TEMPLE, 0, 3.0, -5.6), at(TEMPLE, 0, 3.0, 0), pushK(f, 1746, 0.0018), { fov: 42 }) },
    { f: 1795, dur: 20, s: (f) => dolly(at(TEMPLE, 1.0, 2.9, -4.6), at(TEMPLE, 1.1, 2.8, 0), pushK(f, 1795, 0.002), { fov: 40, roll: -0.04 }) },
  ],
  13: [
    { f: 1860, s: (f) => dolly(at(TEMPLE, 4.0, 1.7, -4.2), at(TEMPLE, 5.5, 2.2, 9.6), pushK(f, 1860, 0.0025), { fov: 44 }) },
    { f: 1968, dur: 40, s: (f) => zoom(at(TEMPLE, 0, 2.0, -24), at(TEMPLE, 0, 6.0, 10), 54, pushK(f, 1968, 0.0015)) },
  ],
  14: [
    { f: 2062, s: (f) => dolly(at(CAMP, 0.5, 1.75, -4.2), at(CAMP, 0, 1.3, 0.6), pushK(f, 2062, 0.0025), { fov: 44 }) },
    { f: 2130, dur: 24, s: (f) => dolly(at(CAMP, 0.2, 1.6, -2.4), at(CAMP, 0, 1.05, 0.5), pushK(f, 2130, 0.003), { fov: 40, roll: 0.03 }) },
  ],
  15: [
    { f: 2215, s: (f) => zoom(at(UN, 0, 1.7, -7), at(UN, 0, 2.0, 6), 50, pushK(f, 2215, 0.002)) },
    { f: 2290, dur: 40, s: (f) => zoom(at(UN, 0, 1.7, -7), at(UN, 0, 2.2, 6), 22, pushK(f, 2290, 0.0015)) },
  ],
};

const KICKS: [number, number][] = [[1.65, 0.9], [33.8, 0.8], [34.25, 0.7], [36.48, 1.1], [42.0, 0.6], [67.76, 0.6]];
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
  { f: 0, cInf: 12 }, { f: 49, cInf: 9 }, { f: 171, cInf: 0 }, { f: 410, cInf: 7 }, { f: 513, cInf: 9 }, { f: 699, cInf: 12 }, { f: 750, cInf: 6 },
  { f: 826, cInf: 0 }, { f: 855, cInf: 12 }, { f: 911, cInf: 0 }, { f: 1012, cInf: 5 }, { f: 1079, cInf: 4 }, { f: 1134, cInf: 8 }, { f: 1225, cInf: 9 },
  { f: 1315, cInf: 0 }, { f: 1408, cInf: 7 }, { f: 1515, cInf: 0 }, { f: 1575, cInf: 10 }, { f: 1663, cInf: 0 }, { f: 1750, cInf: 6 }, { f: 1860, cInf: 9 },
  { f: 1968, dur: 40, cInf: 0 }, { f: 2066, cInf: 11 }, { f: 2219, cInf: 4 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
export const focusAt = (id: number, f: number): V3 => { const d = dofAt(f); return d.focus ? d.focus(f) : camAt(id, f).look; };

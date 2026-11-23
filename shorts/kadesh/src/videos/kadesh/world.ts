// The Arcole set as one three.js scene: sky, marsh, the dike, the Alpone, the wooden bridge, the village on the far
// bank, reeds, the mud pool, the painter's easel, and (far away at x = 500) a night street for the analogy.
// update(id, f, camera) poses everything for shot `id` at frame f (pure function of id + f).
import * as THREE from "three";
import { Batch, boxGeo, V, lam, house, Kit, Ray, setSight, blocks, prop } from "./build";
import { ctex, grassHD, planksHD, stoneHD, cloudHD, beam, bed, facadeHD } from "./paint";
import { Pen, flowerTuft, fxRelief, fxTablet } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, LFB, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage, SU } from "./cast";
import { FPS, SHOTS, camAt, V3, ShotDef, CITY, MOUND_H, RIVER_Z, CAMP, TEMPLE, UN, smooth } from "./story";

// ---------------- assets ----------------
let kitP: Promise<Kit> | null = null;
export const loadKit = () => { if (!kitP) kitP = Promise.resolve({} as Kit); return kitP; };

const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});
const dirtTex = () => ctex("dirtHD", 1024, 1024, (g, r) => {
  g.fillStyle = "#b99467"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 900; i++) { const x = r() * 1024, y = r() * 1024, s = 3 + r() * 10; g.fillStyle = r() < 0.5 ? "rgba(120,85,50,.25)" : "rgba(230,200,150,.25)"; g.beginPath(); g.ellipse(x, y, s, s * 0.6, r() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 14; i++) { const x = 160 + r() * 700; g.strokeStyle = "rgba(110,80,50,.25)"; g.lineWidth = 10 + r() * 14; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 80, 1024); g.stroke(); }
});
const leafTex = () => ctex("leafLitter", 1024, 1024, (g, r) => {
  g.fillStyle = "#a88655"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 1400; i++) {
    const x = r() * 1024, y = r() * 1024, s = 6 + r() * 12, c = ["#d98a3a", "#c8602e", "#e2b046", "#9a6a3a", "#b07a3a", "#8f9a4a"][Math.floor(r() * 6)];
    g.fillStyle = c; g.beginPath(); g.ellipse(x, y, s, s * 0.5, r() * 3.1, 0, 7); g.fill();
  }
});
const mudTex = () => ctex("mudHD", 512, 512, (g, r) => {
  g.fillStyle = "#5d4630"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 160; i++) { const x = r() * 512, y = r() * 512, s = 6 + r() * 22; g.fillStyle = r() < 0.5 ? "rgba(40,28,18,.35)" : "rgba(140,110,70,.3)"; g.beginPath(); g.ellipse(x, y, s, s * 0.5, 0, 0, 7); g.fill(); }
  for (let i = 0; i < 30; i++) { const x = r() * 512, y = r() * 512; g.strokeStyle = "rgba(200,180,140,.35)"; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y, 10 + r() * 12, 4, 0, 3.4, 6.0); g.stroke(); }
});

/** every lens position looking at its subject: centre, sides and top of frame (things there are left out) */
const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) for (let f = s.a - 8; f < s.b + 8; f += 2) {
    const c = camAt(s.id, Math.max(0, Math.min(f, s.b + 7))), o = V(...c.pos), look = V(...c.look);
    const fw = look.clone().sub(o), len = fw.length();
    fw.normalize();
    const rt = fw.clone().cross(V(0, 1, 0)).normalize(), up = rt.clone().cross(fw);
    const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * (9 / 16);
    for (const [sx, sy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, 0.6], [0, -0.4]])
      out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(up, sy * ty), len, core: sx === 0 && sy === 0 });
  }
  return out;
};
const rand = (s: number) => { const v = Math.sin(s * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/** horizontal quad facing up at height y covering x0..x1, z0..z1 */
function quadAt(x0: number, x1: number, z0: number, z1: number, y: number, u: number, v: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z1, x1, y, z0, x0, y, z0], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
  return g;
}
/** generic quad from 4 corners (counter-clockwise seen from the front), uv tiled u x v */
function quad4(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, u = 1, v = 1, want = V(0, 1, 0)) {
  const nrm = b.clone().sub(a).cross(c.clone().sub(a));
  if (nrm.dot(want) < 0) { const tmp = b; b = d; d = tmp; }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray()], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, u, 0, u, v, 0, 0, u, v, 0, v], 2));
  g.computeVertexNormals();
  return g;
}
const SUN_SHOT: Record<number, { az?: number; el?: number }> = {};

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private bodies: Actor[] = [];
  private horses: Actor[] = [];
  private birds: Actor[] = [];
  private cars: Actor[] = [];
  private tents: THREE.Mesh[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden" | "night", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private flags: THREE.Mesh[] = [];
  private glow: THREE.Sprite[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit) {
    const R = this.root;
    // ---- sky + light ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, depthTest: true,
      transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    R.add(this.hemi, this.sun, this.sun.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)), night: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.night.cloud)) };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 130 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 120 + (i % 4) * 38, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.9, d = 520 + (i % 3) * 50;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[(i + 1) % 4], color: new THREE.Color(1.08, 1.08, 1.08), transparent: true, depthWrite: false, fog: false }));
      const w = 110 + (i % 3) * 40;
      m.position.set(Math.cos(a) * d, 38 + (i % 4) * 16, Math.sin(a) * d); m.scale.set(w, w / 2.2, 1);
      m.layers.set(NOINK);
      this.clouds.push(m); R.add(m);
    }

    const rays = sightLines();
    setSight(rays);
    const nearLens = (x: number, z: number, r = 4) => rays.some((q) => Math.hypot(q.o.x - x, q.o.z - z) < r);
    const b = new Batch();
    const sand = lam("sand", () => ({ map: dirtTex(), color: "#f0d9a8" }));
    const sandDark = lam("sandDark", () => ({ map: dirtTex(), color: "#d9b884" }));
    const mud = lam("mudbrick", () => ({ map: stoneHD("mudbrickHD", ["#d9b98a", "#cfae7e", "#e0c294", "#c6a474"], "#a88a5e") }));
    const sandstone = lam("sandstone", () => ({ map: stoneHD("sandstoneHD", ["#e8cf9e", "#e0c592", "#efd8aa", "#d8bc88"], "#b89a6a") }));
    const wood = lam("wood", () => ({ map: beam() }));
    const water = lam("river", () => ({ color: "#4f9fc0" }));
    const palmLeaf = lam("palmLeaf", () => ({ color: "#6f9a3c", side: THREE.DoubleSide }));
    const trunk = lam("palmTrunk", () => ({ color: "#8a6a45" }));
    // ---- desert plain, dunes, the Orontes ----
    b.add(quadAt(-150, 150, -200, 200, 0, 30, 40), sand);
    b.add(quadAt(-150, 150, RIVER_Z - 4, RIVER_Z + 4, 0.03, 1, 1), water);
    for (let i = 0; i < 40; i++) {
      const x = -140 + rand(i * 2.1) * 280, z = -190 + rand(i * 3.7) * 380;
      if (Math.abs(z - RIVER_Z) < 10 || Math.hypot(x - CITY[0], z - CITY[2]) < 40 || nearLens(x, z, 14)) continue;
      const g = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); const s = 8 + rand(i) * 14;
      b.add(g, i % 2 ? sand : sandDark, new THREE.Matrix4().compose(V(x, -0.2, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rand(i * 5) * 3), V(s * 1.6, 1.5 + rand(i * 7) * 2.5, s)));
    }
    // big dune behind the rescue army
    { const g = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); b.add(g, sandDark, new THREE.Matrix4().compose(V(0, -0.5, -58), new THREE.Quaternion(), V(30, 4.5, 10))); }
    const palm = (x: number, z: number, h: number) => {
      if (nearLens(x, z, 5)) return;
      b.add(new THREE.CylinderGeometry(0.18, 0.28, h, 8).translate(x, h / 2, z), trunk);
      for (let k = 0; k < 7; k++) { const a2 = (k / 7) * Math.PI * 2 + rand(x + z) * 2; const g = new THREE.PlaneGeometry(3.2, 0.7); g.translate(1.6, 0, 0); g.rotateX(-Math.PI / 2); g.rotateZ(-0.5); g.rotateY(a2); g.translate(x, h, z); b.add(g, palmLeaf); }
    };
    for (let i = 0; i < 30; i++) { const x = -80 + rand(i * 9.3) * 160, z = RIVER_Z + (rand(i * 1.9) < 0.5 ? -1 : 1) * (6 + rand(i * 4.4) * 8); palm(x, z, 6 + rand(i) * 4); }
    for (let i = 0; i < 30; i++) { const x = -90 + rand(i * 6.1) * 180, z = RIVER_Z + (rand(i * 2.7) < 0.5 ? -1 : 1) * (10 + rand(i * 8.8) * 12); if (!nearLens(x, z, 6)) prop(b, {} as Kit, "tree_oak", x, 0, z, 4 + rand(i * 3) * 2); }
    // ---- Kadesh: mound, walls with towers and crenellations, a gate, houses ----
    const [kx, , kz] = CITY;
    { const g = new THREE.CylinderGeometry(26, 34, MOUND_H, 48, 1); g.translate(kx, MOUND_H / 2, kz); b.add(g, sandDark); }
    const R0 = 22, WH = 4.2;
    for (let k = 0; k < 40; k++) {
      const a0 = (k / 40) * Math.PI * 2, a1 = ((k + 1) / 40) * Math.PI * 2;
      if (Math.abs(a0 - 1.5 * Math.PI) < 0.08) continue; // gate gap (faces -z)
      const p0 = V(kx + R0 * Math.cos(a0), MOUND_H, kz + R0 * Math.sin(a0)), p1 = V(kx + R0 * Math.cos(a1), MOUND_H, kz + R0 * Math.sin(a1));
      const mid = p0.clone().add(p1).multiplyScalar(0.5), len = p0.distanceTo(p1);
      const g = new THREE.BoxGeometry(len + 0.1, WH, 1.4); g.rotateY(-(a0 + a1) / 2 + Math.PI / 2); g.translate(mid.x, MOUND_H + WH / 2, mid.z); b.add(g, mud);
      for (let c = 0; c < 3; c++) { const u = (c + 0.5) / 3, q2 = p0.clone().lerp(p1, u); const cb = new THREE.BoxGeometry(0.6, 0.7, 1.5); cb.rotateY(-(a0 + a1) / 2 + Math.PI / 2); cb.translate(q2.x, MOUND_H + WH + 0.35, q2.z); b.add(cb, mud); }
      if (k % 5 === 0) { const tg = new THREE.BoxGeometry(3.2, WH + 2.6, 3.2); tg.translate(p0.x, MOUND_H + (WH + 2.6) / 2, p0.z); b.add(tg, mud); }
    }
    for (let i = 0; i < 26; i++) { const a2 = rand(i * 4.3) * Math.PI * 2, r = rand(i * 1.3) * 17; const hx = kx + Math.cos(a2) * r, hz = kz + Math.sin(a2) * r, s = 2.5 + rand(i) * 2.5; b.add(boxGeo(V(hx - s, MOUND_H, hz - s * 0.8), V(hx + s, MOUND_H + 2.5 + rand(i * 9) * 2.5, hz + s * 0.8), 2), mud); }
    // ---- the Egyptian camp: shield wall + striped tents (animated: pop up in shot 4, one collapses in shot 7) ----
    const [cx, , cz] = CAMP;
    const tentTex = ctex("tentStripe", 256, 256, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#c8323a" : "#f4ecd8"; g.fillRect(i * 32, 0, 32, 256); } });
    const tentM = lam("tentM", () => ({ map: tentTex, side: THREE.DoubleSide }));
    const tentSpots: [number, number, number][] = [[1.6, 0.9, 1.5], [-6, 5, 1], [5, 6, 1], [-9, -3, 1], [8, -2, 1], [-3, 10, 1], [10, 9, 1], [-11, 9, 1]];
    for (const [dx, dz, s] of tentSpots) {
      if (nearLens(cx + dx, cz + dz, 2.2)) continue;
      const g = new THREE.ConeGeometry(2.4 * s, 2.8 * s, 4, 1, true); g.rotateY(Math.PI / 4); g.translate(0, 1.4 * s, 0);
      const m = new THREE.Mesh(g, tentM); m.position.set(cx + dx, 0, cz + dz); m.castShadow = true; m.receiveShadow = true;
      this.tents.push(m); R.add(m);
    }
    for (let i = 0; i < 30; i++) { const a2 = (i / 30) * Math.PI * 2, x = cx + Math.cos(a2) * 15, z = cz + Math.sin(a2) * 15; if (nearLens(x, z, 3)) continue; const g = new THREE.BoxGeometry(2.6, 1.3, 0.25); g.rotateY(-a2 + Math.PI / 2); g.translate(x, 0.65, z); b.add(g, lam("shield", () => ({ color: "#c9965a" }))); }
    // ---- the temple wall (faces -z at TEMPLE.z + 10) with carved, painted relief panels and a scaffold ----
    const [tx, , tz] = TEMPLE, wz = tz + 10;
    b.add(quadAt(tx - 60, tx + 60, tz - 60, tz + 60, 0, 12, 12), sand);
    b.add(boxGeo(V(tx - 16, 0, wz), V(tx + 16, 12.5, wz + 2.5), 2), sandstone);
    for (const s of [-1, 1]) b.add(boxGeo(V(tx + s * 16 - (s < 0 ? 4 : 0), 0, wz - 0.6), V(tx + s * 16 + (s > 0 ? 4 : 0), 15, wz + 3)), sandstone);
    b.add(boxGeo(V(tx - 16.4, 12.5, wz - 0.4), V(tx + 16.4, 13.3, wz + 2.6)), sandstone);
    for (const [x0, x1, y0, y1] of [[4.2, 7.6, 0, 0.2], [4.2, 7.6, 2.9, 3.05]] as const) b.add(boxGeo(V(tx + x0, y0, wz - 1.2), V(tx + x1, y1, wz - 0.4)), wood);
    for (const x of [4.3, 7.5]) for (const z2 of [-1.15, -0.45]) b.add(boxGeo(V(tx + x - 0.06, 0, wz + z2 - 0.06), V(tx + x + 0.06, 4.2, wz + z2 + 0.06)), wood);
    b.build(R);
    const panel = (variant: number, x: number, y: number, w2: number, h2: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w2, h2), lam("relief" + variant, () => ({ map: ctex("relief" + variant, 1600, 1000, (g) => fxRelief(new Pen(g), variant)) })));
      m.position.set(tx + x, y, wz - 0.02); m.rotation.y = Math.PI; m.receiveShadow = true; R.add(m);
    };
    panel(0, 0, 4.5, 12, 7.5);       // the giant victory (centre)
    panel(1, -10.5, 3.6, 7.5, 4.7); panel(2, 10.5, 3.6, 7.5, 4.7);
    panel(2, -10.5, 9.2, 7.5, 4.7); panel(1, 10.5, 9.2, 7.5, 4.7); panel(1, 0, 10.6, 9, 3.4);
    // ---- UN hallway: polished floor, pale walls, wood doors, the copper treaty replica ----
    const [ux, , uz] = UN;
    const ub = new Batch();
    ub.add(quadAt(ux - 12, ux + 12, uz - 12, uz + 8, 0, 6, 5), lam("unFloor", () => ({ color: "#b9b6ae" })));
    const wallM = lam("unWall", () => ({ color: "#eef0f2" }));
    ub.add(boxGeo(V(ux - 12, 0, uz + 6), V(ux + 12, 7, uz + 6.3)), wallM);
    ub.add(boxGeo(V(ux - 12, 0, uz - 12), V(ux - 11.7, 7, uz + 6.3)), wallM);
    ub.add(boxGeo(V(ux + 11.7, 0, uz - 12), V(ux + 12, 7, uz + 6.3)), wallM);
    ub.add(boxGeo(V(ux + 3.5, 0, uz + 5.9), V(ux + 7.5, 4.2, uz + 6.0)), lam("unDoor", () => ({ color: "#7a4a2a" })));
    ub.add(boxGeo(V(ux - 1.0, 1.15, uz + 5.85), V(ux + 1.0, 3.35, uz + 5.95)), lam("unFrame", () => ({ color: "#2a2c36" })));
    for (const x of [-3, 3]) { ub.add(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 10).translate(ux + x, 0.5, uz + 4.2), lam("brass", () => ({ color: "#c9932e" }))); }
    ub.add(boxGeo(V(ux - 3, 0.88, uz + 4.17), V(ux + 3, 0.95, uz + 4.23)), lam("rope", () => ({ color: "#8a2a3a" })));
    ub.build(R);
    const tab = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), new THREE.MeshBasicMaterial({ map: ctex("tabletUN", 500, 640, (g) => fxTablet(new Pen(g))), color: 0xdddddd }));
    tab.position.set(ux, 2.25, uz + 5.82); tab.rotation.y = Math.PI; tab.layers.set(NOINK); R.add(tab);
    // sand motes / tufts: dry grass clumps on the plain
    const rb = new Batch();
    const tuftMats = [0, 1, 2].map((k) => lam("tuftM" + k, () => ({ map: ctex("tuft" + k, 256, 256, (g) => flowerTuft(new Pen(g), k * 7 + 3)), alphaTest: 0.5, side: THREE.DoubleSide, color: "#d9c28a" })));
    for (let i = 0; i < 260; i++) {
      const x = -60 + rand(i * 1.9) * 120, z = -60 + rand(i * 3.7) * 110, h = 0.35 + rand(i) * 0.3;
      if (Math.abs(z - RIVER_Z) < 4.5 || Math.hypot(x - kx, z - kz) < 36 || blocks(x - 0.3, x + 0.3, 0, h, z - 0.3, z + 0.3, true)) continue;
      const a2 = rand(x * 5.3 + z * 1.7) * Math.PI;
      for (const r of [a2, a2 + Math.PI / 2]) { const g = new THREE.PlaneGeometry(h, h); g.translate(0, h / 2, 0); g.rotateY(r); g.translate(x, -0.02, z); const nn = g.attributes.normal as THREE.BufferAttribute; for (let q2 = 0; q2 < nn.count; q2++) nn.setXYZ(q2, 0, 1, 0); rb.add(g, tuftMats[i % 3]); }
    }
    rb.build(R, false);
    R.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && tuftMats.includes(m.material as THREE.MeshLambertMaterial)) m.layers.set(NOINK); });
    // banners: Egypt (blue/gold) at the camp, Hittite (red) on the city
    for (const [x, y, z, col] of [[CAMP[0] - 2.6, 0, CAMP[2] + 4.5, "eg"], [CITY[0] + 4, MOUND_H + 4.2, CITY[2] - 22, "hi"]] as const) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 5, 0.09), wood); pole.position.set(x, y + 2.5, z); pole.castShadow = true; R.add(pole);
      const tex = ctex("flag" + col, 240, 160, (g) => { if (col === "eg") { g.fillStyle = "#2f5fb5"; g.fillRect(0, 0, 240, 160); g.fillStyle = "#e8c45a"; g.beginPath(); g.arc(120, 80, 45, 0, 7); g.fill(); } else { g.fillStyle = "#9a2a2a"; g.fillRect(0, 0, 240, 160); g.fillStyle = "#e8c45a"; g.beginPath(); g.moveTo(120, 20); g.lineTo(170, 140); g.lineTo(70, 140); g.fill(); } });
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05, 12, 1), lam("flagM" + col, () => ({ map: tex, side: THREE.DoubleSide })));
      fl.position.set(x, y + 4.4, z); fl.castShadow = true; fl.frustumCulled = false; this.flags.push(fl); R.add(fl);
    }
  }

  /** camera-relative sun, frozen per shot */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(s.sunAz ?? SUN_SHOT[id]?.az ?? L.az), el = THREE.MathUtils.degToRad(s.sunEl ?? SUN_SHOT[id]?.el ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }
  private body(i: number) { while (this.bodies.length <= i) this.bodies.push(new Actor(this.root)); return this.bodies[i]; }
  private horse(i: number) { while (this.horses.length <= i) this.horses.push(new Actor(this.root, HORSE_GEO)); return this.horses[i]; }
  private bird(i: number) { while (this.birds.length <= i) this.birds.push(new Actor(this.root, BIRD_GEO)); return this.birds[i]; }
  private car(i: number) { while (this.cars.length <= i) this.cars.push(new Actor(this.root, CAR_GEO)); return this.cars[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light];
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.2; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    const K = LOOK[s.light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light === "golden";
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7)));
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)));
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(L.sunDisc).multiplyScalar(1.3);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i], mat = m.material as THREE.MeshBasicMaterial;
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      mat.map = this.cloudMaps[s.light][i % 4];
    }
    for (const g of this.glow) g.visible = s.light === "night";
    this.tents.forEach((m, i) => {
      let k = 1, sq = 1;
      if (id === 4) k = smooth((t - 27.55 - i * 0.09) / 0.35);
      if (id === 7 && i === 0) sq = 1 - 0.8 * smooth((t - 36.45) / 0.25);
      m.scale.set(1 + (1 - sq) * 0.6, Math.max(0.001, k * sq), 1 + (1 - sq) * 0.6);
    });
    for (const fl of this.flags) {
      const p = fl.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const u = (i % 13) / 12, y = i < 13 ? 0.5 : -0.5;
        p.setXYZ(i, -u * 1.5 + 0.75, y + 0.05 * u * Math.sin(t * 4 - u * 3), 0.22 * u * Math.sin(t * 5.5 - u * 5 + fl.position.z));
      }
      p.needsUpdate = true;
    }
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let bi = 0, hi = 0, pi = 0, ci = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1, isH = p.geo === "horse";
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), (p.geo === "chariot" ? 4.5 : isH ? 3.2 : 2.2) * sc2))) continue;
      const a = p.geo === "chariot" ? this.car(ci++) : p.geo === "pigeon" ? this.bird(pi++) : isH ? this.horse(hi++) : this.body(bi++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      const [qx, qy] = p.sq ?? [1, 1];
      a.mesh.scale.set((p.mirror ? -sc2 : sc2) * qx, sc2 * qy, sc2);
      a.mesh.castShadow = L.actorShadow;
      used.push(a);
    }
    for (let i = bi; i < this.bodies.length; i++) this.bodies[i].mesh.visible = false;
    for (let i = hi; i < this.horses.length; i++) this.horses[i].mesh.visible = false;
    for (let i = pi; i < this.birds.length; i++) this.birds[i].mesh.visible = false;
    for (let i = ci; i < this.cars.length; i++) this.cars[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e2 = this.fx(fi++);
      e2.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e2.use(!!p.soft);
      e2.mesh.visible = true;
      e2.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e2.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e2.mesh.quaternion.copy(cam.quaternion); e2.mesh.rotateZ(p.rot ?? 0); }
      e2.mesh.scale.set(p.w, p.h, 1);
      fused.push(e2);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e3 of fused) e3.bind();
    return focus;
  }
}

const CAR_GEO = (() => { const g = new THREE.PlaneGeometry(2000 * SU, 1400 * SU); g.translate(0, (1375 - 700) * SU, 0); return g; })();
const BIRD_GEO = (() => { const g = new THREE.PlaneGeometry(0.8, 0.8); g.translate(0, (300 - 25) * (0.8 / 600), 0); return g; })();
const HORSE_GEO = (() => { const g = new THREE.PlaneGeometry(1400 * SU, 1400 * SU); g.translate(0, (1375 - 700) * SU, 0); return g; })();
const WATER_DECL = `#include <common>
varying vec3 vWP;
uniform vec3 wNearC, wMidC, wFarC, wCrest, wTrough, wGlint, wShade;
uniform sampler2D wNearTex, wFarTex;
uniform float wTime;`;
const WATER_COL = `
  vec3 wV = vWP - cameraPosition;
  float wd = length(wV);
  float wDep = asin(clamp(-wV.y / wd, 0.0, 1.0));       // depression angle of the view ray
  float wf = 1.0 - smoothstep(0.0, 0.42, wDep);         // 1 at the horizon .. 0 at 24 deg down
  vec3 wc = mix(mix(wNearC, wMidC, smoothstep(0.0, 0.55, wf)), wFarC, smoothstep(0.55, 1.0, wf));
  vec2 wp = vWP.xz + vec2(0.35 * wTime, 0.0);           // slow river along +x
  vec4 mk = mix(texture2D(wNearTex, wp / 8.0), texture2D(wFarTex, wp / 40.0 + 0.37), smoothstep(25.0, 90.0, wd));
  wc = mix(wc, wTrough, mk.g * 0.6);
  wc = mix(wc, wCrest, mk.r * 0.7);
  wc = mix(wc, wGlint, mk.b * (0.3 + 0.5 * wf));
  diffuseColor.rgb = wc;`;

// The Arcole set as one three.js scene: sky, marsh, the dike, the Alpone, the wooden bridge, the village on the far
// bank, reeds, the mud pool, the painter's easel, and (far away at x = 500) a night street for the analogy.
// update(id, f, camera) poses everything for shot `id` at frame f (pure function of id + f).
import * as THREE from "three";
import { Batch, boxGeo, V, lam, house, Kit, Ray, setSight, blocks, prop } from "./build";
import { ctex, grassHD, planksHD, stoneHD, cloudHD, beam, bed, facadeHD } from "./paint";
import { Pen, flowerTuft } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, LFB, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage, SU } from "./cast";
import { FPS, SHOTS, camAt, V3, ShotDef, HQ, LOFT, BOARD_Y, TABLE, MUSEUM, CASE_Y, LAB } from "./story";

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
    const litter = lam("litter", () => ({ map: leafTex() }));
    const grass = lam("grassHQ", () => ({ map: grassHD(), color: "#b9c48a" }));
    const dirt = lam("dirtHD", () => ({ map: dirtTex() }));
    const wood = lam("wood", () => ({ map: beam() }));
    const crater = lam("crater", () => ({ map: mudTex(), color: "#9a8870" }));
    const canvas = lam("tent", () => ({ color: "#c9bd94", side: THREE.DoubleSide }));
    const floor = lam("planksHD", () => ({ map: planksHD() }));
    const wall = lam("museumWall", () => ({ color: "#e9dcc0" }));
    const wainscot = lam("wainscot", () => ({ color: "#7a4a35" }));
    const stone = lam("pedestal", () => ({ map: stoneHD("pedestalHD") }));
    const bench = lam("bench", () => ({ color: "#d9d4c8" }));
    // ---- forest (origin): leaf-litter floor, shell craters, logs, an autumn wood all round the pocket ----
    b.add(quadAt(-150, 150, -150, 150, 0, 40, 40), litter);
    for (const [x, z, r] of [[2.6, 6.5, 1.6], [-3.8, 4.4, 1.4], [4.6, -1.2, 1.3], [-1.2, 8.2, 1.5], [-6, -3, 1.2], [7, 4, 1.3]] as const) {
      const g = new THREE.CircleGeometry(r, 18); g.rotateX(-Math.PI / 2); b.add(g, crater, new THREE.Matrix4().makeTranslation(x, 0.02, z));
    }
    for (const [x, z, yaw, len] of [[-2.2, -1.8, 0.4, 3.2], [3.2, 4.6, -0.7, 2.8], [-5.2, 5.6, 1.2, 3.6], [5.8, 0.2, 0.1, 2.6]] as const) {
      const g = new THREE.CylinderGeometry(0.22, 0.26, len, 10); g.rotateZ(Math.PI / 2); g.rotateY(yaw); g.translate(x, 0.24, z); b.add(g, wood);
    }
    for (let i = 0; i < 260; i++) {
      const a = rand(i * 1.7) * Math.PI * 2, r = 10 + rand(i * 3.1) * 120, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (nearLens(x, z, 7)) continue;
      prop(b, {} as Kit, rand(i * 5.3) < 0.55 ? "tree_oak" : rand(i * 7.1) < 0.5 ? "tree" : "tree_fat", x, 0, z, 9 + rand(i * 2.3) * 7);
    }
    for (let i = 0; i < 70; i++) { const a = rand(i * 9.1) * Math.PI * 2, r = 8 + rand(i * 4.7) * 14; if (nearLens(Math.cos(a) * r, Math.sin(a) * r, 7)) continue; prop(b, {} as Kit, "plant_bush", Math.cos(a) * r, 0, Math.sin(a) * r, 1.2 + rand(i) * 0.6); }
    // ---- HQ field (x = 300): pigeon loft with a landing board, tents, flag poles, ceremony table ----
    b.add(quadAt(150, 450, -150, 150, 0, 40, 40), grass);
    b.add(quadAt(HQ[0] - 2, HQ[0] + 2, -40, 40, 0.01, 1, 20), dirt);
    const [lx, , lz] = LOFT;
    setSight([]); house(b, lx, lz, Math.PI, 6, 5, 3.6, 4, 0); setSight(rays); // the loft is the subject: never culled
    b.add(boxGeo(V(lx - 1.6, BOARD_Y - 0.12, lz - 2.95), V(lx + 1.6, BOARD_Y, lz - 2.45)), wood);
    for (const s of [-1, 1]) b.add(boxGeo(V(lx + s * 1.5 - 0.05, BOARD_Y - 0.9, lz - 2.9), V(lx + s * 1.5 + 0.05, BOARD_Y, lz - 2.8)), wood);
    b.add(boxGeo(V(lx - 1.4, BOARD_Y, lz - 2.55), V(lx + 1.4, BOARD_Y + 0.7, lz - 2.45)), lam("coop", () => ({ color: "#3a2a1e" })));
    for (const [x, z] of [[-14, 16], [-13, 25], [9, 28], [14, 8], [-17, 5]] as const) {
      const g = new THREE.ConeGeometry(2.4, 2.8, 4, 1, true); g.rotateY(Math.PI / 4); g.translate(HQ[0] + x, 1.4, HQ[2] + z); b.add(g, canvas);
    }
    b.add(boxGeo(V(TABLE[0] - 0.75, 0, TABLE[2] - 0.45), V(TABLE[0] + 0.75, 0.95, TABLE[2] + 0.45)), lam("tableCloth", () => ({ color: "#2f4f9a" })));
    b.add(boxGeo(V(TABLE[0] - 0.8, 0.95, TABLE[2] - 0.5), V(TABLE[0] + 0.8, 1.0, TABLE[2] + 0.5)), wood);
    for (let i = 0; i < 40; i++) { const a = rand(i * 2.9) * Math.PI * 2, r = 40 + rand(i * 6.1) * 100; prop(b, {} as Kit, rand(i) < 0.5 ? "tree_oak" : "tree", HQ[0] + Math.cos(a) * r, 0, HQ[2] + Math.sin(a) * r, 9 + rand(i * 3.3) * 6); }
    // ---- museum room (x = -300): planks, panelled walls, picture frames, the glass case; lab bench in a corner ----
    const [mx, , mz] = MUSEUM;
    b.add(quadAt(mx - 10, mx + 10, mz - 10, mz + 10, 0, 6, 6), floor);
    const roomWall = (a2: THREE.Vector3, c2: THREE.Vector3, want: THREE.Vector3) => { b.add(quad4(a2, c2, c2.clone().setY(6), a2.clone().setY(6), 1, 1, want), wall); b.add(quad4(a2.clone().addScaledVector(want, 0.01), c2.clone().addScaledVector(want, 0.01), c2.clone().setY(1.1).addScaledVector(want, 0.01), a2.clone().setY(1.1).addScaledVector(want, 0.01), 1, 1, want), wainscot); };
    roomWall(V(mx - 10, 0, mz + 6), V(mx + 10, 0, mz + 6), V(0, 0, -1));
    roomWall(V(mx - 7, 0, mz - 10), V(mx - 7, 0, mz + 10), V(1, 0, 0));
    roomWall(V(mx + 7, 0, mz + 10), V(mx + 7, 0, mz - 10), V(-1, 0, 0));
    for (const [x, y, w2, h2, c] of [[-4.5, 2.6, 1.6, 1.2, "#7f93b5"], [-1.2, 2.8, 1.2, 1.5, "#c9965a"], [2.6, 2.6, 1.8, 1.2, "#6f6c42"], [5.2, 2.9, 1.0, 1.3, "#c25a7a"]] as const) {
      b.add(boxGeo(V(mx + x - w2 / 2 - 0.08, y - h2 / 2 - 0.08, mz + 5.9), V(mx + x + w2 / 2 + 0.08, y + h2 / 2 + 0.08, mz + 5.98)), lam("frameGold", () => ({ color: "#c9932e" })));
      b.add(boxGeo(V(mx + x - w2 / 2, y - h2 / 2, mz + 5.88), V(mx + x + w2 / 2, y + h2 / 2, mz + 5.9)), lam("pic" + c, () => ({ color: c })));
    }
    b.add(boxGeo(V(mx - 0.5, 0, mz - 0.5), V(mx + 0.5, CASE_Y, mz + 0.5), 2), stone);
    const [bx2, , bz2] = LAB;
    b.add(boxGeo(V(bx2 - 1.4, 0, bz2 - 0.1), V(bx2 + 1.4, 0.92, bz2 + 0.5)), bench);
    b.add(boxGeo(V(bx2 - 0.35, 0.92, bz2 + 0.05), V(bx2 - 0.05, 1.0, bz2 + 0.35)), lam("micro", () => ({ color: "#2a2c36" })));
    b.add(boxGeo(V(bx2 - 0.25, 1.0, bz2 + 0.15), V(bx2 - 0.15, 1.45, bz2 + 0.25)), lam("micro", () => ({ color: "#2a2c36" })));
    b.build(R);
    // glass case: faint panes + dark edges (unlit)
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.05, 0.95), new THREE.MeshBasicMaterial({ color: "#cfe6f2", transparent: true, opacity: 0.12, depthWrite: false }));
    glass.position.set(mx, CASE_Y + 0.525, mz); glass.layers.set(NOINK); glass.renderOrder = 3; R.add(glass);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.95, 1.05, 0.95)), new THREE.LineBasicMaterial({ color: "#2a2c36" }));
    edges.position.copy(glass.position); edges.layers.set(NOINK); R.add(edges);
    // tufts around the HQ path and the forest pocket
    const rb = new Batch();
    const tuftMats = [0, 1, 2].map((k) => lam("tuftM" + k, () => ({ map: ctex("tuft" + k, 256, 256, (g) => flowerTuft(new Pen(g), k * 7 + 3)), alphaTest: 0.5, side: THREE.DoubleSide })));
    const tuft = (x: number, y: number, z: number, h: number, k: number) => {
      if (blocks(x - 0.3, x + 0.3, y, y + h, z - 0.3, z + 0.3, true)) return;
      const a2 = rand(x * 5.3 + z * 1.7) * Math.PI;
      for (const r of [a2, a2 + Math.PI / 2]) {
        const g = new THREE.PlaneGeometry(h, h); g.translate(0, h / 2, 0); g.rotateY(r); g.translate(x, y - 0.02, z);
        const nn = g.attributes.normal as THREE.BufferAttribute; for (let q2 = 0; q2 < nn.count; q2++) nn.setXYZ(q2, 0, 1, 0);
        rb.add(g, tuftMats[k % 3]);
      }
    };
    for (let i = 0; i < 220; i++) { const x = HQ[0] - 30 + rand(i * 1.9) * 60, z = HQ[2] - 30 + rand(i * 3.7) * 60; if (Math.abs(x - HQ[0]) < 2.4) continue; tuft(x, 0, z, 0.45 + rand(i) * 0.3, i); }
    for (let i = 0; i < 90; i++) { const a2 = rand(i * 4.1) * Math.PI * 2, r = 5 + rand(i * 2.2) * 9; tuft(Math.cos(a2) * r, 0, Math.sin(a2) * r, 0.4 + rand(i * 7) * 0.3, i + 3); }
    rb.build(R, false);
    R.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && tuftMats.includes(m.material as THREE.MeshLambertMaterial)) m.layers.set(NOINK); });
    // flags at HQ: the Stars and Stripes (simplified) and the French tricolour
    for (const [x, z, col] of [[HQ[0] - 2.6, HQ[2] + 4.5, "us"], [HQ[0] + 2.6, HQ[2] + 4.5, "fr"]] as const) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 6, 0.09), wood); pole.position.set(x, 3, z); pole.castShadow = true; R.add(pole);
      const tex = ctex("flag" + col, 240, 160, (g) => {
        if (col === "fr") { for (const [i, c] of ["#2f4f9a", "#f4f0e6", "#c8323a"].entries()) { g.fillStyle = c; g.fillRect(i * 80, 0, 80, 160); } }
        else { for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? "#f4f0e6" : "#c8323a"; g.fillRect(0, (i * 160) / 13, 240, 160 / 13 + 1); } g.fillStyle = "#2f3f7a"; g.fillRect(0, 0, 100, 86); g.fillStyle = "#f4f0e6"; for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) g.fillRect(8 + c * 15, 8 + r * 15, 5, 5); }
      });
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05, 12, 1), lam("flagM" + col, () => ({ map: tex, side: THREE.DoubleSide })));
      fl.position.set(x, 5.4, z); fl.castShadow = true; fl.frustumCulled = false; this.flags.push(fl); R.add(fl);
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
    let bi = 0, hi = 0, pi = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1, isH = p.geo === "horse";
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), (isH ? 3.2 : 2.2) * sc2))) continue;
      const a = p.geo === "pigeon" ? this.bird(pi++) : isH ? this.horse(hi++) : this.body(bi++);
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

// The Arcole set as one three.js scene: sky, marsh, the dike, the Alpone, the wooden bridge, the village on the far
// bank, reeds, the mud pool, the painter's easel, and (far away at x = 500) a night street for the analogy.
// update(id, f, camera) poses everything for shot `id` at frame f (pure function of id + f).
import * as THREE from "three";
import { Batch, boxGeo, V, lam, house, Kit, Ray, setSight, blocks, prop } from "./build";
import { ctex, grassHD, cobbleHD, planksHD, beamHD, stoneHD, waterNear, waterFar, cloudHD, beam, bed } from "./paint";
import { Pen, reedClump, fxPainting, flowerTuft } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, LFB, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage, SU } from "./cast";
import { FPS, DK, BR, MUD, SHOTS, camAt, V3, ShotDef, STREET_X, EASEL } from "./story";

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
const mudTex = () => ctex("mudHD", 512, 512, (g, r) => {
  g.fillStyle = "#5d4630"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 160; i++) { const x = r() * 512, y = r() * 512, s = 6 + r() * 22; g.fillStyle = r() < 0.5 ? "rgba(40,28,18,.35)" : "rgba(140,110,70,.3)"; g.beginPath(); g.ellipse(x, y, s, s * 0.5, 0, 0, 7); g.fill(); }
  for (let i = 0; i < 30; i++) { const x = r() * 512, y = r() * 512; g.strokeStyle = "rgba(200,180,140,.35)"; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y, 10 + r() * 12, 4, 0, 3.4, 6.0); g.stroke(); }
});
const reedTex = (k: number) => { const t = ctex("reeds" + k, 512, 512, (g) => reedClump(new Pen(g), k + 1)); return t; };

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
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private WU: Record<string, THREE.IUniform>;
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden" | "night", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private flags: THREE.Mesh[] = [];
  private glow: THREE.Sprite[] = [];
  private easel = new THREE.Group();
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

    setSight(sightLines());
    const b = new Batch();
    const marsh = lam("marshHD", () => ({ map: grassHD(), color: "#a9a272" }));
    const grass = lam("grassPlateau", () => ({ map: grassHD(), color: "#aeb87e" }));
    const dirt = lam("dirtHD", () => ({ map: dirtTex() }));
    const earth = lam("earth", () => ({ map: bed(), color: "#a88a66" }));
    const wood = lam("wood", () => ({ map: beam() }));
    const deckM = lam("planksHD", () => ({ map: planksHD() }));
    const sideM = lam("deckSide", () => ({ map: beamHD() }));
    const pool = lam("pool", () => ({ color: "#4f7e77" }));
    const mudM = lam("mud", () => ({ map: mudTex() }));
    const cobble = lam("cobbleHD", () => ({ map: cobbleHD() }));
    const stone = lam("towerHD", () => ({ map: stoneHD("towerHD") }));
    // ---- marsh (near side), river bed, far plateau ----
    b.add(quadAt(-900, -5.5, -900, -BR, 0, 225, 223), marsh);
    b.add(quadAt(5.5, 300, -900, -BR, 0, 74, 223), marsh);
    b.add(quadAt(-900, 300, -BR, BR, -1.3, 150, 4), earth);
    b.add(quadAt(-900, -2.2, BR, 900, DK, 225, 223), grass);
    b.add(quadAt(2.2, 300, BR, 900, DK, 74, 223), grass);
    b.add(quadAt(-2.2, 2.2, BR, 900, DK + 0.01, 1, 223), dirt);
    // bank walls (earth)
    b.add(quad4(V(-900, -1.3, -BR), V(300, -1.3, -BR), V(300, 0, -BR), V(-900, 0, -BR), 300, 1, V(0, 0, 1)), earth);
    b.add(quad4(V(300, -1.3, BR), V(-900, -1.3, BR), V(-900, DK, BR), V(300, DK, BR), 300, 2, V(0, 0, -1)), earth);
    // ---- the dike: crest road and grassy flanks, from far behind the French to the bridge ----
    const Z0 = -420, Z1 = -BR;
    b.add(quadAt(-2, 2, Z0, Z1, DK, 1, 105), dirt);
    b.add(quad4(V(-5.5, 0, Z1), V(-5.5, 0, Z0), V(-2, DK, Z0), V(-2, DK, Z1), 103, 1), marsh);
    b.add(quad4(V(2, DK, Z1), V(2, DK, Z0), V(5.5, 0, Z0), V(5.5, 0, Z1), 103, 1), marsh);
    b.add(quad4(V(-5.5, 0, Z1), V(-2, DK, Z1), V(2, DK, Z1), V(5.5, 0, Z1), 1, 1, V(0, 0, 1)), earth);
    // ---- marsh pools + the mud pool ----
    for (let i = 0; i < 40; i++) {
      const s = rand(i), x = (s < 0.5 ? -1 : 1) * (9 + rand(i + 1) * 70), z = -14 - rand(i + 2) * 110, w = 4 + rand(i + 3) * 9, d = 3 + rand(i + 4) * 6;
      if (x > MUD.x0 - 3 && x < MUD.x1 + 3 && z > MUD.z0 - 3 && z < MUD.z1 + 3) continue;
      const pg = new THREE.CircleGeometry(1, 20); pg.rotateX(-Math.PI / 2);
      const pp = pg.attributes.position as THREE.BufferAttribute;
      for (let k = 1; k < pp.count; k++) { const s2 = 0.8 + 0.35 * rand(i * 17 + k); pp.setXYZ(k, pp.getX(k) * s2, 0, pp.getZ(k) * s2); }
      b.add(pg, pool, new THREE.Matrix4().compose(V(x, 0.025, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rand(i + 6) * 3), V(w / 2, 1, d / 2)));
    }
    b.add(quadAt(MUD.x0, MUD.x1, MUD.z0, MUD.z1, 0.04, 2, 3), mudM);
    // ---- the bridge: plank deck, side beams, rails, piers ----
    b.add(boxGeo(V(-2.3, DK - 0.3, -BR - 0.6), V(2.3, DK, BR + 0.6)), sideM);
    b.add(quadAt(-2.3, 2.3, -BR - 0.6, BR + 0.6, DK + 0.005, 1.2, 4.6), deckM);
    for (let z = -BR; z <= BR + 0.01; z += 2) for (const x of [-2.15, 2.15]) b.add(boxGeo(V(x - 0.07, DK, z - 0.07), V(x + 0.07, DK + 1.05, z + 0.07)), wood);
    for (const x of [-2.15, 2.15]) for (const h of [1.0, 0.55]) b.add(boxGeo(V(x - 0.06, DK + h, -BR - 0.5), V(x + 0.06, DK + h + 0.09, BR + 0.5)), wood);
    for (const z of [-4, 0, 4]) for (const x of [-1.7, 1.7]) b.add(boxGeo(V(x - 0.16, -1.3, z - 0.16), V(x + 0.16, DK - 0.3, z + 0.16)), wood);
    for (const z of [-4, 0, 4]) b.add(boxGeo(V(-1.9, DK - 0.6, z - 0.12), V(1.9, DK - 0.3, z + 0.12)), wood);
    // ---- the village of Arcole on the far bank ----
    const rows: [number, number, number][] = [];
    for (let z = 20; z < 80; z += 9.5) { rows.push([-7.5, z, Math.PI / 2]); rows.push([-17, z + 3, Math.PI / 2]); rows.push([8.5, z + 1.5, -Math.PI / 2]); }
    rows.forEach(([x, z, yaw], i) => house(b, x, z, yaw, [7, 9][i % 2], 8, [6.2, 7.4, 8.6][i % 3], (i * 5) % 8, DK));
    // bell tower
    const tx = -12, tz = 48;
    if (!blocks(tx - 2.5, tx + 2.5, DK, DK + 22, tz - 2.5, tz + 2.5, true)) {
      b.add(boxGeo(V(tx - 2, DK, tz - 2), V(tx + 2, DK + 17, tz + 2), 2), stone);
      const cap = new THREE.ConeGeometry(2.9, 4, 4); cap.rotateY(Math.PI / 4);
      b.add(cap, lam("roof#c9775a", () => ({ color: "#c9775a" })), new THREE.Matrix4().makeTranslation(tx, DK + 19, tz));
    }
    // trees: poplars along the banks, a few round trees in the marsh
    for (let i = 0; i < 46; i++) {
      const far = i < 24, x = far ? -70 + i * 7 + rand(i) * 3 : (rand(i + 9) < 0.5 ? -1 : 1) * (14 + rand(i + 5) * 80), z = far ? 12 + rand(i + 3) * 4 + (Math.abs(-70 + i * 7) < 22 ? 90 : 0) : -30 - rand(i + 7) * 150;
      if (far && x > -22 && x < 14 && z < 80) continue;
      prop(b, {} as Kit, far ? "tree" : rand(i + 11) < 0.5 ? "tree_oak" : "tree", x, far ? DK : 0, z, far ? 11 + rand(i) * 4 : 7 + rand(i) * 4);
    }
    // ---- night street (analogy), far away at x = 500 ----
    b.add(quadAt(STREET_X - 30, STREET_X + 30, -80, 80, 0, 10, 26), cobble);
    const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.1, 0.9) });
    const winG = new THREE.PlaneGeometry(0.75, 1.1);
    for (const side of [-1, 1]) {
      let z = -50;
      for (let i = 0; z < 60; i++) {
        const w = [7, 8, 9][i % 3], h = [7.4, 8.6, 9.8][(i + (side > 0 ? 1 : 0)) % 3], x = STREET_X + side * 8.2;
        house(b, x, z + w / 2, side < 0 ? Math.PI / 2 : -Math.PI / 2, w, 8, h, (i * 3 + (side > 0 ? 2 : 0)) % 8, 0);
        const n = Math.max(1, Math.floor(w / 2.2)), floors = Math.floor(h / 2.8);
        for (let fl = 0; fl < floors; fl++) for (let k = 0; k < n; k++) {
          if (rand(i * 31 + k * 7 + fl * 3 + side * 101) > 0.4) continue;
          const zz = z + w / 2 + (side < 0 ? 1 : -1) * (-w / 2 + ((k + 0.5) / n) * w), m = new THREE.Mesh(winG, glowM);
          m.position.set(x - side * 4.03, fl * 2.8 + 1.55, zz); m.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; m.layers.set(NOINK);
          R.add(m);
        }
        z += w + 0.3;
      }
    }
    for (let z = -40; z < 60; z += 13) {
      const x = STREET_X + 3.4;
      b.add(boxGeo(V(x - 0.07, 0, z - 0.07), V(x + 0.07, 3.2, z + 0.07)), lam("iron", () => ({ color: "#2a2c36" })));
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), glowM); lamp.position.set(x, 3.4, z); R.add(lamp);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1.0, 0.7, 0.35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      halo.position.set(x, 3.4, z); halo.scale.setScalar(3.2); halo.layers.set(NOINK); this.glow.push(halo); R.add(halo);
    }
    // ---- the painter's easel (painting faces -z, toward the painter) ----
    const [ex, ey, ez] = EASEL;
    const legs: THREE.BufferGeometry[] = [];
    for (const [dx, dz] of [[-0.55, 0.12], [0.55, 0.12], [0, 0.75]] as const) {
      const a = V(ex + dx * 0.25, ey + 2.0, ez + 0.05), c = V(ex + dx, ey, ez + dz);
      const g = new THREE.BoxGeometry(0.06, a.distanceTo(c), 0.06);
      g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), a.clone().sub(c).normalize()), V(1, 1, 1)));
      legs.push(g);
    }
    b.build(R);
    const eb = new Batch();
    eb.add(boxGeo(V(ex - 0.72, ey + 0.86, ez - 0.02), V(ex + 0.72, ey + 0.93, ez + 0.14)), wood);
    eb.add(boxGeo(V(ex - 0.68, ey + 0.93, ez + 0.03), V(ex + 0.68, ey + 1.99, ez + 0.08)), wood);
    for (const g of legs) eb.add(g, wood);
    eb.build(this.easel); R.add(this.easel);
    const paintM = new THREE.MeshBasicMaterial({ map: ctex("painting", 1000, 780, (g) => fxPainting(new Pen(g))), color: 0xe8e8e8 });
    const painting = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.06), paintM);
    painting.position.set(ex, ey + 1.46, ez + 0.02); painting.rotation.y = Math.PI; painting.layers.set(NOINK);
    this.easel.add(painting);

    // ---- reeds: crossed cut-out cards, two-tone lit, left out where they block a shot's subject ----
    const reedMats = [0, 1, 2].map((k) => lam("reedM" + k, () => ({ map: reedTex(k), alphaTest: 0.5, side: THREE.DoubleSide })));
    const rb = new Batch();
    const clump = (x: number, y: number, z: number, h: number, k: number) => {
      const w = h * 0.95;
      if (blocks(x - w / 3, x + w / 3, y, y + h, z - w / 3, z + w / 3, true)) return;
      const a = rand(x * 3.1 + z * 7.7) * Math.PI;
      for (const r of [a, a + Math.PI / 2]) {
        const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0); g.rotateY(r); g.translate(x, y - 0.05, z);
        const nn = g.attributes.normal as THREE.BufferAttribute; for (let k = 0; k < nn.count; k++) nn.setXYZ(k, 0, 1, 0); // lit like the ground
        rb.add(g, reedMats[k % 3]);
      }
    };
    let n = 0;
    const field = (x0: number, x1: number, z0: number, z1: number, y: number, count: number, h0: number, h1: number) => {
      for (let i = 0; i < count; i++, n++) {
        const x = x0 + rand(n * 1.3) * (x1 - x0), z = z0 + rand(n * 2.7 + 5) * (z1 - z0);
        if (y === 0 && Math.abs(x) < 6.2) continue; // dike
        if (y === 0 && x > MUD.x0 - 0.5 && x < MUD.x1 + 0.5 && z > MUD.z0 - 0.5 && z < MUD.z1 + 0.5) continue;
        clump(x, y, z, h0 + rand(n * 5.1) * (h1 - h0), n);
      }
    };
    field(6, 60, -26, -9, 0, 260, 1.9, 2.7);   // flank route, east marsh
    field(-60, -6, -40, -9, 0, 300, 1.9, 2.8); // west marsh (11: inside the reeds)
    field(6, 90, -130, -26, 0, 220, 1.6, 2.5);
    field(-90, -6, -130, -40, 0, 200, 1.6, 2.5);
    field(16, 70, 14, 46, DK, 170, 1.8, 2.6);  // far bank east, behind the Austrian lines
    field(MUD.x0 - 1, MUD.x1 + 1, MUD.z0 - 3, MUD.z0 - 0.6, 0, 14, 1.6, 2.3);
    field(MUD.x1 + 0.6, MUD.x1 + 3, MUD.z0, MUD.z1, 0, 12, 1.6, 2.3);
    field(-32, -18, -24, -10, 0, 90, 1.9, 2.8); // dense around the reed POV
    const tuftMats = [0, 1, 2].map((k) => lam("tuftM" + k, () => ({ map: ctex("tuft" + k, 256, 256, (g) => flowerTuft(new Pen(g), k * 7 + 3)), alphaTest: 0.5, side: THREE.DoubleSide })));
    const tuft = (x: number, y: number, z: number, h: number, k: number) => {
      if (blocks(x - 0.3, x + 0.3, y, y + h, z - 0.3, z + 0.3, true)) return;
      const a = rand(x * 5.3 + z * 1.7) * Math.PI;
      for (const r of [a, a + Math.PI / 2]) {
        const g = new THREE.PlaneGeometry(h, h); g.translate(0, h / 2, 0); g.rotateY(r); g.translate(x, y - 0.02, z);
        const nn = g.attributes.normal as THREE.BufferAttribute; for (let q = 0; q < nn.count; q++) nn.setXYZ(q, 0, 1, 0);
        rb.add(g, tuftMats[k % 3]);
      }
    };
    for (let z = -130; z < -8.5; z += 1.1) for (const s of [-1, 1]) {
      const k = Math.floor(rand(z * 3 + s) * 1000);
      tuft(s * (2.05 + rand(z + s * 7) * 0.5), DK, z + rand(z * 1.3) * 0.6, 0.45 + rand(z * 2.1 + s) * 0.3, k);
      if (rand(z * 9 + s) < 0.5) tuft(s * (3.2 + rand(z * 4) * 1.6), DK * (1 - (1.2 + rand(z * 4) * 1.6) / 3.5), z, 0.5, k + 1);
    }
    for (let z = 9; z < 70; z += 1.3) for (const s of [-1, 1]) tuft(s * (2.4 + rand(z * 2 + s) * 0.6), DK, z, 0.4 + rand(z + s) * 0.3, Math.floor(rand(z * 5 + s) * 1000));
    rb.build(R, false);
    R.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (reedMats.includes(m.material as THREE.MeshLambertMaterial) || tuftMats.includes(m.material as THREE.MeshLambertMaterial))) m.layers.set(NOINK); });

    // ---- river water ----
    const wNear = waterNear(), wFar = waterFar();
    for (const t of [wNear, wFar]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; t.needsUpdate = true; }
    this.WU = {
      wNearC: { value: new THREE.Color() }, wMidC: { value: new THREE.Color() }, wFarC: { value: new THREE.Color() },
      wCrest: { value: new THREE.Color() }, wTrough: { value: new THREE.Color() }, wGlint: { value: new THREE.Color() },
      wShade: { value: new THREE.Vector3(0.5, 0.56, 0.72) }, wNearTex: { value: wNear }, wFarTex: { value: wFar }, wTime: { value: 0 },
    };
    const waterM = new THREE.MeshLambertMaterial({ color: 0xffffff });
    waterM.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.WU);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", WATER_DECL)
        .replace("#include <map_fragment>", WATER_COL)
        .replace("#include <lights_fragment_begin>", "float sunVis = 1.0;\n" + LFB)
        .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.directDiffuse = diffuseColor.rgb * mix(wShade, vec3(1.0), sunVis);\n  reflectedLight.indirectDiffuse = vec3(0.0);");
    };
    waterM.customProgramCacheKey = () => "river1";
    const wm = new THREE.Mesh(quadAt(-900, 300, -BR, BR, -0.6, 1, 1), waterM);
    wm.receiveShadow = true;
    R.add(wm);
    // tricolour pennant on the French side and an Austrian flag on the bell tower side
    for (const [x, y, z, col] of [[-3.2, DK, -44, "fr"], [3.0, DK, 15.5, "au"]] as const) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 5, 0.09), wood); pole.position.set(x, y + 2.5, z); pole.castShadow = true; R.add(pole);
      const tex = ctex("flag" + col, 240, 160, (g) => {
        if (col === "fr") { for (const [i, c] of ["#2f4f9a", "#f4f0e6", "#c8323a"].entries()) { g.fillStyle = c; g.fillRect(i * 80, 0, 80, 160); } }
        else { g.fillStyle = "#e9c64a"; g.fillRect(0, 0, 240, 160); g.fillStyle = "#23242c"; g.beginPath(); g.ellipse(120, 80, 40, 46, 0, 0, 7); g.fill(); }
      });
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0, 12, 1), lam("flagM" + col, () => ({ map: tex, side: THREE.DoubleSide })));
      fl.position.set(x, y + 4.45, z); fl.castShadow = true; fl.frustumCulled = false; this.flags.push(fl); R.add(fl);
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
    this.easel.visible = id >= 14;
    const W = this.WU, wc = K.water;
    untone(wc.near, W.wNearC.value); untone(wc.mid, W.wMidC.value); untone(wc.far, W.wFarC.value);
    untone(wc.crest, W.wCrest.value); untone(wc.trough, W.wTrough.value); untone(wc.glint, W.wGlint.value);
    W.wShade.value.set(...wc.shade); W.wTime.value = t;
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
    let bi = 0, hi = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1, isH = p.geo === "horse";
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), (isH ? 3.2 : 2.2) * sc2))) continue;
      const a = isH ? this.horse(hi++) : this.body(bi++);
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

// Composition for the cartoon 3D short: one ThreeCanvas per visible shot layer (two during a crossfade), the whole
// world posed per frame by World.update(), and the post chain built exactly as SKILL.md / the reports specify:
//   ink -> lens blur (pre) -> lens blur (main) -> bloom -> NEUTRAL tone map -> grade, MSAA 4.
// Ink is a Pass (never merged), lens blur effects are CONVOLUTION effects (own EffectPass each), so the blur softens
// the ink lines together with the background. Everything is a pure function of the frame number: no state over time.
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { BloomEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { World, loadKit } from "./world";
import type { Kit } from "./build";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur } from "./lensblur";
import { GradeEffect, GRADES, gradeFor } from "./grade";
import { FLASH_AT, SHOTS, dofAt, focusAt, layersAt } from "./story";

const fwd = new THREE.Vector3();
const fpt = new THREE.Vector3();

/** One shot layer: scene + post chain, posed for shot `id` at frame `f`. */
const Scene: React.FC<{ id: number; f: number }> = ({ id, f }) => {
  const { camera, scene, invalidate } = useThree();

  // Kenney GLBs are optional (missing ones are skipped by build.ts), but wait for the load so every frame is identical.
  const [kit, setKit] = useState<Kit | null>(null);
  const [handle] = useState(() => delayRender("bridge: loading kit"));
  useEffect(() => {
    let alive = true;
    loadKit().then((k) => { if (alive) { setKit(k); continueRender(handle); } });
    return () => { alive = false; };
  }, [handle]);

  const world = useMemo(() => (kit ? new World(kit) : null), [kit]);

  const fx = useMemo(() => ({
    ink: new InkPass(scene, camera as THREE.PerspectiveCamera),
    lens: new LensBlur({ maxCoC: 24, nearScale: 1.2 }),
    bloom: new BloomEffect({ intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 }),
    tone: new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    grade: new GradeEffect(GRADES.day, 1),
  }), [scene, camera]);
  useEffect(() => () => { fx.ink.dispose(); fx.lens.dispose(); }, [fx]);

  const light = (SHOTS.find((s) => s.id === id) ?? SHOTS[0]).light;

  // runs before the composer's render (composer priority is 1)
  useFrame(() => {
    if (!world) return;
    world.update(id, f, camera as THREE.PerspectiveCamera, scene);
    noInkFallback(world.root); // any billboard / sprite that slipped onto layer 0 goes to the no-ink layer
    // lens blur: focus = distance along the VIEW axis to the DOF focus point (not Euclidean)
    camera.getWorldDirection(fwd);
    fpt.set(...focusAt(id, f));
    fx.lens.focus = Math.max(0.3, fpt.sub(camera.position).dot(fwd));
    fx.lens.cInf = dofAt(f).cInf;
    gradeFor(fx.grade, light);
  });
  useLayoutEffect(() => { invalidate(); }, [id, f, world, invalidate]);

  const post = useMemo(() => (
    <EffectComposer multisampling={4}>
      <primitive object={fx.ink} dispose={null} />
      <primitive object={fx.lens.pre} dispose={null} />
      <primitive object={fx.lens.main} dispose={null} />
      <primitive object={fx.bloom} dispose={null} />
      <primitive object={fx.tone} dispose={null} />
      <primitive object={fx.grade} dispose={null} />
    </EffectComposer>
  ), [fx]);

  return (
    <>
      {world ? <primitive object={world.root} /> : null}
      {post}
    </>
  );
};

const Layer: React.FC<{ id: number; f: number; alpha: number; width: number; height: number }> = ({ id, f, alpha, width, height }) => (
  <AbsoluteFill style={{ opacity: alpha }}>
    <ThreeCanvas
      width={width}
      height={height}
      shadows
      dpr={1}
      gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: "high-performance" }}
      camera={{ fov: 50, near: 0.2, far: 1500 }}
    >
      <Scene id={id} f={f} />
    </ThreeCanvas>
  </AbsoluteFill>
);

export const Bridge: React.FC = () => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const layers = layersAt(f);
  // white flash right after the hook: full on FLASH_AT, gone in 4 frames
  const flash = f >= FLASH_AT && f < FLASH_AT + 4 ? 1 - (f - FLASH_AT) / 4 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {layers.map((l) => (
        <Layer key={l.id} id={l.id} f={f} alpha={l.alpha} width={width} height={height} />
      ))}
      {flash > 0 ? <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash }} /> : null}
    </AbsoluteFill>
  );
};

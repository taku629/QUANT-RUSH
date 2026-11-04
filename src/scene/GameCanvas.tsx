import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from '@react-three/postprocessing';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { fx } from '../game/fx';
import { useGame } from '../game/store';
import { active } from './active';
import { Bender } from './Bender';
import { CameraRig } from './CameraRig';
import { City } from './City';
import { Driver } from './Driver';
import { Particles, SpeedLines } from './Effects';
import { env } from './env';
import { Gates } from './Gates';
import { Obstacles } from './Obstacles';
import { Orders } from './Orders';
import { Pickups } from './Pickups';
import { Player } from './Player';
import { effectiveSpec, useTier, type Tier, type TierSpec } from './quality';
import { Road } from './Road';
import { LaneGuide } from './LaneGuide';
import { Sky } from './Sky';
import { Ghost } from './Ghost';
import { Districts } from './Districts';
import { Skyline } from './Skyline';
import { Sidewalks } from './Sidewalks';

function Lights() {
  const key = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  useFrame(() => {
    if (key.current) key.current.color.copy(env.key).lerp(env.primary, 0.3);
    if (hemi.current) {
      hemi.current.color.copy(env.secondary);
      hemi.current.intensity = 0.9 + fx.lightning * 1.5;
    }
  });
  return (
    <>
      <ambientLight intensity={0.35} />
      <hemisphereLight ref={hemi} args={['#ff2fd6', '#0a0a30', 0.9]} />
      <directionalLight ref={key} position={[4, 10, 6]} intensity={1.6} />
      <directionalLight position={[-6, 4, -10]} intensity={0.8} color="#7c5cff" />
    </>
  );
}

function PlayerSwitch() {
  const vehicle = useGame((s) => s.settings.vehicle);
  const phase = useGame((s) => s.phase);
  const camera = useGame((s) => s.settings.camera);
  const v = phase === 'title' ? active()?.vehicle.id ?? vehicle : vehicle;
  return <Player vehicle={v} showRider={!(camera === 'first' && phase === 'playing')} />;
}

function Post({ post }: { post: TierSpec['post'] }) {
  const offset = useMemo(() => new THREE.Vector2(0.0004, 0.0004), []);
  const ca = useRef<{ offset: THREE.Vector2 } | null>(null);
  useFrame(() => {
    if (!ca.current) return;
    const reduce = useGame.getState().settings.reduceMotion;
    // CRASH: subtle at the screen centre where hazards are read, stronger only on impacts
    const k = reduce ? 0 : 0.0003 + env.danger * 0.0008 + fx.shake * 0.004;
    ca.current.offset.set(k, k);
  });
  if (post === 'none') return null;
  if (post === 'bloom')
    return (
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.9} luminanceThreshold={0.6} luminanceSmoothing={0.25} mipmapBlur radius={0.6} levels={3} resolutionScale={0.5} />
      </EffectComposer>
    );
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={1.1} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur radius={0.75} />
      <ChromaticAberration ref={ca as never} offset={offset} radialModulation modulationOffset={0.35} />
      <Vignette eskil={false} offset={0.25} darkness={0.7} />
    </EffectComposer>
  );
}

/** FPS sampler (always on, cheap) — feeds the optional on-screen counter */
/**
 * FPS + renderer stats. info.autoReset is turned off and reset here once per frame, so the counts cover the
 * whole previous frame including every post-processing pass (with autoReset each pass would reset them).
 */
function FpsProbe() {
  const acc = useRef({ t: 0, n: 0, calls: 0, tris: 0 });
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame((_, dt) => {
    const a = acc.current;
    a.calls = gl.info.render.calls;
    a.tris = gl.info.render.triangles;
    gl.info.reset();
    a.t += dt;
    a.n++;
    if (a.t >= 0.5) {
      useTier.setState({ fps: Math.round(a.n / a.t), calls: a.calls, tris: a.tris });
      a.t = 0;
      a.n = 0;
    }
  });
  return null;
}

const ORDER: Tier[] = ['low', 'medium', 'high'];

export function GameCanvas({ onContextLost }: { onContextLost: () => void }) {
  const quality = useGame((s) => s.settings.quality);
  const autoTier = useTier((s) => s.tier);
  const tier: Tier = quality === 'auto' ? autoTier : quality;
  const spec = effectiveSpec(tier, quality);
  env.fogCap = spec.fogFar;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // antialias can only be chosen when the WebGL context is created: fix it at mount (no remounts)
  const [antialias] = useState(() => spec.antialias);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const lost = (e: Event) => {
      e.preventDefault();
      // ignore the intentional context release when the canvas is being unmounted
      window.setTimeout(() => {
        if (c.isConnected) onContextLost();
      }, 0);
    };
    c.addEventListener('webglcontextlost', lost);
    return () => c.removeEventListener('webglcontextlost', lost);
  }, [onContextLost]);
  return (
    <Canvas
      ref={canvasRef}
      dpr={Math.min(spec.dpr, window.devicePixelRatio || 1)}
      gl={{ antialias, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 66, near: 0.1, far: 1200, position: [0, 4, 9] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.fog = new THREE.Fog('#0a0620', 60, 420);
        scene.background = new THREE.Color('#02010a');
      }}
    >
      {quality === 'auto' && (
        <PerformanceMonitor
          flipflops={4}
          onDecline={() => useTier.setState((s) => ({ tier: ORDER[Math.max(0, ORDER.indexOf(s.tier) - 1)] }))}
          onIncline={() => useTier.setState((s) => ({ tier: ORDER[Math.min(2, ORDER.indexOf(s.tier) + 1)] }))}
        />
      )}
      <FpsProbe />
      <Suspense fallback={null}>
        <Driver />
        <Bender />
        <Lights />
        <Sky />
        <Road />
        <LaneGuide />
        <City density={spec.city} fastFacade={spec.fastFacade} />
        <Districts density={spec.city} />
        {tier !== 'low' && <Skyline />}
        {tier !== 'low' && <Sidewalks />}
        <Gates />
        <Obstacles />
        <Pickups />
        <Orders />
        <Ghost />
        <PlayerSwitch />
        <Particles max={spec.particles} />
        <SpeedLines count={spec.speedLines} />
        <CameraRig />
        <Post post={spec.post} />
      </Suspense>
    </Canvas>
  );
}

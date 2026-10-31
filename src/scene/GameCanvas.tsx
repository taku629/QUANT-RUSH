import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { useState } from 'react';
import { Bloom, EffectComposer, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { CameraRig } from './CameraRig';
import { City } from './City';
import { Driver } from './Driver';
import { Particles, SpeedLines } from './Effects';
import { Gates } from './Gates';
import { Obstacles } from './Obstacles';
import { Orders } from './Orders';
import { Player } from './Player';
import { Road } from './Road';
import { Sky } from './Sky';
import { env } from './env';
import { active } from './active';
import { fx } from '../game/fx';

function Lights() {
  const key = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  useFrame(() => {
    if (key.current) key.current.color.copy(env.primary);
    if (hemi.current) {
      hemi.current.color.copy(env.secondary);
      hemi.current.intensity = 0.9 + fx.lightning * 2;
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
  // in title screen the demo session picks its own vehicle; show it
  const v = phase === 'title' ? active()?.vehicle.id ?? vehicle : vehicle;
  return <Player vehicle={v} showRider={!(camera === 'first' && phase === 'playing')} />;
}

function Post({ quality }: { quality: 'high' | 'low' }) {
  const offset = useMemo(() => new THREE.Vector2(0.0006, 0.0006), []);
  const ca = useRef<{ offset: THREE.Vector2 } | null>(null);
  useFrame(() => {
    if (ca.current) {
      const k = 0.0005 + env.danger * 0.0025 + fx.shake * 0.006;
      ca.current.offset.set(k, k);
    }
  });
  if (quality === 'low') return null;
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={1.15} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur radius={0.75} />
      <ChromaticAberration ref={ca as never} offset={offset} radialModulation={false} modulationOffset={0} />
      <Vignette eskil={false} offset={0.25} darkness={0.75} />
    </EffectComposer>
  );
}

export function GameCanvas() {
  const quality = useGame((s) => s.settings.quality);
  const [dpr, setDpr] = useState(quality === 'high' ? 1.5 : 1);
  return (
    <Canvas
      dpr={Math.min(dpr, window.devicePixelRatio || 1)}
      gl={{ antialias: quality === 'high', powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 66, near: 0.1, far: 1200, position: [0, 4, 9] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.fog = new THREE.Fog('#0a0620', 60, 420);
        scene.background = new THREE.Color('#02010a');
      }}
    >
      <PerformanceMonitor
        onChange={({ factor }) => setDpr(quality === 'high' ? 0.75 + factor * 1.0 : 0.6 + factor * 0.4)}
      />
      <Suspense fallback={null}>
        <Driver />
        <Lights />
        <Sky />
        <Road />
        <City quality={quality} />
        <Gates />
        <Obstacles />
        <Orders />
        <PlayerSwitch />
        <Particles />
        <SpeedLines />
        <CameraRig />
        <Post quality={quality} />
      </Suspense>
    </Canvas>
  );
}

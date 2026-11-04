import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { active } from './active';
import { env } from './env';
import { sceneryFor, type SceneryProfile } from './scenery';

/**
 * Far skyline: a distant silhouette band around the camera (no bend, no fog), different per district
 * (low roofs / tower wall / station & domes / hills with towers / dense blocks). Cross-fades on district change.
 */
function rnd(seed: number) {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
}

function skylineTexture(kind: SceneryProfile['skyline']) {
  const W = 2048;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const r = rnd(kind.length * 7919 + 13);
  g.clearRect(0, 0, W, H);
  const lights = (x: number, y: number, w: number, h: number, density: number) => {
    for (let yy = y + 4; yy < H - 2; yy += 6)
      for (let xx = x + 2; xx < x + w - 2; xx += 5) if (r() < density) g.fillRect(xx, yy, 2, 2);
    void h;
  };
  const block = (x: number, w: number, h: number, density: number) => {
    g.fillStyle = 'rgba(0,0,0,1)';
    g.fillRect(x, H - h, w, h);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    lights(x, H - h, w, h, density);
  };
  let x = 0;
  switch (kind) {
    case 'low':
      while (x < W) {
        const w = 40 + r() * 90;
        block(x, w, 20 + r() * 45, 0.08);
        // pagoda-like roofs now and then
        if (r() < 0.12) {
          g.fillStyle = '#000';
          g.beginPath();
          g.moveTo(x - 8, H - 60);
          g.lineTo(x + w / 2, H - 90);
          g.lineTo(x + w + 8, H - 60);
          g.fill();
        }
        x += w;
      }
      break;
    case 'towers':
      while (x < W) {
        const w = 24 + r() * 40;
        block(x, w, 110 + r() * 140, 0.25);
        x += w + r() * 6;
      }
      break;
    case 'station':
      while (x < W) {
        const w = 60 + r() * 80;
        block(x, w, 30 + r() * 30, 0.15);
        if (r() < 0.2) {
          g.fillStyle = '#000';
          g.beginPath();
          g.arc(x + w / 2, H - 55, 22, Math.PI, 0);
          g.fill();
        }
        x += w;
      }
      break;
    case 'hills': {
      g.fillStyle = '#000';
      g.beginPath();
      g.moveTo(0, H);
      for (let i = 0; i <= 64; i++) g.lineTo((i / 64) * W, H - 70 - Math.sin(i * 0.35) * 30 - Math.sin(i * 1.1) * 12);
      g.lineTo(W, H);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 600; i++) g.fillRect(r() * W, H - r() * 80, 2, 2);
      while (x < W) {
        const w = 14 + r() * 26;
        if (r() < 0.35) block(x, w, 120 + r() * 120, 0.3);
        x += w + 20 + r() * 60;
      }
      break;
    }
    case 'dense':
      while (x < W) {
        const w = 16 + r() * 30;
        block(x, w, 50 + r() * 90, 0.45);
        if (r() < 0.25) {
          g.fillStyle = ['#ff3d8b', '#ffd23d', '#3dffcf', '#a6ff00'][Math.floor(r() * 4)];
          g.fillRect(x + 2, H - 40 - r() * 60, w - 4, 10);
        }
        x += w;
      }
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

export function Skyline() {
  const kinds = useMemo(() => {
    const k = ['low', 'towers', 'station', 'hills', 'dense'] as const;
    return Object.fromEntries(k.map((x) => [x, skylineTexture(x)])) as unknown as Record<SceneryProfile['skyline'], THREE.Texture>;
  }, []);
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  const state = useRef({ cur: 'low' as SceneryProfile['skyline'], fade: 1 });
  const geo = useMemo(() => new THREE.CylinderGeometry(780, 780, 240, 64, 1, true), []);
  const mk = () => new THREE.MeshBasicMaterial({ transparent: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, userData: { noBend: true } });
  const matA = useMemo(mk, []);
  const matB = useMemo(mk, []);
  useFrame(({ camera }, dt) => {
    const s = active();
    if (!s || !a.current || !b.current) return;
    const p = sceneryFor(s.district);
    const st = state.current;
    if (p.skyline !== st.cur) {
      matB.map = kinds[st.cur];
      matB.needsUpdate = true;
      st.cur = p.skyline;
      matA.map = kinds[p.skyline];
      matA.needsUpdate = true;
      st.fade = 0;
    }
    if (!matA.map) {
      matA.map = kinds[st.cur];
      matA.needsUpdate = true;
    }
    st.fade = Math.min(1, st.fade + dt * 0.6);
    // silhouettes are drawn in the horizon colour, slightly darker; lit windows in the district primary
    matA.color.copy(env.skyHorizon).multiplyScalar(0.55).lerp(env.primary, 0.12);
    matB.color.copy(matA.color);
    matA.opacity = st.fade;
    matB.opacity = 1 - st.fade;
    b.current.visible = st.fade < 1;
    for (const m of [a.current, b.current]) m.position.set(camera.position.x, 95, camera.position.z);
  });
  return (
    <group>
      <mesh ref={a} geometry={geo} material={matA} renderOrder={-5} />
      <mesh ref={b} geometry={geo} material={matB} renderOrder={-6} />
    </group>
  );
}

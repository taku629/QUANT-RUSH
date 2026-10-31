import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DISTRICTS, REGIME_STYLE } from '../game/content';
import { createTicker, signTexture, windowsTexture } from './textures';
import { env } from './env';
import { active } from './active';

const N = 110; // buildings per side
const SPACING = 7;

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Slot = { wz: number; seed: number };

export function City({ quality }: { quality: 'high' | 'low' }) {
  const n = quality === 'high' ? N : 70;
  const bodies = useRef<THREE.InstancedMesh>(null);
  const roofs = useRef<THREE.InstancedMesh>(null);
  const tex = useMemo(() => windowsTexture(), []);
  const slots = useMemo<Slot[]>(() => Array.from({ length: n * 2 }, (_, i) => ({ wz: Math.floor(i / 2) * SPACING - 20, seed: i })), [n]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const colorDirty = useRef(-1);
  const span = n * SPACING;

  useFrame(() => {
    const s = active();
    if (!s || !bodies.current || !roofs.current) return;
    const d = DISTRICTS[s.district % DISTRICTS.length];
    const palette = [d.primary, d.secondary, d.accent];
    let recolor = colorDirty.current !== s.district;
    colorDirty.current = s.district;
    slots.forEach((sl, i) => {
      if (sl.wz < s.z - 30) {
        sl.wz += span;
        sl.seed += n * 2;
        recolor = true;
      }
      const side = i % 2 === 0 ? -1 : 1;
      const h1 = hash(sl.seed);
      const h2 = hash(sl.seed + 0.5);
      const h3 = hash(sl.seed + 0.9);
      const far = h3 > 0.7;
      const w = 5 + h1 * 7;
      const height = (far ? 30 : 10) + h2 * h2 * (far ? 90 : 55);
      const x = side * (12 + w / 2 + (far ? 14 + h3 * 30 : h3 * 6));
      dummy.position.set(x, height / 2, -(sl.wz - s.z));
      dummy.scale.set(w, height, 5 + h2 * 5);
      dummy.updateMatrix();
      bodies.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.y = height + 0.15;
      dummy.scale.set(w + 0.3, 0.3, 5.3 + h2 * 5);
      dummy.updateMatrix();
      roofs.current!.setMatrixAt(i, dummy.matrix);
      if (recolor) {
        col.set(palette[Math.floor(h1 * 3) % 3]);
        if (s.engine.regime === 'CRASH' && h2 > 0.5) col.set('#ff2a4d');
        bodies.current!.setColorAt(i, col.clone().multiplyScalar(0.9 + h2 * 0.6));
        roofs.current!.setColorAt(i, col.multiplyScalar(2));
      }
    });
    bodies.current.instanceMatrix.needsUpdate = true;
    roofs.current.instanceMatrix.needsUpdate = true;
    if (recolor) {
      if (bodies.current.instanceColor) bodies.current.instanceColor.needsUpdate = true;
      if (roofs.current.instanceColor) roofs.current.instanceColor.needsUpdate = true;
    }
    // crash: flickering city lights
    const m = bodies.current.material as THREE.MeshBasicMaterial;
    const flicker = env.danger > 0.8 && Math.sin(env.time * 37) > 0.7 ? 0.45 : 1;
    m.color.setScalar(flicker);
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, n * 2]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[undefined, undefined, n * 2]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <Signs />
      <Candles quality={quality} />
      <Tickers />
    </group>
  );
}

const SIGNS = 18;
const SIGN_GAP = 34;

function Signs() {
  const refs = useRef<THREE.Mesh[]>([]);
  const state = useMemo(() => Array.from({ length: SIGNS }, (_, i) => ({ wz: 60 + i * SIGN_GAP, key: '' })), []);
  useFrame(() => {
    const s = active();
    if (!s) return;
    const d = DISTRICTS[s.district % DISTRICTS.length];
    state.forEach((st, i) => {
      if (st.wz < s.z - 20) st.wz += SIGNS * SIGN_GAP;
      const mesh = refs.current[i];
      if (!mesh) return;
      const seed = Math.floor(st.wz / SIGN_GAP);
      const word = d.signs[seed % d.signs.length];
      const color = [d.primary, d.secondary, d.accent][seed % 3];
      const vertical = /[^\x00-\x7F]/.test(word);
      const key = `${word}|${color}`;
      if (key !== st.key) {
        st.key = key;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.map = signTexture(word, color, vertical);
        mat.needsUpdate = true;
        const chars = [...word].length;
        if (vertical) mesh.scale.set(2.2, 1.1 + chars * 1.8, 1);
        else mesh.scale.set(1.2 + chars * 1.05, 2.2, 1);
      }
      const side = seed % 2 === 0 ? -1 : 1;
      mesh.position.set(side * (10.5 + (seed % 3) * 0.6), 7 + (seed % 4) * 2.5, -(st.wz - s.z));
      mesh.rotation.y = side * -0.55;
    });
  });
  return (
    <group>
      {Array.from({ length: SIGNS }, (_, i) => (
        <mesh key={i} ref={(m) => { if (m) refs.current[i] = m; }}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial transparent toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/** Floating candlestick holograms above the skyline (decorative, colored by recent returns). */
function Candles({ quality }: { quality: 'high' | 'low' }) {
  const count = quality === 'high' ? 70 : 36;
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => Array.from({ length: count }, (_, i) => ({ wz: i * 11, seed: i })), [count]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const s = active();
    if (!s || !ref.current) return;
    items.forEach((it, i) => {
      if (it.wz < s.z - 20) {
        it.wz += count * 11;
        it.seed += count;
      }
      const h = hash(it.seed * 3.1);
      const up = hash(it.seed * 7.7) > (s.engine.regime === 'CRASH' ? 0.8 : 0.45);
      const side = i % 2 ? -1 : 1;
      dummy.position.set(side * (16 + h * 40), 26 + hash(it.seed) * 30 + Math.sin(env.time + i) * 1.5, -(it.wz - s.z));
      dummy.scale.set(1.4, 2 + h * 9, 1.4);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
      c.set(up ? '#3dff8b' : '#ff3d6e').multiplyScalar(1.6);
      ref.current!.setColorAt(i, c);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/** Overhead ticker gantries showing the live mid price and regime (current data only). */
function Tickers() {
  const ticker = useMemo(() => createTicker(), []);
  const groups = useRef<THREE.Group[]>([]);
  const frameMats = useRef<THREE.MeshBasicMaterial[]>([]);
  const pos = useMemo(() => [140, 140 + 230], []);
  const last = useRef(0);
  const prevMid = useRef(100);
  useFrame(() => {
    const s = active();
    if (!s) return;
    pos.forEach((wz, i) => {
      if (wz < s.z - 10) pos[i] = wz + 460;
      const g = groups.current[i];
      if (g) g.position.z = -(pos[i] - s.z);
    });
    frameMats.current.forEach((m) => m.color.copy(env.primary).multiplyScalar(1.5));
    if (env.time - last.current > 0.25) {
      last.current = env.time;
      const mid = s.engine.mid;
      const up = mid >= prevMid.current;
      prevMid.current = mid;
      const st = REGIME_STYLE[s.engine.regime];
      const chg = mid - 100;
      ticker.draw([
        { text: 'QRX', color: '#ffffff' },
        { text: `${up ? '▲' : '▼'} ${mid.toFixed(2)}`, color: up ? '#3dff8b' : '#ff3d6e' },
        { text: `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}`, color: chg >= 0 ? '#3dff8b' : '#ff3d6e' },
        { text: st.label, color: st.color },
      ]);
    }
  });
  return (
    <group>
      {pos.map((_, i) => (
        <group key={i} ref={(g) => { if (g) groups.current[i] = g; }}>
          <mesh position={[0, 9.5, 0]}>
            <planeGeometry args={[14, 2.2]} />
            <meshBasicMaterial map={ticker.tex} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          {[-7.3, 7.3].map((x) => (
            <mesh key={x} position={[x, 5.3, 0]}>
              <boxGeometry args={[0.35, 10.6, 0.35]} />
              <meshBasicMaterial ref={(m) => { if (m && !frameMats.current.includes(m)) frameMats.current.push(m); }} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, 10.75, 0]}>
            <boxGeometry args={[15, 0.25, 0.3]} />
            <meshBasicMaterial ref={(m) => { if (m && !frameMats.current.includes(m)) frameMats.current.push(m); }} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

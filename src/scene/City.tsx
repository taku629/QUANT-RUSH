import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DISTRICTS, REGIME_STYLE } from '../game/content';
import { createTicker, signTexture } from './textures';
import { makeFacadeMaterial } from './facades';
import { LANDMARK_PLAZA, landmarkZ, sceneryFor, vhash } from './scenery';
import { env } from './env';
import { active, sessionChanged } from './active';
import type { GameSession } from '../game/session';
import { useGame } from '../game/store';

const N = 110; // buildings per side
const SPACING = 7;

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Slot = { wz: number; seed: number };


/** district index at a world z (buildings beyond the next gate already belong to the next district) */
export function districtAtZ(s: GameSession, wz: number): number {
  const g = s.nextGate;
  return g && wz > g.z ? s.district + 1 : s.district;
}

type Slot2 = Slot & { d: number; style: number };

/**
 * Buildings: one InstancedMesh (facade atlas, per-instance style) + one crown mesh (eaves / glass crowns /
 * cornices / setbacks / rooftop billboards) + spires. Each slot takes the look of the district at its world z,
 * so the skyline visibly changes as you cross into a new district.
 */
export function City({ density }: { density: number }) {
  const n = Math.round(N * density);
  const bodies = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const spires = useRef<THREE.InstancedMesh>(null);
  const bodyGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 1));
    return g;
  }, [n]);
  const bodyMat = useMemo(() => makeFacadeMaterial(), []);
  const slots = useMemo<Slot2[]>(() => Array.from({ length: n * 2 }, (_, i) => ({ wz: Math.floor(i / 2) * SPACING - 20, seed: i, d: -1, style: -1 })), [n]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const lastRegime = useRef('');
  const span = n * SPACING;

  useFrame(() => {
    const s = active();
    if (!s || !bodies.current || !crowns.current || !spires.current) return;
    if (sessionChanged('city', s)) slots.forEach((sl, i) => { sl.wz = s.z + Math.floor(i / 2) * SPACING - 20; sl.d = -1; });
    const recolorAll = lastRegime.current !== s.engine.regime;
    lastRegime.current = s.engine.regime;
    const crash = s.engine.regime === 'CRASH';
    const styleAttr = bodyGeo.getAttribute('aStyle') as THREE.InstancedBufferAttribute;
    const lmZ = landmarkZ(s);
    let styleDirty = false;
    let colorDirty = false;
    slots.forEach((sl, i) => {
      let recolor = recolorAll;
      if (sl.wz < s.z - 30) {
        sl.wz += span;
        sl.seed += n * 2;
        recolor = true;
      }
      const dIdx = districtAtZ(s, sl.wz);
      if (dIdx !== sl.d) {
        sl.d = dIdx;
        recolor = true;
      }
      const p = sceneryFor(dIdx);
      if (sl.style !== p.facade) {
        sl.style = p.facade;
        styleAttr.setX(i, p.facade);
        styleDirty = true;
      }
      const side = i % 2 === 0 ? -1 : 1;
      const h1 = hash(sl.seed);
      const h2 = hash(sl.seed + 0.5);
      const h3 = hash(sl.seed + 0.9);
      // open plaza around the district landmark so its silhouette reads from far away
      const plaza = lmZ !== null && dIdx === s.district && Math.abs(sl.wz - lmZ) < LANDMARK_PLAZA && h3 <= 0.7;
      const empty = plaza || vhash(sl.seed * 1.37) < p.gaps;
      const far = h3 > 0.7;
      const w = p.wMin + h1 * (p.wMax - p.wMin);
      const height = empty ? 0 : (p.hMin + h2 * h2 * (p.hMax - p.hMin)) * (far ? 1.35 : 1);
      // never longer than the slot spacing: overlapping boxes would draw the street wall twice (overdraw)
      const len = Math.min(SPACING * 1.02, p.depth * (0.75 + h3 * 0.5));
      const x = side * (11 + p.near + w / 2 + (far ? 16 + h3 * 34 : h3 * 4));
      const z = -(sl.wz - s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x, height / 2, z);
      dummy.scale.set(empty ? 0 : w, Math.max(0.001, height), empty ? 0 : len);
      dummy.updateMatrix();
      bodies.current!.setMatrixAt(i, dummy.matrix);
      // crown / roofline: the silhouette signature of each district
      if (empty) dummy.scale.setScalar(0);
      else
        switch (p.crown) {
          case 'eaves': // 兜町: wide flared eaves
            dummy.position.set(x, height + 0.35, z);
            dummy.scale.set(w + 2.6, 0.7, len + 2.6);
            break;
          case 'glassCrown': // 大手町: stepped glass crown
            dummy.position.set(x, height + 5 + h1 * 5, z);
            dummy.scale.set(w * 0.7, 10 + h1 * 10, len * 0.7);
            break;
          case 'cornice': // 丸の内: white stone cornice, even roofline
            dummy.position.set(x, height + 0.5, z);
            dummy.scale.set(w + 1, 1, len + 1);
            break;
          case 'setback': // 六本木: setback upper tower
            dummy.position.set(x, height + height * 0.16, z);
            dummy.scale.set(w * 0.62, height * 0.32, len * 0.62);
            break;
          case 'billboard': // 渋谷: rooftop billboard facing the road
            dummy.position.set(x - side * (w / 2 - 0.3), height + 2.6 + h1 * 1.5, z);
            dummy.scale.set(0.35, 5 + h1 * 3, len * 0.92);
            break;
        }
      dummy.updateMatrix();
      crowns.current!.setMatrixAt(i, dummy.matrix);
      const spire = !empty && hash(sl.seed + 2.3) < p.spire;
      const top = p.crown === 'setback' ? height * 1.32 : p.crown === 'glassCrown' ? height + 15 + h1 * 10 : height;
      dummy.position.set(x, top + (spire ? 8 + h1 * 10 : 0), z);
      dummy.scale.set(spire ? Math.max(1.2, w * 0.25) : 0, spire ? 16 + h1 * 20 : 0, spire ? Math.max(1.2, w * 0.25) : 0);
      dummy.updateMatrix();
      spires.current!.setMatrixAt(i, dummy.matrix);
      if (recolor) {
        col.set(p.bodyTint[Math.floor(h1 * 3) % 3]);
        if (crash && h2 > 0.55) col.lerp(CRASH_RED, 0.6);
        bodies.current!.setColorAt(i, col.multiplyScalar(0.85 + h2 * 0.35));
        if (p.crown === 'billboard') col.set(BILLBOARD[Math.floor(h2 * BILLBOARD.length)]).multiplyScalar(1.6);
        else col.set(p.crownColor).multiplyScalar(p.crown === 'cornice' ? 1.1 : 1.6);
        crowns.current!.setColorAt(i, col);
        spires.current!.setColorAt(i, col.set(p.crownColor).multiplyScalar(1.4));
        colorDirty = true;
      }
    });
    bodies.current.instanceMatrix.needsUpdate = true;
    crowns.current.instanceMatrix.needsUpdate = true;
    spires.current.instanceMatrix.needsUpdate = true;
    if (styleDirty) styleAttr.needsUpdate = true;
    if (colorDirty) {
      if (bodies.current.instanceColor) bodies.current.instanceColor.needsUpdate = true;
      if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
      if (spires.current.instanceColor) spires.current.instanceColor.needsUpdate = true;
    }
    const reduce = useGame.getState().settings.reduceMotion;
    const flicker = !reduce && env.danger > 0.8 && Math.sin(env.time * 37) > 0.7 ? 0.6 : 1;
    bodyMat.color.setScalar(flicker);
  });

  return (
    <group>
      <instancedMesh key={`b${n}`} ref={bodies} args={[bodyGeo, bodyMat, n * 2]} frustumCulled={false} />
      <instancedMesh key={`r${n}`} ref={crowns} args={[undefined, undefined, n * 2]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={`s${n}`} ref={spires} args={[undefined, undefined, n * 2]} frustumCulled={false}>
        <coneGeometry args={[0.5, 1, 4]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <Signs density={density} />
      <Candles count={Math.round(70 * density)} />
      <Tickers />
    </group>
  );
}

const CRASH_RED = new THREE.Color('#ff2a4d');
const BILLBOARD = ['#ffffff', '#ff3d8b', '#ffd23d', '#3dffcf', '#a6ff00', '#7a5cff', '#00d0ff'];

const SIGN_GAP = 26;

/** signage: style, size and mounting height differ per district */
const SIGN_LAYOUT: Record<string, { x: number; yMin: number; yRange: number; scale: number; every: number }> = {
  shop: { x: 9.4, yMin: 3.5, yRange: 3, scale: 0.85, every: 1 },
  corporate: { x: 15.5, yMin: 16, yRange: 22, scale: 1.6, every: 2 },
  brass: { x: 9.8, yMin: 4.5, yRange: 2, scale: 0.7, every: 2 },
  neon: { x: 11.5, yMin: 8, yRange: 16, scale: 1.25, every: 1 },
  pop: { x: 10.5, yMin: 4, yRange: 20, scale: 1.1, every: 1 },
};

function Signs({ density }: { density: number }) {
  const count = Math.max(12, Math.round(26 * density));
  const refs = useRef<THREE.Mesh[]>([]);
  const state = useMemo(() => Array.from({ length: count }, (_, i) => ({ wz: 60 + i * SIGN_GAP, key: '' })), [count]);
  useFrame(() => {
    const s = active();
    if (!s) return;
    if (sessionChanged('signs', s)) state.forEach((st, i) => { st.wz = s.z + 60 + i * SIGN_GAP; st.key = ''; });
    state.forEach((st, i) => {
      if (st.wz < s.z - 20) st.wz += count * SIGN_GAP;
      const dIdx = districtAtZ(s, st.wz);
      const d = DISTRICTS[dIdx % DISTRICTS.length];
      const p = sceneryFor(dIdx);
      const lay = SIGN_LAYOUT[p.signStyle];
      const mesh = refs.current[i];
      if (!mesh) return;
      const seed = Math.floor(st.wz / SIGN_GAP);
      mesh.visible = seed % lay.every === 0;
      const word = d.signs[seed % d.signs.length];
      const color = [d.primary, d.secondary, d.accent][seed % 3];
      const vertical = p.signStyle === 'shop' || (p.signStyle !== 'corporate' && /[^\x00-\x7F]/.test(word));
      const key = `${word}|${color}|${p.signStyle}`;
      if (key !== st.key) {
        st.key = key;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.map = signTexture(word, color, vertical, p.signStyle);
        mat.needsUpdate = true;
        const chars = [...word].length;
        const k = lay.scale;
        if (vertical) mesh.scale.set(2.2 * k, (1.1 + chars * 1.8) * k, 1);
        else mesh.scale.set((1.2 + chars * 1.05) * k, 2.2 * k, 1);
      }
      const side = seed % 2 === 0 ? -1 : 1;
      mesh.position.set(side * (lay.x + (seed % 3) * 0.6), lay.yMin + vhash(seed) * lay.yRange, -(st.wz - s.z));
      mesh.rotation.y = side * -0.55;
    });
  });
  return (
    <group>
      {state.map((_, i) => (
        <mesh key={i} ref={(m) => { if (m) refs.current[i] = m; }}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial transparent toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/** Floating candlestick holograms above the skyline (decorative, colored by recent returns). */
function Candles({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => Array.from({ length: count }, (_, i) => ({ wz: i * 11, seed: i })), [count]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const s = active();
    if (!s || !ref.current) return;
    if (sessionChanged('candles', s)) items.forEach((it, i) => (it.wz = s.z + i * 11));
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
    <instancedMesh key={count} ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
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
    if (sessionChanged('tickers', s)) { pos[0] = s.z + 140; pos[1] = s.z + 370; }
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

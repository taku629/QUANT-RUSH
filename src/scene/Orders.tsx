import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { fx } from '../game/fx';
import { runtime } from '../game/store';
import { glowTexture } from './textures';
import { env } from './env';
import { active } from './active';
import { Blocks } from './Blocks';
import { InstanceBatch } from './instancing';

/**
 * Taker orders flying toward the market maker — instanced (core, halo, urgency rings, side arrow = 4 draw calls).
 * Colour = taker side (green BUY / red SELL), rings = urgency tier. Hidden data is never shown.
 * No per-frame allocation: orb records are pooled and reused.
 */
const CAP = 40;

function hash(n: number) {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

type Rec = { id: number; x: number; y: number; z: number; buy: boolean; tier: number; stamp: number };

const GREEN = new THREE.Color('#3dff8b');
const RED = new THREE.Color('#ff3d6e');
const GREY = new THREE.Color('#6a7090');
const tmp = new THREE.Color();
const orbM = new THREE.Matrix4();
const orbP = new THREE.Vector3();
const orbS = new THREE.Vector3();
const IDQ = new THREE.Quaternion();

export function Orders() {
  const glow = useMemo(() => glowTexture(), []);
  const b = useMemo(() => {
    const basic = (o: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ toneMapped: false, ...o });
    return {
      core: new InstanceBatch(new THREE.IcosahedronGeometry(1, 1), basic(), CAP, true),
      halo: new InstanceBatch(new THREE.PlaneGeometry(5, 5), basic({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }), CAP, true),
      ring: new InstanceBatch(new THREE.TorusGeometry(1, 0.05, 6, 32), basic(), CAP * 3, true),
      arrow: new InstanceBatch(new THREE.ConeGeometry(0.45, 0.8, 3), basic(), CAP, true),
    };
  }, [glow]);
  const batches = useMemo(() => Object.values(b), [b]);
  const state = useMemo(() => ({ track: new Map<number, Rec>(), pool: [] as Rec[], stamp: 0 }), []);

  useFrame(() => {
    const s = active();
    for (const x of batches) x.begin();
    if (!s) {
      for (const x of batches) x.end();
      return;
    }
    const e = s.engine;
    const lead = e.leadTicks;
    const frac = (s.frame % 3) / 3;
    const st = state;
    st.stamp++;
    if (!e.done)
      e.forEachVisibleOrder((o, tier, tta) => {
        if (o.block !== undefined) return;
        const remain = Math.max(0, tta - frac);
        const u = 1 - remain / lead; // 0 → spawn, 1 → reaches the player
        const x0 = (hash(o.id) - 0.5) * 22;
        const y0 = 4 + hash(o.id + 3) * 6;
        const ease = u * u * (3 - 2 * u);
        const dist = remain * e.cfg.dt * Math.max(20, s.speed) * 1.6;
        const x = x0 + (s.x - x0) * ease;
        const y = y0 + (1.3 + s.y - y0) * ease + Math.sin(u * Math.PI) * 2;
        const z = -dist;
        const buy = o.side === 'BUY';
        const sz = (0.35 + o.qty / 800) * (1 + Math.sin(env.time * 10 + o.id) * 0.06);
        const col = s.stumble > 0 ? GREY : buy ? GREEN : RED;
        orbP.set(x, y, z);
        orbS.setScalar(sz);
        orbM.compose(orbP, IDQ, orbS);
        b.core.addMatrix(orbM, tmp.copy(col).multiplyScalar(1.8));
        b.halo.addMatrix(orbM, col);
        const ringCol = tmp.copy(col).multiplyScalar(1.3);
        for (let r = 0; r < tier; r++) {
          const rad = 1.6 + r * 0.4;
          b.ring.add(orbM, 0, 0, 0, rad, rad, rad, env.time * (1.5 + r) + r, env.time * (1 + r * 0.7), 0, ringCol);
        }
        b.arrow.add(orbM, 0, 0, 1.05, 1, 1, 1, 0, 0, buy ? 0 : Math.PI, tmp.copy(col).multiplyScalar(2));
        let rec = st.track.get(o.id);
        if (!rec) {
          rec = st.pool.pop() ?? { id: 0, x: 0, y: 0, z: 0, buy: false, tier: 0, stamp: 0 };
          rec.id = o.id;
          st.track.set(o.id, rec);
        }
        rec.x = x;
        rec.y = y;
        rec.z = z;
        rec.buy = buy;
        rec.tier = tier;
        rec.stamp = st.stamp;
      });
    // orbs that just arrived: burst depending on outcome
    for (const rec of st.track.values()) {
      if (rec.stamp === st.stamp) continue;
      st.track.delete(rec.id);
      const outcome = fx.orderOutcome.get(rec.id);
      fx.orderOutcome.delete(rec.id);
      if (runtime.session) {
        if (outcome === 'fill') fx.burst({ x: s.x, y: 1.2, z: 0, color: rec.buy ? '#3dff8b' : '#ff3d6e', count: 16 + rec.tier * 10, speed: 5 + rec.tier * 2.5, life: 0.6 });
        else fx.burst({ x: rec.x, y: rec.y, z: rec.z, color: '#6a7090', count: 8, speed: 3, life: 0.4 });
      }
      st.pool.push(rec);
    }
    for (const x of batches) x.end();
  });

  return (
    <group>
      <Blocks />
      {batches.map((x, i) => (
        <primitive key={i} object={x.mesh} />
      ))}
    </group>
  );
}

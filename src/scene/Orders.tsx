import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fx } from '../game/fx';
import { runtime } from '../game/store';
import type { VisibleOrder } from '../sim/engine';
import { glowTexture } from './textures';
import { Blocks } from './Blocks';
import { env } from './env';
import { active } from './active';

const POOL = 28;

function hash(n: number) {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Taker orders flying toward the market maker. Color = taker side (green BUY / red SELL),
 * rings = urgency tier (how wide a spread the taker accepts). Informed/hidden data is never shown.
 */
export function Orders() {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const glow = useMemo(() => glowTexture(), []);
  const assigned = useMemo(() => new Map<number, number>(), []);
  const last = useMemo(() => new Map<number, { x: number; y: number; z: number; buy: boolean; tier: number }>(), []);
  const green = useMemo(() => new THREE.Color('#3dff8b'), []);
  const red = useMemo(() => new THREE.Color('#ff3d6e'), []);
  const grey = useMemo(() => new THREE.Color('#6a7090'), []);

  useFrame(() => {
    const s = active();
    if (!s) return;
    const e = s.engine;
    const orders: VisibleOrder[] = e.done ? [] : e.visibleOrders().filter((o) => o.block === undefined);
    const lead = e.leadTicks;
    const frac = (s.frame % 3) / 3;
    const ids = new Set(orders.map((o) => o.id));
    // orbs that just arrived: burst depending on outcome
    for (const id of [...assigned.keys()]) {
      if (ids.has(id)) continue;
      assigned.delete(id);
      const p = last.get(id);
      last.delete(id);
      const outcome = fx.orderOutcome.get(id);
      fx.orderOutcome.delete(id);
      if (p && runtimeIsPlayer()) {
        if (outcome === 'fill') fx.burst({ x: s.x, y: 1.2, z: 0, color: p.buy ? '#3dff8b' : '#ff3d6e', count: 16 + p.tier * 10, speed: 5 + p.tier * 2.5, life: 0.6 });
        else fx.burst({ x: p.x, y: p.y, z: p.z, color: '#6a7090', count: 8, speed: 3, life: 0.4 });
      }
    }
    const used = new Set(assigned.values());
    for (const o of orders) {
      if (assigned.has(o.id)) continue;
      for (let i = 0; i < POOL; i++)
        if (!used.has(i)) {
          assigned.set(o.id, i);
          used.add(i);
          break;
        }
    }
    const byId = new Map(orders.map((o) => [o.id, o]));
    groups.current.forEach((g, i) => {
      if (!g) return;
      let o: VisibleOrder | undefined;
      for (const [id, slot] of assigned) if (slot === i) o = byId.get(id);
      if (!o) {
        g.visible = false;
        return;
      }
      g.visible = true;
      const remain = Math.max(0, o.ticksToArrival - frac);
      const u = 1 - remain / lead; // 0 → spawn, 1 → reaches the player
      const x0 = (hash(o.id) - 0.5) * 22;
      const y0 = 4 + hash(o.id + 3) * 6;
      const ease = u * u * (3 - 2 * u);
      const dist = remain * e.cfg.dt * Math.max(20, s.speed) * 1.6;
      const x = x0 + (s.x - x0) * ease;
      const y = y0 + (1.3 + s.y - y0) * ease + Math.sin(u * Math.PI) * 2;
      const z = -dist;
      g.position.set(x, y, z);
      const buy = o.side === 'BUY';
      const sz = 0.35 + o.qty / 800;
      g.scale.setScalar(sz * (1 + Math.sin(env.time * 10 + o.id) * 0.06));
      const core = g.children[0] as THREE.Mesh;
      const halo = g.children[1] as THREE.Mesh;
      const col = s.stumble > 0 ? grey : buy ? green : red;
      ((core.material as THREE.MeshBasicMaterial).color as THREE.Color).copy(col).multiplyScalar(1.8);
      (halo.material as THREE.MeshBasicMaterial).color.copy(col);
      for (let r = 0; r < 3; r++) {
        const ring = g.children[2 + r] as THREE.Mesh;
        ring.visible = r < o.tier;
        ring.rotation.set(env.time * (1.5 + r) + r, env.time * (1 + r * 0.7), 0);
        (ring.material as THREE.MeshBasicMaterial).color.copy(col).multiplyScalar(1.3);
      }
      const arrow = g.children[5] as THREE.Mesh;
      arrow.rotation.z = buy ? 0 : Math.PI;
      (arrow.material as THREE.MeshBasicMaterial).color.copy(col).multiplyScalar(2);
      last.set(o.id, { x, y, z, buy, tier: o.tier });
    });
  });

  return (
    <group>
      <Blocks />
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i} ref={(g) => { groups.current[i] = g; }} visible={false}>
          <mesh>
            <icosahedronGeometry args={[1, 1]} />
            <meshBasicMaterial toneMapped={false} />
          </mesh>
          <mesh>
            <planeGeometry args={[5, 5]} />
            <meshBasicMaterial map={glow} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} opacity={0.9} />
          </mesh>
          {[1.6, 2.0, 2.4].map((r) => (
            <mesh key={r}>
              <torusGeometry args={[r, 0.08, 6, 32]} />
              <meshBasicMaterial toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, 0, 1.05]}>
            <coneGeometry args={[0.45, 0.8, 3]} />
            <meshBasicMaterial toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function runtimeIsPlayer() {
  return !!runtime.session;
}

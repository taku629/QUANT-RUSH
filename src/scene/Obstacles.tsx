import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Obstacle } from '../game/session';
import { env } from './env';
import { active } from './active';

const POOL = 40;

/** One reusable slot containing a model for every obstacle kind. */
function Slot({ index, slots }: { index: number; slots: React.MutableRefObject<(THREE.Group | null)[]> }) {
  return (
    <group ref={(g) => { slots.current[index] = g; }} visible={false}>
      {/* car: autonomous "liquidity cab" */}
      <group name="car">
        <mesh position={[0, 0.65, 0]}>
          <boxGeometry args={[2.0, 0.8, 4.2]} />
          <meshStandardMaterial color="#1a1530" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, 1.25, 0.3]}>
          <boxGeometry args={[1.7, 0.55, 2.2]} />
          <meshStandardMaterial color="#0c0a1a" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0.7, 2.11]} name="tail">
          <boxGeometry args={[1.9, 0.14, 0.04]} />
          <meshBasicMaterial color="#ff2040" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.3, 0]} name="stripe">
          <boxGeometry args={[2.04, 0.08, 4.24]} />
          <meshBasicMaterial color="#00f0ff" toneMapped={false} />
        </mesh>
        <mesh position={[0, 1.62, 0.3]} name="roofsign">
          <boxGeometry args={[0.9, 0.22, 0.5]} />
          <meshBasicMaterial color="#ffe23d" toneMapped={false} />
        </mesh>
      </group>
      {/* barrier: circuit breaker */}
      <group name="barrier">
        <mesh position={[0, 0.62, 0]} name="bar">
          <boxGeometry args={[1, 0.5, 0.4]} />
          <meshBasicMaterial color="#ff8a00" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.25, 0]}>
          <boxGeometry args={[1, 0.08, 0.5]} />
          <meshBasicMaterial color="#ff2040" toneMapped={false} />
        </mesh>
      </group>
      {/* spike: volatility crystal */}
      <group name="spike">
        <mesh position={[0, 1.6, 0]} scale={[0.75, 2.0, 0.75]}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#5a1aa0" emissive="#c34dff" emissiveIntensity={1.4} metalness={0.3} roughness={0.2} flatShading />
        </mesh>
        <mesh position={[0, 1.6, 0]} scale={[0.85, 2.1, 0.85]}>
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color="#e08dff" wireframe toneMapped={false} />
        </mesh>
      </group>
      {/* debris: falling block */}
      <group name="debris">
        <mesh position={[0, 1.0, 0]}>
          <boxGeometry args={[2.2, 2.0, 2.2]} />
          <meshStandardMaterial color="#300010" emissive="#ff2a4d" emissiveIntensity={0.8} metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.0, 0]}>
          <boxGeometry args={[2.3, 2.1, 2.3]} />
          <meshBasicMaterial color="#ff5a6e" wireframe toneMapped={false} />
        </mesh>
      </group>
      {/* telegraph ring for falling debris */}
      <mesh name="warn" rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
        <ringGeometry args={[1.0, 1.5, 32]} />
        <meshBasicMaterial color="#ff2a4d" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

const KINDS = ['car', 'barrier', 'spike', 'debris'] as const;

export function Obstacles() {
  const slots = useRef<(THREE.Group | null)[]>([]);
  const assigned = useMemo(() => new Map<number, number>(), []);
  const cache = useMemo(() => new Map<THREE.Group, Record<string, THREE.Object3D>>(), []);
  useFrame(() => {
    const s = active();
    if (!s) return;
    const live: Obstacle[] = s.obstacles.filter((o) => o.alive && o.z - s.z < 260);
    const used = new Set<number>();
    const liveIds = new Set(live.map((o) => o.id));
    for (const id of [...assigned.keys()]) if (!liveIds.has(id)) assigned.delete(id);
    for (const slot of assigned.values()) used.add(slot);
    for (const o of live) {
      if (assigned.has(o.id)) continue;
      for (let i = 0; i < POOL; i++) {
        if (!used.has(i)) {
          assigned.set(o.id, i);
          used.add(i);
          break;
        }
      }
    }
    const byId = new Map(live.map((o) => [o.id, o]));
    slots.current.forEach((g, i) => {
      if (!g) return;
      let parts = cache.get(g);
      if (!parts) {
        parts = {};
        for (const k of [...KINDS, 'warn', 'bar', 'tail', 'roofsign', 'stripe']) parts[k] = g.getObjectByName(k)!;
        cache.set(g, parts);
      }
      let found: Obstacle | undefined;
      for (const [id, slot] of assigned) if (slot === i) found = byId.get(id);
      if (!found) {
        g.visible = false;
        return;
      }
      const o = found;
      g.visible = true;
      for (const k of KINDS) parts[k].visible = o.kind === k;
      parts.warn.visible = o.kind === 'debris' && o.y > 0.2;
      g.position.set(o.x, 0, -(o.z - s.z));
      if (o.kind === 'debris') {
        parts.debris.position.y = o.y;
        parts.debris.rotation.set(o.y * 0.1, o.y * 0.15, 0);
        parts.warn.scale.setScalar(1 + Math.sin(env.time * 14) * 0.15);
      }
      if (o.kind === 'barrier') {
        parts.barrier.scale.set(o.w, 1, 1);
        const m = (parts.bar as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.color.set(Math.floor(env.time * 6) % 2 ? '#ff8a00' : '#ff3020');
      }
      if (o.kind === 'car') {
        g.rotation.y = o.targetLane !== o.lane && o.changeAt > 0 && o.z - s.z < o.changeAt ? Math.sign(o.x - (o.targetLane - 1) * 4) * 0.12 : 0;
        const blink = o.targetLane !== o.lane && Math.floor(env.time * 8) % 2 === 0;
        ((parts.roofsign as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(blink ? '#ff8a00' : '#ffe23d');
        ((parts.stripe as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(env.primary).multiplyScalar(1.3);
      }
      if (o.kind === 'spike') parts.spike.rotation.y = env.time * 1.5 + o.id;
    });
  });
  return (
    <group>
      {Array.from({ length: POOL }, (_, i) => (
        <Slot key={i} index={i} slots={slots} />
      ))}
    </group>
  );
}

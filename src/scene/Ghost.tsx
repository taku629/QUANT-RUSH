import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { ghostState } from '../game/ghost';
import { active } from './active';

/** Translucent "ghost" of a previous run on the same seed (GHOST REPLAY). */
export function Ghost() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = active();
    const g = ghostState.track;
    if (!ref.current) return;
    if (!s || !g || !ghostState.enabled || s !== ghostState.session) {
      ref.current.visible = false;
      return;
    }
    const p = ghostState.sample(s.t);
    if (!p) {
      ref.current.visible = false;
      return;
    }
    const ahead = p.z - s.z;
    ref.current.visible = Math.abs(ahead) < 220;
    ref.current.position.set(p.x, p.y + 0.15, -ahead);
  });
  return (
    <group ref={ref} visible={false}>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.9, 0.12, 2.2]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.25} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <capsuleGeometry args={[0.3, 0.9, 4, 8]} />
        <meshBasicMaterial color="#9fe8ff" transparent opacity={0.22} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

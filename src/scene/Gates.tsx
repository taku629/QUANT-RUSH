import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DISTRICTS } from '../game/content';
import { GAME_RULES } from '../game/session';
import { gateTexture } from './textures';
import { env } from './env';
import { active } from './active';

/** SETTLEMENT GATE: district checkpoint with a live inventory risk check curtain. */
export function Gates() {
  const group = useRef<THREE.Group>(null);
  const banner = useRef<THREE.MeshBasicMaterial>(null);
  const curtain = useRef<THREE.MeshBasicMaterial>(null);
  const frame = useRef<THREE.MeshBasicMaterial[]>([]);
  const key = useRef('');
  const ok = useMemo(() => new THREE.Color('#3dff8b'), []);
  const bad = useMemo(() => new THREE.Color('#ffb03d'), []);
  useFrame(() => {
    const s = active();
    if (!s || !group.current) return;
    const g = s.nextGate;
    if (!g) {
      group.current.visible = false;
      return;
    }
    const ahead = g.z - s.z;
    group.current.visible = ahead < 420;
    group.current.position.z = -ahead;
    const d = DISTRICTS[g.district % DISTRICTS.length];
    const k = `${g.district}`;
    if (key.current !== k && banner.current) {
      key.current = k;
      banner.current.map = gateTexture(d.name, d.jp, g.final ? `GOAL · RISK CHECK < ${Math.round(GAME_RULES.gateRiskMax * 100)}%` : `RISK CHECK  RISK < ${Math.round(GAME_RULES.gateRiskMax * 100)}% → +TIME`, d.primary);
      banner.current.needsUpdate = true;
    }
    const pass = s.currentExposure() < GAME_RULES.gateRiskMax;
    if (curtain.current) {
      curtain.current.color.copy(pass ? ok : bad);
      curtain.current.opacity = 0.12 + Math.sin(env.time * 6) * 0.05;
    }
    frame.current.forEach((m) => m.color.copy(pass ? ok : bad).multiplyScalar(1.8));
  });
  const reg = (m: THREE.MeshBasicMaterial | null) => {
    if (m && !frame.current.includes(m)) frame.current.push(m);
  };
  return (
    <group ref={group}>
      {[-7.6, 7.6].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 7, 0]}>
            <boxGeometry args={[1.2, 14, 1.2]} />
            <meshStandardMaterial color="#0c0a1c" metalness={0.8} roughness={0.3} />
          </mesh>
          {[0.62, -0.62].map((dx) => (
            <mesh key={dx} position={[dx, 7, 0]}>
              <boxGeometry args={[0.08, 14, 1.24]} />
              <meshBasicMaterial ref={reg} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 12.2, 0]}>
        <planeGeometry args={[15, 3.75]} />
        <meshBasicMaterial ref={banner} toneMapped={false} side={THREE.DoubleSide} transparent />
      </mesh>
      <mesh position={[0, 14.3, 0]}>
        <boxGeometry args={[16.4, 0.3, 0.6]} />
        <meshBasicMaterial ref={reg} toneMapped={false} />
      </mesh>
      <mesh position={[0, 5, 0]}>
        <planeGeometry args={[14, 10]} />
        <meshBasicMaterial ref={curtain} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

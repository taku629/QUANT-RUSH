import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { LANE_X } from '../game/content';
import { active } from './active';
import { env } from './env';

/**
 * v3 lane guide on the road surface:
 *  - the RECOMMENDED lane glows gold with flowing arrows (readable in 0.5 s)
 *  - DANGEROUS lanes get a red hazard hatch
 * Two meshes total; the glow slides smoothly when the recommendation moves.
 */
const LEN = 700;

function arrowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0.0)');
  grd.addColorStop(0.15, 'rgba(255,255,255,0.35)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  grd.addColorStop(0.85, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0.0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#fff';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(28, 170);
  g.lineTo(64, 110);
  g.lineTo(100, 170);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, LEN / 9);
  return t;
}

function hatchTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff';
  g.lineWidth = 10;
  for (let k = -64; k < 128; k += 32) {
    g.beginPath();
    g.moveTo(k, 64);
    g.lineTo(k + 64, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.5, LEN / 6);
  return t;
}

const GOLD = new THREE.Color('#ffd23d');
const RED = new THREE.Color('#ff2a4d');

export function LaneGuide() {
  const arrows = useMemo(() => arrowTexture(), []);
  const hatch = useMemo(() => hatchTexture(), []);
  const glow = useRef<THREE.Mesh>(null);
  const danger = useRef<THREE.Mesh>(null);
  const x = useRef(0);
  useFrame((_, dt) => {
    const s = active();
    if (!s || !glow.current || !danger.current) return;
    const a = s.advisor;
    const target = LANE_X[a.lane];
    x.current += (target - x.current) * Math.min(1, dt * 8);
    glow.current.position.x = x.current;
    arrows.offset.y = -((s.z / 9) % 1);
    const m = glow.current.material as THREE.MeshBasicMaterial;
    const inLane = s.quoteLane === a.lane;
    m.color.copy(GOLD).multiplyScalar((inLane ? 0.55 : 0.85) + Math.sin(env.time * 6) * 0.12);
    // danger hatch: only the AGGRESSIVE lane is ever marked dangerous
    const d = (a.danger & 1) !== 0;
    danger.current.visible = d;
    if (d) {
      hatch.offset.y = -((s.z / 6) % 1);
      (danger.current.material as THREE.MeshBasicMaterial).color.copy(RED).multiplyScalar(0.35 + Math.sin(env.time * 8) * 0.1);
    }
  });
  return (
    <group>
      <mesh ref={glow} rotation-x={-Math.PI / 2} position={[0, 0.03, -LEN / 2 + 40]}>
        <planeGeometry args={[3.6, LEN, 1, 140]} />
        <meshBasicMaterial map={arrows} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={danger} rotation-x={-Math.PI / 2} position={[LANE_X[0], 0.025, -LEN / 2 + 40]} visible={false}>
        <planeGeometry args={[3.6, LEN, 1, 140]} />
        <meshBasicMaterial map={hatch} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

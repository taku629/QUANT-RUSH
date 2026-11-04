import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { env } from './env';
import { active } from './active';
import { InstanceBatch } from './instancing';

/** Ramps (wedge + lit edge strips) and boost pads — instanced: 3 draw calls in total. */
const CAP = 32;

function boostTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.lineWidth = 16;
  g.strokeStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 12;
  for (let y = 40; y < 256; y += 80) {
    g.beginPath();
    g.moveTo(14, y + 50);
    g.lineTo(64, y);
    g.lineTo(114, y + 50);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function rampGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(5, 0);
  shape.lineTo(5, 1.1);
  shape.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 3.2, bevelEnabled: false });
  g.translate(-2.5, 0, -1.6);
  g.rotateY(Math.PI / 2);
  return g;
}

const CYAN = new THREE.Color('#00f0ff');
const GOLD = new THREE.Color('#ffd23d');
const tmp = new THREE.Color();
const PAD_SLOPE = Math.atan2(1.1, 5);

export function Pickups() {
  const tex = useMemo(() => boostTexture(), []);
  const b = useMemo(
    () => ({
      ramp: new InstanceBatch(rampGeometry(), new THREE.MeshStandardMaterial({ color: '#141a3a', metalness: 0.6, roughness: 0.3, emissive: '#1a2a6a', emissiveIntensity: 0.6 }), CAP),
      // lit side rails of the ramp (replace the old per-ramp edge lines)
      edge: new InstanceBatch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), CAP * 2, true),
      pad: new InstanceBatch(new THREE.PlaneGeometry(3.2, 7), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), CAP * 2, true),
    }),
    [tex],
  );
  const batches = useMemo(() => Object.values(b), [b]);
  useFrame(() => {
    const s = active();
    for (const x of batches) x.begin();
    if (s) {
      tex.offset.y = -(env.time * 2.5) % 1;
      const edgeCol = tmp.copy(env.primary).multiplyScalar(1.6);
      for (const p of s.pickups) {
        const ahead = p.z - s.z;
        if (ahead < -12 || ahead > 250) continue;
        const z = -ahead;
        const k = p.used ? 0.25 : 0.9;
        if (p.kind === 'ramp') {
          b.ramp.add(null, p.x, 0, z);
          for (const sx of [-1.6, 1.6]) b.edge.add(null, p.x + sx, 0.55, z, 0.1, 0.1, 5.1, PAD_SLOPE, 0, 0, edgeCol);
          b.pad.add(null, p.x, 0.05, z + 6, 1, 1, 1, -Math.PI / 2, 0, 0, tmp.copy(CYAN).multiplyScalar(k));
        } else b.pad.add(null, p.x, 0.05, z, 1, 1, 1, -Math.PI / 2, 0, 0, tmp.copy(GOLD).multiplyScalar(k));
      }
    }
    for (const x of batches) x.end();
  });
  return (
    <group>
      {batches.map((x, i) => (
        <primitive key={i} object={x.mesh} />
      ))}
    </group>
  );
}

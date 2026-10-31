import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { env } from './env';
import { active } from './active';

const POOL = 24;

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

/** ramp = wedge prism (launch), boost = glowing chevron pad */
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

export function Pickups() {
  const tex = useMemo(() => boostTexture(), []);
  const slots = useMemo(() => {
    const rampGeo = rampGeometry();
    const edgeGeo = new THREE.EdgesGeometry(rampGeo);
    const padGeo = new THREE.PlaneGeometry(3.2, 7);
    return Array.from({ length: POOL }, () => {
      const g = new THREE.Group();
      const ramp = new THREE.Mesh(rampGeo, new THREE.MeshStandardMaterial({ color: '#141a3a', metalness: 0.6, roughness: 0.3, emissive: '#1a2a6a', emissiveIntensity: 0.6 }));
      const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: '#00f0ff', toneMapped: false }));
      ramp.add(edges);
      const pad = new THREE.Mesh(padGeo, new THREE.MeshBasicMaterial({ map: tex, color: '#ffd23d', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.05;
      g.add(ramp, pad);
      g.visible = false;
      return { g, ramp, pad, edges };
    });
  }, [tex]);
  useFrame(() => {
    const s = active();
    if (!s) return;
    tex.offset.y = -(env.time * 2.5) % 1;
    let i = 0;
    for (const p of s.pickups) {
      if (i >= POOL) break;
      const ahead = p.z - s.z;
      if (ahead < -12 || ahead > 250) continue;
      const sl = slots[i++];
      sl.g.visible = true;
      sl.g.position.set(p.x, 0, -ahead);
      sl.ramp.visible = p.kind === 'ramp';
      sl.pad.visible = p.kind === 'boost' || p.kind === 'ramp';
      (sl.pad.material as THREE.MeshBasicMaterial).color.set(p.kind === 'ramp' ? '#00f0ff' : '#ffd23d');
      (sl.pad.material as THREE.MeshBasicMaterial).opacity = p.used ? 0.25 : 0.9;
      sl.pad.position.z = p.kind === 'ramp' ? 6 : 0;
      (sl.edges.material as THREE.LineBasicMaterial).color.copy(env.primary).multiplyScalar(1.6);
    }
    for (; i < POOL; i++) slots[i].g.visible = false;
  });
  return (
    <group>
      {slots.map((sl, i) => (
        <primitive key={i} object={sl.g} />
      ))}
    </group>
  );
}

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { active } from './active';
import { sceneryFor } from './scenery';

/** Sidewalk paving outside the road edge (visual only — the drivable road and lanes are untouched). */
const LEN = 700;

function paving(style: number) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const fills = ['#2a2620', '#121a2a', '#3a1c14', '#140c20', '#1a1424'];
  g.fillStyle = fills[style];
  g.fillRect(0, 0, 128, 128);
  switch (style) {
    case 0: // 兜町: granite slabs
      g.strokeStyle = 'rgba(255,220,170,0.25)';
      g.lineWidth = 2;
      for (let y = 0; y < 128; y += 32) for (let x = y % 64 ? 0 : 21; x < 128; x += 42) g.strokeRect(x, y, 42, 32);
      break;
    case 1: // 大手町: steel grating + light seams
      g.fillStyle = 'rgba(160,200,255,0.25)';
      for (let x = 0; x < 128; x += 8) g.fillRect(x, 0, 1, 128);
      g.fillStyle = 'rgba(255,210,120,0.5)';
      g.fillRect(0, 0, 128, 2);
      break;
    case 2: // 丸の内: brick herringbone
      for (let y = 0; y < 128; y += 16)
        for (let x = 0; x < 128; x += 32) {
          g.fillStyle = `rgba(${150 + ((x + y) % 40)},70,45,0.9)`;
          g.fillRect(x + ((y / 16) % 2) * 16 + 1, y + 1, 30, 14);
        }
      break;
    case 3: // 六本木: dark glass with purple LED grid
      g.strokeStyle = 'rgba(200,120,255,0.45)';
      g.lineWidth = 1;
      for (let i = 0; i < 128; i += 32) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, 128);
        g.moveTo(0, i);
        g.lineTo(128, i);
        g.stroke();
      }
      break;
    case 4: // 渋谷: LED tiles in mixed colours
      for (let y = 0; y < 128; y += 16)
        for (let x = 0; x < 128; x += 16) {
          if ((x * 7 + y * 13) % 5 > 1) continue;
          g.fillStyle = ['#ff3d8b', '#ffd23d', '#3dffcf', '#a6ff00'][(x + y) % 4];
          g.globalAlpha = 0.5;
          g.fillRect(x + 2, y + 2, 12, 12);
          g.globalAlpha = 1;
        }
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, LEN / 6);
  t.anisotropy = 4;
  return t;
}

export function Sidewalks() {
  const textures = useMemo(() => [0, 1, 2, 3, 4].map(paving), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: textures[0], toneMapped: false }), [textures]);
  const cur = useRef(0);
  useFrame(() => {
    const s = active();
    if (!s) return;
    const p = sceneryFor(s.district).paving;
    if (p !== cur.current) {
      cur.current = p;
      mat.map = textures[p];
      mat.needsUpdate = true;
    }
    mat.map!.offset.y = (s.z / 6) % 1;
  });
  return (
    <group>
      {[-1, 1].map((sd) => (
        <mesh key={sd} rotation-x={-Math.PI / 2} position={[sd * 8.7, 0.01, -LEN / 2 + 40]} material={mat}>
          <planeGeometry args={[3.6, LEN, 1, 140]} />
        </mesh>
      ))}
    </group>
  );
}

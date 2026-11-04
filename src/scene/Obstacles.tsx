import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { LANE_X } from '../game/content';
import { env } from './env';
import { active } from './active';
import { InstanceBatch } from './instancing';

/**
 * Obstacles, fully instanced: every box-shaped part (bodies, cabins, lights, bars, walls) shares a unit box
 * and is scaled per instance, with per-instance colour. ~9 draw calls in total, independent of obstacle count.
 */
const CAP = 64;
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitBoxLong = new THREE.BoxGeometry(1, 1, 1, 1, 1, 16); // subdivided along z for the world bend
const octa = new THREE.OctahedronGeometry(1, 0);
const ring = new THREE.RingGeometry(1.0, 1.5, 32);
const beamGeo = new THREE.PlaneGeometry(1, 1, 1, 8);
const chevGeo = new THREE.PlaneGeometry(1, 1, 1, 12);

function chevronTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff';
  g.lineWidth = 10;
  for (let y = 20; y < 256; y += 64) {
    g.beginPath();
    g.moveTo(8, y + 30);
    g.lineTo(32, y);
    g.lineTo(56, y + 30);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 4);
  return t;
}

const C = {
  dark: new THREE.Color('#1a1530'),
  red: new THREE.Color('#3a0812'),
  glass: new THREE.Color('#0c0a1a'),
  debris: new THREE.Color('#ff2a4d'),
  tail: new THREE.Color('#ff2040').multiplyScalar(1),
  sign: new THREE.Color('#ffe23d'),
  signBlink: new THREE.Color('#ff8a00'),
  head: new THREE.Color('#fff6c8'),
  bar: new THREE.Color('#ff8a00'),
  barBlink: new THREE.Color('#ff3020'),
  foot: new THREE.Color('#ff2040'),
  tmp: new THREE.Color(),
  tmp2: new THREE.Color(),
  warnRed: new THREE.Color('#ff2a3d').multiplyScalar(1.4),
  warnDark: new THREE.Color('#a8101e'),
  white: new THREE.Color('#ffffff'),
};

const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } as const;
const objM = new THREE.Matrix4();
const objQ = new THREE.Quaternion();
const objE = new THREE.Euler();
const objP = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

export function Obstacles() {
  const chev = useMemo(() => chevronTexture(), []);
  const b = useMemo(() => {
    const basic = (o: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ toneMapped: false, ...o });
    return {
      // lit parts (car bodies, cabins, debris): colour per instance
      lit: new InstanceBatch(unitBox, new THREE.MeshStandardMaterial({ metalness: 0.8, roughness: 0.3 }), CAP * 3, true),
      // unlit glowing parts (tail lights, stripes, signs, headlights, barrier bars & feet, wall tops)
      glow: new InstanceBatch(unitBox, basic(), CAP * 6, true),
      wall: new InstanceBatch(unitBoxLong, basic({ transparent: true, opacity: 0.32, depthWrite: false }), 8, true),
      spike: new InstanceBatch(octa, new THREE.MeshStandardMaterial({ color: '#5a1aa0', emissive: '#c34dff', emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.2, flatShading: true }), CAP),
      spikeWire: new InstanceBatch(octa, basic({ color: '#e08dff', wireframe: true }), CAP),
      debrisWire: new InstanceBatch(unitBox, basic({ color: '#ff5a6e', wireframe: true }), CAP),
      warn: new InstanceBatch(ring, basic({ color: '#ff2a4d', ...additive, opacity: 0.8 }), CAP),
      beam: new InstanceBatch(beamGeo, basic({ color: '#fff2b0', ...additive, opacity: 0.18 }), 16),
      chevron: new InstanceBatch(chevGeo, basic({ color: '#ff2a4d', ...additive, opacity: 0.6, map: chev }), 16),
    };
  }, [chev]);
  const batches = useMemo(() => Object.values(b), [b]);

  useFrame(() => {
    const s = active();
    for (const x of batches) x.begin();
    if (s) {
      const blink = Math.floor(env.time * 6) % 2 === 0;
      chev.offset.y = (env.time * 3) % 1;
      (b.chevron.mesh.material as THREE.MeshBasicMaterial).opacity = blink ? 0.7 : 0.35;
      const stripe = C.tmp.copy(env.primary).multiplyScalar(1.3);
      for (const o of s.obstacles) {
        const ahead = o.z - s.z;
        if (!o.alive || ahead > 260) continue;
        let yaw = 0;
        if (o.kind === 'car' && o.targetLane !== o.lane && o.changeAt > 0 && ahead < o.changeAt) yaw = Math.sign(o.x - LANE_X[o.targetLane]) * 0.12;
        if (o.kind === 'spike') yaw = env.time * 1.5 + o.id;
        objP.set(o.x, 0, -ahead);
        objQ.setFromEuler(objE.set(0, yaw, 0));
        objM.compose(objP, objQ, ONE);
        switch (o.kind) {
          case 'car': {
            const changing = o.targetLane !== o.lane && o.changeAt > 0;
            b.lit.add(objM, 0, 0.65, 0, 2.0, 0.8, 4.2, 0, 0, 0, C.dark);
            b.lit.add(objM, 0, 1.25, 0.3, 1.7, 0.55, 2.2, 0, 0, 0, C.glass);
            b.glow.add(objM, 0, 0.7, 2.11, 1.9, 0.14, 0.04, 0, 0, 0, C.tail);
            b.glow.add(objM, 0, 0.3, 0, 2.04, 0.08, 4.24, 0, 0, 0, stripe);
            b.glow.add(objM, 0, 1.62, 0.3, 0.9, 0.22, 0.5, 0, 0, 0, changing && blink ? C.signBlink : C.sign);
            break;
          }
          case 'oncoming': {
            b.lit.add(objM, 0, 0.7, 0, 2.0, 0.8, 4.2, 0, 0, 0, C.red);
            b.lit.add(objM, 0, 1.3, -0.3, 1.7, 0.55, 2.2, 0, 0, 0, C.glass);
            b.glow.add(objM, -0.65, 0.75, 2.12, 0.5, 0.22, 0.05, 0, 0, 0, C.head);
            b.glow.add(objM, 0.65, 0.75, 2.12, 0.5, 0.22, 0.05, 0, 0, 0, C.head);
            b.beam.add(objM, 0, 0.08, 15, 2.4, 26, 1, -Math.PI / 2, 0, 0);
            if (ahead > 8) {
              // warning chevrons fill the lane between you and the oncoming car
              const len = Math.min(Math.max(8, ahead), 120);
              b.chevron.add(objM, 0, 0.07, len / 2, 3.4, len, 1, -Math.PI / 2, 0, 0);
            }
            break;
          }
          case 'barrier':
            b.glow.add(objM, 0, 0.62, 0, o.w, 0.5, 0.4, 0, 0, 0, blink ? C.bar : C.barBlink);
            b.glow.add(objM, 0, 0.25, 0, o.w, 0.08, 0.5, 0, 0, 0, C.foot);
            break;
          case 'spike':
            b.spike.add(objM, 0, 1.6, 0, 0.75, 2.0, 0.75);
            b.spikeWire.add(objM, 0, 1.6, 0, 0.85, 2.1, 0.85);
            break;
          case 'debris':
            b.lit.add(objM, 0, o.y + 1.0, 0, 2.2, 2.0, 2.2, o.y * 0.1, o.y * 0.15, 0, C.debris);
            b.debrisWire.add(objM, 0, o.y + 1.0, 0, 2.3, 2.1, 2.3, o.y * 0.1, o.y * 0.15, 0);
            if (o.y > 0.2) {
              const k = 1 + Math.sin(env.time * 14) * 0.15;
              b.warn.add(objM, 0, 0.06, 0, k, k, k, -Math.PI / 2, 0, 0);
            }
            break;
          case 'warning': {
            // red/white striped barricade = "this lane is dangerous in this market"
            b.glow.add(objM, -1.55, 1.3, 0, 0.25, 2.6, 0.25, 0, 0, 0, C.foot);
            b.glow.add(objM, 1.55, 1.3, 0, 0.25, 2.6, 0.25, 0, 0, 0, C.foot);
            b.glow.add(objM, 0, 1.6, 0, 3.4, 1.6, 0.18, 0, 0, 0, blink ? C.warnRed : C.warnDark);
            for (let k = -1; k <= 1; k++) b.glow.add(objM, k * 1.05, 1.6, 0.1, 0.32, 1.7, 0.05, 0, 0, 0.6, C.white);
            b.glow.add(objM, 0, 2.75, 0, 3.6, 0.2, 0.3, 0, 0, 0, C.warnRed);
            break;
          }
          case 'wall': {
            const wc = C.tmp2.copy(env.primary).lerp(env.secondary, 0.5 + Math.sin(env.time * 4) * 0.5);
            b.wall.add(objM, 0, 1.2, 0, o.w, o.h, o.len, 0, 0, 0, wc);
            b.glow.add(objM, 0, 1.2 + o.h * 0.52, 0, o.w * 1.1, o.h * 0.06, o.len, 0, 0, 0, C.tmp2.copy(env.primary).multiplyScalar(1.8));
            break;
          }
        }
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

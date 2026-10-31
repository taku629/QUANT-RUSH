import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Obstacle } from '../game/session';
import { LANE_X } from '../game/content';
import { env } from './env';
import { active } from './active';

const POOL = 40;

/** geometries shared by every slot (allocated once) */
const G = {
  carBody: new THREE.BoxGeometry(2.0, 0.8, 4.2),
  carCabin: new THREE.BoxGeometry(1.7, 0.55, 2.2),
  carTail: new THREE.BoxGeometry(1.9, 0.14, 0.04),
  carStripe: new THREE.BoxGeometry(2.04, 0.08, 4.24),
  carSign: new THREE.BoxGeometry(0.9, 0.22, 0.5),
  headlight: new THREE.BoxGeometry(0.5, 0.22, 0.05),
  beam: new THREE.PlaneGeometry(2.4, 26, 1, 8),
  bar: new THREE.BoxGeometry(1, 0.5, 0.4),
  barFoot: new THREE.BoxGeometry(1, 0.08, 0.5),
  spike: new THREE.OctahedronGeometry(1, 0),
  debris: new THREE.BoxGeometry(2.2, 2.0, 2.2),
  debrisWire: new THREE.BoxGeometry(2.3, 2.1, 2.3),
  ring: new THREE.RingGeometry(1.0, 1.5, 32),
  wall: new THREE.BoxGeometry(1, 1, 1, 1, 1, 16),
  chevron: new THREE.PlaneGeometry(3.4, 30, 1, 12),
};
const darkCar = new THREE.MeshStandardMaterial({ color: '#1a1530', metalness: 0.8, roughness: 0.3 });
const glass = new THREE.MeshStandardMaterial({ color: '#0c0a1a', metalness: 0.9, roughness: 0.1 });
const redCar = new THREE.MeshStandardMaterial({ color: '#3a0812', metalness: 0.7, roughness: 0.3 });
const spikeMat = new THREE.MeshStandardMaterial({ color: '#5a1aa0', emissive: '#c34dff', emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.2, flatShading: true });
const debrisMat = new THREE.MeshStandardMaterial({ color: '#300010', emissive: '#ff2a4d', emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.4 });
const basic = (color: string, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra });
const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } as const;

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

type Parts = Record<string, THREE.Object3D> & { mats: Record<string, THREE.MeshBasicMaterial> };

function makeSlot(chev: THREE.Texture): { group: THREE.Group; parts: Parts } {
  const g = new THREE.Group();
  g.visible = false;
  const mats = {
    tail: basic('#ff2040'),
    stripe: basic('#00f0ff'),
    sign: basic('#ffe23d'),
    bar: basic('#ff8a00'),
    head: basic('#fff6c8'),
    beam: basic('#fff2b0', { ...additive, opacity: 0.18 }),
    warn: basic('#ff2a4d', { ...additive, opacity: 0.8 }),
    chev: basic('#ff2a4d', { ...additive, opacity: 0.6, map: chev }),
    wall: basic('#ffffff', { transparent: true, opacity: 0.32, depthWrite: false }),
    wallTop: basic('#ffffff'),
    spikeWire: basic('#e08dff', { wireframe: true }),
    debrisWire: basic('#ff5a6e', { wireframe: true }),
    barFoot: basic('#ff2040'),
  };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], parent: THREE.Object3D, name?: string) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (name) m.name = name;
    parent.add(m);
    return m;
  };
  const car = new THREE.Group();
  mesh(G.carBody, darkCar, [0, 0.65, 0], car);
  mesh(G.carCabin, glass, [0, 1.25, 0.3], car);
  mesh(G.carTail, mats.tail, [0, 0.7, 2.11], car);
  mesh(G.carStripe, mats.stripe, [0, 0.3, 0], car);
  mesh(G.carSign, mats.sign, [0, 1.62, 0.3], car);
  const oncoming = new THREE.Group();
  mesh(G.carBody, redCar, [0, 0.7, 0], oncoming);
  mesh(G.carCabin, glass, [0, 1.3, -0.3], oncoming);
  mesh(G.headlight, mats.head, [-0.65, 0.75, 2.12], oncoming);
  mesh(G.headlight, mats.head, [0.65, 0.75, 2.12], oncoming);
  const beam = mesh(G.beam, mats.beam, [0, 0.08, 15], oncoming);
  beam.rotation.x = -Math.PI / 2;
  const chevron = mesh(G.chevron, mats.chev, [0, 0.07, 0], g, 'chevron');
  chevron.rotation.x = -Math.PI / 2;
  const barrier = new THREE.Group();
  mesh(G.bar, mats.bar, [0, 0.62, 0], barrier);
  mesh(G.barFoot, mats.barFoot, [0, 0.25, 0], barrier);
  const spike = new THREE.Group();
  const sp = mesh(G.spike, spikeMat, [0, 1.6, 0], spike);
  sp.scale.set(0.75, 2.0, 0.75);
  const sw = mesh(G.spike, mats.spikeWire, [0, 1.6, 0], spike);
  sw.scale.set(0.85, 2.1, 0.85);
  const debris = new THREE.Group();
  mesh(G.debris, debrisMat, [0, 1.0, 0], debris);
  mesh(G.debrisWire, mats.debrisWire, [0, 1.0, 0], debris);
  const warn = mesh(G.ring, mats.warn, [0, 0.06, 0], g);
  warn.rotation.x = -Math.PI / 2;
  const wall = mesh(G.wall, mats.wall, [0, 1.2, 0], g);
  const wallTop = mesh(G.wall, mats.wallTop, [0, 0.52, 0], wall);
  wallTop.scale.set(1.1, 0.06, 1);
  for (const [k, o] of Object.entries({ car, oncoming, barrier, spike, debris })) {
    o.name = k;
    g.add(o);
  }
  return { group: g, parts: { car, oncoming, barrier, spike, debris, warn, wall, chevron, mats } as unknown as Parts };
}

const KINDS = ['car', 'oncoming', 'barrier', 'spike', 'debris', 'wall'] as const;

export function Obstacles() {
  const chev = useMemo(() => chevronTexture(), []);
  const slots = useMemo(() => Array.from({ length: POOL }, () => makeSlot(chev)), [chev]);
  const root = useRef<THREE.Group>(null);
  /** obstacle id → slot index, and the reverse */
  const idToSlot = useMemo(() => new Map<number, number>(), []);
  const slotToObs = useMemo(() => new Array<Obstacle | null>(POOL).fill(null), []);
  useFrame(() => {
    const s = active();
    if (!s) return;
    // release slots of dead / far obstacles
    for (let i = 0; i < POOL; i++) {
      const o = slotToObs[i];
      if (o && (!o.alive || o.z - s.z > 270 || !s.obstacles.includes(o))) {
        idToSlot.delete(o.id);
        slotToObs[i] = null;
      }
    }
    let free = 0;
    for (const o of s.obstacles) {
      if (!o.alive || o.z - s.z > 260 || idToSlot.has(o.id)) continue;
      while (free < POOL && slotToObs[free]) free++;
      if (free >= POOL) break;
      slotToObs[free] = o;
      idToSlot.set(o.id, free);
    }
    const blink = Math.floor(env.time * 6) % 2 === 0;
    for (let i = 0; i < POOL; i++) {
      const { group: g, parts } = slots[i];
      const o = slotToObs[i];
      if (!o) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      for (const k of KINDS) parts[k].visible = o.kind === k;
      parts.warn.visible = o.kind === 'debris' && o.y > 0.2;
      parts.chevron.visible = o.kind === 'oncoming' && o.z - s.z > 8;
      g.position.set(o.x, 0, -(o.z - s.z));
      g.rotation.y = 0;
      switch (o.kind) {
        case 'debris':
          parts.debris.position.y = o.y;
          parts.debris.rotation.set(o.y * 0.1, o.y * 0.15, 0);
          parts.warn.scale.setScalar(1 + Math.sin(env.time * 14) * 0.15);
          break;
        case 'barrier':
          parts.barrier.scale.set(o.w, 1, 1);
          parts.mats.bar.color.set(blink ? '#ff8a00' : '#ff3020');
          break;
        case 'car': {
          const changing = o.targetLane !== o.lane && o.changeAt > 0;
          if (changing && o.z - s.z < o.changeAt) g.rotation.y = Math.sign(o.x - LANE_X[o.targetLane]) * 0.12;
          parts.mats.sign.color.set(changing && blink ? '#ff8a00' : '#ffe23d');
          parts.mats.stripe.color.copy(env.primary).multiplyScalar(1.3);
          break;
        }
        case 'oncoming': {
          // warning chevrons fill the lane between you and the oncoming car
          const dist = Math.max(8, o.z - s.z);
          parts.chevron.scale.set(1, Math.min(dist, 120) / 30, 1);
          parts.chevron.position.z = Math.min(dist, 120) / 2;
          chev.offset.y = (env.time * 3) % 1;
          parts.mats.chev.opacity = blink ? 0.7 : 0.35;
          break;
        }
        case 'spike':
          parts.spike.rotation.y = env.time * 1.5 + o.id;
          break;
        case 'wall':
          parts.wall.scale.set(o.w, o.h, o.len);
          parts.mats.wall.color.copy(env.primary).lerp(env.secondary, 0.5 + Math.sin(env.time * 4) * 0.5);
          parts.mats.wallTop.color.copy(env.primary).multiplyScalar(1.8);
          break;
      }
    }
  });
  return (
    <group ref={root}>
      {slots.map((sl, i) => (
        <primitive key={i} object={sl.group} />
      ))}
    </group>
  );
}

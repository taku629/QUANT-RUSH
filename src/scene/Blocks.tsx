import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { LANE_X } from '../game/content';
import { fx } from '../game/fx';
import { env } from './env';
import { active } from './active';

const POOL = 4;

function label(text: string, sub: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.font = 'bold 56px "Arial Black", Arial, sans-serif';
  g.fillText(text, 128, 62);
  g.font = 'bold 30px Arial, sans-serif';
  g.fillStyle = '#ffffff';
  g.fillText(sub, 128, 108);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * BLOCK orders: big institutional orders that stand in ONE lane. Ride through the gate (in that lane)
 * to trade it at that lane's spread — a physical routing decision with inventory consequences.
 */
type BlockRec = { id: number; side: 'BUY' | 'SELL'; qty: number; block: number; tier: number; ticksToArrival: number };
const recs: BlockRec[] = Array.from({ length: POOL }, () => ({ id: 0, side: 'BUY', qty: 0, block: 0, tier: 0, ticksToArrival: 0 }));
const blocks: BlockRec[] = [];

export function Blocks() {
  const texCache = useMemo(() => new Map<string, THREE.Texture>(), []);
  const slots = useMemo(
    () =>
      Array.from({ length: POOL }, () => {
        const g = new THREE.Group();
        const hex = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.16, 6, 6), new THREE.MeshBasicMaterial({ toneMapped: false }));
        hex.rotation.z = Math.PI / 6;
        const inner = new THREE.Mesh(new THREE.CircleGeometry(1.85, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
        inner.rotation.z = Math.PI / 6;
        const tag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }));
        tag.position.y = 2.9;
        const rings = [0, 1, 2].map((k) => {
          const r = new THREE.Mesh(new THREE.TorusGeometry(2.35 + k * 0.28, 0.05, 4, 6), new THREE.MeshBasicMaterial({ toneMapped: false }));
          r.rotation.z = Math.PI / 6;
          g.add(r);
          return r;
        });
        g.add(hex, inner, tag);
        g.visible = false;
        return { g, hex, inner, tag, rings, id: -1 };
      }),
    [],
  );
  useFrame(() => {
    const s = active();
    if (!s) return;
    const e = s.engine;
    // collect visible block orders into a reused array (no per-frame allocation)
    blocks.length = 0;
    if (!e.done)
      e.forEachVisibleOrder((o, tier, tta) => {
        if (o.block === undefined || blocks.length >= POOL) return;
        const r = recs[blocks.length];
        r.id = o.id;
        r.side = o.side;
        r.qty = o.qty;
        r.block = o.block;
        r.tier = tier;
        r.ticksToArrival = tta;
        blocks.push(r);
      });
    const frac = (s.frame % 3) / 3;
    for (let i = 0; i < POOL; i++) {
      const sl = slots[i];
      const o = blocks[i];
      if (!o) {
        if (sl.id >= 0 && fx.orderOutcome.has(sl.id)) {
          const filled = fx.orderOutcome.get(sl.id) === 'fill';
          fx.burst({ x: sl.g.position.x, y: 2, z: 0, color: filled ? '#ffd23d' : '#6a7090', count: filled ? 90 : 20, speed: filled ? 16 : 5, life: 0.9 });
          fx.orderOutcome.delete(sl.id);
        }
        sl.g.visible = false;
        sl.id = -1;
        continue;
      }
      sl.id = o.id;
      sl.g.visible = true;
      const remain = Math.max(0, o.ticksToArrival - frac);
      const dist = remain * e.cfg.dt * Math.max(20, s.speed);
      sl.g.position.set(LANE_X[o.block as 0 | 1 | 2], 2.1, -dist);
      const buy = o.side === 'BUY';
      const col = buy ? '#3dff8b' : '#ff3d6e';
      (sl.hex.material as THREE.MeshBasicMaterial).color.set(col).multiplyScalar(1.6);
      (sl.inner.material as THREE.MeshBasicMaterial).color.set(col);
      sl.rings.forEach((r, k) => {
        r.visible = k < o.tier;
        (r.material as THREE.MeshBasicMaterial).color.set(col).multiplyScalar(1.2);
        r.rotation.z = Math.PI / 6 + env.time * (k % 2 ? -0.6 : 0.6);
      });
      const key = `${o.side}${o.qty}`;
      let t = texCache.get(key);
      if (!t) {
        t = label(`BLOCK ${buy ? 'BUY' : 'SELL'}`, `${o.qty} sh`, col);
        texCache.set(key, t);
      }
      const m = sl.tag.material as THREE.MeshBasicMaterial;
      if (m.map !== t) {
        m.map = t;
        m.needsUpdate = true;
      }
      const inLane = s.quoteLane === o.block;
      sl.g.scale.setScalar(inLane ? 1.05 + Math.sin(env.time * 12) * 0.04 : 1);
    }
  });
  return (
    <group>
      {slots.map((sl, i) => (
        <primitive key={i} object={sl.g} />
      ))}
    </group>
  );
}

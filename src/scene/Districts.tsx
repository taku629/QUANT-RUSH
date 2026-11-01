import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DISTRICTS } from '../game/content';
import { active } from './active';
import { districtAtZ } from './City';
import { env } from './env';

/**
 * District-specific street furniture and landmarks (procedural geometry only).
 * Each decor family only appears where its district is, so the world visibly changes as you progress.
 */
type DecorDef = {
  district: string;
  count: number;
  gap: number;
  /** place instance k at world z → set dummy transform; return false to hide */
  place: (d: THREE.Object3D, k: number, wz: number) => void;
  geo: THREE.BufferGeometry;
  color: string;
  additive?: boolean;
  phase?: number;
};

function DecorInstances({ def }: { def: DecorDef }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: def.color, toneMapped: false, transparent: !!def.additive, opacity: def.additive ? 0.55 : 1, blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !def.additive }),
    [def],
  );
  useFrame(() => {
    const s = active();
    if (!s || !ref.current) return;
    const base = Math.floor(s.z / def.gap) * def.gap + (def.phase ?? 0);
    for (let k = 0; k < def.count; k++) {
      const wz = base + k * def.gap;
      const d = DISTRICTS[districtAtZ(s, wz) % DISTRICTS.length];
      if (d.id !== def.district || wz < s.z - 20) {
        dummy.scale.setScalar(0);
      } else {
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        def.place(dummy, k, wz);
        dummy.position.z = -(wz - s.z);
      }
      dummy.updateMatrix();
      ref.current.setMatrixAt(k, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (def.district === 'shibuya' && !def.additive) mat.color.copy(env.primary).lerp(env.secondary, 0.5 + 0.5 * Math.sin(env.time * 2));
  });
  return (
    <instancedMesh ref={ref} args={[def.geo, mat, def.count]} frustumCulled={false} />
  );
}

/** Large landmarks near each district's settlement gate */
function Landmarks() {
  const groups = useMemo(() => {
    const mk = () => new THREE.Group();
    const basic = (c: string) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    const std = (c: string, e = '#000') => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.5 });
    // Kabutocho: classical exchange hall + floating ticker ring
    const kabuto = mk();
    const hall = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 22), std('#2a2a3a', '#101030'));
    hall.position.set(0, 8, 0);
    kabuto.add(hall);
    for (let i = 0; i < 9; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 14, 10), basic('#b8f6ff'));
      col.position.set(-16 + i * 4, 7, 11.5);
      kabuto.add(col);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 0.8, 8, 64), basic('#00f0ff'));
    ring.position.set(0, 34, 0);
    ring.rotation.x = Math.PI / 2;
    ring.name = 'spin';
    kabuto.add(ring);
    // Otemachi: twin glass towers with a sky link
    const ote = mk();
    for (const x of [-12, 12]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(14, 160, 14), std('#0b1a3a', '#1a3a8a'));
      t.position.set(x, 80, 0);
      ote.add(t);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(t.geometry), new THREE.LineBasicMaterial({ color: '#ffc23d', toneMapped: false }));
      edge.position.copy(t.position);
      ote.add(edge);
    }
    const link = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 6), basic('#ffc23d'));
    link.position.set(0, 120, 0);
    ote.add(link);
    // Marunouchi: brick station with domes
    const maru = mk();
    const st = new THREE.Mesh(new THREE.BoxGeometry(90, 18, 18), std('#7a2c1c', '#3a1008'));
    st.position.set(0, 9, 0);
    maru.add(st);
    for (const x of [-38, 38, 0]) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(x === 0 ? 9 : 7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#1d2a24', '#0d4a3a'));
      dome.position.set(x, 18, 0);
      maru.add(dome);
    }
    const windows = new THREE.Mesh(new THREE.BoxGeometry(86, 1.2, 18.4), basic('#ffb36b'));
    windows.position.set(0, 12, 0);
    maru.add(windows);
    // Roppongi: red/white lattice tower
    const ropp = mk();
    const lattice = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(1.5, 16, 180, 4, 12)), new THREE.LineBasicMaterial({ color: '#ff3d3d', toneMapped: false }));
    lattice.position.y = 90;
    ropp.add(lattice);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 5, 8), basic('#ffffff'));
    deck.position.y = 110;
    ropp.add(deck);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.5, 30, 6), basic('#ff3d3d'));
    tip.position.y = 195;
    ropp.add(tip);
    // Shibuya: cylinder tower + giant screen
    const shib = mk();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 60, 24), std('#202020', '#303030'));
    cyl.position.y = 30;
    shib.add(cyl);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(12.3, 12.3, 10, 24, 1, true), basic('#ffffff'));
    band.position.y = 50;
    band.name = 'screen';
    shib.add(band);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(36, 20), basic('#a6ff00'));
    screen.position.set(0, 40, 14);
    screen.name = 'screen';
    shib.add(screen);
    return { kabutocho: kabuto, otemachi: ote, marunouchi: maru, roppongi: ropp, shibuya: shib } as Record<string, THREE.Group>;
  }, []);
  useFrame(() => {
    const s = active();
    if (!s) return;
    const g = s.nextGate;
    const cur = DISTRICTS[s.district % DISTRICTS.length].id;
    for (const [id, grp] of Object.entries(groups)) {
      const show = id === cur && g;
      grp.visible = !!show;
      if (!show || !g) continue;
      // landmark sits beside the road just before the gate, a little off to one side
      const wz = g.z - 120;
      grp.position.set(id === 'roppongi' ? 70 : -55, 0, -(wz - s.z));
      grp.rotation.y = id === 'roppongi' ? 0 : Math.PI / 2;
      grp.traverse((o) => {
        if (o.name === 'spin') o.rotation.z = env.time * 0.4;
        if (o.name === 'screen') ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHSL((env.time * 0.1) % 1, 0.9, 0.55);
      });
    }
  });
  return (
    <group>
      {Object.entries(groups).map(([id, g]) => (
        <primitive key={id} object={g} />
      ))}
    </group>
  );
}

export function Districts() {
  const defs = useMemo<DecorDef[]>(() => {
    const D: DecorDef[] = [];
    // Kabutocho: red/white paper lanterns on posts along the road
    D.push({
      district: 'kabutocho', count: 30, gap: 14, color: '#ff4d4d', geo: new THREE.CylinderGeometry(0.45, 0.45, 0.9, 8),
      place: (d, k) => d.position.set(k % 2 ? 7.6 : -7.6, 3.2, 0),
    });
    // Otemachi: skybridges crossing high above the road
    D.push({
      district: 'otemachi', count: 6, gap: 70, color: '#ffc23d', geo: new THREE.BoxGeometry(34, 2.2, 5, 8, 1, 1), phase: 25,
      place: (d, k) => d.position.set(0, 18 + (k % 3) * 6, 0),
    });
    // Marunouchi: street trees (glowing cones) and an arched underpass section
    D.push({
      district: 'marunouchi', count: 36, gap: 11, color: '#3dff8b', geo: new THREE.ConeGeometry(1.6, 4.5, 6),
      place: (d, k) => d.position.set(k % 2 ? 8.6 : -8.6, 3.2, 0),
    });
    D.push({
      district: 'marunouchi', count: 18, gap: 13, color: '#ffb36b', geo: new THREE.TorusGeometry(8.4, 0.35, 6, 24, Math.PI), phase: 6,
      place: (d, k, wz) => {
        // the underpass covers a stretch of road (arches every 13 m), then opens up
        const inTunnel = Math.floor(wz / 260) % 2 === 0;
        d.position.set(0, 0, 0);
        d.scale.setScalar(inTunnel ? 1 : 0);
        void k;
      },
    });
    // Roppongi: tall purple light pillars
    D.push({
      district: 'roppongi', count: 20, gap: 22, color: '#b84dff', geo: new THREE.BoxGeometry(0.5, 40, 0.5), additive: true,
      place: (d, k) => d.position.set(k % 2 ? 14 : -14, 20, 0),
    });
    // Shibuya: scramble crossing stripes + giant facade screens
    D.push({
      district: 'shibuya', count: 40, gap: 9, color: '#5a6070', additive: true, geo: new THREE.PlaneGeometry(12.6, 1.4),
      place: (d, k, wz) => {
        const crossing = Math.floor(wz / 90) % 2 === 0 && k % 1 === 0;
        d.rotation.x = -Math.PI / 2;
        d.position.set(0, 0.04, 0);
        d.scale.set(crossing ? 1 : 0, 1, 1);
      },
    });
    D.push({
      district: 'shibuya', count: 12, gap: 36, color: '#a6ff00', geo: new THREE.PlaneGeometry(14, 8),
      place: (d, k) => {
        const side = k % 2 ? 1 : -1;
        d.position.set(side * 13.5, 12 + (k % 3) * 4, 0);
        d.rotation.y = -side * 1.1;
      },
    });
    return D;
  }, []);
  return (
    <group>
      {defs.map((def, i) => (
        <DecorInstances key={i} def={def} />
      ))}
      <Landmarks />
    </group>
  );
}


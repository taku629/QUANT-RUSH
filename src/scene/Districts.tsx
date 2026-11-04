import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DISTRICTS } from '../game/content';
import { active } from './active';
import { districtAtZ } from './City';
import { env } from './env';
import { landmarkZ, vhash } from './scenery';

/**
 * District street furniture + landmarks. Everything here is a background object:
 * no collision, nothing placed on the drivable road surface below 12 m within |x| < 9 m.
 */

// ---------------------------------------------------------------- decor families
type DecorDef = {
  district: string;
  count: number;
  gap: number;
  phase?: number;
  geo: THREE.BufferGeometry;
  color: string;
  additive?: boolean;
  opacity?: number;
  /** set position / rotation / scale for instance k at world z */
  place: (d: THREE.Object3D, k: number, wz: number, t: number) => void;
  /** animate colour (optional) */
  tint?: (c: THREE.Color, t: number) => void;
};

function DecorInstances({ def, density }: { def: DecorDef; density: number }) {
  const count = Math.max(4, Math.round(def.count * (density < 0.7 ? 0.7 : 1)));
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: def.color,
        toneMapped: false,
        transparent: !!def.additive || def.opacity !== undefined,
        opacity: def.opacity ?? (def.additive ? 0.55 : 1),
        blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: !def.additive,
      }),
    [def],
  );
  useFrame(() => {
    const s = active();
    if (!s || !ref.current) return;
    // skip the draw call (and the matrix work) when this family's district is neither here nor next
    const here = DISTRICTS[s.district % DISTRICTS.length].id;
    const next = DISTRICTS[(s.district + 1) % DISTRICTS.length].id;
    if (def.district !== here && def.district !== next) {
      ref.current.visible = false;
      return;
    }
    const base = Math.floor(s.z / def.gap) * def.gap + (def.phase ?? 0);
    let any = false;
    for (let k = 0; k < count; k++) {
      const wz = base + k * def.gap;
      const d = DISTRICTS[districtAtZ(s, wz) % DISTRICTS.length];
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      if (d.id !== def.district || wz < s.z - 20) dummy.scale.setScalar(0);
      else def.place(dummy, k, wz, env.time);
      if (dummy.scale.x !== 0) any = true;
      dummy.position.z = -(wz - s.z);
      dummy.updateMatrix();
      ref.current.setMatrixAt(k, dummy.matrix);
    }
    ref.current.visible = any;
    if (any) ref.current.instanceMatrix.needsUpdate = true;
    if (def.tint) def.tint(mat.color, env.time);
  });
  return <instancedMesh key={count} ref={ref} args={[def.geo, mat, count]} frustumCulled={false} />;
}

const side = (k: number) => (k % 2 ? 1 : -1);

export function decorDefs(): DecorDef[] {
  const D: DecorDef[] = [];
  // ── 兜町: lantern posts, stone curbs, LED ticker fence, vermilion street gates
  D.push({ district: 'kabutocho', count: 36, gap: 12, color: '#ff4a2a', geo: new THREE.CylinderGeometry(0.42, 0.42, 1.0, 8), place: (d, k) => d.position.set(side(k) * 7.9, 3.4, 0) });
  D.push({ district: 'kabutocho', count: 36, gap: 12, color: '#3a3026', geo: new THREE.BoxGeometry(0.16, 3, 0.16), place: (d, k) => d.position.set(side(k) * 7.9, 1.5, 0) });
  D.push({ district: 'kabutocho', count: 18, gap: 24, color: '#5a5248', geo: new THREE.BoxGeometry(0.9, 0.7, 24, 1, 1, 4), place: (d, k) => d.position.set(side(k) * 9.6, 0.35, 0) });
  D.push({ district: 'kabutocho', count: 18, gap: 24, color: '#00f0ff', geo: new THREE.BoxGeometry(0.08, 0.18, 22, 1, 1, 4), place: (d, k) => d.position.set(side(k) * 7.25, 1.0, 0), tint: (c, t) => c.setHSL(0.5 + Math.sin(t * 0.7) * 0.03, 1, 0.55) });
  // vermilion street gates (torii-like) — high and wide, pillars outside the road
  D.push({ district: 'kabutocho', count: 4, gap: 160, phase: 70, color: '#e8381c', geo: new THREE.BoxGeometry(0.9, 11, 0.9), place: (d, k) => d.position.set((k % 2 ? 1 : -1) * 9.4, 5.5, 0) });
  D.push({ district: 'kabutocho', count: 2, gap: 160, phase: 70, color: '#e8381c', geo: new THREE.BoxGeometry(23, 0.9, 1.2, 6, 1, 1), place: (d) => d.position.set(0, 11.2, 0) });
  D.push({ district: 'kabutocho', count: 2, gap: 160, phase: 70, color: '#1a1410', geo: new THREE.BoxGeometry(25, 0.6, 1.6, 6, 1, 1), place: (d) => d.position.set(0, 12.0, 0) });

  // ── 大手町: skybridges, elevated expressway in the background, glass canopies
  D.push({ district: 'otemachi', count: 6, gap: 70, phase: 25, color: '#ffc23d', geo: new THREE.BoxGeometry(36, 2.4, 5, 8, 1, 1), place: (d, k) => d.position.set(0, 22 + (k % 3) * 9, 0) });
  D.push({ district: 'otemachi', count: 6, gap: 70, phase: 25, color: '#9fd0ff', geo: new THREE.BoxGeometry(36, 0.25, 5.2, 8, 1, 1), place: (d, k) => d.position.set(0, 23.3 + (k % 3) * 9, 0) });
  D.push({ district: 'otemachi', count: 12, gap: 60, color: '#2a3a5a', geo: new THREE.BoxGeometry(5, 2.2, 60, 1, 1, 8), place: (d, k) => d.position.set(side(k) * 34, 15, 0) });
  D.push({ district: 'otemachi', count: 12, gap: 60, color: '#ffd27a', geo: new THREE.BoxGeometry(5.2, 0.2, 60, 1, 1, 8), place: (d, k) => d.position.set(side(k) * 34, 16.2, 0) });
  D.push({ district: 'otemachi', count: 12, gap: 60, color: '#1a2438', geo: new THREE.BoxGeometry(2, 15, 2), place: (d, k) => d.position.set(side(k) * 34, 7.5, 0) });
  D.push({ district: 'otemachi', count: 24, gap: 18, color: '#7fb4ff', opacity: 0.35, geo: new THREE.BoxGeometry(3.2, 0.12, 16), place: (d, k) => d.position.set(side(k) * 9.0, 4.6, 0) });

  // ── 丸の内: avenue trees, warm lamp posts, arched underpass, low hedges
  D.push({ district: 'marunouchi', count: 40, gap: 10, color: '#2a1a10', geo: new THREE.CylinderGeometry(0.22, 0.3, 3.4, 6), place: (d, k) => d.position.set(side(k) * 8.6, 1.7, 0) });
  D.push({ district: 'marunouchi', count: 40, gap: 10, color: '#3dd68b', geo: new THREE.IcosahedronGeometry(2.1, 1), place: (d, k, wz) => { d.position.set(side(k) * 8.6, 4.6, 0); d.scale.set(1, 1.15 + vhash(wz) * 0.2, 1); }, tint: (c) => c.set('#36b874') });
  D.push({ district: 'marunouchi', count: 20, gap: 20, phase: 5, color: '#ffcf8a', geo: new THREE.SphereGeometry(0.38, 10, 8), place: (d, k) => d.position.set(side(k) * 7.4, 4.3, 0) });
  D.push({ district: 'marunouchi', count: 20, gap: 20, phase: 5, color: '#1a120c', geo: new THREE.BoxGeometry(0.12, 4.2, 0.12), place: (d, k) => d.position.set(side(k) * 7.4, 2.1, 0) });
  D.push({ district: 'marunouchi', count: 18, gap: 13, phase: 6, color: '#ffb36b', geo: new THREE.TorusGeometry(8.6, 0.38, 6, 28, Math.PI), place: (d, _k, wz) => { d.scale.setScalar(Math.floor(wz / 260) % 2 === 0 ? 1 : 0); } });
  D.push({ district: 'marunouchi', count: 18, gap: 24, color: '#1f4a2a', geo: new THREE.BoxGeometry(0.9, 0.9, 22, 1, 1, 4), place: (d, k) => d.position.set(side(k) * 10.2, 0.45, 0) });

  // ── 六本木: light pillars, elevated interchange ramps, sweeping searchlights
  D.push({ district: 'roppongi', count: 20, gap: 22, color: '#b84dff', additive: true, geo: new THREE.BoxGeometry(0.5, 40, 0.5), place: (d, k) => d.position.set(side(k) * 14, 20, 0) });
  // elevated interchange ramps far beyond the street wall (thin, lit edges — background only)
  D.push({ district: 'roppongi', count: 8, gap: 90, phase: 40, color: '#5a3a7a', geo: new THREE.TorusGeometry(40, 0.8, 4, 40, Math.PI * 0.55), place: (d, k) => { d.position.set(side(k) * 66, 11, 0); d.rotation.set(Math.PI / 2, 0, side(k) * 0.5); } });
  D.push({ district: 'roppongi', count: 8, gap: 90, phase: 40, color: '#ff4dd2', geo: new THREE.TorusGeometry(40, 0.22, 4, 40, Math.PI * 0.55), place: (d, k) => { d.position.set(side(k) * 66, 12, 0); d.rotation.set(Math.PI / 2, 0, side(k) * 0.5); } });
  D.push({ district: 'roppongi', count: 6, gap: 80, phase: 10, color: '#d8b8ff', additive: true, opacity: 0.12, geo: new THREE.ConeGeometry(5, 120, 12, 1, true), place: (d, k, _wz, t) => { d.position.set(side(k) * 40, 60, 0); d.rotation.set(Math.sin(t * 0.6 + k) * 0.5, 0, side(k) * (0.3 + Math.sin(t * 0.45 + k * 1.7) * 0.25) + Math.PI); } });

  // ── 渋谷: scramble crossing stripes, giant facade screens, street kiosks, hanging banners
  D.push({ district: 'shibuya', count: 40, gap: 9, color: '#5a6070', additive: true, geo: new THREE.PlaneGeometry(12.6, 1.4), place: (d, _k, wz) => { d.rotation.x = -Math.PI / 2; d.position.set(0, 0.04, 0); d.scale.set(Math.floor(wz / 90) % 2 === 0 ? 1 : 0, 1, 1); } });
  D.push({ district: 'shibuya', count: 16, gap: 30, color: '#a6ff00', geo: new THREE.PlaneGeometry(16, 9), place: (d, k) => { d.position.set(side(k) * 13.5, 13 + (k % 3) * 5, 0); d.rotation.y = -side(k) * 1.1; }, tint: (c, t) => c.setHSL((t * 0.08) % 1, 0.95, 0.55) });
  // street kiosks: dark bodies with a thin lit sign band, set back from the road edge so they never read as obstacles
  D.push({ district: 'shibuya', count: 30, gap: 11, color: '#1c1824', geo: new THREE.BoxGeometry(1.4, 2.2, 3), place: (d, k) => d.position.set(side(k) * 10.0, 1.1, 0) });
  D.push({ district: 'shibuya', count: 30, gap: 11, color: '#ff3d8b', geo: new THREE.BoxGeometry(1.5, 0.35, 3.1), place: (d, k) => d.position.set(side(k) * 10.0, 2.35, 0), tint: (c, t) => c.setHSL((0.92 + t * 0.05) % 1, 0.9, 0.55) });
  D.push({ district: 'shibuya', count: 20, gap: 16, phase: 8, color: '#ffd23d', geo: new THREE.PlaneGeometry(1.2, 4), place: (d, k) => { d.position.set(side(k) * 9.2, 7, 0); d.rotation.y = Math.PI / 2; } });
  return D;
}

// ---------------------------------------------------------------- landmarks

type LandmarkPart = { mesh: THREE.Object3D; base: THREE.Color; mat: THREE.MeshBasicMaterial | THREE.LineBasicMaterial };

function mk() {
  const group = new THREE.Group();
  const parts: LandmarkPart[] = [];
  const add = (geo: THREE.BufferGeometry, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], opts: { lines?: boolean; wire?: boolean; name?: string } = {}) => {
    const mat = opts.lines ? new THREE.LineBasicMaterial({ color, toneMapped: false, fog: false }) : new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false, wireframe: !!opts.wire });
    const mesh = opts.lines ? new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat) : new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    if (opts.name) mesh.name = opts.name;
    group.add(mesh);
    parts.push({ mesh, base: new THREE.Color(color), mat });
    return mesh;
  };
  return { group, parts, add };
}

/**
 * Landmarks straddle the road (the road passes through / under them) so they sit in the camera's view
 * corridor, emerge from the haze far away and tower over you as you pass. Openings keep |x| < 10 m clear up to 12 m+.
 */
export function buildLandmarks() {
  const out: Record<string, ReturnType<typeof mk>> = {};
  // 兜町 — EXCHANGE HALL: classical colonnade gate + floating ticker ring
  {
    const L = mk();
    for (const sx of [-1, 1]) {
      L.add(new THREE.BoxGeometry(18, 20, 16), '#5a5650', [sx * 21, 10, 0]);
      for (let c = 0; c < 4; c++) L.add(new THREE.CylinderGeometry(0.8, 0.9, 16, 10), '#e8e0cc', [sx * (13.5 + c * 4.6), 8, 8.6]);
      L.add(new THREE.BoxGeometry(18.5, 1.2, 17), '#ffd9a0', [sx * 21, 20.4, 0]);
    }
    L.add(new THREE.BoxGeometry(60, 3.2, 14, 12, 1, 1), '#6a645a', [0, 21.5, 0]);
    // pediment: a triangle sitting on the entablature (apex up — never reaches down into the road)
    const tri = new THREE.Shape();
    tri.moveTo(-31, 0);
    tri.lineTo(31, 0);
    tri.lineTo(0, 9);
    tri.lineTo(-31, 0);
    const ped = new THREE.ExtrudeGeometry(tri, { depth: 12, bevelEnabled: false });
    ped.translate(0, 0, -6);
    L.add(ped, '#7a7468', [0, 23.1, 0]);
    L.add(new THREE.TorusGeometry(15, 0.9, 8, 64), '#00f0ff', [0, 42, 0], [Math.PI / 2, 0, 0], { name: 'spin' });
    L.add(new THREE.TorusGeometry(15.4, 0.25, 6, 64), '#ffd23d', [0, 40.4, 0], [Math.PI / 2, 0, 0], { name: 'spin' });
    L.add(new THREE.CylinderGeometry(15.2, 15.2, 3.2, 48, 1, true), '#0a3a4a', [0, 41.2, 0], [0, 0, 0], { name: 'ticker' });
    out.kabutocho = L;
  }
  // 大手町 — TWIN TOWERS with sky bridge; the road runs between them
  {
    const L = mk();
    for (const sx of [-1, 1]) {
      L.add(new THREE.BoxGeometry(18, 200, 18), '#1d3c78', [sx * 23, 100, 0]);
      L.add(new THREE.BoxGeometry(18, 200, 18), '#ffc23d', [sx * 23, 100, 0], [0, 0, 0], { lines: true });
      L.add(new THREE.BoxGeometry(12, 30, 12), '#163060', [sx * 23, 215, 0]);
      L.add(new THREE.CylinderGeometry(0.4, 0.4, 30, 6), '#ff3d3d', [sx * 23, 245, 0], [0, 0, 0], { name: 'beacon' });
      for (let f = 0; f < 18; f++) L.add(new THREE.BoxGeometry(18.4, 0.8, 18.4), '#cfe2ff', [sx * 23, 10 + f * 10.5, 0]);
      L.add(new THREE.BoxGeometry(1.2, 200, 18.6), '#ffc23d', [sx * 23 - sx * 9.1, 100, 0]);
    }
    L.add(new THREE.BoxGeometry(30, 7, 9, 6, 1, 1), '#ffc23d', [0, 120, 0]);
    L.add(new THREE.BoxGeometry(30, 3, 9, 6, 1, 1), '#ffc23d', [0, 60, 0]);
    out.otemachi = L;
  }
  // 丸の内 — STATION: red-brick wings with domes and a central arch the road passes through
  {
    const L = mk();
    for (const sx of [-1, 1]) {
      L.add(new THREE.BoxGeometry(70, 18, 16), '#9a4630', [sx * 47, 9, 0]);
      L.add(new THREE.BoxGeometry(70.5, 1.2, 16.5), '#f0e2c8', [sx * 47, 12, 0]);
      L.add(new THREE.BoxGeometry(70.5, 1.0, 16.5), '#ffb36b', [sx * 47, 5.5, 0]);
      L.add(new THREE.BoxGeometry(14, 26, 18), '#a8503a', [sx * 19, 13, 0]);
      L.add(new THREE.SphereGeometry(8.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#2a4a3a', [sx * 19, 26, 0]);
      L.add(new THREE.ConeGeometry(0.6, 6, 6), '#ffd27a', [sx * 19, 37, 0]);
    }
    L.add(new THREE.TorusGeometry(13, 1.6, 8, 32, Math.PI), '#f0e2c8', [0, 8, 7.8]);
    L.add(new THREE.BoxGeometry(26, 6, 16, 6, 1, 1), '#9a4630', [0, 23, 0]);
    L.add(new THREE.BoxGeometry(26.5, 1.0, 16.5, 6, 1, 1), '#f0e2c8', [0, 20.2, 0]);
    out.marunouchi = L;
  }
  // 六本木 — LATTICE TOWER: four legs straddle the road, observation deck, red/white bands
  {
    const L = mk();
    // wireframe = triangulated lattice bracing; base sits 1 m below the road so no line crosses the lanes
    L.add(new THREE.CylinderGeometry(1.5, 22, 150, 4, 10, true), '#ff3d3d', [0, 74, 0], [0, Math.PI / 4, 0], { wire: true });
    L.add(new THREE.CylinderGeometry(1.0, 1.5, 70, 4, 6, true), '#ffffff', [0, 184, 0], [0, Math.PI / 4, 0], { wire: true });
    L.add(new THREE.CylinderGeometry(9, 9, 5, 8), '#ffffff', [0, 95, 0]);
    L.add(new THREE.CylinderGeometry(9.3, 9.3, 1.2, 8), '#ff4dd2', [0, 97.8, 0]);
    L.add(new THREE.CylinderGeometry(5, 5, 4, 8), '#ffffff', [0, 150, 0]);
    L.add(new THREE.ConeGeometry(1.2, 30, 6), '#ff3d3d', [0, 235, 0], [0, 0, 0], { name: 'beacon' });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.add(new THREE.BoxGeometry(3, 2, 3), '#ff3d3d', [x * 15.5, 1, z * 15.5]);
    out.roppongi = L;
  }
  // 渋谷 — SCRAMBLE GATE: a giant LED bridge-screen over the crossing + cylinder tower
  {
    const L = mk();
    L.add(new THREE.BoxGeometry(62, 20, 2, 10, 1, 1), '#a6ff00', [0, 25, 0], [0, 0, 0], { name: 'screen' });
    L.add(new THREE.BoxGeometry(64, 1.4, 2.8, 10, 1, 1), '#ffffff', [0, 14.4, 0]);
    L.add(new THREE.BoxGeometry(64, 1.4, 2.8, 10, 1, 1), '#ffffff', [0, 35.6, 0]);
    for (const sx of [-1, 1]) L.add(new THREE.BoxGeometry(3, 36, 3), '#ffffff', [sx * 31.5, 18, 0]);
    for (let k = 0; k < 6; k++) L.add(new THREE.BoxGeometry(9, 2.2, 2.2), ['#ff3d8b', '#ffd23d', '#3dffcf', '#ff8a00', '#7a5cff', '#00d0ff'][k], [-26 + k * 10.4, 38.6, 0]);
    L.add(new THREE.CylinderGeometry(11, 11, 64, 28), '#26262e', [-38, 32, -20]);
    L.add(new THREE.CylinderGeometry(11.3, 11.3, 12, 28, 1, true), '#ff8a00', [-38, 52, -20], [0, 0, 0], { name: 'screen' });
    L.add(new THREE.BoxGeometry(18, 24, 2), '#00d0ff', [34, 30, -14], [0, -0.5, 0], { name: 'screen' });
    out.shibuya = L;
  }
  return out;
}

function Landmarks() {
  const lms = useMemo(() => buildLandmarks(), []);
  const fogCol = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const s = active();
    if (!s) return;
    const cur = DISTRICTS[s.district % DISTRICTS.length].id;
    const z = landmarkZ(s);
    for (const [id, L] of Object.entries(lms)) {
      const show = id === cur && z !== null && z - s.z > -60;
      L.group.visible = show;
      if (!show || z === null) continue;
      const dist = z - s.z;
      L.group.position.set(0, 0, -dist);
      // emerge from the haze: far → silhouette tinted toward the fog, near → full colour
      const haze = Math.min(0.88, Math.max(0, (dist - 120) / 650));
      fogCol.copy(env.fog);
      for (const p of L.parts) {
        p.mat.color.copy(p.base).lerp(fogCol, haze);
        if (p.mesh.name === 'spin') p.mesh.rotation.z = env.time * 0.35;
        if (p.mesh.name === 'beacon' && Math.floor(env.time * 2) % 2 === 0) p.mat.color.set('#ffffff');
        if (p.mesh.name === 'screen') p.mat.color.setHSL((env.time * 0.08 + p.mesh.position.x * 0.01) % 1, 0.9, 0.55 * (1 - haze * 0.6));
        if (p.mesh.name === 'ticker') p.mesh.rotation.y = -env.time * 0.4;
      }
    }
  });
  return (
    <group>
      {Object.entries(lms).map(([id, L]) => (
        <primitive key={id} object={L.group} />
      ))}
    </group>
  );
}

export function Districts({ density }: { density: number }) {
  const defs = useMemo(() => decorDefs(), []);
  return (
    <group>
      {defs.map((def, i) => (
        <DecorInstances key={i} def={def} density={density} />
      ))}
      <Landmarks />
    </group>
  );
}

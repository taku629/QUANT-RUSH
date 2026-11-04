import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLandmarks, decorDefs } from './Districts';
import { SCENERY } from './scenery';
import { DISTRICTS } from '../game/content';

/** every world-space vertex of an object tree */
function vertices(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const out: THREE.Vector3[] = [];
  root.traverse((o) => {
    const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!geo) return;
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  return out;
}

describe('scenery never intrudes on the playfield', () => {
  it('landmarks keep the road corridor clear (|x| < 9 m below 12 m)', () => {
    const lms = buildLandmarks();
    expect(Object.keys(lms).sort()).toEqual(DISTRICTS.map((d) => d.id).sort());
    for (const [id, L] of Object.entries(lms)) {
      const bad = vertices(L.group).filter((v) => Math.abs(v.x) < 9 && v.y > -0.5 && v.y < 12);
      expect(bad.length, `${id} has ${bad.length} vertices inside the road corridor`).toBe(0);
    }
  });

  it('street decor stays off the driven lanes (|x| < 6.5 m) below 5 m, except flat road markings', () => {
    const d = new THREE.Object3D();
    for (const def of decorDefs()) {
      for (let k = 0; k < 6; k++) {
        d.position.set(0, 0, 0);
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        def.place(d, k, 37 + k * def.gap, 1.3);
        d.updateMatrixWorld(true);
        if (d.scale.x === 0) continue;
        const mesh = new THREE.Mesh(def.geo);
        mesh.applyMatrix4(d.matrixWorld);
        const verts = vertices(mesh);
        const flatMarking = verts.every((v) => v.y < 0.1);
        if (flatMarking) continue; // e.g. Shibuya crossing stripes painted on the road
        // v2's Marunouchi underpass arches already spanned the road; they rise from the road edge
        if (def.district === 'marunouchi' && def.geo.type === 'TorusGeometry') continue;
        const bad = verts.filter((v) => Math.abs(v.x) < 6.5 && v.y > 0.1 && v.y < 5);
        expect(bad.length, `${def.district} decor intrudes on the lanes`).toBe(0);
      }
    }
  });

  it('every district has its own scenery profile (silhouette, facade, skyline, paving, signs)', () => {
    expect(SCENERY.map((p) => p.id)).toEqual(DISTRICTS.map((d) => d.id));
    for (const key of ['facade', 'crown', 'skyline', 'paving', 'signStyle'] as const) expect(new Set(SCENERY.map((p) => p[key])).size).toBe(5);
    // height character: 兜町 low, 大手町 / 六本木 towering
    const hMax = Object.fromEntries(SCENERY.map((p) => [p.id, p.hMax]));
    expect(hMax.kabutocho).toBeLessThan(30);
    expect(hMax.otemachi).toBeGreaterThan(100);
    expect(hMax.roppongi).toBeGreaterThan(100);
  });
});

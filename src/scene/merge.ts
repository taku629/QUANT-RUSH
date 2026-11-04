/**
 * Static-mesh merging: bakes a group's child meshes into one mesh per material class
 * (lit / unlit / wireframe), with each part's colour stored as a vertex colour.
 * N parts → 1–3 draw calls. Originals are hidden (not removed) so React keeps owning them.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Kind = 'lit' | 'unlit' | 'wire';

export type MergeOptions = {
  /** meshes with these names are left alone (animated parts) */
  keep?: (o: THREE.Object3D) => boolean;
  /** extra setup for the created materials (e.g. haze uniforms) */
  material?: (kind: Kind) => THREE.Material;
};

function kindOf(m: THREE.Material): Kind {
  if ((m as THREE.MeshBasicMaterial).wireframe) return 'wire';
  return (m as THREE.MeshStandardMaterial).isMeshStandardMaterial ? 'lit' : 'unlit';
}

export function mergeStatic(root: THREE.Object3D, opts: MergeOptions = {}): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets: Record<Kind, THREE.BufferGeometry[]> = { lit: [], unlit: [], wire: [] };
  const emissive: THREE.Color[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.merged) return;
    if (opts.keep?.(mesh)) return;
    let p: THREE.Object3D | null = mesh.parent;
    while (p && p !== root) {
      if (opts.keep?.(p)) return;
      p = p.parent;
    }
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (Array.isArray(mat) || (mat as THREE.Material).transparent) return; // keep transparent parts as they are
    const k = kindOf(mat);
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    const col = mat.color ?? new THREE.Color(1, 1, 1);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    buckets[k].push(g);
    if (k === 'lit' && mat.emissive) emissive.push(mat.emissive);
    mesh.visible = false;
  });
  const out: THREE.Mesh[] = [];
  for (const k of ['lit', 'unlit', 'wire'] as Kind[]) {
    if (!buckets[k].length) continue;
    const geo = mergeGeometries(buckets[k], false);
    if (!geo) continue;
    let mat: THREE.Material;
    if (opts.material) mat = opts.material(k);
    else if (k === 'lit') {
      const e = emissive.length ? emissive[0] : new THREE.Color(0, 0, 0);
      mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.35, emissive: e });
    } else mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, wireframe: k === 'wire' });
    const m = new THREE.Mesh(geo, mat);
    m.userData.merged = true;
    m.frustumCulled = false;
    root.add(m);
    out.push(m);
  }
  return out;
}

export function unmerge(root: THREE.Object3D, merged: THREE.Mesh[]) {
  for (const m of merged) {
    root.remove(m);
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.merged && !o.userData.keepHidden) o.visible = true;
  });
}

/** basic vertex-coloured material that blends toward a fog colour by `uHaze` (landmarks fading in from afar) */
export function makeHazeMaterial(kind: Kind, haze: { value: number }, fog: { value: THREE.Color }): THREE.Material {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, wireframe: kind === 'wire' });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHaze = haze;
    shader.uniforms.uHazeFog = fog;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHaze;\nuniform vec3 uHazeFog;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeFog, uHaze);');
  };
  m.customProgramCacheKey = () => 'haze-' + kind;
  return m;
}

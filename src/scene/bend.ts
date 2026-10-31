/**
 * "Curved world" vertex bending: every world material is offset in view space by depth²,
 * so the straight logical track reads as curves and hills on screen while gameplay stays fair.
 */
import * as THREE from 'three';

export const bendUniform = { value: new THREE.Vector2(0, 0) };

const BEND_CHUNK = `#include <project_vertex>
  {
    float bd = max(0.0, -mvPosition.z);
    mvPosition.x += uBend.x * bd * bd;
    mvPosition.y += uBend.y * bd * bd;
    gl_Position = projectionMatrix * mvPosition;
  }`;

export function bendMaterial(m: THREE.Material) {
  if (m.userData.bent || m.userData.noBend) return;
  m.userData.bent = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    if (!shader.vertexShader.includes('#include <project_vertex>')) return;
    shader.uniforms.uBend = bendUniform;
    shader.vertexShader = 'uniform vec2 uBend;\n' + shader.vertexShader.replace('#include <project_vertex>', BEND_CHUNK);
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (key ? key() : '') + '|bend';
  m.needsUpdate = true;
}

export function bendScene(root: THREE.Object3D) {
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach(bendMaterial);
    else bendMaterial(mat);
  });
}

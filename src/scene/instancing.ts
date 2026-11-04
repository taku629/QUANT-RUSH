/**
 * InstanceBatch: per-frame "begin → add → end" helper around an InstancedMesh.
 * Only the instances added this frame are drawn (mesh.count), so a whole family of objects costs
 * one draw call however many are on screen. No allocation per frame.
 */
import * as THREE from 'three';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

export class InstanceBatch {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private colored: boolean;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number, colored = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.colored = colored;
    if (colored) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  begin() {
    this.n = 0;
  }

  /** add an instance from a ready matrix */
  addMatrix(m: THREE.Matrix4, color?: THREE.Color | string | number) {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.mesh.setMatrixAt(this.n, m);
    if (this.colored && color !== undefined) this.mesh.setColorAt(this.n, color instanceof THREE.Color ? color : tmpC.set(color));
    this.n++;
  }

  /** add an instance as parent × (translate · rotate · scale) */
  add(parent: THREE.Matrix4 | null, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, color?: THREE.Color | string | number) {
    tmpP.set(x, y, z);
    tmpS.set(sx, sy, sz);
    tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
    tmpM.compose(tmpP, tmpQ, tmpS);
    if (parent) tmpM.premultiply(parent);
    this.addMatrix(tmpM, color);
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.colored && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

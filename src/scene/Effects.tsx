import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fx } from '../game/fx';
import { env } from './env';
import { active } from './active';

const MAX_P = 900;

/** CPU particle system (additive points) fed by fx.bursts. */
export function Particles() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_P), 1));
    return g;
  }, []);
  const vel = useMemo(() => new Float32Array(MAX_P * 3), []);
  const life = useMemo(() => new Float32Array(MAX_P), []);
  const maxLife = useMemo(() => new Float32Array(MAX_P).fill(1), []);
  const cursor = useRef(0);
  const c = useMemo(() => new THREE.Color(), []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        uniforms: { scale: { value: 300 } },
        vertexShader: `attribute float size; varying vec3 vColor; varying float vA; uniform float scale;
          void main(){ vColor = color; vA = size; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vColor; varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor * 2.0 * a, a); }`,
      }),
    [],
  );
  useFrame((_, dt) => {
    const pos = geo.attributes.position.array as Float32Array;
    const col = geo.attributes.color.array as Float32Array;
    const size = geo.attributes.size.array as Float32Array;
    while (fx.bursts.length) {
      const b = fx.bursts.shift()!;
      c.set(b.color);
      for (let k = 0; k < b.count; k++) {
        const i = cursor.current;
        cursor.current = (cursor.current + 1) % MAX_P;
        pos[i * 3] = b.x;
        pos[i * 3 + 1] = b.y;
        pos[i * 3 + 2] = b.z;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const sp = b.speed * (0.4 + Math.random() * 0.8);
        vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
        vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp * 0.8;
        vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
        life[i] = maxLife[i] = b.life * (0.6 + Math.random() * 0.6);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
    }
    const s = active();
    const drift = s ? s.speed * dt * 0.6 : 0;
    for (let i = 0; i < MAX_P; i++) {
      if (life[i] <= 0) {
        size[i] = 0;
        continue;
      }
      life[i] -= dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt + drift;
      vel[i * 3 + 1] -= 9 * dt;
      size[i] = 0.35 * Math.max(0, life[i] / maxLife[i]);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

const LINES = 90;

/** Streaks rushing past the camera — density grows with speed / ALPHA DRIVE. */
export function SpeedLines() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const data = useMemo(
    () =>
      Array.from({ length: LINES }, () => {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 10;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.6 + 3, z: -Math.random() * 120, len: 2 + Math.random() * 6 };
      }),
    [],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    const s = active();
    if (!s || !ref.current) return;
    const v = s.speed * (s.alpha > 0 ? 2.2 : 1.4);
    const visibleFrac = Math.min(1, Math.max(0, (s.speed - 30) / 30) + (s.alpha > 0 ? 0.6 : 0) + fx.fovKick * 0.03);
    data.forEach((d, i) => {
      d.z += v * dt;
      if (d.z > 10) {
        d.z -= 130;
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 10;
        d.x = Math.cos(a) * r;
        d.y = Math.sin(a) * r * 0.6 + 3;
      }
      const show = i / LINES < visibleFrac;
      dummy.position.set(camera.position.x + d.x, Math.max(0.3, d.y), d.z);
      dummy.scale.set(show ? 1 : 0, show ? 1 : 0, d.len * (1 + v / 60));
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.color.copy(s.alpha > 0 ? new THREE.Color('#ffd23d') : env.primary).multiplyScalar(1.4);
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, LINES]} frustumCulled={false}>
      <boxGeometry args={[0.03, 0.03, 1]} />
      <meshBasicMaterial transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

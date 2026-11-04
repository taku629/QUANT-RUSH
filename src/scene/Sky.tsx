import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fx } from '../game/fx';
import { env } from './env';
import { active } from './active';

/** Gradient sky dome, stars, a giant holographic price chart (past prices only) and lightning. */
export function Sky() {
  const dome = useRef<THREE.Mesh>(null);
  const { scene } = useThree();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, flash: { value: 0 }, t: { value: 0 } },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform float flash; uniform float t; varying vec3 vP;
          void main(){ float h = clamp(vP.y, -0.1, 1.0);
            vec3 c = mix(horizon, top, pow(smoothstep(-0.02, 0.55, h), 0.6));
            float band = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.08, 0.3, h));
            c += horizon * band * 0.6;
            c += vec3(0.7,0.75,1.0) * flash * (0.4 + 0.6 * h);
            gl_FragColor = vec4(c, 1.0); }`,
      }),
    [],
  );
  const stars = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 700;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const y = 0.15 + Math.random() * 0.85;
      const r = Math.sqrt(1 - y * y);
      p[i * 3] = Math.cos(th) * r * 800;
      p[i * 3 + 1] = y * 800;
      p[i * 3 + 2] = Math.sin(th) * r * 800;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, []);

  // price chart line
  const CH = 160;
  const chartGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CH * 3), 3));
    return g;
  }, []);
  const chartFill = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CH * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < CH - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    return g;
  }, []);
  const chartLine = useMemo(() => new THREE.Line(chartGeo, new THREE.LineBasicMaterial({ toneMapped: false, fog: false, userData: { noBend: true } })), [chartGeo]);
  const fillMat = useRef<THREE.MeshBasicMaterial>(null);
  const chart = useRef<THREE.Group>(null);
  const bolt = useRef<THREE.Mesh>(null);
  const nextBolt = useRef(2);

  useFrame(({ camera }, dt) => {
    if (dome.current) dome.current.position.copy(camera.position);
    mat.uniforms.top.value.copy(env.skyTop);
    mat.uniforms.horizon.value.copy(env.skyHorizon);
    mat.uniforms.flash.value = fx.lightning * 0.9;
    if (scene.fog) {
      const f = scene.fog as THREE.Fog;
      f.color.copy(env.fog);
      f.near = env.fogNear;
      f.far = env.fogFar;
    }
    const s = active();
    if (!s) return;
    // lightning in volatile/crash markets
    if (env.danger > 0.35) {
      nextBolt.current -= dt;
      if (nextBolt.current <= 0) {
        nextBolt.current = 1.5 + Math.random() * 3;
        fx.lightning = 0.8;
      }
    }
    if (bolt.current) {
      bolt.current.visible = fx.lightning > 0.4;
      bolt.current.position.x = Math.sin(env.time * 3.1) * 120;
    }
    // chart of the last ~20 s of mid prices (past data only)
    const e = s.engine;
    const pos = chartGeo.attributes.position.array as Float32Array;
    const fpos = chartFill.attributes.position.array as Float32Array;
    const end = e.tick;
    const step = 3;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < CH; i++) {
      const t = Math.max(0, end - (CH - 1 - i) * step);
      const m = e.tape.mid[t];
      lo = Math.min(lo, m);
      hi = Math.max(hi, m);
    }
    const range = Math.max(0.6, hi - lo);
    for (let i = 0; i < CH; i++) {
      const t = Math.max(0, end - (CH - 1 - i) * step);
      const m = e.tape.mid[t];
      const x = -260 + (i / (CH - 1)) * 520;
      const y = 60 + ((m - lo) / range) * 110;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = 0;
      fpos[i * 6] = x;
      fpos[i * 6 + 1] = y;
      fpos[i * 6 + 2] = 0;
      fpos[i * 6 + 3] = x;
      fpos[i * 6 + 4] = 40;
      fpos[i * 6 + 5] = 0;
    }
    chartGeo.attributes.position.needsUpdate = true;
    chartFill.attributes.position.needsUpdate = true;
    if (chart.current) chart.current.position.set(camera.position.x * 0.8, 0, -620);
    (chartLine.material as THREE.LineBasicMaterial).color.copy(env.regimeColor).multiplyScalar(2);
    if (fillMat.current) fillMat.current.color.copy(env.regimeColor);
  });
  return (
    <group>
      <mesh ref={dome} material={mat} renderOrder={-10}>
        <sphereGeometry args={[900, 32, 16]} />
      </mesh>
      <points geometry={stars}>
        <pointsMaterial color="#9fb4ff" size={1.6} sizeAttenuation={false} transparent opacity={0.8} fog={false} userData={{ noBend: true }} />
      </points>
      <group ref={chart}>
        <primitive object={chartLine} />
        <mesh geometry={chartFill}>
          <meshBasicMaterial ref={fillMat} userData={{ noBend: true }} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={bolt} position={[0, 150, -500]} visible={false}>
        <boxGeometry args={[2, 260, 2]} />
        <meshBasicMaterial color="#e0e6ff" toneMapped={false} fog={false} userData={{ noBend: true }} />
      </mesh>
    </group>
  );
}

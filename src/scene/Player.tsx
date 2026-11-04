import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { mergeStatic, unmerge } from './merge';
import * as THREE from 'three';
import { LANE_COLORS, VEHICLES, type VehicleId } from '../game/content';
import { LANES } from '../sim/config';
import { glowTexture, streakTexture } from './textures';
import { env } from './env';
import { active } from './active';

const GOLD = new THREE.Color('#ffd23d');

function Rider({ color }: { color: string }) {
  return (
    <group position={[0, 0.25, 0]}>
      <mesh position={[0, 0.95, 0.05]} rotation-x={0.25}>
        <capsuleGeometry args={[0.28, 0.6, 4, 10]} />
        <meshStandardMaterial color="#3a3f78" emissive="#1a1d48" metalness={0.5} roughness={0.35} />
      </mesh>
      {/* glowing suit lines */}
      <mesh position={[0, 0.98, -0.21]} rotation-x={0.25}>
        <boxGeometry args={[0.06, 0.7, 0.04]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.62, -0.05]}>
        <sphereGeometry args={[0.24, 16, 12]} />
        <meshStandardMaterial color="#4a4f90" emissive="#202450" metalness={0.7} roughness={0.2} />
      </mesh>
      {/* visor */}
      <mesh position={[0, 1.64, -0.22]}>
        <boxGeometry args={[0.34, 0.09, 0.08]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {/* legs */}
      {[-0.17, 0.17].map((x) => (
        <mesh key={x} position={[x, 0.35, x * 0.8]} rotation-x={x > 0 ? 0.35 : -0.2}>
          <capsuleGeometry args={[0.11, 0.45, 4, 8]} />
          <meshStandardMaterial color="#30345e" emissive="#14163a" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* arms */}
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} position={[x, 1.05, 0.05]} rotation-z={x > 0 ? -0.5 : 0.5}>
          <capsuleGeometry args={[0.08, 0.45, 4, 8]} />
          <meshStandardMaterial color="#3a3f78" emissive="#1a1d48" metalness={0.5} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

function Board({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.9, 0.12, 2.2]} />
        <meshStandardMaterial color="#0d0d1d" metalness={0.9} roughness={0.25} />
      </mesh>
      {[-0.46, 0.46].map((x) => (
        <mesh key={x} position={[x, 0.2, 0]}>
          <boxGeometry args={[0.05, 0.14, 2.2]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
      {[-0.75, 0.75].map((z) => (
        <mesh key={z} position={[0, 0.08, z]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.28, 0.06, 8, 20]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Bike({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.55, 0.5, 2.3]} />
        <meshStandardMaterial color="#120d1d" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.85, -0.7]} rotation-x={-0.4}>
        <boxGeometry args={[0.5, 0.3, 0.8]} />
        <meshStandardMaterial color="#1a1030" metalness={0.9} roughness={0.2} />
      </mesh>
      {[-1.0, 1.0].map((z) => (
        <mesh key={z} position={[0, 0.42, z]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[0.4, 0.09, 10, 24]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[0.6, 0.06, 2.0]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Pod({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} scale={[1, 0.7, 1.6]}>
        <sphereGeometry args={[0.8, 20, 14]} />
        <meshStandardMaterial color="#0e1a12" metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.55, 0]} rotation-x={Math.PI / 2} scale={[1, 1.6, 1]}>
        <torusGeometry args={[0.82, 0.05, 8, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.82, -0.75]}>
        <boxGeometry args={[0.7, 0.18, 0.1]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Player({ vehicle, showRider }: { vehicle: VehicleId; showRider: boolean }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const aura = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const streaks = useRef<THREE.Mesh[]>([]);
  const ringRadius = useRef(1.6);
  const v = VEHICLES[vehicle];
  const glowTex = useMemo(() => glowTexture(), []);
  const streakTex = useMemo(() => streakTexture(), []);
  const ringColor = useMemo(() => new THREE.Color(), []);
  // v3 RISK ring: an arc around the vehicle that fills 0→100 % (green → amber → red)
  const riskMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uFill: { value: 0 }, uColor: { value: new THREE.Color('#3dff8b') }, uPulse: { value: 0 } },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uFill; uniform vec3 uColor; uniform float uPulse; varying vec2 vP;
          void main(){
            float a = atan(vP.x, vP.y) / 6.2831853 + 0.5; // 0..1 around the ring, starting at the front
            float on = step(a, uFill);
            vec3 c = mix(vec3(0.12), uColor * (1.4 + uPulse), on);
            gl_FragColor = vec4(c, mix(0.25, 0.95, on));
          }`,
      }),
    [],
  );
  const riskRing = useRef<THREE.Mesh>(null);
  const GREEN = useMemo(() => new THREE.Color('#3dff8b'), []);
  const AMBER = useMemo(() => new THREE.Color('#ffb03d'), []);
  const REDC = useMemo(() => new THREE.Color('#ff2a4d'), []);

  // bake the vehicle + rider parts into 1–2 meshes (≈20 draw calls → 2)
  useLayoutEffect(() => {
    const g = body.current;
    if (!g) return;
    const merged = mergeStatic(g);
    return () => unmerge(g, merged);
  }, [vehicle, showRider]);

  useFrame((_, dt) => {
    const s = active();
    if (!s || !root.current || !body.current) return;
    const t = env.time;
    root.current.position.set(s.x, s.y + 0.15 + Math.sin(t * 6) * 0.04, 0);
    body.current.rotation.z = s.tilt * 1.2 + (s.stumble > 0 ? Math.sin(t * 30) * 0.3 : 0);
    body.current.rotation.y = -s.tilt * 0.6 + (s.stumble > 0 ? Math.sin(t * 13) * 0.6 : 0);
    body.current.rotation.x = s.grounded ? -0.05 : -0.25 + s.vy * 0.02;
    body.current.visible = !(s.invuln > 0 && s.stumble <= 0 && Math.floor(t * 18) % 2 === 0);
    // quote ring: radius = spread width of the lane we are quoting in
    const lane = s.quoteLane;
    const target = 1.0 + LANES[lane].halfSpread * 16;
    ringRadius.current += (target - ringRadius.current) * Math.min(1, dt * 10);
    if (ring.current && ringMat.current) {
      ring.current.scale.setScalar(ringRadius.current);
      ring.current.rotation.z += dt * 2;
      ringColor.set(LANE_COLORS[lane]);
      ringMat.current.color.copy(ringColor).multiplyScalar(1.5);
      ringMat.current.opacity = s.stumble > 0 ? 0.08 : 0.55 + Math.sin(t * 8) * 0.15;
    }
    if (riskRing.current) {
      const r = s.risk;
      riskMat.uniforms.uFill.value += (r - riskMat.uniforms.uFill.value) * Math.min(1, dt * 10);
      (riskMat.uniforms.uColor.value as THREE.Color).copy(r >= 0.9 ? REDC : r >= 0.7 ? AMBER : GREEN);
      riskMat.uniforms.uPulse.value = r >= 0.7 ? 0.6 + Math.sin(t * 16) * 0.6 : 0;
    }
    if (aura.current) {
      aura.current.visible = s.alpha > 0;
      aura.current.scale.setScalar(1.9 + Math.sin(t * 20) * 0.12);
    }
    if (glow.current) (glow.current.material as THREE.MeshBasicMaterial).color.copy(s.alpha > 0 ? GOLD : env.primary);
    const sp = s.speed / 40;
    streaks.current.forEach((m, i) => {
      m.scale.set(1, 2 + sp * 6 * (s.alpha > 0 ? 1.8 : 1), 1);
      m.position.z = 1.2 + m.scale.y / 2;
      (m.material as THREE.MeshBasicMaterial).color.copy(s.alpha > 0 ? GOLD : i === 0 ? env.primary : env.secondary);
    });
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {vehicle === 'board' && <Board color={v.color} />}
        {vehicle === 'bike' && <Bike color={v.color} />}
        {vehicle === 'pod' && <Pod color={v.color} />}
        {showRider && (vehicle === 'pod' ? <group position={[0, -0.15, 0.1]} scale={0.8}><Rider color={v.color} /></group> : <Rider color={v.color} />)}
      </group>
      {/* hover glow */}
      <mesh ref={glow} rotation-x={-Math.PI / 2} position={[0, -0.1, 0]}>
        <planeGeometry args={[3.2, 4]} />
        <meshBasicMaterial map={glowTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} opacity={0.8} />
      </mesh>
      {/* quote ring */}
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.92, 1, 48]} />
        <meshBasicMaterial ref={ringMat} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* RISK ring (v3): fills clockwise from the front */}
      <mesh ref={riskRing} rotation-x={-Math.PI / 2} position={[0, 0.07, 0]} material={riskMat}>
        <ringGeometry args={[1.95, 2.25, 64]} />
      </mesh>
      {/* speed trails */}
      {[-0.4, 0.4].map((x, i) => (
        <mesh key={x} ref={(m) => { if (m) streaks.current[i] = m; }} position={[x, 0.25, 2]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.18, 1]} />
          <meshBasicMaterial map={streakTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {/* ALPHA DRIVE aura */}
      <mesh ref={aura} position={[0, 1.0, 0]} visible={false}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial color="#ffd23d" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { LANE_COLORS, LANE_X } from '../game/content';
import { roadTexture } from './textures';
import { env } from './env';
import { active } from './active';

const ROAD_LEN = 700;
const TILE = 40;
const POSTS = 36;
const POST_GAP = 18;

export function Road() {
  const tex = useMemo(() => {
    const t = roadTexture().clone();
    t.repeat.set(1, ROAD_LEN / TILE);
    t.needsUpdate = true;
    return t;
  }, []);
  const laneMats = useRef<THREE.MeshBasicMaterial[]>([]);
  const railMats = useRef<THREE.MeshBasicMaterial[]>([]);
  const posts = useRef<THREE.InstancedMesh>(null);
  const gridTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6.4, ROAD_LEN / 10);
    return t;
  }, []);
  const gridMat = useRef<THREE.MeshBasicMaterial>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const s = active();
    if (!s) return;
    tex.offset.y = (s.z / TILE) % 1;
    gridTex.offset.y = (s.z / 10) % 1;
    laneMats.current.forEach((m, i) => {
      const on = s.quoteLane === i;
      m.opacity = on ? 0.2 + Math.sin(env.time * 10) * 0.05 : 0;
      // only the active lane strip is drawn: two near-invisible full-length blended planes cost real fill rate
      m.visible = on;
    });
    railMats.current.forEach((m, i) => m.color.copy(i === 0 ? env.primary : env.secondary).multiplyScalar(1.6));
    if (gridMat.current) gridMat.current.color.copy(env.primary).multiplyScalar(0.35 + env.danger * 0.3);
    if (posts.current) {
      const base = Math.floor(s.z / POST_GAP) * POST_GAP;
      for (let i = 0; i < POSTS; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const wz = base + Math.floor(i / 2) * POST_GAP;
        dummy.position.set(side * 6.9, 0.6, -(wz - s.z));
        dummy.updateMatrix();
        posts.current.setMatrixAt(i, dummy.matrix);
      }
      posts.current.instanceMatrix.needsUpdate = true;
      (posts.current.material as THREE.MeshBasicMaterial).color.copy(env.secondary).multiplyScalar(1.4);
    }
  });

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -ROAD_LEN / 2 + 40]}>
        <planeGeometry args={[13, ROAD_LEN, 1, 140]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* city ground grid — opaque (no blending) and only as wide as the street canyon: the old 400 m additive
          plane was mostly hidden behind buildings yet blended every pixel (−20% FPS in fill-bound profiling) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, -ROAD_LEN / 2 + 40]}>
        <planeGeometry args={[64, ROAD_LEN, 2, 140]} />
        <meshBasicMaterial ref={gridMat} map={gridTex} />
      </mesh>
      {LANE_X.map((x, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.02, -ROAD_LEN / 2 + 40]}>
          <planeGeometry args={[3.8, ROAD_LEN, 1, 140]} />
          <meshBasicMaterial
            ref={(m) => {
              if (m) laneMats.current[i] = m;
            }}
            color={LANE_COLORS[i]}
            transparent
            opacity={0.1}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      {[-1, 1].map((side, i) => (
        <mesh key={side} position={[side * 6.75, 0.35, -ROAD_LEN / 2 + 40]}>
          <boxGeometry args={[0.18, 0.12, ROAD_LEN, 1, 1, 140]} />
          <meshBasicMaterial
            ref={(m) => {
              if (m) railMats.current[i] = m;
            }}
            toneMapped={false}
          />
        </mesh>
      ))}
      <instancedMesh ref={posts} args={[undefined, undefined, POSTS]} frustumCulled={false}>
        <boxGeometry args={[0.16, 1.2, 0.16]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

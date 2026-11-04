import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { fx } from '../game/fx';
import { useGame } from '../game/store';
import { active } from './active';
import { bendUniform } from './bend';

/** Three camera modes (standard / dramatic / first-person) + shake, FOV kick, roll, title orbit. */
export function CameraRig() {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(0, 1.5, -10));
  const pos = useRef(new THREE.Vector3(0, 4, 9));
  const roll = useRef(0);
  const orbit = useRef(0);
  // reused every frame (no per-frame allocation)
  const tp = useRef(new THREE.Vector3()).current;
  const tl = useRef(new THREE.Vector3()).current;
  useFrame((_, dt) => {
    const s = active();
    const st = useGame.getState();
    const cam = camera as THREE.PerspectiveCamera;
    if (!s) return;
    const mode = st.settings.camera;
    const phase = st.phase;
    let fov = 66;
    const speedK = Math.min(1.5, s.speed / 45);
    // portrait screens: pull the camera back / up so all three lanes stay visible
    const portrait = Math.max(0, Math.min(1, (1.25 - cam.aspect) / 0.75));
    if (phase === 'title') {
      orbit.current += dt * 0.15;
      const a = Math.sin(orbit.current) * 0.9;
      tp.set(s.x + Math.sin(a) * 9, 3.2 + Math.sin(orbit.current * 0.7) * 1.2 + portrait * 2, Math.cos(a) * (9 + portrait * 5));
      tl.set(s.x, 1.2, -6);
      fov = 60;
    } else if (phase === 'ending' || phase === 'results' || phase === 'learning') {
      orbit.current += dt * 0.35;
      tp.set(s.x + Math.sin(orbit.current) * 7, 2.6, Math.cos(orbit.current) * 7);
      tl.set(s.x, 1.1, 0);
      fov = 55;
    } else if (mode === 'first') {
      tp.set(s.x, s.y + 1.85 + portrait * 0.8, -0.4 + portrait * 1.5);
      tl.set(s.x * (1 - portrait * 0.5) + s.tilt * -2, s.y + 1.5, -30);
      fov = 78 + speedK * 10 + portrait * 22;
    } else if (mode === 'dramatic') {
      tp.set(s.x * (0.85 - portrait * 0.45), 1.5 + s.y * 0.6 + portrait * 1.6, 4.2 + portrait * 3.5);
      tl.set(s.x * (0.9 - portrait * 0.4), 1.3 + s.y * 0.5, -12);
      fov = 82 + speedK * 14 + portrait * 16;
    } else {
      tp.set(s.x * (0.7 - portrait * 0.5), 4.3 + s.y * 0.4 + portrait * 3.2, 8.5 + portrait * 6);
      tl.set(s.x * (0.8 - portrait * 0.5), 1.4 - portrait * 0.6, -12);
      fov = 64 + speedK * 12 + portrait * 16;
    }
    const playing = phase === 'playing' || phase === 'countdown';
    if (playing) {
      // look into the curve / over the crest, like a real chase cam
      tl.x += bendUniform.value.x * 2600;
      tl.y += bendUniform.value.y * 1800;
      tp.y += Math.max(0, -bendUniform.value.y) * 900;
      tp.y -= fx.landDip * 0.5;
      if (s.boost > 0) fov += 8;
    }
    if (s.alpha > 0 && phase === 'playing') fov += 10;
    fov += fx.fovKick;
    const k = phase === 'title' ? 1 - Math.exp(-dt * 2) : 1 - Math.exp(-dt * (mode === 'first' ? 30 : 9));
    pos.current.lerp(tp, k);
    look.current.lerp(tl, k);
    cam.position.copy(pos.current);
    const reduce = st.settings.reduceMotion;
    if (fx.shake > 0 && !reduce) {
      const a = fx.shake * fx.shake * 0.5;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
    }
    // continuous rumble in crash markets
    if (s.engine.regime === 'CRASH' && phase === 'playing' && !reduce) {
      cam.position.x += (Math.random() - 0.5) * 0.06;
      cam.position.y += (Math.random() - 0.5) * 0.06;
    }
    cam.lookAt(look.current);
    const targetRoll = st.settings.roll && phase === 'playing' ? s.tilt * (mode === 'dramatic' ? 0.45 : 0.25) - bendUniform.value.x * 120 : 0;
    roll.current += (targetRoll - roll.current) * Math.min(1, dt * 6);
    cam.rotateZ(roll.current);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 5);
    cam.updateProjectionMatrix();
  });
  return null;
}

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { bendScene, bendUniform } from './bend';
import { active } from './active';
import { useGame } from '../game/store';

/** Applies the curve/hill bend to all world materials and drives it from the track shape ahead. */
export function Bender() {
  const scene = useThree((s) => s.scene);
  const frame = useRef(0);
  const cur = useRef({ c: 0, h: 0 });
  useFrame((_, dt) => {
    // patch new materials: every frame while the scene is being built, then only occasionally (cheap no-op scan)
    const f = frame.current++;
    if (f < 10 || f % 240 === 0) bendScene(scene);
    const s = active();
    if (!s) return;
    const reduce = useGame.getState().settings.reduceMotion;
    const shape = s.track(s.z + 90, s.district);
    const k = 1 - Math.exp(-dt * 2);
    cur.current.c += (shape.curve - cur.current.c) * k;
    cur.current.h += (shape.hill - cur.current.h) * k;
    const amt = reduce ? 0.5 : 1;
    bendUniform.value.set(cur.current.c * 0.0016 * amt, cur.current.h * 0.0008 * amt);
  });
  return null;
}

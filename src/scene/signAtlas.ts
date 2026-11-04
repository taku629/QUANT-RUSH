/**
 * Sign atlas: every district sign is drawn once into a shared 2048² canvas (8×4 cells of 256×512),
 * and all signs render as ONE InstancedMesh that picks its cell via a per-instance UV rect.
 */
import * as THREE from 'three';
import { signCanvas, type SignStyle } from './textures';

const AW = 2048;
const AH = 2048;
const CW = 256;
const CH = 512;
const COLS = AW / CW;
const CELLS = COLS * (AH / CH);

export type SignCell = { u: number; v: number; w: number; h: number };

class SignAtlas {
  canvas = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  private cells = new Map<string, SignCell>();
  private next = 0;
  constructor() {
    this.canvas.width = AW;
    this.canvas.height = AH;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }
  cell(text: string, color: string, vertical: boolean, style: SignStyle): SignCell {
    const key = `${text}|${color}|${vertical}|${style}`;
    const hit = this.cells.get(key);
    if (hit) return hit;
    const idx = this.next++ % CELLS; // the 5 districts need ≤ 30 cells; wrap is a safety net only
    const cx = (idx % COLS) * CW;
    const cy = Math.floor(idx / COLS) * CH;
    const src = signCanvas(text, color, vertical, style);
    const k = Math.min(CW / src.width, CH / src.height);
    const w = Math.floor(src.width * k);
    const h = Math.floor(src.height * k);
    this.ctx.clearRect(cx, cy, CW, CH);
    this.ctx.drawImage(src, cx, cy, w, h);
    this.texture.needsUpdate = true;
    // UV rect (texture v is flipped: canvas y=0 is the top)
    const c: SignCell = { u: cx / AW, v: 1 - (cy + h) / AH, w: w / AW, h: h / AH };
    this.cells.set(key, c);
    return c;
  }
}

let atlas: SignAtlas | null = null;
export const signAtlas = () => (atlas ??= new SignAtlas());

/** transparent sign material that reads its atlas cell from the `aRect` instance attribute */
export function makeSignMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map: signAtlas().texture, transparent: true, toneMapped: false, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = aRect.xy + uv * aRect.zw;');
  };
  m.customProgramCacheKey = () => 'sign-atlas';
  return m;
}

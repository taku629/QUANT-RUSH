/**
 * Facade atlas: five district facade styles in one texture, tiled per building in the shader so window
 * size stays constant whatever the building height. One InstancedMesh = one draw call for the whole city.
 */
import * as THREE from 'three';

const TW = 256; // tile width (px) — represents 10 m
const TH = 512; // tile height (px) — represents 14 m
export const FACADE_TILE_W = 10;
export const FACADE_TILE_H = 14;

function rnd(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type G = CanvasRenderingContext2D;

/** 0 兜町: stone with pilasters, tall warm windows, cornice lines */
function stone(g: G, r: () => number) {
  g.fillStyle = '#5a5650';
  g.fillRect(0, 0, TW, TH);
  for (let y = 0; y < TH; y += 8) {
    g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.06})`;
    g.fillRect(0, y, TW, 1);
  }
  for (const x of [0, 84, 168]) {
    g.fillStyle = '#7a756c';
    g.fillRect(x, 0, 14, TH);
  }
  g.fillStyle = '#8a857a';
  g.fillRect(0, 0, TW, 10);
  g.fillRect(0, TH / 2, TW, 8);
  for (let f = 0; f < 2; f++)
    for (let c = 0; c < 3; c++) {
      const x = 24 + c * 84;
      const y = 40 + f * (TH / 2);
      const lit = r() > 0.25;
      g.fillStyle = lit ? `rgb(255,${190 + Math.floor(r() * 40)},${110 + Math.floor(r() * 50)})` : '#1a1814';
      g.fillRect(x, y, 46, 170);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(x + 21, y, 4, 170);
      g.fillRect(x, y + 60, 46, 3);
    }
}

/** 1 大手町: dark glass curtain wall, thin mullions, cool lit floors */
function glass(g: G, r: () => number) {
  g.fillStyle = '#0a1426';
  g.fillRect(0, 0, TW, TH);
  const floors = 14;
  const fh = TH / floors;
  for (let f = 0; f < floors; f++) {
    const litFloor = r() > 0.35;
    for (let c = 0; c < 8; c++) {
      const v = litFloor && r() > 0.2 ? 150 + Math.floor(r() * 100) : 20 + Math.floor(r() * 30);
      g.fillStyle = `rgb(${Math.floor(v * 0.7)},${Math.floor(v * 0.85)},${v})`;
      g.fillRect(c * 32 + 2, f * fh + 3, 28, fh - 7);
    }
    g.fillStyle = '#c8d8ff';
    g.fillRect(0, f * fh, TW, 2);
  }
  g.fillStyle = 'rgba(200,220,255,0.5)';
  for (let c = 0; c <= 8; c++) g.fillRect(c * 32, 0, 1, TH);
}

/** 2 丸の内: red brick, white stone bands, warm arched windows */
function brick(g: G, r: () => number) {
  g.fillStyle = '#7a3424';
  g.fillRect(0, 0, TW, TH);
  for (let y = 0; y < TH; y += 10) {
    const off = (y / 10) % 2 ? 0 : 11;
    for (let x = -off; x < TW; x += 22) {
      g.fillStyle = `rgb(${110 + Math.floor(r() * 40)},${42 + Math.floor(r() * 18)},${30 + Math.floor(r() * 12)})`;
      g.fillRect(x + 1, y + 1, 20, 8);
    }
  }
  g.fillStyle = '#e8dcc4';
  g.fillRect(0, 0, TW, 14);
  g.fillRect(0, TH / 2 - 6, TW, 12);
  for (let f = 0; f < 2; f++)
    for (let c = 0; c < 4; c++) {
      const x = 18 + c * 60;
      const y = 50 + f * (TH / 2);
      const lit = r() > 0.2;
      g.fillStyle = '#e8dcc4';
      g.beginPath();
      g.arc(x + 17, y + 18, 23, Math.PI, 0);
      g.fillRect(x - 6, y + 18, 46, 150);
      g.fill();
      g.fillStyle = lit ? `rgb(255,${170 + Math.floor(r() * 50)},${80 + Math.floor(r() * 40)})` : '#20100a';
      g.beginPath();
      g.arc(x + 17, y + 18, 17, Math.PI, 0);
      g.fillRect(x, y + 18, 34, 140);
      g.fill();
    }
}

/** 3 六本木: near-black tower, vertical neon LED fins, sparse windows */
function tower(g: G, r: () => number) {
  g.fillStyle = '#0c0814';
  g.fillRect(0, 0, TW, TH);
  for (let y = 6; y < TH; y += 16)
    for (let x = 6; x < TW; x += 14) {
      if (r() < 0.62) continue;
      const v = 120 + Math.floor(r() * 135);
      g.fillStyle = `rgb(${v},${Math.floor(v * 0.8)},${v})`;
      g.fillRect(x, y, 8, 9);
    }
  for (const x of [20, 128, 236]) {
    const grd = g.createLinearGradient(x, 0, x + 8, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - 4, 0, 16, TH);
  }
}

/** 4 渋谷: mixed commercial facade — sign panels, LED bands, busy small windows */
function commercial(g: G, r: () => number) {
  g.fillStyle = '#18141c';
  g.fillRect(0, 0, TW, TH);
  for (let y = 4; y < TH; y += 12)
    for (let x = 4; x < TW; x += 10) {
      if (r() < 0.45) continue;
      const v = 90 + Math.floor(r() * 120);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 6, 7);
    }
  const cols = ['#ffffff', '#ff3d8b', '#ffd23d', '#3dffcf', '#a6ff00', '#7a5cff'];
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(r() * 160);
    const y = Math.floor(r() * 440);
    const w = 60 + Math.floor(r() * 90);
    const h = 30 + Math.floor(r() * 70);
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.globalAlpha = 0.85;
    g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    for (let t = 0; t < 3; t++) g.fillRect(x + 6, y + 8 + t * (h / 3.5), w * (0.4 + r() * 0.5), 4);
  }
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, TW, 4);
  g.fillRect(0, TH / 2, TW, 3);
}

let atlas: THREE.CanvasTexture | null = null;

export function facadeAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = TW * 5;
  c.height = TH;
  const g = c.getContext('2d')!;
  const painters = [stone, glass, brick, tower, commercial];
  painters.forEach((p, i) => {
    g.save();
    g.translate(i * TW, 0);
    g.beginPath();
    g.rect(0, 0, TW, TH);
    g.clip();
    p(g, rnd(1000 + i));
    g.restore();
  });
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

/**
 * Building material: samples the atlas tile chosen by the per-instance `aStyle` attribute and repeats it
 * according to the instance's scale (window size constant). Uses textureGrad so tiling has no mip seams.
 */
export function makeFacadeMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map: facadeAtlas(), toneMapped: false });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aStyle;
        varying vec2 vFacadeUv;
        varying float vStyle;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec3 fsc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #else
          vec3 fsc = vec3(1.0);
        #endif
        float faceW = abs(normal.x) > 0.5 ? fsc.z : fsc.x;
        vFacadeUv = vec2(uv.x * faceW / ${FACADE_TILE_W.toFixed(1)}, uv.y * fsc.y / ${FACADE_TILE_H.toFixed(1)});
        if (abs(normal.y) > 0.5) vFacadeUv = vec2(0.02, 0.02); // roofs: plain wall colour
        vStyle = aStyle;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vFacadeUv;
        varying float vStyle;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 fTile = vec2(fract(vFacadeUv.x) * 0.98 + 0.01, fract(vFacadeUv.y));
        vec2 fUv = vec2((fTile.x + vStyle) / 5.0, fTile.y);
        vec2 fdx = dFdx(vFacadeUv) * vec2(0.196, 1.0);
        vec2 fdy = dFdy(vFacadeUv) * vec2(0.196, 1.0);
        vec4 sampledDiffuseColor = textureGrad(map, fUv, fdx, fdy);
        diffuseColor *= sampledDiffuseColor;`,
      );
  };
  m.customProgramCacheKey = () => 'facade-v1';
  return m;
}

/** Procedurally generated canvas textures (no external image assets). */
import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function finish(c: HTMLCanvasElement, opts: { repeat?: boolean; aniso?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.aniso ? 8 : 1;
  return t;
}

/** Road tile: 13m wide × 40m long. Lane lines, grid, lane labels. */
export function roadTexture() {
  const key = 'road';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(512, 1024);
  g.fillStyle = '#07061a';
  g.fillRect(0, 0, 512, 1024);
  // fine data grid
  g.strokeStyle = 'rgba(80,120,255,0.10)';
  g.lineWidth = 1;
  for (let y = 0; y < 1024; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  for (let x = 0; x < 512; x += 32) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 1024);
    g.stroke();
  }
  const mToPx = 512 / 13;
  const laneEdge = [-6, -2, 2, 6].map((m) => (m + 6.5) * mToPx);
  // lane dividers (dashed)
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 5;
  g.setLineDash([90, 70]);
  for (const x of [laneEdge[1], laneEdge[2]]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 1024);
    g.stroke();
  }
  g.setLineDash([]);
  // edges
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  for (const x of [laneEdge[0], laneEdge[3]]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 1024);
    g.stroke();
  }
  // lane labels (painted on the road)
  const labels: [string, string, string][] = [
    ['TIGHT', '±2¢', '#ff3d6e'],
    ['MID', '±5¢', '#00f0ff'],
    ['WIDE', '±10¢', '#3dff8b'],
  ];
  labels.forEach(([a, b, col], i) => {
    const cx = (laneEdge[i] + laneEdge[i + 1]) / 2;
    g.save();
    g.translate(cx, 300);
    g.fillStyle = col;
    g.globalAlpha = 0.55;
    g.font = 'bold 44px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(a, 0, 0);
    g.font = 'bold 54px "Arial Black", Arial, sans-serif';
    g.fillText(b, 0, 64);
    // chevrons
    g.globalAlpha = 0.35;
    g.lineWidth = 10;
    g.strokeStyle = col;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(-40, 520 + k * 60);
      g.lineTo(0, 480 + k * 60);
      g.lineTo(40, 520 + k * 60);
      g.stroke();
    }
    g.restore();
  });
  const t = finish(c, { repeat: true, aniso: true });
  cache.set(key, t);
  return t;
}

/** Building facade: dark with lit windows (white so instance colors tint them). */
export function windowsTexture() {
  const key = 'windows';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#05050c';
  g.fillRect(0, 0, 256, 512);
  for (let y = 6; y < 512; y += 14) {
    for (let x = 6; x < 256; x += 12) {
      const r = Math.random();
      if (r < 0.42) continue;
      const v = r > 0.93 ? 255 : Math.floor(70 + Math.random() * 120);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 7, 8);
    }
  }
  // vertical neon strips
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(0, 0, 3, 512);
  g.fillRect(253, 0, 3, 512);
  const t = finish(c, { repeat: true });
  cache.set(key, t);
  return t;
}

export type SignStyle = 'shop' | 'corporate' | 'brass' | 'neon' | 'pop';

/** district signage (visual only): 兜町 shop boards, 大手町 corporate plates, 丸の内 brass, 六本木 neon tubes, 渋谷 pop */
export function signTexture(text: string, color: string, vertical: boolean, style: SignStyle = 'neon') {
  const key = `sign:${text}:${color}:${vertical}:${style}`;
  if (cache.has(key)) return cache.get(key)!;
  const t = finish(signCanvas(text, color, vertical, style));
  cache.set(key, t);
  return t;
}

/** draw one sign into its own canvas (used directly by the sign atlas) */
export function signCanvas(text: string, color: string, vertical: boolean, style: SignStyle = 'neon'): HTMLCanvasElement {
  const chars = [...text];
  const w = vertical ? 128 : 64 + chars.length * 56;
  const h = vertical ? 64 + chars.length * 104 : 128;
  const [c, g] = canvas(w, h);
  const jp = 'bold 88px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "Hiragino Kaku Gothic ProN", serif';
  const sans = 'bold 88px "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Arial, sans-serif';
  let bg = 'rgba(5,3,20,0.85)';
  let fg = '#ffffff';
  let border = color;
  let glow = 18;
  let font = sans;
  switch (style) {
    case 'shop':
      bg = '#2a1408';
      fg = '#ffe8c8';
      border = '#ff5a3c';
      glow = 6;
      font = jp;
      break;
    case 'corporate':
      bg = 'rgba(8,16,40,0.92)';
      fg = '#e8f0ff';
      border = 'rgba(255,255,255,0.0)';
      glow = 4;
      break;
    case 'brass':
      bg = '#3a2410';
      fg = '#ffd9a0';
      border = '#c89a5a';
      glow = 8;
      font = jp;
      break;
    case 'neon':
      bg = 'rgba(8,0,18,0.55)';
      fg = color;
      border = color;
      glow = 28;
      break;
    case 'pop':
      bg = color;
      fg = '#0a0610';
      border = '#ffffff';
      glow = 10;
      break;
  }
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = border;
  g.lineWidth = style === 'corporate' ? 0 : 6;
  g.shadowColor = border;
  g.shadowBlur = glow;
  if (style !== 'corporate') g.strokeRect(8, 8, w - 16, h - 16);
  if (style === 'corporate') {
    g.fillStyle = color;
    g.fillRect(0, h - 14, w, 14);
  }
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = style === 'neon' ? color : fg;
  g.shadowBlur = style === 'neon' ? 30 : style === 'pop' ? 0 : 12;
  if (vertical) chars.forEach((ch, i) => g.fillText(ch, w / 2, 84 + i * 104));
  else {
    g.font = font.replace('88px', '76px');
    g.fillText(text, w / 2, h / 2 + 4);
  }
  return c;
}

export function glowTexture() {
  const key = 'glow';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function streakTexture() {
  const key = 'streak';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(32, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 256);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Big gate banner text */
export function gateTexture(title: string, jp: string, sub: string, color: string) {
  const key = `gate:${title}:${jp}:${sub}:${color}`;
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(1024, 256);
  g.fillStyle = 'rgba(4,2,16,0.92)';
  g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = color;
  g.lineWidth = 8;
  g.shadowColor = color;
  g.shadowBlur = 20;
  g.strokeRect(10, 10, 1004, 236);
  g.textAlign = 'center';
  g.fillStyle = color;
  g.font = 'bold 34px "Arial Black", Arial, sans-serif';
  g.fillText('SETTLEMENT GATE', 512, 60);
  g.fillStyle = '#ffffff';
  g.font = 'bold 92px "Arial Black", "Noto Sans JP", Arial, sans-serif';
  g.fillText(`${jp} ${title}`, 512, 160);
  g.fillStyle = color;
  g.font = 'bold 34px Arial, sans-serif';
  g.fillText(sub, 512, 220);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Dynamic ticker board texture (redrawn in place). */
export function createTicker() {
  const [c, g] = canvas(1024, 160);
  const tex = finish(c);
  const draw = (lines: { text: string; color: string }[]) => {
    g.clearRect(0, 0, 1024, 160);
    g.fillStyle = 'rgba(3,2,14,0.85)';
    g.fillRect(0, 0, 1024, 160);
    g.font = 'bold 84px "Arial Black", Arial, sans-serif';
    g.textBaseline = 'middle';
    let x = 30;
    for (const l of lines) {
      g.fillStyle = l.color;
      g.shadowColor = l.color;
      g.shadowBlur = 16;
      g.fillText(l.text, x, 84);
      x += g.measureText(l.text).width + 40;
    }
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

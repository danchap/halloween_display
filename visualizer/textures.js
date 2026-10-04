// Procedural materials for the Ré village, drawn on canvases. Colours come
// from Daniel's photo of Rue de Trousse Chemise (site/photos): limewashed
// walls with a dark painted plinth, pale grey-green shutters, canal tiles,
// a gravel-aggregate lane with a strip of pale limestone setts.
//
// Every texture is drawn at a known scale in meters so it can tile by
// world distance: texture.repeat = 1 / size.

import * as THREE from 'three';

// Deterministic random numbers so the village looks the same every load.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function canvasTexture(w, h, draw, { repeat = [1, 1], anisotropy = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = anisotropy;
  return t;
}

function speckle(g, w, h, count, rnd, colors, size = [1, 3]) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const s = size[0] + rnd() * (size[1] - size[0]);
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

// Limewash wall: 1 m wide, 8 m tall, plinth in the bottom 0.35 m.
export const WALL_TEXTURE_HEIGHT = 8;
export function limewashTexture() {
  return canvasTexture(256, 2048, (g, w, h) => {
    const rnd = rng(11);
    g.fillStyle = '#efece5';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, rnd, ['#e8e4dc', '#f4f2ec', '#e3dfd6', '#f7f5f0'], [1, 4]);
    // faint horizontal render lines and streaks of weathering
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(120,110,95,${0.03 + rnd() * 0.04})`;
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 30, 1);
    }
    const plinth = h * 0.35 / WALL_TEXTURE_HEIGHT;
    g.fillStyle = '#3b3b39';
    g.fillRect(0, h - plinth, w, plinth);
    speckle(g, w, plinth, 1500, (() => { const r = rng(5); return () => r(); })(), ['#454543', '#333331', '#4d4c48'], [1, 3]);
    // the plinth's soft top edge
    g.fillStyle = 'rgba(59,59,57,0.5)';
    g.fillRect(0, h - plinth - 2, w, 2);
  }, { repeat: [1, 1 / WALL_TEXTURE_HEIGHT] });
}

// Canal tiles: 1 m x 1 m, tiles 0.19 m wide, rows 0.36 m long.
export function tileTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const rnd = rng(23);
    g.fillStyle = '#7a4e36';
    g.fillRect(0, 0, w, h);
    const cols = 5, rows = 3;
    const cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw, y = r * rh - (c % 2) * rh * 0.5;
        const base = 160 + rnd() * 40, gr = 95 + rnd() * 30, bl = 62 + rnd() * 25;
        // cover tile: convex, lit on the left
        const grad = g.createLinearGradient(x, 0, x + cw, 0);
        grad.addColorStop(0, `rgb(${base - 40},${gr - 30},${bl - 20})`);
        grad.addColorStop(0.35, `rgb(${base},${gr},${bl})`);
        grad.addColorStop(0.7, `rgb(${base - 20},${gr - 15},${bl - 10})`);
        grad.addColorStop(1, `rgb(${base - 70},${gr - 50},${bl - 30})`);
        g.fillStyle = grad;
        g.fillRect(x, y, cw, rh);
        g.fillRect(x, y + rh, cw, rh); // the row below the offset start
        // row overlap shadow
        g.fillStyle = 'rgba(40,20,10,0.45)';
        g.fillRect(x, y + rh - 4, cw, 4);
        g.fillRect(x, y + 2 * rh - 4, cw, 4);
      }
    }
    speckle(g, w, h, 1500, rnd, ['rgba(70,50,40,0.35)', 'rgba(200,170,140,0.25)', 'rgba(120,120,100,0.3)'], [1, 3]);
  });
}

// Lane surface: 1 m x 1 m of grey gravel aggregate.
export function aggregateTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const rnd = rng(37);
    g.fillStyle = '#7e776a';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 26000, rnd, ['#8f8778', '#6d6659', '#a39b8c', '#5e5950', '#948c7d', '#7a7366'], [1, 4]);
    speckle(g, w, h, 400, rnd, ['#b3ab9b', '#4f4a43'], [2, 5]);
  });
}

// Pale limestone setts: 1 m x 1 m, stones about 0.12 x 0.14 m.
export function settTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const rnd = rng(41);
    g.fillStyle = '#8c8577';
    g.fillRect(0, 0, w, h);
    const sw = w / 8, sh = h / 7;
    for (let r = 0; r < 7; r++) {
      const off = (r % 2) * sw * 0.5;
      for (let c = -1; c < 9; c++) {
        const x = c * sw + off + 2 + rnd() * 2, y = r * sh + 2 + rnd() * 2;
        const l = 170 + rnd() * 35;
        g.fillStyle = `rgb(${l + 12},${l + 2},${l - 18})`;
        g.fillRect(x, y, sw - 5, sh - 5);
        g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.08})`;
        g.fillRect(x, y, sw - 5, 3);
      }
    }
    speckle(g, w, h, 3000, rnd, ['rgba(90,80,70,0.25)', 'rgba(240,235,225,0.25)'], [1, 3]);
  });
}

// Window with open shutters: 2.0 m wide x 1.4 m tall (the plane size).
export const WINDOW_SIZE = [2.0, 1.4];
export function windowTexture() {
  return canvasTexture(400, 280, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const sx = 90, wx = 100, ww = 200; // shutter width, window x, window width in px
    // shutters
    for (const x of [wx - sx - 4, wx + ww + 4]) {
      g.fillStyle = '#8c9c8a';
      g.fillRect(x, 0, sx, h);
      g.fillStyle = '#7a8a78';
      for (let y = 14; y < h - 10; y += 14) g.fillRect(x + 6, y, sx - 12, 5);
      g.fillStyle = '#9fae9c';
      g.fillRect(x, 0, sx, 6); g.fillRect(x, h - 6, sx, 6);
      g.fillRect(x, 0, 6, h); g.fillRect(x + sx - 6, 0, 6, h);
    }
    // frame and glass
    g.fillStyle = '#f2f1ec';
    g.fillRect(wx, 0, ww, h);
    const glass = g.createLinearGradient(0, 0, 0, h);
    glass.addColorStop(0, '#5d6d80'); glass.addColorStop(0.5, '#2e3845'); glass.addColorStop(1, '#1f2730');
    g.fillStyle = glass;
    const pad = 12;
    for (const [px, py, pw, ph] of [[wx + pad, pad, ww / 2 - pad - 4, h / 2 - pad - 4], [wx + ww / 2 + 4, pad, ww / 2 - pad - 4, h / 2 - pad - 4],
      [wx + pad, h / 2 + 4, ww / 2 - pad - 4, h / 2 - pad - 4], [wx + ww / 2 + 4, h / 2 + 4, ww / 2 - pad - 4, h / 2 - pad - 4]]) {
      g.fillRect(px, py, pw, ph);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px, py, pw, 10); g.fillStyle = glass;
    }
    // sill
    g.fillStyle = '#d9d6cd';
    g.fillRect(wx - 8, h - 10, ww + 16, 10);
  }, { anisotropy: 4 });
}

// Door: 1.0 m x 2.2 m plane.
export const DOOR_SIZE = [1.0, 2.2];
export function doorTexture() {
  return canvasTexture(200, 440, (g, w, h) => {
    g.fillStyle = '#f2f1ec';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7f8f7c';
    g.fillRect(14, 14, w - 28, h - 14);
    g.fillStyle = '#6d7d6a';
    for (const [x, y, pw, ph] of [[34, 40, w - 68, 120], [34, 190, w - 68, 200]]) g.fillRect(x, y, pw, ph);
    g.fillStyle = '#8fa08c';
    for (const [x, y, pw, ph] of [[42, 48, w - 84, 104], [42, 198, w - 84, 184]]) g.fillRect(x, y, pw, ph);
    g.fillStyle = '#d9d2b8';
    g.beginPath(); g.arc(w - 44, h * 0.52, 5, 0, Math.PI * 2); g.fill();
  }, { anisotropy: 4 });
}

// Street name plaque, 0.5 m x 0.28 m.
export const PLAQUE_SIZE = [0.5, 0.28];
export function plaqueTexture(lines = ['IMPASSE', 'des', 'ROSSIGNOLS']) {
  return canvasTexture(500, 280, (g, w, h) => {
    g.fillStyle = '#1d2330'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f3ee'; g.fillRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#1d2330'; g.fillRect(22, 22, w - 44, h - 44);
    g.fillStyle = '#f4f3ee'; g.fillRect(30, 30, w - 60, h - 60);
    g.fillStyle = '#1f3b7a';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const sizes = [66, 44, 66];
    const ys = [78, 140, 202];
    lines.forEach((t, i) => { g.font = `${i === 1 ? 'italic 400' : '700'} ${sizes[i]}px "Helvetica Neue", Arial, sans-serif`; g.fillText(t, w / 2, ys[i]); });
  }, { anisotropy: 4 });
}

// No-parking disc, 0.6 m.
export function noParkingTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = w / 2 - 4;
    g.fillStyle = '#d8d8d4'; g.beginPath(); g.arc(w / 2, h / 2, r + 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c8322a'; g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1e4fa3'; g.beginPath(); g.arc(w / 2, h / 2, r * 0.72, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c8322a'; g.lineWidth = r * 0.22;
    g.beginPath(); g.moveTo(w / 2 - r * 0.62, h / 2 - r * 0.62); g.lineTo(w / 2 + r * 0.62, h / 2 + r * 0.62); g.stroke();
  }, { anisotropy: 4 });
}

// All materials at once, built lazily and shared.
let cache = null;
export function villageMaterials() {
  if (cache) return cache;
  const std = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, ...extra });
  cache = {
    wall: std(limewashTexture()),
    tile: std(tileTexture(), { side: THREE.DoubleSide }),
    lane: std(aggregateTexture()),
    setts: std(settTexture()),
    window: std(windowTexture(), { transparent: true, alphaTest: 0.5, roughness: 0.6 }),
    door: std(doorTexture(), { roughness: 0.7 }),
    plaque: std(plaqueTexture(), { roughness: 0.5 }),
    noParking: std(noParkingTexture(), { transparent: true, alphaTest: 0.5, roughness: 0.4, side: THREE.DoubleSide }),
  };
  return cache;
}

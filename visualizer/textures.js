// Procedural materials for the Ré village, drawn on canvases. Colours come
// from Daniel's photo of Rue de Trousse Chemise (site/photos) and from his
// Street View screenshots of the junction and the alley (reference only):
// limewashed walls with a dark painted plinth, shutters in grey-blue, pale
// blue or sage, canal tiles, a gravel-aggregate lane with pale limestone
// setts.
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

// Limewash wall: 1 m wide, 8 m tall, plinth in the bottom 0.22 m.
export const WALL_TEXTURE_HEIGHT = 8;
export function limewashTexture() {
  return canvasTexture(256, 2048, (g, w, h) => {
    const rnd = rng(11);
    g.fillStyle = '#efece5';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, rnd, ['#e8e4dc', '#f4f2ec', '#e3dfd6', '#f7f5f0'], [1, 4]);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(120,110,95,${0.03 + rnd() * 0.04})`;
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 30, 1);
    }
    const plinth = h * 0.22 / WALL_TEXTURE_HEIGHT;
    g.fillStyle = '#34343a';
    g.fillRect(0, h - plinth, w, plinth);
    speckle(g, w, plinth, 1200, rng(5), ['#3e3e43', '#2c2c30', '#45454a'], [1, 3]);
    g.fillStyle = 'rgba(52,52,58,0.5)';
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
        const grad = g.createLinearGradient(x, 0, x + cw, 0);
        grad.addColorStop(0, `rgb(${base - 40},${gr - 30},${bl - 20})`);
        grad.addColorStop(0.35, `rgb(${base},${gr},${bl})`);
        grad.addColorStop(0.7, `rgb(${base - 20},${gr - 15},${bl - 10})`);
        grad.addColorStop(1, `rgb(${base - 70},${gr - 50},${bl - 30})`);
        g.fillStyle = grad;
        g.fillRect(x, y, cw, rh);
        g.fillRect(x, y + rh, cw, rh);
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
    g.fillStyle = '#76706a';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 26000, rnd, ['#8a8378', '#67615a', '#9d968b', '#58534d', '#8f8880', '#726c66'], [1, 4]);
    speckle(g, w, h, 400, rnd, ['#aaa295', '#4b4741'], [2, 5]);
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

// Joinery colours seen in the village: shutters mostly grey-blue, some pale
// blue, some sage; doors sage, grey-blue or white.
export const SHUTTER_COLOURS = {
  grey: ['#9ba7b2', '#87939f', '#aab5bf'],
  blue: ['#a6c0d1', '#8fabbf', '#b8cedb'],
  sage: ['#8c9c8a', '#7a8a78', '#9fae9c'],
};
export const DOOR_COLOURS = {
  sage: ['#86a886', '#729472', '#98b798'],
  grey: ['#93a0ac', '#7f8c98', '#a3afba'],
  white: ['#e9e8e2', '#d8d7d0', '#f4f3ee'],
};

function louvred(g, x, y, sw, h, [base, dark, light]) {
  g.fillStyle = base;
  g.fillRect(x, y, sw, h);
  g.fillStyle = dark;
  for (let yy = y + 14; yy < y + h - 10; yy += 14) g.fillRect(x + 6, yy, sw - 12, 5);
  g.fillStyle = light;
  g.fillRect(x, y, sw, 6); g.fillRect(x, y + h - 6, sw, 6);
  g.fillRect(x, y, 6, h); g.fillRect(x + sw - 6, y, 6, h);
}

// A single shutter leaf, 0.5 m x 1.3 m, hung open flat against the wall.
export const SHUTTER_SIZE = [0.5, 1.3];
export function shutterTexture(colours = SHUTTER_COLOURS.grey) {
  return canvasTexture(100, 260, (g, w, h) => {
    louvred(g, 0, 0, w, h, colours);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 0, 4, h); // the hinge-side shadow
  }, { anisotropy: 4 });
}

// The glazing at the back of a window opening: white frame, four panes,
// 1.0 m x 1.3 m.
export const WINDOW_SIZE = [1.0, 1.3];
export function glazingTexture() {
  return canvasTexture(200, 260, (g, w, h) => {
    g.fillStyle = '#f2f1ec';
    g.fillRect(0, 0, w, h);
    const glass = g.createLinearGradient(0, 0, 0, h);
    glass.addColorStop(0, '#5d6d80'); glass.addColorStop(0.5, '#2e3845'); glass.addColorStop(1, '#1f2730');
    const pad = 12, mid = 5;
    for (const [px, py, pw, ph] of [[pad, pad, w / 2 - pad - mid, h / 2 - pad - mid], [w / 2 + mid, pad, w / 2 - pad - mid, h / 2 - pad - mid],
      [pad, h / 2 + mid, w / 2 - pad - mid, h / 2 - pad - mid], [w / 2 + mid, h / 2 + mid, w / 2 - pad - mid, h / 2 - pad - mid]]) {
      g.fillStyle = glass; g.fillRect(px, py, pw, ph);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(px, py, pw, 10);
    }
  }, { anisotropy: 4 });
}

// Door leaf in its opening: 1.0 m x 2.15 m.
export const DOOR_SIZE = [1.0, 2.15];
export function doorTexture(colours = DOOR_COLOURS.sage) {
  return canvasTexture(200, 430, (g, w, h) => {
    const [base, dark, light] = colours;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = dark;
    for (const [x, y, pw, ph] of [[34, 40, w - 68, 120], [34, 190, w - 68, 200]]) g.fillRect(x, y, pw, ph);
    g.fillStyle = light;
    for (const [x, y, pw, ph] of [[42, 48, w - 84, 104], [42, 198, w - 84, 184]]) g.fillRect(x, y, pw, ph);
    g.fillStyle = '#d9d2b8';
    g.beginPath(); g.arc(w - 44, h * 0.52, 5, 0, Math.PI * 2); g.fill();
  }, { anisotropy: 4 });
}

// The garage at the alley mouth: sage double door with ventilation holes,
// 2.2 m x 2.3 m.
export const GARAGE_SIZE = [2.2, 2.3];
export function garageDoorTexture() {
  return canvasTexture(440, 460, (g, w, h) => {
    const [base, dark, light] = DOOR_COLOURS.sage;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = dark;
    for (let x = 0; x < w; x += 44) g.fillRect(x, 0, 3, h); // planks
    g.fillRect(w / 2 - 3, 0, 6, h);
    g.fillStyle = light;
    for (const y of [60, h / 2, h - 60]) g.fillRect(0, y, w, 6); // ledges
    g.fillStyle = '#4a5a4a';
    for (const cx of [w * 0.25, w * 0.75]) {
      for (let r = 0; r < 6; r++) for (let c = 0; c < 3 + (r % 2); c++) {
        g.beginPath(); g.arc(cx - 30 + c * 20 + (r % 2 ? -10 : 0), h * 0.42 + r * 14, 4, 0, Math.PI * 2); g.fill();
      }
    }
  }, { anisotropy: 4 });
}

// The corner shop on the square: sage frame around a wide window and a
// door, 4.2 m x 2.2 m.
export const SHOPFRONT_SIZE = [4.2, 2.2];
export function shopfrontTexture() {
  return canvasTexture(840, 440, (g, w, h) => {
    const [base, dark, light] = DOOR_COLOURS.sage;
    g.clearRect(0, 0, w, h);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = light; g.fillRect(0, 0, w, 30); g.fillRect(0, h - 24, w, 24);
    g.fillStyle = dark; g.fillRect(0, 30, w, 8);
    // door at the left
    g.fillStyle = '#2b3542'; g.fillRect(40, 60, 150, h - 84);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(40, 60, 150, 40);
    // the shop window
    const glass = g.createLinearGradient(0, 60, 0, h - 24);
    glass.addColorStop(0, '#6a7a88'); glass.addColorStop(0.6, '#3a4552'); glass.addColorStop(1, '#2b3440');
    g.fillStyle = glass; g.fillRect(230, 80, w - 270, h - 124);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(230, 80, w - 270, 36);
    g.fillStyle = dark; g.fillRect(230 + (w - 270) / 2 - 4, 80, 8, h - 124);
    for (const y of [160, 250, 340]) { g.fillStyle = '#c9b89c'; g.fillRect(240, y, w - 290, 5); } // shelves
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
    wallBoth: std(limewashTexture(), { side: THREE.DoubleSide }),
    chimney: new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.95 }),
    pipe: new THREE.MeshStandardMaterial({ color: 0x8d9296, roughness: 0.6, metalness: 0.3 }),
    glazing: std(glazingTexture(), { roughness: 0.5 }),
    shutters: Object.fromEntries(Object.entries(SHUTTER_COLOURS).map(([k, c]) => [k, std(shutterTexture(c), { roughness: 0.8 })])),
    doors: Object.fromEntries(Object.entries(DOOR_COLOURS).map(([k, c]) => [k, std(doorTexture(c), { roughness: 0.7 })])),
    garage: std(garageDoorTexture(), { roughness: 0.7 }),
    shopfront: std(shopfrontTexture(), { roughness: 0.6 }),
    plaque: std(plaqueTexture(), { roughness: 0.5 }),
    noParking: std(noParkingTexture(), { transparent: true, alphaTest: 0.5, roughness: 0.4, side: THREE.DoubleSide }),
  };
  return cache;
}

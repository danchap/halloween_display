// The site: buildings, ground, street furniture and plants, from
// site/site.json, dressed with the village materials in textures.js.
//
// Site coordinates are local east/north meters around the brief's point.
// Scene coordinates (three.js): X = east, Y = up, Z = south (-north).
// The alley frame (see spider.js) has x along the alley from the street
// into the dead end, y up, z across to the right when looking in.

import * as THREE from 'three';
import { villageMaterials, WALL_TEXTURE_HEIGHT, WINDOW_SIZE, DOOR_SIZE, PLAQUE_SIZE } from './textures.js';

export async function loadSite(url = './site/site.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('site data not found: ' + url);
  const site = await res.json();
  const [sx, sy] = site.alley.start;
  const [ex, ey] = site.alley.end;
  const len = Math.hypot(ex - sx, ey - sy);
  const along = [(ex - sx) / len, (ey - sy) / len];
  const right = [along[1], -along[0]];
  site.frame = {
    start: [sx, sy],
    along, right,
    // Rotation about scene Y that maps alley x onto the alley direction.
    yaw: Math.atan2(along[1], along[0]),
    toAlley(e, n) {
      const de = e - sx, dn = n - sy;
      return [de * along[0] + dn * along[1], de * right[0] + dn * right[1]];
    },
    toSite(x, z) {
      return [sx + x * along[0] + z * right[0], sy + x * along[1] + z * right[1]];
    },
  };
  // Every building edge in alley-frame coordinates, for wall finding, and
  // in site coordinates, for walking collisions.
  site.edges = [];
  for (const b of site.buildings) {
    b.bbox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const poly of b.polygons) {
      for (const ring of [poly.outer, ...poly.holes]) {
        for (let i = 0; i + 1 < ring.length; i++) {
          const p = site.frame.toAlley(ring[i][0], ring[i][1]);
          const q = site.frame.toAlley(ring[i + 1][0], ring[i + 1][1]);
          site.edges.push({ p, q, building: b });
        }
      }
      for (const [e, n] of poly.outer) {
        b.bbox[0] = Math.min(b.bbox[0], e); b.bbox[1] = Math.min(b.bbox[1], n);
        b.bbox[2] = Math.max(b.bbox[2], e); b.bbox[3] = Math.max(b.bbox[3], n);
      }
    }
  }
  return site;
}

// Wall finder for buildSpider: the nearest building edge across the alley
// from (x, fromZ) on the given side, or null. Also remembers which building
// and its eave height, for the stats.
export function wallsFromSite(site, maxDistance = 12) {
  const fn = (x, side, fromZ = 0) => {
    let best = null;
    for (const { p, q, building } of site.edges) {
      const [x1, z1] = p, [x2, z2] = q;
      if ((x1 <= x) === (x2 <= x)) continue; // the edge does not cross x
      const z = z1 + (x - x1) * (z2 - z1) / (x2 - x1);
      const dist = (z - fromZ) * side;
      if (dist <= 0 || dist > maxDistance) continue;
      if (!best || dist < best.dist) best = { dist, z, building };
    }
    fn.last = best;
    return best ? best.z : null;
  };
  return fn;
}

// Is the site point (e, n) inside a building, or within `margin` of one?
// Used to keep a walking visitor out of the walls.
export function insideBuilding(site, e, n, margin = 0.35) {
  for (const b of site.buildings) {
    const [x0, y0, x1, y1] = b.bbox;
    if (e < x0 - margin || e > x1 + margin || n < y0 - margin || n > y1 + margin) continue;
    for (const poly of b.polygons) {
      if (pointInRing(poly.outer, e, n) && !poly.holes.some(h => pointInRing(h, e, n))) return true;
      for (const ring of [poly.outer, ...poly.holes]) {
        for (let i = 0; i + 1 < ring.length; i++) {
          if (segmentDistance(ring[i], ring[i + 1], e, n) < margin) return true;
        }
      }
    }
  }
  return false;
}

function pointInRing(ring, e, n) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > n) !== (yj > n) && e < (xj - xi) * (n - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segmentDistance([x1, y1], [x2, y2], px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ---------------------------------------------------------------- building the meshes

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const V = (e, y, n) => new THREE.Vector3(e, y, -n); // site (e, n) at height y -> scene

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}

// Build the ground, buildings, street surface, signs and plants into a
// group in scene coordinates. opts.ground: 'lane' (textured) or 'ortho'.
export function buildSiteMeshes(site, textureLoader, opts = {}) {
  const group = new THREE.Group();
  group.name = 'site';
  const mats = villageMaterials();
  const half = site.ortho.halfWidth;

  // Ground: the gravel lane everywhere, and the orthophoto as an alternative.
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), mats.lane);
  lane.material = mats.lane.clone(); lane.material.map = mats.lane.map.clone(); lane.material.map.repeat.set(half * 2, half * 2); lane.material.map.needsUpdate = true;
  lane.rotation.x = -Math.PI / 2; lane.receiveShadow = true; lane.name = 'ground-lane';
  group.add(lane);

  const orthoMat = new THREE.MeshStandardMaterial({ color: 0xbfb8ad, roughness: 1 });
  const loads = [];
  if (textureLoader) {
    loads.push(new Promise(done => textureLoader.load('./site/' + site.ortho.file, tex => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      orthoMat.map = tex; orthoMat.color.set(0xffffff); orthoMat.needsUpdate = true;
      if (opts.onTexture) opts.onTexture();
      done();
    }, undefined, () => done())));
  }
  const ortho = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), orthoMat);
  ortho.rotation.x = -Math.PI / 2; ortho.position.y = 0.005; ortho.receiveShadow = true; ortho.name = 'ground-ortho';
  group.add(ortho);

  // Sett strips along the streets (not the alleys), offset to the right of
  // the west-to-east direction as in the photo of Rue de Trousse Chemise.
  for (const road of site.roads) {
    if (road.nature !== 'Route à 1 chaussée' || /impasse/i.test(road.name || '')) continue;
    let pts = road.points.slice();
    if (pts[0][0] > pts[pts.length - 1][0]) pts.reverse();
    const ribbon = ribbonGeometry(pts, 0.55, 0.9);
    if (ribbon) { const m = new THREE.Mesh(ribbon, mats.setts); m.position.y = 0.012; m.receiveShadow = true; m.name = 'strips'; group.add(m); }
  }

  // Buildings.
  const rnd = rng(7);
  const walls = [], roofs = [], facade = [], gutters = [];
  for (const b of site.buildings) {
    const eave = b.eaveHeight || 3.5;
    for (const poly of b.polygons) {
      const outer = ringArea(poly.outer) < 0 ? poly.outer.slice().reverse() : poly.outer; // counter-clockwise
      const holes = poly.holes.map(h => ringArea(h) > 0 ? h.slice().reverse() : h);          // clockwise
      for (const ring of [outer, ...holes]) walls.push(wallGeometry(ring, eave));
      const roof = roofGeometry(poly, eave, b.ridgeAbove ?? 1.3);
      if (roof) roofs.push(roof);
      roofs.push(eaveSlab(poly, eave));
      // Windows, doors and gutters on faces that look onto a street.
      for (let i = 0; i + 1 < outer.length; i++) {
        const p = outer[i], q = outer[i + 1];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (len < 2.2) continue;
        const ne = (q[1] - p[1]) / len, nn = -(q[0] - p[0]) / len; // outward normal, site coords
        const mid = [(p[0] + q[0]) / 2 + ne * 2.5, (p[1] + q[1]) / 2 + nn * 2.5];
        const road = nearestRoad(site, mid);
        if (!road || road.dist > 3.2) continue;
        gutters.push(gutterGeometry(p, q, ne, nn, 0.25));
        // Walls along the alleys stay blank: nothing in the photo shows
        // them, and the spider's feet land on them.
        const alley = /impasse/i.test(road.name || '') || road.nature === 'Sentier';
        facade.push(...facadeMeshes(b, p, q, len, ne, nn, eave, rnd, mats, alley));
      }
    }
  }
  for (const g of walls) { const m = new THREE.Mesh(g, mats.wall); m.castShadow = m.receiveShadow = true; m.name = 'walls'; group.add(m); }
  for (const g of roofs) { const m = new THREE.Mesh(g, mats.tile); m.castShadow = m.receiveShadow = true; m.name = 'roofs'; group.add(m); }
  for (const g of gutters) { const m = new THREE.Mesh(g, mats.setts); m.position.y = 0.01; m.receiveShadow = true; m.name = 'strips'; group.add(m); }
  for (const m of facade) { m.name = 'facade'; group.add(m); }

  // The corner of the impasse, as in the photo: the street plaque on the
  // north face of the annexe west of the mouth, and the no-parking disc
  // sticking out from the same corner.
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(...PLAQUE_SIZE), mats.plaque);
  plaque.position.copy(V(-1.15, 2.35, -1.985));
  plaque.lookAt(plaque.position.clone().add(new THREE.Vector3(0, 0, -1)));
  plaque.name = 'facade'; group.add(plaque);
  const sign = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), mats.noParking);
  sign.position.copy(V(-0.75, 2.95, -1.72));
  sign.lookAt(sign.position.clone().add(new THREE.Vector3(1, 0, 0)));
  sign.castShadow = true; sign.name = 'facade'; group.add(sign);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0x777777 }));
  post.rotation.x = Math.PI / 2; post.position.copy(V(-0.75, 2.95, -1.86)); post.name = 'facade'; group.add(post);

  // Plants from the photo, placed along the alley and at its mouth.
  if (textureLoader) loads.push(addPlants(site, group, textureLoader, opts.onTexture));

  setGroundMode(group, opts.ground || 'lane');
  group.userData.ready = Promise.all(loads); // resolves once every image is in
  return group;
}

export function setGroundMode(group, mode) {
  group.traverse(o => {
    if (o.name === 'ground-lane') o.visible = mode !== 'ortho';
    if (o.name === 'ground-ortho') o.visible = mode === 'ortho';
    if (o.name === 'strips') o.visible = mode !== 'ortho';
  });
}
export function setPlantsVisible(group, visible) {
  group.traverse(o => { if (o.name === 'plants') o.visible = visible; });
}

// Vertical walls along a ring, UVs in meters (u along the wall, v up).
function wallGeometry(ring, height) {
  const pos = [], uv = [], idx = [];
  let u = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const p = ring[i], q = ring[i + 1];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1e-6) continue;
    const base = pos.length / 3;
    for (const [pt, y, uu] of [[p, 0, u], [q, 0, u + len], [q, height, u + len], [p, height, u]]) {
      pos.push(pt[0], y, -pt[1]); uv.push(uu, y);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    u += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A thin slab the shape of the footprint at eave height: the overhanging
// row of tiles seen from the street.
function eaveSlab(poly, eave) {
  const shape = new THREE.Shape(poly.outer.map(([e, n]) => new THREE.Vector2(e, n)));
  for (const hole of poly.holes) shape.holes.push(new THREE.Path(hole.map(([e, n]) => new THREE.Vector2(e, n))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, eave, 0);
  return geo;
}

// A gable roof for a four-corner footprint (ridge along the long axis), or a
// flat slab for anything else. Scene coordinates, UVs in meters.
function roofGeometry(poly, eave, ridgeAbove) {
  const ring = poly.outer.slice(0, -1);
  if (poly.holes.length === 0 && ring.length === 4) {
    const P = ring.map(([e, n]) => V(e, eave, n));
    const d = i => P[i].distanceTo(P[(i + 1) % 4]);
    const longFirst = d(0) + d(2) >= d(1) + d(3);
    const mid = (i, j) => P[i].clone().add(P[j]).multiplyScalar(0.5).setY(eave + ridgeAbove);
    let A, B, faces;
    if (longFirst) {
      A = mid(3, 0); B = mid(1, 2);
      faces = [[P[0], P[1], B, A], [P[2], P[3], A, B], [P[1], P[2], B], [P[3], P[0], A]];
    } else {
      A = mid(0, 1); B = mid(2, 3);
      faces = [[P[1], P[2], B, A], [P[3], P[0], A, B], [P[2], P[3], B], [P[0], P[1], A]];
    }
    const pos = [], uv = [], idx = [];
    for (const f of faces) {
      const n = new THREE.Vector3().crossVectors(f[1].clone().sub(f[0]), f[2].clone().sub(f[0])).normalize();
      let ua = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n);
      if (ua.lengthSq() < 1e-6) ua.set(1, 0, 0); else ua.normalize();
      const va = new THREE.Vector3().crossVectors(n, ua).normalize();
      const base = pos.length / 3;
      for (const p of f) { pos.push(p.x, p.y, p.z); const r = p.clone().sub(f[0]); uv.push(r.dot(ua), r.dot(va)); }
      for (let i = 1; i + 1 < f.length; i++) idx.push(base, base + i, base + i + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  const shape = new THREE.Shape(poly.outer.map(([e, n]) => new THREE.Vector2(e, n)));
  for (const hole of poly.holes) shape.holes.push(new THREE.Path(hole.map(([e, n]) => new THREE.Vector2(e, n))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, eave + 0.12, 0);
  return geo;
}

// Windows with shutters and a door along a street-facing wall.
function facadeMeshes(b, p, q, len, ne, nn, eave, rnd, mats, alley = false) {
  const out = [];
  const dir = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
  const place = (s, y, size, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
    const e = p[0] + dir[0] * s + ne * 0.02, n = p[1] + dir[1] * s + nn * 0.02;
    m.position.copy(V(e, y, n));
    m.lookAt(m.position.clone().add(new THREE.Vector3(ne, 0, -nn)));
    m.castShadow = false;
    return m;
  };
  const residential = b.usage === 'Résidentiel' || b.usage === 'Indifférencié' || !b.usage;
  const annexe = b.usage === 'Annexe' || b.light;
  const floors = b.floors || 1;
  if (annexe || alley) {
    if (len >= 2.6 && rnd() < 0.7) out.push(place(len / 2, DOOR_SIZE[1] / 2, DOOR_SIZE, mats.door));
    return out;
  }
  const slots = [];
  for (let s = 1.3; s + 1.0 < len - 0.5; s += 3.0) slots.push(s);
  if (slots.length === 0) return out;
  const doorSlot = residential && len >= 4.5 ? slots[Math.floor(slots.length / 2)] : null;
  for (const s of slots) {
    if (s === doorSlot) out.push(place(s, DOOR_SIZE[1] / 2, DOOR_SIZE, mats.door));
    else if (rnd() < 0.85) out.push(place(s, 1.7, WINDOW_SIZE, mats.window));
    if (floors >= 2 && eave >= 3.6 && rnd() < 0.9) out.push(place(s, Math.min(eave - 0.85, 3.1), WINDOW_SIZE, mats.window));
  }
  return out;
}

// The nearest road to a site point: { dist, name, nature }, or null.
function nearestRoad(site, [e, n]) {
  let best = null;
  for (const r of site.roads) {
    if (!/Route|Sentier|empierr/.test(r.nature || '')) continue;
    for (let i = 0; i + 1 < r.points.length; i++) {
      const dist = segmentDistance(r.points[i], r.points[i + 1], e, n);
      if (!best || dist < best.dist) best = { dist, name: r.name, nature: r.nature };
    }
  }
  return best;
}

// A flat strip of width w on the ground just outside the wall p-q.
function gutterGeometry(p, q, ne, nn, w) {
  const pos = [p[0], 0, -p[1], q[0], 0, -q[1], q[0] + ne * w, 0, -(q[1] + nn * w), p[0] + ne * w, 0, -(p[1] + nn * w)];
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, len, 0, len, w, 0, w], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  g.computeVertexNormals();
  return g;
}

// A flat ribbon of width w along a polyline, shifted `offset` meters to the
// right of the direction of travel. UVs in meters.
function ribbonGeometry(points, w, offset) {
  if (points.length < 2) return null;
  const pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const rx = dy, ry = -dx; // right-hand normal in site coords
    const c = [points[i][0] + rx * offset, points[i][1] + ry * offset];
    if (i > 0) s += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    pos.push(c[0] - rx * w / 2, 0, -(c[1] - ry * w / 2), c[0] + rx * w / 2, 0, -(c[1] + ry * w / 2));
    uv.push(s, 0, s, w);
    if (i > 0) { const k = 2 * i; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Plants: cut-outs from the photo on crossed planes. Placed in the alley
// frame (x along the alley, z across), converted to the scene.
function addPlants(site, group, loader, onLoaded) {
  return fetch('./site/sprites/plants.json').then(r => r.ok ? r.json() : null).then(meta => {
    if (!meta) return;
    const walls = wallsFromSite(site);
    const spots = [
      ['shrub', 1.5, -2.25, 1.0], ['flowers', 2.4, -1.75, 0.9], ['hollyhock', 1.7, -4.9, 1.0], ['bush', 1.6, -7.6, 1.0],
      ['hollyhock', 1.6, 6.5, 0.9], ['bush', 1.6, 10.5, 1.1],
    ];
    const rnd = rng(99);
    const kinds = ['hollyhock', 'flowers', 'bush', 'bush', 'hollyhock'];
    for (let x = 3.6; x < 24; x += 1.6 + rnd() * 1.6) {
      const side = rnd() < 0.5 ? 1 : -1;
      const wz = walls(x, side, 0);
      if (wz === null) continue;
      spots.push([kinds[Math.floor(rnd() * kinds.length)], x, wz - side * 0.3, 0.75 + rnd() * 0.4]);
    }
    const textures = {};
    const pending = Object.entries(meta).map(([name, m]) => new Promise(res => loader.load('./site/sprites/' + m.file, t => { t.colorSpace = THREE.SRGBColorSpace; textures[name] = t; res(); }, undefined, () => res())));
    return Promise.all(pending).then(() => {
      for (const [kind, x, z, scale] of spots) {
        const t = textures[kind]; if (!t) continue;
        const h = meta[kind].height * scale, w = h * meta[kind].aspect;
        const mat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
        const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t, alphaTest: 0.5 });
        const [e, n] = site.frame.toSite(x, z);
        const plant = new THREE.Group();
        for (const rot of [0, Math.PI / 2]) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
          m.customDepthMaterial = depth;
          m.rotation.y = site.frame.yaw + rot;
          m.position.y = h / 2;
          m.castShadow = true;
          plant.add(m);
        }
        plant.position.copy(V(e, 0, n));
        plant.name = 'plants';
        group.add(plant);
      }
      if (onLoaded) onLoaded();
    });
  }).catch(() => {});
}

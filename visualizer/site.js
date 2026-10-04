// The site: buildings, ground, street furniture and plants, from
// site/site.json, dressed with the village materials in textures.js.
// Street View screenshots of the junction and the alley were the
// reference for the layout: which walls carry windows, where the plaque
// and the garage door are, how the ground is paved. The same logic is
// applied, as a guess, to every building nothing shows.
//
// Site coordinates are local east/north meters around the brief's point.
// Scene coordinates (three.js): X = east, Y = up, Z = south (-north).
// The alley frame (see spider.js) has x along the alley from the street
// into the dead end, y up, z across to the right when looking in.

import * as THREE from 'three';
import { villageMaterials, WINDOW_SIZE, SHUTTER_SIZE, DOOR_SIZE, PLAQUE_SIZE, GARAGE_SIZE, SHOPFRONT_SIZE } from './textures.js';

// Corrections to the IGN data from what Daniel knows of the place, by the
// end of the building id: the garage on the south-west corner of the alley
// mouth is two storeys high, not one.
const OVERRIDES = {
  '292742702': { floors: 2, eaveHeight: 5.6 },
};

export async function loadSite(url = './site/site.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error('site data not found: ' + url);
  const site = await res.json();
  for (const b of site.buildings) {
    for (const [suffix, fix] of Object.entries(OVERRIDES)) if (b.id.endsWith(suffix)) Object.assign(b, fix);
  }
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
  // bounding boxes in site coordinates, for walking collisions.
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
// An edge of a counter-clockwise ring: direction and outward normal.
function edgeInfo(p, q) {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const dir = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
  return { p, q, len, dir, ne: dir[1], nn: -dir[0] };
}

// Buildings Street View shows in detail, by the end of their IGN id.
const EAST_HOUSE = '292741319';   // east side of the alley mouth: plaque, vine, shuttered windows
const GARAGE = '292742702';       // west side of the mouth: the sage double door on its corner face
const CORNER_SHOP = '292742723';  // on the square: sage shop front

// Build the ground, buildings, street surface, signs and plants into a
// group in scene coordinates. opts.ground: 'lane' (textured) or 'ortho'.
export function buildSiteMeshes(site, textureLoader, opts = {}) {
  const group = new THREE.Group();
  group.name = 'site';
  const mats = villageMaterials();
  const half = site.ortho.halfWidth;

  // Ground: the gravel lane everywhere, and the orthophoto as an alternative.
  const laneMat = mats.lane.clone(); laneMat.map = mats.lane.map.clone(); laneMat.map.repeat.set(half * 2, half * 2); laneMat.map.needsUpdate = true;
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), laneMat);
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

  // The small square where Rue du Gros Jonc meets Rue de Trousse Chemise is
  // paved in setts edge to edge, and so is the mouth of the alley.
  for (const ring of [
    [[-18, -1.6], [-3.2, -1.7], [-3.2, 2.2], [-8, 7.8], [-14.5, 7.2], [-18, 3.2]],
    [[-0.6, -1.7], [4.0, -1.7], [3.9, -4.6], [0.9, -4.6]],
  ]) {
    const geo = new THREE.ShapeGeometry(new THREE.Shape(ring.map(([e, n]) => new THREE.Vector2(e, n))));
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mats.setts);
    m.position.y = 0.013; m.receiveShadow = true; m.name = 'strips';
    group.add(m);
  }

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
  const walls = [], reveals = [], roofs = [], facade = [], gutters = [], extras = [];
  for (const b of site.buildings) {
    const eave = b.eaveHeight || 3.5;
    for (const poly of b.polygons) {
      const outer = ringArea(poly.outer) < 0 ? poly.outer.slice().reverse() : poly.outer; // counter-clockwise
      const holes = poly.holes.map(h => ringArea(h) > 0 ? h.slice().reverse() : h);          // clockwise

      // Openings on the faces that look onto a street, a gutter strip on
      // the ground beside them, and a downpipe at some corners.
      const openings = new Map();
      for (let i = 0; i + 1 < outer.length; i++) {
        const edge = edgeInfo(outer[i], outer[i + 1]);
        if (edge.len < 2.2) continue;
        const mid = [(edge.p[0] + edge.q[0]) / 2 + edge.ne * 2.5, (edge.p[1] + edge.q[1]) / 2 + edge.nn * 2.5];
        if (insideBuilding(site, mid[0], mid[1], 0)) continue; // a party wall, not a facade
        const road = nearestRoad(site, mid);
        // The shop's wall onto the square is further from a road centreline
        // than the test allows; the square is paved up to it.
        const ontoSquare = b.id.endsWith(CORNER_SHOP) && edge.ne < -0.6;
        if (!road || (road.dist > 3.2 && !ontoSquare)) continue;
        const alley = /impasse/i.test(road.name || '') || road.nature === 'Sentier';
        gutters.push(gutterGeometry(edge, alley ? 0.45 : 0.25));
        const list = layoutOpenings(b, edge, eave, rnd, alley);
        if (list.length) openings.set(i, list);
        const sPipe = rnd() < 0.5 ? 0.2 : edge.len - 0.2;
        if (rnd() < 0.45 && !list.some(o => Math.abs(o.s - sPipe) < o.w / 2 + 0.15)) extras.push(downpipe(edge, eave, sPipe, mats));
      }
      walls.push(wallGeometry(outer, eave, openings));
      for (const h of holes) walls.push(wallGeometry(h, eave, new Map()));
      for (const [i, list] of openings) {
        const edge = edgeInfo(outer[i], outer[i + 1]);
        for (const o of list) {
          const r = openingMeshes(edge, o, mats);
          reveals.push(r.reveal);
          facade.push(...r.meshes);
        }
      }

      const roof = roofGeometry(poly, eave, b.ridgeAbove ?? 1.3, rnd, extras, mats);
      if (roof) roofs.push(roof);
      roofs.push(eaveSlab(poly, eave));
    }
  }
  for (const g of walls) { const m = new THREE.Mesh(g, mats.wall); m.castShadow = m.receiveShadow = true; m.name = 'walls'; group.add(m); }
  for (const g of reveals) { const m = new THREE.Mesh(g, mats.wallBoth); m.receiveShadow = true; m.name = 'walls'; group.add(m); }
  for (const g of roofs) { const m = new THREE.Mesh(g, mats.tile); m.castShadow = m.receiveShadow = true; m.name = 'roofs'; group.add(m); }
  for (const g of gutters) { const m = new THREE.Mesh(g, mats.setts); m.position.y = 0.01; m.receiveShadow = true; m.name = 'strips'; group.add(m); }
  for (const m of facade) { m.name = 'facade'; group.add(m); }
  for (const m of extras) { m.name = 'facade'; group.add(m); }

  // The corner of the impasse, as Street View shows it: the street plaque
  // on the alley-facing wall of the east house, right at its north corner,
  // with the no-parking disc above it standing out from the wall so it
  // faces the street.
  const corner = [3.79, -1.95];                  // the house's north-west corner, from the footprint
  const along = [-0.0276, -0.9996];              // its west wall, going south
  const out = [-0.9996, 0.0276];                 // outward (west) normal
  const at = (s, d, y) => V(corner[0] + along[0] * s + out[0] * d, y, corner[1] + along[1] * s + out[1] * d);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(...PLAQUE_SIZE), mats.plaque);
  plaque.position.copy(at(0.75, 0.02, 2.3));
  plaque.lookAt(plaque.position.clone().add(new THREE.Vector3(out[0], 0, -out[1])));
  plaque.name = 'facade'; group.add(plaque);
  const sign = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), mats.noParking);
  sign.position.copy(at(0.3, 0.32, 2.95));
  sign.lookAt(sign.position.clone().add(new THREE.Vector3(along[0], 0, -along[1])));
  sign.castShadow = true; sign.name = 'facade'; group.add(sign);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8), mats.pipe);
  post.position.copy(at(0.3, 0.16, 2.95));
  post.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(out[0], 0, -out[1]));
  post.name = 'facade'; group.add(post);

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

// ---------------------------------------------------------------- facades

// Joinery colours per building, stable across loads: shutters mostly
// grey-blue, some pale blue, some sage; doors sage, grey-blue or white.
function joinery(b) {
  let h = 0;
  for (const ch of b.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = (h % 100) / 100, r2 = ((h >> 7) % 100) / 100;
  return {
    shutter: r < 0.5 ? 'grey' : r < 0.7 ? 'blue' : 'sage',
    door: r2 < 0.5 ? 'sage' : r2 < 0.75 ? 'grey' : 'white',
  };
}

// Where the openings go on one street-facing wall. Each opening: centre
// `s` along the edge, width `w`, bottom `y0`, top `y1`, and its kind.
function layoutOpenings(b, edge, eave, rnd, alley) {
  const { len } = edge;
  const colours = joinery(b);
  const window = (s, y0 = 1.0, h = WINDOW_SIZE[1], shutter = colours.shutter) => ({ s, w: WINDOW_SIZE[0], y0, y1: y0 + h, kind: 'window', shutter });
  const door = s => ({ s, w: DOOR_SIZE[0], y0: 0, y1: DOOR_SIZE[1], kind: 'door', door: colours.door });
  const upperSill = Math.min(2.5, eave - 0.45 - 1.1);
  const upper = (s, shutter) => window(s, upperSill, 1.1, shutter);
  // Openings must end below the eave; the upper row needs room above the ground row.
  const fit = (list, h) => list.filter(o => o.y1 <= h - 0.15);
  const upperFits = upperSill >= 2.5;
  const residential = b.usage === 'Résidentiel' || b.usage === 'Indifférencié' || !b.usage;
  const annexe = b.usage === 'Annexe' || b.light;
  const floors = b.floors || 1;

  if (b.id.endsWith(GARAGE)) {
    // The double door sits on the chamfered face looking north-east toward
    // the square; the street face has one small window upstairs; the rest
    // is blank.
    if (edge.ne > 0.4 && edge.nn > 0.4) return fit([{ s: len / 2, w: GARAGE_SIZE[0], y0: 0, y1: GARAGE_SIZE[1], kind: 'garage' }], eave);
    if (edge.nn > 0.9 && len > 4) return fit([{ s: len * 0.35, w: 0.7, y0: 3.7, y1: 4.4, kind: 'light' }], eave);
    return [];
  }
  if (b.id.endsWith(EAST_HOUSE) && edge.ne < -0.9) {
    // The alley wall: two grey-shuttered windows near the corner, then an
    // ordinary two-storey run further in.
    const list = [window(2.1, 1.0, 1.3, 'grey'), window(4.9, 1.0, 1.3, 'grey')];
    for (let s = 8.0; s + 1.0 < len - 0.5; s += 3.0) list.push(window(s, 0.9, 1.2, 'grey'), window(s, 2.4, 1.0, 'grey'));
    return fit(list, eave);
  }
  if (b.id.endsWith(CORNER_SHOP) && edge.ne < -0.6) {
    return fit([{ s: len / 2, w: SHOPFRONT_SIZE[0], y0: 0.05, y1: 0.05 + SHOPFRONT_SIZE[1], kind: 'shop' }], eave);
  }
  if (annexe || alley) {
    return len >= 2.6 && rnd() < 0.7 ? fit([door(len / 2)], eave) : [];
  }
  const slots = [];
  for (let s = 1.3; s + 1.0 < len - 0.5; s += 2.8) slots.push(s);
  if (slots.length === 0) return [];
  const doorSlot = residential && len >= 4.5 ? slots[Math.floor(slots.length / 2)] : null;
  const list = [];
  for (const s of slots) {
    if (s === doorSlot) list.push(door(s));
    else if (rnd() < 0.85) list.push(window(s));
    if (floors >= 2 && upperFits && rnd() < 0.9) list.push(upper(s));
  }
  return fit(list, eave);
}

// The reveal (jambs, head and sill, in limewash), the pane at the back of
// the opening, and the shutters hung open on the wall.
function openingMeshes(edge, o, mats) {
  const { p, dir, ne, nn } = edge;
  const depth = o.kind === 'window' ? 0.16 : 0.1;
  const s0 = o.s - o.w / 2, s1 = o.s + o.w / 2;
  // Corner at distance s along the wall, height y, and d inward.
  const P = (s, y, d) => V(p[0] + dir[0] * s - ne * d, y, p[1] + dir[1] * s - nn * d);
  const pos = [], uv = [], idx = [];
  const quad = (a, b2, c, d2, u, v) => {
    const base = pos.length / 3;
    for (const [pt, [uu, vv]] of [[a, [u[0], v[0]]], [b2, [u[1], v[0]]], [c, [u[1], v[1]]], [d2, [u[0], v[1]]]]) { pos.push(pt.x, pt.y, pt.z); uv.push(uu, vv); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  quad(P(s0, o.y0, 0), P(s0, o.y0, depth), P(s0, o.y1, depth), P(s0, o.y1, 0), [s0, s0 + depth], [o.y0, o.y1]); // left jamb
  quad(P(s1, o.y0, 0), P(s1, o.y0, depth), P(s1, o.y1, depth), P(s1, o.y1, 0), [s1, s1 + depth], [o.y0, o.y1]); // right jamb
  quad(P(s0, o.y1, 0), P(s1, o.y1, 0), P(s1, o.y1, depth), P(s0, o.y1, depth), [s0, s1], [o.y1, o.y1 + depth]);   // head
  if (o.y0 > 0.01) quad(P(s0, o.y0, 0), P(s1, o.y0, 0), P(s1, o.y0, depth), P(s0, o.y0, depth), [s0, s1], [o.y0, o.y0 + depth]); // sill
  const reveal = new THREE.BufferGeometry();
  reveal.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  reveal.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  reveal.setIndex(idx);
  reveal.computeVertexNormals();

  const outward = new THREE.Vector3(ne, 0, -nn);
  const plane = (s, y, w, h, d, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.copy(P(s, y, d));
    m.lookAt(m.position.clone().add(outward));
    return m;
  };
  const h = o.y1 - o.y0, yc = (o.y0 + o.y1) / 2;
  const meshes = [];
  if (o.kind === 'window') {
    meshes.push(plane(o.s, yc, o.w, h, depth - 0.01, mats.glazing));
    const leaf = SHUTTER_SIZE[0];
    for (const s of [s0 - leaf / 2 - 0.02, s1 + leaf / 2 + 0.02]) {
      const m = plane(s, yc, leaf, h, -0.02, mats.shutters[o.shutter]);
      m.castShadow = true;
      meshes.push(m);
    }
  } else if (o.kind === 'light') {
    meshes.push(plane(o.s, yc, o.w, h, depth - 0.01, mats.glazing));
  } else if (o.kind === 'door') {
    meshes.push(plane(o.s, yc, o.w, h, depth - 0.01, mats.doors[o.door]));
  } else if (o.kind === 'garage') {
    meshes.push(plane(o.s, yc, o.w, h, depth - 0.01, mats.garage));
  } else if (o.kind === 'shop') {
    meshes.push(plane(o.s, yc, o.w, h, depth - 0.01, mats.shopfront));
  }
  return { reveal, meshes };
}

// A zinc downpipe at distance s along a wall.
function downpipe(edge, eave, s, mats) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, eave, 10), mats.pipe);
  const e = edge.p[0] + edge.dir[0] * s + edge.ne * 0.07, n = edge.p[1] + edge.dir[1] * s + edge.nn * 0.07;
  m.position.copy(V(e, eave / 2, n));
  m.castShadow = true;
  return m;
}

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

// ---------------------------------------------------------------- walls and roofs

// Vertical walls along a ring with the openings cut out, UVs in meters
// (u along the wall, v up). openings: edge index -> list of openings.
function wallGeometry(ring, height, openings) {
  const pos = [], uv = [], idx = [];
  let uBase = 0;
  const rect = (p, dir, sa, sb, ya, yb) => {
    const base = pos.length / 3;
    for (const [s, y] of [[sa, ya], [sb, ya], [sb, yb], [sa, yb]]) {
      pos.push(p[0] + dir[0] * s, y, -(p[1] + dir[1] * s)); uv.push(uBase + s, y);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i + 1 < ring.length; i++) {
    const p = ring[i], q = ring[i + 1];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1e-6) continue;
    const dir = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
    // Columns of openings (ground and upper floor share a column).
    const columns = new Map();
    for (const o of openings.get(i) || []) {
      const key = (o.s - o.w / 2).toFixed(3) + ':' + (o.s + o.w / 2).toFixed(3);
      if (!columns.has(key)) columns.set(key, { s0: o.s - o.w / 2, s1: o.s + o.w / 2, list: [] });
      columns.get(key).list.push(o);
    }
    const cols = [...columns.values()].sort((a, b) => a.s0 - b.s0);
    let cursor = 0;
    for (const c of cols) {
      if (c.s0 > cursor + 1e-6) rect(p, dir, cursor, c.s0, 0, height);
      let y = 0;
      for (const o of c.list.sort((a, b) => a.y0 - b.y0)) {
        if (o.y0 > y + 1e-6) rect(p, dir, c.s0, c.s1, y, o.y0);
        y = Math.max(y, o.y1);
      }
      if (y < height - 1e-6) rect(p, dir, c.s0, c.s1, y, height);
      cursor = c.s1;
    }
    if (cursor < len - 1e-6) rect(p, dir, cursor, len, 0, height);
    uBase += len;
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

// A gable roof for a four-corner footprint (ridge along the long axis),
// with a chimney on the bigger ones, or a flat slab for anything else.
// Scene coordinates, UVs in meters.
function roofGeometry(poly, eave, ridgeAbove, rnd, extras, mats) {
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
    // A chimney on the ridge of the larger roofs.
    const ridge = A.distanceTo(B);
    if (ridge > 5 && rnd() < 0.5) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, ridgeAbove + 0.7, 0.5), mats.chimney);
      c.position.copy(A.clone().lerp(B, 0.25 + rnd() * 0.5)).setY(eave + ridgeAbove * 0.5 + 0.35);
      c.rotation.y = Math.atan2(B.x - A.x, B.z - A.z);
      c.castShadow = true;
      extras.push(c);
    }
    return geo;
  }
  const shape = new THREE.Shape(poly.outer.map(([e, n]) => new THREE.Vector2(e, n)));
  for (const hole of poly.holes) shape.holes.push(new THREE.Path(hole.map(([e, n]) => new THREE.Vector2(e, n))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, eave + 0.12, 0);
  return geo;
}

// A flat strip of width w on the ground just outside the wall.
function gutterGeometry(edge, w) {
  const { p, q, ne, nn, len } = edge;
  const pos = [p[0], 0, -p[1], q[0], 0, -q[1], q[0] + ne * w, 0, -(q[1] + nn * w), p[0] + ne * w, 0, -(p[1] + nn * w)];
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
    if (i > 0) { const k = 2 * i; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- plants

// Plants: cut-outs from the photo on crossed planes. Placed in the alley
// frame (x along the alley, z across), converted to the scene.
function addPlants(site, group, loader, onLoaded) {
  return fetch('./site/sprites/plants.json').then(r => r.ok ? r.json() : null).then(meta => {
    if (!meta) return;
    const walls = wallsFromSite(site);
    const spots = [
      ['shrub', 2.45, -1.28, 1.25],   // the vine on the east house's corner at the mouth
      ['flowers', 1.4, -3.4, 0.9], ['hollyhock', 1.7, -5.6, 1.0], ['bush', 1.6, -7.6, 1.0],
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

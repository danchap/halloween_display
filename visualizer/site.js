// The site: buildings, ground and the alley frame, from site/site.json.
//
// Site coordinates are local east/north meters around the brief's point.
// Scene coordinates (three.js): X = east, Y = up, Z = south (-north).
// The alley frame (see spider.js) has x along the alley from the street
// into the dead end, y up, z across to the right when looking in.

import * as THREE from 'three';

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
  // Every building edge in alley-frame coordinates, for wall finding.
  site.edges = [];
  for (const b of site.buildings) {
    for (const poly of b.polygons) {
      for (const ring of [poly.outer, ...poly.holes]) {
        for (let i = 0; i + 1 < ring.length; i++) {
          const p = site.frame.toAlley(ring[i][0], ring[i][1]);
          const q = site.frame.toAlley(ring[i + 1][0], ring[i + 1][1]);
          site.edges.push({ p, q, building: b });
        }
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

const WALL_COLOR = 0xeae4d8;
const ROOF_COLOR = 0xb0705a;

// Build the ground, buildings and roofs into a group in scene coordinates.
export function buildSiteMeshes(site, textureLoader, opts = {}) {
  const group = new THREE.Group();
  group.name = 'site';

  const half = site.ortho.halfWidth;
  const groundGeo = new THREE.PlaneGeometry(half * 2, half * 2);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xbfb8ad, roughness: 1 });
  if (textureLoader) {
    textureLoader.load('./site/' + site.ortho.file, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      groundMat.map = tex;
      groundMat.color.set(0xffffff);
      groundMat.needsUpdate = true;
      if (opts.onTexture) opts.onTexture();
    });
  }
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2; // plane +y (image top, north) -> scene -Z
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.95 });
  const walls = [], roofs = [];
  for (const b of site.buildings) {
    const eave = b.eaveHeight || 3.5;
    for (const poly of b.polygons) {
      const shape = new THREE.Shape(poly.outer.map(([e, n]) => new THREE.Vector2(e, n)));
      for (const hole of poly.holes) {
        shape.holes.push(new THREE.Path(hole.map(([e, n]) => new THREE.Vector2(e, n))));
      }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: eave, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); // shape (e, n) -> (X = e, Z = -n), extrusion -> +Y
      walls.push(geo);
      const roof = roofGeometry(poly, eave, b.ridgeAbove ?? 1.3);
      if (roof) roofs.push(roof);
    }
  }
  for (const [geos, mat, name] of [[walls, wallMat, 'walls'], [roofs, roofMat, 'roofs']]) {
    for (const g of geos) {
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = name;
      group.add(m);
    }
  }
  return group;
}

// A gable roof for a four-corner footprint (ridge along the long axis), or a
// thin slab for anything else. Scene coordinates.
function roofGeometry(poly, eave, ridgeAbove) {
  const ring = poly.outer.slice(0, -1);
  if (poly.holes.length === 0 && ring.length === 4) {
    const P = ring.map(([e, n]) => new THREE.Vector3(e, eave, -n));
    const d = i => P[i].distanceTo(P[(i + 1) % 4]);
    // Edges 0 and 2 are one pair of opposite sides, 1 and 3 the other.
    const longFirst = d(0) + d(2) >= d(1) + d(3);
    // Ridge runs between the midpoints of the two short sides.
    const mid = (i, j) => P[i].clone().add(P[j]).multiplyScalar(0.5).setY(eave + ridgeAbove);
    let A, B, faces;
    if (longFirst) {
      A = mid(3, 0); B = mid(1, 2);
      faces = [[P[0], P[1], B, A], [P[2], P[3], A, B], [P[1], P[2], B], [P[3], P[0], A]];
    } else {
      A = mid(0, 1); B = mid(2, 3);
      faces = [[P[1], P[2], B, A], [P[3], P[0], A, B], [P[2], P[3], B], [P[0], P[1], A]];
    }
    const tris = [];
    for (const f of faces) {
      for (let i = 1; i + 1 < f.length; i++) tris.push(f[0], f[i], f[i + 1]);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(tris);
    geo.computeVertexNormals();
    // Face winding depends on the footprint's orientation; render both sides.
    geo.userData.doubleSided = true;
    return geo;
  }
  const shape = new THREE.Shape(poly.outer.map(([e, n]) => new THREE.Vector2(e, n)));
  for (const hole of poly.holes) shape.holes.push(new THREE.Path(hole.map(([e, n]) => new THREE.Vector2(e, n))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, eave, 0);
  return geo;
}

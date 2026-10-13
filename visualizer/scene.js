// The 3D world shared by the design page (app.js) and the walk page
// (walk.js): lights, the site, the alley frame group and the spider meshes.

import * as THREE from 'three';
import { loadSite, buildSiteMeshes, setGroundMode as siteGround, setPlantsVisible as sitePlants } from './site.js';
import { HALLOWEEN_NOON, sunVector } from './sun.js';

// The alley, for the sun before the site data is loaded (site.json carries
// the same origin).
const ALLEY_LAT = 46.249891, ALLEY_LON = -1.496728;

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fa6c4);
  scene.fog = new THREE.Fog(0x8fa6c4, 80, 220);

  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6b6050, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  placeSun({ sun }, ALLEY_LAT, ALLEY_LON);

  const alleyGroup = new THREE.Group(); // alley frame -> scene
  scene.add(alleyGroup);
  const spiderGroup = new THREE.Group();
  alleyGroup.add(spiderGroup);
  const extrasGroup = new THREE.Group();
  alleyGroup.add(extrasGroup);
  const guideGroup = new THREE.Group(); // drag guides: the gravity line, the level plane, the wall square
  alleyGroup.add(guideGroup);
  const buildGroup = new THREE.Group(); // the real parts of a construction system (build.js)
  alleyGroup.add(buildGroup);

  return { scene, sun, hemi, alleyGroup, spiderGroup, extrasGroup, guideGroup, buildGroup, joints: [], jointMarkers: [], site: null, siteGroup: null };
}

// Load the site into the world. Resolves with the site, or null when the
// data is missing (a flat ground is added instead). onTexture fires once
// the orthophoto is on the ground.
export async function loadWorldSite(world, { onTexture, ground = 'lane' } = {}) {
  try {
    const site = await loadSite();
    world.site = site;
    world.alleyGroup.position.set(site.frame.start[0], 0, -site.frame.start[1]);
    world.alleyGroup.rotation.y = site.frame.yaw;
    world.alleyGroup.updateMatrixWorld(true);
    const loader = new THREE.TextureLoader();
    world.siteGroup = buildSiteMeshes(site, loader, { onTexture, ground });
    world.siteGroup.traverse(o => {
      if (o.name === 'roofs') { o.material = o.material.clone(); o.material.side = THREE.DoubleSide; }
    });
    world.scene.add(world.siteGroup);
    world.sun.target.position.copy(world.alleyGroup.position);
    const [lat, lon] = (site.origin && site.origin.wgs84) || [ALLEY_LAT, ALLEY_LON];
    placeSun(world, lat, lon);
    world.ready = world.siteGroup.userData.ready || Promise.resolve();
    return site;
  } catch (e) {
    console.error(e);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x9a948a }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    world.scene.add(ground);
    world.ready = Promise.resolve();
    if (onTexture) onTexture();
    return null;
  }
}

// Put the sun where it stands at noon on Halloween over the alley: the
// scene's x is east and its z is south, so the vector [east, up, north]
// becomes (east, up, -north). The light sits 60 m out along that line from
// its target, inside its shadow camera's range.
export function placeSun(world, lat, lon, when = HALLOWEEN_NOON) {
  const [east, up, north] = sunVector(when, lat, lon);
  world.sun.position.copy(world.sun.target.position).add(new THREE.Vector3(east, up, -north).multiplyScalar(60));
}

export function setGroundMode(world, mode) { if (world.siteGroup) siteGround(world.siteGroup, mode); }
export function setPlantsVisible(world, visible) { if (world.siteGroup) sitePlants(world.siteGroup, visible); }

export function setRoofsVisible(world, visible) {
  if (world.siteGroup) world.siteGroup.traverse(o => { if (o.name === 'roofs') o.visible = visible; });
}

export function setSilhouetteBackground(world, on) {
  world.scene.background.set(on ? 0xf2f2f2 : 0x8fa6c4);
  world.scene.fog.color.copy(world.scene.background);
}

// ---------------------------------------------------------------- spider meshes

// Dark charcoal with some sheen rather than pure black, so the sun models
// the body and legs and their shape reads in 3D (Daniel, 2026-10-07).
const spiderLit = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.45, metalness: 0.12 });
const spiderFlat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0xe8822a, roughness: 0.6 });
const badMat = new THREE.MeshStandardMaterial({ color: 0xe05a4a, roughness: 0.6 });
const personMat = new THREE.MeshStandardMaterial({ color: 0x5a7fa8, roughness: 0.8 });
const flatWallMat = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
const pickMat = new THREE.MeshBasicMaterial({ visible: false }); // hit targets around the joint markers, never drawn
const guideFill = new THREE.MeshBasicMaterial({ color: 0xe8822a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
const guideLine = new THREE.LineBasicMaterial({ color: 0xe8822a });

const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 24, 1);
unitCyl.translate(0, 0.5, 0); // spans y in [0, 1]
const unitBox = new THREE.BoxGeometry(1, 1, 1);
unitBox.translate(0, 0.5, 0); // spans y in [0, 1]
const unitSphere = new THREE.SphereGeometry(1, 20, 14);
const bodyGeos = {
  cylinder: (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 40, 1); g.rotateZ(-Math.PI / 2); return g; })(),
  ellipsoid: new THREE.SphereGeometry(1, 40, 24),
};
const shared = new Set([unitCyl, unitBox, unitSphere, ...Object.values(bodyGeos)]);

function segmentMesh(a, b, diameter, mat, geometry = unitCyl) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 1e-4) return new THREE.Group(); // a folded leg can have a zero-length segment
  const m = new THREE.Mesh(geometry, mat);
  m.position.copy(from);
  // A box is scaled by its full width, a cylinder by its radius.
  const k = geometry === unitBox ? diameter : diameter / 2;
  m.scale.set(k, len, k);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}
// The body segment as a capsule, ellipsoid or cylinder, as the design page draws it.
function bodyMesh(seg, bodyShape, mat) {
  const len = seg.length;
  let m;
  if (bodyShape === 'capsule') {
    // Round caps: the straight part is stretched in the geometry, the
    // cross-section by the mesh scale.
    const r = Math.max(seg.width, seg.height) / 2;
    const straight = Math.max(0.01, len - 2 * r);
    const g = new THREE.CapsuleGeometry(1, straight / r, 8, 32); g.rotateZ(-Math.PI / 2);
    m = new THREE.Mesh(g, mat);
    m.scale.set(r, seg.height / 2, seg.width / 2);
  } else if (bodyShape === 'ellipsoid') {
    m = new THREE.Mesh(bodyGeos.ellipsoid, mat);
    m.scale.set(len / 2, seg.height / 2, seg.width / 2);
  } else {
    m = new THREE.Mesh(bodyGeos.cylinder, mat);
    m.scale.set(len, seg.height / 2, seg.width / 2);
  }
  m.position.set(...seg.center);
  m.rotation.z = seg.rotZ;
  m.castShadow = true;
  return m;
}
function sphereMesh(p, diameter, mat) {
  const m = new THREE.Mesh(unitSphere, mat);
  m.position.set(...p);
  m.scale.setScalar(diameter / 2);
  m.castShadow = true;
  return m;
}
function clearGroup(group) {
  while (group.children.length) {
    const c = group.children.pop();
    c.traverse(o => { if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose(); });
  }
}

// Rebuild the spider meshes from a geometry model (buildSpider output).
// With showSpider false only the joint markers are drawn: the build meshes
// (rebuildBuildMeshes) then show the body and legs as real parts.
export function rebuildSpiderMeshes(world, model, params, { silhouette = false, showJoints = true, showSpider = true } = {}) {
  const p = params;
  clearGroup(world.spiderGroup);
  const mat = silhouette ? spiderFlat : spiderLit;

  if (showSpider) for (const seg of [model.abdomen, model.head]) world.spiderGroup.add(bodyMesh(seg, p.bodyShape, mat));

  // Joint markers double as drag handles. The visible ball is picked
  // first, so a click on a ball always takes that joint; around each ball
  // an invisible, larger sphere catches near misses.
  world.jointMarkers = [];
  world.joints = [];
  const handle = (point, diameter, mat, joint, leg) => {
    const ball = sphereMesh(point, diameter, mat);
    const pick = sphereMesh(point, Math.max(0.3, diameter * 2.5), pickMat);
    pick.castShadow = false;
    ball.userData = pick.userData = { joint, pair: leg.pair, side: leg.side };
    world.spiderGroup.add(ball, pick);
    world.jointMarkers.push(ball);
    world.joints.push(pick);
  };

  for (const leg of model.legs) {
    const bad = leg.status !== 'ok';
    const legMat = bad && !silhouette ? badMat : mat;
    // Start the upper segment a little inside the head so the joint is hidden.
    const inset = [leg.root[0], leg.root[1], leg.root[2] - Math.sign(leg.root[2] - model.head.center[2]) * Math.min(0.05, model.head.width / 4)];
    if (showSpider) {
      world.spiderGroup.add(segmentMesh(inset, leg.knee, p.upperDiameter, legMat));
      world.spiderGroup.add(segmentMesh(leg.knee, leg.foot, p.lowerDiameter, legMat));
      world.spiderGroup.add(sphereMesh(leg.knee, Math.max(p.upperDiameter, p.lowerDiameter), legMat));
    }
    if (showJoints && !silhouette) {
      handle(leg.knee, Math.max(0.08, p.upperDiameter * 1.6), bad ? badMat : jointMat, 'knee', leg);
      handle(leg.foot, Math.max(0.08, p.lowerDiameter * 1.6), bad ? badMat : jointMat, 'foot', leg);
    }
  }
}

// ---------------------------------------------------------------- build meshes

// Materials for the real parts, by colour and finish: matte for PVC and
// paint, metal for aluminium, and the spider's own charcoal sheen for the
// covers and the shell.
const buildMats = new Map();
function buildMat(color, finish) {
  const key = `${color}|${finish}`;
  if (!buildMats.has(key)) {
    const look = { matte: { roughness: 0.7, metalness: 0.0 }, paint: { roughness: 0.75, metalness: 0.0 },
      metal: { roughness: 0.3, metalness: 0.85 }, sheen: { roughness: 0.45, metalness: 0.12 } }[finish] || { roughness: 0.7, metalness: 0 };
    buildMats.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(color), ...look }));
  }
  return buildMats.get(key);
}

// Draw the parts of a construction system (buildParts output): members as
// cylinders or boxes between their endpoints, fittings as short thicker
// cylinders along each socket direction from the joint centre (a hinge,
// a lap joint, a clamp or a bracket as a small plate; a reducer as a
// stepped cylinder), couplers where a member is split, the hub, posts and
// skis, the stay or tie cords and the sandbags, the rigid bases (a pair
// of angle brackets as two L-plates at the post foot, a plywood gusset as
// a triangular prism on the alley side, two pipe clips as rings around
// the stub, a lap splice as a plate), the wall hooks as short cylinders
// out of the wall, and unless frameOnly the covers and the body shell;
// with frameOnly the hoops show as rings instead of the shell. Every mesh
// carries its part's role in userData.
const STAY_DRAWN_OD = 0.012; // a 4 mm cord is drawn this thick so it shows
const PLATE_KINDS = new Set(['hinge', 'lap', 'clamp', 'bracket']);
const CORNER_KINDS = new Set(['elbow', 'tee', 'cross']); // fittings with a corner body at the joint centre
export function rebuildBuildMeshes(world, parts, system, { frameOnly = false } = {}) {
  clearGroup(world.buildGroup);
  if (!parts || !system) return;
  const g = world.buildGroup;
  const square = parts.members.some(m => m.shape === 'square');
  const add = (mesh, role) => { mesh.userData.role = role; g.add(mesh); return mesh; };
  for (const m of parts.members) {
    if (m.role === 'cover') { if (!frameOnly) add(segmentMesh(m.a, m.b, m.od, buildMat(m.color, m.finish)), m.role); continue; }
    if (m.role === 'stay' || m.role === 'tie') { add(segmentMesh(m.a, m.b, Math.max(m.od, STAY_DRAWN_OD), buildMat(m.color, m.finish)), m.role); continue; }
    if (m.role === 'ballast') {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(m.dims[0], m.dims[1], m.dims[2]), buildMat(m.color, m.finish));
      bag.position.set(...m.at);
      bag.castShadow = true;
      add(bag, m.role);
      continue;
    }
    const box = m.shape === 'square';
    add(segmentMesh(m.a, m.b, box ? m.size : m.od, buildMat(m.color, m.finish), box ? unitBox : unitCyl), m.role);
  }
  for (const f of parts.fittings) {
    const mat = buildMat(f.color, f.finish);
    const along = (d, k) => [f.at[0] + d[0] * k, f.at[1] + d[1] * k, f.at[2] + d[2] * k];
    const box = f.shape ? f.shape === 'square' : square;
    if (f.kind === 'brackets') {
      // Two L-plates at the post foot, one on each face of the post
      // along the ski (dirs), each with a leg up the post and a leg
      // along the ski; f.post is the post's width, f.od the bracket's.
      const half = (f.post || 0.045) / 2, t = 0.003, leg = f.centreToEnd;
      for (const d of f.dirs) {
        const up = new THREE.Mesh(unitBox, mat);
        up.scale.set(t, leg, f.od);
        up.position.set(f.at[0] + d[0] * (half + t / 2), f.at[1], f.at[2]);
        const out = new THREE.Mesh(unitBox, mat);
        out.scale.set(leg, t, f.od);
        out.position.set(f.at[0] + d[0] * (half + leg / 2), f.at[1] - t / 2, f.at[2]);
        up.castShadow = out.castShadow = true;
        add(up, f.role); add(out, f.role);
      }
      continue;
    }
    if (f.kind === 'gusset') {
      // A right triangle with legs of f.centreToEnd along dirs[0] (the
      // ski) and dirs[1] (the post), f.od thick, its corner at f.at.
      const leg = f.centreToEnd;
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(leg, 0), new THREE.Vector2(0, leg)]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: f.od, bevelEnabled: false });
      geo.translate(0, 0, -f.od / 2);
      const prism = new THREE.Mesh(geo, mat);
      const u = new THREE.Vector3(...f.dirs[0]).normalize(), v = new THREE.Vector3(...f.dirs[1]).normalize();
      const n = u.clone().cross(v).normalize();
      prism.matrix.makeBasis(u, v, n);
      prism.matrix.setPosition(new THREE.Vector3(...f.at));
      prism.matrixAutoUpdate = false;
      prism.castShadow = true;
      add(prism, f.role);
      continue;
    }
    if (f.kind === 'clips') {
      // Two rings around the stub, f.centreToEnd each side of f.at along
      // the stub (dirs[0]); the ring's radius is the stub's (f.odTo, the
      // stub's outside size from build.js; Ø 40 if missing) plus the band.
      const axis = new THREE.Vector3(...f.dirs[0]).normalize();
      for (const k of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry((f.odTo || 0.04) / 2 + f.od, f.od, 8, 24), mat);
        ring.position.set(...along(f.dirs[0], k * f.centreToEnd));
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
        ring.castShadow = true;
        add(ring, f.role);
      }
      continue;
    }
    if (PLATE_KINDS.has(f.kind)) {
      // A plate across the joint, its long side along the first member.
      const plate = new THREE.Mesh(unitBox, mat);
      plate.position.set(...f.at);
      plate.scale.set(f.od, f.centreToEnd * 2, 0.004);
      const dir = new THREE.Vector3(...f.dirs[0]).normalize();
      plate.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      plate.position.sub(dir.clone().multiplyScalar(f.centreToEnd)); // centred on the joint along the first member
      plate.castShadow = true;
      add(plate, f.role);
      continue;
    }
    if (f.kind === 'reducer') {
      // The small socket toward the foot fitting (dirs[0]), the big one toward the post (dirs[1]).
      add(segmentMesh(f.at, along(f.dirs[0], f.centreToEnd), f.odTo, mat), f.role);
      add(segmentMesh(f.at, along(f.dirs[1], f.centreToEnd), f.od, mat), f.role);
      continue;
    }
    if (CORNER_KINDS.has(f.kind)) add(sphereMesh(f.at, f.od, mat), f.role); // the corner body of an elbow, tee or cross; a cap or a coupler is its socket cylinder alone
    for (const d of f.dirs) {
      const end = along(d, f.centreToEnd);
      if (f.kind === 'coupler') {
        add(segmentMesh(along(d, -f.centreToEnd), end, f.od, mat, box ? unitBox : unitCyl), f.role);
      } else {
        add(segmentMesh(f.at, end, f.od, mat, box ? unitBox : unitCyl), f.role);
      }
    }
  }
  if (parts.hub.plank) {
    const pl = parts.hub.plank;
    const box = new THREE.Mesh(new THREE.BoxGeometry(pl.length, pl.thickness, pl.width), buildMat(pl.color, pl.finish));
    box.position.set(...pl.centre);
    box.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(...pl.axis).normalize());
    box.castShadow = true;
    add(box, 'plank');
  }
  const bodyMat = buildMat(parts.body.color, parts.body.finish);
  if (frameOnly) {
    for (const h of parts.body.hoops) {
      // A ring of the hoop's width, squashed to its height; the tube is
      // the hoop pipe's radius.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(h.width / 2, parts.body.hoopOd / 2, 10, 40), bodyMat);
      ring.scale.set(1, h.height / Math.max(1e-6, h.width), 1);
      ring.position.set(...h.centre);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...h.axis).normalize());
      ring.castShadow = true;
      add(ring, 'hoop');
    }
  } else {
    for (const seg of parts.body.shell) add(bodyMesh(seg, 'capsule', bodyMat), 'shell');
  }
}

// The person for scale and the optional flat walls.
export function rebuildExtras(world, params, { showPerson = true, wallMode = 'site', flatWidth = 3 } = {}) {
  clearGroup(world.extrasGroup);
  const p = params;
  if (showPerson) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.1, 4, 12), personMat);
    body.position.y = 0.17 + 0.55 + 0.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), personMat);
    head.position.y = 1.75 - 0.11;
    g.add(body, head);
    g.position.set(p.along - 2.0, 0, 0.5);
    g.traverse(o => { o.castShadow = true; });
    world.extrasGroup.add(g);
  }
  if (wallMode === 'flat') {
    for (const side of [1, -1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 7), flatWallMat);
      wall.rotation.y = Math.PI / 2;
      wall.position.set(p.along, 3.5, side * flatWidth / 2);
      world.extrasGroup.add(wall);
    }
  }
}

// ---------------------------------------------------------------- drag guides

// Show the guide a joint is being moved along, in the alley frame: 'line'
// is the vertical line through the point, 'across' the horizontal line
// across the alley through it, 'level' a square in the horizontal plane
// through it, 'wall' a square in the vertical plane along the alley (normal
// across the alley), nudged `inward` toward the alley when it lies in a
// wall so it does not fight the wall for the pixels.
export function showGuide(world, kind, point, { inward = 0 } = {}) {
  hideGuide(world);
  const g = world.guideGroup;
  if (kind === 'line' || kind === 'across') {
    const ends = kind === 'line'
      ? [new THREE.Vector3(point[0], 0, point[2]), new THREE.Vector3(point[0], Math.max(point[1] + 3, 6), point[2])]
      : [new THREE.Vector3(point[0], point[1], point[2] - 1.6), new THREE.Vector3(point[0], point[1], point[2] + 1.6)];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ends), guideLine));
    return;
  }
  const size = 1.6;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), guideFill);
  if (kind === 'level') plane.rotation.x = -Math.PI / 2;
  plane.position.set(point[0], point[1], point[2] + (kind === 'wall' ? inward * 0.01 : 0));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(plane.geometry), guideLine);
  edges.position.copy(plane.position);
  edges.rotation.copy(plane.rotation);
  g.add(plane, edges);
  if (kind === 'wall') {
    // The plane's two directions drawn long, so it reads as vertical and
    // along the alley from any viewpoint, even from right underneath: a
    // plumb line down to the ground and a line along the alley.
    const z = plane.position.z;
    const plumb = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(point[0], 0, z), new THREE.Vector3(point[0], point[1] + 1.5, z)]);
    const along = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(point[0] - 2.5, point[1], z), new THREE.Vector3(point[0] + 2.5, point[1], z)]);
    g.add(new THREE.Line(plumb, guideLine), new THREE.Line(along, guideLine));
  }
}

export function hideGuide(world) {
  clearGroup(world.guideGroup);
}

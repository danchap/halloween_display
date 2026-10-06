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

  return { scene, sun, hemi, alleyGroup, spiderGroup, extrasGroup, guideGroup, joints: [], jointMarkers: [], site: null, siteGroup: null };
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

const spiderLit = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.75, metalness: 0.05 });
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
const unitSphere = new THREE.SphereGeometry(1, 20, 14);
const bodyGeos = {
  cylinder: (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 40, 1); g.rotateZ(-Math.PI / 2); return g; })(),
  ellipsoid: new THREE.SphereGeometry(1, 40, 24),
};
const shared = new Set([unitCyl, unitSphere, ...Object.values(bodyGeos)]);

function segmentMesh(a, b, diameter, mat) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 1e-4) return new THREE.Group(); // a folded leg can have a zero-length segment
  const m = new THREE.Mesh(unitCyl, mat);
  m.position.copy(from);
  m.scale.set(diameter / 2, len, diameter / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
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
export function rebuildSpiderMeshes(world, model, params, { silhouette = false, showJoints = true } = {}) {
  const p = params;
  clearGroup(world.spiderGroup);
  const mat = silhouette ? spiderFlat : spiderLit;

  for (const seg of [model.abdomen, model.head]) {
    const len = seg.length;
    let m;
    if (p.bodyShape === 'capsule') {
      // Round caps: the straight part is stretched in the geometry, the
      // cross-section by the mesh scale.
      const r = Math.max(seg.width, seg.height) / 2;
      const straight = Math.max(0.01, len - 2 * r);
      const g = new THREE.CapsuleGeometry(1, straight / r, 8, 32); g.rotateZ(-Math.PI / 2);
      m = new THREE.Mesh(g, mat);
      m.scale.set(r, seg.height / 2, seg.width / 2);
    } else if (p.bodyShape === 'ellipsoid') {
      m = new THREE.Mesh(bodyGeos.ellipsoid, mat);
      m.scale.set(len / 2, seg.height / 2, seg.width / 2);
    } else {
      m = new THREE.Mesh(bodyGeos.cylinder, mat);
      m.scale.set(len, seg.height / 2, seg.width / 2);
    }
    m.position.set(...seg.center);
    m.rotation.z = seg.rotZ;
    m.castShadow = true;
    world.spiderGroup.add(m);
  }

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
    world.spiderGroup.add(segmentMesh(inset, leg.knee, p.upperDiameter, legMat));
    world.spiderGroup.add(segmentMesh(leg.knee, leg.foot, p.lowerDiameter, legMat));
    world.spiderGroup.add(sphereMesh(leg.knee, Math.max(p.upperDiameter, p.lowerDiameter), legMat));
    if (showJoints && !silhouette) {
      handle(leg.knee, Math.max(0.08, p.upperDiameter * 1.6), bad ? badMat : jointMat, 'knee', leg);
      handle(leg.foot, Math.max(0.08, p.lowerDiameter * 1.6), bad ? badMat : jointMat, 'foot', leg);
    }
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

// The 3D world shared by the design page (app.js) and the walk page
// (walk.js): lights, the site, the alley frame group and the spider meshes.

import * as THREE from 'three';
import { loadSite, buildSiteMeshes, setGroundMode as siteGround, setPlantsVisible as sitePlants } from './site.js';

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fa6c4);
  scene.fog = new THREE.Fog(0x8fa6c4, 80, 220);

  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6b6050, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
  sun.position.set(30, 45, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  const alleyGroup = new THREE.Group(); // alley frame -> scene
  scene.add(alleyGroup);
  const spiderGroup = new THREE.Group();
  alleyGroup.add(spiderGroup);
  const extrasGroup = new THREE.Group();
  alleyGroup.add(extrasGroup);

  return { scene, sun, hemi, alleyGroup, spiderGroup, extrasGroup, site: null, siteGroup: null };
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
    const len = seg.x1 - seg.x0;
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
    m.position.set((seg.x0 + seg.x1) / 2, seg.y, seg.z);
    m.castShadow = true;
    world.spiderGroup.add(m);
  }

  for (const leg of model.legs) {
    const bad = leg.status !== 'ok';
    const legMat = bad && !silhouette ? badMat : mat;
    // Start the upper segment a little inside the head so the joint is hidden.
    const inset = [leg.root[0], leg.root[1], leg.root[2] - Math.sign(leg.root[2] - model.head.z) * Math.min(0.05, model.head.width / 4)];
    world.spiderGroup.add(segmentMesh(inset, leg.knee, p.upperDiameter, legMat));
    world.spiderGroup.add(segmentMesh(leg.knee, leg.foot, p.lowerDiameter, legMat));
    world.spiderGroup.add(sphereMesh(leg.knee, Math.max(p.upperDiameter, p.lowerDiameter), legMat));
    if (showJoints && !silhouette) {
      world.spiderGroup.add(sphereMesh(leg.knee, Math.max(0.08, p.upperDiameter * 1.6), bad ? badMat : jointMat));
      world.spiderGroup.add(sphereMesh(leg.foot, Math.max(0.08, p.lowerDiameter * 1.6), bad ? badMat : jointMat));
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
      wall.position.set(p.along, 3.5, p.across + side * flatWidth / 2);
      world.extrasGroup.add(wall);
    }
  }
}

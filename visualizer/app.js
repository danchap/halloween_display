import * as THREE from 'three';
import { LOCKED, BEND_SERIES, DEFAULTS, briefPreset, buildSpider, bodyLength, bendFactor,
         flatWalls, solveFeetForLength, kneeFromBend, kneeParamsAt, footParamsAt, upgradeParams, legIndex, legOf } from './spider.js';
import { wallsFromSite, insideBuilding } from './site.js';
import { createWorld, loadWorldSite, rebuildSpiderMeshes, rebuildExtras, setRoofsVisible,
         setSilhouetteBackground, setGroundMode, setPlantsVisible, showGuide, hideGuide } from './scene.js';
import { buildPath, cameraAt } from './walk.js';

// Hosted on claude.ai the page cannot use the URL hash or start downloads;
// the design is then remembered in the browser instead.
const HOSTED = Boolean(window.HOSTED) || /claude\.ai$/.test(location.hostname);
const STORAGE_KEY = 'alley-spider-design-v3';   // the working state, written on every change
const DESIGNS_KEY = 'alley-spider-designs-v1';  // the named designs saved with "Save as…"

// ---------------------------------------------------------------- parameters

const SLIDERS = [
  { group: 'Body', open: true, items: [
    ['abdomenLength', 'Abdomen length', 0.2, 2.0, 0.005],
    ['abdomenWidth', 'Abdomen width', 0.1, 1.5, 0.005],
    ['abdomenHeight', 'Abdomen height', 0.1, 1.5, 0.005],
    ['headLength', 'Head length (in front of the abdomen)', 0.05, 1.0, 0.005],
    ['headWidth', 'Head width', 0.05, 1.0, 0.005],
    ['headHeight', 'Head height', 0.05, 1.0, 0.005],
    ['headLift', 'Head lift (axis above abdomen)', -0.5, 0.5, 0.005],
  ]},
  { group: 'Body position', open: true, items: [
    ['along', 'Along the alley (from the street)', 0, 45, 0.05],
    ['bodyHeight', 'Body centre height', 0.5, 5, 0.01],
    ['across', 'Across the alley (+ is right, looking in)', -1.5, 1.5, 0.01],
    ['pitch', 'Pitch of the whole spider, ° (head up is +)', -80, 80, 1],
  ]},
  { group: 'Leg thickness', open: false, items: [
    ['upperDiameter', 'Upper segment diameter', 0.005, 0.25, 0.005],
    ['lowerDiameter', 'Lower segment diameter', 0.005, 0.25, 0.005],
  ]},
];

const state = {
  params: clone(DEFAULTS),
  briefL: 0.8,
  backBend: 60,
  design: '',         // name of the loaded saved design; '' is the brief defaults
  mirror: false,      // a drag moves both legs of a pair
  silhouette: false,
  showPerson: true,
  showRoofs: true,
  showJoints: true,
  ground: 'lane',     // 'lane' (materials from the photo) or 'ortho'
  plants: true,
};
const SAVED_KEYS = Object.keys(state);
// Which panels show. Not remembered: the numbers start hidden every visit.
const panes = { left: true, numbers: false };

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '–'; }

// Parameters saved by earlier versions of this page are brought up to date
// on the way in; pairs saved with a bend and an upper length are converted
// once the walls are known (see rebuildSpider).
function normalizeParams(params) { return upgradeParams(clone(params)); }

// ---------------------------------------------------------------- saved state

function applySaved(s) {
  if (!s || typeof s !== 'object' || !s.params) return false;
  for (const k of SAVED_KEYS) if (k in s) state[k] = s[k];
  state.params = normalizeParams(s.params);
  return true;
}
function readState() {
  try {
    const h = location.hash.slice(1);
    if (h && h.startsWith('%7B')) return applySaved(JSON.parse(decodeURIComponent(h)));
  } catch (e) { console.warn('ignoring bad URL state', e); }
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return applySaved(JSON.parse(s));
  } catch (e) { /* storage unavailable */ }
  return false;
}
let saveTimer = null;
function writeState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const json = JSON.stringify(state);
    if (!HOSTED) history.replaceState(null, '', '#' + encodeURIComponent(json));
    try { localStorage.setItem(STORAGE_KEY, json); } catch (e) { /* storage unavailable */ }
  }, 300);
}

// ---------------------------------------------------------------- named designs

// { name: { params, briefL, backBend, savedAt } }, kept in this browser.
function readDesigns() {
  try { return JSON.parse(localStorage.getItem(DESIGNS_KEY)) || {}; } catch (e) { return {}; }
}
function writeDesigns(d) {
  try { localStorage.setItem(DESIGNS_KEY, JSON.stringify(d)); return true; } catch (e) { alert('This browser would not store the design.'); return false; }
}
function designSnapshot() {
  return { params: clone(state.params), briefL: state.briefL, backBend: state.backBend };
}
// What was last loaded or saved, to warn before it is replaced unsaved.
let loadedSnapshot = '';
function markLoaded() { loadedSnapshot = JSON.stringify(designSnapshot()); }
function unsavedChanges() { return JSON.stringify(designSnapshot()) !== loadedSnapshot; }

function refreshDesignList() {
  const sel = document.getElementById('designs');
  const names = Object.keys(readDesigns()).sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">Brief defaults</option>' + names.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n.replace(/</g, '&lt;')}</option>`).join('');
  sel.value = names.includes(state.design) ? state.design : '';
  if (sel.value !== state.design) state.design = sel.value;
  document.getElementById('deleteDesign').disabled = !sel.value;
}
function loadDesign(name) {
  if (unsavedChanges() && !confirm(`Replace the current parameters with "${name || 'Brief defaults'}"? The changes since "${state.design || 'Brief defaults'}" was loaded are not saved.`)) {
    document.getElementById('designs').value = state.design;
    return;
  }
  if (!name) {
    state.params = clone(DEFAULTS); state.briefL = 0.8; state.backBend = 60; state.design = '';
    applyBrief();
  } else {
    const d = readDesigns()[name];
    if (!d) return;
    state.params = normalizeParams(d.params);
    state.briefL = d.briefL ?? state.briefL;
    state.backBend = d.backBend ?? state.backBend;
    state.design = name;
    refreshControls();
    onChange();
  }
  markLoaded();
  refreshDesignList();
}
function saveDesignAs() {
  const name = (prompt('Name for this design', state.design || '') || '').trim();
  if (!name) return;
  const designs = readDesigns();
  if (designs[name] && !confirm(`"${name}" exists. Replace it with the current parameters?`)) return;
  designs[name] = { ...designSnapshot(), savedAt: new Date().toISOString() };
  if (!writeDesigns(designs)) return;
  state.design = name;
  markLoaded();
  refreshDesignList();
  writeState();
}
function deleteDesign() {
  const name = document.getElementById('designs').value;
  if (!name || !confirm(`Delete the saved design "${name}"? The parameters on screen stay as they are.`)) return;
  const designs = readDesigns();
  delete designs[name];
  writeDesigns(designs);
  if (state.design === name) state.design = '';
  refreshDesignList();
  writeState();
}

// ---------------------------------------------------------------- scene

const viewEl = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewEl.appendChild(renderer.domElement);

const world = createWorld();
const { scene, alleyGroup } = world;
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);

let site = null;
let walls = flatWalls(3.0); // the real buildings once the site is loaded; flat 3 m walls only if it is not
let model = null;

// ---------------------------------------------------------------- camera: orbit

const orbit = {
  target: new THREE.Vector3(0, 2, 0),
  theta: 0.6, phi: 1.1, radius: 12,
  update() {
    const sp = Math.sin(this.phi), cp = Math.cos(this.phi);
    camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * cp,
      this.target.z + this.radius * sp * Math.cos(this.theta));
    camera.up.set(0, 1, 0);
    camera.lookAt(this.target);
  },
};

// Named views, in the alley frame; converted to scene coordinates.
function alleyToScene(x, y, z) {
  return alleyGroup.localToWorld(new THREE.Vector3(x, y, z));
}
function lookFrom(eyeAlley, targetAlley) {
  setMode('orbit');
  const eye = alleyToScene(...eyeAlley), target = alleyToScene(...targetAlley);
  orbit.target.copy(target);
  const d = eye.clone().sub(target);
  orbit.radius = d.length();
  orbit.phi = Math.acos(Math.max(-1, Math.min(1, d.y / orbit.radius)));
  orbit.theta = Math.atan2(d.x, d.z);
  orbit.update(); render();
}
const VIEWS = {
  'Street': () => { const p = state.params; lookFrom([-1.2, 1.65, 0.4], [p.along, p.bodyHeight - 0.3, p.across]); },
  'Front': () => { const p = state.params; const f = p.facing >= 0 ? 1 : -1;
    lookFrom([p.along + f * 4.5, p.bodyHeight + 0.2, p.across], [p.along, p.bodyHeight, p.across]); },
  'Side': () => { const p = state.params; lookFrom([p.along, p.bodyHeight + 1.5, p.across + 5.5], [p.along, p.bodyHeight, p.across]); },
  'Top': () => { const p = state.params; lookFrom([p.along + 0.001, p.bodyHeight + 9, p.across], [p.along, p.bodyHeight, p.across]); },
  'Under': () => { const p = state.params; lookFrom([p.along + 0.001, 1.6, p.across], [p.along, p.bodyHeight, p.across]); },
  'Overview': () => { const p = state.params; lookFrom([p.along - 18, 22, 22], [p.along, 2, 0]); },
};

// ---------------------------------------------------------------- camera: walking

// First-person visitor. Position in scene coordinates (y is the ground
// level, or the eye height when flying); yaw 0 looks north (scene -Z),
// pitch up is positive.
const walker = {
  pos: new THREE.Vector3(), yaw: 0, pitch: 0,
  eye: 1.65, speed: 1.4, run: 2.6, fly: false,
  keys: new Set(), bobT: 0, moving: false,
  touchMove: null, touchLook: null,
};
function forwardVector(yaw, pitch = 0) {
  return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}
function yawPitchFrom(dir) {
  const d = dir.clone().normalize();
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))) };
}
function spawnWalker() {
  // On the street at the alley mouth, looking into the alley.
  const p = alleyToScene(-1.0, 0, 0.5);
  walker.pos.set(p.x, 0, p.z);
  const dir = alleyToScene(1, 0, 0.5).sub(alleyToScene(0, 0, 0.5));
  walker.yaw = yawPitchFrom(dir).yaw;
  walker.pitch = 0;
  walker.fly = false;
}
function poseWalker() {
  camera.position.set(walker.pos.x, walker.fly ? walker.pos.y : walker.eye, walker.pos.z);
  camera.up.set(0, 1, 0);
  camera.lookAt(camera.position.clone().add(forwardVector(walker.yaw, walker.pitch)));
}
function blocked(x, z) {
  if (!site || walker.fly) return Math.abs(x) > 58 || Math.abs(z) > 58;
  if (Math.abs(x) > 58 || Math.abs(z) > 58) return true;
  return insideBuilding(site, x, -z, 0.35);
}
function stepWalker(dt) {
  const k = walker.keys;
  let f = 0, s = 0, up = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
  if (walker.touchMove) { f += walker.touchMove.f; s += walker.touchMove.s; }
  if (walker.fly) { if (k.has('Space')) up += 1; if (k.has('KeyC')) up -= 1; }
  const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? walker.run : walker.speed;
  const len = Math.hypot(f, s);
  walker.moving = len > 0.05;
  if (!walker.moving && !up) return;
  const fw = forwardVector(walker.yaw, 0);
  const rt = new THREE.Vector3(-fw.z, 0, fw.x);
  const move = fw.multiplyScalar(f).add(rt.multiplyScalar(s));
  if (len > 1) move.divideScalar(len);
  move.multiplyScalar(speed * dt);
  const nx = walker.pos.x + move.x, nz = walker.pos.z + move.z;
  if (!blocked(nx, nz)) { walker.pos.x = nx; walker.pos.z = nz; }
  else if (!blocked(nx, walker.pos.z)) walker.pos.x = nx;
  else if (!blocked(walker.pos.x, nz)) walker.pos.z = nz;
  if (walker.fly) walker.pos.y = Math.max(0.3, Math.min(80, walker.pos.y + up * speed * dt));
  walker.bobT += dt * (speed / walker.speed);
}

// ---------------------------------------------------------------- camera: the path

let path = null, pathT = 0;
function startPath() {
  if (!site) return;
  path = buildPath(site, state.params);
  pathT = 0;
  setMode('path');
}
function posePath(t) {
  const c = cameraAt(path, state.params, t);
  const pos = alleyGroup.localToWorld(c.position.clone());
  const target = alleyGroup.localToWorld(c.position.clone().add(c.direction));
  camera.position.copy(pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  return c;
}

// ---------------------------------------------------------------- modes

let mode = 'orbit';
let lastFrame = 0;
let looping = false; // one animation loop at a time
function setMode(m) {
  if (mode === m) return;
  if (mode === 'path' && m === 'walk' && path) {
    // Take over on foot where the path left the visitor.
    const c = posePath(pathT);
    walker.pos.set(camera.position.x, 0, camera.position.z);
    const dir = alleyGroup.localToWorld(c.position.clone().add(c.direction)).sub(camera.position);
    Object.assign(walker, yawPitchFrom(dir));
    walker.fly = false;
  }
  mode = m;
  camera.fov = m === 'orbit' ? 50 : 65;
  camera.updateProjectionMatrix();
  if (m !== 'walk' && document.pointerLockElement) document.exitPointerLock();
  for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('active', b.dataset.mode === m);
  renderer.domElement.style.cursor = m === 'walk' ? 'crosshair' : 'grab';
  hideGuide(world);
  updateHud();
  if (m === 'orbit') { orbit.update(); render(); }
  else if (!looping) { looping = true; lastFrame = performance.now(); requestAnimationFrame(loop); }
}
function loop(now) {
  if (mode === 'orbit') { looping = false; return; }
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (mode === 'walk') {
    stepWalker(dt);
    poseWalker();
    if (walker.moving && !walker.fly) camera.position.y += 0.02 * Math.sin(walker.bobT * 2 * Math.PI * 1.9);
  } else if (mode === 'path') {
    pathT += dt;
    if (pathT >= path.duration) { pathT = path.duration; posePath(pathT); setMode('walk'); return; }
    posePath(pathT);
  }
  renderer.render(scene, camera);
  updateHud();
  requestAnimationFrame(loop);
}
function updateHud() {
  const hud = document.getElementById('hud');
  if (!model) return;
  const s = model.stats;
  let text = `L ${fmt(s.bodyLength)} m · legs ${s.pairs.map(q => fmt(q.total, 2)).join(' / ')} m · bends ${s.pairs.map(q => fmt(q.bend, 0)).join(' / ')}°` + (s.allOk ? '' : ' · a foot has no wall');
  const locked = document.pointerLockElement === renderer.domElement;
  if (mode === 'walk') text = (walker.fly ? 'Flying (Space up, C down): ' : 'Walking: ') + 'W A S D or arrows, Shift to hurry, ' + (locked ? 'move the mouse to look, Esc frees it' : 'drag the view to look (a click captures the mouse where the browser allows it)') + ', F to fly · ' + text;
  if (mode === 'path') text = `The path: ${pathT.toFixed(1)} s of ${path.duration.toFixed(0)} s · any move key takes over on foot · ` + text;
  if (jointDrag) text = (jointDrag.kind === 'wall' ? 'Foot: sliding on the wall' : jointDrag.kind === 'across' ? 'Knee: across the alley' : 'Knee: along the alley and up and down (hold Shift for across)')
    + (state.mirror ? ', both sides' : '') + (jointDrag.edgeOn ? ` · ${jointDrag.edgeOn} is edge-on from here, turn the view to move that way` : '') + ' · ' + text;
  hud.textContent = text;
}

// ---------------------------------------------------------------- joints: picking and dragging

// In orbit mode the orange knee and foot markers can be dragged. Every
// ball moves in the vertical plane along the alley walls: a foot in its
// wall, a knee in the plane through it parallel to the walls. With a
// modifier key held, a knee moves across the alley instead.
//
// The pointer motion is turned into motion along the allowed axes by a
// damped least-squares fit of the axes' screen directions: along an axis
// the camera sees well the joint follows the pointer; along one seen
// nearly end-on (a level plane from eye height, the wall from the alley
// mouth) it moves at a bounded rate instead of racing to the horizon.
const raycaster = new THREE.Raycaster();
const DRAG_DAMPING = 0.12; // axes seen at less than this fraction of the across-view scale are damped
let jointDrag = null; // { joint, pair, side, kind, axes, point, px, py }
let hover = null;     // the joint under the pointer, when not dragging
const lastPointer = { x: 0, y: 0, has: false };

function modifierHeld(e) { return e.shiftKey || e.ctrlKey || e.altKey || e.metaKey; }
function setRay(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function pickJoint(clientX, clientY) {
  if (!world.joints.length || !model) return null;
  setRay(clientX, clientY);
  world.spiderGroup.updateMatrixWorld(true);
  // The ball under the pointer wins; the larger invisible spheres only
  // catch a near miss, so a nearer joint's halo cannot steal a click on a
  // ball behind it.
  const hits = raycaster.intersectObjects(world.jointMarkers, false);
  if (hits.length) return hits[0].object.userData;
  const near = raycaster.intersectObjects(world.joints, false);
  return near.length ? near[0].object.userData : null;
}
function modelLeg(j) { return model.legs.find(l => l.pair === j.pair && l.side === j.side); }
function jointPoint(j) { const l = modelLeg(j); return j.joint === 'knee' ? l.knee : l.foot; }
function startJointDrag(j, e) {
  const point = jointPoint(j);
  const drag = { ...j, point, px: e.clientX, py: e.clientY };
  if (j.joint === 'foot') {
    drag.kind = 'wall';
    drag.axes = [[1, 0, 0], [0, 1, 0]];
    showGuide(world, 'wall', point, { inward: -j.side });
  } else if (modifierHeld(e)) {
    drag.kind = 'across';
    drag.axes = [[0, 0, 1]];
    showGuide(world, 'across', point);
  } else {
    drag.kind = 'along';
    drag.axes = [[1, 0, 0], [0, 1, 0]];
    showGuide(world, 'wall', point);
  }
  jointDrag = drag;
  renderer.domElement.style.cursor = 'grabbing';
  updateHud();
  render();
}
// Screen position, in pixels, of an alley-frame point.
function screenOf(point) {
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const v = alleyToScene(...point).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return [rect.left + (v.x + 1) / 2 * rect.width, rect.top + (1 - v.y) / 2 * rect.height];
}
// Where the pointer movement since the last event takes the dragged joint,
// in the alley frame: the damped least-squares step along the drag axes.
function dragTarget(e) {
  const d = [e.clientX - jointDrag.px, e.clientY - jointDrag.py];
  jointDrag.px = e.clientX; jointDrag.py = e.clientY;
  const P = jointDrag.point;
  const h = 0.01;
  const s0 = screenOf(P);
  const J = jointDrag.axes.map(a => {
    const s = screenOf([P[0] + a[0] * h, P[1] + a[1] * h, P[2] + a[2] * h]);
    return [(s[0] - s0[0]) / h, (s[1] - s0[1]) / h]; // pixels per metre along this axis
  });
  // Pixels per metre across the view at the joint's depth: the scale a
  // well-seen axis has. Axes much weaker than that are damped.
  const rect = renderer.domElement.getBoundingClientRect();
  const focal = rect.height / (2 * Math.tan(camera.fov * Math.PI / 360));
  const depth = Math.max(0.1, camera.position.distanceTo(alleyToScene(...P)));
  const sigmaRef = focal / depth;
  const lambda = (DRAG_DAMPING * sigmaRef) ** 2;
  // Remember which axis, if any, the camera sees end-on, for the HUD.
  const names = { '1,0,0': 'along the alley', '0,1,0': 'up and down', '0,0,1': 'across the alley' };
  jointDrag.edgeOn = jointDrag.axes.filter((a, i) => Math.hypot(J[i][0], J[i][1]) < DRAG_DAMPING * sigmaRef).map(a => names[a.join(',')]).join(' and ');
  let steps;
  if (J.length === 1) {
    const [j] = J;
    steps = [(j[0] * d[0] + j[1] * d[1]) / (j[0] * j[0] + j[1] * j[1] + lambda)];
  } else {
    const [j1, j2] = J;
    const a11 = j1[0] * j1[0] + j1[1] * j1[1] + lambda, a12 = j1[0] * j2[0] + j1[1] * j2[1], a22 = j2[0] * j2[0] + j2[1] * j2[1] + lambda;
    const b1 = j1[0] * d[0] + j1[1] * d[1], b2 = j2[0] * d[0] + j2[1] * d[1];
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-12) return null;
    steps = [(a22 * b1 - a12 * b2) / det, (a11 * b2 - a12 * b1) / det];
  }
  const t = [...P];
  jointDrag.axes.forEach((a, i) => { for (let k = 0; k < 3; k++) t[k] += a[k] * steps[i]; });
  return { x: t[0], y: t[1], z: t[2] };
}
function moveJoint(e) {
  const t = dragTarget(e);
  if (!t) return;
  const p = state.params;
  const q = legOf(p, jointDrag.pair, jointDrag.side);
  // The world point is stored as the level pose (see kneeParamsAt), so a
  // vertical or level move changes both stored coordinates when pitched.
  let moved;
  if (jointDrag.kind === 'wall') {
    moved = footParamsAt(p, [t.x, Math.max(0, t.y), 0]);
  } else if (jointDrag.kind === 'across') {
    const k = kneeParamsAt(p, jointDrag.side, [t.x, t.y, t.z]);
    moved = { kneeOut: Math.max(0, k.kneeOut) };
  } else {
    const k = kneeParamsAt(p, jointDrag.side, [t.x, Math.max(0, t.y), t.z]);
    moved = { kneeAlong: k.kneeAlong, kneeHeight: k.kneeHeight };
  }
  Object.assign(q, moved);
  if (state.mirror) Object.assign(legOf(p, jointDrag.pair, -jointDrag.side), moved); // the twin leg follows
  onChange();
  const point = jointPoint(jointDrag);
  jointDrag.point = point;
  showGuide(world, jointDrag.kind === 'across' ? 'across' : 'wall', point, { inward: jointDrag.kind === 'wall' ? -jointDrag.side : 0 });
  render();
}
function endJointDrag() {
  jointDrag = null;
  hoverKey = '';
  hideGuide(world);
  renderer.domElement.style.cursor = 'grab';
  updateHud();
  render();
}
// Hovering a knee with a modifier held previews its across-the-alley line.
let hoverKey = '';
function updateHover(clientX, clientY, mod) {
  if (mode !== 'orbit' || jointDrag) return;
  hover = pickJoint(clientX, clientY);
  const key = hover ? `${hover.joint}${hover.pair}${hover.side}${hover.joint === 'knee' && mod ? 'g' : ''}` : '';
  if (key === hoverKey) return;
  hoverKey = key;
  renderer.domElement.style.cursor = hover ? 'move' : 'grab';
  if (hover && hover.joint === 'knee' && mod) showGuide(world, 'across', jointPoint(hover));
  else hideGuide(world);
  render();
}

// ---------------------------------------------------------------- input

(function installControls() {
  const el = renderer.domElement;
  let drag = null;
  const capture = e => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no pointer to capture */ } };
  el.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerlockchange', updateHud);
  el.addEventListener('pointerdown', e => {
    el.focus();
    if (mode === 'path') setMode('walk');
    if (mode === 'walk' && e.pointerType === 'touch') {
      const rect = el.getBoundingClientRect();
      const t = { id: e.pointerId, x: e.clientX, y: e.clientY };
      if (e.clientX - rect.left < rect.width / 2 && !walker.touchMove) walker.touchMove = { ...t, f: 0, s: 0 };
      else if (!walker.touchLook) walker.touchLook = t;
      capture(e);
      return;
    }
    if (mode === 'walk' && e.pointerType === 'mouse' && e.button === 0 && el.requestPointerLock && document.pointerLockElement !== el) {
      try { const r = el.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* no pointer lock here */ }
    }
    if (mode === 'orbit' && e.button === 0 && !jointDrag) {
      const j = pickJoint(e.clientX, e.clientY);
      if (j) { startJointDrag(j, e); capture(e); return; }
    }
    drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
    capture(e);
  });
  el.addEventListener('pointermove', e => {
    lastPointer.x = e.clientX; lastPointer.y = e.clientY; lastPointer.has = true;
    if (jointDrag) { moveJoint(e); return; }
    if (mode === 'walk') {
      if (e.pointerType === 'touch') {
        if (walker.touchMove && e.pointerId === walker.touchMove.id) {
          walker.touchMove.f = Math.max(-1, Math.min(1, -(e.clientY - walker.touchMove.y) / 60));
          walker.touchMove.s = Math.max(-1, Math.min(1, (e.clientX - walker.touchMove.x) / 60));
        } else if (walker.touchLook && e.pointerId === walker.touchLook.id) {
          walker.yaw -= (e.clientX - walker.touchLook.x) * 0.005;
          walker.pitch = Math.max(-1.4, Math.min(1.4, walker.pitch - (e.clientY - walker.touchLook.y) * 0.005));
          walker.touchLook.x = e.clientX; walker.touchLook.y = e.clientY;
        }
        return;
      }
      if (document.pointerLockElement === el) {
        walker.yaw -= e.movementX * 0.0025;
        walker.pitch = Math.max(-1.4, Math.min(1.4, walker.pitch - e.movementY * 0.0025));
      } else if (drag) {
        walker.yaw -= (e.clientX - drag.x) * 0.005;
        walker.pitch = Math.max(-1.4, Math.min(1.4, walker.pitch - (e.clientY - drag.y) * 0.005));
        drag.x = e.clientX; drag.y = e.clientY;
      }
      return;
    }
    if (!drag) { if (e.pointerType !== 'touch') updateHover(e.clientX, e.clientY, modifierHeld(e)); return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      const k = orbit.radius * 0.0012;
      orbit.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    } else {
      orbit.theta -= dx * 0.006;
      orbit.phi = Math.min(Math.PI - 0.02, Math.max(0.02, orbit.phi - dy * 0.006));
    }
    orbit.update(); render();
  });
  const release = e => {
    drag = null;
    if (jointDrag) endJointDrag();
    if (walker.touchMove && e.pointerId === walker.touchMove.id) walker.touchMove = null;
    if (walker.touchLook && e.pointerId === walker.touchLook.id) walker.touchLook = null;
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', () => { if (!jointDrag && hover) { hover = null; hoverKey = ''; hideGuide(world); el.style.cursor = 'grab'; render(); } });
  el.addEventListener('wheel', e => {
    e.preventDefault();
    if (mode !== 'orbit') return;
    orbit.radius = Math.min(150, Math.max(0.3, orbit.radius * Math.exp(e.deltaY * 0.0012)));
    orbit.update(); render();
  }, { passive: false });
  const modifierChange = e => {
    if (!/^(Shift|Control|Alt|Meta)/.test(e.key)) return;
    if (lastPointer.has && !jointDrag) updateHover(lastPointer.x, lastPointer.y, modifierHeld(e));
  };
  window.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    modifierChange(e);
    if (mode === 'path' && /^(Key[WASD]|Arrow)/.test(e.code)) setMode('walk');
    if (mode === 'walk') {
      walker.keys.add(e.code);
      if (e.code === 'KeyF' && !e.repeat) { walker.fly = !walker.fly; walker.pos.y = walker.fly ? walker.eye : 0; updateHud(); }
      if (/^(Key[WASDC]|Arrow|Space)/.test(e.code)) e.preventDefault();
      return;
    }
    const i = parseInt(e.key, 10);
    const names = Object.keys(VIEWS);
    if (i >= 1 && i <= names.length) VIEWS[names[i - 1]]();
  });
  window.addEventListener('keyup', e => { walker.keys.delete(e.code); modifierChange(e); });
  window.addEventListener('blur', () => walker.keys.clear());
})();

// ---------------------------------------------------------------- spider meshes

function rebuildSpider() {
  const p = state.params;
  model = buildSpider(p, walls);
  // Designs saved before knees were points: keep the knees the old bend and
  // upper length produced, as points, now that the walls are known.
  if (p.legs.some(q => q.kneeAlong === undefined)) {
    for (const l of model.legs) {
      const q = legOf(p, l.pair, l.side);
      p.legs[legIndex(l.pair, l.side)] = { footAlong: q.footAlong, footHeight: q.footHeight, ...kneeParamsAt(p, l.side, l.knee) };
    }
    model = buildSpider(p, walls);
  }
  rebuildSpiderMeshes(world, model, p, { silhouette: state.silhouette, showJoints: state.showJoints });
  rebuildExtras(world, p, { showPerson: state.showPerson, wallMode: site ? 'site' : 'flat', flatWidth: 3.0 });
  updateStats();
  updateHud();
  render();
}

// ---------------------------------------------------------------- stats

function updateStats() {
  const s = model.stats, p = state.params, L = s.bodyLength;
  const dev = (v, target, tol = 0.01) => Math.abs(v - target) <= tol ? 'ok' : 'warn';
  const row = (k, v, cls = '') => `<tr><td>${k}</td><td class="${cls}">${v}</td></tr>`;
  let h = '';

  h += '<h2>Spider</h2><table>';
  h += row('Body length L', fmt(L) + ' m');
  h += row('Top of spider', fmt(s.topHeight) + ' m');
  h += row('Bottom of body', fmt(s.bodyBottom) + ' m');
  h += row('Lowest point over the path', fmt(s.pathClearance) + ' m', s.pathClearance < 2.0 ? 'warn' : 'ok');
  h += row('Foot-to-foot across', fmt(s.spanAcross) + ' m');
  h += row('Foot-to-foot along', fmt(s.lengthAlong) + ' m');
  h += row('Pitch (whole spider)', fmt(s.pitch, 0) + '°' + (s.pitch ? (s.pitch > 0 ? ', head up' : ', head down') : ''));
  h += '</table>';

  h += '<h2>Legs</h2><table><tr><th>Pair</th><th>Bend</th><th>Upper</th><th>Lower</th><th>Total</th><th>/L</th><th>Knee at</th><th>Foot h</th></tr>';
  for (const q of s.pairs) {
    const cls = q.status === 'ok' ? '' : 'warn';
    const bend = Math.abs(q.bend - q.bendOtherSide) > 0.5 ? `${fmt(q.bend, 0)}/${fmt(q.bendOtherSide, 0)}` : fmt(q.bend, 0);
    const lower = Math.abs(q.lower - q.lowerOtherSide) > 0.005 ? `${fmt(q.lower)}/${fmt(q.lowerOtherSide)}` : fmt(q.lower);
    const total = Math.abs(q.total - q.totalOtherSide) > 0.005 ? `${fmt(q.total)}/${fmt(q.totalOtherSide)}` : fmt(q.total);
    h += `<tr class="${cls}"><td>${q.pair}${q.status === 'ok' ? '' : ' no wall'}</td><td>${bend}°</td><td>${fmt(q.upper)}</td><td>${lower}</td><td>${total}</td><td>${fmt(q.totalInL)}</td><td>${fmt(q.kneeFraction * 100, 0)}%</td><td>${fmt(q.footHeight)}</td></tr>`;
  }
  h += '</table><div class="muted" style="margin-top:4px">Segment lengths and bends follow from where the knees and feet are. Two values are right / left (looking in) where the two legs of a pair differ. Red: no wall was found for that foot.</div>';

  h += '<h2>Against the brief (in L)</h2><table><tr><th></th><th>Now</th><th>Brief</th></tr>';
  const cmp = (name, v, t, tol = 0.01) => `<tr><td>${name}</td><td class="${dev(v, t, tol)}">${fmt(v, 3)}</td><td class="muted">${t}</td></tr>`;
  h += cmp('Abdomen length', s.abdomenInL[0], LOCKED.abdomenLength);
  h += cmp('Abdomen width', s.abdomenInL[1], LOCKED.abdomenWidth);
  h += cmp('Abdomen height', s.abdomenInL[2], LOCKED.abdomenWidth);
  h += cmp('Head length, in front', s.headInL[0], LOCKED.headLength);
  h += cmp('Head width', s.headInL[1], LOCKED.headWidth);
  h += cmp('Head height', s.headInL[2], LOCKED.headWidth);
  h += cmp('Head / abdomen width', s.headToAbdomenWidth, 0.66);
  for (const q of s.pairs) h += cmp(`Leg ${q.pair} length`, q.totalInLWorst, LOCKED.legLength, 0.03);
  for (const q of s.pairs) h += cmp(`Leg ${q.pair} knee at`, q.kneeFractionWorst, LOCKED.kneeFraction, 0.01);
  h += cmp('Front bend / back bend', s.pairs[0].bend / (s.pairs[3].bend || 1), LOCKED.frontBendFactor, 0.02);
  h += '</table><div class="muted" style="margin-top:4px">The brief\'s head length of 0.30 includes 0.06 inside the abdomen; the head in front of it is 0.24.</div>';

  if (site) {
    const w = wallsFromSite(site);
    const left = w(p.along, 1, p.across);
    const lb = left !== null ? w.last : null;
    const right = w(p.along, -1, p.across);
    const rb = right !== null ? w.last : null;
    h += '<h2>Site at the body</h2><table>';
    h += row('Wall to wall here', left !== null && right !== null ? fmt(left - right) + ' m' : 'no wall found');
    if (lb) h += row('Right wall eave', fmt(lb.building.eaveHeight ?? NaN, 1) + ' m' + (lb.building.floors ? `, ${lb.building.floors} floor(s)` : ''));
    if (rb) h += row('Left wall eave', fmt(rb.building.eaveHeight ?? NaN, 1) + ' m' + (rb.building.floors ? `, ${rb.building.floors} floor(s)` : ''));
    h += row('Alley length', fmt(site.alley.length, 1) + ' m, runs south from the street');
    h += '</table><div class="muted" style="margin-top:4px">The site is measured, not adjustable here.</div>';
  }
  document.getElementById('stats').innerHTML = h;
}

// ---------------------------------------------------------------- UI

const rows = [];
function sliderRow(key, label, min, max, step, get, set) {
  const row = document.createElement('div');
  row.className = 'row';
  const id = `${key}-${rows.length}`;
  row.innerHTML = `<label for="r-${id}" title="${label}">${label}</label><input type="range" id="r-${id}" min="${min}" max="${max}" step="${step}"><input type="number" id="n-${id}" min="${min}" max="${max}" step="${step}">`;
  const [range, num] = row.querySelectorAll('input');
  const refresh = () => { const v = get(); range.value = v; num.value = Number(v.toFixed(3)); };
  const onInput = e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { set(v); refresh(); onChange(); } };
  range.addEventListener('input', onInput);
  num.addEventListener('change', onInput);
  row.refresh = refresh;
  refresh();
  return row;
}
function buildControls() {
  const root = document.getElementById('controls');
  root.innerHTML = '';
  for (const g of SLIDERS) {
    const d = document.createElement('details'); d.open = g.open;
    d.innerHTML = `<summary>${g.group}</summary>`;
    for (const [key, label, min, max, step] of g.items) {
      const r = sliderRow(key, label, min, max, step, () => state.params[key], v => { state.params[key] = v; });
      rows.push(r); d.appendChild(r);
    }
    if (g.group === 'Body') {
      d.appendChild(selectRow('Body shape', [['cylinder', 'Cylinder (brief)'], ['capsule', 'Capsule'], ['ellipsoid', 'Ellipsoid']],
        () => state.params.bodyShape, v => { state.params.bodyShape = v; }));
    }
    if (g.group === 'Body position') {
      d.appendChild(selectRow('Facing', [['-1', 'Head toward the street'], ['1', 'Head into the alley']],
        () => String(state.params.facing), v => { state.params.facing = parseInt(v, 10); }));
    }
    root.appendChild(d);
  }
}
function selectRow(label, options, get, set) {
  const row = document.createElement('div');
  row.className = 'row';
  row.style.gridTemplateColumns = '1fr 158px';
  const id = `sel-${rows.length}`;
  row.innerHTML = `<label for="${id}">${label}</label><select id="${id}">${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
  const sel = row.querySelector('select');
  sel.addEventListener('change', () => { set(sel.value); onChange(); });
  row.refresh = () => { sel.value = get(); };
  row.refresh();
  rows.push(row);
  return row;
}
function refreshControls() {
  for (const r of rows) r.refresh();
  const l = document.getElementById('briefL'), ln = document.getElementById('briefLn');
  l.value = state.briefL; ln.value = state.briefL;
  for (const b of document.querySelectorAll('#series button')) b.classList.toggle('active', parseInt(b.dataset.bend, 10) === state.backBend);
  for (const key of ['silhouette', 'showPerson', 'showRoofs', 'showJoints', 'plants', 'mirror']) document.getElementById(key).checked = state[key];
  document.getElementById('ground').value = state.ground;
}
function onChange() {
  rebuildSpider();
  writeState();
}

function applyBrief() {
  const old = state.params;
  const preset = briefPreset(state.briefL, {
    backBend: state.backBend,
    footHeights: [0, 1, 2, 3].map(i => legOf(old, i, 1).footHeight),
    bodyHeight: old.bodyHeight,
    along: old.along,
  });
  preset.across = old.across;
  preset.facing = old.facing;
  preset.bodyShape = old.bodyShape;
  preset.pitch = old.pitch || 0;
  state.params = preset;
  const leg = LOCKED.legLength * state.briefL;
  solveFeet([0, 1, 2, 3].map(i => ({ upper: leg * LOCKED.kneeFraction, bend: state.backBend * bendFactor(i) })));
}
// Slide the feet to where each leg has the brief's lower segment length,
// at the given (or the current) upper lengths and bends.
function solveFeet(targets = null) {
  const p = state.params;
  const lowerTarget = LOCKED.legLength * bodyLength(p) * (1 - LOCKED.kneeFraction);
  p.legs = solveFeetForLength(p, walls, lowerTarget, targets);
  refreshControls();
  onChange();
}
// Re-place every knee for the chosen back-pair bend, keeping each leg's
// upper segment length.
function setBendSeries(b) {
  state.backBend = b;
  const p = state.params;
  for (const l of model.legs) {
    p.legs[legIndex(l.pair, l.side)] = kneeFromBend(p, walls, l.pair, l.a, b * bendFactor(l.pair), l.side);
  }
  refreshControls(); onChange();
}
// Make one side the mirror image of the other.
function copySide(from) {
  const p = state.params;
  for (let i = 0; i < 4; i++) p.legs[legIndex(i, -from)] = { ...legOf(p, i, from) };
  onChange();
}

function applyPanes() {
  const app = document.getElementById('app');
  app.classList.toggle('no-left', !panes.left);
  app.classList.toggle('no-right', !panes.numbers);
  document.getElementById('showLeft').hidden = panes.left;
  document.getElementById('toggleNumbers').classList.toggle('active', panes.numbers);
  resize();
}

function wireUI() {
  const seriesEl = document.getElementById('series');
  for (const b of BEND_SERIES) {
    const btn = document.createElement('button');
    btn.textContent = b + '°'; btn.dataset.bend = b;
    btn.addEventListener('click', () => setBendSeries(b));
    seriesEl.appendChild(btn);
  }
  const l = document.getElementById('briefL'), ln = document.getElementById('briefLn');
  const setL = e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { state.briefL = v; refreshControls(); writeState(); } };
  l.addEventListener('input', setL); ln.addEventListener('change', setL);
  document.getElementById('applyBrief').addEventListener('click', applyBrief);
  document.getElementById('solveFeet').addEventListener('click', () => solveFeet());

  document.getElementById('mirror').addEventListener('change', e => { state.mirror = e.target.checked; writeState(); });
  document.getElementById('copyRightToLeft').addEventListener('click', () => copySide(1));
  document.getElementById('copyLeftToRight').addEventListener('click', () => copySide(-1));
  document.getElementById('loadDesign').addEventListener('click', () => loadDesign(document.getElementById('designs').value));
  document.getElementById('saveDesign').addEventListener('click', saveDesignAs);
  document.getElementById('deleteDesign').addEventListener('click', deleteDesign);
  document.getElementById('designs').addEventListener('change', e => { document.getElementById('deleteDesign').disabled = !e.target.value; });

  document.getElementById('hideLeft').addEventListener('click', () => { panes.left = false; applyPanes(); });
  document.getElementById('showLeft').addEventListener('click', () => { panes.left = true; applyPanes(); });
  document.getElementById('hideRight').addEventListener('click', () => { panes.numbers = false; applyPanes(); });
  document.getElementById('toggleNumbers').addEventListener('click', () => { panes.numbers = !panes.numbers; applyPanes(); });

  for (const key of ['silhouette', 'showPerson', 'showRoofs', 'showJoints', 'plants']) {
    document.getElementById(key).addEventListener('change', e => {
      state[key] = e.target.checked;
      if (key === 'showRoofs') setRoofsVisible(world, state.showRoofs);
      if (key === 'silhouette') setSilhouetteBackground(world, state.silhouette);
      if (key === 'plants') setPlantsVisible(world, state.plants);
      onChange();
    });
  }
  document.getElementById('ground').addEventListener('change', e => {
    state.ground = e.target.value;
    setGroundMode(world, state.ground);
    onChange();
  });
  document.getElementById('savePng').addEventListener('click', () => {
    render();
    const a = document.createElement('a');
    a.download = 'alley-spider.png';
    a.href = renderer.domElement.toDataURL('image/png');
    a.click();
  });
  document.getElementById('walkLink').addEventListener('click', () => {
    location.href = './walk.html#' + encodeURIComponent(JSON.stringify(state));
  });
  document.getElementById('copyLink').addEventListener('click', async () => {
    writeState();
    await new Promise(r => setTimeout(r, 350));
    try { await navigator.clipboard.writeText(location.href); } catch (e) { prompt('Copy this link', location.href); }
  });
  if (HOSTED) for (const el of document.querySelectorAll('.local-only')) el.hidden = true;

  const viewsEl = document.getElementById('views');
  Object.entries(VIEWS).forEach(([name, fn], i) => {
    const btn = document.createElement('button');
    btn.textContent = `${i + 1} ${name}`;
    btn.addEventListener('click', fn);
    viewsEl.appendChild(btn);
  });
  const modesEl = document.getElementById('modes');
  for (const [m, label] of [['orbit', 'Orbit'], ['walk', 'Walk (W A S D)'], ['path', 'Play the path']]) {
    const btn = document.createElement('button');
    btn.textContent = label; btn.dataset.mode = m;
    btn.addEventListener('click', () => {
      if (m === 'path') startPath();
      else if (m === 'walk') { if (mode === 'orbit') spawnWalker(); setMode('walk'); renderer.domElement.focus(); }
      else setMode('orbit');
    });
    modesEl.appendChild(btn);
  }
  renderer.domElement.tabIndex = 0;
}

// ---------------------------------------------------------------- render loop

function resize() {
  const w = viewEl.clientWidth, h = viewEl.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  render();
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(viewEl);
let frame = null;
function render() {
  if (mode !== 'orbit') return; // the walking loop renders every frame
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = null; renderer.render(scene, camera); });
}

// ---------------------------------------------------------------- start

async function main() {
  const hadSaved = readState();
  site = await loadWorldSite(world, { onTexture: render, ground: state.ground });
  if (!site) {
    document.getElementById('loading').textContent = HOSTED ? 'The site data could not be loaded; showing flat walls.' : 'Site data missing (run site/fetch_site.py); showing flat walls.';
  }
  if (site) document.getElementById('loading').remove();
  walls = site ? wallsFromSite(site) : flatWalls(3.0);
  buildControls();
  wireUI();
  refreshControls();
  refreshDesignList();
  applyPanes();
  if (state.silhouette) setSilhouetteBackground(world, true);
  setRoofsVisible(world, state.showRoofs);
  setPlantsVisible(world, state.plants);
  if (hadSaved) rebuildSpider(); else applyBrief(); // first visit: brief ratios on the real walls
  markLoaded();
  resize();
  spawnWalker();
  for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('active', b.dataset.mode === 'orbit');
  const view = new URLSearchParams(location.search).get('view');
  if (view === 'walk') { orbit.update(); setMode('walk'); }
  else (VIEWS[view] || VIEWS.Street)();
  window.spider = { state, panes, get model() { return model; }, VIEWS, rebuildSpider, render, walker, setMode, startPath, stepWalker, get mode() { return mode; },
    pickJoint, startJointDrag, moveJoint, endJointDrag, get jointDrag() { return jointDrag; }, loadDesign, saveDesignAs, camera, world };
}
main();

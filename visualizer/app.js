import * as THREE from 'three';
import { LOCKED, DEFAULTS, briefPreset, buildSpider, bodyLength, bendFactor,
         flatWalls, solveFeetForLength, kneeFromBend, kneeParamsAt, footParamsAt, upgradeParams, legIndex, legOf, legsFromAngles,
         SPREAD_AZIMUTHS, CLIMB_BEND_FACTORS, planAngles, legAngles, solveLegFromKnee, solveLegFromFoot, spreadLegsAt, spreadPreset, faceOf,
         bodyFrame, bodyUp, kneeRoll, legLengths, legLengthsAll, legPlane, solveFootKeepLengths, solveKneeKeepLengths, poseLegsKeepLengths, resetLegLengths, spiderLegLengths, spreadKeepLengths, variedAzimuths, DEFAULT_VARIATION } from './spider.js';
import { wallsFromSite, insideBuilding } from './site.js';
import { createWorld, loadWorldSite, rebuildSpiderMeshes, rebuildBuildMeshes, rebuildFaceMeshes, rebuildExtras, setRoofsVisible,
         setPlantsVisible, showGuide, hideGuide } from './scene.js';
import { buildPath, cameraAt } from './walk.js';
import { SYSTEMS, MAX_PIECES, DEFAULT_MAX_PIECE, BRACINGS, DEFAULT_BRACING, EYE_OPTIONS, DEFAULT_EYES, systemById, buildParts, recipeText, straightWalls } from './build.js';
import { DEFAULT_DESIGN, BAKED_FROM } from './design.js';

// Hosted on claude.ai the page cannot use the URL hash or start downloads;
// the design is then remembered in the browser instead.
const HOSTED = Boolean(window.HOSTED) || /claude\.ai$/.test(location.hostname);
const STORAGE_KEY = 'alley-spider-design-v3';   // the working state, written on every change
const DESIGNS_KEY = 'alley-spider-designs-v1';  // the named designs saved with "Save as…"

// ---------------------------------------------------------------- parameters

const SLIDERS = [
  { group: 'Body', open: false, items: [
    ['abdomenLength', 'Abdomen length', 0.2, 2.0, 0.005],
    ['abdomenWidth', 'Abdomen width', 0.1, 1.5, 0.005],
    ['abdomenHeight', 'Abdomen height', 0.1, 1.5, 0.005],
    ['headLength', 'Head length (in front of the abdomen)', 0.05, 1.0, 0.005],
    ['headWidth', 'Head width', 0.05, 1.0, 0.005],
    ['headHeight', 'Head height', 0.05, 1.0, 0.005],
  ]},
  { group: 'Body position', open: true, items: [
    ['along', 'Along the alley (from the street)', 0, 45, 0.05],
    ['bodyHeight', 'Body centre height (the whole spider moves)', 0.5, 5, 0.01],
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
  backBend: 60,     // knee bend of the back pair, degrees off straight; the front pair gets half
  hip: 15,          // the upper segment's angle above level where it leaves the body
  design: '',         // name of the loaded saved design; '' is "default" (design.js DEFAULT_DESIGN)
  bendLocked: true,   // the bend slider is inert until unlocked
  keepLengths: true,  // the keep-lengths rule (Daniel, 2026-10-14): a leg keeps its two segment lengths and its knee keeps its roll round the hip-to-foot line; was keepSplit, the brief's-leg rule
  plans: null,        // the plan angle wanted for each leg (degrees, + toward the head), kept across capped poses; null: as posed
  showJoints: true,
  plants: true,
  system: 'pvc40',    // the part system shown (build.js SYSTEMS id), '' for the design alone
  maxPiece: DEFAULT_MAX_PIECE, // the longest piece that can be shipped, metres (build.js MAX_PIECES; any positive number from an old link); longer pipes are split with couplers
  frameOnly: false,   // hide the covers and the shell so the frame shows
  plumbPosts: true,   // always on (Daniel, 2026-10-14): the feet of a side sit on one straight line (build.js straightWalls), so every post stands vertical
  bracing: 'none',    // no bracing (Daniel, 2026-10-14): the posts and the skis only
  eyes: DEFAULT_EYES,  // the face: 'googly', 'lit' or 'none' (build.js EYE_OPTIONS, spider.js faceOf)
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
  // The construction keys from a hash or an old save may be the wrong type.
  state.system = typeof state.system === 'string' ? state.system : 'pvc40';
  state.maxPiece = Number.isFinite(+state.maxPiece) && +state.maxPiece > 0 ? +state.maxPiece : DEFAULT_MAX_PIECE;
  state.frameOnly = !!state.frameOnly;
  state.plumbPosts = true; // always (Daniel, 2026-10-14): the feet of a side sit on one straight line
  state.bracing = 'none'; // no bracing (Daniel, 2026-10-14): posts and skis only
  state.eyes = EYE_OPTIONS.some(o => o.value === state.eyes) ? state.eyes : DEFAULT_EYES;
  if ('keepSplit' in s && !('keepLengths' in s)) state.keepLengths = !!s.keepSplit; // the rule's old name
  delete state.keepSplit;
  state.keepLengths = !!state.keepLengths;
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
  return { params: clone(state.params), briefL: state.briefL, backBend: state.backBend, hip: state.hip, plans: state.plans,
    system: state.system, maxPiece: state.maxPiece, frameOnly: state.frameOnly, plumbPosts: state.plumbPosts, bracing: state.bracing, eyes: state.eyes };
}
// What was last loaded or saved, to warn before it is replaced unsaved.
let loadedSnapshot = '';
function markLoaded() { loadedSnapshot = JSON.stringify(designSnapshot()); }
function unsavedChanges() { return JSON.stringify(designSnapshot()) !== loadedSnapshot; }

function refreshDesignList() {
  const sel = document.getElementById('designs');
  dropBakedDesign();
  const names = Object.keys(readDesigns()).sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">default</option>' + names.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n.replace(/</g, '&lt;')}</option>`).join('');
  sel.value = names.includes(state.design) ? state.design : '';
  if (sel.value !== state.design) state.design = sel.value;
  document.getElementById('deleteDesign').disabled = !sel.value;
}
// The saved design that became the default (design.js BAKED_FROM) leaves
// the menu once, when it still matches, so "default" is the only entry.
function dropBakedDesign() {
  if (!BAKED_FROM) return;
  const designs = readDesigns();
  const d = designs[BAKED_FROM];
  if (!d || !d.params) return;
  // The baked copy was fitted to the saved one within a few millimetres,
  // so the match is to the centimetre on the legs and exact on the body.
  const a = normalizeParams(d.params), b = normalizeParams(clone(DEFAULT_DESIGN.params));
  const sameBody = Object.keys(b).every(k => k === 'legs' || (typeof b[k] === 'number' ? Math.abs(a[k] - b[k]) < 0.0015 : a[k] === b[k]));
  const sameLegs = a.legs && a.legs.length === b.legs.length && b.legs.every((q, i) => Object.keys(q).every(k => Math.abs(a.legs[i][k] - q[k]) < 0.02));
  if (!sameBody || !sameLegs) return;
  delete designs[BAKED_FROM];
  writeDesigns(designs);
  if (state.design === BAKED_FROM) state.design = '';
}
function loadDesign(name) {
  if (unsavedChanges() && !confirm(`Replace the current parameters with "${name || 'default'}"? The changes since "${state.design || 'default'}" was loaded are not saved.`)) {
    document.getElementById('designs').value = state.design;
    return;
  }
  if (!name) {
    loadDefaults();
  } else {
    const d = readDesigns()[name];
    if (!d) return;
    state.params = normalizeParams(d.params);
    state.briefL = d.briefL ?? state.briefL;
    state.backBend = d.backBend ?? state.backBend;
    state.hip = d.hip ?? state.hip;
    state.plans = d.plans ?? null;
    if (typeof d.system === 'string') state.system = d.system;
    if (Number.isFinite(d.maxPiece) && d.maxPiece > 0) state.maxPiece = d.maxPiece; // as applySaved: buildParts needs a positive length
    if (typeof d.frameOnly === 'boolean') state.frameOnly = d.frameOnly;
    if (EYE_OPTIONS.some(o => o.value === d.eyes)) state.eyes = d.eyes;
    state.design = name;
    refreshControls();
    onChange();
  }
  markLoaded();
  refreshDesignList();
}
// The design the page starts from and the menu's "default" (design.js
// DEFAULT_DESIGN): every parameter and construction choice of that design,
// like loading a saved one.
function loadDefaults() {
  const d = DEFAULT_DESIGN;
  state.briefL = d.briefL; state.backBend = d.backBend; state.hip = d.hip; state.plans = d.plans ? clone(d.plans) : null; state.design = '';
  state.system = d.system; state.maxPiece = d.maxPiece; state.frameOnly = d.frameOnly; state.eyes = d.eyes;
  state.params = normalizeParams(clone(d.params));
  updateWalls();
  if (d.solveOnWalls) state.params = spreadPreset(state.briefL, { walls }); // the generated pose, solved on the walls the page uses
  refreshControls();
  onChange();
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
let realWalls = flatWalls(3.0); // the real buildings once the site is loaded; flat 3 m walls only if it is not
let walls = realWalls; // what the pose solvers and buildSpider see: realWalls, or straightWalls over them when the posts are plumb and a part system shows (updateWalls)
let model = null;
let parts = null; // the real parts of the chosen system (buildParts output), null for the design alone

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
  if (walker.fly) { if (k.has('Space')) up += 1; if (k.has('KeyX')) up -= 1; }
  const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? walker.run : walker.speed;
  // (fly down is X, so that C can open the controls)
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
  const warnings = [...s.warnings, ...(parts ? parts.warnings : [])];
  let text = `L ${fmt(s.bodyLength)} m · legs ${s.pairs.map(q => fmt(q.total, 2)).join(' / ')} m · bends ${s.pairs.map(q => fmt(q.bend, 0)).join(' / ')}°` + warnings.map(w => ' · ' + w).join('') + poseNote;
  const locked = document.pointerLockElement === renderer.domElement;
  if (mode === 'walk') text = (walker.fly ? 'Flying (Space up, X down): ' : 'Walking: ') + 'W A S D or arrows, Shift to hurry, ' + (locked ? 'move the mouse to look, Esc frees it' : 'drag the view to look (a click captures the mouse where the browser allows it)') + ', F to fly · ' + text;
  if (mode === 'path') text = `The path: ${pathT.toFixed(1)} s of ${path.duration.toFixed(0)} s · any move key takes over on foot · ` + text;
  if (jointDrag) text = (jointDrag.kind === 'wall' ? 'Foot: sliding on the wall' + (state.keepLengths ? ', the knee folds or straightens' : '') : jointDrag.kind === 'across' ? 'Knee: across the alley' : 'Knee: in the leg\'s plane (hold Shift for across)')
    + (jointDrag.kind !== 'wall' && state.keepLengths ? ', the foot follows along the wall' : '')
    + (jointDrag.stuck ? ' · the leg reaches no further that way' : '')
    + (jointDrag.edgeOn ? ` · ${jointDrag.edgeOn} is edge-on from here, turn the view to move that way` : '') + ' · ' + text;
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
  updateWalls();
  const point = jointPoint(j);
  const drag = { ...j, point, px: e.clientX, py: e.clientY };
  // What the keep-lengths rule holds through the drag: the two segment
  // lengths, the knee's roll round the hip-to-foot line (a foot drag) and
  // the leg's plane (a knee drag).
  const l = modelLeg(j), up = bodyUp(bodyFrame({ ...DEFAULTS, ...state.params }));
  const plane = legPlane(l, up);
  drag.fix = { ...legLengths(l), roll: kneeRoll(l.root, l.knee, l.foot, up), plane: plane.normal };
  if (j.joint === 'foot') {
    drag.kind = 'wall';
    drag.axes = [[1, 0, 0], [0, 1, 0]];
    showGuide(world, 'wall', point, { inward: -j.side });
  } else if (modifierHeld(e)) {
    drag.kind = 'across';
    drag.axes = [[0, 0, 1]];
    showGuide(world, 'across', point);
  } else {
    // The knee moves in its leg's own plane (Daniel, 2026-10-14).
    drag.kind = 'plane';
    drag.axes = [plane.e1, plane.e2];
    showGuide(world, 'plane', point, { axes: drag.axes });
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
  const before = { ...q };
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
    moved = { kneeAlong: k.kneeAlong, kneeHeight: k.kneeHeight, kneeOut: Math.max(0, k.kneeOut) };
  }
  Object.assign(q, moved);
  if (state.keepLengths) {
    // The keep-lengths rule: the rest of the leg follows the moved joint.
    // A step the leg cannot follow (the foot beyond the straight leg, the
    // wall out of the lower segment's reach) is cut short at the limit,
    // and the HUD says so.
    const solve = () => jointDrag.joint === 'foot'
      ? solveFootKeepLengths(p, walls, jointDrag.pair, jointDrag.side, jointDrag.fix)
      : solveKneeKeepLengths(p, walls, jointDrag.pair, jointDrag.side, jointDrag.fix);
    let solved = solve(), clamped = false;
    if (!solved) {
      clamped = true;
      const round3 = v => Math.round(v * 1000) / 1000;
      const partial = s => Object.fromEntries(Object.keys(moved).map(k => [k, round3(before[k] + s * (moved[k] - before[k]))]));
      let lo = 0, hi = 1;
      for (let i = 0; i < 7; i++) {
        const s = (lo + hi) / 2;
        Object.assign(q, before, partial(s));
        if (solve()) lo = s; else hi = s;
      }
      Object.assign(q, before, partial(lo));
      solved = lo > 0 ? solve() : null;
    }
    jointDrag.stuck = clamped;
    if (!solved) { Object.assign(q, before); updateHud(); return; }
    Object.assign(q, solved);
  }
  onChange();
  const point = jointPoint(jointDrag);
  jointDrag.point = point;
  showGuide(world, jointDrag.kind === 'across' ? 'across' : jointDrag.kind === 'plane' ? 'plane' : 'wall', point, { inward: jointDrag.kind === 'wall' ? -jointDrag.side : 0, axes: jointDrag.axes });
  render();
}
function endJointDrag() {
  if (jointDrag) {
    const drag = jointDrag;
    jointDrag = null;
    // The dragged foot may have moved the straight line the feet sit on:
    // the walls are recomputed and, when the line moved, the drag's
    // solver runs once more on the new line (as settle() does for the
    // sliders) and the spider is rebuilt, so the pose and the walls
    // agree now rather than at the next unrelated change.
    const lineOf = () => JSON.stringify(walls.stretch ? walls.stretch.line : null);
    const line = lineOf();
    updateWalls();
    const moved = lineOf() !== line;
    if (moved && state.keepLengths) {
      const p = state.params;
      const solved = drag.joint === 'foot'
        ? solveFootKeepLengths(p, walls, drag.pair, drag.side, drag.fix)
        : solveKneeKeepLengths(p, walls, drag.pair, drag.side, drag.fix);
      if (solved) Object.assign(legOf(p, drag.pair, drag.side), solved);
    }
    // The dragged leg's plan angle is now what the user put it at.
    if (state.plans) {
      const j = legIndex(drag.pair, drag.side);
      state.plans[j] = planAngles(state.params, walls)[j];
    }
    // A click with no move leaves the walls computed at the drag's start;
    // the next rebuild must recompute them from the params as they are
    // then, so the flag is cleared here.
    wallsFresh = false;
    if (moved) onChange();
  }
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
  // A double-tap or double-click on the view opens the controls.
  let lastTap = { t: 0, x: 0, y: 0 };
  el.addEventListener('pointerdown', e => {
    el.focus();
    const now = performance.now();
    if (now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24) { lastTap.t = 0; showHelp(true); return; }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
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
    if (e.code === 'Escape' && !document.getElementById('help').hidden) { showHelp(false); return; }
    if (e.code === 'KeyC' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { showHelp(document.getElementById('help').hidden); e.preventDefault(); return; }
    modifierChange(e);
    if (mode === 'path' && /^(Key[WASD]|Arrow)/.test(e.code)) setMode('walk');
    if (mode === 'walk') {
      walker.keys.add(e.code);
      if (e.code === 'KeyF' && !e.repeat) { walker.fly = !walker.fly; walker.pos.y = walker.fly ? walker.eye : 0; updateHud(); }
      if (/^(Key[WASDX]|Arrow|Space)/.test(e.code)) e.preventDefault();
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

// The walls the solvers and the build see. With plumb posts and a part
// system shown, each side's wall is straightened over the stretch the
// feet occupy (build.js straightWalls), so every post stands vertical.
// The line follows the feet, so it is recomputed before a drag and
// before each pose solver (settle), and kept through the rebuild that
// follows, so the pose and the walls it was solved on agree; a rebuild
// with no solver before it (a body slider, a construction setting, a
// loaded design) recomputes it.
let wallsFresh = false;
function updateWalls() {
  walls = state.plumbPosts && systemById(state.system) ? straightWalls(realWalls, state.params) : realWalls;
  wallsFresh = true;
}
// Run a pose solver on the walls as they are; when the feet it placed
// move the straight line, run it once more on the new line.
function settle(solve) {
  updateWalls();
  const lineOf = () => JSON.stringify(walls.stretch ? walls.stretch.line : null);
  let result = solve();
  const line = lineOf();
  updateWalls();
  if (lineOf() !== line) result = solve();
  return result;
}
function rebuildSpider() {
  const p = state.params;
  if (!wallsFresh && !jointDrag) updateWalls();
  wallsFresh = false;
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
  // The construction: the real parts replace the design's body and legs in
  // the view; the orange balls still drive the pose.
  const system = systemById(state.system);
  parts = system ? buildParts(model, p, walls, { system, maxPiece: state.maxPiece, bracing: state.bracing, realWalls: state.plumbPosts ? realWalls : null, eyes: state.eyes }) : null;
  rebuildSpiderMeshes(world, model, p, { showJoints: state.showJoints, showSpider: !parts });
  // The face sits on the shell, so it goes when the frame alone shows.
  rebuildFaceMeshes(world, state.eyes !== 'none' && !(parts && state.frameOnly) ? faceOf(model, p, state.eyes) : [], state.eyes);
  rebuildBuildMeshes(world, parts, system, { frameOnly: state.frameOnly });
  rebuildExtras(world, p, { showPerson: false, wallMode: site ? 'site' : 'flat', flatWidth: 3.0 });
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

  if (parts) h += partsTables(parts);
  document.getElementById('stats').innerHTML = h;
}

// The Parts and Cut list tables for the Numbers panel. Parts: the lines
// in their groups (pipe by size and stock length, fittings by name,
// covering and body, fixings and stays). Cut list: per leg the upper,
// lower and post lengths and the three fitting recipes; the ski and spine
// pieces; the stays' lengths per side.
function partsTables(parts) {
  const b = parts.bom, sys = systemById(parts.system);
  const esc = t => String(t).replace(/</g, '&lt;');
  const qty = l => Number.isInteger(l.qty) ? String(l.qty) : `${fmt(l.qty, 1)} m`;
  let h = `<h2>Parts</h2><div class="muted">${esc(sys.name)}; pieces up to ${fmt(parts.maxPiece, 2)} m.</div><table class="parts"><tr><th>Item</th><th>Count / m</th><th>kg</th><th>€</th></tr>`;
  for (const group of ['pipe', 'fittings', 'covering and body', 'fixings and stays']) {
    const lines = b.cost.lines.filter(l => l.group === group);
    if (!lines.length) continue;
    h += `<tr><td colspan="4"><b>${group[0].toUpperCase() + group.slice(1)}</b></td></tr>`;
    for (const l of lines) h += `<tr><td>${esc(l.item)}</td><td>${qty(l)}</td><td>${l.kg !== undefined ? fmt(l.kg, 1) : ''}</td><td>${fmt(l.cost, 0)}</td></tr>`;
    if (group === 'pipe') {
      // The pipe in the spider by role (the pieces as cut, between fittings), then the offcuts.
      for (const m of b.members) h += `<tr><td class="muted">&nbsp;&nbsp;${m.role} ${esc(m.label)}, ${m.pieces} piece${m.pieces > 1 ? 's' : ''} cut</td><td class="muted">${fmt(m.metres, 2)} m</td><td class="muted">${fmt(m.metres * parts.sizes[m.sizeKey].kgPerM, 1)}</td><td></td></tr>`;
      h += `<tr><td class="muted">&nbsp;&nbsp;offcuts, not in the total</td><td class="muted">${fmt(b.stock.waste, 2)} m</td><td class="muted">${fmt(b.weight.offcuts, 1)}</td><td></td></tr>`;
    }
  }
  h += `<tr><td><b>Total</b></td><td></td><td><b>${fmt(b.weight.total, 1)}</b></td><td><b>${fmt(b.cost.total, 0)}</b></td></tr>`;
  h += '</table><div class="muted" style="margin-top:4px">The total weight is the spider\'s (the pieces, not the stock; the sandbags are not in it); the cost is everything bought.</div>';
  for (const note of b.notes || []) h += `<div class="muted" style="margin-top:4px">${esc(note)}.</div>`;
  const splitNote = b.unsplitOver.length ? `; ${b.unsplitOver.length} member${b.unsplitOver.length > 1 ? 's' : ''} split ${esc(b.splitNote)}` : '';
  const stockNote = b.stock.bySize.map(r => `${esc(r.label)}: ${r.cutToLength ? `${r.pieces} pieces cut to length, ${fmt(r.cut, 2)} m` : r.lengths.filter(q => q.count).map(q => `${q.count} × ${fmt(q.length, 1)} m`).join(', ') || 'none'}`).join('; ');
  // The pipe price note names where the price of each stock length
  // actually bought was seen (build.js sizes: the store's 2 m lengths, the
  // 1 m lots from Amazon).
  const priceNotes = b.stock.bySize.flatMap(r => r.cutToLength ? [`${esc(r.stockName)} ${esc(r.label)}: ${esc(r.source)}`] : r.lengths.filter(q => q.count && q.source).map(q => `${esc(r.stockName)} ${esc(r.label)} ${fmt(q.length, 1)} m: ${esc(q.source)}`));
  h += `<div class="muted" style="margin-top:4px">Stock: ${stockNote}; ${fmt(b.stock.waste, 2)} m offcuts. Longest piece ${fmt(b.longestPiece, 3)} m${splitNote}. Prices seen on ${b.pricesSeen}${priceNotes.length ? '; ' + priceNotes.join('; ') : ''}.</div>`;

  // Cut list: lengths in one table, the fitting recipes in another, so each
  // fits the panel's width; a split cut shows its pieces under the length.
  const cutOf = (role, leg) => parts.cuts.find(c => c.role === role && c.leg === leg);
  const cell = c => c.pieces.length > 1 ? `${fmt(c.length, 3)}<br><span class="muted">${c.pieces.length} × ${fmt(c.pieces[0], 3)}</span>` : fmt(c.length, 3);
  const sizeNote = role => esc(parts.sizes[parts.memberSpec[role].size].label);
  h += '<h2>Cut list</h2><table class="cuts"><tr><th>Leg</th><th>Upper</th><th>Lower</th><th>Post</th></tr>';
  for (const a of parts.legsAssembly) h += `<tr><td>${a.pair + 1}${a.side}</td><td>${cell(cutOf('upper', a.leg))}</td><td>${cell(cutOf('lower', a.leg))}</td><td>${cell(cutOf('post', a.leg))}</td></tr>`;
  const socket = sys.fittings.knee.socket || 0;
  const insertNote = socket > 0 ? `Pipe lengths assume full ${Math.round(socket * 1000)} mm insertion; dry-fit each elbow pair and check before cutting.` : 'The members butt at each joint; check each joint before cutting.';
  h += `</table><div class="muted" style="margin-top:4px">Lengths are the pipe between fittings, in m (legs ${sizeNote('leg')}, posts ${sizeNote('post')}); a split cut gives its pieces. ${insertNote}</div>`;
  h += '<table class="cuts"><tr><th>Leg</th><th>Hip</th><th>Knee</th><th>Foot</th></tr>';
  const recipe = r => esc(recipeText(r)).replace(' @ ', '<br>@ '); // the twist on its own line, so three recipes fit the panel's width
  for (const a of parts.legsAssembly) {
    h += `<tr><td>${a.pair + 1}${a.side}</td><td>${recipe(a.hip.recipe)}<br><span class="muted">${fmt(a.hip.angle, 0)}°, turn ${fmt(a.hip.roll, 0)}°</span></td>`;
    h += `<td>${recipe(a.knee.recipe)}<br><span class="muted">${fmt(a.knee.bend, 0)}°<br>roll ${fmt(a.knee.roll, 0)}°</span></td>`;
    h += `<td>${recipe(a.foot.recipe)}<br><span class="muted">${fmt(a.foot.bend, 0)}°, plan ${fmt(a.foot.plan, 0)}°<br>roll ${fmt(a.foot.roll, 0)}°</span></td></tr>`;
  }
  const joints = parts.legsAssembly.length ? Object.entries(parts.legsAssembly[0].joints).map(([j, how]) => `${j}: ${how}`).join(', ') : '';
  const recipeNote = sys.fittings.knee.angles ? 'Each cell names the elbows ("45 + 20 @ 112°": a 45 and a 20 in series, the second twisted 112° about the first; "45°": one elbow) and under them the angle they make. ' : 'Each cell gives the angle to set at the joint. ';
  h += `</table><div class="muted" style="margin-top:4px">${recipeNote}Hip: the angle from straight across, and the turn of the joint about the stub (0 toward the head, 90 straight up). Knee: the bend off straight, and the roll of its plane about the upper tube from the hip's plane (0: the knee bends in the plane of the stub and the upper; clockwise positive looking from the hip toward the knee). Foot: the bend from the post, the plan angle the post is turned to (from straight across, + toward the head), and the roll of its plane about the lower tube from the knee's plane, the same way. Joints: ${joints}.</div>`;
  const stubs = parts.cuts.filter(c => c.role === 'stub' && c.joint !== 'foot');
  if (stubs.length) h += `<div class="muted">Hub stubs: ${stubs.length} × ${fmt(stubs[0].length, 3)} m.</div>`;
  const footStubs = parts.cuts.filter(c => c.role === 'stub' && c.joint === 'foot');
  if (footStubs.length) h += `<div class="muted">Foot stubs (clipped to the post tops, from offcuts): ${footStubs.length} × ${fmt(footStubs[0].length, 3)} m.</div>`;
  const links = parts.cuts.filter(c => c.role === 'link');
  if (links.length) {
    const legOf = c => { const a = parts.legsAssembly.find(x => x.leg === c.leg); return a ? `${a.pair + 1}${a.side} ${c.joint}` : c.joint; };
    h += `<div class="muted">Links (pipe a socket deep at each end, where a female-female elbow meets a fitting's socket or another female-female elbow): ${links.map(c => `${fmt(c.length, 3)} m at the ${legOf(c)}`).join(', ')}.</div>`;
  }
  const run = c => c.pieces.length > 1 ? `${fmt(c.length, 3)} (${c.pieces.length} × ${fmt(c.pieces[0], 3)})` : fmt(c.length, 3);
  h += '<table class="cuts"><tr><th>Ski / spine / stays</th><th>Pieces</th></tr>';
  for (const side of ['R', 'L']) {
    const rows = parts.cuts.filter(c => c.role === 'ski' && c.side === side);
    h += `<tr><td>Ski ${side === 'R' ? 'right' : 'left'}</td><td class="wrap">${rows.map(run).join(', ')}</td></tr>`;
  }
  const spine = parts.cuts.filter(c => c.role === 'spine');
  if (spine.length) h += `<tr><td>Spine</td><td class="wrap">${spine.map(run).join(', ')}</td></tr>`;
  for (const side of ['R', 'L']) {
    const stays = parts.members.filter(x => x.role === 'stay' && x.side === side);
    if (stays.length) h += `<tr><td>Stays ${side === 'R' ? 'right' : 'left'}</td><td class="wrap">${stays.map(x => fmt(x.length, 2)).join(', ')}</td></tr>`;
  }
  h += '</table>';
  const rolls = `${fmt(b.stays.metres, 1)} m of cord in ${b.stays.rolls} roll${b.stays.rolls > 1 ? 's' : ''}`;
  if (b.bracing === 'frame' && b.stays.count) h += `<div class="muted" style="margin-top:4px">Stays: two cords per post through one hole at its top, one down to the near end of the ski (the skis run 1.5 m past the end posts) and one down to the ski at the far post's tee, ${b.stays.count} cords with a tensioner each (the shallow one at 80 N, the steep one until the post is plumb); ${rolls}; ${b.sandbags} sandbags on the skis, two at each end and one outside each end post's tee; a leg-size liner inside each front post. Nothing beyond the skis, nothing in the walls.</div>`;
  if (b.bracing === 'rigid') h += `<div class="muted" style="margin-top:4px">Rigid bases: each post stands on the ski on a pair of angle brackets with a plywood gusset; posts and skis longer than the stock are lapped 0.40 m; ${b.sandbags} sandbags, two over each ski. No cords.</div>`;
  return h;
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
      const set = key === 'bodyHeight' ? v => moveSpiderTo(v) : v => { state.params[key] = v; };
      const r = sliderRow(key, label, min, max, step, () => state.params[key], set);
      rows.push(r); d.appendChild(r);
    }
    root.appendChild(d);
  }
}
function refreshControls() {
  for (const r of rows) r.refresh();
  const l = document.getElementById('briefL'), ln = document.getElementById('briefLn');
  l.value = state.briefL; ln.value = state.briefL;
  const bend = document.getElementById('bend'), bendN = document.getElementById('bendN');
  const hip = document.getElementById('hip'), hipN = document.getElementById('hipN');
  bend.value = state.backBend; bendN.value = state.backBend;
  hip.value = state.hip; hipN.value = state.hip;
  bend.max = bendN.max = bendLimit();
  bend.disabled = bendN.disabled = hip.disabled = hipN.disabled = state.bendLocked;
  document.getElementById('bendLock').checked = state.bendLocked;
  for (const key of ['showJoints', 'plants', 'keepLengths', 'frameOnly']) document.getElementById(key).checked = state[key];
  document.getElementById('eyes').value = state.eyes;
  document.getElementById('system').value = systemById(state.system) ? state.system : '';
  if (document.getElementById('system').value !== state.system) state.system = document.getElementById('system').value;
  setMaxPieceOptions();
}
// The shipping lengths from build.js, plus the state's own value when an
// old link carries one that is not in the list.
function setMaxPieceOptions() {
  const el = document.getElementById('maxPiece');
  const opts = MAX_PIECES.slice();
  if (!opts.some(o => o.value === state.maxPiece)) opts.push({ value: state.maxPiece, label: `${state.maxPiece.toFixed(2)} m (from the link)` });
  opts.sort((a, b) => a.value - b.value);
  el.innerHTML = opts.map(o => `<option value="${o.value}">${o.label.replace(/</g, '&lt;')}</option>`).join('');
  el.value = String(state.maxPiece);
}
function showHelp(on) {
  document.getElementById('help').hidden = !on;
  if (on && document.pointerLockElement) document.exitPointerLock();
}
function onChange() {
  poseNote = '';
  rebuildSpider();
  writeState();
}

// The body height slider moves the whole spider (Daniel, 2026-10-14): every
// foot and knee goes up or down with the body, so no leg changes its length
// or its angles, and the posts follow. The lowest foot stays FOOT_FLOOR
// above the ground, so the slider stops there.
const FOOT_FLOOR = 0.1;
function moveSpiderTo(height) {
  const p = state.params;
  const lowest = Math.min(...p.legs.map(l => l.footHeight));
  const delta = Math.max(height - p.bodyHeight, FOOT_FLOOR - lowest);
  if (!delta) return;
  // Added as it is, not rounded: rounding the shifted heights to the mm
  // would change each leg by a fraction of a millimetre.
  for (const l of p.legs) { l.footHeight += delta; l.kneeHeight += delta; }
  p.bodyHeight += delta;
}

function applyBrief() {
  const old = state.params;
  // The feet keep the heights they have in the alley (the pitched pose), so a
  // pitched spider does not throw them up or down the walls.
  const heights = model ? [0, 1, 2, 3].map(i => model.legs[legIndex(i, 1)].foot[1]) : [0, 1, 2, 3].map(i => legOf(old, i, 1).footHeight);
  const preset = briefPreset(state.briefL, {
    backBend: state.backBend,
    footHeights: heights,
    bodyHeight: old.bodyHeight,
    along: old.along,
    pitch: old.pitch || 0,
  });
  state.params = preset;
  const leg = LOCKED.legLength * state.briefL;
  solveFeet([0, 1, 2, 3].map(i => ({ upper: leg * LOCKED.kneeFraction, bend: state.backBend * bendFactor(i) })));
}
// Slide the feet to where each leg has the brief's lower segment length,
// at the given (or the current) upper lengths and bends.
function solveFeet(targets = null) {
  const p = state.params;
  const total = LOCKED.legLength * bodyLength(p);
  // Under the split rule the upper segment is the brief's too, so the whole leg is.
  settle(() => {
    const t = !targets ? legAngles(p, walls).map(x => ({ upper: total * LOCKED.kneeFraction, bend: x.bend })) : targets; // the brief's upper segment too, so the whole leg is the brief's
    p.legs = solveFeetForLength(p, walls, total * (1 - LOCKED.kneeFraction), t);
  });
  state.plans = null; // the feet moved along the walls: the plan angles are what they now are
  refreshControls();
  onChange();
}
// Pose every leg from the two angle sliders (hip and back-pair knee bend)
// at the plan angle wanted for it, so a spread survives a slider move.
// Each leg is scaled to its wall, but under the brief's-leg rule never
// past the brief's leg length: a leg that would need more is held there
// and its foot slides toward straight across, and the HUD says so. The
// wanted plan angles are remembered, so bringing the angles back brings
// the fan back.
function applyAngles() {
  const p = state.params;
  state.backBend = Math.min(state.backBend, bendLimit());
  // Under the keep-lengths rule the bend slides each foot along its wall
  // and the hip rolls each knee round its chord; off it, the legs take the
  // lengths the angles need. The lengths are measured once, before settle
  // may run the solver twice on a moved wall line.
  updateWalls();
  const lengths = state.keepLengths ? legLengthsAll(p, walls) : null;
  const posed = settle(() => {
    const r = state.keepLengths
      ? poseLegsKeepLengths(p, walls, { hip: state.hip, backBend: state.backBend, lengths })
      : legsFromAngles(p, walls, { hip: state.hip, backBend: state.backBend, azimuths: wantedPlans(), maxLength: Infinity });
    p.legs = r.legs;
    return r;
  });
  refreshControls();
  onChange();
  notePose(posed);
}
// The plan angle wanted for each leg: as set by the spread or a drag, else as the legs are now.
function wantedPlans() {
  if (!state.plans) state.plans = planAngles(state.params, walls);
  return state.plans;
}
// Past this back-pair bend the lower segment would point back under the knee, with the knee beyond the wall.
function bendLimit() { return Math.min(120, state.hip + 90); }
// What the last pose had to give up, shown in the HUD until the next change.
let poseNote = '';
function notePose({ capped, stretched, heldHip = [] }) {
  const legsWord = n => `${n} leg${n > 1 ? 's' : ''}`;
  const notes = [];
  if (capped.length) notes.push(state.keepLengths ? `${legsWord(capped.length)} held short of the angle asked: its length does not reach` : `${legsWord(capped.length)} held at the brief's length, foot moved in`);
  if (stretched.length) notes.push(`${legsWord(stretched.length)} ${state.keepLengths ? 'opened at the knee to reach the wall' : "stretched past the brief's length to reach the wall"}`);
  if (heldHip.length) notes.push(`${legsWord(heldHip.length)} cannot reach that hip angle at its length`);
  poseNote = notes.map(n => ' · ' + n).join('');
  updateHud();
}
// Fan the legs out in plan like a resting spider, at the two slider angles;
// each leg is scaled to reach its wall.
function spreadLegs() {
  const p = state.params;
  state.backBend = Math.min(state.backBend, bendLimit());
  // Worked out in the alley as the spider stands (pitched): the fan in plan
  // as seen from above, each foot keeping its height. Under the
  // keep-lengths rule the legs keep their lengths: each knee bends to suit
  // and a foot out of reach slides toward straight across. Off it, the
  // legs are bent by the knee slider in the climbing series and scaled to
  // their walls, never past their pair's length.
  const heights = model ? model.legs.map(l => l.foot[1]) : p.legs.map(q => q.footHeight);
  updateWalls();
  const lengths = state.keepLengths ? legLengthsAll(p, walls) : null;
  const posed = settle(() => {
    // The fan carries the default pose's little asymmetry in plan (the
    // front left leg reaching further), so a spread stays a spider's.
    const azimuths = variedAzimuths();
    const bends = CLIMB_BEND_FACTORS.flatMap(f => [f, f]).map((f, j) => Math.max(10, state.backBend * f + DEFAULT_VARIATION[j][2]));
    const r = state.keepLengths
      ? spreadKeepLengths(p, walls, { azimuths, lengths })
      : spreadLegsAt(p, { azimuths, footHeights: heights, backBend: state.backBend, bends, walls });
    p.legs = r.legs;
    return { capped: r.held, stretched: [] };
  });
  state.plans = null; // the plan angles are what the fan made them; the sliders measure them
  refreshControls();
  onChange();
  notePose(posed);
}
// Reset every leg's segment lengths to a spider's at the body's length
// (spider.js spiderLegLengths): the feet stay and the knees bend in their
// planes where the new leg reaches; a foot it cannot reach slides along
// its wall, and the HUD says how many did.
function resetLegs() {
  const p = state.params;
  let moved = [];
  settle(() => { const r = resetLegLengths(p, walls); p.legs = r.legs; moved = r.movedFeet; return r; });
  state.plans = null;
  refreshControls();
  onChange();
  const want = spiderLegLengths(bodyLength(p)).map(x => x.total.toFixed(2)).join(' / ');
  poseNote = ` · legs reset to ${want} m front to back` + (moved.length ? `; ${moved.length} ${moved.length > 1 ? 'feet' : 'foot'} slid along the wall to be reached` : '');
  updateHud();
}
// Make one side the mirror image of the other.
function copySide(from) {
  const p = state.params;
  for (let i = 0; i < 4; i++) {
    p.legs[legIndex(i, -from)] = { ...legOf(p, i, from) };
    if (state.plans) state.plans[legIndex(i, -from)] = state.plans[legIndex(i, from)];
  }
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
  const angle = (id, key, lo, hi) => {
    const set = e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { state[key] = Math.max(lo, Math.min(hi, v)); applyAngles(); } };
    document.getElementById(id).addEventListener('input', set);
    document.getElementById(id + 'N').addEventListener('change', set);
  };
  angle('hip', 'hip', -60, 80);
  angle('bend', 'backBend', 0, 120);
  document.getElementById('bendLock').addEventListener('change', e => {
    state.bendLocked = e.target.checked;
    if (!state.bendLocked) applyAngles(); else { refreshControls(); writeState(); }
  });
  document.getElementById('spreadLegs').addEventListener('click', spreadLegs);
  document.getElementById('helpButton').addEventListener('click', () => showHelp(true));
  document.getElementById('helpClose').addEventListener('click', () => showHelp(false));
  document.getElementById('help').addEventListener('click', e => { if (e.target.id === 'help') showHelp(false); });
  const l = document.getElementById('briefL'), ln = document.getElementById('briefLn');
  const setL = e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { state.briefL = v; refreshControls(); writeState(); } };
  l.addEventListener('input', setL); ln.addEventListener('change', setL);
  document.getElementById('applyBrief').addEventListener('click', applyBrief);
  document.getElementById('solveFeet').addEventListener('click', () => solveFeet());

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

  for (const key of ['showJoints', 'plants']) {
    document.getElementById(key).addEventListener('change', e => {
      state[key] = e.target.checked;
      if (key === 'plants') setPlantsVisible(world, state.plants);
      onChange();
    });
  }
  document.getElementById('resetLegs').addEventListener('click', resetLegs);
  document.getElementById('keepLengths').addEventListener('change', e => {
    state.keepLengths = e.target.checked;
    writeState(); updateHud();
  });
  // Construction: the part system, the longest piece to ship, the frame alone.
  const systemEl = document.getElementById('system');
  systemEl.innerHTML = '<option value="">Design only (no parts)</option>' + SYSTEMS.map(sy => `<option value="${sy.id}">${sy.name.replace(/</g, '&lt;')}</option>`).join('');
  systemEl.addEventListener('change', e => { state.system = e.target.value; onChange(); });
  const maxPieceEl = document.getElementById('maxPiece');
  setMaxPieceOptions();
  maxPieceEl.addEventListener('change', e => { state.maxPiece = parseFloat(e.target.value); onChange(); });
  document.getElementById('frameOnly').addEventListener('change', e => { state.frameOnly = e.target.checked; onChange(); });
  const eyesEl = document.getElementById('eyes');
  eyesEl.innerHTML = EYE_OPTIONS.map(o => `<option value="${o.value}">${o.label.replace(/</g, '&lt;')}</option>`).join('');
  eyesEl.addEventListener('change', e => { state.eyes = e.target.value; onChange(); });
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
  site = await loadWorldSite(world, { onTexture: render, ground: 'lane' });
  if (!site) {
    document.getElementById('loading').textContent = HOSTED ? 'The site data could not be loaded; showing flat walls.' : 'Site data missing (run site/fetch_site.py); showing flat walls.';
  }
  if (site) document.getElementById('loading').remove();
  realWalls = site ? wallsFromSite(site) : flatWalls(3.0);
  updateWalls();
  buildControls();
  wireUI();
  refreshControls();
  refreshDesignList();
  applyPanes();
  setRoofsVisible(world, true);
  setPlantsVisible(world, state.plants);
  if (hadSaved) rebuildSpider(); else loadDefaults(); // first visit: the resting pose on the real walls
  markLoaded();
  resize();
  spawnWalker();
  for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('active', b.dataset.mode === 'orbit');
  const view = new URLSearchParams(location.search).get('view');
  if (view === 'walk') { orbit.update(); setMode('walk'); }
  else (VIEWS[view] || VIEWS.Street)();
  window.spider = { state, panes, get model() { return model; }, get parts() { return parts; }, get walls() { return walls; }, get realWalls() { return realWalls; }, VIEWS, rebuildSpider, render, walker, setMode, startPath, stepWalker, get mode() { return mode; },
    pickJoint, startJointDrag, moveJoint, endJointDrag, get jointDrag() { return jointDrag; }, loadDesign, saveDesignAs, applyAngles, spreadLegs, moveSpiderTo, showHelp, camera, world };
}
main();

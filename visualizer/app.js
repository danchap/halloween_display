import * as THREE from 'three';
import { LOCKED, BEND_SERIES, DEFAULTS, briefPreset, buildSpider, bodyLength, bendFactor,
         flatWalls, solveFeetForLength } from './spider.js';
import { wallsFromSite, insideBuilding } from './site.js';
import { createWorld, loadWorldSite, rebuildSpiderMeshes, rebuildExtras, setRoofsVisible,
         setSilhouetteBackground, setGroundMode, setPlantsVisible } from './scene.js';
import { buildPath, cameraAt } from './walk.js';

// Hosted on claude.ai the page cannot use the URL hash or start downloads;
// the design is then remembered in the browser instead.
const HOSTED = Boolean(window.HOSTED) || /claude\.ai$/.test(location.hostname);
const STORAGE_KEY = 'alley-spider-design-v2';

// ---------------------------------------------------------------- parameters

const SLIDERS = [
  { group: 'Body', open: true, items: [
    ['abdomenLength', 'Abdomen length', 0.2, 2.0, 0.005],
    ['abdomenWidth', 'Abdomen width', 0.1, 1.5, 0.005],
    ['abdomenHeight', 'Abdomen height', 0.1, 1.5, 0.005],
    ['headLength', 'Head length', 0.05, 1.0, 0.005],
    ['headWidth', 'Head width', 0.05, 1.0, 0.005],
    ['headHeight', 'Head height', 0.05, 1.0, 0.005],
    ['overlap', 'Segment overlap', 0, 0.5, 0.005],
    ['headLift', 'Head lift (axis above abdomen)', -0.5, 0.5, 0.005],
  ]},
  { group: 'Body position', open: true, items: [
    ['along', 'Along the alley (from the street)', 0, 45, 0.05],
    ['bodyHeight', 'Abdomen axis height', 0.5, 5, 0.01],
    ['across', 'Across the alley (+ is right, looking in)', -1.5, 1.5, 0.01],
  ]},
  { group: 'Leg thickness', open: false, items: [
    ['upperDiameter', 'Upper segment diameter', 0.005, 0.25, 0.005],
    ['lowerDiameter', 'Lower segment diameter', 0.005, 0.25, 0.005],
  ]},
];
const PAIR_SLIDERS = [
  ['bend', 'Knee bend, ° off straight', 0, 150, 1],
  ['upper', 'Upper segment (root to knee)', 0.1, 4, 0.005],
  ['footAlong', 'Foot along, from body centre (+ toward head)', -6, 6, 0.01],
  ['footHeight', 'Foot height on the wall', 0, 6, 0.01],
];
const PAIR_NAMES = ['Front pair (1)', 'Pair 2', 'Pair 3', 'Back pair (4)'];

const state = {
  params: clone(DEFAULTS),
  briefL: 0.8,
  backBend: 60,
  wallMode: 'site',   // 'site' or 'flat'
  flatWidth: 3.0,
  silhouette: false,
  showPerson: true,
  showRoofs: true,
  showJoints: true,
  ground: 'lane',     // 'lane' (materials from the photo) or 'ortho'
  plants: true,
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '–'; }

// ---------------------------------------------------------------- saved state

function applySaved(s) {
  if (!s || typeof s !== 'object' || !s.params) return false;
  Object.assign(state, s, { params: { ...clone(DEFAULTS), ...s.params } });
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
let walls = flatWalls(3.0);
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
  let text = `L ${fmt(s.bodyLength)} m · legs ${s.pairs.map(q => fmt(q.total, 2)).join(' / ')} m · back bend ${s.pairs[3].bend}°` + (s.allOk ? '' : ' · some legs cannot be placed');
  const locked = document.pointerLockElement === renderer.domElement;
  if (mode === 'walk') text = (walker.fly ? 'Flying (Space up, C down): ' : 'Walking: ') + 'W A S D or arrows, Shift to hurry, ' + (locked ? 'move the mouse to look, Esc frees it' : 'drag the view to look (a click captures the mouse where the browser allows it)') + ', F to fly · ' + text;
  if (mode === 'path') text = `The path: ${pathT.toFixed(1)} s of ${path.duration.toFixed(0)} s · any move key takes over on foot · ` + text;
  hud.textContent = text;
}

// ---------------------------------------------------------------- input

(function installControls() {
  const el = renderer.domElement;
  let drag = null;
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
      el.setPointerCapture(e.pointerId);
      return;
    }
    if (mode === 'walk' && e.pointerType === 'mouse' && e.button === 0 && el.requestPointerLock && document.pointerLockElement !== el) {
      try { const r = el.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* no pointer lock here */ }
    }
    drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
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
    if (!drag) return;
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
    if (walker.touchMove && e.pointerId === walker.touchMove.id) walker.touchMove = null;
    if (walker.touchLook && e.pointerId === walker.touchLook.id) walker.touchLook = null;
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('wheel', e => {
    e.preventDefault();
    if (mode !== 'orbit') return;
    orbit.radius = Math.min(150, Math.max(0.3, orbit.radius * Math.exp(e.deltaY * 0.0012)));
    orbit.update(); render();
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
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
  window.addEventListener('keyup', e => walker.keys.delete(e.code));
  window.addEventListener('blur', () => walker.keys.clear());
})();

// ---------------------------------------------------------------- spider meshes

function rebuildSpider() {
  const p = state.params;
  model = buildSpider(p, walls);
  rebuildSpiderMeshes(world, model, p, { silhouette: state.silhouette, showJoints: state.showJoints });
  rebuildExtras(world, p, { showPerson: state.showPerson, wallMode: state.wallMode, flatWidth: state.flatWidth });
  updateStats();
  updateHud();
  render();
}

function applyWallMode() {
  if (!site) state.wallMode = 'flat'; // nothing else to land on
  if (state.wallMode === 'site') walls = wallsFromSite(site);
  else walls = flatWalls(state.flatWidth);
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
  h += '</table>';

  h += '<h2>Legs</h2><table><tr><th>Pair</th><th>Bend</th><th>Upper</th><th>Lower</th><th>Total</th><th>/L</th><th>Knee at</th><th>Foot h</th></tr>';
  for (const q of s.pairs) {
    const cls = q.status === 'ok' ? '' : 'warn';
    const lower = Math.abs(q.lower - q.lowerOtherSide) > 0.005 ? `${fmt(q.lower)}/${fmt(q.lowerOtherSide)}` : fmt(q.lower);
    const total = Math.abs(q.total - q.totalOtherSide) > 0.005 ? `${fmt(q.total)}/${fmt(q.totalOtherSide)}` : fmt(q.total);
    h += `<tr class="${cls}"><td>${q.pair}${q.status === 'ok' ? '' : ' ' + q.status}</td><td>${q.bend}°</td><td>${fmt(q.upper)}</td><td>${lower}</td><td>${total}</td><td>${fmt(q.totalInL)}</td><td>${fmt(q.kneeFraction * 100, 0)}%</td><td>${fmt(q.footHeight)}</td></tr>`;
  }
  h += '</table><div class="muted" style="margin-top:4px">Lower segment is derived so the foot lands where it is put. Two values mean the two walls are at different distances. Red: the foot is too close for that bend, or no wall was found.</div>';

  h += '<h2>Against the brief (in L)</h2><table><tr><th></th><th>Now</th><th>Brief</th></tr>';
  const cmp = (name, v, t, tol = 0.01) => `<tr><td>${name}</td><td class="${dev(v, t, tol)}">${fmt(v, 3)}</td><td class="muted">${t}</td></tr>`;
  h += cmp('Abdomen length', s.abdomenInL[0], LOCKED.abdomenLength);
  h += cmp('Abdomen width', s.abdomenInL[1], LOCKED.abdomenWidth);
  h += cmp('Abdomen height', s.abdomenInL[2], LOCKED.abdomenWidth);
  h += cmp('Head length', s.headInL[0], LOCKED.headLength);
  h += cmp('Head width', s.headInL[1], LOCKED.headWidth);
  h += cmp('Head height', s.headInL[2], LOCKED.headWidth);
  h += cmp('Overlap', s.overlapInL, LOCKED.overlap);
  h += cmp('Head / abdomen width', s.headToAbdomenWidth, 0.66);
  for (const q of s.pairs) h += cmp(`Leg ${q.pair} length`, q.totalInLWorst, LOCKED.legLength, 0.03);
  for (const q of s.pairs) h += cmp(`Leg ${q.pair} knee at`, q.kneeFractionWorst, LOCKED.kneeFraction, 0.01);
  h += cmp('Front bend / back bend', s.pairs[0].bend / (s.pairs[3].bend || 1), LOCKED.frontBendFactor, 0.02);
  h += '</table>';

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
    h += '</table>';
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
      d.appendChild(selectRow('Walls', [['site', 'Real buildings (IGN)'], ['flat', 'Flat walls, set width']],
        () => state.wallMode, v => { state.wallMode = v; applyWallMode(); }));
      const r = sliderRow('flatWidth', 'Flat wall spacing', 1.5, 6, 0.05, () => state.flatWidth, v => { state.flatWidth = v; applyWallMode(); });
      rows.push(r); d.appendChild(r);
    }
    root.appendChild(d);
  }
  for (let i = 0; i < 4; i++) {
    const d = document.createElement('details'); d.open = i === 0 || i === 3;
    d.innerHTML = `<summary>${PAIR_NAMES[i]}</summary>`;
    for (const [key, label, min, max, step] of PAIR_SLIDERS) {
      const r = sliderRow(key, label, min, max, step, () => state.params.pairs[i][key], v => { state.params.pairs[i][key] = v; });
      rows.push(r); d.appendChild(r);
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
  for (const key of ['silhouette', 'showPerson', 'showRoofs', 'showJoints', 'plants']) document.getElementById(key).checked = state[key];
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
    footHeights: old.pairs.map(q => q.footHeight),
    bodyHeight: old.bodyHeight,
    along: old.along,
  });
  preset.across = old.across;
  preset.facing = old.facing;
  preset.bodyShape = old.bodyShape;
  state.params = preset;
  solveFeet();
}
function solveFeet() {
  const p = state.params;
  const lowerTarget = LOCKED.legLength * bodyLength(p) * (1 - LOCKED.kneeFraction);
  p.pairs = solveFeetForLength(p, walls, lowerTarget);
  refreshControls();
  onChange();
}

function wireUI() {
  const seriesEl = document.getElementById('series');
  for (const b of BEND_SERIES) {
    const btn = document.createElement('button');
    btn.textContent = b + '°'; btn.dataset.bend = b;
    btn.addEventListener('click', () => {
      state.backBend = b;
      for (let i = 0; i < 4; i++) state.params.pairs[i].bend = Math.round(b * bendFactor(i));
      refreshControls(); onChange();
    });
    seriesEl.appendChild(btn);
  }
  const l = document.getElementById('briefL'), ln = document.getElementById('briefLn');
  const setL = e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { state.briefL = v; refreshControls(); writeState(); } };
  l.addEventListener('input', setL); ln.addEventListener('change', setL);
  document.getElementById('applyBrief').addEventListener('click', applyBrief);
  document.getElementById('solveFeet').addEventListener('click', solveFeet);
  document.getElementById('reset').addEventListener('click', () => {
    state.params = clone(DEFAULTS); state.briefL = 0.8; state.backBend = 60;
    applyBrief();
  });
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
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  render();
}
window.addEventListener('resize', resize);
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
    state.wallMode = 'flat';
  }
  if (site) document.getElementById('loading').remove();
  applyWallMode();
  buildControls();
  wireUI();
  refreshControls();
  if (state.silhouette) setSilhouetteBackground(world, true);
  setRoofsVisible(world, state.showRoofs);
  setPlantsVisible(world, state.plants);
  if (hadSaved) rebuildSpider(); else applyBrief(); // first visit: brief ratios on the real walls
  resize();
  spawnWalker();
  for (const b of document.querySelectorAll('#modes button')) b.classList.toggle('active', b.dataset.mode === 'orbit');
  const view = new URLSearchParams(location.search).get('view');
  if (view === 'walk') { orbit.update(); setMode('walk'); }
  else (VIEWS[view] || VIEWS.Street)();
  window.spider = { state, get model() { return model; }, VIEWS, rebuildSpider, render, walker, setMode, startPath, stepWalker, get mode() { return mode; } };
}
main();

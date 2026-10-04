// "The path": a walk from the Rue du Gros Jonc / Rue de Trousse Chemise
// junction, east along the street, right into Impasse du Rossignol and
// down the alley under the spider. Pure geometry in the alley frame.

import * as THREE from 'three';

export const WALK_DEFAULTS = Object.freeze({
  eyeHeight: 1.65,     // m, adult eye level
  speed: 1.3,          // m/s, normal walking pace
  slowSpeed: 0.5,      // m/s, under the spider
  slowBefore: 3.0,     // m before the spider where slowing starts
  slowAfter: 1.0,      // m after the spider where normal pace resumes
  lookAhead: 4.0,      // m ahead on the path the walker looks at
  gazeStart: 2.5,      // m into the alley (x) where the eyes go to the spider
  gazeHold: 0.3,       // m before the body where the gaze starts to come down
  gazeRelease: 1.8,    // m over which the gaze comes back down to the path
  maxPitch: 80,        // degrees, how far up the head tilts
  bob: true,           // head bob and sway
  afterSpider: 9.0,    // m the route continues past the spider (so the look-ahead stays steady)
  startOffset: 3.3,    // m along the route where the walk begins (skips the first 2.5 s from the junction)
  stopAfter: 1.6,      // m past the spider where the walk ends: just as the eyes have come back down
  vfov: 65,            // vertical field of view, degrees (about 97 wide at 16:9)
});

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Junction of two named streets in the site's road data, in alley-frame
// coordinates, or null.
export function junction(site, nameA, nameB) {
  if (!site) return null;
  const pts = name => new Set(site.roads.filter(r => r.name === name).flatMap(r => r.points.map(p => p.join(','))));
  const a = pts(nameA), b = pts(nameB);
  for (const k of a) if (b.has(k)) { const [e, n] = k.split(',').map(Number); return site.frame.toAlley(e, n); }
  return null;
}

// Build the path for a spider at params.along / params.across.
export function buildPath(site, params, opts = {}) {
  const o = { ...WALK_DEFAULTS, ...opts };
  o.speed = Math.max(0.1, o.speed);
  o.slowSpeed = Math.max(0.1, Math.min(o.slowSpeed, o.speed));
  const y = o.eyeHeight;
  const start = junction(site, 'Rue du Gros Jonc', 'Rue de Trousse Chemise') || [-1.8, 14.9];
  // The street centreline nodes between the junction and the alley mouth
  // (each once, since road segments share their end nodes), shifted a
  // little toward the alley side (+x) as a walker aiming for a right turn
  // would.
  const nodeKeys = new Set((site ? site.roads : []).filter(r => r.name === 'Rue de Trousse Chemise').flatMap(r => r.points.map(p => p.join(','))));
  const street = [...nodeKeys].map(k => site.frame.toAlley(...k.split(',').map(Number)))
    .filter(([x, z]) => z > 2.5 && z < start[1] - 2.5 && Math.abs(x) < 3)
    .sort((p, q) => q[1] - p[1])
    .map(([x, z]) => [x + 0.4, z]);
  const sx = params.along, sz = params.across;
  // The approach waypoints only while they lie before the body.
  const approach = [[2.8, sz * 0.5], [5.5, sz]].filter(([x]) => x < sx - 1);
  const pts2 = [
    start,
    ...street,
    [0.9, 3.2],
    [1.6, 1.3],
    ...approach,
    [sx, sz],
    [sx + o.afterSpider, sz],
  ];
  const curve = new THREE.CatmullRomCurve3(pts2.map(([x, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  const length = curve.getLength();

  // Arc distance at which the walker is under the body, and where the
  // alley begins (x crosses gazeStart).
  const N = 2000;
  let spiderS = length, alleyS = length;
  let foundAlley = false;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = curve.getPointAt(u);
    if (!foundAlley && p.x >= o.gazeStart && p.z < 2) { alleyS = u * length; foundAlley = true; }
    if (p.x >= sx) { spiderS = u * length; break; }
  }

  // Speed along the path and the time table t(s).
  const speedAt = s => {
    const slow = smoothstep(spiderS - o.slowBefore - 1.5, spiderS - o.slowBefore, s)
      * (1 - smoothstep(spiderS + o.slowAfter, spiderS + o.slowAfter + 1.5, s));
    return o.speed + (o.slowSpeed - o.speed) * slow;
  };
  const ds = 0.01;
  const times = [0];
  for (let s = ds; s <= length + 1e-9; s += ds) times.push(times[times.length - 1] + ds / speedAt(s - ds / 2));
  const fullDuration = times[times.length - 1];
  const fullDistanceAt = t => {
    if (t <= 0) return 0;
    if (t >= fullDuration) return length;
    let lo = 0, hi = times.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid; }
    const f = (t - times[lo]) / (times[hi] - times[lo]);
    return Math.min(length, (lo + f) * ds);
  };
  // The walk starts startOffset meters along the route and ends stopAfter
  // meters past the spider; time counts between those two points.
  const s0 = Math.max(0, Math.min(o.startOffset, length - 1));
  const sEnd = Math.max(s0 + 1, Math.min(length, spiderS + o.stopAfter));
  const t0 = times[Math.min(times.length - 1, Math.round(s0 / ds))];
  const tEnd = times[Math.min(times.length - 1, Math.round(sEnd / ds))];
  const duration = tEnd - t0;
  const distanceAt = t => Math.min(sEnd, fullDistanceAt(t + t0));

  return { curve, length, spiderS, alleyS, duration, distanceAt, speedAt, startOffset: s0, endDistance: sEnd, opts: o, waypoints: pts2 };
}

// Camera pose at time t: position and look direction in the alley frame.
export function cameraAt(path, params, t) {
  const o = path.opts;
  const s = path.distanceAt(t);
  const u = s / path.length;
  const pos = path.curve.getPointAt(u).clone();
  const aheadU = Math.min(1, (s + o.lookAhead) / path.length);
  const aheadPt = path.curve.getPointAt(aheadU);
  let ahead = aheadPt.clone().sub(pos);
  if (ahead.lengthSq() < 1e-6) ahead = path.curve.getTangentAt(u);
  ahead.y = 0; ahead.normalize();

  // Gaze: from the alley mouth the eyes go to the spider's body and stay
  // on it until just past it, then come back down to the path ahead.
  const spider = new THREE.Vector3(params.along, params.bodyHeight, params.across);
  const toSpider = spider.clone().sub(pos).normalize();
  const w = smoothstep(path.alleyS, path.alleyS + 2.0, s) * (1 - smoothstep(path.spiderS - o.gazeHold, path.spiderS - o.gazeHold + o.gazeRelease, s));
  const dir = slerp(ahead, toSpider, w);
  // Keep the head from tipping straight back.
  const maxPitch = o.maxPitch * Math.PI / 180;
  const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  if (pitch > maxPitch) {
    const h = Math.hypot(dir.x, dir.z) || 1e-6;
    const k = Math.cos(maxPitch) / h;
    dir.set(dir.x * k, Math.sin(maxPitch), dir.z * k);
  }

  if (o.bob) {
    // Phase from distance walked, so slowing down does not jitter the bob:
    // one stride is speed / 1.9 m at any pace.
    const v = path.speedAt(s);
    const phase = 2 * Math.PI * 1.9 * s / o.speed;
    pos.y += 0.02 * Math.sin(phase) * (v / o.speed);
    const side = new THREE.Vector3(-ahead.z, 0, ahead.x);
    pos.addScaledVector(side, 0.012 * Math.sin(phase / 2) * (v / o.speed));
  }
  return { position: pos, direction: dir, distance: s, gaze: w, speed: path.speedAt(s) };
}

function slerp(a, b, w) {
  if (w <= 0) return a.clone();
  if (w >= 1) return b.clone();
  const cos = Math.max(-1, Math.min(1, a.dot(b)));
  const omega = Math.acos(cos);
  if (omega < 1e-4) return a.clone().lerp(b, w).normalize();
  if (Math.PI - omega < 1e-3) {
    // Opposite directions: go over the top.
    const up = new THREE.Vector3(0, 1, 0);
    return slerp(slerp(a, up, 0.5), b, w).normalize();
  }
  const sa = Math.sin((1 - w) * omega) / Math.sin(omega), sb = Math.sin(w * omega) / Math.sin(omega);
  return a.clone().multiplyScalar(sa).add(b.clone().multiplyScalar(sb)).normalize();
}

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
  afterSpider: 9.0,    // m walked past the spider before the walk ends
  vfov: 65,            // vertical field of view, degrees (about 97 wide at 16:9)
});

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Junction of two named streets in the site's road data, in alley-frame
// coordinates, or null.
export function junction(site, nameA, nameB) {
  const pts = name => new Set(site.roads.filter(r => r.name === name).flatMap(r => r.points.map(p => p.join(','))));
  const a = pts(nameA), b = pts(nameB);
  for (const k of a) if (b.has(k)) { const [e, n] = k.split(',').map(Number); return site.frame.toAlley(e, n); }
  return null;
}

// Build the path for a spider at params.along / params.across.
export function buildPath(site, params, opts = {}) {
  const o = { ...WALK_DEFAULTS, ...opts };
  const y = o.eyeHeight;
  const start = junction(site, 'Rue du Gros Jonc', 'Rue de Trousse Chemise') || [-1.8, 14.9];
  // The street centreline nodes between the junction and the alley mouth,
  // shifted a little toward the alley side (+x) as a walker aiming for a
  // right turn would.
  const street = site.roads.filter(r => r.name === 'Rue de Trousse Chemise')
    .flatMap(r => r.points.map(p => site.frame.toAlley(p[0], p[1])))
    .filter(([x, z]) => z > 2.5 && z < start[1] - 2.5 && Math.abs(x) < 3)
    .sort((p, q) => q[1] - p[1])
    .map(([x, z]) => [x + 0.4, z]);
  const sx = params.along, sz = params.across;
  const pts2 = [
    start,
    ...street,
    [0.9, 3.2],
    [1.6, 1.3],
    [2.8, sz * 0.5],
    [5.5, sz],
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
  const duration = times[times.length - 1];
  const distanceAt = t => {
    if (t <= 0) return 0;
    if (t >= duration) return length;
    let lo = 0, hi = times.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid; }
    const f = (t - times[lo]) / (times[hi] - times[lo]);
    return Math.min(length, (lo + f) * ds);
  };

  return { curve, length, spiderS, alleyS, duration, distanceAt, speedAt, opts: o, waypoints: pts2 };
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
    const v = path.speedAt(s);
    const stepHz = 1.9 * v / o.speed;
    const phase = 2 * Math.PI * stepHz * t;
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

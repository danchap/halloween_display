// Geometry of the alley spider. Pure functions, no rendering.
//
// Frame: the "alley frame". x runs along the alley from the street into the
// dead end, y is up, z runs across the alley. All lengths are meters.
//
// The brief locks the proportions in units of body length L. Here every
// dimension is a free parameter so the design can be explored, and
// briefPreset() produces the parameters that match the brief at a chosen L.
// A leg is three points: the root on the head, the knee and the foot. The
// knee and the foot are placed (dragged in the viewer); both segment lengths
// and the knee bend are derived from where they are.

export const LOCKED = Object.freeze({
  legLength: 3.25,      // body to foot, both segments together, in L
  abdomenLength: 0.76,
  abdomenWidth: 0.494,  // the body is a cylinder: height equals width
  headLength: 0.24,     // the head in front of the abdomen: the brief's 0.30 less the 0.06 inside the abdomen
  headWidth: 0.326,     // 0.66 of the abdomen width
  joinDepth: 0.06,      // how far the head continues into the abdomen (the brief's overlap); hidden, a drawing constant
  kneeFraction: 0.48,   // knee at 48 % of the leg length (drawing constant)
  frontBendFactor: 0.5, // the front pair bends half as much as the back pair
});

export const BEND_SERIES = [15, 30, 45, 60, 75, 90, 105];

// A resting spider's leg spread in plan: each pair's angle from straight
// across, degrees, positive toward the head. Front pair first.
export const SPREAD_AZIMUTHS = [55, 22, -22, -55];
// The climbing series of knee bends for the spread, as fractions of the
// knee slider (the back pair's bend in the brief's series): the front
// pairs bend most, so their knees rise above the head and the back legs
// trail, which with the body pitched up reads as climbing (Daniel,
// 2026-10-13). At 60° on the slider: 64 / 56 / 48 / 40° front to back.
export const CLIMB_BEND_FACTORS = [1.07, 0.93, 0.80, 0.67];

// Where the four leg roots sit along the visible head (cephalothorax), as
// fractions of its length measured from the front of the abdomen, front
// pair first.
export const ROOT_FRACTIONS = [0.94, 0.65, 0.36, 0.08];

// Parameters (meters, degrees):
//   abdomenLength/Width/Height, headLength/Width/Height: the two segments;
//     headLength is the head in front of the abdomen.
//   headLift: head axis above the abdomen axis.
//   along, bodyHeight, across: the body centre in the alley frame.
//   pitch: tilt of the whole spider, body and legs, about the body centre,
//     in degrees, head up is positive. facing: -1 head toward the street, +1
//     into the alley. bodyShape: cylinder, capsule, ellipsoid.
//   upperDiameter, lowerDiameter: leg thickness.
//   legs[j], j = 2 * pair + (0 for the right leg, 1 for the left), front
//   pair first, each as the level pose (what the spider looks like at
//   pitch 0; the pitch rotates it). Right is +z: the right-hand side when
//   looking into the alley from the street.
//     footAlong   foot along the alley from the body centre, + toward the head
//     footHeight  foot height; the wall gives its across position
//     kneeAlong   knee along the alley from the body centre, + toward the head
//     kneeHeight  knee height
//     kneeOut     knee distance from the body axis toward that leg's wall
//   Designs saved with `pairs` (one entry per pair, both sides mirrored)
//   are accepted: see legsFrom and upgradeParams.

const DEG = Math.PI / 180;

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { return Math.sqrt(dot(a, a)); }
function unit(a) { const n = norm(a); return n > 0 ? scale(a, 1 / n) : [0, 0, 0]; }
function round(v) { return Math.round(v * 1000) / 1000; }

export function legIndex(pair, side) { return 2 * pair + (side > 0 ? 0 : 1); }
export function legOf(p, pair, side) { return p.legs[legIndex(pair, side)]; }

// The eight legs of a parameter object: its own, or a mirrored pair list
// from an older design, or the defaults.
function legsFrom(params) {
  if (params.legs) return params.legs.map(q => ({ ...q }));
  if (params.pairs) return params.pairs.flatMap(q => [{ ...q }, { ...q }]);
  return DEFAULTS.legs.map(q => ({ ...q }));
}

// Bend factor for each pair, front (0) to back (3): the brief fixes the ends
// (front = half of back); the two middle pairs are spaced evenly between.
export function bendFactor(pairIndex) {
  const f = LOCKED.frontBendFactor;
  return f + (1 - f) * (pairIndex / 3);
}

// Root-to-foot distance for upper segment a, lower segment b and a knee bent
// `bendDeg` off straight (interior angle 180 - bend). Law of cosines.
export function rootToFootDistance(a, b, bendDeg) {
  return Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(bendDeg * DEG));
}

// Lower segment length that puts the foot at distance d from the root with
// upper segment a and bend `bendDeg`. Null when no positive length does.
export function lowerSegmentFor(a, d, bendDeg) {
  const c = Math.cos(bendDeg * DEG);
  const s = Math.sin(bendDeg * DEG);
  const disc = d * d - a * a * s * s;
  if (disc < 0) return null;
  const b = -a * c + Math.sqrt(disc);
  return b > 1e-6 ? b : null;
}

// Body length as the brief defines it: front of head to back of abdomen.
export function bodyLength(p) {
  return p.abdomenLength + p.headLength;
}

// Along-body offset of a leg root from the body center, positive toward the
// head. Independent of facing.
export function rootAlongOffset(p, pairIndex) {
  const L = bodyLength(p);
  return L / 2 - p.headLength + ROOT_FRACTIONS[pairIndex] * p.headLength;
}

// The body frame: `along` runs from the body centre toward the head, `up`
// is the body's own up, `across` is toward +z. Pitch tilts the whole spider
// about the body centre, head end up for a positive angle, whichever way
// it faces; the across coordinate is untouched, so a foot stays on its wall.
export function bodyFrame(p) {
  const f = p.facing >= 0 ? 1 : -1;
  const t = (p.pitch || 0) * DEG;
  const c = Math.cos(t), s = Math.sin(t);
  return {
    f,
    pitch: t,
    rotZ: f * t, // rotation of a mesh whose length runs along its own x
    toAlley: (along, up, across) => [
      p.along + f * (along * c - up * s),
      p.bodyHeight + along * s + up * c,
      p.across + across,
    ],
  };
}

// Knee for a leg with upper segment a bent `bendDeg` off straight between
// root and foot: in the vertical plane through both, lifted upward. When
// the foot is too close for that upper segment, the leg folds flat on the
// root-foot line so the problem is visible.
export function placeKnee(root, foot, a, bendDeg, f = 1) {
  const rf = sub(foot, root);
  const d = norm(rf);
  const u = unit(rf);
  const b = lowerSegmentFor(a, d, bendDeg);
  if (b === null) return { knee: add(root, scale(u, a)), b: Math.abs(a - d), folded: true };
  let n = sub([0, 1, 0], scale(u, u[1]));
  n = norm(n) > 1e-9 ? unit(n) : [f, 0, 0];
  const cosBeta = (a * a + d * d - b * b) / (2 * a * d);
  const beta = Math.acos(Math.max(-1, Math.min(1, cosBeta)));
  return { knee: add(root, add(scale(u, a * Math.cos(beta)), scale(n, a * Math.sin(beta)))), b, folded: false };
}

// Body-frame along and up of an alley-frame point: the inverse of
// bodyFrame().toAlley, so a point placed in the world is stored as the
// level pose that the pitch rotates onto it.
function bodyCoords(p, point) {
  const f = p.facing >= 0 ? 1 : -1;
  const t = (p.pitch || 0) * DEG, c = Math.cos(t), s = Math.sin(t);
  const X = f * (point[0] - p.along), Y = point[1] - p.bodyHeight;
  return { along: X * c + Y * s, up: -X * s + Y * c };
}

// Pair parameters for a knee at an alley-frame point on the given side.
export function kneeParamsAt(p, side, point) {
  const { along, up } = bodyCoords(p, point);
  return {
    kneeAlong: round(along),
    kneeHeight: round(p.bodyHeight + up),
    kneeOut: round(side * (point[2] - p.across)),
  };
}

// Pair parameters for a foot at an alley-frame point (its across position
// comes from the wall, not from here).
export function footParamsAt(p, point) {
  const { along, up } = bodyCoords(p, point);
  return { footAlong: round(along), footHeight: round(p.bodyHeight + up) };
}

// Parameters that are not geometry of the site. Everything in meters except
// angles (degrees) and the shape/facing choices.
export function briefPreset(L, options = {}) {
  const o = {
    backBend: 60,
    footHeights: [2.9, 1.9, 2.7, 1.6], // with a pitch, the heights the feet have once the spider is pitched
    bodyHeight: 2.5,
    along: 6.5,
    wallDistance: 1.47, // half the alley width used to place the default feet
    pitch: 0,           // the whole spider's pitch, head up positive
    ...options,
  };
  const leg = LOCKED.legLength * L;
  const a = leg * LOCKED.kneeFraction;
  const b = leg - a;
  const p = {
    abdomenLength: LOCKED.abdomenLength * L,
    abdomenWidth: LOCKED.abdomenWidth * L,
    abdomenHeight: LOCKED.abdomenWidth * L,
    headLength: LOCKED.headLength * L,
    headWidth: LOCKED.headWidth * L,
    headHeight: LOCKED.headWidth * L,
    headLift: 0,
    pitch: 0,
    bodyShape: 'capsule',
    along: o.along,
    bodyHeight: o.bodyHeight,
    across: 0,
    facing: -1,                      // -1: head toward the street, +1: into the alley
    upperDiameter: 0.06 * L,
    lowerDiameter: 0.045 * L,
    legs: [],
  };
  const frame = bodyFrame(p);
  // Feet: at the brief's bends and lengths, each foot sits at the wanted
  // height and as far along the alley as the leg then reaches. Knees follow
  // from the bend. Computed for the right-hand leg; the left mirrors it.
  for (let i = 0; i < 4; i++) {
    const bend = o.backBend * bendFactor(i);
    const d = rootToFootDistance(a, b, bend);
    const rootAlong = rootAlongOffset(p, i);
    const root = frame.toAlley(rootAlong, 0, p.headWidth / 2);
    const dz = o.wallDistance - p.headWidth / 2;
    const forward = i < 2 ? 1 : -1;
    // The foot's level-pose height: the wanted height itself, or, with a
    // pitch, the level height that the pitch turns onto the wanted height.
    const height = o.pitch ? levelFootHeight(o.footHeights[i], { pitch: o.pitch, bodyHeight: p.bodyHeight, rootAlong, forward, d, dz }) : o.footHeights[i];
    const dy = height - root[1];
    const dx2 = d * d - dz * dz - dy * dy;
    const dx = dx2 > 0 ? Math.sqrt(dx2) : 0;
    const footAlong = rootAlong + forward * dx;
    const foot = [p.along + frame.f * footAlong, height, o.wallDistance];
    const { knee } = placeKnee(root, foot, a, bend, frame.f);
    const leg = { footAlong: round(footAlong), footHeight: round(height), ...kneeParamsAt(p, 1, knee) };
    p.legs.push(leg, { ...leg });
  }
  p.pitch = o.pitch;
  return p;
}

// The level-pose height of a foot that the pitch must turn onto `target`.
// In the level pose the foot sits at rootAlong + forward * dx along the
// body and dy above the body centre, with dx from the leg's reach d, its
// wall distance dz and dy; pitched by t the foot's height is
// bodyHeight + along * sin t + dy * cos t. The equation in dy can have two
// answers (a foot high and close, or lower and further out): the one with
// the foot further out is taken. An unreachable target gives the nearest.
function levelFootHeight(target, { pitch, bodyHeight, rootAlong, forward, d, dz }) {
  const t = pitch * DEG, s = Math.sin(t), c = Math.cos(t);
  const R = Math.sqrt(Math.max(0, d * d - dz * dz));
  const heightOf = dy => {
    const dx = Math.sqrt(Math.max(0, R * R - dy * dy));
    return bodyHeight + (rootAlong + forward * dx) * s + dy * c;
  };
  // Sample the reachable range, keep the samples nearest the target, prefer
  // the one with the foot further out (the smaller |dy|), then refine.
  const n = 400;
  let best = null;
  for (let k = 0; k <= n; k++) {
    const dy = -R + 2 * R * k / n;
    const err = Math.abs(heightOf(dy) - target);
    if (best === null || err < best.err - 1e-6 || (Math.abs(err - best.err) <= 1e-6 && Math.abs(dy) < Math.abs(best.dy))) best = { dy, err };
  }
  let lo = Math.max(-R, best.dy - 2 * R / n), hi = Math.min(R, best.dy + 2 * R / n);
  for (let k = 0; k < 40; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (Math.abs(heightOf(m1) - target) < Math.abs(heightOf(m2) - target)) hi = m2; else lo = m1;
  }
  const dy = (lo + hi) / 2;
  return bodyHeight + dy;
}

// A spread pose, worked out in the pitched pose as it stands in the alley:
// the legs fan out in plan like a resting spider's (azimuths, degrees from
// straight across, positive toward the head), each foot at the height
// wanted for it, each leg bent by the bend series with the knee at the
// brief's fraction and scaled to reach its wall, never longer than the
// brief's leg: a leg that would need more is held at that length and its
// foot slides toward straight across. The feet keep their heights, so a
// pitch does not throw them up or down the walls.
export function spreadLegsAt(p, { azimuths = SPREAD_AZIMUTHS, footHeights, backBend = 60, bends = null, wallDistance = 1.47, walls = null } = {}) {
  const frame = bodyFrame(p);
  const L = bodyLength(p);
  const cap = LOCKED.legLength * L;
  const kf = LOCKED.kneeFraction;
  const legs = [];
  const held = [];
  for (let i = 0; i < 4; i++) {
    for (const side of [1, -1]) {
      const j = legIndex(i, side);
      const bend = bends ? (bends.length === 8 ? bends[j] : bends[i]) : backBend * bendFactor(i); // bends: a knee bend per pair (front first) or per leg, instead of the brief's series
      const unitD = rootToFootDistance(kf, 1 - kf, bend); // root-to-foot distance of a unit leg
      const root = frame.toAlley(rootAlongOffset(p, i), 0, side * p.headWidth / 2);
      const height = footHeights.length === 8 ? footHeights[j] : footHeights[i];
      const dy = height - root[1];
      let phi = (azimuths.length === 8 ? azimuths[j] : azimuths[i]) * DEG;
      const sign = phi !== 0 ? Math.sign(phi) : (i < 2 ? 1 : -1);
      // The wall at the foot: iterate once on the foot's x for a wall that varies.
      let wallZ = side * wallDistance, reach, h = 0, footX = root[0];
      for (let pass = 0; pass < 3; pass++) {
        if (walls) { const w = walls(footX, side, p.across); if (w !== null && w !== undefined && Math.sign(w - p.across) === side) wallZ = w; }
        reach = Math.max(0.01, Math.abs(wallZ - p.across) - p.headWidth / 2);
        h = reach / Math.cos(phi);
        let total = Math.sqrt(h * h + dy * dy) / unitD;
        if (total > cap + 1e-6) {
          total = cap;
          const h2 = (cap * unitD) ** 2 - dy * dy;
          if (h2 > reach * reach) { h = Math.sqrt(h2); phi = sign * Math.acos(Math.min(1, reach / h)); }
          else { h = reach; phi = 0; }
          if (!held.includes(j)) held.push(j);
        }
        footX = root[0] + frame.f * h * Math.sin(phi);
      }
      const foot = [footX, height, wallZ];
      const d = Math.sqrt(h * h + dy * dy);
      const total = Math.min(cap, d / unitD);
      const { knee } = placeKnee(root, foot, total * kf, bend, frame.f);
      legs[j] = { ...footParamsAt(p, foot), ...kneeParamsAt(p, side, knee) };
    }
  }
  return { legs, held };
}

// The resting pose the page starts from: the brief's body at L, pitched up
// 45 degrees (head toward the street, climbing up and out), the legs fanned
// out in plan and the feet at 3.0, 2.6, 2.3 and 2.0 m from the front pair
// to the back, out of a child's reach (Daniel, 2026-10-13).
export function spreadPreset(L, options = {}) {
  const o = { pitch: 45, azimuths: SPREAD_AZIMUTHS, footHeights: [2.6, 2.4, 2.2, 2.0], backBend: 60, bodyHeight: 2.5, along: 6.5, wallDistance: 1.47, walls: null, ...options }; // feet 2.6 m at most: a child hanging on a front stay would buckle a taller post (structural check, 2026-10-13); 2.0 m at least: out of reach
  const p = briefPreset(L, { backBend: o.backBend, bodyHeight: o.bodyHeight, along: o.along, wallDistance: o.wallDistance });
  p.pitch = o.pitch;
  p.legs = spreadLegsAt(p, { azimuths: o.azimuths, footHeights: o.footHeights, backBend: o.backBend, bends: o.bends || CLIMB_BEND_FACTORS.map(f => o.backBend * f), wallDistance: o.wallDistance, walls: o.walls }).legs;
  return p;
}

export const DEFAULTS = Object.freeze(spreadPreset(0.8));
export const BRIEF_DEFAULTS = Object.freeze(briefPreset(0.8)); // the brief's own pose: staggered feet, level

// Parameters saved by earlier versions of the pages, brought up to date:
// the head length used to include the part inside the abdomen (saved as
// `overlap`), pitch did not exist, and legs were saved per pair with the
// two sides mirrored. Legs saved with a bend and an upper length are
// accepted as they are by buildSpider.
export function upgradeParams(params) {
  const p = { ...DEFAULTS, ...params };
  if (typeof p.overlap === 'number') {
    p.headLength = Math.max(0.05, p.headLength - p.overlap);
    delete p.overlap;
  }
  if (typeof params.pitch !== 'number' && (params.legs || params.pairs)) p.pitch = 0; // a design saved before the pitch existed was level, whatever today's default is; no legs at all means the default pose
  if (!params.legs && params.pairs) p.legs = legsFrom({ pairs: params.pairs });
  delete p.pairs;
  // Settled choices (Daniel, 2026-10-06): the head toward the street, the
  // body on the alley's centreline, a capsule body, no head lift.
  p.facing = -1;
  p.across = 0;
  p.headLift = 0;
  p.bodyShape = 'capsule';
  return p;
}

// walls: function (xAlong, side, fromZ) -> z of the wall on that side (sign
// included), or null when there is none. side is +1 or -1.
export function flatWalls(width) {
  return (x, side) => side * width / 2;
}

// Root and foot of one leg in the alley frame. The foot's level-pose
// position is pitched with the body; the wall where it then lands gives
// its across position.
function legEnds(p, walls, frame, pair, side) {
  const q = legOf(p, pair, side);
  const root = frame.toAlley(rootAlongOffset(p, pair), p.headLift, side * p.headWidth / 2);
  const [footX, footY] = frame.toAlley(q.footAlong, q.footHeight - p.bodyHeight, 0);
  let wallZ = walls(footX, side, p.across);
  let status = 'ok';
  if (wallZ === null || wallZ === undefined || Math.sign(wallZ - p.across) !== side) {
    status = 'noWall';
    wallZ = p.across + side * 1.5;
  }
  return { root, foot: [footX, footY, wallZ], status };
}

// Is a knee past its wall, inside the building?
function kneeInsideWall(walls, p, side, knee) {
  const w = walls(knee[0], side, p.across);
  return w !== null && w !== undefined && Math.abs(knee[2] - p.across) > Math.abs(w - p.across) + 1e-6;
}

// Build the whole spider from a parameter object (see briefPreset/DEFAULTS).
export function buildSpider(params, walls = flatWalls(3.0)) {
  const p = { ...DEFAULTS, ...params, legs: legsFrom(params) };
  delete p.pairs;
  const L = bodyLength(p);
  const frame = bodyFrame(p);
  const f = frame.f;

  // Body segments: centre in the alley frame, length along the body axis,
  // and the rotation that tilts a mesh whose length runs along its x. The
  // head is drawn a little longer than its visible length so it continues
  // into the abdomen with no gap when lifted or pitched.
  const join = Math.min(LOCKED.joinDepth * L, p.abdomenLength / 2);
  const segment = (alongCenter, up, length, width, height) => ({
    center: frame.toAlley(alongCenter, up, 0), length, width, height, rotZ: frame.rotZ,
  });
  const abdomen = segment(-L / 2 + p.abdomenLength / 2, 0, p.abdomenLength, p.abdomenWidth, p.abdomenHeight);
  const head = segment(L / 2 - (p.headLength + join) / 2, p.headLift, p.headLength + join, p.headWidth, p.headHeight);

  const legs = [];
  for (let pair = 0; pair < 4; pair++) {
    for (const side of [1, -1]) {
      const q = legOf(p, pair, side);
      const { root, foot, status } = legEnds(p, walls, frame, pair, side);
      const knee = q.kneeAlong === undefined
        ? placeKnee(root, foot, q.upper, q.bend, f).knee // designs saved before knees were points: from bend and upper length
        : frame.toAlley(q.kneeAlong, q.kneeHeight - p.bodyHeight, side * q.kneeOut);
      const a = norm(sub(knee, root));
      const b = norm(sub(foot, knee));
      const d = norm(sub(foot, root));
      const cosInterior = a > 1e-9 && b > 1e-9 ? (a * a + b * b - d * d) / (2 * a * b) : 1;
      const interior = Math.acos(Math.max(-1, Math.min(1, cosInterior))) / DEG;
      legs.push({
        pair, side, root, knee, foot, a, b, d,
        bend: 180 - interior, interiorAngle: interior,
        wallDistance: Math.abs(foot[2] - p.across),
        kneeInWall: kneeInsideWall(walls, p, side, knee),
        status,
      });
    }
  }

  const stats = computeStats({ p, L, abdomen, head, legs });
  return { params: p, L, facing: f, pitch: frame.pitch, abdomen, head, legs, stats };
}

// Leg parameters with the knee placed for an upper segment `upper` bent
// `bendDeg` off straight, from that leg's root and foot. Worked out in the
// level pose; the pitch then rotates the leg rigidly, keeping its lengths
// and bend.
// The face: eight eyes on the front of the head, two big and six small,
// placed as a spider's are (the big pair forward, a small pair beside and
// below it, two small pairs above), each on the front cap of the head
// capsule and facing out of it. The sizes are fractions of the head's
// width (FACE), so the eyes grow with L: at L = 0.8 the googly eyes are
// discs of 13 and 5 cm, the lit eyes domes of 9 and 4 cm. When the spider
// is pitched up the face is turned down the cap by most of the pitch
// (faceTilt), so it still looks down the alley toward the street rather
// than at the sky. faceOf gives each eye's centre, outward normal and
// diameter in the alley frame for the model and parameters passed.
export const FACE = Object.freeze({
  googly: { big: 0.50, small: 0.18, label: 'googly eyes' },
  lit: { big: 0.36, small: 0.16, label: 'lit eyes' },
});
export const EYE_CHOICES = ['googly', 'lit', 'none'];
// Each eye: elevation above the head's axis and azimuth off it, degrees;
// azimuth + is the right-hand side when looking at the face. Spread so
// that no two eyes overlap on a head as wide as it is high.
const EYE_PLACES = [
  { el: -18, az: 38, big: true }, { el: -18, az: -38, big: true },
  { el: -30, az: 80, big: false }, { el: -30, az: -80, big: false },
  { el: 22, az: 16, big: false }, { el: 22, az: -16, big: false },
  { el: 18, az: 62, big: false }, { el: 18, az: -62, big: false },
];
// The face looks this many degrees above the alley's level when pitched:
// the eyes are turned down the cap by the pitch less this.
const FACE_LOOK_UP = 12;
export function faceTilt(pitch) { return -Math.max(0, Math.min(pitch || 0, 60) - FACE_LOOK_UP); }
export function faceOf(model, params, kind = 'googly') {
  const spec = FACE[kind];
  if (!spec) return [];
  const p = { ...DEFAULTS, ...params };
  const frame = bodyFrame(p);
  const o = frame.toAlley(0, 0, 0);
  const dir = (a, u, c) => sub(frame.toAlley(a, u, c), o);
  const along = dir(1, 0, 0), up = dir(0, 1, 0), across = dir(0, 0, 1);
  const head = model.head;
  // The capsule's front cap is a sphere of the larger half-width, drawn
  // squashed to the head's height and width; the capsule is drawn with a
  // straight part of at least 0.01 m (scene.js bodyMesh), so the cap's
  // centre is half that part ahead of the head segment's centre.
  const rx = Math.max(head.width, head.height) / 2, ry = head.height / 2, rz = head.width / 2;
  const straight = Math.max(0.01, head.length - 2 * rx);
  const capCentre = frame.toAlley(bodyLength(p) / 2 - head.length / 2 + straight / 2, p.headLift || 0, 0);
  // The tilt turns the whole pattern about the across axis, so the eyes
  // keep their spacing; shifting each elevation instead would crowd them
  // toward the cap's pole.
  const tau = faceTilt(p.pitch) * DEG;
  return EYE_PLACES.map(e => {
    const t = e.el * DEG, s = e.az * DEG;
    const u0 = [Math.cos(t) * Math.cos(s), Math.sin(t), Math.cos(t) * Math.sin(s)]; // on the unit sphere: along, up, across
    const u = [u0[0] * Math.cos(tau) - u0[1] * Math.sin(tau), u0[0] * Math.sin(tau) + u0[1] * Math.cos(tau), u0[2]];
    const centre = add(add(add(capCentre, scale(along, u[0] * rx)), scale(up, u[1] * ry)), scale(across, u[2] * rz));
    const normal = unit(add(add(scale(along, u[0] / rx), scale(up, u[1] / ry)), scale(across, u[2] / rz))); // the squashed sphere's normal
    return { centre: centre.map(round), normal, diameter: round((e.big ? spec.big : spec.small) * head.width), big: e.big };
  });
}

export function kneeFromBend(p, walls, pair, upper, bendDeg, side = 1) {
  const full = { ...DEFAULTS, ...p, legs: legsFrom(p) }; // as the spider stands (pitched); the result is stored as the level pose
  const frame = bodyFrame(full);
  const { root, foot } = legEnds(full, walls, frame, pair, side);
  const { knee } = placeKnee(root, foot, upper, bendDeg, frame.f);
  return { ...legOf(full, pair, side), ...kneeParamsAt(full, side, knee) };
}

function computeStats({ p, L, abdomen, head, legs }) {
  // Vertical extent of a tilted segment, from its centre.
  const extent = seg => (seg.length / 2) * Math.abs(Math.sin(seg.rotZ)) + (seg.height / 2) * Math.abs(Math.cos(seg.rotZ));
  const kneeYs = legs.map(l => l.knee[1]);
  const topY = Math.max(abdomen.center[1] + extent(abdomen), head.center[1] + extent(head), ...kneeYs, ...legs.map(l => l.foot[1]));
  const bodyBottom = Math.min(abdomen.center[1] - extent(abdomen), head.center[1] - extent(head));
  const footXs = legs.map(l => l.foot[0]);
  const footZs = legs.map(l => l.foot[2]);

  // Lowest point of the spider over the walking path: anything further than
  // a margin from each wall, where people actually walk.
  const margin = 0.3;
  let pathLow = bodyBottom;
  for (const l of legs) {
    const wall = l.foot[2];
    const inner = Math.sign(wall - p.across);
    for (const [s, e] of [[l.root, l.knee], [l.knee, l.foot]]) {
      for (let t = 0; t <= 1; t += 0.02) {
        const z = s[2] + (e[2] - s[2]) * t;
        if ((wall - z) * inner >= margin) pathLow = Math.min(pathLow, s[1] + (e[1] - s[1]) * t);
      }
    }
  }

  const pairs = [0, 1, 2, 3].map(i => {
    const l = legs.find(x => x.pair === i && x.side === 1);
    const r = legs.find(x => x.pair === i && x.side === -1);
    const total = l.a + l.b, totalOther = r.a + r.b;
    const worse = (x, y, target) => Math.abs(x - target) >= Math.abs(y - target) ? x : y;
    return {
      pair: i + 1,
      bend: l.bend,
      bendOtherSide: r.bend,
      interiorAngle: l.interiorAngle,
      upper: l.a,
      lower: l.b,
      lowerOtherSide: r.b,
      total,
      totalOtherSide: totalOther,
      totalInL: total / L,
      // The side further from the brief, for the comparison table.
      totalInLWorst: worse(total / L, totalOther / L, LOCKED.legLength),
      kneeFraction: l.a / total,
      kneeFractionWorst: worse(l.a / total, r.a / totalOther, LOCKED.kneeFraction),
      rootToFoot: l.d,
      footHeight: l.foot[1],
      footAlong: legOf(p, i, 1).footAlong,
      wallDistance: l.wallDistance,
      wallDistanceOtherSide: r.wallDistance,
      kneeHeight: l.knee[1],
      status: l.status === 'ok' ? r.status : l.status,
    };
  });

  // What is wrong with the pose, in words for the HUD.
  const warnings = [];
  const say = (n, one, many) => { if (n === 1) warnings.push(one); else if (n > 1) warnings.push(many.replace('N', n)); };
  say(legs.filter(l => l.status !== 'ok').length, 'a foot has no wall', 'N feet have no wall');
  say(legs.filter(l => l.kneeInWall).length, 'a knee is inside a wall', 'N knees are inside a wall');
  say(legs.filter(l => l.foot[1] < 0).length, 'a foot is below the lane', 'N feet are below the lane');

  return {
    bodyLength: L,
    abdomenInL: [p.abdomenLength / L, p.abdomenWidth / L, p.abdomenHeight / L],
    headInL: [p.headLength / L, p.headWidth / L, p.headHeight / L],
    headToAbdomenWidth: p.headWidth / p.abdomenWidth,
    pitch: p.pitch || 0,
    spanAcross: Math.max(...footZs) - Math.min(...footZs),
    lengthAlong: Math.max(...footXs) - Math.min(...footXs),
    topHeight: topY,
    bodyBottom,
    pathClearance: pathLow,
    allOk: legs.every(l => l.status === 'ok'),
    warnings,
    pairs,
  };
}

// Each leg's angles in the level pose, indexed like p.legs: plan, degrees
// from straight across, positive toward the head, root to foot; hip, the
// upper segment's elevation above level; bend, degrees off straight at
// the knee. Under the split rule these three and the wall define the leg.
export function legAngles(p, walls) {
  const level = { ...DEFAULTS, ...p, legs: legsFrom(p) }; // as the spider stands (pitched); results are stored as the level pose
  const m = buildSpider(level, walls);
  return m.legs.map(l => ({
    plan: Math.atan2(m.facing * (l.foot[0] - l.root[0]), l.side * (l.foot[2] - l.root[2])) / DEG,
    hip: Math.atan2(l.knee[1] - l.root[1], Math.hypot(l.knee[0] - l.root[0], l.knee[2] - l.root[2])) / DEG,
    bend: l.bend,
  }));
}
// The plan angles alone: what the angle sliders keep.
export function planAngles(p, walls) { return legAngles(p, walls).map(x => x.plan); }

// Distance from a leg root's wall-side face of the head to its wall, at a
// foot x, in the level pose. 1.5 m from the centreline where there is no wall.
function wallReach(level, walls, footX, side) {
  const w = walls(footX, side, level.across);
  return (w === null || w === undefined) ? 1.5 - level.headWidth / 2 : Math.abs(w - level.across) - level.headWidth / 2;
}

// A leg posed nearer the wall's own direction than this would need an
// absurd length to reach it.
const MAX_PLAN_ANGLE = 85;

// Pose every leg from two angles, worked out as the spider stands in the
// alley (pitched; the results are stored as the level pose, which the pitch
// turns back onto them): the hip, the upper segment's elevation above the
// alley's level as it leaves the body, and the back-pair knee bend (front
// pair half, the middle pairs between); `hips` and `bends`, one per leg,
// stand in for the two when given. Each leg lies in the vertical plane
// through its root at its plan angle (`azimuths`: one per leg, or one per
// pair, degrees from straight across, + toward the head) and is scaled,
// keeping the brief's upper/lower split, until the foot meets the wall,
// but never past `maxLength` (the brief's leg length unless given): a leg
// that would need more is held at that length and its foot slides toward
// straight across, and one that cannot reach its wall even straight
// across is stretched to just reach. Returns { legs, capped, stretched }:
// the new legs as the level pose, and the indexes of the legs held at the
// length and of those stretched past it.
export function legsFromAngles(p, walls, { hip, backBend, azimuths, hips = null, bends = null, maxLength = null }) {
  const level = { ...DEFAULTS, ...p, legs: legsFrom(p) }; // as the spider stands (pitched); results are stored as the level pose
  const frame = bodyFrame(level);
  const f = frame.f;
  const legs = level.legs.map(q => ({ ...q }));
  const cap = maxLength === null ? LOCKED.legLength * bodyLength(level) : maxLength;
  const kf = LOCKED.kneeFraction;
  const capped = [], stretched = [];
  for (let pair = 0; pair < 4; pair++) {
    for (const side of [1, -1]) {
      const j = legIndex(pair, side);
      const hipDeg = hips ? hips[j] : hip;
      const bend = bends ? bends[j] : backBend * bendFactor(pair);
      const t = hipDeg * DEG, u = (hipDeg - bend) * DEG;
      // Reach per unit of leg length at these angles; the wall sets the length.
      const unit = Math.max(0.05, kf * Math.cos(t) + (1 - kf) * Math.cos(u));
      const root = frame.toAlley(rootAlongOffset(level, pair), 0, side * level.headWidth / 2);
      const planDeg = Math.max(-MAX_PLAN_ANGLE, Math.min(MAX_PLAN_ANGLE, azimuths.length === 8 ? azimuths[j] : azimuths[pair]));
      const sign = planDeg !== 0 ? Math.sign(planDeg) : (pair < 2 ? 1 : -1);
      let phi = 0, h = 1, total = 1, held = false, over = false, footX = root[0];
      // The wall distance depends on where the foot lands; a few passes settle it.
      for (let pass = 0; pass < 4; pass++) {
        const reach = Math.max(0.01, wallReach(level, walls, footX, side));
        phi = planDeg * DEG;
        h = reach / Math.cos(phi); // root to wall, along the plane
        total = h / unit;
        held = total > cap + 0.002; over = false;
        if (held) {
          total = cap; h = cap * unit;
          if (h >= reach) phi = sign * Math.acos(reach / h); // the foot slides toward straight across
          else { phi = 0; h = reach; total = reach / unit; over = true; } // even straight across falls short
        }
        footX = root[0] + f * h * Math.sin(phi);
      }
      if (over) stretched.push(j); else if (held) capped.push(j);
      const a = total * kf;
      const b = total - a;
      const rise = a * Math.sin(t) + b * Math.sin(u); // foot height above the root
      const dir = [f * Math.sin(phi), 0, side * Math.cos(phi)]; // level unit vector, root toward the wall
      const knee = [root[0] + a * Math.cos(t) * dir[0], root[1] + a * Math.sin(t), root[2] + a * Math.cos(t) * dir[2]];
      const foot = [root[0] + h * dir[0], root[1] + rise, root[2] + h * dir[2]];
      legs[j] = { ...footParamsAt(level, foot), ...kneeParamsAt(level, side, knee) };
    }
  }
  return { legs, capped, stretched };
}

// The brief's-leg rule: the knee at the brief's fraction of the leg, the
// leg in one vertical plane through its root and no longer than the
// brief's leg (`maxLength`, the brief's by default), so that its plan
// angle, hip angle, bend and the wall define it (legsFromAngles). The two
// functions below re-solve one leg of p under the rule after its knee or
// foot has been moved, as the spider stands in the alley (pitched). Each
// returns the leg's new parameters (the level pose), or null where the
// rule cannot be met.

// From the knee: it sets the plane, the upper segment's elevation and the
// scale (the upper segment is the brief's fraction of the leg); the lower
// segment then meets the wall in that plane, at whichever of its two
// possible angles is nearer the one it has. A knee further from the body
// than the upper segment of a leg of `maxLength` is pulled back to that
// distance. Null when the lower segment cannot reach the wall from there.
export function solveLegFromKnee(p, walls, pair, side, { maxLength = null } = {}) {
  const level = { ...DEFAULTS, ...p, legs: legsFrom(p) }; // as the spider stands (pitched); results are stored as the level pose
  const frame = bodyFrame(level), f = frame.f;
  const q = legOf(level, pair, side);
  const { root, foot: oldFoot } = legEnds(level, walls, frame, pair, side);
  let knee = frame.toAlley(q.kneeAlong, q.kneeHeight - level.bodyHeight, side * q.kneeOut);
  let v = sub(knee, root);
  let a = norm(v);
  const cap = maxLength === null ? LOCKED.legLength * bodyLength(level) : maxLength;
  const capA = cap * LOCKED.kneeFraction;
  if (a > capA) { v = scale(v, capA / a); a = capA; knee = add(root, v); } // pulled back to the brief's upper segment
  const horiz = Math.hypot(v[0], v[2]); // the upper segment's level reach
  if (a < 1e-6 || horiz < 1e-6) return null;
  const phi = Math.atan2(f * v[0], side * v[2]); // the plane's plan angle
  if (Math.abs(phi) > MAX_PLAN_ANGLE * DEG) return null;
  const b = a * (1 - LOCKED.kneeFraction) / LOCKED.kneeFraction;
  const dir = [f * Math.sin(phi), 0, side * Math.cos(phi)]; // level unit vector, root toward the wall
  const kf = sub(oldFoot, knee);
  const u0 = Math.atan2(kf[1], Math.hypot(kf[0], kf[2])); // the lower segment's present elevation
  let footX = oldFoot[0], foot = null;
  // The wall distance depends on where the foot lands; a few passes settle it.
  for (let pass = 0; pass < 4; pass++) {
    const h = wallReach(level, walls, footX, side) / Math.cos(phi); // root to wall, along the plane
    const c = (h - horiz) / b; // cosine of the lower segment's elevation
    if (Math.abs(c) > 1) return null;
    const u = Math.abs(Math.acos(c) - u0) <= Math.abs(-Math.acos(c) - u0) ? Math.acos(c) : -Math.acos(c);
    foot = [root[0] + h * dir[0], knee[1] + b * Math.sin(u), root[2] + h * dir[2]];
    footX = foot[0];
  }
  return { ...q, ...kneeParamsAt(level, side, knee), ...footParamsAt(level, foot) };
}

// From the foot: the leg keeps its bend (`bend`, the bend it had before
// the foot moved; without it, the bend of its present knee with the new
// foot) and the brief's split, and turns and scales in the vertical plane
// through root and foot to reach it, knee lifted, up to `maxLength` (the
// brief's leg by default); past that it unfolds instead of growing. Null
// when the foot is beyond even a straight leg's reach, or sits on the
// root.
export function solveLegFromFoot(p, walls, pair, side, { bend: bendDeg = null, maxLength = null } = {}) {
  const level = { ...DEFAULTS, ...p, legs: legsFrom(p) }; // as the spider stands (pitched); results are stored as the level pose
  const frame = bodyFrame(level);
  const q = legOf(level, pair, side);
  const { root, foot } = legEnds(level, walls, frame, pair, side);
  const oldKnee = frame.toAlley(q.kneeAlong, q.kneeHeight - level.bodyHeight, side * q.kneeOut);
  const d = norm(sub(foot, root));
  if (d < 1e-6) return null;
  const kf = LOCKED.kneeFraction;
  const cap = maxLength === null ? LOCKED.legLength * bodyLength(level) : maxLength;
  let bend = Math.max(0, Math.min(170, bendDeg === null ? bendAt(root, oldKnee, foot) : bendDeg));
  let total = d / rootToFootDistance(kf, 1 - kf, bend); // the same shape, scaled to reach the foot
  if (total > cap) {
    // At the length allowed the leg unfolds instead of growing further.
    total = cap;
    const a = cap * kf, b = cap - a;
    const c = (d * d - a * a - b * b) / (2 * a * b); // cosine of the bend, by the law of cosines
    if (c > 1) return null; // beyond even a straight leg's reach
    bend = Math.acos(Math.max(-1, c)) / DEG;
  }
  const { knee } = placeKnee(root, foot, total * kf, bend, frame.f);
  return { ...q, ...kneeParamsAt(level, side, knee) };
}

// Degrees off straight at the knee of the triangle root, knee, foot.
function bendAt(root, knee, foot) {
  const a = norm(sub(knee, root)), b = norm(sub(foot, knee)), d = norm(sub(foot, root));
  if (a < 1e-9 || b < 1e-9) return 0;
  const cosInterior = (a * a + b * b - d * d) / (2 * a * b);
  return 180 - Math.acos(Math.max(-1, Math.min(1, cosInterior))) / DEG;
}

// Move each foot along its wall (keeping its height) to where a leg with the
// given upper segment and bend has lower segment `lowerTarget`, then place
// the knee for that bend. `targets`, { upper, bend } one per leg or one
// per pair, defaults to each leg's own values. Each leg is solved on its
// own wall. Returns a new legs array; a foot that cannot reach stays where
// it was.
export function solveFeetForLength(p, walls, lowerTarget, targets = null) {
  p = { ...p, legs: legsFrom(p) }; // worked out as the spider stands (pitched); stored as the level pose
  const model = buildSpider(p, walls);
  const f = model.facing;
  const legs = p.legs.map(q => ({ ...q }));
  for (let i = 0; i < 4; i++) {
    const forward = i < 2 ? 1 : -1;
    for (const side of [1, -1]) {
      const leg = model.legs.find(l => l.pair === i && l.side === side);
      const j = legIndex(i, side);
      const t = targets ? (targets.length === 8 ? targets[j] : targets[i]) : { upper: leg.a, bend: leg.bend };
      const d = rootToFootDistance(t.upper, lowerTarget, t.bend);
      const footY = leg.foot[1]; // the foot keeps its height in the alley
      const dy = footY - leg.root[1];
      let foot = leg.foot, footX = leg.foot[0];
      // The wall distance depends on where the foot lands; two passes settle it.
      for (let pass = 0; pass < 3; pass++) {
        const w = walls(footX, side, p.across);
        const wallZ = (w === null || w === undefined) ? p.across + side * 1.5 : w;
        const dz = Math.abs(wallZ - p.across) - p.headWidth / 2;
        const dx2 = d * d - dz * dz - dy * dy;
        if (dx2 <= 0) { foot = leg.foot; break; } // cannot reach: leave the foot where it was
        footX = leg.root[0] + f * forward * Math.sqrt(dx2);
        foot = [footX, footY, wallZ];
      }
      legs[j] = { ...legs[j], ...footParamsAt(p, foot) };
      legs[j] = kneeFromBend({ ...p, legs }, walls, i, t.upper, t.bend, side);
    }
  }
  return legs;
}

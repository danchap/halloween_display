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
    footHeights: [2.9, 1.9, 2.7, 1.6],
    bodyHeight: 2.5,
    along: 6.5,
    wallDistance: 1.47, // half the alley width used to place the default feet
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
    const dy = o.footHeights[i] - root[1];
    const dz = o.wallDistance - p.headWidth / 2;
    const dx2 = d * d - dz * dz - dy * dy;
    const dx = dx2 > 0 ? Math.sqrt(dx2) : 0;
    const forward = i < 2 ? 1 : -1;
    const footAlong = rootAlong + forward * dx;
    const foot = [p.along + frame.f * footAlong, o.footHeights[i], o.wallDistance];
    const { knee } = placeKnee(root, foot, a, bend, frame.f);
    const leg = { footAlong: round(footAlong), footHeight: o.footHeights[i], ...kneeParamsAt(p, 1, knee) };
    p.legs.push(leg, { ...leg });
  }
  return p;
}

export const DEFAULTS = Object.freeze(briefPreset(0.8));

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
  if (typeof p.pitch !== 'number') p.pitch = 0;
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
export function kneeFromBend(p, walls, pair, upper, bendDeg, side = 1) {
  const full = { ...DEFAULTS, ...p, pitch: 0, legs: legsFrom(p) };
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
    pairs,
  };
}

// Plan angle of each leg in the level pose: degrees from straight across,
// positive toward the head, measured from the root to the foot. Indexed
// like p.legs. This is what the angle sliders keep.
export function planAngles(p, walls) {
  const level = { ...DEFAULTS, ...p, pitch: 0, legs: legsFrom(p) };
  const frame = bodyFrame(level);
  const out = [];
  for (let pair = 0; pair < 4; pair++) {
    for (const side of [1, -1]) {
      const { root, foot } = legEnds(level, walls, frame, pair, side);
      out[legIndex(pair, side)] = Math.atan2(frame.f * (foot[0] - root[0]), side * (foot[2] - root[2])) / DEG;
    }
  }
  return out;
}

// A leg posed nearer the wall's own direction than this would need an
// absurd length to reach it.
const MAX_PLAN_ANGLE = 85;

// Pose every leg from two angles: the hip, the upper segment's elevation
// above level as it leaves the body, and the back-pair knee bend (front
// pair half, the middle pairs between). Each leg lies in the vertical
// plane through its root at its plan angle (`azimuths`: one per leg, or
// one per pair, degrees from straight across, + toward the head) and is
// scaled, keeping the brief's upper/lower split, until the foot meets the
// wall: the plan angles are kept, the lengths follow. Returns a new legs
// array, as the level pose.
export function legsFromAngles(p, walls, { hip, backBend, azimuths }) {
  const level = { ...DEFAULTS, ...p, pitch: 0, legs: legsFrom(p) };
  const frame = bodyFrame(level);
  const f = frame.f;
  const legs = level.legs.map(q => ({ ...q }));
  const wallDistance = (footX, side) => {
    const w = walls(footX, side, level.across);
    return (w === null || w === undefined) ? 1.5 - level.headWidth / 2 : Math.abs(w - level.across) - level.headWidth / 2;
  };
  for (let pair = 0; pair < 4; pair++) {
    const bend = backBend * bendFactor(pair);
    const t = hip * DEG, u = (hip - bend) * DEG;
    // Reach per unit of leg length at these angles; the wall sets the length.
    const unit = Math.max(0.05, LOCKED.kneeFraction * Math.cos(t) + (1 - LOCKED.kneeFraction) * Math.cos(u));
    for (const side of [1, -1]) {
      const j = legIndex(pair, side);
      const root = frame.toAlley(rootAlongOffset(level, pair), 0, side * level.headWidth / 2);
      const planDeg = azimuths.length === 8 ? azimuths[j] : azimuths[pair];
      const phi = Math.max(-MAX_PLAN_ANGLE, Math.min(MAX_PLAN_ANGLE, planDeg)) * DEG;
      let h = 1, footX = root[0];
      // The wall distance depends on where the foot lands; a few passes settle it.
      for (let pass = 0; pass < 4; pass++) {
        h = wallDistance(footX, side) / Math.cos(phi);
        footX = root[0] + f * h * Math.sin(phi);
      }
      const total = Math.max(0.2, h / unit);
      const a = total * LOCKED.kneeFraction;
      const b = total - a;
      const rise = a * Math.sin(t) + b * Math.sin(u); // foot height above the root
      const dir = [f * Math.sin(phi), 0, side * Math.cos(phi)]; // level unit vector, root toward the wall
      const knee = [root[0] + a * Math.cos(t) * dir[0], root[1] + a * Math.sin(t), root[2] + a * Math.cos(t) * dir[2]];
      const foot = [root[0] + h * dir[0], root[1] + rise, root[2] + h * dir[2]];
      legs[j] = { ...footParamsAt(level, foot), ...kneeParamsAt(level, side, knee) };
    }
  }
  return legs;
}

// Move each foot along its wall (keeping its height) to where a leg with the
// given upper segment and bend has lower segment `lowerTarget`, then place
// the knee for that bend. targets[i] = { upper, bend } defaults to each
// pair's current values (from its right leg). Each leg is solved on its
// own wall. Returns a new legs array; a foot that cannot reach stays where
// it was.
export function solveFeetForLength(p, walls, lowerTarget, targets = null) {
  p = { ...p, pitch: 0, legs: legsFrom(p) }; // the level pose; the pitch rotates the result
  const model = buildSpider(p, walls);
  const f = model.facing;
  const cx = p.along;
  const legs = p.legs.map(q => ({ ...q }));
  for (let i = 0; i < 4; i++) {
    const right = model.legs.find(l => l.pair === i && l.side === 1);
    const t = targets ? targets[i] : { upper: right.a, bend: right.bend };
    const d = rootToFootDistance(t.upper, lowerTarget, t.bend);
    const forward = i < 2 ? 1 : -1;
    for (const side of [1, -1]) {
      const leg = model.legs.find(l => l.pair === i && l.side === side);
      const j = legIndex(i, side);
      const rootAlong = f * (leg.root[0] - cx);
      const rootY = leg.root[1];
      let footAlong = legs[j].footAlong;
      // The wall distance depends on where the foot lands; two passes settle it.
      for (let pass = 0; pass < 3; pass++) {
        const footX = cx + f * footAlong;
        const w = walls(footX, side, p.across);
        const dz = (w === null || w === undefined) ? 1.5 - p.headWidth / 2 : Math.abs(w - p.across) - p.headWidth / 2;
        const dy = legs[j].footHeight - rootY;
        const dx2 = d * d - dz * dz - dy * dy;
        if (dx2 <= 0) { footAlong = legs[j].footAlong; break; } // cannot reach: leave the foot where it was
        footAlong = rootAlong + forward * Math.sqrt(dx2);
      }
      legs[j].footAlong = round(footAlong);
      legs[j] = kneeFromBend({ ...p, legs }, walls, i, t.upper, t.bend, side);
    }
  }
  return legs;
}

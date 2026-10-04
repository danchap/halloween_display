// Geometry of the alley spider. Pure functions, no rendering.
//
// Frame: the "alley frame". x runs along the alley from the street into the
// dead end, y is up, z runs across the alley. All lengths are meters.
//
// The brief locks the proportions in units of body length L. Here every
// dimension is a free parameter so the design can be explored, and
// briefPreset() produces the parameters that match the brief at a chosen L.
// The leg's last segment (knee to foot) is derived, not chosen: with the root,
// the foot, the upper segment length and the knee bend all given, the last
// segment length is whatever makes the foot land where it was put.

export const LOCKED = Object.freeze({
  legLength: 3.25,      // body to foot, both segments together, in L
  abdomenLength: 0.76,
  abdomenWidth: 0.494,  // the body is a cylinder: height equals width
  headLength: 0.30,
  headWidth: 0.326,     // 0.66 of the abdomen width
  overlap: 0.06,        // 0.30 + 0.76 - 0.06 = 1
  kneeFraction: 0.48,   // knee at 48 % of the leg length (drawing constant)
  frontBendFactor: 0.5, // the front pair bends half as much as the back pair
});

export const BEND_SERIES = [15, 30, 45, 60, 75, 90, 105];

// Where the four leg roots sit along the head (cephalothorax), as fractions
// of head length measured from the back of the head. They start past the
// abdomen overlap so no root is buried inside the abdomen.
export const ROOT_FRACTIONS = [0.95, 0.72, 0.49, 0.26];

const DEG = Math.PI / 180;

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { return Math.sqrt(dot(a, a)); }
function unit(a) { const n = norm(a); return n > 0 ? scale(a, 1 / n) : [0, 0, 0]; }

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
  const head = {
    length: LOCKED.headLength * L,
    width: LOCKED.headWidth * L,
    height: LOCKED.headWidth * L,
  };
  const p = {
    abdomenLength: LOCKED.abdomenLength * L,
    abdomenWidth: LOCKED.abdomenWidth * L,
    abdomenHeight: LOCKED.abdomenWidth * L,
    headLength: head.length,
    headWidth: head.width,
    headHeight: head.height,
    overlap: LOCKED.overlap * L,
    headLift: 0,
    bodyShape: 'cylinder',
    along: o.along,
    bodyHeight: o.bodyHeight,
    across: 0,
    facing: -1,                      // -1: head toward the street, +1: into the alley
    upperDiameter: 0.06 * L,
    lowerDiameter: 0.045 * L,
    pairs: [],
  };
  // Feet: at the brief's bends and lengths, each foot sits at the wanted
  // height and as far along the alley as the leg then reaches.
  for (let i = 0; i < 4; i++) {
    const bend = o.backBend * bendFactor(i);
    const d = rootToFootDistance(a, b, bend);
    const rootY = o.bodyHeight;
    const dy = o.footHeights[i] - rootY;
    const dz = o.wallDistance - head.width / 2;
    const dx2 = d * d - dz * dz - dy * dy;
    const dx = dx2 > 0 ? Math.sqrt(dx2) : 0;
    const forward = i < 2 ? 1 : -1;
    const rootAlong = rootAlongOffset(p, i); // relative to body center, in facing units
    p.pairs.push({
      bend: round(bend),
      upper: round(a),
      footAlong: round(rootAlong + forward * dx),
      footHeight: o.footHeights[i],
    });
  }
  return p;
}

function round(v) { return Math.round(v * 1000) / 1000; }

// Body length as the brief defines it: front of head to back of abdomen.
export function bodyLength(p) {
  return p.abdomenLength + p.headLength - p.overlap;
}

// Along-body offset of a leg root from the body center, positive toward the
// head. Independent of facing.
export function rootAlongOffset(p, pairIndex) {
  const L = bodyLength(p);
  const headBack = L / 2 - p.headLength;
  return headBack + ROOT_FRACTIONS[pairIndex] * p.headLength;
}

export const DEFAULTS = Object.freeze(briefPreset(0.8));

// walls: function (xAlong, side) -> z of the wall on that side (sign included),
// or null when there is none. side is +1 or -1.
export function flatWalls(width) {
  return (x, side) => side * width / 2;
}

// Build the whole spider from a parameter object (see briefPreset/DEFAULTS).
export function buildSpider(params, walls = flatWalls(3.0)) {
  const p = { ...DEFAULTS, ...params, pairs: (params.pairs || DEFAULTS.pairs).map(q => ({ ...q })) };
  const L = bodyLength(p);
  const f = p.facing >= 0 ? 1 : -1;
  const cx = p.along;      // body center along the alley
  const cz = p.across;     // body axis across the alley
  const H = p.bodyHeight;  // abdomen axis height

  // Body segments as axis ranges along x (alley frame).
  const backX = cx - f * L / 2;                        // back of the abdomen
  const frontX = cx + f * L / 2;                        // front of the head
  const abdomen = {
    x0: Math.min(backX, backX + f * p.abdomenLength),
    x1: Math.max(backX, backX + f * p.abdomenLength),
    width: p.abdomenWidth, height: p.abdomenHeight,
    y: H, z: cz,
  };
  const head = {
    x0: Math.min(frontX, frontX - f * p.headLength),
    x1: Math.max(frontX, frontX - f * p.headLength),
    width: p.headWidth, height: p.headHeight,
    y: H + p.headLift, z: cz,
  };

  const legs = [];
  for (let pair = 0; pair < 4; pair++) {
    const q = p.pairs[pair];
    const rootX = cx + f * rootAlongOffset(p, pair);
    const footX = cx + f * q.footAlong;
    for (const side of [1, -1]) {
      const root = [rootX, head.y, cz + side * head.width / 2];
      let wallZ = walls(footX, side, cz);
      let status = 'ok';
      if (wallZ === null || wallZ === undefined || Math.sign(wallZ - cz) !== side) {
        status = 'noWall';
        wallZ = cz + side * 1.5;
      }
      const foot = [footX, q.footHeight, wallZ];
      const rf = sub(foot, root);
      const d = norm(rf);
      const u = unit(rf);
      const a = q.upper;
      let b = lowerSegmentFor(a, d, q.bend);
      let knee;
      if (b === null) {
        // The foot is too close for this upper segment and bend: fold the
        // leg flat on the root-foot line so the problem is visible.
        if (status === 'ok') status = 'folded';
        b = Math.abs(a - d);
        knee = add(root, scale(u, a));
      } else {
        // Knee in the vertical plane through root and foot, lifted upward.
        let n = sub([0, 1, 0], scale(u, u[1]));
        n = norm(n) > 1e-9 ? unit(n) : [f, 0, 0];
        const cosBeta = (a * a + d * d - b * b) / (2 * a * d);
        const beta = Math.acos(Math.max(-1, Math.min(1, cosBeta)));
        knee = add(root, add(scale(u, a * Math.cos(beta)), scale(n, a * Math.sin(beta))));
      }
      legs.push({
        pair, side, root, knee, foot, a, b, d,
        bend: q.bend, interiorAngle: 180 - q.bend,
        wallDistance: Math.abs(wallZ - cz),
        status,
      });
    }
  }

  const stats = computeStats({ p, L, abdomen, head, legs });
  return { params: p, L, facing: f, abdomen, head, legs, stats };
}

function computeStats({ p, L, abdomen, head, legs }) {
  const kneeYs = legs.map(l => l.knee[1]);
  const topY = Math.max(abdomen.y + abdomen.height / 2, head.y + head.height / 2, ...kneeYs, ...legs.map(l => l.foot[1]));
  const bodyBottom = Math.min(abdomen.y - abdomen.height / 2, head.y - head.height / 2);
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
      footAlong: p.pairs[i].footAlong,
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
    overlapInL: p.overlap / L,
    headToAbdomenWidth: p.headWidth / p.abdomenWidth,
    spanAcross: Math.max(...footZs) - Math.min(...footZs),
    lengthAlong: Math.max(...footXs) - Math.min(...footXs),
    topHeight: topY,
    bodyBottom,
    pathClearance: pathLow,
    allOk: legs.every(l => l.status === 'ok'),
    pairs,
  };
}

// Solve the foot positions so that every leg has the brief's lower segment
// length at the current upper segment and bend: moves each foot along the
// wall (keeping its height) to where the leg exactly reaches. Returns a new
// pairs array; a pair whose foot cannot be placed keeps its position.
export function solveFeetForLength(p, walls, lowerTarget) {
  const f = p.facing >= 0 ? 1 : -1;
  const cx = p.along;
  const pairs = p.pairs.map(q => ({ ...q }));
  for (let i = 0; i < 4; i++) {
    const q = pairs[i];
    const rootAlong = rootAlongOffset(p, i);
    const rootY = p.bodyHeight + p.headLift;
    const d = rootToFootDistance(q.upper, lowerTarget, q.bend);
    const forward = i < 2 ? 1 : -1;
    let footAlong = q.footAlong;
    // The wall distance depends on where the foot lands; two passes settle it.
    for (let pass = 0; pass < 3; pass++) {
      const footX = cx + f * footAlong;
      const dzs = [1, -1].map(side => {
        const w = walls(footX, side, p.across);
        return (w === null || w === undefined) ? 1.5 - p.headWidth / 2 : Math.abs(w - p.across) - p.headWidth / 2;
      });
      const dz = Math.max(...dzs); // the longer side decides, so both reach
      const dy = q.footHeight - rootY;
      const dx2 = d * d - dz * dz - dy * dy;
      if (dx2 <= 0) { footAlong = q.footAlong; break; } // cannot reach: leave the foot where it was
      footAlong = rootAlong + forward * Math.sqrt(dx2);
    }
    q.footAlong = round(footAlong);
  }
  return pairs;
}

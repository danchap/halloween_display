// The real parts of the spider: pipes, fittings, posts and skis. Pure
// functions, no rendering, in the style of spider.js.
//
// The build: each foot stands on a vertical post down to the ground; the
// four posts of one side are joined by a horizontal beam along the base of
// that wall (a "ski"), so nothing stands in the alley itself. The legs are
// tubes with a fitting at the hip, the knee and the foot; a spine inside
// the body carries the eight hips. buildParts turns a spider model
// (buildSpider output, alley frame, metres) into the members and fittings
// of one part system, the cut list, the angles to set at each fitting, the
// bill of materials and the warnings.
//
// SYSTEMS is a table: a new part system is a new entry, nothing else.
// Lengths are metres, weights kg, prices euros, angles degrees.

import { bodyFrame, bodyLength, rootAlongOffset } from './spider.js';

export const SYSTEMS = [
  {
    id: 'pvc40',
    name: 'PVC Ø 40 mm, adjustable elbows, black foam cover',
    member: { shape: 'round', od: 0.040, kgPerM: 0.50, color: '#e4e2dc', finish: 'matte', stock: [2.0, 1.0] },
    cover: { od: 0.066, kgPerM: 0.15, color: '#1b1b1d', finish: 'sheen' }, // slit foam pipe insulation over the leg tubes only
    post: { od: 0.040, color: '#f1f0ea', finish: 'matte' },
    ski: { od: 0.040, color: '#f1f0ea', finish: 'matte', caps: true },
    fitting: { kind: 'elbow', od: 0.048, centreToEnd: 0.045, socket: 0.035, kg: 0.08, maxBend: 90, color: '#b8b7b1', finish: 'matte' }, // maxBend: the elbows adjust from straight to this many degrees
    hub: { kind: 'crosses', spacing: 0.10, stubToRoot: true },
    body: { kind: 'fabricOverHoops', hoopOd: 0.065, color: '#141416', finish: 'sheen', hoopKg: 0.25, fabricKg: 1.2 },
    names: { elbow: 'adjustable elbow', tee: 'tee', cross: 'cross', coupler: 'coupler', cap: 'end cap' },
    prices: { memberPerM: 6, elbow: 6, tee: 3, cross: 6, coupler: 2, cap: 1.5, coverPerM: 4, hoop: 8, fabric: 20 },
  },
  {
    id: 'alu25',
    name: 'Aluminium Ø 25 mm tube, plastic connectors, pool noodles',
    member: { shape: 'round', od: 0.025, kgPerM: 0.30, color: '#c9ccd1', finish: 'metal', stock: [2.0, 1.0] },
    cover: { od: 0.065, kgPerM: 0.10, color: '#1b1b1d', finish: 'sheen' }, // a pool noodle threaded over the tube
    post: { od: 0.025, color: '#f1f0ea', finish: 'matte' }, // painted white
    ski: { od: 0.025, color: '#f1f0ea', finish: 'matte', caps: true },
    fitting: { kind: 'connector', od: 0.034, centreToEnd: 0.040, socket: 0.030, kg: 0.05, maxBend: 90, color: '#2b2b2e', finish: 'matte' },
    hub: { kind: 'crosses', spacing: 0.08, stubToRoot: true },
    body: { kind: 'fabricOverHoops', hoopOd: 0.065, color: '#141416', finish: 'sheen', hoopKg: 0.25, fabricKg: 1.2 },
    names: { elbow: 'angle connector', tee: 'tee connector', cross: 'cross connector', coupler: 'straight connector', cap: 'end cap' },
    prices: { memberPerM: 9, elbow: 5, tee: 4, cross: 6, coupler: 3, cap: 1, coverPerM: 5, hoop: 8, fabric: 20 },
  },
  {
    id: 'wood34',
    name: 'Pine 34 × 34 mm battens, hinges and brackets',
    member: { shape: 'square', size: 0.034, kgPerM: 0.60, color: '#101012', finish: 'paint', stock: [2.4] }, // painted black
    cover: null, // the legs are the painted battens
    post: { size: 0.034, color: '#f1f0ea', finish: 'paint' },
    ski: { size: 0.034, color: '#f1f0ea', finish: 'paint', caps: false },
    fitting: { kind: 'hinge', od: 0.050, centreToEnd: 0.040, socket: 0, kg: 0.10, maxBend: 180, color: '#8a8a8a', finish: 'metal' }, // members butt at the joint; nothing is lost in a socket; a hinge opens to 180
    hub: { kind: 'plank', length: 0.60, width: 0.10, thickness: 0.027, spacing: 0.05, kg: 1.0, price: 6, color: '#101012', finish: 'paint' }, // spacing: the hip brackets are 0.05 m wide, so the pairs sit at least that far apart along the plank
    body: { kind: 'fabricOverHoops', hoopOd: 0.065, color: '#141416', finish: 'sheen', hoopKg: 0.25, fabricKg: 1.2 },
    names: { elbow: 'hinge', tee: 'angle bracket', cross: 'hip bracket', coupler: 'joining plate', cap: 'end cap' },
    prices: { memberPerM: 2.5, elbow: 3, tee: 2, cross: 4, coupler: 2, cap: 0, coverPerM: 0, hoop: 8, fabric: 20 },
  },
];

export const MAX_PIECES = [1.0, 1.2, 1.5, 2.0, 2.7];

export function systemById(id) { return SYSTEMS.find(s => s.id === id) || null; }

const DEG = Math.PI / 180;
const SKI_OVERHANG = 0.15; // the ski runs this far past the first and last post
const SPINE_OVERHANG = 0.05; // the spine runs this far past the first and last cross
const HUB_INSET = 0.03; // the hub's ends stay this far inside the body's ends
const WALL_CLEARANCE = 0.005; // between the fittings at the wall and the wall

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { return Math.sqrt(dot(a, a)); }
function unit(a) { const n = norm(a); return n > 0 ? scale(a, 1 / n) : [0, 0, 0]; }
function mm(v) { return Math.round(v * 1000) / 1000; }
function deg1(v) { return Math.round(v * 10) / 10; }
function angleBetween(a, b) { return Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) / DEG; }

// Thickness of a member (round: od; square: size) and the ski's top.
function thickness(part) { return part.od !== undefined ? part.od : part.size; }

// A fitting of one role: the system's default fitting with any override
// from system.fittings[role] (dimensions, weight, colour).
function fittingSpec(system, role) {
  const base = system.fitting;
  const over = (system.fittings && system.fittings[role]) || {};
  return { ...base, ...over, role };
}
// Pipe lost at one end into a fitting: the fitting reaches centreToEnd from
// the joint centre and the pipe enters it by socket.
function allowance(spec) { return Math.max(0, spec.centreToEnd - spec.socket); }

// Split a pipe of `length` between two fitting centres into pieces no
// longer than `maxLen`. A coupler joins each pair of pieces and costs its
// own allowances. Returns { pieces, couplers }, pieces equal and rounded
// down to the millimetre, so the pieces and the couplers never add up to
// more than the cut.
function splitPiece(length, maxLen, couplerSpec) {
  if (length <= 0) return { pieces: [0], couplers: 0 };
  if (length <= maxLen + 1e-9) return { pieces: [mm(length)], couplers: 0 };
  const n = Math.ceil(length / maxLen - 1e-9);
  const pipe = length - (n - 1) * 2 * allowance(couplerSpec);
  const each = Math.max(0, pipe / n);
  const down = Math.floor(each * 1000 + 1e-6) / 1000;
  return { pieces: Array.from({ length: n }, () => down), couplers: n - 1 };
}

// First-fit decreasing of the pieces into the stock lengths (preferred
// first). A bin is opened at the preferred length, or at the shortest
// stock length that holds the piece when the preferred one does not;
// afterwards each bin is charged at the shortest stock length that holds
// what is in it.
export function stockPlan(pieces, stock) {
  const sorted = [...pieces].filter(p => p > 0).sort((a, b) => b - a);
  const longest = Math.max(...stock);
  const bins = [];
  const unplaced = [];
  for (const p of sorted) {
    if (p > longest + 1e-9) { unplaced.push(p); continue; }
    let bin = bins.find(b => b.free >= p - 1e-9);
    if (!bin) {
      const open = stock[0] >= p - 1e-9 ? stock[0] : [...stock].sort((a, c) => a - c).find(l => l >= p - 1e-9);
      bin = { free: open, pieces: [] }; bins.push(bin);
    }
    bin.free -= p; bin.pieces.push(p);
  }
  const byLength = stock.map(length => ({ length, count: 0, used: 0 }));
  for (const b of bins) {
    const used = b.pieces.reduce((s, p) => s + p, 0);
    const fit = [...stock].sort((a, c) => a - c).find(l => l >= used - 1e-9) ?? stock[0];
    const row = byLength.find(r => r.length === fit);
    row.count++; row.used += used;
  }
  const metres = byLength.reduce((s, r) => s + r.length * r.count, 0);
  const used = byLength.reduce((s, r) => s + r.used, 0);
  return { lengths: byLength.map(r => ({ length: r.length, count: r.count, waste: mm(r.length * r.count - r.used) })), count: bins.length, metres: mm(metres), waste: mm(metres - used), unplaced };
}

// The hub: where the hips sit on the spine. For 'crosses' the four pair
// positions along the body axis are pushed apart to at least hub.spacing,
// centred on their mean, and the roots move with them (the knees and feet
// stay); for 'plank' the roots move in to the plank's sides and apart to
// hub.spacing (the brackets' width) along it. The hub must stay inside the
// body: when the spacing would push the spine's front cap past the head
// tip less HUB_INSET, the group slides backward; the plank runs backward
// from just in front of the front pair.
// Returns the along position per pair, the moved root per leg (indexed
// like model.legs), the shift of each, and the hub's front and back along
// the axis.
function placeHub(model, system) {
  const p = model.params;
  const hub = system.hub;
  const frame = bodyFrame(p);
  const L = bodyLength(p);
  const alongs = [0, 1, 2, 3].map(i => rootAlongOffset(p, i));
  const spacing = hub.spacing || 0;
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  // Front pair first, so the alongs run down; keep every gap at least the spacing.
  const spaced = [alongs[0]];
  for (let i = 1; i < 4; i++) spaced.push(spaced[i - 1] - Math.max(alongs[i - 1] - alongs[i], spacing));
  let pairAlong = spaced.map(v => v + avg(alongs) - avg(spaced));
  const tip = L / 2 - HUB_INSET, tail = -L / 2 + HUB_INSET;
  let front, back;
  if (hub.kind === 'crosses') {
    const slide = Math.max(0, pairAlong[0] + SPINE_OVERHANG - tip);
    pairAlong = pairAlong.map(v => v - slide);
    front = pairAlong[0] + SPINE_OVERHANG;
    back = pairAlong[3] - SPINE_OVERHANG;
  } else {
    // The plank runs backward from one bracket width in front of the
    // front pair, so it never passes the head tip and the pairs stay put.
    const length = Math.max(hub.length, pairAlong[0] - pairAlong[3] + 2 * system.fitting.od);
    front = Math.min(pairAlong[0] + system.fitting.od, tip);
    back = front - length;
  }
  const acrossOf = side => side * (hub.kind === 'plank' ? hub.width / 2 : p.headWidth / 2);
  const roots = model.legs.map(l => frame.toAlley(pairAlong[l.pair], p.headLift || 0, acrossOf(l.side)));
  const shifts = model.legs.map((l, j) => norm(sub(roots[j], l.root)));
  const alongShift = Math.max(...pairAlong.map((v, i) => Math.abs(v - alongs[i])));
  return { frame, pairAlong, roots, shifts, maxShift: Math.max(...shifts), alongShift, spacing, front, back, overflow: Math.max(0, tail - back), bodyLength: L };
}

// Build the parts of one system for a spider model. `walls` is the wall
// function the model was built with (used to check the skis against the
// walls); maxPiece the longest piece that can be shipped, metres.
export function buildParts(model, params, walls, { system, maxPiece, ground = 0 } = {}) {
  if (!system) throw new Error('buildParts needs a system');
  const p = model.params;
  const warnings = [];
  const members = [];   // { role, a, b, shape, od|size, color, finish, leg?, side?, pieces? }
  const fittings = [];  // { role, kind, name, at, dirs, od, centreToEnd, color, finish, leg?, side? }
  const cuts = [];      // { role, leg?|side?, length, pieces }
  const spec = role => fittingSpec(system, role);
  const stockMax = Math.max(...system.member.stock);
  const maxLen = Math.min(maxPiece || Infinity, stockMax);
  let splitCount = 0;
  const shape = system.member.shape;
  const memberDims = part => shape === 'square' ? { shape, size: thickness(part) } : { shape, od: thickness(part) };

  // A pipe between two fitting centres: the member for drawing, its cut
  // (less the allowance at each end) and the couplers where it is split.
  const pipe = (role, a, b, part, endSpecs, extra = {}) => {
    const span = norm(sub(b, a));
    const length = Math.max(0, span - allowance(endSpecs[0]) - allowance(endSpecs[1]));
    const { pieces, couplers } = splitPiece(length, maxLen, spec('coupler'));
    if (couplers) {
      splitCount++;
      const dir = unit(sub(b, a));
      // Couplers sit at the piece boundaries along the pipe.
      let at = allowance(endSpecs[0]);
      for (let i = 0; i < couplers; i++) {
        at += pieces[i] + allowance(spec('coupler'));
        fittings.push(fitting('coupler', add(a, scale(dir, at)), [dir], extra));
        at += allowance(spec('coupler'));
      }
    }
    members.push({ role, a, b, ...memberDims(part), color: part.color, finish: part.finish || system.member.finish, pieces, ...extra });
    cuts.push({ role, ...extra, length: mm(length), pieces });
    return length;
  };
  const fitting = (role, at, dirs, extra = {}) => {
    const s = spec(role);
    return { role, kind: s.kind, name: system.names[role] || role, at, dirs, od: s.od, centreToEnd: s.centreToEnd, color: s.color, finish: s.finish || 'matte', ...extra };
  };
  const legName = l => `${l.pair + 1}${l.side > 0 ? 'R' : 'L'}`;

  // ---- hub
  const hubPlace = placeHub(model, system);
  const { frame, pairAlong, roots } = hubPlace;
  const axisPoint = along => frame.toAlley(along, p.headLift || 0, 0);
  const axisDir = unit(sub(axisPoint(1), axisPoint(0)));
  const hub = { kind: system.hub.kind, pairAlong, roots, shifts: hubPlace.shifts.map(mm), maxShift: mm(hubPlace.maxShift), alongShift: mm(hubPlace.alongShift), spacing: hubPlace.spacing };
  hub.axis = { a: axisPoint(hubPlace.back), b: axisPoint(hubPlace.front) };
  hub.length = mm(hubPlace.front - hubPlace.back);
  if (system.hub.kind === 'crosses') {
    const first = hubPlace.front, last = hubPlace.back;
    // The spine: cap, cross, cross, cross, cross, cap; a piece between each pair.
    const stations = [{ role: 'cap', along: last }, ...[3, 2, 1, 0].map(i => ({ role: 'cross', along: pairAlong[i], pair: i })), { role: 'cap', along: first }];
    for (let i = 0; i + 1 < stations.length; i++) {
      pipe('spine', axisPoint(stations[i].along), axisPoint(stations[i + 1].along), system.member, [spec(stations[i].role), spec(stations[i + 1].role)]);
    }
    fittings.push(fitting('cap', axisPoint(last), [axisDir]), fitting('cap', axisPoint(first), [scale(axisDir, -1)]));
    for (const st of stations.filter(s => s.role === 'cross')) {
      const at = axisPoint(st.along);
      fittings.push(fitting('cross', at, [axisDir, scale(axisDir, -1), [0, 0, 1], [0, 0, -1]], { pair: st.pair }));
    }
    // A stub from each branch to the hip elbow at the moved root.
    for (const l of model.legs) {
      const j = legIdx(l);
      pipe('stub', axisPoint(pairAlong[l.pair]), roots[j], system.member, [spec('cross'), spec('elbow')], { leg: j });
    }
    if (hubPlace.maxShift > 0.0005) {
      warnings.push(`the hub crosses need ${hub.length.toFixed(2)} m; the head is ${p.headLength.toFixed(2)} m, the roots were moved up to ${hubPlace.maxShift.toFixed(2)} m`);
    }
    if (hubPlace.overflow > 0.0005) warnings.push(`the spine (${hub.length.toFixed(2)} m) runs ${hubPlace.overflow.toFixed(2)} m out of the back of the body (${hubPlace.bodyLength.toFixed(2)} m)`);
  } else {
    const h = system.hub;
    const length = hubPlace.front - hubPlace.back;
    hub.plank = { centre: axisPoint((hubPlace.front + hubPlace.back) / 2), length: mm(length), width: h.width, thickness: h.thickness, axis: axisDir, color: h.color, finish: h.finish || 'paint' };
    if (length > h.length + 1e-6) warnings.push(`the hip brackets need a ${length.toFixed(2)} m plank, longer than the ${h.length.toFixed(2)} m one`);
    if (hubPlace.alongShift > 0.0005) warnings.push(`the hip brackets need ${hubPlace.spacing.toFixed(2)} m between pairs; the roots were moved along the plank by up to ${hubPlace.alongShift.toFixed(2)} m`);
    if (hubPlace.maxShift > 0.0005) warnings.push(`the roots were moved in to the plank's sides, up to ${hubPlace.maxShift.toFixed(2)} m`);
    if (hubPlace.overflow > 0.0005) warnings.push(`the plank (${length.toFixed(2)} m) runs ${hubPlace.overflow.toFixed(2)} m out of the back of the body (${hubPlace.bodyLength.toFixed(2)} m)`);
  }

  // ---- legs, posts
  // The design puts each foot on the wall plane. In the build the foot
  // elbow, the post and the ski sit one fitting radius plus a clearance
  // inside that plane, so the fittings touch the wall and nothing is in
  // it. The ski of each side runs straight at the innermost foot of that
  // side (the one nearest the alley centre), so it lies against a wall
  // that steps along the alley; a post whose foot is further out leans
  // across to meet it.
  const skiTop = thickness(system.ski);
  const inset = spec('elbow').od / 2 + WALL_CLEARANCE;
  const feet = model.legs.map(l => [l.foot[0], l.foot[1], l.foot[2] - l.side * inset]);
  const skiZ = {};
  for (const side of [1, -1]) {
    const zs = model.legs.filter(l => l.side === side).map(l => feet[legIdx(l)][2]);
    skiZ[side] = side > 0 ? Math.min(...zs) : Math.max(...zs);
  }
  const legsAssembly = [];
  const legPosts = [];
  for (const l of model.legs) {
    const j = legIdx(l);
    const root = roots[j];
    const foot = feet[j];
    const upperSpan = norm(sub(l.knee, root));
    const lowerSpan = norm(sub(foot, l.knee));
    const hipRole = system.hub.kind === 'plank' ? 'cross' : 'elbow'; // on the plank the hip is a bracket, priced as the cross line
    const upper = pipe('upper', root, l.knee, system.member, [spec(hipRole), spec('elbow')], { leg: j });
    const lower = pipe('lower', l.knee, foot, system.member, [spec('elbow'), spec('elbow')], { leg: j });
    if (system.cover) {
      for (const [a, b] of [[root, l.knee], [l.knee, foot]]) {
        members.push({ role: 'cover', a, b, shape: 'round', od: system.cover.od, color: system.cover.color, finish: system.cover.finish || 'sheen', leg: j });
      }
    }
    // The post: from the foot elbow down to the tee at the ski's centre.
    const bottom = [foot[0], ground + skiTop / 2, skiZ[l.side]];
    const postHeight = foot[1] - (ground + skiTop); // the post seen above the ski
    if (postHeight < 0) warnings.push('a post is shorter than the ski');
    const standing = foot[1] - bottom[1] > 0.001;
    const postDir = standing ? unit(sub(bottom, foot)) : [0, -1, 0];
    const post = pipe('post', foot, standing ? bottom : foot, system.post, [spec('elbow'), spec('tee')], { leg: j });
    const lean = Math.abs(foot[2] - bottom[2]);
    legPosts.push({ leg: j, side: l.side, x: foot[0], z: bottom[2], lean });
    const toAxis = unit(sub(axisPoint(pairAlong[l.pair]), root));
    fittings.push(fitting(hipRole, root, [toAxis, unit(sub(l.knee, root))], { leg: j, joint: 'hip' }));
    fittings.push(fitting('elbow', l.knee, [unit(sub(root, l.knee)), unit(sub(foot, l.knee))], { leg: j, joint: 'knee' }));
    fittings.push(fitting('elbow', foot, [unit(sub(l.knee, foot)), postDir], { leg: j, joint: 'foot' }));
    // The angles to set at the three fittings.
    const u = unit(sub(l.knee, root));
    const v = unit(sub(foot, l.knee));
    const toKnee = unit(sub(l.knee, foot));
    const f = frame.f;
    const hip = { angle: deg1(angleBetween(u, [0, 0, l.side])), roll: deg1(Math.atan2(u[1], f * u[0]) / DEG) };
    const knee = { bend: deg1(180 - angleBetween(scale(u, -1), v)) };
    // The post is turned to the lower segment's plan angle (the leg's, under the brief's-leg rule), as legAngles measures it.
    const footFit = { angle: deg1(angleBetween(toKnee, postDir)), bend: deg1(180 - angleBetween(toKnee, postDir)), plan: deg1(Math.atan2(f * v[0], l.side * v[2]) / DEG) };
    legsAssembly.push({
      leg: j, pair: l.pair, side: l.side > 0 ? 'R' : 'L',
      hip, knee, foot: footFit,
      upper: mm(upper), lower: mm(lower), post: mm(post), postHeight: mm(Math.max(0, postHeight)),
      postLean: { across: mm(lean), deg: deg1(Math.atan2(lean, Math.max(0.001, foot[1] - bottom[1])) / DEG) },
      upperSpan: mm(upperSpan), lowerSpan: mm(lowerSpan),
      kneeAboveHub: l.knee[1] > root[1],
      rootShift: mm(hubPlace.shifts[j]),
    });
    // A fitting set past what it can bend.
    for (const [joint, role, bend] of [['hip', hipRole, hip.angle], ['knee', 'elbow', knee.bend], ['foot', 'elbow', footFit.bend]]) {
      const s = spec(role);
      if (s.maxBend !== undefined && bend > s.maxBend + 0.05) warnings.push(`the ${legName(l)} ${joint} ${s.role === 'cross' ? system.names.cross : system.names.elbow} needs ${Math.round(bend)} degrees; it bends to ${s.maxBend}`);
    }
  }

  // ---- skis
  const skis = [];
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'R' : 'L';
    const sideName = side > 0 ? 'right' : 'left';
    const posts = legPosts.filter(q => q.side === side).sort((a, b) => a.x - b.x);
    const z = skiZ[side];
    const y = ground + skiTop / 2;
    const x0 = posts[0].x - SKI_OVERHANG, x1 = posts[posts.length - 1].x + SKI_OVERHANG;
    const at = x => [x, y, z];
    const caps = system.ski.caps !== false;
    const stations = [{ role: 'cap', x: x0 }, ...posts.map(q => ({ role: 'tee', x: q.x, leg: q.leg })), { role: 'cap', x: x1 }];
    for (let i = 0; i + 1 < stations.length; i++) {
      const s0 = stations[i], s1 = stations[i + 1];
      const len = pipe('ski', at(s0.x), at(s1.x), system.ski, [caps || s0.role !== 'cap' ? spec(s0.role) : { centreToEnd: 0, socket: 0 }, caps || s1.role !== 'cap' ? spec(s1.role) : { centreToEnd: 0, socket: 0 }], { side: tag });
      if (s0.role === 'tee' && s1.role === 'tee' && len < 0.01) warnings.push(`two posts on the ${sideName} ski are closer than their tees`);
    }
    for (const q of posts) fittings.push(fitting('tee', at(q.x), [[1, 0, 0], [-1, 0, 0], [0, 1, 0]], { side: tag, leg: q.leg }));
    if (caps) fittings.push(fitting('cap', at(x0), [[1, 0, 0]], { side: tag }), fitting('cap', at(x1), [[-1, 0, 0]], { side: tag }));
    const lean = Math.max(...posts.map(q => q.lean));
    skis.push({ side: tag, z: mm(z), y: mm(y), from: mm(x0), to: mm(x1), length: mm(x1 - x0), posts: posts.map(q => mm(q.x)), lean: mm(lean) });
    if (lean > 0.01) warnings.push(`the ${sideName} posts lean up to ${lean.toFixed(2)} m across to meet the ski (the wall steps along the alley)`);
    // The ski must lie against its wall, not inside it, along its whole
    // run: a wall that steps in along the alley can put the straight ski
    // partly inside it. The ski's outer surface is checked, so a flat
    // wall gives nothing.
    if (walls) {
      let deepest = 0;
      for (let i = 0; i <= 10; i++) {
        const x = x0 + (x1 - x0) * i / 10;
        const w = walls(x, side, p.across);
        if (w === null || w === undefined) continue;
        deepest = Math.max(deepest, Math.abs(z - p.across) + skiTop / 2 - Math.abs(w - p.across));
      }
      if (deepest > 0.001) warnings.push(`the ${sideName} ski runs ${deepest.toFixed(2)} m into the wall`);
    }
  }

  // ---- body
  const body = { kind: system.body.kind, color: system.body.color, finish: system.body.finish || 'sheen', hoopOd: system.body.hoopOd, shell: [model.abdomen, model.head], hoops: [] };
  if (system.body.kind === 'fabricOverHoops') {
    // Three hoops in the abdomen, two in the head, each as wide as the
    // capsule is there.
    const hoopsOf = (seg, fractions) => fractions.map(t => {
      const R = Math.max(seg.width, seg.height) / 2;
      const straight = Math.max(0.01, seg.length - 2 * R);
      const d = (t - 0.5) * seg.length;
      const over = Math.max(0, Math.abs(d) - straight / 2);
      const profile = Math.sqrt(Math.max(0, 1 - (over / R) ** 2));
      const centre = add(seg.center, scale(axisDir, d));
      return { centre, axis: axisDir, width: mm(seg.width * profile), height: mm(seg.height * profile) };
    });
    body.hoops = [...hoopsOf(model.abdomen, [0.22, 0.5, 0.78]), ...hoopsOf(model.head, [0.3, 0.7])];
  }

  // ---- bom
  const countBy = (list, key) => list.reduce((m, x) => { m[x[key]] = (m[x[key]] || 0) + 1; return m; }, {});
  const fittingCounts = countBy(fittings, 'role');
  const ends = { elbow: 2, tee: 3, cross: 4, coupler: 2, cap: 1 };
  const fittingLines = ['elbow', 'tee', 'cross', 'coupler', 'cap'].filter(r => fittingCounts[r]).map(role => {
    const s = spec(role), count = fittingCounts[role];
    return { role, name: system.names[role] || role, count, kg: mm(count * s.kg), cost: mm(count * (system.prices[role] || 0)), screws: count * 2 * ends[role] };
  });
  const roles = ['upper', 'lower', 'post', 'ski', 'spine', 'stub'];
  // Member metres are the pieces as cut (a split member is shorter than
  // its cut by the couplers' allowances); the stock plan buys them, and
  // what is left over is the offcuts.
  const memberLines = roles.map(role => {
    const rows = cuts.filter(c => c.role === role);
    return { role, metres: mm(rows.reduce((s, c) => s + c.pieces.reduce((t, x) => t + x, 0), 0)), pieces: rows.reduce((s, c) => s + c.pieces.length, 0) };
  }).filter(r => r.pieces);
  const allPieces = cuts.flatMap(c => c.pieces);
  const stock = stockPlan(allPieces, system.member.stock);
  const memberMetres = mm(allPieces.reduce((s, x) => s + x, 0));
  const coverMetres = system.cover ? mm(members.filter(m => m.role === 'cover').reduce((s, m) => s + norm(sub(m.b, m.a)), 0)) : 0;
  const hoopCount = body.hoops.length;
  const longestPiece = allPieces.length ? Math.max(...allPieces) : 0;
  const piecesOver = allPieces.filter(x => x > maxPiece + 1e-9);
  const unsplitOver = cuts.filter(c => c.length > maxLen + 1e-9).map(c => ({ role: c.role, leg: c.leg, side: c.side, length: c.length, pieces: c.pieces }));
  // The weight is the spider's: the pieces, not the stock bought; the
  // offcuts are given on their own.
  const weight = {
    members: mm(memberMetres * system.member.kgPerM),
    offcuts: mm(stock.waste * system.member.kgPerM),
    fittings: mm(fittingLines.reduce((s, r) => s + r.kg, 0)),
    covers: mm(coverMetres * (system.cover ? system.cover.kgPerM : 0)),
    body: mm(hoopCount * (system.body.hoopKg || 0) + (system.body.fabricKg || 0) + (hub.plank ? system.hub.kg || 0 : 0)),
  };
  weight.total = mm(weight.members + weight.fittings + weight.covers + weight.body);
  const costLines = [];
  for (const r of stock.lengths) if (r.count) costLines.push({ item: `${system.member.shape === 'square' ? 'batten' : 'tube'} ${r.length.toFixed(1)} m`, qty: r.count, unit: mm(r.length * system.prices.memberPerM), cost: mm(r.count * r.length * system.prices.memberPerM) });
  for (const r of fittingLines) costLines.push({ item: r.name, qty: r.count, unit: system.prices[r.role] || 0, cost: r.cost });
  if (system.cover) costLines.push({ item: 'cover, metres', qty: coverMetres, unit: system.prices.coverPerM, cost: mm(coverMetres * system.prices.coverPerM) });
  if (hoopCount) costLines.push({ item: 'hoop', qty: hoopCount, unit: system.prices.hoop, cost: mm(hoopCount * system.prices.hoop) });
  costLines.push({ item: 'fabric', qty: 1, unit: system.prices.fabric, cost: system.prices.fabric });
  if (hub.plank) costLines.push({ item: 'plank', qty: 1, unit: system.hub.price || 0, cost: system.hub.price || 0 });
  const cost = { lines: costLines, total: mm(costLines.reduce((s, r) => s + r.cost, 0)) };
  const bom = {
    fittings: fittingLines,
    fittingCounts,
    members: memberLines,
    memberMetres,
    stock,
    cover: system.cover ? { metres: coverMetres, kg: weight.covers, cost: mm(coverMetres * system.prices.coverPerM) } : null,
    hoops: hoopCount,
    screws: fittingLines.reduce((s, r) => s + r.screws, 0),
    sandbags: 4, // two per ski
    weight,
    cost,
    longestPiece: mm(longestPiece),
    piecesOver,
    unsplitOver,
    splits: splitCount,
    splitAt: mm(maxLen),
    splitByStock: stockMax < maxPiece - 1e-9, // the stock length, not the shipping length, set the splits
  };
  if (splitCount) {
    const n = `${splitCount} piece${splitCount > 1 ? 's were' : ' was'} split`;
    warnings.push(bom.splitByStock ? `${n} at ${maxLen.toFixed(2)} m, the longest stock length` : `${n} to ship at ${maxPiece.toFixed(2)} m`);
  }
  if (stock.unplaced.length) warnings.push(`${stock.unplaced.length} piece${stock.unplaced.length > 1 ? 's are' : ' is'} longer than the stock`);
  if (piecesOver.length) warnings.push(`${piecesOver.length} piece${piecesOver.length > 1 ? 's are' : ' is'} longer than ${maxPiece.toFixed(2)} m`);

  return { system: system.id, maxPiece, ground, members, fittings, hub, skis, body, cuts, legsAssembly, bom, warnings };
}

function legIdx(l) { return 2 * l.pair + (l.side > 0 ? 0 : 1); }

// Dimensions for a note: the longest and total pipe in words.
export function describeParts(parts) {
  const b = parts.bom;
  return `${b.memberMetres.toFixed(1)} m of pipe in ${b.stock.count} lengths, ${b.weight.total.toFixed(1)} kg, about ${b.cost.total.toFixed(0)} €, longest piece ${b.longestPiece.toFixed(2)} m`;
}

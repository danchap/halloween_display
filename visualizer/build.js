// The real parts of the spider: pipes, fittings, posts, skis, stays and
// ballast. Pure functions, no rendering, in the style of spider.js.
//
// The build: each foot stands on a vertical post down to the ground; the
// four posts of one side are joined by a horizontal beam along the base of
// that wall (a "ski"), so nothing stands in the alley itself. The legs are
// tubes with a fitting at the hip, the knee and the foot; a spine inside
// the body carries the eight hips. Every post is stayed by two cords in
// the plane of its wall, one outward to a sandbag on the ground past the
// ski's end and one inward to the ski under the post farthest from it, and
// two sandbags lie over each ski so it cannot roll. buildParts turns a
// spider model (buildSpider output, alley frame, metres) into the members
// and fittings of one part system, the cut list, the fitting recipes, the
// bill of materials and the warnings.
//
// SYSTEMS is a table: a new part system is a new entry, nothing else. A
// system names its pipe sizes, which size each member role uses, and a
// fitting for each joint role. Lengths are metres, weights kg, prices
// euros (seen on 2026-10-13 on Amazon.fr and in stores; a few are
// estimates and say so), angles degrees.
//
// Elbows: no swivelling elbow exists in Ø 40 or Ø 50 PVC. A joint's angle
// is made from the fixed evacuation elbows (20, 30, 45, 67.5 and 87.5
// degrees) used singly or as a pair in series: elbows a and b joined
// spigot into socket give any angle between |a - b| and a + b when the
// second is twisted about the first's outgoing axis by psi, with
// cos(theta) = cos(a) cos(b) - sin(a) sin(b) cos(psi). The pair is then
// turned in its socket to set the joint's plane and locked with two
// self-drilling screws per socket. Fitting dimensions follow Nicoll's
// Ø 40 catalogue: every socket is 27 mm deep and Z is the distance from
// the axis intersection to the socket bottom, so the pipe between two
// fittings is their centre distance less Z at each end (full insertion).
// An MF elbow plugged into the next puts the two centres Z_a + Z_b apart.
// The Ø 50 Z values are the Ø 40 ones plus 25 %: not published, estimated.
//
// Elbow ends (docs/construction.md, 2026-10-13): the 20, 30 and 45 degree
// elbows are male-female (a socket on one side, a spigot on the other),
// the 67.5 and 87.5 ones female-female. A set of elbows always takes the
// pipe before it in a socket; what it ends in depends on its last elbow.
// A set ending in a spigot plugs straight into the next fitting's socket
// (the reducer at the foot) but needs a coupler where a pipe follows (the
// upper leg after the hip, the lower leg after the knee). A set ending in
// a socket takes a pipe directly but needs a short link of pipe into a
// fitting's socket, and two female-female elbows need one between them.
// The reducer 50/40 is female Ø 40 toward the foot elbows and male Ø 50
// below, so a Ø 50 coupler sits between it and the post pipe.

import { bodyFrame, bodyLength, rootAlongOffset } from './spider.js';

const SOCKET = 0.027;
export const ELBOW_ANGLES = [20, 30, 45, 67.5, 87.5];
const Z40 = { 20: 0.0065, 30: 0.011, 45: 0.013, 67.5: 0.021, 87.5: 0.031 }; // Nicoll Ø 40
const Z50 = Object.fromEntries(Object.entries(Z40).map(([a, z]) => [a, mm4(z * 1.25)])); // estimated
const ENDS_40 = { 20: 'M/F', 30: 'M/F', 45: 'M/F', 67.5: 'F/F', 87.5: 'F/F' }; // what the listings sell (DOJA, Fitt, Nicoll)
const ENDS_50 = ENDS_40; // assumed the same as Ø 40: not checked
const ELBOW_PRICE_40 = { 20: 4.90, 30: 9.32, 45: 2.00, 67.5: 2.00, 87.5: 1.90 }; // 20 and 30: Nicoll; the rest DOJA packs of 5
const ELBOW_PRICE_50 = { 20: 3.00, 30: 3.00, 45: 3.00, 67.5: 3.00, 87.5: 3.00 }; // estimated
const PVC_GREY = { color: '#b8b7b1', finish: 'matte' };
const PVC_WHITE = { color: '#f1f0ea', finish: 'matte' };

// Fitting specs. kind says what it is and how it is drawn; z is the pipe
// lost at each pipe end (Z above; a hinge or lap joint loses its whole
// reach since the members butt at it), zBranch the same for a tee's or a
// cross's branch; socket the insertion depth; od the fitting's outer
// diameter for drawing; kg and price per fitting. An elbow set carries
// its angles with z, price and ends (M/F or F/F) per angle.
const ELBOWS_40 = { kind: 'elbow', name: 'elbow', size: 'd40', angles: ELBOW_ANGLES, zByAngle: Z40, priceByAngle: ELBOW_PRICE_40, endsByAngle: ENDS_40, socket: SOCKET, od: 0.046, kg: 0.06, ...PVC_GREY };
const ELBOWS_50 = { kind: 'elbow', name: 'elbow', size: 'd50', angles: ELBOW_ANGLES, zByAngle: Z50, priceByAngle: ELBOW_PRICE_50, endsByAngle: ENDS_50, socket: SOCKET, od: 0.057, kg: 0.09, ...PVC_WHITE };
const CROSS_40 = { kind: 'cross', name: 'cross Ø 40', size: 'd40', z: 0.031, zBranch: 0.021, socket: SOCKET, od: 0.046, kg: 0.12, price: 7.23, ...PVC_GREY }; // FLUXI-TECH PN16, lot of 2 at 14.45
const CROSS_50 = { kind: 'cross', name: 'cross Ø 50', size: 'd50', z: 0.03875, zBranch: 0.02625, socket: SOCKET, od: 0.057, kg: 0.18, price: 9.00, ...PVC_WHITE }; // price estimated
const TEE_40 = { kind: 'tee', name: 'tee Ø 40', size: 'd40', z: 0.031, zBranch: 0.021, socket: SOCKET, od: 0.046, kg: 0.09, price: 1.93, ...PVC_GREY };
const TEE_50 = { kind: 'tee', name: 'tee Ø 50', size: 'd50', z: 0.03875, zBranch: 0.02625, socket: SOCKET, od: 0.057, kg: 0.135, price: 4.00, ...PVC_WHITE };
const COUPLER_40 = { kind: 'coupler', name: 'coupler Ø 40', size: 'd40', z: 0.003, socket: SOCKET, od: 0.046, kg: 0.05, price: 1.83, ...PVC_GREY };
const COUPLER_50 = { kind: 'coupler', name: 'coupler Ø 50', size: 'd50', z: 0.00375, socket: SOCKET, od: 0.057, kg: 0.075, price: 3.00, ...PVC_WHITE };
const CAP_40 = { kind: 'cap', name: 'cap Ø 40', size: 'd40', z: 0.005, socket: SOCKET, od: 0.046, kg: 0.03, price: 2.31, ...PVC_GREY }; // z estimated: the cap's bottom
const CAP_50 = { kind: 'cap', name: 'cap Ø 50', size: 'd50', z: 0.006, socket: SOCKET, od: 0.057, kg: 0.045, price: 3.00, ...PVC_WHITE };
// The reducer at the top of a Ø 50 post (Nicoll IJ): a Ø 40 socket toward
// the foot elbows and a Ø 50 spigot below, which plugs into a Ø 50
// coupler on the post. 0.045 from its centre to each end, so the foot
// side loses 0.018 of pipe and the post side 0.018 plus the coupler.
const REDUCER_50_40 = { kind: 'reducer', name: 'reducer 50/40', size: 'd50', sizeTo: 'd40', z: 0.018, socket: SOCKET, od: 0.057, odTo: 0.046, kg: 0.08, price: 4.87, out: 'spigot', ...PVC_WHITE };
const PVC_BODY = { kind: 'fabricOverHoops', hoopOd: 0.065, color: '#141416', finish: 'sheen', hoop: { name: 'pool noodle (hoop)', kg: 0.25, price: 6.00 }, fabric: { name: 'stretch fabric, 2 m', kg: 1.2, price: 35.50 } };
const PLANK_HUB = { kind: 'plank', name: 'plank 0.60 × 0.10 × 0.027', length: 0.60, width: 0.10, thickness: 0.027, spacing: 0.05, kg: 1.0, price: 6, color: '#101012', finish: 'paint' }; // spacing: the hip fittings are 0.05 wide, so the pairs sit at least that far apart along the plank
const STAYS = { name: 'black polyester cord 4 mm, 50 m roll', roll: 50, price: 15.00, od: 0.004, color: '#141414', anchorBeyond: 1.5, maxSlope: 70 }; // anchorBeyond: the ground anchor sits this far past the ski's end; maxSlope: a cord steeper than this (degrees from horizontal) holds little
const BALLAST = { sandbag: { name: 'sandbag, empty', price: 2.30 }, sand: { name: 'sand, 25 kg bag (bought locally)', price: 5.00 }, dims: [0.40, 0.12, 0.25], color: '#4a4845', finish: 'matte' }; // dims: along, up, across
const COMMON_EXTRAS = { zipTies: { name: 'zip ties, pack of 100', price: 8.45 }, tape: { name: 'gaffer tape, roll', price: 14.90 } };
const PVC_EXTRAS = { ...COMMON_EXTRAS, screws: { name: 'self-drilling screws 4.2 × 16, pack of 100', pack: 100, price: 9.29 }, cement: { name: 'PVC cement, 125 ml', price: 5.00 } };
const PAINT = { name: 'black spray paint, 400 ml', coversM: 4, price: 7.00 }; // price estimated

export const SYSTEMS = [
  {
    id: 'pvc40',
    name: 'PVC Ø 40 legs with black foam, Ø 50 posts and skis',
    sizes: {
      d40: { label: 'Ø 40', shape: 'round', od: 0.040, kgPerM: 0.50, stock: [2.0, 1.0], stockPrice: [4.75, 7.00], stockSource: ['store price', 'Amazon, per metre in 1 m lots'], stockName: 'pipe' },
      d50: { label: 'Ø 50', shape: 'round', od: 0.050, kgPerM: 0.63, stock: [2.0], stockPrice: [6.00], stockSource: ['store price, estimated'], stockName: 'pipe' },
    },
    members: { leg: { size: 'd40', color: '#e4e2dc', finish: 'matte' }, post: { size: 'd50', ...PVC_WHITE }, ski: { size: 'd50', ...PVC_WHITE } },
    cover: { name: 'black foam sleeve 42 × 13 mm', od: 0.068, kgPerM: 0.07, pricePerM: 2.24, color: '#1b1b1d', finish: 'sheen' }, // 2 m lengths at 4.48, over the leg segments only
    fittings: { hip: ELBOWS_40, knee: ELBOWS_40, foot: ELBOWS_40, hub: CROSS_40, ski: TEE_50, reducer: REDUCER_50_40, coupler: { d40: COUPLER_40, d50: COUPLER_50 }, cap: { d40: CAP_40, d50: CAP_50 } },
    hub: { kind: 'crosses', spacing: 0.116 }, // twice a cross's reach (Z 0.031 plus the 0.027 socket): two crosses cannot sit closer; placeHub never lets it drop below that
    body: PVC_BODY,
    glueJoints: ['knee', 'hub'], // the self-weight moments there (25 to 40 N m) exceed what a screwed socket holds
    paintLegs: null,
    stays: STAYS,
    ballast: BALLAST,
    extras: PVC_EXTRAS,
  },
  {
    id: 'pvc50',
    name: 'PVC Ø 50 throughout, legs painted black, no foam',
    sizes: {
      d50: { label: 'Ø 50', shape: 'round', od: 0.050, kgPerM: 0.63, stock: [2.0], stockPrice: [6.00], stockSource: ['store price, estimated'], stockName: 'pipe' },
    },
    members: { leg: { size: 'd50', color: '#131315', finish: 'paint' }, post: { size: 'd50', ...PVC_WHITE }, ski: { size: 'd50', ...PVC_WHITE } },
    cover: null,
    fittings: { hip: ELBOWS_50, knee: ELBOWS_50, foot: ELBOWS_50, hub: CROSS_50, ski: TEE_50, coupler: { d50: COUPLER_50 }, cap: { d50: CAP_50 } },
    hub: { kind: 'crosses', spacing: 0.1315 }, // twice a Ø 50 cross's reach (Z 0.03875 plus the socket), as for pvc40
    body: PVC_BODY,
    glueJoints: ['knee', 'hub'],
    paintLegs: PAINT,
    stays: STAYS,
    ballast: BALLAST,
    extras: PVC_EXTRAS,
  },
  {
    id: 'alu30',
    name: 'Aluminium Ø 30 × 1.5 tube, bolted flattened-end hinges, pool noodles',
    sizes: {
      d30: { label: 'Ø 30', shape: 'round', od: 0.030, kgPerM: 0.36, stock: [2.0, 1.0], stockPrice: [24.40, 12.20], stockSource: ['12.20 per metre', '12.20 per metre'], stockName: 'tube' },
    },
    members: { leg: { size: 'd30', color: '#c9ccd1', finish: 'metal' }, post: { size: 'd30', ...PVC_WHITE }, ski: { size: 'd30', ...PVC_WHITE } },
    cover: { name: 'pool noodle', od: 0.065, kgPerM: 0.10, pricePerM: 3.75, color: '#1b1b1d', finish: 'sheen' }, // 6.00 per 1.6 m noodle
    fittings: {
      // An M8 bolt through the flattened ends of the two tubes, plus a
      // second bolt through a gusset strap so the joint cannot turn.
      hip: { kind: 'hinge', name: 'bolted hinge', size: 'd30', z: 0.04, socket: 0, od: 0.05, kg: 0.03, price: 1.00, color: '#8a8a8a', finish: 'metal', also: { name: 'gusset strap', kg: 0.02, price: 1.00 } }, // strap price estimated
      knee: { kind: 'hinge', name: 'bolted hinge', size: 'd30', z: 0.04, socket: 0, od: 0.05, kg: 0.03, price: 1.00, color: '#8a8a8a', finish: 'metal', also: { name: 'gusset strap', kg: 0.02, price: 1.00 } },
      foot: { kind: 'hinge', name: 'bolted hinge', size: 'd30', z: 0.04, socket: 0, od: 0.05, kg: 0.03, price: 1.00, color: '#8a8a8a', finish: 'metal', also: { name: 'gusset strap', kg: 0.02, price: 1.00 } },
      ski: { kind: 'clamp', name: '90° clamp connector Ø 30', size: 'd30', z: 0.03, zBranch: 0.03, socket: 0, od: 0.05, kg: 0.08, price: 17.40, color: '#8a8a8a', finish: 'metal' },
      coupler: { d30: { kind: 'coupler', name: 'tube joiner Ø 30', size: 'd30', z: 0.0, socket: 0.05, od: 0.034, kg: 0.04, price: 3.00, color: '#8a8a8a', finish: 'metal' } }, // an inner sleeve; price estimated
      cap: {},
    },
    hub: PLANK_HUB,
    body: PVC_BODY,
    glueJoints: [],
    paintLegs: null,
    stays: STAYS,
    ballast: BALLAST,
    extras: COMMON_EXTRAS,
  },
  {
    id: 'wood34',
    name: 'Pine 34 × 34 battens, lap joints with bolts, Ø 45 × 45 posts',
    sizes: {
      s34: { label: '34 × 34', shape: 'square', size: 0.034, kgPerM: 0.55, stock: [2.4], stockPrice: [3.66], stockSource: ['store price, 1.53 per metre'], stockName: 'batten' },
      s45: { label: '45 × 45', shape: 'square', size: 0.045, kgPerM: 0.97, stock: [2.4], stockPrice: [6.00], stockSource: ['store price, 2.50 per metre'], stockName: 'batten' },
    },
    members: { leg: { size: 's34', color: '#101012', finish: 'paint' }, post: { size: 's45', color: '#f1f0ea', finish: 'paint' }, ski: { size: 's45', color: '#f1f0ea', finish: 'paint' } },
    cover: null,
    fittings: {
      // Two members side by side, two M6 bolts through them: any angle.
      hip: { kind: 'lap', name: 'lap joint', size: 's34', z: 0.05, socket: 0, od: 0.05, kg: 0.05, price: 1.50, color: '#8a8a8a', finish: 'metal' },
      knee: { kind: 'lap', name: 'lap joint', size: 's34', z: 0.05, socket: 0, od: 0.05, kg: 0.05, price: 1.50, color: '#8a8a8a', finish: 'metal' },
      foot: { kind: 'lap', name: 'lap joint', size: 's34', z: 0.05, socket: 0, od: 0.05, kg: 0.05, price: 1.50, color: '#8a8a8a', finish: 'metal' },
      ski: { kind: 'bracket', name: 'angle bracket', size: 's45', z: 0.0225, zBranch: 0.0225, socket: 0, od: 0.05, kg: 0.06, price: 2.99, color: '#8a8a8a', finish: 'metal' },
      coupler: { s34: { kind: 'coupler', name: 'joining plate', size: 's34', z: 0, socket: 0.06, od: 0.04, kg: 0.05, price: 2.00, color: '#8a8a8a', finish: 'metal' }, s45: { kind: 'coupler', name: 'joining plate', size: 's45', z: 0, socket: 0.06, od: 0.05, kg: 0.05, price: 2.00, color: '#8a8a8a', finish: 'metal' } }, // price estimated
      cap: {},
    },
    hub: PLANK_HUB,
    body: PVC_BODY,
    glueJoints: [],
    paintLegs: PAINT,
    stays: STAYS,
    ballast: BALLAST,
    extras: COMMON_EXTRAS,
  },
];

// The longest piece that can be shipped: the parcel services seen on
// 2026-10-13. The default is 2.0 m, since the plan is to buy the pipe near
// the island.
export const MAX_PIECES = [
  { value: 1.0, label: '1.0 m (Colissimo)' },
  { value: 1.4, label: '1.4 m (Chronopost, box up to 1.5 m)' },
  { value: 2.0, label: '2.0 m (UPS through a packer, or store stock)' },
  { value: 2.7, label: '2.7 m (UPS maximum)' },
];
export const DEFAULT_MAX_PIECE = 2.0;
export const CHILD_REACH = 2.0; // a foot below this is within reach of children, metres
export const MAX_POST = 3.0; // a post taller than this is warned about, metres
export const PRICES_SEEN = '2026-10-13';

export function systemById(id) { return SYSTEMS.find(s => s.id === id) || null; }

const DEG = Math.PI / 180;
const SKI_OVERHANG = 0.15; // the ski runs this far past the first and last post
const SPINE_OVERHANG = 0.05; // the spine runs at least this far past the first and last cross (more when the cross and the cap reach further)
const HUB_INSET = 0.03; // the hub's ends stay this far inside the body's ends
const WALL_CLEARANCE = 0.005; // between the fittings at the wall and the wall
const RECIPE_TOLERANCE = 2.5; // an elbow or a pair within this many degrees of the need is used

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { return Math.sqrt(dot(a, a)); }
function unit(a) { const n = norm(a); return n > 0 ? scale(a, 1 / n) : [0, 0, 0]; }
function mm(v) { return Math.round(v * 1000) / 1000; }
function mm4(v) { return Math.round(v * 10000) / 10000; }
function deg1(v) { return Math.round(v * 10) / 10; }
function angleBetween(a, b) { return Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) / DEG; }

// Thickness of a size (round: od; square: size).
function thickness(size) { return size.od !== undefined ? size.od : size.size; }
function sizeOf(system, memberRole) { return system.sizes[system.members[memberRole].size]; }
const MEMBER_ROLE = { upper: 'leg', lower: 'leg', spine: 'leg', stub: 'leg', link: 'leg', post: 'post', ski: 'ski' }; // link: the short pipe a female-female elbow needs into a fitting's socket, or between two of them

// ---------------------------------------------------------------- elbow recipes

// The angle a pair of elbows a and b makes when the second is twisted by
// psi about the first's outgoing axis (degrees).
export function pairAngle(a, b, psi) {
  const c = Math.cos(a * DEG) * Math.cos(b * DEG) - Math.sin(a * DEG) * Math.sin(b * DEG) * Math.cos(psi * DEG);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}
// The twist that makes theta from a and b; theta is clamped into the
// pair's reach first.
function pairTwist(a, b, theta) {
  const t = Math.max(Math.abs(a - b), Math.min(a + b, theta));
  const sin = Math.sin(a * DEG) * Math.sin(b * DEG);
  if (sin < 1e-12) return 0;
  const c = (Math.cos(a * DEG) * Math.cos(b * DEG) - Math.cos(t * DEG)) / sin;
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}

// Which elbows make the angle thetaDeg at a joint of `role` in `system`:
// one elbow within RECIPE_TOLERANCE of the need, else a pair that reaches
// it (preferring a pair with a 45, then the smallest a + b) and the twist
// between them. For a fitting without an angle list (a hinge, a lap
// joint) the recipe is the angle alone. null when nothing reaches it.
export function recipeFor(thetaDeg, system, role) {
  const spec = system.fittings[role];
  if (!spec) return null;
  if (!spec.angles) return { angle: deg1(thetaDeg) };
  const theta = Math.max(0, thetaDeg);
  const single = spec.angles.filter(a => Math.abs(a - theta) <= RECIPE_TOLERANCE).sort((a, b) => Math.abs(a - theta) - Math.abs(b - theta))[0];
  if (single !== undefined) return { angles: [single], angle: deg1(theta) };
  const pairs = [];
  for (const a of spec.angles) for (const b of spec.angles) {
    if (b < a) continue;
    if (theta >= Math.abs(a - b) - RECIPE_TOLERANCE && theta <= a + b + RECIPE_TOLERANCE) pairs.push([a, b]);
  }
  if (!pairs.length) return null;
  pairs.sort((p, q) => {
    const p45 = p.includes(45) ? 0 : 1, q45 = q.includes(45) ? 0 : 1;
    if (p45 !== q45) return p45 - q45;
    return p[0] + p[1] - (q[0] + q[1]);
  });
  // The male-female elbow first, so its spigot plugs into the other; then
  // the larger first. The angle they make does not depend on the order.
  const ends = spec.endsByAngle || {};
  const angles = [...pairs[0]].sort((a, b) => ((ends[a] === 'F/F') - (ends[b] === 'F/F')) || b - a);
  return { angles, twist: deg1(pairTwist(angles[0], angles[1], theta)), angle: deg1(theta) };
}

// The recipe as the cut list prints it: "45 + 20 @ 112°", "45°", or the
// angle alone for a joint that takes any angle.
export function recipeText(recipe) {
  if (!recipe) return 'none reaches it';
  if (!recipe.angles) return `${Math.round(recipe.angle)}°`;
  if (recipe.angles.length === 1) return `${recipe.angles[0]}°`;
  return `${recipe.angles[0]} + ${recipe.angles[1]} @ ${Math.round(recipe.twist)}°`;
}

// A joint fitting resolved for its angle: z (the pipe lost at each pipe
// end; a pair extends the joint by the other elbow's Z, and two
// female-female elbows by the link of pipe between them), the recipe, the
// items it is counted as, the sockets it has (one per male-female elbow,
// two per female-female one; what receives the set is counted by the
// fitting that has the socket), what it ends in (out: 'spigot' or
// 'socket'; 'none' for a hinge or a lap joint, where nothing follows) and
// the link of pipe inside it, if any.
function resolveJoint(system, role, theta) {
  const spec = system.fittings[role];
  const recipe = recipeFor(theta, system, role);
  const base = { ...spec, role };
  if (!spec.angles) {
    const items = [{ name: spec.name, kg: spec.kg, price: spec.price }];
    if (spec.also) items.push({ name: spec.also.name, kg: spec.also.kg || 0, price: spec.also.price || 0 });
    return { ...base, recipe, items, sockets: 0, out: 'none', link: 0 };
  }
  const label = system.sizes[spec.size].label;
  const ends = a => (spec.endsByAngle || {})[a] || 'M/F';
  if (!recipe) {
    const a = spec.angles[spec.angles.length - 1];
    return { ...base, recipe: null, z: 2 * spec.zByAngle[a], items: [], sockets: 0, out: ends(a) === 'F/F' ? 'socket' : 'spigot', link: 0, reach: false };
  }
  const link = recipe.angles.length === 2 && ends(recipe.angles[0]) === 'F/F' ? 2 * spec.socket : 0; // two female-female elbows: a link of pipe, a socket deep at each end
  const z = recipe.angles.reduce((s, a) => s + spec.zByAngle[a], 0) + link;
  const items = recipe.angles.map(a => ({ name: `${spec.name} ${a}° ${ends(a)} ${label}`, kg: spec.kg, price: spec.priceByAngle[a] }));
  const sockets = recipe.angles.reduce((s, a) => s + (ends(a) === 'F/F' ? 2 : 1), 0);
  const out = ends(recipe.angles[recipe.angles.length - 1]) === 'F/F' ? 'socket' : 'spigot';
  return { ...base, recipe, z, items, sockets, out, link };
}

// A plain fitting (cross, tee, coupler, cap, reducer) resolved the same
// way; the reducer's Ø 50 end is a spigot, so it has one socket.
function resolvePlain(spec, role) {
  return { ...spec, role, items: [{ name: spec.name, kg: spec.kg, price: spec.price }], sockets: { cross: 4, tee: 3, coupler: 2, cap: 1, reducer: 1, clamp: 0, bracket: 0 }[spec.kind] ?? 2 };
}
// Pipe lost at one end into a resolved fitting, at its run or its branch.
function allowance(spec, port = 'run') {
  if (!spec) return 0;
  if (port === 'branch' && spec.zBranch !== undefined) return spec.zBranch;
  return spec.z !== undefined ? spec.z : Math.max(0, (spec.centreToEnd || 0) - (spec.socket || 0));
}
const NONE = { z: 0, socket: 0 }; // an open end

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
// afterwards each bin is charged at the cheapest stock length that holds
// what is in it (the shortest when no prices are given).
export function stockPlan(pieces, stock, prices = null) {
  const priceOf = i => prices ? prices[i] : stock[i];
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
  const byLength = stock.map((length, i) => ({ length, price: priceOf(i), count: 0, used: 0 }));
  for (const b of bins) {
    const used = b.pieces.reduce((s, p) => s + p, 0);
    const fits = byLength.filter(r => r.length >= used - 1e-9);
    const row = (fits.length ? fits : byLength).sort((r, q) => r.price - q.price || r.length - q.length)[0];
    row.count++; row.used += used;
  }
  const metres = byLength.reduce((s, r) => s + r.length * r.count, 0);
  const used = byLength.reduce((s, r) => s + r.used, 0);
  const cost = byLength.reduce((s, r) => s + r.price * r.count, 0);
  return { lengths: byLength.map(r => ({ length: r.length, count: r.count, waste: mm(r.length * r.count - r.used), unit: r.price, cost: mm(r.price * r.count) })), count: bins.length, metres: mm(metres), waste: mm(metres - used), cost: mm(cost), unplaced };
}

// The hub: where the hips sit on the spine. For 'crosses' the four pair
// positions along the body axis are pushed apart to at least hub.spacing,
// centred on their mean, and the roots move with them (the knees and feet
// stay); for 'plank' the roots move in to the plank's sides and apart to
// hub.spacing (the hip fittings' width) along it. The hub must stay inside
// the body: when the spacing would push the spine's front cap past the
// head tip less HUB_INSET, the group slides backward; the plank runs
// backward from just in front of the front pair.
// Returns the along position per pair, the moved root per leg (indexed
// like model.legs), the shift of each, and the hub's front and back along
// the axis.
function placeHub(model, system) {
  const p = model.params;
  const hub = system.hub;
  const frame = bodyFrame(p);
  const L = bodyLength(p);
  const alongs = [0, 1, 2, 3].map(i => rootAlongOffset(p, i));
  // Two crosses cannot sit closer than their reach (Z plus the socket at
  // each), and the spine's end piece must hold a cross and a cap.
  const reach = spec => spec ? (spec.z || 0) + (spec.socket || 0) : 0;
  const crossReach = hub.kind === 'crosses' ? reach(system.fittings.hub) : 0;
  const capReach = hub.kind === 'crosses' ? reach(system.fittings.cap[system.members.leg.size]) : 0;
  const spacing = Math.max(hub.spacing || 0, 2 * crossReach);
  const overhang = Math.max(SPINE_OVERHANG, crossReach + capReach);
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  // Front pair first, so the alongs run down; keep every gap at least the spacing.
  const spaced = [alongs[0]];
  for (let i = 1; i < 4; i++) spaced.push(spaced[i - 1] - Math.max(alongs[i - 1] - alongs[i], spacing));
  let pairAlong = spaced.map(v => v + avg(alongs) - avg(spaced));
  const tip = L / 2 - HUB_INSET, tail = -L / 2 + HUB_INSET;
  let front, back;
  if (hub.kind === 'crosses') {
    const slide = Math.max(0, pairAlong[0] + overhang - tip);
    pairAlong = pairAlong.map(v => v - slide);
    front = pairAlong[0] + overhang;
    back = pairAlong[3] - overhang;
  } else {
    // The plank runs backward from one fitting width in front of the
    // front pair, so it never passes the head tip and the pairs stay put.
    const length = Math.max(hub.length, pairAlong[0] - pairAlong[3] + 2 * spacing);
    front = Math.min(pairAlong[0] + spacing, tip);
    back = front - length;
  }
  const acrossOf = side => side * (hub.kind === 'plank' ? hub.width / 2 : p.headWidth / 2);
  const roots = model.legs.map(l => frame.toAlley(pairAlong[l.pair], p.headLift || 0, acrossOf(l.side)));
  const shifts = model.legs.map((l, j) => norm(sub(roots[j], l.root)));
  const alongShift = Math.max(...pairAlong.map((v, i) => Math.abs(v - alongs[i])));
  // The knees stay, so a moved root changes the upper segment's length
  // from the design's (and the knee's share of the leg with it).
  const upperChange = Math.max(...model.legs.map((l, j) => Math.abs(norm(sub(l.knee, roots[j])) - norm(sub(l.knee, l.root)))));
  return { frame, pairAlong, roots, shifts, maxShift: Math.max(...shifts), alongShift, upperChange, spacing, overhang, front, back, overflow: Math.max(0, tail - back), bodyLength: L };
}

// Build the parts of one system for a spider model. `walls` is the wall
// function the model was built with (used to check the skis against the
// walls); maxPiece the longest piece that can be shipped, metres.
export function buildParts(model, params, walls, { system, maxPiece = DEFAULT_MAX_PIECE, ground = 0 } = {}) {
  if (!system) throw new Error('buildParts needs a system');
  const p = model.params;
  const warnings = [];
  const members = [];   // { role, a, b, shape, od|size, sizeKey, color, finish, leg?, side?, pieces? } ; ballast: { role, at, dims }
  const fittings = [];  // { role, kind, name, at, dirs, od, centreToEnd, color, finish, items, sockets, glued, recipe?, leg?, side? }
  const cuts = [];      // { role, sizeKey, leg?|side?, length, pieces }
  const glued = joint => (system.glueJoints || []).includes(joint);
  // Stock that can be shipped: the lengths up to maxPiece, or all of them
  // when none is short enough (the warning says so).
  const usableStock = size => { const ok = size.stock.filter(l => l <= maxPiece + 1e-9); return ok.length ? ok : size.stock; };
  const maxLenOf = size => Math.min(maxPiece, Math.max(...usableStock(size)));
  let splitCount = 0;
  const tooShort = []; // pipes shorter than the two sockets they sit in: the fittings would collide
  const memberDims = size => size.shape === 'square' ? { shape: 'square', size: thickness(size) } : { shape: 'round', od: thickness(size) };
  const couplerFor = sizeKey => { const c = system.fittings.coupler[sizeKey]; if (!c) throw new Error(`no coupler for ${sizeKey} in ${system.id}`); return resolvePlain(c, 'coupler'); };
  const capFor = sizeKey => { const c = system.fittings.cap[sizeKey]; return c ? resolvePlain(c, 'cap') : null; };

  // A pipe between two fitting centres: the member for drawing, its cut
  // (less the allowance at each end) and the couplers where it is split.
  // `ends` are [spec, port] pairs or a resolved spec (run port).
  const pipe = (role, a, b, ends, extra = {}) => {
    const memberRole = MEMBER_ROLE[role];
    const part = system.members[memberRole];
    const sizeKey = part.size, size = system.sizes[sizeKey];
    const lost = ends.map(e => Array.isArray(e) ? allowance(e[0], e[1]) : allowance(e));
    const span = norm(sub(b, a));
    const length = Math.max(0, span - lost[0] - lost[1]);
    const sockets = ends.map(e => (Array.isArray(e) ? e[0] : e).socket || 0);
    if (length < sockets[0] + sockets[1] - 1e-9) tooShort.push(role);
    const coupler = couplerFor(sizeKey);
    const { pieces, couplers } = splitPiece(length, maxLenOf(size), coupler);
    if (couplers) {
      splitCount++;
      const dir = unit(sub(b, a));
      // Couplers sit at the piece boundaries along the pipe.
      let at = lost[0];
      for (let i = 0; i < couplers; i++) {
        at += pieces[i] + allowance(coupler);
        fittings.push(fitting(coupler, add(a, scale(dir, at)), [dir], { ...extra, glued: false }));
        at += allowance(coupler);
      }
    }
    members.push({ role, a, b, ...memberDims(size), sizeKey, color: part.color, finish: part.finish, pieces, ...extra });
    cuts.push({ role, sizeKey, ...extra, length: mm(length), pieces });
    return length;
  };
  // A fitting instance from a resolved spec.
  const fitting = (s, at, dirs, extra = {}) => ({
    role: s.role, kind: s.kind, name: s.items.length ? s.items[0].name : s.name, at, dirs, od: s.od, odTo: s.odTo, centreToEnd: (s.z || 0) + (s.socket || 0),
    color: s.color, finish: s.finish || 'matte', items: s.items, sockets: s.sockets, recipe: s.recipe, out: s.out, ...extra,
  });
  const legName = l => `${l.pair + 1}${l.side > 0 ? 'R' : 'L'}`;

  // ---- hub
  const hubPlace = placeHub(model, system);
  const { frame, pairAlong, roots } = hubPlace;
  const axisPoint = along => frame.toAlley(along, p.headLift || 0, 0);
  const axisDir = unit(sub(axisPoint(1), axisPoint(0)));
  const hub = { kind: system.hub.kind, pairAlong, roots, shifts: hubPlace.shifts.map(mm), maxShift: mm(hubPlace.maxShift), alongShift: mm(hubPlace.alongShift), upperChange: mm(hubPlace.upperChange), spacing: hubPlace.spacing, overhang: hubPlace.overhang, glued: glued('hub') };
  hub.axis = { a: axisPoint(hubPlace.back), b: axisPoint(hubPlace.front) };
  hub.length = mm(hubPlace.front - hubPlace.back);
  // The hip fittings are resolved in the leg loop; the stubs need them, so
  // the stubs are made there too.
  const cross = system.hub.kind === 'crosses' ? resolvePlain(system.fittings.hub, 'cross') : null;
  if (cross) {
    const spineCap = capFor(system.members.leg.size);
    const first = hubPlace.front, last = hubPlace.back;
    // The spine: cap, cross, cross, cross, cross, cap; a piece between each pair.
    const stations = [{ spec: spineCap || NONE, along: last }, ...[3, 2, 1, 0].map(i => ({ spec: cross, along: pairAlong[i], pair: i })), { spec: spineCap || NONE, along: first }];
    for (let i = 0; i + 1 < stations.length; i++) {
      pipe('spine', axisPoint(stations[i].along), axisPoint(stations[i + 1].along), [stations[i].spec, stations[i + 1].spec]);
    }
    if (spineCap) fittings.push(fitting(spineCap, axisPoint(last), [axisDir], { glued: glued('hub') }), fitting(spineCap, axisPoint(first), [scale(axisDir, -1)], { glued: glued('hub') }));
    for (const st of stations.filter(s => s.pair !== undefined)) {
      fittings.push(fitting(cross, axisPoint(st.along), [axisDir, scale(axisDir, -1), [0, 0, 1], [0, 0, -1]], { pair: st.pair, glued: glued('hub') }));
    }
    if (hubPlace.maxShift > 0.0005) {
      warnings.push(`the hub crosses need ${hub.length.toFixed(2)} m; the head is ${p.headLength.toFixed(2)} m, the roots were moved up to ${hubPlace.maxShift.toFixed(2)} m and the upper segments are up to ${hubPlace.upperChange.toFixed(2)} m off the design's`);
    }
    if (hubPlace.overflow > 0.0005) warnings.push(`the spine (${hub.length.toFixed(2)} m) runs ${hubPlace.overflow.toFixed(2)} m out of the back of the body (${hubPlace.bodyLength.toFixed(2)} m)`);
  } else {
    const h = system.hub;
    const length = hubPlace.front - hubPlace.back;
    hub.plank = { centre: axisPoint((hubPlace.front + hubPlace.back) / 2), length: mm(length), width: h.width, thickness: h.thickness, axis: axisDir, name: h.name, kg: h.kg, price: h.price, color: h.color, finish: h.finish || 'paint' };
    if (length > h.length + 1e-6) warnings.push(`the hip joints need a ${length.toFixed(2)} m plank, longer than the ${h.length.toFixed(2)} m one`);
    if (hubPlace.alongShift > 0.0005) warnings.push(`the hip joints need ${hubPlace.spacing.toFixed(2)} m between pairs; the roots were moved along the plank by up to ${hubPlace.alongShift.toFixed(2)} m`);
    if (hubPlace.maxShift > 0.0005) warnings.push(`the roots were moved in to the plank's sides, up to ${hubPlace.maxShift.toFixed(2)} m`);
    if (hubPlace.overflow > 0.0005) warnings.push(`the plank (${length.toFixed(2)} m) runs ${hubPlace.overflow.toFixed(2)} m out of the back of the body (${hubPlace.bodyLength.toFixed(2)} m)`);
  }

  // ---- legs, posts
  // The design puts each foot on the wall plane. In the build the foot
  // fitting, the post and the ski sit one fitting radius plus a clearance
  // inside that plane, so the fittings touch the wall and nothing is in
  // it. The ski of each side runs straight at the innermost foot of that
  // side (the one nearest the alley centre), so it lies against a wall
  // that steps along the alley; a post whose foot is further out leans
  // across to meet it.
  const skiSize = sizeOf(system, 'ski');
  const skiTop = thickness(skiSize);
  const skiTee = resolvePlain(system.fittings.ski, 'tee');
  const postSize = sizeOf(system, 'post');
  const needsReducer = system.fittings.reducer && system.members.post.size !== system.fittings.foot.size;
  const reducer = needsReducer ? resolvePlain(system.fittings.reducer, 'reducer') : null;
  // The widest fitting on the wall line (the foot elbows, the reducer, the
  // ski's tees, couplers and caps) sets how far inside the wall plane the
  // feet and the ski sit.
  const onWall = [system.fittings.foot, system.fittings.ski, reducer, system.fittings.coupler[system.members.ski.size], system.fittings.cap[system.members.ski.size]].filter(Boolean);
  const inset = Math.max(...onWall.map(s => s.od || 0)) / 2 + WALL_CLEARANCE;
  const feet = model.legs.map(l => [l.foot[0], l.foot[1], l.foot[2] - l.side * inset]);
  const skiZ = {};
  for (const side of [1, -1]) {
    const zs = model.legs.filter(l => l.side === side).map(l => feet[legIdx(l)][2]);
    skiZ[side] = side > 0 ? Math.min(...zs) : Math.max(...zs);
  }
  // What follows a joint set on its out side. A pipe: when the set ends in
  // a spigot a coupler of the set's size takes it (counted, drawn one Z
  // past the set, and the pipe loses the coupler's two Z as well); when
  // it ends in a socket the pipe goes straight in. A fitting's socket: a
  // spigot plugs straight in; a set ending in a socket needs a link of
  // pipe, a socket deep at each end, which is cut and drawn.
  const toPipe = (joint, at, dir, extra) => {
    if (joint.out !== 'spigot') return joint;
    const c = couplerFor(joint.size);
    fittings.push(fitting(c, add(at, scale(dir, joint.z + allowance(c))), [dir], extra));
    return { ...joint, z: joint.z + 2 * allowance(c) };
  };
  const toSocket = (joint, next, at, dir, extra) => {
    if (joint.out !== 'socket') return add(at, scale(dir, joint.z + allowance(next)));
    const centre = add(at, scale(dir, joint.z + 2 * (joint.socket || 0) + allowance(next)));
    pipe('link', at, centre, [joint, next], extra);
    return centre;
  };
  const legsAssembly = [];
  const legPosts = [];
  let lowFeet = 0, tallPosts = 0;
  for (const l of model.legs) {
    const j = legIdx(l);
    const root = roots[j];
    const foot = feet[j];
    const upperSpan = norm(sub(l.knee, root));
    const lowerSpan = norm(sub(foot, l.knee));
    // The post: from the foot fitting down to the tee at the ski's centre.
    const bottom = [foot[0], ground + skiTop / 2, skiZ[l.side]];
    const postHeight = foot[1] - (ground + skiTop); // the post seen above the ski
    if (postHeight < 0) warnings.push('a post is shorter than the ski');
    const standing = foot[1] - bottom[1] > 0.001;
    const postDir = standing ? unit(sub(bottom, foot)) : [0, -1, 0];
    // The angles at the three joints.
    const u = unit(sub(l.knee, root));
    const v = unit(sub(foot, l.knee));
    const toKnee = unit(sub(l.knee, foot));
    const f = frame.f;
    // Hip: the angle between the cross branch (straight across) and the
    // upper leg, and the turn of that plane about the branch.
    const hip = { angle: deg1(angleBetween(u, [0, 0, l.side])), roll: deg1(Math.atan2(u[1], f * u[0]) / DEG) };
    const knee = { bend: deg1(180 - angleBetween(scale(u, -1), v)) };
    // Foot: the angle between the post and the lower leg; the post is
    // turned to the lower segment's plan angle (the leg's, under the
    // brief's-leg rule), as legAngles measures it.
    const footFit = { angle: deg1(angleBetween(toKnee, postDir)), bend: deg1(180 - angleBetween(toKnee, postDir)), plan: deg1(Math.atan2(f * v[0], l.side * v[2]) / DEG) };
    const hipSpec = resolveJoint(system, 'hip', hip.angle);
    const kneeSpec = resolveJoint(system, 'knee', knee.bend);
    const footSpec = resolveJoint(system, 'foot', footFit.bend);
    for (const [joint, s, need] of [['hip', hipSpec, hip.angle], ['knee', kneeSpec, knee.bend], ['foot', footSpec, footFit.bend]]) {
      if (s.reach === false) warnings.push(`no ${s.name} pair reaches the ${Math.round(need)} degrees the ${legName(l)} ${joint} needs`);
    }
    hip.recipe = hipSpec.recipe; knee.recipe = kneeSpec.recipe; footFit.recipe = footSpec.recipe;
    // A link of pipe inside a set of two female-female elbows.
    for (const s of [hipSpec, kneeSpec, footSpec]) if (s.link) cuts.push({ role: 'link', sizeKey: s.size, leg: j, joint: s.role, length: mm(s.link), pieces: [mm(s.link)] });
    // The stub from the cross branch to the hip (a crosses hub only).
    if (cross) pipe('stub', axisPoint(pairAlong[l.pair]), root, [[cross, 'branch'], hipSpec], { leg: j });
    const upper = pipe('upper', root, l.knee, [toPipe(hipSpec, root, u, { leg: j, joint: 'hip', glued: glued('hip') }), kneeSpec], { leg: j });
    const lower = pipe('lower', l.knee, foot, [toPipe(kneeSpec, l.knee, v, { leg: j, joint: 'knee', glued: glued('knee') }), footSpec], { leg: j });
    if (system.cover) {
      for (const [a, b] of [[root, l.knee], [l.knee, foot]]) {
        members.push({ role: 'cover', a, b, shape: 'round', od: system.cover.od, color: system.cover.color, finish: system.cover.finish || 'sheen', leg: j });
      }
    }
    // The post pipe: from the foot fitting (through the reducer, when the
    // post is a bigger size than the foot fitting, and a coupler after a
    // spigot) down to the tee's branch.
    const footExtra = { leg: j, joint: 'foot', glued: glued('foot') };
    let postTop = foot, topSpec = footSpec;
    if (reducer) {
      postTop = toSocket(footSpec, reducer, foot, postDir, footExtra);
      fittings.push(fitting(reducer, postTop, [scale(postDir, -1), postDir], footExtra));
      topSpec = reducer;
    }
    const post = pipe('post', postTop, standing ? bottom : postTop, [toPipe(topSpec, postTop, postDir, footExtra), [skiTee, 'branch']], { leg: j });
    const lean = Math.abs(foot[2] - bottom[2]);
    legPosts.push({ leg: j, side: l.side, x: foot[0], top: foot, z: bottom[2], lean });
    const toAxis = unit(sub(axisPoint(pairAlong[l.pair]), root));
    fittings.push(fitting(hipSpec, root, [toAxis, unit(sub(l.knee, root))], { leg: j, joint: 'hip', glued: glued('hip') }));
    fittings.push(fitting(kneeSpec, l.knee, [unit(sub(root, l.knee)), unit(sub(foot, l.knee))], { leg: j, joint: 'knee', glued: glued('knee') }));
    fittings.push(fitting(footSpec, foot, [unit(sub(l.knee, foot)), postDir], { leg: j, joint: 'foot', glued: glued('foot') }));
    if (foot[1] < CHILD_REACH) lowFeet++;
    if (postHeight > MAX_POST) tallPosts++;
    legsAssembly.push({
      leg: j, pair: l.pair, side: l.side > 0 ? 'R' : 'L',
      hip, knee, foot: footFit,
      joints: { hip: glued('hip') ? 'glued' : 'screwed', knee: glued('knee') ? 'glued' : 'screwed', foot: glued('foot') ? 'glued' : 'screwed' },
      upper: mm(upper), lower: mm(lower), post: mm(post), postHeight: mm(Math.max(0, postHeight)),
      postLean: { across: mm(lean), deg: deg1(Math.atan2(lean, Math.max(0.001, foot[1] - bottom[1])) / DEG) },
      upperSpan: mm(upperSpan), lowerSpan: mm(lowerSpan),
      kneeAboveHub: l.knee[1] > root[1],
      rootShift: mm(hubPlace.shifts[j]),
    });
  }
  if (tooShort.length) warnings.push(`${tooShort.length} pipe${tooShort.length > 1 ? 's are' : ' is'} shorter than the two sockets at its ends (${[...new Set(tooShort)].join(', ')}); the fittings there collide`);
  if (lowFeet) warnings.push(`${lowFeet} ${lowFeet > 1 ? 'feet are' : 'foot is'} within reach of children (below ${CHILD_REACH.toFixed(1)} m)`);
  if (tallPosts) warnings.push(`a post is taller than ${MAX_POST.toFixed(1)} m`);

  // ---- skis
  const skis = [];
  const skiCap = capFor(system.members.ski.size);
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'R' : 'L';
    const sideName = side > 0 ? 'right' : 'left';
    const posts = legPosts.filter(q => q.side === side).sort((a, b) => a.x - b.x);
    const z = skiZ[side];
    const y = ground + skiTop / 2;
    const x0 = posts[0].x - SKI_OVERHANG, x1 = posts[posts.length - 1].x + SKI_OVERHANG;
    const at = x => [x, y, z];
    const stations = [{ spec: skiCap || NONE, x: x0 }, ...posts.map(q => ({ spec: skiTee, x: q.x, leg: q.leg })), { spec: skiCap || NONE, x: x1 }];
    for (let i = 0; i + 1 < stations.length; i++) {
      const s0 = stations[i], s1 = stations[i + 1];
      const len = pipe('ski', at(s0.x), at(s1.x), [s0.spec, s1.spec], { side: tag });
      if (s0.leg !== undefined && s1.leg !== undefined && len < 2 * (skiTee.socket || 0) + 0.01) warnings.push(`two posts on the ${sideName} ski are closer than their tees`);
    }
    for (const q of posts) fittings.push(fitting(skiTee, at(q.x), [[1, 0, 0], [-1, 0, 0], [0, 1, 0]], { side: tag, leg: q.leg, glued: glued('ski') }));
    if (skiCap) fittings.push(fitting(skiCap, at(x0), [[1, 0, 0]], { side: tag, glued: false }), fitting(skiCap, at(x1), [[-1, 0, 0]], { side: tag, glued: false }));
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
    // ---- stays and ballast for this side
    if (system.stays) {
      const st = system.stays;
      // Each anchor sits against the wall found at its x, which may step
      // out past the ski's end (the alley mouth); where there is no wall
      // it sits on the ski's line and its sandbag stands in the open.
      const anchors = [x0 - st.anchorBeyond, x1 + st.anchorBeyond].map(x => {
        const w = walls ? walls(x, side, p.across) : null;
        if (w === null || w === undefined) { warnings.push(`no wall at the ${sideName} anchor at x = ${x.toFixed(1)} m; its sandbag stands in the open`); return [x, ground, z]; }
        const az = w - side * inset;
        if (Math.abs(az - z) > 0.3) warnings.push(`the ${sideName} anchor at x = ${x.toFixed(1)} m is ${Math.abs(az - z).toFixed(2)} m out from the ski's line (the wall steps out there); its stays leave the wall plane`);
        return [x, ground, az];
      });
      const bagIn = system.ballast ? side * (system.ballast.dims[2] / 2 - inset) : 0; // the bag's outer face at the wall, like the ski's
      let steep = false;
      for (const q of posts) {
        const anchor = anchors[Math.abs(q.x - anchors[0][0]) <= Math.abs(q.x - anchors[1][0]) ? 0 : 1];
        const far = posts.reduce((best, r) => Math.abs(r.x - q.x) > Math.abs(best.x - q.x) ? r : best, posts[0]);
        for (const [to, kind] of [[anchor, 'anchor'], [at(far.x), 'ski']]) {
          const run = Math.hypot(to[0] - q.top[0], to[2] - q.top[2]);
          const slope = Math.atan2(q.top[1] - to[1], run) / DEG;
          if (slope > st.maxSlope) steep = true;
          members.push({ role: 'stay', kind, a: q.top, b: to, shape: 'round', od: st.od, color: st.color, finish: 'matte', leg: q.leg, side: tag, length: mm(norm(sub(to, q.top))), slope: deg1(slope) });
        }
      }
      if (steep) warnings.push(`a stay on the ${sideName} is nearly vertical and holds little`);
      if (system.ballast) {
        const dims = system.ballast.dims;
        for (const a of anchors) members.push({ role: 'ballast', kind: 'anchor', at: [a[0], ground + dims[1] / 2, a[2] - bagIn], dims, color: system.ballast.color, finish: system.ballast.finish, side: tag });
        for (const t of [1 / 3, 2 / 3]) members.push({ role: 'ballast', kind: 'ski', at: [x0 + (x1 - x0) * t, ground + skiTop + dims[1] / 2, z - bagIn], dims, color: system.ballast.color, finish: system.ballast.finish, side: tag });
      }
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
  // Fitting lines by name (an elbow pair counts two elbows), in the order
  // first seen: hub, legs, skis.
  const fittingLines = [];
  for (const f of fittings) for (const it of f.items) {
    let line = fittingLines.find(r => r.name === it.name);
    if (!line) { line = { name: it.name, role: f.role, count: 0, kg: 0, cost: 0, unit: it.price || 0 }; fittingLines.push(line); }
    line.count++; line.kg = mm(line.kg + (it.kg || 0)); line.cost = mm(line.cost + (it.price || 0));
  }
  const screws = fittings.filter(f => !f.glued).reduce((s, f) => s + 2 * (f.sockets || 0), 0);
  // Pipe: the pieces as cut, by size and role; the stock plan per size
  // buys them and what is left over is the offcuts.
  const sizeKeys = Object.keys(system.sizes);
  const roles = ['upper', 'lower', 'stub', 'link', 'spine', 'post', 'ski'];
  const memberLines = [];
  for (const role of roles) {
    const rows = cuts.filter(c => c.role === role);
    if (!rows.length) continue;
    const sizeKey = rows[0].sizeKey;
    memberLines.push({ role, sizeKey, label: system.sizes[sizeKey].label, metres: mm(rows.reduce((s, c) => s + c.pieces.reduce((t, x) => t + x, 0), 0)), pieces: rows.reduce((s, c) => s + c.pieces.length, 0) });
  }
  const stockBySize = sizeKeys.map(sizeKey => {
    const size = system.sizes[sizeKey];
    const pieces = cuts.filter(c => c.sizeKey === sizeKey).flatMap(c => c.pieces);
    const plan = stockPlan(pieces, usableStock(size), usableStock(size).map(l => size.stockPrice[size.stock.indexOf(l)]));
    const cut = mm(pieces.reduce((s, x) => s + x, 0));
    // cut: the pieces' metres; metres (from the plan): the stock bought;
    // each length row names where its price was seen.
    plan.lengths = plan.lengths.map(q => ({ ...q, source: size.stockSource ? size.stockSource[size.stock.indexOf(q.length)] || '' : '' }));
    return { sizeKey, label: size.label, stockName: size.stockName, kgPerM: size.kgPerM, pieces: pieces.length, cut, kg: mm(cut * size.kgPerM), offcutKg: mm(plan.waste * size.kgPerM), ...plan };
  }).filter(r => r.pieces);
  const stock = {
    bySize: stockBySize,
    count: stockBySize.reduce((s, r) => s + r.count, 0),
    metres: mm(stockBySize.reduce((s, r) => s + r.metres, 0)),
    waste: mm(stockBySize.reduce((s, r) => s + r.waste, 0)),
    cost: mm(stockBySize.reduce((s, r) => s + r.cost, 0)),
    unplaced: stockBySize.flatMap(r => r.unplaced),
  };
  const allPieces = cuts.flatMap(c => c.pieces);
  const memberMetres = mm(allPieces.reduce((s, x) => s + x, 0));
  const legMetres = mm(cuts.filter(c => MEMBER_ROLE[c.role] === 'leg').flatMap(c => c.pieces).reduce((s, x) => s + x, 0));
  const coverMetres = system.cover ? mm(members.filter(m => m.role === 'cover').reduce((s, m) => s + norm(sub(m.b, m.a)), 0)) : 0;
  const hoopCount = body.hoops.length;
  const longestPiece = allPieces.length ? Math.max(...allPieces) : 0;
  const piecesOver = allPieces.filter(x => x > maxPiece + 1e-9);
  // Where the pieces were split, per size: at the shipping length, or at
  // the longest stock length that ships when that is shorter. The note
  // names each size when they differ.
  const splitBySize = sizeKeys.map(k => ({ sizeKey: k, label: system.sizes[k].label, at: mm(maxLenOf(system.sizes[k])), byStock: maxLenOf(system.sizes[k]) < maxPiece - 1e-9, count: cuts.filter(c => c.sizeKey === k && c.pieces.length > 1).length })).filter(r => r.count);
  const splitAt = Math.min(...sizeKeys.map(k => maxLenOf(system.sizes[k])));
  const stockClause = r => r.byStock ? ', the longest stock length that ships' : '';
  const splitNote = !splitBySize.length ? '' : splitBySize.every(r => r.at === splitBySize[0].at && r.byStock === splitBySize[0].byStock)
    ? (splitBySize[0].byStock ? `at ${splitBySize[0].at.toFixed(2)} m${stockClause(splitBySize[0])}` : `to ship at ${splitBySize[0].at.toFixed(2)} m`)
    : `to ship: ${splitBySize.map(r => `${r.label} at ${r.at.toFixed(2)} m${stockClause(r)}`).join('; ')}`;
  const unsplitOver = cuts.filter(c => c.length > maxLenOf(system.sizes[c.sizeKey]) + 1e-9).map(c => ({ role: c.role, leg: c.leg, side: c.side, length: c.length, pieces: c.pieces }));
  const stays = members.filter(m => m.role === 'stay');
  const stayMetres = mm(stays.reduce((s, m) => s + m.length, 0));
  const sandbags = members.filter(m => m.role === 'ballast').length;
  // The weight is the spider's: the pieces, not the stock bought; the
  // offcuts, the cord and the ballast are given on their own.
  const weight = {
    members: mm(stockBySize.reduce((s, r) => s + r.kg, 0)),
    offcuts: mm(stockBySize.reduce((s, r) => s + r.offcutKg, 0)),
    fittings: mm(fittingLines.reduce((s, r) => s + r.kg, 0)),
    covers: mm(coverMetres * (system.cover ? system.cover.kgPerM : 0)),
    body: mm(hoopCount * (system.body.hoop.kg || 0) + (system.body.fabric.kg || 0) + (hub.plank ? system.hub.kg || 0 : 0)),
  };
  weight.total = mm(weight.members + weight.fittings + weight.covers + weight.body);
  // The parts list in groups: pipe, fittings, covering and body, fixings and stays.
  const lines = [];
  const line = (group, item, qty, unit, cost, extra = {}) => lines.push({ group, item, qty, unit, cost: mm(cost), ...extra });
  for (const r of stockBySize) for (const q of r.lengths) if (q.count) line('pipe', `${r.stockName} ${r.label}, ${q.length.toFixed(1)} m`, q.count, q.unit, q.cost, { kg: mm(q.count * q.length * r.kgPerM), sizeKey: r.sizeKey, length: q.length });
  for (const r of fittingLines) line('fittings', r.name, r.count, r.unit, r.cost, { kg: r.kg, role: r.role });
  if (hub.plank) line('fittings', hub.plank.name, 1, hub.plank.price || 0, hub.plank.price || 0, { kg: hub.plank.kg || 0 });
  if (system.cover) line('covering and body', `${system.cover.name}, metres`, coverMetres, system.cover.pricePerM, coverMetres * system.cover.pricePerM, { kg: weight.covers });
  if (system.paintLegs) { const n = Math.ceil(legMetres / system.paintLegs.coversM); line('covering and body', system.paintLegs.name, n, system.paintLegs.price, n * system.paintLegs.price); }
  if (hoopCount) line('covering and body', system.body.hoop.name, hoopCount, system.body.hoop.price, hoopCount * system.body.hoop.price, { kg: mm(hoopCount * system.body.hoop.kg) });
  line('covering and body', system.body.fabric.name, 1, system.body.fabric.price, system.body.fabric.price, { kg: system.body.fabric.kg });
  const ex = system.extras || {};
  if (ex.screws && screws) { const n = Math.ceil(screws / ex.screws.pack); line('fixings and stays', ex.screws.name, n, ex.screws.price, n * ex.screws.price, { screws }); }
  if (ex.cement && (system.glueJoints || []).length) line('fixings and stays', ex.cement.name, 1, ex.cement.price, ex.cement.price);
  if (ex.zipTies) line('fixings and stays', ex.zipTies.name, 1, ex.zipTies.price, ex.zipTies.price);
  if (ex.tape) line('fixings and stays', ex.tape.name, 1, ex.tape.price, ex.tape.price);
  let cordRolls = 0;
  if (system.stays && stays.length) {
    cordRolls = Math.ceil(stayMetres / system.stays.roll);
    line('fixings and stays', `${system.stays.name} (${stayMetres.toFixed(1)} m of cord)`, cordRolls, system.stays.price, cordRolls * system.stays.price, { metres: stayMetres });
  }
  if (system.ballast && sandbags) {
    line('fixings and stays', system.ballast.sandbag.name, sandbags, system.ballast.sandbag.price, sandbags * system.ballast.sandbag.price);
    line('fixings and stays', system.ballast.sand.name, sandbags, system.ballast.sand.price, sandbags * system.ballast.sand.price);
  }
  const cost = { lines, total: mm(lines.reduce((s, r) => s + r.cost, 0)) };
  const bom = {
    fittings: fittingLines,
    fittingCounts,
    members: memberLines,
    memberMetres,
    legMetres,
    stock,
    cover: system.cover ? { metres: coverMetres, kg: weight.covers, cost: mm(coverMetres * system.cover.pricePerM) } : null,
    hoops: hoopCount,
    screws,
    glued: (system.glueJoints || []).slice(),
    stays: { count: stays.length, metres: stayMetres, rolls: cordRolls },
    sandbags,
    weight,
    cost,
    longestPiece: mm(longestPiece),
    piecesOver,
    unsplitOver,
    splits: splitCount,
    splitAt: mm(splitAt),
    splitByStock: splitAt < maxPiece - 1e-9, // the stock length, not the shipping length, set the splits (of the shortest size)
    splitBySize,
    splitNote, // "at 1.00 m, the longest stock length that ships", "to ship at 2.00 m" or one clause per size
    pricesSeen: PRICES_SEEN,
  };
  if (splitCount) warnings.push(`${splitCount} piece${splitCount > 1 ? 's were' : ' was'} split ${splitNote}`);
  for (const r of stockBySize) if (!r.lengths.some(q => q.length <= maxPiece + 1e-9)) warnings.push(`${r.stockName} ${r.label} comes in ${Math.min(...r.lengths.map(q => q.length)).toFixed(1)} m lengths, longer than the ${maxPiece.toFixed(2)} m to ship`);
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

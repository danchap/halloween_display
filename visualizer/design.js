// The design the page starts from, and the "default" entry of its Designs
// menu (Daniel, 2026-10-14: his saved design "v1" is the default; nothing
// else is offered on a reload). walk.html shows the same design when its
// link carries no state. The body is v1 as fitted on 2026-10-14 to the
// Numbers panel Daniel photographed. The legs were solved again on
// 2026-10-26 (out/solve-v2.html, baked by tools/bake_design.py) for the
// alley as measured, 2.85 m between the walls, with the sixteen tubes as
// cut to v1's lengths and the elbow sets as bought: every single elbow
// makes its joint's angle exactly, every pair stays inside its reach
// (2L's knee became a 45 + 45 pair), and each foot and knee stays as near
// v1's as that allows. The part system is the spider as built.
import { DEFAULT_MAX_PIECE, DEFAULT_EYES } from './build.js';

export const DEFAULT_DESIGN = Object.freeze({
  params: {
    abdomenLength: 0.608,
    abdomenWidth: 0.3952,
    abdomenHeight: 0.3952,
    headLength: 0.192,
    headWidth: 0.2608,
    headHeight: 0.2608,
    headLift: 0,
    pitch: 45,
    bodyShape: "capsule",
    along: 6.5,
    bodyHeight: 2.603,
    across: 0,
    facing: -1,
    upperDiameter: 0.048,
    lowerDiameter: 0.036,
    legs: [
      { footAlong: 2.3512, footHeight: 2.0277, kneeAlong: 1.4025, kneeHeight: 2.8211, kneeOut: 0.8184 },
      { footAlong: 1.451, footHeight: 2.9153, kneeAlong: 0.7983, kneeHeight: 3.3321, kneeOut: 0.6677 },
      { footAlong: 0.9514, footHeight: 2.4897, kneeAlong: 0.5734, kneeHeight: 2.9185, kneeOut: 0.8001 },
      { footAlong: 0.4808, footHeight: 2.3476, kneeAlong: 0.2943, kneeHeight: 3.0023, kneeOut: 0.8579 },
      { footAlong: -0.1741, footHeight: 2.1398, kneeAlong: -0.041, kneeHeight: 2.9697, kneeOut: 0.9215 },
      { footAlong: -0.609, footHeight: 2.5586, kneeAlong: -0.0672, kneeHeight: 2.9759, kneeOut: 0.8063 },
      { footAlong: -1.5354, footHeight: 2.4799, kneeAlong: -0.6692, kneeHeight: 3.1814, kneeOut: 0.7622 },
      { footAlong: -1.7732, footHeight: 3.0795, kneeAlong: -0.6522, kneeHeight: 3.1835, kneeOut: 0.7556 },
    ],
  },
  briefL: 0.8,
  backBend: 60,
  hip: 15,
  plans: null,
  system: 'alu40pvc50',
  maxPiece: DEFAULT_MAX_PIECE,
  frameOnly: false,
  eyes: DEFAULT_EYES,
  // The generated pose is solved again on the page's real walls when it is
  // loaded; a saved pose is taken as it is.
  solveOnWalls: false,
});
// A saved design with this name that matches the default is dropped from
// the menu, so the menu offers "default" alone after the design was baked
// in here. null while no saved design has been baked in.
export const BAKED_FROM = 'v1';

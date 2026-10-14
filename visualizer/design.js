// The design the page starts from, and the "default" entry of its Designs
// menu (Daniel, 2026-10-14: his saved design "v1" is the default; nothing
// else is offered on a reload). walk.html shows the same design when its
// link carries no state. The parameters are v1 as fitted on 2026-10-14 to
// the Numbers panel Daniel photographed (cut list, joint angles and post
// heights, to the millimetre and the half degree); his own link would make
// them exact.
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
      { footAlong: 2.304, footHeight: 2.0383, kneeAlong: 1.4023, kneeHeight: 2.8398, kneeOut: 0.8184 },
      { footAlong: 1.408, footHeight: 2.9078, kneeAlong: 0.8055, kneeHeight: 3.3065, kneeOut: 0.6765 },
      { footAlong: 0.9225, footHeight: 2.487, kneeAlong: 0.625, kneeHeight: 2.88, kneeOut: 0.772 },
      { footAlong: 0.4988, footHeight: 2.4135, kneeAlong: 0.4126, kneeHeight: 2.9711, kneeOut: 0.822 },
      { footAlong: -0.114, footHeight: 2.178, kneeAlong: 0.0445, kneeHeight: 2.963, kneeOut: 0.903 },
      { footAlong: -0.5281, footHeight: 2.5705, kneeAlong: -0.1095, kneeHeight: 2.9659, kneeOut: 0.7707 },
      { footAlong: -1.4535, footHeight: 2.4783, kneeAlong: -0.602, kneeHeight: 3.175, kneeOut: 0.764 },
      { footAlong: -1.703, footHeight: 3.0632, kneeAlong: -0.647, kneeHeight: 3.1393, kneeOut: 0.732 },
    ],
  },
  briefL: 0.8,
  backBend: 60,
  hip: 15,
  plans: null,
  system: 'pvc40',
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

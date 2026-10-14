// The design the page starts from, and the "default" entry of its Designs
// menu (Daniel, 2026-10-14: his saved design is the default; nothing else
// is offered on a reload). walk.html shows the same design when its link
// carries no state.
import { DEFAULTS } from './spider.js';
import { DEFAULT_MAX_PIECE, DEFAULT_EYES } from './build.js';

export const DEFAULT_DESIGN = Object.freeze({
  params: DEFAULTS,
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
  solveOnWalls: true,
});
// A saved design with this name that matches the default is dropped from
// the menu, so the menu offers "default" alone after the design was baked
// in here. null while no saved design has been baked in.
export const BAKED_FROM = null;

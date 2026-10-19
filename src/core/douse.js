// Fires under a fluid go out: water and acid put out an open flame once they stand over a
// quarter of its height (its root and where it burns low), lava leaves it burning. Only how the
// fire looks (render/flames.js): whether it is meant to burn (a lit brazier) is the game's.
import { LAVA } from './constants.js';

export const DOUSE_DEPTH = 0.25;   // of the flame's height, over its root

// does a fluid of this kind put fires out?
export const douses = fluid => !!fluid && fluid !== LAVA;

// is a flame rooted at flameY (flameH tall) under a fluid's surface at `level` (null: none)?
export const doused = (flameY, flameH, level, fluid) => level != null && douses(fluid) && level > flameY + flameH * DOUSE_DEPTH;

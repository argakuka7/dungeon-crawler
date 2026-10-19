// Dev test rooms (/testroom, game/devcommands.js; built by cubegen/testrooms.js): hand-made cubes
// for trying one thing out, outside the world's grid. Each has a cube key far off the depth's
// cubes (TEST_X, TEST_Z, a few cubes apart so none is another's neighbour), at the depth whose
// theme it is dressed in: the key still parses and has its depth, but no depth's layout has it,
// so nothing leads in or out (no portals, no faces, no fall into a cube below). They are not
// saved: neither as where the hero stands nor as visited (game/save.js). Pure; also runs in the
// world worker.
import { key, parse } from './coords.js';

export const TEST_ROOMS = Object.freeze({
  water_hill: 'a hill standing in a lake to halfway up; a shallow shelf to wade on, deep water past it',
  fluids: 'a waterfall into a lake, a lava pool and an acid pool',
  climb: 'every ladder style: up towers, and hanging from a floating platform',
});
export const TEST_ROOM_NAMES = Object.keys(TEST_ROOMS);

const TEST_X = 10000, TEST_Z = 10000, GAP = 4;
export const testRoomKey = (name, depth) => key(TEST_X + TEST_ROOM_NAMES.indexOf(name) * GAP, -depth, TEST_Z);
// the test room's name of cube key k, or null
export function testRoomOf(k) {
  if (typeof k !== 'string') return null;
  const [X, , Z] = parse(k), i = (X - TEST_X) / GAP;
  return Z === TEST_Z && Number.isInteger(i) ? TEST_ROOM_NAMES[i] ?? null : null;
}
export const isTestRoom = k => testRoomOf(k) !== null;

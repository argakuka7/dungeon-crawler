import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N } from '../src/core/constants.js';
import { flatMap } from './fixtures.js';
import { SPIDER, FIREFACE, SHRAPS, makeEnemy } from '../src/core/enemies.js';
import { nearest } from '../src/physics/enemynav.js';
import { postPath, coverPath, covered } from '../src/game/tactics.js';

const cell = (map, x, z) => map.floors[z * N + x];
const enemy = (map, x, z, profile) => makeEnemy({ f: cell(map, x, z), x: x + 0.5, y: 0, z: z + 0.5 }, profile);
const river = map => { for (let x = 0; x < N; x++) map.floors[8 * N + x].fluid = map.floors[9 * N + x].fluid = true; };
// a wall of props along z = 6, from x = 3 to x = 12
const wall = map => { for (let x = 3; x < 13; x++) map.blockers[6 * N + x].push({ shape: 'box', x0: x, x1: x + 1, z0: 6.3, z1: 6.7, bottom: 0, top: 3 }); };

test('nearest: the first floor it accepts, else the best scoring, else nothing', () => {
  const map = flatMap(), a = cell(map, 2, 2), goal = cell(map, 5, 2);
  assert.deepEqual(nearest(a, f => f === goal, 10).map(f => f.x), [2, 3, 4, 5]);
  assert.deepEqual(nearest(a, f => f === a, 10), [a]);
  assert.equal(nearest(a, () => false, 10), null);
  assert.equal(nearest(a, () => false, 3, 0.9, f => f.z).at(-1).z, 5);
});

test('a spot to fight from: a blow needs a way to the player, a throw a clear line in reach', () => {
  const map = flatMap(); river(map);
  const player = { x: 7.5, y: 0, z: 11.5 };   // across the river, two cells wide
  assert.equal(postPath(enemy(map, 7, 3, SPIDER), player, 40), null, 'a spider cannot bite across a river');
  const ff = enemy(map, 7, 3, FIREFACE), path = postPath(ff, player, 40), end = path.at(-1);
  assert.ok(end.z <= 7 && Math.hypot(end.x + 0.5 - player.x, end.z + 0.5 - player.z) < FIREFACE.reach, 'a Fire-face shoots from its bank');
  // the Shraps fights near and far: its throw reaches over the river too
  assert.ok(postPath(enemy(map, 7, 3, SHRAPS), player, 40).at(-1).z <= 7);
  // where the player stands next to its floor (on a box it cannot walk), a blow reaches them
  const box = flatMap(), top = cell(box, 7, 7);
  top.fluid = true;
  assert.ok(postPath(enemy(box, 7, 2, SPIDER), { x: 7.5, y: 0.3, z: 7.5 }, 40).at(-1).z === 6);
});

test('cover: out of sight behind a wall, else out of the weapon\'s range, else as far as it gets', () => {
  const map = flatMap(); wall(map);
  const player = { x: 7.5, y: 0, z: 2.5 }, spider = enemy(map, 7, 9, SPIDER);
  assert.equal(covered(SPIDER, player, 9)(spider.f), true, 'already behind the wall');
  assert.deepEqual(coverPath(spider, player, 9, 40), [spider.f]);
  const open = enemy(map, 1, 7, SPIDER), path = coverPath(open, player, 9, 40), end = path.at(-1);
  assert.ok(path.length > 1 && covered(SPIDER, player, 9)(end) && end.z >= 7, 'it slips behind the wall: ' + [end.x, end.z]);

  const plain = flatMap(), far = coverPath(enemy(plain, 7, 6, SPIDER), player, 6, 40).at(-1);
  assert.ok(Math.hypot(far.x + 0.5 - player.x, far.z + 0.5 - player.z) > 6, 'in the open, beyond the range');
  const most = coverPath(enemy(plain, 7, 6, SPIDER), player, 99, 40).at(-1);
  assert.ok(Math.hypot(most.x + 0.5 - player.x, most.z + 0.5 - player.z) > 13, 'out of the range nowhere: as far as it gets');
});

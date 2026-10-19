// Shared enemy tuning, in game cells / seconds. Stunder is a slow, heavy threat.
// A strike's timing / reach / effect lives on the profile; a species with several
// attacks lists them in `attacks` (`clip` names its animation, `weight` how often it
// is picked). `arc` is the minimum cosine to the target (-1: hits all around),
// `power` scales the profile's damage, `knockDown` floors the player.
// `species` names the model (and the spawn roster's entry); `parts` groups the model's
// recolourable materials by role (core/oklch.js), the first one being the role's anchor.
// Teeth, pupils and mouths stay out of `parts`, so no kind recolours them.
// hp / damage / xp / coins are level-1 values; every species grows by GROWTH per level.
// `poise`: for how long (s) after a hit staggers it a hit cannot stagger it again (0: every hit
// does), so heavy species and guardians strike back even under a stream of blows. A heavy blow
// (core/combat.js HEAVY_HIT) staggers anyway.
// `style`: how it fights between blows (game/enemyai.js). 'skirmish' backs off after a blow and
// circles at `circle` cells (sidestepping, facing the player, if it `strafe`s; else walking
// round), then darts in again; 'ranged' backs away inside keep[0] and sidesteps while its throw
// recovers; 'brute' (the default) holds its ground. `charge`: how much faster it runs the last
// few cells at a player it sees.
import { hash32, mulberry32 } from './util.js';
import { toxinOf } from './status.js';

// what every species gains per level, as a share of its level-1 value: health keeps pace with
// the weapons and levels a player finds and gains on the way down, damage with the player's
// health, and the rewards grow with both (docs/balance.md)
// learn: enemies.html#kind-code, stronger.html#curve #monsters-grow (see learn/README.md)
export const GROWTH = { hp: 0.17, damage: 0.1, xp: 0.25, coins: 0.25 };
// the level enemies have at a depth: one per depth (1 at the surface), and ±1 for a cube's
// species from depth 2 on
// learn: code.html#functions, stronger.html#monsters-grow (see learn/README.md)
export const depthLevel = depth => Math.max(1, Math.floor(depth || 0));
// guardians stand above their depth: side guardians one level, descent guardians two (on the
// road out of town, the very first ones, at the road's own level)
export const GUARDIAN_LEVELS = { side: 1, descent: 2 };
export const guardianLevel = (depth, role) => depthLevel(depth) + (depth >= 1 ? GUARDIAN_LEVELS[role] : 0);

// learn: checks.html#try-test, code.html#objects, combat.html#damage, enemies.html#numbers, space.html#distance, stronger.html#monsters-grow (see learn/README.md)
export const SPIDER = {
  type: 'spider', species: 'spider', label: 'Spider', hp: 32, damage: 15, knock: 4.5,
  xp: 20, coins: [4, 8],
  radius: 0.3, height: 0.9, bodyHeight: 0.45, mass: 1,
  aggro: 3, giveUp: 6, chase: 2.6, wander: 0.6, homeSpeed: 1.2,
  reach: 0.85, hitReach: 1.15, hitAt: 0.42, trackUntil: 0.42, attackTime: 1.07, cooldown: 1.2,
  arc: 0.5, knockDown: false, hop: 3.5, reason: 'Bitten by a spider!', ichor: ['#a6d84e', '#5f8f22'], pitch: 1.1,
  poise: 0, hitStun: 0.18, deathTime: 2, corpseTime: 3.5,
  parts: { body: ['SpiderBody'], eyes: ['SpiderEyes'] },
  style: 'skirmish', circle: 1.5, strafe: true,
  seedSalt: 0x5b1d3a, spacing: 3,
};
// learn: checks.html#try-test, combat.html#damage (see learn/README.md)
export const STUNDER = {
  type: 'stunder', species: 'stunder', label: 'Stunder', hp: 140, damage: 30, knock: 7,
  xp: 80, coins: [20, 35],
  radius: 0.48, height: 2.8, bodyHeight: 2.15, mass: 4,
  aggro: 4.5, giveUp: 8, chase: 1.05, wander: 0.45, homeSpeed: 0.65,
  reach: 1.15, hitReach: 1.55, hitAt: 16 / 30, trackUntil: 0.3, attackTime: 1.6, cooldown: 1.6,
  arc: 0.5, knockDown: true, hop: 4, reason: 'Rammed by a Stunder!', ichor: ['#d0503a', '#7a2418'], pitch: 0.8,
  poise: 1.5, hitStun: 0.25, deathTime: 2.4, corpseTime: 4,
  parts: { skin: ['StunderBody', 'StunderEarInset', 'StunderLegRidges', 'StunderMouth'], eyes: ['StunderEyes_glow'] },
  style: 'brute', charge: 1.8,
  seedSalt: 0x57a4de2, spacing: 5,
};
// Slithers in with its head raised and lunges forward and down to bite (clip frame 12).
// learn: art.html#bones (see learn/README.md)
export const SNAKE = {
  type: 'snake', species: 'snake', label: 'Grass snake', hp: 48, damage: 16, knock: 4,
  xp: 30, coins: [6, 12],
  radius: 0.3, height: 0.8, bodyHeight: 0.6, mass: 1.2,
  aggro: 3.5, giveUp: 6, chase: 2.2, wander: 0.6, homeSpeed: 1.1,
  reach: 0.95, hitReach: 1.25, hitAt: 12 / 30, trackUntil: 0.26, attackTime: 1, cooldown: 1.3,
  arc: 0.5, knockDown: false, hop: 3.5, reason: 'Bitten by a snake!', ichor: ['#b4e67e', '#4f8f2a'], pitch: 1.25,
  poise: 0, hitStun: 0.18, deathTime: 2, corpseTime: 3.5,
  parts: { skin: ['SnakeBody', 'SnakeRibs'], eyes: ['SnakeEyes_glow'] },
  style: 'skirmish', circle: 1.6, strafe: false,
  seedSalt: 0x5a4e7c1, spacing: 3,
};
// Slaps with both arms (clip frame 13), or spins on five legs and sweeps the sixth
// all around it (clip frame 19): a harder kick that knocks the player over.
const OCTO_SLAP = {
  name: 'slap', clip: 'slap', weight: 2, hitAt: 13 / 30, trackUntil: 0.3, attackTime: 1.1, hitReach: 1.35,
  arc: 0.5, power: 1, knock: 5, knockDown: false, hop: 3.5, reason: 'Slapped by an Octonaut!',
};
const OCTO_SPIN = {
  name: 'spin', clip: 'spin', weight: 1, hitAt: 19 / 30, trackUntil: 0.15, attackTime: 1.4, hitReach: 1.5,
  arc: -1, power: 1.4, knock: 7, knockDown: true, hop: 3.8, reason: 'Kicked by an Octonaut!',
};
export const OCTONAUT = {
  type: 'octonaut', species: 'octonaut', label: 'Octonaut', hp: 90, damage: 20, knock: 5,
  xp: 55, coins: [12, 22],
  radius: 0.42, height: 1.7, bodyHeight: 1.2, mass: 2.5,
  aggro: 4, giveUp: 7, chase: 1.5, wander: 0.5, homeSpeed: 0.8,
  reach: 1, ...OCTO_SLAP, cooldown: 1.4, ichor: ['#8fd0ff', '#2f6f9f'], pitch: 0.95,
  attacks: [OCTO_SLAP, OCTO_SPIN],
  poise: 0.8, hitStun: 0.22, deathTime: 2.2, corpseTime: 4,
  parts: { skin: ['OctonautBody', 'OctonautHair'], eyes: ['OctonautEyes_glow'] },
  style: 'brute',
  seedSalt: 0x0c7a9a5, spacing: 4,
};
// The fire species and the Triangle are much stronger than the rest. A ranged attack has a
// `projectile`: it is thrown from `muzzle` (model space: x, up, forward; the clip's
// extras.muzzle) at the hit frame, flies straight along the enemy's heading (pitched at
// the player) and hurts on contact. `reach` is then the distance it starts throwing from.
// `hover`: floats, its idle loop runs on time rather than on ground speed.
// Spits a fireball (clip frame 18) that sets the player on fire for half a second.
export const FIREFACE = {
  type: 'fireface', species: 'fireface', label: 'Fire-face', hp: 120, damage: 22, knock: 3, fireproof: true,
  xp: 90, coins: [24, 40],
  radius: 0.34, height: 1.4, bodyHeight: 1.25, mass: 1.5, hover: true,
  aggro: 6, giveUp: 9, chase: 1.3, wander: 0.5, homeSpeed: 0.8,
  reach: 4.5, hitReach: 0, hitAt: 18 / 30, trackUntil: 0.5, attackTime: 1.2, cooldown: 1.6,
  arc: 0.5, knockDown: false, hop: 3, reason: 'Scorched by a Fire-face!', ichor: ['#ffd25a', '#ff5a14'], pitch: 1.2,
  projectile: { kind: 'fireball', speed: 6.5, radius: 0.18, range: 7,
    muzzle: [-0.03, 0.444, 0.523], burn: { time: 0.5, damage: 6, ticks: 2 } },
  poise: 0.8, hitStun: 0.2, deathTime: 2, corpseTime: 3.5,
  parts: { flame: ['FireFaceCore_glow', 'FireFaceBall_glow', 'FireFaceFlame_glow', 'FireFaceTips_glow'], eyes: ['FireFaceEyes_glow'] },
  style: 'ranged', keep: [2.2, 4],
  seedSalt: 0xf12efa, spacing: 4,
};
// Shoots its inner triangles out like a punch (clip frame 20); a hit knocks the player over.
export const TRIANGLE = {
  type: 'triangle', species: 'triangle', label: 'Triangle', hp: 170, damage: 28, knock: 6,
  xp: 110, coins: [28, 46],
  radius: 0.42, height: 1.65, bodyHeight: 1.5, mass: 3, hover: true,
  aggro: 5.5, giveUp: 9, chase: 1.1, wander: 0.5, homeSpeed: 0.7,
  reach: 4, hitReach: 0, hitAt: 20 / 30, trackUntil: 0.55, attackTime: 1.3, cooldown: 2,
  arc: 0.5, knockDown: true, hop: 3.6, reason: 'Punched by a Triangle!', ichor: ['#d9a6ff', '#6a2cd6'], pitch: 0.9,
  projectile: { kind: 'punch', speed: 8, radius: 0.3, range: 6, spin: 14,
    muzzle: [-0.037, 0.699, 0.87] },
  poise: 1.2, hitStun: 0.22, deathTime: 2, corpseTime: 4,
  parts: { glow: ['TriangleCore_glow', 'TriangleRing_glow', 'TriangleFrame_glow', 'TriangleBrows'], eyes: ['TriangleEyes_glow'] },
  style: 'ranged', keep: [2, 3.6],
  seedSalt: 0x7a1a9e1, spacing: 5,
};
// Runs in fast, then pounces from up to `reach` away: between lunge.from and lunge.to of the
// attack it is carried forward until it is lunge.stop short of the player (at most
// lunge.max), lands and bites at clip frame 20.
export const FIRECAT = {
  type: 'firecat', species: 'firecat', label: 'Fire-cat', hp: 130, damage: 26, knock: 5, fireproof: true,
  xp: 95, coins: [22, 38],
  radius: 0.3, height: 1, bodyHeight: 0.7, mass: 1.6,
  aggro: 6, giveUp: 10, chase: 3.4, wander: 0.6, homeSpeed: 1.2,
  reach: 2.2, hitReach: 1.05, hitAt: 20 / 30, trackUntil: 0.28, attackTime: 1.2, cooldown: 1,
  arc: 0.5, knockDown: false, hop: 3.5, reason: 'Bitten by a Fire-cat!', ichor: ['#ff8a2a', '#7e1a14'], pitch: 1,
  lunge: { from: 0.3, to: 0.6, max: 1.9, stop: 0.55 },
  poise: 0.4, hitStun: 0.2, deathTime: 2, corpseTime: 3.5,
  parts: { fur: ['FireCatBody', 'FireCatStripes', 'FireCatNose'], flame: ['FireCatFlame_glow', 'FireCatFlameCore_glow'], eyes: ['FireCatEyes_glow'] },
  style: 'skirmish', circle: 2, strafe: false,
  seedSalt: 0xca7f12e, spacing: 4,
};
// Fights near and far: an attack may have its own `reach` (it is picked only from within it) and
// `minReach` (only from beyond it), and its own `projectile`. Pinches with both claws (clip
// frame 13) up close; from further off it throws an ice ball (clip frame 21) that chills the
// player: `chill.slow` scales the player's speed for `chill.time` seconds. The profile's
// `reach` is the longest of its attacks'. Between throws it keeps closing in for the claws.
// One model carries both heads (blender/shraps.py); `hide` names the materials a kind does not
// show: the plain Shraps has the ice head, the Fire shraps the fire one.
const SHRAPS_PINCH = {
  name: 'pinch', clip: 'pinch', weight: 1, reach: 1.05, hitAt: 13 / 30, trackUntil: 0.3, attackTime: 1, hitReach: 1.4,
  arc: 0.5, power: 1, knock: 4.5, knockDown: false, hop: 3.5, reason: 'Pinched by a Shraps!',
};
const SHRAPS_THROW = {
  name: 'throw', clip: 'throw', weight: 1, reach: 5, minReach: 1.8, hitAt: 21 / 30, trackUntil: 0.6, attackTime: 1.3, hitReach: 0,
  arc: 0.5, power: 0.9, knock: 3, knockDown: false, hop: 3, reason: 'Hit by an ice ball!',
  projectile: { kind: 'iceball', speed: 7, radius: 0.16, range: 7, spin: 9,
    muzzle: [0.056, 0.797, 0.937], chill: { time: 1.6, slow: 0.5 } },
};
const ICE_HEAD = ['ShrapsIce', 'ShrapsIceSpikes', 'ShrapsIceBall_glow'];
const FIRE_HEAD = ['ShrapsFireCore_glow', 'ShrapsFlame_glow', 'ShrapsFlameTips_glow', 'ShrapsFireBall_glow'];
export const SHRAPS = {
  type: 'shraps', species: 'shraps', label: 'Shraps', hp: 110, damage: 22, knock: 4.5,
  xp: 70, coins: [16, 28],
  radius: 0.4, height: 1.6, bodyHeight: 1.35, mass: 2.2,
  aggro: 5, giveUp: 8, chase: 1.6, wander: 0.5, homeSpeed: 0.8,
  ...SHRAPS_PINCH, reach: SHRAPS_THROW.reach, cooldown: 1.5, ichor: ['#c4ecff', '#4f8fbf'], pitch: 1.05,
  attacks: [SHRAPS_PINCH, SHRAPS_THROW],
  poise: 0.8, hitStun: 0.2, deathTime: 2, corpseTime: 4,
  parts: { shell: ['ShrapsShell', 'ShrapsClaw'], ice: [...ICE_HEAD], eyes: ['ShrapsEyes_glow'] },
  hide: FIRE_HEAD, style: 'brute',
  seedSalt: 0x5a7a95, spacing: 4,
};
// Rolls about on two wheels (the game spins them by the distance covered, `wheel` being their
// radius) and fights from afar with a laser. An attack's `retreat` backs it off by `dist` cells
// between `from` and `to` of the attack (eased like a lunge): before it fires it rolls
// backwards, swaying. A `beam` is a ranged attack that is not thrown: from the muzzle (the
// clip's extras.muzzle, between the eyes) it shines for `time` seconds, ending at the hit frame,
// at a point that starts on the player and follows them at `track` cells/s, and on through it
// until the level stops it (core/beams.js). Then it bursts: within `radius` of the beam the
// player is hit. Sidestepping it dodges it, and staggering the Spicy puts it out.
export const SPICY = {
  type: 'spicy', species: 'spicy', label: 'Spicy', hp: 100, damage: 26, knock: 4,
  xp: 72, coins: [16, 30],
  radius: 0.4, height: 1.35, bodyHeight: 1.05, mass: 1.6, wheel: 0.15,
  aggro: 5.5, giveUp: 9, chase: 1.9, wander: 0.6, homeSpeed: 0.9,
  reach: 4.5, hitReach: 0, hitAt: 45 / 30, trackUntil: 0.9, attackTime: 1.9, cooldown: 1.7,
  arc: 0.5, knockDown: false, hop: 3.2, reason: 'Blasted by a Spicy!', ichor: ['#c6ff5a', '#4f8f12'], pitch: 1.15,
  retreat: { from: 0.05, to: 0.75, dist: 0.7 },
  beam: { kind: 'laser', time: 0.6, track: 0.8, radius: 0.28, range: 8, color: '#7dff3a',
    muzzle: [0, 1.279, 0.06] },
  poise: 0.6, hitStun: 0.2, deathTime: 2, corpseTime: 4,
  parts: { body: ['SpicyBody', 'SpicyClaw'], glow: ['SpicyTips_glow'], wheels: ['SpicyTire', 'SpicyHub'], eyes: ['SpicyEyes_glow'] },
  style: 'ranged', keep: [2.4, 4.2],
  seedSalt: 0x5b1c7e3, spacing: 4,
};
// A body of four wavy rings of water with two eyes floating above (blender/wolla.py). The game
// spins the rings (`waves`: rad/s, render/enemies.js), so its waves keep running round it, and it
// leaves a wet trail (`trail`: the puddles' colour). It glides, its loop running on time.
// A `gust` is a ranged attack that is neither thrown nor shone: a storm cloud gathers above it
// and thunders (at the `thunder` times of the attack, s), then from the hit frame on it blows
// from its mouth (`muzzle`) for `time` seconds: a body within `range` of the mouth and inside
// the cone ahead of it (`width` either side at the mouth, widening by `spread` per cell) is hit
// once, and blown back at `push` cells/s for `pushTime` seconds on top of the blow's knock
// (core/gusts.js, game/gusts.js). Sidestepping out of the cone before it blows dodges it.
export const WOLLA = {
  type: 'wolla', species: 'wolla', label: 'Wolla', hp: 95, damage: 22, knock: 3,
  xp: 64, coins: [14, 26],
  radius: 0.38, height: 1.2, bodyHeight: 0.95, mass: 1.4, hover: true, waves: 1.1, trail: '#3d6f9c',
  aggro: 5, giveUp: 8, chase: 1.5, wander: 0.5, homeSpeed: 0.8,
  reach: 3, hitReach: 0, hitAt: 27 / 30, trackUntil: 0.5, attackTime: 1.8, cooldown: 1.9,
  arc: 0.5, knockDown: false, hop: 3, reason: 'Blown away by a Wolla!', ichor: ['#9fd8ff', '#2a6fc0'], pitch: 1,
  gust: { kind: 'storm', time: 17 / 30, range: 3.6, width: 0.35, spread: 0.36, push: 7.5, pushTime: 0.5,
    muzzle: [0, 0.584, 0.466], thunder: [13 / 30, 20 / 30] },
  poise: 0.6, hitStun: 0.2, deathTime: 2, corpseTime: 4,
  parts: { waves: ['WollaWaves', 'WollaWavesDeep'], eyes: ['WollaEyes_glow'] },
  style: 'ranged', keep: [1.5, 2.8],
  seedSalt: 0x3a77e1a, spacing: 4,
};
// A sad little cloud on long stick legs (blender/wolk.py). To strike it closes its eyes and
// lifts its arms, and its cloud darkens from light blue to storm grey (`gloom`: the colour its
// `parts` turn, render/enemies.js). Its lightning is a beam of kind 'bolt' aimed at the feet:
// from the beam's start a crackling spot under its target shows where it will strike, following
// the target at `track` cells/s until `lock` s before the strike, then holding still. At the hit
// frame a bolt jumps from the cloud's belly to the spot (core/beams.js, game/beams.js): a body
// within `radius` of it is hurt and stunned for `shock` s. The thunder follows a little later,
// the later the further away it struck (game/juice.js). Stepping off the spot once it holds
// still dodges it; a stagger puts the lightning out.
export const WOLK = {
  type: 'wolk', species: 'wolk', label: 'Wolk', hp: 85, damage: 20, knock: 2,
  xp: 60, coins: [12, 24],
  radius: 0.4, height: 1.35, bodyHeight: 1.1, mass: 1.2,
  aggro: 5.5, giveUp: 9, chase: 1.4, wander: 0.5, homeSpeed: 0.8,
  reach: 4.5, hitReach: 0, hitAt: 33 / 30, trackUntil: 0.9, attackTime: 1.7, cooldown: 2.1,
  arc: 0.5, knockDown: false, hop: 3, reason: 'Struck by a Wolk!', ichor: ['#d4ecff', '#6a9cc8'], pitch: 1,
  beam: { kind: 'bolt', aim: 'feet', time: 0.8, track: 1.4, lock: 0.35, radius: 0.3, range: 7, shock: 0.9,
    color: '#fff6b0', muzzle: [0, 0.837, 0.251] },
  gloom: { color: 'oklch(0.46 0.02 255)', parts: ['body'] },
  poise: 0.5, hitStun: 0.25, deathTime: 2, corpseTime: 4,
  parts: { body: ['WolkCloud', 'WolkCloudBelly'], limbs: ['WolkLimbs'] },
  // its guardians are no pink or amber clouds: a heavy grey rain cloud, and a shining silver one
  guardianLooks: {
    side: { colors: { body: 'oklch(0.76 0.01 250)', limbs: 'oklch(0.4 0.02 255)' },
      gloom: { color: 'oklch(0.32 0.015 255)', parts: ['body'] },
      light: '#c4ccd8', sparks: ['#c4ccd8', '#f0f3f8'], ichor: ['#c8ccd4', '#4a4f58'] },
    descent: { colors: { body: 'oklch(0.9 0.008 250)', limbs: 'oklch(0.64 0.012 250)' },
      finish: { parts: ['body', 'limbs'], roughness: 0.16, metalness: 0.5, sheen: 0.12, glints: 4 },
      gloom: { color: 'oklch(0.42 0.012 250)', parts: ['body'] },
      light: '#e6eeff', sparks: ['#ffffff', '#dfe8ff'], ichor: ['#eef2f8', '#7a808a'] },
  },
  style: 'ranged', keep: [2.6, 4.2],
  seedSalt: 0x6c1d2f5, spacing: 4,
};
// A little blue water serpent with a beak (blender/squirtle.py) that runs about under the floor
// and pokes out of it to throw water (a projectile with a tiny `push`). `burrow`: in the fight it
// stays up for `up` s (least, most), dives and moves under the floor at `speed` for `under` s, then
// comes up again, sooner where it has a shot (game/enemyai.js); `sink`: s its diving and coming up
// take. Under the floor (`under` on the enemy) nothing sees, hits or touches it (`absent`). It
// `swims`: no water drowns it.
export const SQUIRTLE = {
  type: 'squirtle', species: 'squirtle', label: 'Squirtle', hp: 42, damage: 13, knock: 1.5,
  xp: 30, coins: [6, 12],
  radius: 0.24, height: 0.8, bodyHeight: 0.65, mass: 0.8, swims: true,
  aggro: 5.5, giveUp: 9, chase: 1.6, wander: 0.5, homeSpeed: 1,
  reach: 5, hitReach: 0, hitAt: 15 / 30, trackUntil: 0.4, attackTime: 33 / 30, cooldown: 1.4,
  arc: 0.5, knockDown: false, hop: 2.5, reason: 'Splashed by a Squirtle!', ichor: ['#a8e4ff', '#3a7fd0'], pitch: 1.4,
  projectile: { kind: 'water', speed: 7.5, radius: 0.15, range: 7.5, push: 2.4, pushTime: 0.15,
    muzzle: [0, 0.392, 0.477] },
  burrow: { speed: 3.4, up: [2.4, 3.6], under: [1.4, 2.4], sink: 0.35 },
  poise: 0, hitStun: 0.2, deathTime: 1.4, corpseTime: 3,
  parts: { body: ['SquirtleBody'], belly: ['SquirtleBelly'], eyes: ['SquirtleEyes'] },
  style: 'ranged', keep: [2.4, 4.4],
  seedSalt: 0x5917e1, spacing: 3,
};
export const ENEMY_PROFILES = [SPIDER, STUNDER, SNAKE, OCTONAUT, FIREFACE, TRIANGLE, FIRECAT, SHRAPS, SPICY, WOLLA, WOLK, SQUIRTLE];

// Gusto, the first real boss (blender/gusto.py), in place of the first descent guardian
// (core/bosses.js). A round white-grey head with red eyes and jagged teeth, two long arms with
// claws and tentacles it floats on (`flail`: the game shakes them like crazy, render/enemies.js).
// game/gusto.js runs his fight, core/gusto.js holds its rules: two phases, proxies, summons.
// A `grab` catches the player at the hit frame (within hitReach, inside the arc), holds them in
// its hands along `grip` (where they are held, model space as for a muzzle, every `step` s from
// the hit frame; `hold`: how far below the grip the feet hang) and throws them down in front of
// it at `throwAt` (`throw` cells/s forward): the blow lands then, and knocks them down
// (game/grab.js). A `summon` spits minions of kind `summon.kind` from its mouth at the hit frame
// (game/gusto.js). The `vortex` is a gust (the Wolla's, core/gusts.js) blown through its hands; it
// breathes in from `inhale` on (only the look).
const GUSTO_GRAB = {
  name: 'grab', clip: 'grab', weight: 2, reach: 1.6, hitAt: 22 / 30, trackUntil: 0.6, attackTime: 66 / 30, hitReach: 1.8,
  arc: 0.35, power: 1.4, knock: 0, knockDown: true, hop: 2.5, reason: 'Thrown by Gusto!', miss: 'stuck',
  grab: { throwAt: 46 / 30, step: 2 / 30, hold: 0.55, throw: 4.5,
    grip: [[0, 0.973, 1.378], [0, 0.948, 1.378], [0, 0.923, 1.376], [0, 1.06, 1.295], [0, 1.389, 1.143], [0, 1.801, 0.969],
      [0, 2.107, 0.831], [0, 2.182, 0.796], [0, 2.182, 0.796], [0, 2.182, 0.796], [0.002, 2.18, 0.793], [0, 1.836, 0.944],
      [0, 1.018, 1.319]] },
};
const GUSTO_SUMMON = {
  name: 'summon', clip: 'summon', weight: 3, reach: 8, hitAt: 27 / 30, trackUntil: 0.6, attackTime: 48 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Gusto',
  summon: { kind: 'custotriangle', muzzle: [0.02, 1.131, 0.795] },
};
const GUSTO_VORTEX = {
  name: 'vortex', clip: 'blow', weight: 3, reach: 4.4, hitAt: 30 / 30, trackUntil: 0.85, attackTime: 63 / 30, hitReach: 0,
  arc: 0.5, power: 0.5, knock: 3, knockDown: false, hop: 3, reason: 'Blown away by Gusto!',
  gust: { kind: 'vortex', time: 18 / 30, range: 5, width: 0.45, spread: 0.4, push: 10, pushTime: 0.7,
    muzzle: [0, 1.36, 1], thunder: [], inhale: 9 / 30 },
};
// Breathing in (clip GustoInhale): from the hit frame for `pull.time` it sucks in whoever is in
// the cone before its mouth (the gust's shape, core/gusts.js inGust), with a clear line to it:
// pulled towards it at `pull.speed`, keeping only `pull.hold` of their steering away from it
// (they can still step aside), up to `pull.stop` cells from it. No harm in itself: it brings the
// player into reach of a grab, and recovers fast for one (`recover`). It only breathes in at
// a player who keeps away (game/gusto.js); it stops turning at trackUntil.
const GUSTO_INHALE = {
  name: 'inhale', clip: 'inhale', weight: 1, reach: 9, minReach: 2, hitAt: 15 / 30, trackUntil: 1.0, attackTime: 72 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Gusto', recover: 0.2,
  pull: { kind: 'inhale', time: 39 / 30, range: 9, width: 0.7, spread: 0.5, speed: 4, hold: 0.25, stop: 1.5, muzzle: [0.023, 1.164, 0.856] },
};
// A grab that caught nothing (its `miss`, game/enemyai.js): it face-plants and lies there
// (clip GustoStuck), helpless until `exposed.until`: every blow does `exposed.damage` times
// as much (core/combat.js weaponHit) and none staggers it out of this. Never started otherwise
// (no reach).
const GUSTO_STUCK = {
  name: 'stuck', clip: 'stuck', weight: 0, reach: 0, hitAt: 60 / 30, trackUntil: 0, attackTime: 60 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Gusto',
  exposed: { until: 48 / 30, damage: 1.5, thud: true, say: 'missed! Hit him while he is down' },
};
export const GUSTO = {
  type: 'gusto', species: 'gusto', label: 'Gusto', hp: 1000, damage: 24, knock: 4,
  xp: 650, coins: [120, 220],
  radius: 0.62, height: 2.3, bodyHeight: 2.1, mass: 8, hover: true, flail: 1,
  aggro: 7, giveUp: 14, chase: 1.45, wander: 0.4, homeSpeed: 0.9,
  ...GUSTO_GRAB, reach: GUSTO_SUMMON.reach, cooldown: 1.2, ichor: ['#f2f3f6', '#8a8f99'], pitch: 0.7,
  attacks: [GUSTO_GRAB, GUSTO_SUMMON, GUSTO_INHALE, GUSTO_STUCK], phase: 1,
  poise: 2, hitStun: 0.25, deathTime: 2.2, corpseTime: 5,
  parts: { body: ['GustoBody', 'GustoLimbs', 'GustoTentacles'], eyes: ['GustoEyes_glow'] },
  light: '#ff3020', sparks: ['#ff8070', '#ffffff'],
  style: 'brute', guardian: true, guardianRole: 'descent', boss: 'gusto',
  seedSalt: 0x6057a0, spacing: 6,
};
// from half his health on: the three of him blow vortexes too
export const GUSTO_SPLIT = { ...GUSTO, attacks: [GUSTO_GRAB, GUSTO_VORTEX, GUSTO_SUMMON, GUSTO_INHALE, GUSTO_STUCK], phase: 2 };

// Totnar, the second real boss (blender/totnar.py), in place of the descent guardian of depth 1
// (core/bosses.js): a tumbleweed of sticks and dry leaves with a glowing red heart, three skulls
// floating above it and two stick arms. game/totnar.js runs his fight, core/totnar.js holds its
// rules: three stages, one per skull he has left (`stage` on the enemy), each with its own attacks
// (all of them are on the one profile; the fight bars the others). The game rolls his ball by the
// distance he covers (`tumble`: its radius, render/enemies.js).
// A projectile that `becomes` a kind comes to life where it lands (game/totnar.js: the snapping
// skulls), and one with a `push` blows the player back like a gust (`pushTime` s). A `cast` does
// its boss's thing at the hit frame (the gloom: the light changes, game/totnar.js). A `roll`
// rolls it along its heading from roll.from to roll.to at roll.speed, steering towards the player
// at roll.steer rad/s, bouncing off what stops it (roll.bounces times, then it stops) and running
// over every player within roll.reach of its body once (game/enemyai.js); while it rolls
// (`steady`) no blow staggers it. A beam with `sky` strikes from that high above its aim, and
// `bolts` of them strike at once: one at the player, the others `spread` cells round them.
const TOTNAR_THROW = {
  name: 'throw', clip: 'throw', weight: 3, reach: 7.5, hitAt: 24 / 30, trackUntil: 0.7, attackTime: 42 / 30, hitReach: 0,
  arc: 0.5, power: 0.7, knock: 4, knockDown: false, hop: 3, reason: 'Hit by a flying skull!',
  projectile: { kind: 'skull', speed: 7.5, radius: 0.22, range: 9, tumble: 11, push: 7, pushTime: 0.45, becomes: 'snapskull', converge: true,
    muzzle: [-0.473, 1.053, 1.401] },
};
const TOTNAR_GLOOM = {
  name: 'gloom', clip: 'gloom', weight: 1, reach: 30, hitAt: 27 / 30, trackUntil: 0.5, attackTime: 51 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Totnar', cast: 'gloom',
};
const TOTNAR_SPIDERS = {
  name: 'spiders', clip: 'summon', weight: 3, reach: 9, hitAt: 27 / 30, trackUntil: 0.6, attackTime: 48 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Totnar',
  summon: { kind: 'totspider', muzzle: [-0.046, 0.609, 0.547] },
};
const TOTNAR_STUNDERS = { ...TOTNAR_SPIDERS, name: 'stunders', summon: { ...TOTNAR_SPIDERS.summon, kind: 'totstunder' } };
const TOTNAR_ROLL = {
  name: 'roll', clip: 'roll', weight: 3, reach: 8, minReach: 1.6, hitAt: 24 / 30, trackUntil: 24 / 30, attackTime: 105 / 30, hitReach: 0,
  arc: 0.5, power: 1.3, knock: 7, knockDown: true, hop: 3.8, reason: 'Run over by Totnar!',
  roll: { from: 24 / 30, to: 78 / 30, speed: 7, steer: 0.8, bounces: 2, reach: 0.2 }, steady: { from: 24 / 30, to: 78 / 30 },
};
const TOTNAR_STORM = {
  name: 'storm', clip: 'storm', weight: 3, reach: 9, hitAt: 42 / 30, trackUntil: 0.4, attackTime: 57 / 30, hitReach: 0,
  arc: 0.5, power: 0.9, knock: 2, knockDown: false, hop: 3, reason: 'Struck by Totnar\'s lightning!',
  beam: { kind: 'bolt', aim: 'feet', time: 1, track: 1.5, lock: 0.35, radius: 0.35, range: 14, shock: 0.8, color: '#ffe9a0',
    muzzle: [0.015, 2.537, -0.153], sky: 7, bolts: 3, spread: [1.4, 2.4] },
};
export const TOTNAR = {
  type: 'totnar', species: 'totnar', label: 'Totnar', hp: 1000, damage: 24, knock: 4,
  xp: 650, coins: [140, 240],
  radius: 0.78, height: 2.45, bodyHeight: 1.75, mass: 9, hover: true, tumble: 0.8,
  aggro: 7, giveUp: 14, chase: 1.3, wander: 0.4, homeSpeed: 0.9,
  ...TOTNAR_THROW, cooldown: 1.1, ichor: ['#b08a58', '#4a3018'], pitch: 0.75,
  attacks: [TOTNAR_THROW, TOTNAR_GLOOM, TOTNAR_SPIDERS, TOTNAR_ROLL, TOTNAR_STORM, TOTNAR_STUNDERS],
  poise: 2, hitStun: 0.25, deathTime: 2.2, corpseTime: 5,
  parts: { sticks: ['TotnarSticks', 'TotnarBark'], leaves: ['TotnarLeaves'], bone: ['TotnarBone'], heart: ['TotnarHeart_glow'],
    eyes: ['TotnarEyes_glow'] },
  // what goes with each skull he loses (render/enemies.js): at stage 2 the right one and the outer
  // shell of sticks, at stage 3 the left one and the middle shell: his heart shows more and more
  shed: { 2: ['skull2', 'shell0'], 3: ['skull0', 'shell1'] },
  litter: ['#8a6440', '#7d8a3c', '#5a3e26'],   // leaves and twigs falling off as he rolls
  light: '#ff4018', sparks: ['#ffb070', '#ff5a20'],
  style: 'brute', guardian: true, guardianRole: 'descent', boss: 'totnar',
  seedSalt: 0x7a7a12, spacing: 6,
};

// Squarlo, the third real boss (blender/squarlo.py), in place of the descent guardian of depth 2
// (core/bosses.js): tiny (smaller than the player), teal and boxy, with a floppy cap, three dots
// for a face and cupped hands; super fast. He fights in his tidal hills (cubegen/arenashapes.js),
// game/squarlo.js runs his fight, core/squarlo.js holds its rules. He `swims` (nothing drowns
// him, physics/fluid.js; in deep water he floats, game/tide.js).
// Phase 1: he blows a jet of water out of his hands (a gust of kind 'jet', like Gusto's vortex: it
// hurts and knocks back) and summons Squirtles; the tide (a `cast`: while he casts nothing hurts
// him, `ward`) floods the flats, and only the hills stay dry. Every few attacks, and after
// every tide, he has to sit and catch his breath (`rest`, `exposed`: blows hurt more).
// Phase 2 (at half his health, SQUARLO_GIANT): he grows into a giant six cells tall and stomps
// (a beam of kind 'stomp' out of the sky: his foot's shadow follows the player and stops, then the
// foot comes down there; it stays planted a moment, `exposed`). The tide and the Squirtles stay.
// An `exposed` attack's `from` (s) is when the exposure starts (default: at once); `say` is what
// every game says then (game/gusts.js), `thud` crashes him down with a thump and dust.
const SQUARLO_BLOW = {
  name: 'blow', clip: 'blow', weight: 3, reach: 4.2, hitAt: 24 / 30, trackUntil: 0.65, attackTime: 48 / 30, hitReach: 0,
  arc: 0.5, power: 0.85, knock: 3, knockDown: false, hop: 3, reason: 'Soaked by Squarlo!',
  gust: { kind: 'jet', time: 15 / 30, range: 4.6, width: 0.28, spread: 0.26, push: 9, pushTime: 0.55,
    muzzle: [0.005, 0.379, 0.257], thunder: [], inhale: 8 / 30 },
};
const SQUARLO_TIDE = {
  name: 'tide', clip: 'cast', weight: 1, reach: 40, hitAt: 60 / 30, trackUntil: 0.4, attackTime: 72 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Squarlo', cast: 'tide', ward: true,
};
const SQUARLO_SUMMON = {
  name: 'summon', clip: 'summon', weight: 2, reach: 9, hitAt: 24 / 30, trackUntil: 0.5, attackTime: 42 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Squarlo',
  summon: { kind: 'tidesquirtle', muzzle: [0, 0.172, 0.175] },
};
const SQUARLO_REST = {
  name: 'rest', clip: 'rest', weight: 0, reach: 40, hitAt: 6 / 30, trackUntil: 0, attackTime: 66 / 30, hitReach: 0,
  arc: -1, power: 0, knock: 0, knockDown: false, hop: 0, reason: 'Squarlo', cast: 'rest', recover: 0.3,
  exposed: { from: 0.2, until: 58 / 30, damage: 1.3, say: 'is out of breath! Hit him now' },
};
const SQUARLO_STOMP = {
  name: 'stomp', clip: 'stomp', weight: 3, reach: 5, hitAt: 57 / 30, trackUntil: 1.2, attackTime: 96 / 30, hitReach: 0,
  arc: -1, power: 1.5, knock: 6, knockDown: true, hop: 4, reason: 'Stomped flat by Squarlo!',
  beam: { kind: 'stomp', aim: 'feet', time: 1.5, track: 2.6, lock: 0.45, radius: 1, range: 14, sky: 7, clear: false,
    muzzle: [-0.064, 0, 0.112] },
  exposed: { from: 57 / 30, until: 87 / 30, damage: 1.4, say: 'is stuck! Hit his foot' },
};
export const SQUARLO = {
  type: 'squarlo', species: 'squarlo', label: 'Squarlo', hp: 1000, damage: 24, knock: 3,
  xp: 650, coins: [150, 260],
  radius: 0.24, height: 0.7, bodyHeight: 0.6, mass: 3, swims: true,
  aggro: 7, giveUp: 14, chase: 4.2, wander: 1, homeSpeed: 2,
  ...SQUARLO_BLOW, cooldown: 0.9, ichor: ['#a8f0ff', '#2a8fb0'], pitch: 1.5,
  attacks: [SQUARLO_BLOW, SQUARLO_TIDE, SQUARLO_SUMMON, SQUARLO_REST], phase: 1,
  poise: 2, hitStun: 0.2, deathTime: 2.4, corpseTime: 5,
  parts: { body: ['SquarloBody', 'SquarloCap'], eyes: ['SquarloEyes_glow'] },
  light: '#7fe8ff', sparks: ['#e0fbff', '#7fe8ff'],
  style: 'skirmish', circle: 2.6, strafe: true, guardian: true, guardianRole: 'descent', boss: 'squarlo',
  seedSalt: 0x5a1a20, spacing: 6,
};
export const BOSS_PROFILES = [GUSTO, TOTNAR, SQUARLO];
// what a ranged attack sends out: its projectile, its beam or its gust (null for a blow)
export const shotOf = a => a.projectile ?? a.beam ?? a.gust ?? null;

// Enemy kinds: a species' base profile with its own name, colours and strength, drawn with
// the species' model.
//   colors: role (or material name) -> recolour op, see recolorFn in core/oklch.js
//   light / sparks / ichor: the glow light, the ember and trail colours, the blood
//   toxin: its bites poison ({ time, ticks, share }: share of the bite's damage, core/status.js)
//   fireproof: fire does not hurt it (a fire flask, core/status.js; the fiery species are)
//   mods: multiply the base. hp and damage (their growth per level follows), speed (chase,
//     wander, homing), size (model, body and melee reach), xp (xp and coins; √(hp × damage)
//     unless given, so a kind pays for its toughness without inflating XP per cube much)
// Anything else replaces the base value. A kind keeps its species' seedSalt, so where an
// enemy stands, its level and its id do not depend on which kind it drew.
const times = (v, k) => Math.round(v * k);
// `attacks` (a list like the base's) replaces the species' attacks before they are sized: a kind
// that throws something else, say.
// learn: enemies.html#kinds (see learn/README.md)
export function enemyKind(base, { mods = {}, attacks = base.attacks, ...spec }) {
  const { hp = 1, damage = 1, speed = 1, size = 1 } = mods, xp = mods.xp ?? Math.sqrt(hp * damage);
  const reach = a => a.hitReach * size;
  const thrown = p => ({ ...p, muzzle: p.muzzle.map(v => v * size) });
  // a melee attack's own reach grows with the body; a throw's (or a beam's) stays
  const sized = a => ({ ...a, hitReach: reach(a), ...(a.reach !== undefined && !shotOf(a) && { reach: a.reach * size }),
    ...(a.projectile && { projectile: thrown(a.projectile) }), ...(a.beam && { beam: thrown(a.beam) }),
    ...(a.gust && { gust: thrown(a.gust) }) });
  const list = attacks && attacks.map(sized);
  const own = list?.some(a => a.reach !== undefined);
  return {
    ...base,
    hp: times(base.hp, hp), damage: times(base.damage, damage),
    xp: times(base.xp, xp), coins: base.coins.map(c => times(c, xp)),
    chase: base.chase * speed, wander: base.wander * speed, homeSpeed: base.homeSpeed * speed,
    size: (base.size ?? 1) * size, radius: base.radius * size, height: base.height * size, bodyHeight: base.bodyHeight * size,
    reach: own ? Math.max(...list.map(a => a.reach ?? 0)) : shotOf(base) ? base.reach : base.reach * size, hitReach: reach(base),
    ...(list && { attacks: list }),
    ...(base.projectile && { projectile: thrown(base.projectile) }),
    ...(base.beam && { beam: thrown(base.beam) }),
    ...(base.gust && { gust: thrown(base.gust) }),
    ...(base.wheel && { wheel: base.wheel * size }),
    ...spec,
  };
}
// Three snakes in rising strength: green, ochre, red.
export const SAND_VIPER = enemyKind(SNAKE, {
  type: 'sandviper', label: 'Sand viper', reason: 'Bitten by a Sand viper!',
  colors: { skin: 'oklch(0.80 0.12 82)', eyes: 'oklch(0.62 0.22 28)' }, ichor: ['#d9c46a', '#8a6a22'],
  mods: { hp: 1.25, damage: 1.2, speed: 1.1 },
});
// learn: enemies.html#kind-code #kinds (see learn/README.md)
export const BLOOD_VIPER = enemyKind(SNAKE, {
  type: 'bloodviper', label: 'Blood viper', reason: 'Bitten by a Blood viper!',
  colors: { skin: 'oklch(0.60 0.19 27)', eyes: 'oklch(0.93 0.18 100)' }, ichor: ['#e0503a', '#6a1410'],
  mods: { hp: 1.4, damage: 1.4, speed: 1.2, size: 1.1 },
});
// Three more for the themes: a slow, tough one in the ice, a venomous one in the swamp and a
// near-black one, the strongest, in the ruins and the volcanic depths.
export const FROST_ADDER = enemyKind(SNAKE, {
  type: 'frostadder', label: 'Frost adder', reason: 'Bitten by a Frost adder!',
  colors: { skin: 'oklch(0.88 0.04 225)', eyes: 'oklch(0.72 0.15 250)' }, ichor: ['#c4ecff', '#4f8fbf'],
  mods: { hp: 1.35, damage: 1.1, speed: 0.95 },
});
export const VENOM_ADDER = enemyKind(SNAKE, {
  type: 'venomadder', label: 'Venom adder', reason: 'Bitten by a Venom adder!', toxin: { time: 5, ticks: 5, share: 0.7 },
  colors: { skin: 'oklch(0.58 0.15 310)', eyes: 'oklch(0.90 0.21 125)' }, ichor: ['#c6ff5a', '#5a8f12'],
  mods: { hp: 1.2, damage: 1.35, speed: 1.1 },
});
export const SHADOW_MAMBA = enemyKind(SNAKE, {
  type: 'shadowmamba', label: 'Shadow mamba', reason: 'Bitten by a Shadow mamba!',
  colors: { skin: 'oklch(0.34 0.025 280)', eyes: 'oklch(0.80 0.18 55)' }, ichor: ['#9a6ad8', '#2a1648'],
  mods: { hp: 1.6, damage: 1.6, speed: 1.3, size: 1.15 },
});
export const FROST_SPIDER = enemyKind(SPIDER, {
  type: 'frostspider', label: 'Frost spider',
  colors: { body: 'oklch(0.82 0.035 235)', eyes: 'oklch(0.85 0.13 210)' }, ichor: ['#c4ecff', '#4f8fbf'],
  mods: { hp: 1.35, damage: 1.1, speed: 0.9 },
});
export const BOG_SPIDER = enemyKind(SPIDER, {
  type: 'bogspider', label: 'Bog spider', toxin: { time: 4, ticks: 4, share: 0.5 },
  colors: { body: 'oklch(0.40 0.06 135)', eyes: 'oklch(0.90 0.18 105)' },
  mods: { hp: 1.15, damage: 1.25, speed: 1.05 },
});
export const REDBACK = enemyKind(SPIDER, {
  type: 'redback', label: 'Redback', reason: 'Bitten by a Redback!', toxin: { time: 5, ticks: 5, share: 0.6 },
  colors: { body: 'oklch(0.34 0.11 25)', eyes: 'oklch(0.78 0.17 55)' }, ichor: ['#d8442e', '#5a1008'],
  mods: { hp: 1.3, damage: 1.4, speed: 1.2, size: 1.1 },
});
export const FROST_STUNDER = enemyKind(STUNDER, {
  type: 'froststunder', label: 'Frost stunder', reason: 'Rammed by a Frost stunder!',
  colors: { skin: 'oklch(0.80 0.04 235)', eyes: 'oklch(0.85 0.13 210)' }, ichor: ['#c4ecff', '#4f8fbf'],
  mods: { hp: 1.25, speed: 0.9 },
});
export const STONE_STUNDER = enemyKind(STUNDER, {
  type: 'stonestunder', label: 'Stone stunder', reason: 'Rammed by a Stone stunder!',
  colors: { skin: 'oklch(0.55 0.03 70)', eyes: 'oklch(0.82 0.16 85)' }, ichor: ['#b8a890', '#5a4a3a'],
  mods: { hp: 1.6, damage: 1.15, speed: 0.85, size: 1.12 },
});
export const MAGMA_STUNDER = enemyKind(STUNDER, {
  type: 'magmastunder', label: 'Magma stunder', reason: 'Rammed by a Magma stunder!', fireproof: true,
  colors: { skin: 'oklch(0.30 0.09 27)', eyes: 'oklch(0.84 0.17 75)' }, ichor: ['#ffb030', '#a02a10'],
  mods: { hp: 1.35, damage: 1.4, speed: 1.15 },
});
export const BOG_OCTONAUT = enemyKind(OCTONAUT, {
  type: 'bogoctonaut', label: 'Bog octonaut',
  colors: { skin: 'oklch(0.74 0.10 130)', eyes: 'oklch(0.90 0.18 105)' }, ichor: ['#b4e67e', '#4f8f2a'],
  mods: { hp: 1.2, damage: 1.15 },
});
export const CORAL_OCTONAUT = enemyKind(OCTONAUT, {
  type: 'coraloctonaut', label: 'Coral octonaut',
  colors: { skin: 'oklch(0.74 0.13 30)', eyes: 'oklch(0.80 0.14 190)' }, ichor: ['#ff9a7a', '#a0402a'],
  mods: { hp: 1.3, damage: 1.35, speed: 1.2 },
});
export const EMERALD_TRIANGLE = enemyKind(TRIANGLE, {
  type: 'emeraldtriangle', label: 'Emerald triangle', reason: 'Punched by an Emerald triangle!',
  colors: { glow: 'oklch(0.80 0.20 155)', eyes: 'oklch(0.96 0.06 150)' }, light: '#40e890', sparks: ['#c8ffd8', '#40d080'],
  ichor: ['#a8ffc8', '#1e9a5a'], mods: { hp: 1.25, damage: 1.1 },
});
export const CRIMSON_TRIANGLE = enemyKind(TRIANGLE, {
  type: 'crimsontriangle', label: 'Crimson triangle', reason: 'Punched by a Crimson triangle!',
  colors: { glow: 'oklch(0.64 0.22 25)', eyes: 'oklch(0.95 0.05 60)' }, light: '#ff4836', sparks: ['#ffc0b0', '#ff4836'],
  ichor: ['#ffa08a', '#a01a10'], mods: { hp: 1.35, damage: 1.35 }, cooldown: TRIANGLE.cooldown * 0.8,
});
// The Shraps of the volcanic depths: red, with a head of fire instead of ice, and it throws
// fireballs (the Fire-face's, burn included) instead of ice balls. `fx` picks its glow in
// render/enemies.js: a light, flickering flame tongues and embers.
export const FIRE_SHRAPS = enemyKind(SHRAPS, {
  type: 'fireshraps', label: 'Fire shraps', reason: 'Pinched by a Fire shraps!', fireproof: true,
  colors: { shell: 'oklch(0.56 0.17 32)', eyes: 'oklch(0.95 0.12 95)' }, hide: ICE_HEAD, fx: 'fireshraps',
  attacks: [{ ...SHRAPS_PINCH, reason: 'Pinched by a Fire shraps!' }, { ...SHRAPS_THROW, reason: 'Scorched by a Fire shraps!',
    projectile: { ...FIREFACE.projectile, speed: 6.5, range: 7, muzzle: SHRAPS_THROW.projectile.muzzle } }],
  ichor: ['#ffb030', '#a02a10'], pitch: 0.9, mods: { hp: 1.45, damage: 1.4, speed: 1.1 },
});
// The Wollas: blue, then green in the swamp, purple in the mines and the ruins, orange in the
// volcanic depths, each stronger than the one before. Their eyes take the opposite colour.
export const BOG_WOLLA = enemyKind(WOLLA, {
  type: 'bogwolla', label: 'Bog wolla', reason: 'Blown away by a Bog wolla!',
  colors: { waves: 'oklch(0.70 0.17 145)', eyes: 'oklch(0.78 0.17 350)' }, ichor: ['#b4f08a', '#3f8f2a'], trail: '#4f7a34',
  mods: { hp: 1.2, damage: 1.15 },
});
export const STORM_WOLLA = enemyKind(WOLLA, {
  type: 'stormwolla', label: 'Storm wolla', reason: 'Blown away by a Storm wolla!',
  colors: { waves: 'oklch(0.56 0.20 300)', eyes: 'oklch(0.92 0.18 110)' }, ichor: ['#d6a8ff', '#5a2ca0'], trail: '#5a3f86',
  mods: { hp: 1.3, damage: 1.3, speed: 1.1, size: 1.08 },
});
export const EMBER_WOLLA = enemyKind(WOLLA, {
  type: 'emberwolla', label: 'Ember wolla', reason: 'Blown away by an Ember wolla!', fireproof: true,
  colors: { waves: 'oklch(0.72 0.17 52)', eyes: 'oklch(0.86 0.12 205)' }, ichor: ['#ffc07a', '#a0480f'], trail: '#7a4a24',
  mods: { hp: 1.45, damage: 1.4, speed: 1.1, size: 1.12 },
});
// The Squirtles of the sunken grotto and the cenote: coral red, tougher and quicker.
export const CORAL_SQUIRTLE = enemyKind(SQUIRTLE, {
  type: 'coralsquirtle', label: 'Coral squirtle', reason: 'Splashed by a Coral squirtle!',
  colors: { body: 'oklch(0.68 0.15 32)', belly: 'oklch(0.9 0.06 70)' }, ichor: ['#ffc0a8', '#b0402a'],
  mods: { hp: 1.5, damage: 1.4, speed: 1.1 },
});
// from half his health on: a giant, six cells tall (the model at `size`), who stomps; he walks
// over the hills on the floors like any enemy, but keeps clear of the bank (game/squarlo.js)
export const SQUARLO_GIANT = enemyKind(SQUARLO, {
  type: 'squarlogiant', label: 'Squarlo', mods: { size: 6 / 0.68 },
  attacks: [SQUARLO_STOMP, SQUARLO_TIDE, SQUARLO_SUMMON, SQUARLO_REST],
  radius: 0.9, height: 6, bodyHeight: 5.55, mass: 45, chase: 1.5, wander: 0.8, homeSpeed: 1.2, cooldown: 1.2,
  style: 'brute', giant: true, phase: 2, gait: 'stride',
});
// a boss's profile for each of its stages (game/squarlo.js; a friend's game swaps it by the stage
// the runner sends, net/foes.js)
export const STAGE_PROFILES = { squarlo: [SQUARLO, SQUARLO_GIANT] };
// One full attack and recovery, averaged over a species' attacks (s), and what it deals per
// second at level 1 (a projectile's burn included): how dangerous it is to stand next to.
export function attackCycle(profile) {
  const list = profile.attacks ?? [profile], w = list.reduce((n, a) => n + (a.weight ?? 1), 0);
  return list.reduce((n, a) => n + a.attackTime * (a.weight ?? 1), 0) / w + profile.cooldown;
}
export function attackDamage(profile) {
  const list = profile.attacks ?? [profile], w = list.reduce((n, a) => n + (a.weight ?? 1), 0);
  return list.reduce((n, a) => n + (Math.round(profile.damage * (a.power ?? 1)) + (a.projectile?.burn?.damage ?? 0)) * (a.weight ?? 1), 0) / w;
}
export const threat = profile => attackDamage(profile) / attackCycle(profile);

// Guardians are distinct kinds for every species, never part of the ordinary roster. A tier
// sets level-1 floors, so the species it promotes matters for how it fights, not for how
// strong it is: HP at least `hp` (or `hpMult` × the species'), damage per second at least
// `threat` (or `damageMult` × the species' blows), a fixed XP reward and a longer poise.
// Side guardians are a mid-route fight; descent guardians (the boss placeholders) are the
// depth's big one: tougher, deadlier, and they recover from staggers more slowly still.
// learn: enemies.html#guardians (see learn/README.md)
export const GUARDIAN_TIERS = {
  side: { hp: 550, hpMult: 3.5, threat: 9, damageMult: 1.15, xp: 260, poise: 1.4 },
  descent: { hp: 1000, hpMult: 6.5, threat: 11.5, damageMult: 1.45, xp: 650, poise: 2 },
};
const guardianMods = (base, t) => ({
  hp: Math.max(t.hp / base.hp, t.hpMult),
  damage: Math.max(t.damageMult, t.threat / threat(base)),
  xp: t.xp / base.xp,
});
// Hot pink (hue 350) is reserved for side guardians, amber for descent guardians; eyes remain
// pale for contrast. A species may dress its guardians otherwise (`guardianLooks.side` /
// `.descent`: colours, glow, `finish` and the like, in place of these): the Wolk's are grey and
// silver.
export const GUARDIAN_KINDS = Object.fromEntries(ENEMY_PROFILES.map(base => [base.species, enemyKind(base, {
  type: 'guardian' + base.type, label: 'Guardian ' + base.label.toLowerCase(), guardian: true, guardianRole: 'side', bossPlaceholder: false,
  colors: Object.fromEntries(Object.keys(base.parts).map(role => [role,
    role === 'eyes' ? 'oklch(0.97 0.025 350)' : 'oklch(0.70 0.25 350)'])),
  light: '#ff3fa8', sparks: ['#ff3fa8', '#ffd0ee'], ichor: ['#ff3fa8', '#9b165d'],
  poise: Math.max(base.poise, GUARDIAN_TIERS.side.poise), mods: guardianMods(base, GUARDIAN_TIERS.side),
  ...base.guardianLooks?.side,
})]));
// Explicit future-boss hook: a separate kind, not a level-dependent recolouring.
export const DESCENT_GUARDIAN_KINDS = Object.fromEntries(ENEMY_PROFILES.map(base => [base.species, enemyKind(base, {
  type: 'descentGuardian' + base.type, label: 'Descent guardian ' + base.label.toLowerCase(),
  guardian: true, guardianRole: 'descent', bossPlaceholder: true,
  colors: Object.fromEntries(Object.keys(base.parts).map(role => [role,
    role === 'eyes' ? 'oklch(0.97 0.025 65)' : 'oklch(0.78 0.19 65)'])),
  light: '#ff9b35', sparks: ['#ff9b35', '#fff0cc'], ichor: ['#ff9b35', '#9b4b16'],
  poise: Math.max(base.poise, GUARDIAN_TIERS.descent.poise), mods: guardianMods(base, GUARDIAN_TIERS.descent),
  ...base.guardianLooks?.descent,
})]));
// Gusto's minions (game/gusto.js summons them): half a Triangle, light blue and much faster,
// whose punches do not knock the player over. Never in a roster (`minion`); a little XP, no
// coins and no weapons, now and then a minor health potion (`drops`, core/gear/drops.js).
export const CUSTO_TRIANGLE = enemyKind(TRIANGLE, {
  type: 'custotriangle', label: 'Custo triangle', reason: 'Punched by a Custo triangle!', minion: true,
  colors: { glow: 'oklch(0.84 0.11 225)', eyes: 'oklch(0.97 0.03 220)' }, light: '#7fd0ff', sparks: ['#e0f6ff', '#7fd0ff'],
  ichor: ['#c4ecff', '#4f8fbf'], aggro: 9, giveUp: 14, knockDown: false, cooldown: 1.6, poise: 0, coins: [0, 0],
  projectile: { ...TRIANGLE.projectile, speed: 9.5, radius: 0.2, muzzle: TRIANGLE.projectile.muzzle.map(v => v * 0.5) },
  drops: { weapons: false, potion: 0.08, potions: ['item_potion_health_minor'] },
  mods: { hp: 0.17, damage: 0.25, speed: 1.9, size: 0.5, xp: 0.1 },
});
// Totnar's minions (game/totnar.js): never in a roster, a little XP, no coins, no weapons, now and
// then a minor health potion. They turn up (and go) in a puff of dust and leaves (`puff`,
// render/enemies.js).
const MINION_DROPS = chance => ({ weapons: false, potion: chance, potions: ['item_potion_health_minor'] });
const LEAF_PUFF = { colors: ['#b8a07a', '#8a6440', '#9aa456'], size: 0.5 };
// The snapping skull: a skull he throws, come to life where it lands (blender/totnar.py, its own
// model). It hops after the player and bites, and after `lifetime` s it crumbles (game/totnar.js).
export const SNAP_SKULL = {
  type: 'snapskull', species: 'snapskull', label: 'Snapping skull', hp: 18, damage: 11, knock: 3,
  xp: 6, coins: [0, 0], minion: true, lifetime: 7,
  radius: 0.24, height: 0.55, bodyHeight: 0.45, mass: 0.5,
  aggro: 9, giveUp: 14, chase: 2.6, wander: 0.6, homeSpeed: 1.2,
  reach: 1.5, hitReach: 0.85, hitAt: 12 / 30, trackUntil: 0.3, attackTime: 0.8, cooldown: 0.9,
  arc: 0.5, knockDown: false, hop: 3, reason: 'Bitten by a snapping skull!', ichor: ['#efe6cf', '#8a8070'], pitch: 1.35,
  lunge: { from: 0.12, to: 0.38, max: 1.1, stop: 0.45 },
  poise: 0, hitStun: 0.2, deathTime: 1, corpseTime: 2,
  parts: { bone: ['SnapBone'], eyes: ['SnapEyes_glow'] },
  light: '#ff5a1e', puff: { colors: ['#efe6cf', '#d8cdb0', '#a89a80'], size: 0.45 },
  drops: MINION_DROPS(0.03),
  style: 'brute', charge: 1.3,
  seedSalt: 0x5ca115, spacing: 2,
};
// the species that are only ever a boss's minions (each its own model)
export const MINION_PROFILES = [SNAP_SKULL];
// Squarlo's Squirtles: teal, weaker, and they go for the player at once
const SPLASH_PUFF = { colors: ['#e8fbff', '#9fe0f0', '#6ac2d8'], size: 0.5 };
export const TIDE_SQUIRTLE = enemyKind(SQUIRTLE, {
  type: 'tidesquirtle', label: 'Tide squirtle', reason: 'Splashed by a tide squirtle!', minion: true,
  colors: { body: 'oklch(0.68 0.11 188)', belly: 'oklch(0.9 0.05 190)' }, ichor: ['#b8f4ff', '#2a9fa8'],
  aggro: 10, giveUp: 14, coins: [0, 0], drops: MINION_DROPS(0.05), puff: SPLASH_PUFF,
  mods: { hp: 0.7, damage: 0.6, xp: 0.15 },
});
// small spiders of twigs, poured out of his ball by the dozen
export const TOT_SPIDER = enemyKind(SPIDER, {
  type: 'totspider', label: 'Twig spider', reason: 'Bitten by a twig spider!', minion: true,
  colors: { body: 'oklch(0.46 0.06 62)', eyes: 'oklch(0.68 0.21 35)' }, ichor: ['#b08a58', '#4a3018'],
  aggro: 9, giveUp: 14, coins: [0, 0], drops: MINION_DROPS(0.02), puff: LEAF_PUFF,
  mods: { hp: 0.4, damage: 0.45, speed: 1.2, size: 0.55, xp: 0.12 },
});
// and, at the last, Stunders of brambles: smaller, weaker, and their rams do not knock you over
export const TOT_STUNDER = enemyKind(STUNDER, {
  type: 'totstunder', label: 'Bramble stunder', reason: 'Rammed by a bramble stunder!', minion: true, knockDown: false,
  colors: { skin: 'oklch(0.44 0.05 55)', eyes: 'oklch(0.7 0.2 35)' }, ichor: ['#b08a58', '#4a3018'],
  aggro: 9, giveUp: 14, coins: [0, 0], drops: MINION_DROPS(0.12), puff: { ...LEAF_PUFF, size: 0.8 },
  mods: { hp: 0.55, damage: 0.55, speed: 1.1, size: 0.72, xp: 0.12 },
});
export const ENEMY_KINDS = Object.fromEntries([...ENEMY_PROFILES, ...Object.values(GUARDIAN_KINDS), ...Object.values(DESCENT_GUARDIAN_KINDS), SAND_VIPER, BLOOD_VIPER, FROST_ADDER, VENOM_ADDER, SHADOW_MAMBA, FROST_SPIDER, BOG_SPIDER,
  REDBACK, FROST_STUNDER, STONE_STUNDER, MAGMA_STUNDER, BOG_OCTONAUT, CORAL_OCTONAUT, EMERALD_TRIANGLE, CRIMSON_TRIANGLE, FIRE_SHRAPS,
  BOG_WOLLA, STORM_WOLLA, EMBER_WOLLA, CORAL_SQUIRTLE, ...BOSS_PROFILES, CUSTO_TRIANGLE, SNAP_SKULL, TOT_SPIDER, TOT_STUNDER,
  TIDE_SQUIRTLE].map(k => [k.type, k]));
// gone: not here for now (Gusto between his vanishing and his coming back, game/gusto.js), or
// under the floor (a burrowing Squirtle, game/enemyai.js): it cannot be seen, hit or touched,
// like the dead
export const absent = e => e.mode === 'dead' || e.mode === 'gone' || !!e.under;

// the attack e is performing (or about to perform): one of profile.attacks, else the profile
export const attackOf = e => e.profile.attacks?.[e.attack] ?? e.profile;
// how much more blows hurt e now: lying helpless after a missed grab (an attack's `exposed`), else 1
export function exposedBy(e) {
  const x = e.mode === 'attack' ? attackOf(e).exposed : null;
  return x && e.t >= (x.from ?? 0) && e.t < x.until ? x.damage : 1;
}
// is e warded now (Squarlo casting the tide: an attack's `ward`): nothing hurts it
export const wardedNow = e => e.mode === 'attack' && !!attackOf(e).ward;
// is e in the `steady` part of an attack now (Totnar rolling): blows hurt it but do not stagger it
export function steadyNow(e) {
  const s = e.mode === 'attack' ? attackOf(e).steady : null;
  return !!s && e.t >= s.from && e.t < s.to;
}
// the index of an attack, picked by weight among `allowed` (indices; default: all of them)
export function pickAttack(profile, r = Math.random(), allowed = null) {
  const list = profile.attacks;
  if (!list) return 0;
  const from = allowed ?? list.map((_, i) => i);
  let w = r * from.reduce((n, i) => n + list[i].weight, 0);
  for (const i of from) if ((w -= list[i].weight) < 0) return i;
  return from[from.length - 1];
}
// does the profile throw or shine anything (with any of its attacks)?
export const isRanged = profile => !!(shotOf(profile) || profile.attacks?.some(shotOf));
// which attacks (indices; [0] for a species with one) can start against a target d away
// across the floor and dy above or below: within the attack's reach (else the profile's) and
// beyond its minReach; a throw (or a beam) allows more height, a blow enough for the next step
// of a stair or a ramp, a cast any. A clear line for throws is the caller's.
export function attacksInReach(profile, d, dy) {
  const list = profile.attacks ?? [profile], out = [];
  list.forEach((a, i) => {
    if (d < (a.reach ?? profile.reach) && d >= (a.minReach ?? 0) && dy < (a.cast ? Infinity : shotOf(a) ? 1.5 : 0.75)) out.push(i);
  });
  return out;
}

// how far a retreat has backed the enemy off by attack time t
export const retreatAt = (retreat, t) => lungeAt(retreat, t) * retreat.dist;
// when an attack's shot leaves: a beam shines for its time up to the hit frame
export const fireAt = a => a.beam ? a.hitAt - a.beam.time : a.hitAt;
// how far a pouncing attack carries the enemy towards a target d away
export const lungeDistance = (lunge, d) => Math.max(0, Math.min(lunge.max, d - lunge.stop));
// the share of the lunge covered at attack time t (eased in and out)
export function lungeAt(lunge, t) {
  const u = Math.min(1, Math.max(0, (t - lunge.from) / (lunge.to - lunge.from)));
  return u * u * (3 - 2 * u);
}

// what a strike (or a projectile) does to the player; a gust's blow also pushes (`push`), a
// bolt's stuns (`shock`, s)
export function blowOf(profile, a = profile) {
  const damage = Math.round(profile.damage * (a.power ?? 1));
  return { damage, knock: a.knock ?? profile.knock,
    knockDown: !!a.knockDown, hop: a.hop, reason: a.reason, burn: a.projectile?.burn ?? a.burn ?? null,
    chill: a.projectile?.chill ?? a.chill ?? null, toxin: toxinOf(a.toxin ?? profile.toxin, damage),
    ...(a.gust && { push: { speed: a.gust.push, time: a.gust.pushTime } }),
    ...(a.projectile?.push && { push: { speed: a.projectile.push, time: a.projectile.pushTime } }),
    ...(a.beam?.shock && { shock: a.beam.shock }) };
}

// a level-1 value grown to `level`
// learn: stronger.html#monsters-grow (see learn/README.md)
export const grown = (value, rate, level) => value * (1 + rate * (level - 1));
// learn: stronger.html#race (see learn/README.md)
export function enemyProfile(profile, level) {
  if (!Number.isSafeInteger(level) || level < 1) throw new RangeError('Invalid enemy level');
  return { ...profile, hp: Math.round(grown(profile.hp, GROWTH.hp, level)),
    damage: Math.round(grown(profile.damage, GROWTH.damage, level)), xp: Math.round(grown(profile.xp, GROWTH.xp, level)) };
}
// the copper a kind drops at a level: [least, most]
export const coinRange = (profile, level) => profile.coins.map(c => Math.round(grown(c, GROWTH.coins, level)));
// learn: memory.html#names (see learn/README.md)
export function enemyRoll(map, profile, floorId) {
  const R = mulberry32(hash32(map.seed ^ profile.seedSalt ^ Math.imul(floorId, 7919) ^ 0x1007));
  const depth = Math.max(0, map.depth || 0), r = R();
  const level = Math.max(1, depthLevel(depth) + (depth >= 2 ? r < .25 ? -1 : r >= .75 ? 1 : 0 : 0));
  const [lo, hi] = coinRange(profile, level);
  return { id: `${map.key ?? map.seed}:${profile.species}:${floorId}`, level, coinDrop: lo + Math.floor(R() * (hi - lo + 1)) };
}
export function makeEnemy(spot, profile, i = 0) {
  profile = enemyProfile(profile, spot.level || 1);
  return {
    ...spot, level: spot.level || 1, profile, type: profile.type, hp: profile.hp, home: spot.f,
    mode: 'idle', t: 1 + i * 0.7, think: i * 0.05, speed: 0,
    path: null, lost: 0, cool: 0, attacks: 0, attack: 0, bit: false, leap: 0,
    deadT: 0, hurtT: 0, stun: 0, poised: 0, staggered: false, phase: (i * 0.37) % 1,
  };
}

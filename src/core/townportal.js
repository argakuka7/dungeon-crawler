// Town portal rules (no rendering, no game state). The run keeps at most one open portal:
//   run.townPortal = { key, depth, pad: {x, y, z}, back: {x, y, z} }
// `pad` is the dungeon end (cube-local), `back` where you stood when you cast it. The town end
// stands on the spot the town plan reserves for it (map.town.portal, world/town.js).
// learn: code.html#text (see learn/README.md)
export const CAST_TIME = 5;              // s standing still to open it
// learn: code.html#text (see learn/README.md)
export const TOWN_PORTAL_CHARGE = 1;     // s standing in it to go through
export const PAD_RADIUS = 0.62;          // drawn size; you step in within TRIGGER_RADIUS
const TRIGGER_RADIUS = 0.42;

// Where the pad may go around the caster: offsets [dx, dz] from them, best first. The pad's
// drawn disc must lie on free, flat ground (game/townportal.js padSpot), so a 1.5 x 1.5 cell
// spot holds it. It may sit right beside the caster, just far enough that they are not
// standing in it (minPadDistance, with the body's radius `bodyR`); it likes to be PAD_DISTANCE
// ahead (yaw: the caster's facing, +z at 0) and takes nearer, farther or behind when it must.
export const PAD_DISTANCE = 1.6, MAX_PAD_DISTANCE = 2.7;
const GRID = 0.125;   // cells between the spots tried
export const minPadDistance = bodyR => TRIGGER_RADIUS + bodyR + 0.06;
export function padOffsets(yaw, bodyR) {
  const min = minPadDistance(bodyR), n = Math.ceil(MAX_PAD_DISTANCE / GRID), out = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const dx = i * GRID, dz = j * GRID, r = Math.hypot(dx, dz);
    if (r < min || r > MAX_PAD_DISTANCE) continue;
    const a = Math.atan2(dx, dz) - yaw, turn = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));   // 0 ahead .. PI behind
    out.push({ dx, dz, score: Math.abs(r - PAD_DISTANCE) + 0.6 * turn });
  }
  return out.sort((a, b) => a.score - b.score).map(({ dx, dz }) => [dx, dz]);
}

// the end of the open portal in this map (null: none here)
export function townPadIn(map, run) {
  const tp = run?.townPortal;
  if (!tp || !map) return null;
  if (map.town) return map.town.portal;
  return map.key === tp.key ? tp.pad : null;
}

// standing in it on purpose, as with wells and rings (not stunned, knocked or running through)
// learn: space.html#distance (see learn/README.md)
export const onPad = (p, pad) => Math.abs(p.y - pad.y) <= 0.6 && Math.hypot(p.x - pad.x, p.z - pad.z) < TRIGGER_RADIUS
  && p.grounded && p.stun <= 0 && Math.hypot(p.vx, p.vz) < 4.4;

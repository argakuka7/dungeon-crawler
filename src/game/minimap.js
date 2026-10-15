// Overview of the cubes visited at the current depth, centred on the current cube. Cubes are
// coloured by their WFC tile; edges show rivers (blue) and portals (gold: leads somewhere new,
// cyan: explored); triangles are wells / rings; a violet dot is the open town portal. Inside a
// house it shows the cube outside, with the house's door marked. Playing together, a dot in
// each friend's colour is where they are (src/net/session.js redraws them as they move).
import { KIND_COLOR } from '../world/tiles.js';
import { key, parse, step } from '../world/coords.js';
import { state } from './state.js';
import { isFaceOpen } from '../core/boundaries.js';
import { gateLocked, portalLocked } from '../core/guardians.js';
import { N } from '../core/constants.js';
import { TOWN_KEY, isInterior } from '../world/town.js';
import { online, playerColor } from '../net/online.js';

const R = 3, CELL = 24, PAD = 6, SIZE = (2 * R + 1) * CELL + PAD * 2;
const canvas = Object.assign(document.createElement('canvas'), { id: 'minimap', width: SIZE, height: SIZE + 42 });
document.body.appendChild(canvas);
const g = canvas.getContext('2d');

// a point on edge d of the cell at (px, pz), t in [0,1] along it
const edgePt = (px, pz, d, t) => [[px + CELL, pz + t * CELL], [px, pz + t * CELL], [px + t * CELL, pz + CELL], [px + t * CELL, pz]][d];

function tri(x, y, up, color) {
  g.fillStyle = color; g.beginPath();
  g.moveTo(x - 4, y + (up ? 3 : -3)); g.lineTo(x + 4, y + (up ? 3 : -3)); g.lineTo(x, y + (up ? -4 : 4)); g.fill();
}

// a friend's place on this map: [x, z] in pixels, or null (another depth, in a house, far away)
function spot(b, X0, Y, Z0) {
  const [bx, by, bz] = isInterior(b.cube) ? [NaN, NaN, NaN] : parse(b.cube);
  if (by !== Y || Math.abs(bx - X0) > R || Math.abs(bz - Z0) > R) return null;
  return [PAD + (bx - X0 + R) * CELL + b.x / N * CELL, PAD + (bz - Z0 + R) * CELL + b.z / N * CELL];
}
// where a friend is when not on this map
function whereabouts(b, Y) {
  const by = isInterior(b.cube) ? NaN : parse(b.cube)[1];
  return isInterior(b.cube) ? 'in a house' : by === Y ? 'far away' : `depth ${-by}`;
}

export function drawMinimap() {
  const inside = state.map?.interior, W = state.cubes, [X0, Y, Z0] = parse(inside ? inside.outside : state.cubeKey);
  const visited = k => !!W.cubes.get(k)?.visits;
  const tp = state.run.townPortal, friends = online.buddies.filter(b => b.cube), away = friends.filter(b => !spot(b, X0, Y, Z0));
  // a line of text under the map each: the depth, the town portal, each friend off the map
  const height = SIZE + 14 * (1 + !!tp + away.length);
  if (canvas.height !== height) canvas.height = height;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#0b0d1266'; g.fillRect(0, 0, canvas.width, canvas.height);
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const k = key(X0 + dx, Y, Z0 + dz), c = W.cubes.get(k);
    if (!c?.visits) continue;
    const t = c.info;
    const px = PAD + (dx + R) * CELL, pz = PAD + (dz + R) * CELL;
    g.fillStyle = KIND_COLOR[t.kind]; g.fillRect(px + 1, pz + 1, CELL - 2, CELL - 2);
    for (let d = 0; d < 4; d++) {
      const f = t.faces[d];
      if (f?.river) { const [x, y] = edgePt(px, pz, d, (f.river.pos + f.river.w / 2) / 16); g.fillStyle = '#2e86de'; g.fillRect(x - 2, y - 2, 4, 4); }
      if (isFaceOpen(state.openedFaces, k, d)) {
        const [x, y] = edgePt(px, pz, d, 0.5);
        g.fillStyle = '#70d6aa';
        if (d < 2) g.fillRect(x - 1, y - CELL / 2 + 3, 2, CELL - 6);
        else g.fillRect(x - CELL / 2 + 3, y - 1, CELL - 6, 2);
      } else if (f?.portal) {
        const [x, y] = edgePt(px, pz, d, (f.portal.pos + 0.5) / 16);
        g.fillStyle = portalLocked(c.map, state.run, { dir: d }) ? '#ff3547' : visited(step(k, d)) ? '#5fd3ff' : '#ffc94a';
        g.fillRect(x - 3, y - 3, 6, 6);
      }
    }
    for (const d of [4, 5]) if (t.faces[d]?.portal)
      tri(px + CELL / 2 + (d === 4 ? -5 : 5), pz + CELL / 2, d === 5, d === 4 && gateLocked(c.map, state.run) ? '#ff3547' : visited(step(k, d)) ? '#5fd3ff' : '#ffc94a');
  }
  // the open town portal: a violet dot where it stands (in town too, at its other end)
  for (const [k, pad] of tp ? [[tp.key, tp.pad], [TOWN_KEY, W.cubes.get(TOWN_KEY)?.map.town?.portal]] : []) {
    const [x, y, z] = parse(k);
    if (!pad || y !== Y || Math.abs(x - X0) > R || Math.abs(z - Z0) > R) continue;
    g.fillStyle = '#b98cff'; g.beginPath();
    g.arc(PAD + (x - X0 + R) * CELL + pad.x / N * CELL, PAD + (z - Z0 + R) * CELL + pad.z / N * CELL, 3.5, 0, Math.PI * 2); g.fill();
  }
  const c = PAD + R * CELL;
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(c, c, CELL, CELL);
  const door = inside && W.cubes.get(inside.outside)?.map.doors?.find(d => d.building === inside.building);
  if (door) { g.fillStyle = '#fff'; g.fillRect(c + door.x / N * CELL - 2, c + door.z / N * CELL - 2, 4, 4); }
  g.fillStyle = '#aab3c2'; g.font = '11px ui-monospace, monospace';
  const count = [...W.cubes.values()].filter(c => c.visits && !isInterior(c.key)).length;
  g.fillText(`depth ${-Y}   ${count} cubes visited${inside ? '   (inside)' : ''}`, PAD, SIZE + 10);
  if (tp) { g.fillStyle = '#c9a8ff'; g.fillText(`portal open: depth ${tp.depth}`, PAD, SIZE + 24); }
  // the friends: a dot in their cube, or a line saying where they are when not on this map
  for (const b of friends) {
    const at = spot(b, X0, Y, Z0);
    if (!at) continue;
    g.fillStyle = playerColor(b.slot); g.strokeStyle = '#0b0d12'; g.lineWidth = 1.5; g.beginPath();
    g.arc(at[0], at[1], 4, 0, Math.PI * 2);
    g.fill(); g.stroke();
  }
  away.forEach((b, i) => {
    g.fillStyle = playerColor(b.slot);
    g.fillText(`${b.name}: ${whereabouts(b, Y)} (F: go)`, PAD, SIZE + 24 + 14 * (i + !!tp));
  });
}

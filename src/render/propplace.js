// Deterministic ambient placement, independent of the terrain RNG. Destination arrangements
// are emitted by the worker; ambient blockers stay away from routes and reservations.
import { N, LH, BASE, DIRS, EDGE_CORNERS, FLUID_NAME } from '../core/constants.js';
import { mulberry32, hash32, idx, inb } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { props, signatureProp, CLUTTER } from '../core/propcatalog.js';

// the prop sets ambient props come from in a theme
const ambientSets = theme => [theme.props, 'any', ...(theme.cave ? ['relics'] : [])];

// the prop sets a cube shows (render/props.js loads them before the cube is entered)
export function propSetsOf(m, theme) {
  const sets = new Set(), of = q => { const p = props.byName.get(q.name); if (p) sets.add(p.set); };
  if (m.authoredProps) { m.authoredProps.forEach(of); return [...sets]; }
  if (theme.props) ambientSets(theme).forEach(s => sets.add(s));
  [...(m.sitePlacements || []), ...(m.arenaPlacements || [])].forEach(of);
  return [...sets];
}

function picker(theme, R) {
  const lists = new Map();
  return (attach, allow = () => true) => {
    if (!lists.has(attach)) lists.set(attach, ambientSets(theme)
      .flatMap(set => props.sets.get(set + '/' + attach) || [])
      .filter(p => !signatureProp(p) && (theme.cave || !p.base.startsWith('stala'))));
    const c = lists.get(attach).filter(allow);
    const weight = p => (p.priority === 1 ? 3 : 1) * (p.blocking ? 0.6 : 1)
      * (p.set === 'any' ? 0.5 : p.set === 'relics' ? 0.12 : 1);
    let r = R() * c.reduce((sum, p) => sum + weight(p), 0);
    return c.find(p => (r -= weight(p)) < 0) || null;
  };
}

export function placeProps(m, theme) {
  const out = [...(m.sitePlacements || []), ...(m.arenaPlacements || [])], blockers = Array.from({ length: N * N }, () => []);
  if (m.authoredProps) return { out: m.authoredProps, blockers };
  if (!theme.props) return { out, blockers };
  const R = mulberry32(hash32(m.seed ^ 0x9a0b5)), pick = picker(theme, R);
  const walkCols = new Set((m.moves || []).flatMap(mv => [mv.from.c, mv.to.c, ...mv.cells]));
  for (const r of m.runs || []) for (const c of [...r.cells, r.from.c, r.to.c]) walkCols.add(c);
  const reservations = new Set([...(m.siteReservations || []).map(q => q.c + ':' + q.layer),
    ...m.floors.filter(f => f.hordeReserved).map(f => f.c + ':' + f.layer)]);
  const reserved = f => reservations.has(f.c + ':' + f.layer);
  // Enemy navigation treats a blocked column conservatively across all layers.
  const hordeColumns = new Set(m.floors.filter(f => f.hordeReserved).map(f => f.c));
  const nearHorde = f => [[0, 0], ...DIRS].some(([dx, dz]) => inb(f.x + dx, f.z + dz)
    && hordeColumns.has(idx(f.x + dx, f.z + dz)));
  const nearSite = f => [[0, 0], ...DIRS].some(([dx, dz]) => inb(f.x + dx, f.z + dz)
    && reservations.has(idx(f.x + dx, f.z + dz) + ':' + f.layer));
  const nearRoute = f => [[0, 0], ...DIRS].some(([dx, dz]) => inb(f.x + dx, f.z + dz) && walkCols.has(idx(f.x + dx, f.z + dz)));
  const nearPortal = f => m.portals.some(p => Math.abs(p.x - f.x) <= 2 && Math.abs(p.z - f.z) <= 2);
  const fits = (p, y, s, lo, hi) => y + p.minY * s >= lo && y + p.maxY * s + 0.1 <= hi;
  const add = (p, x, y, z, yaw, s, normal) => out.push({ name: p.name, x, y, z, yaw, s,
    tint: p.set === 'any' ? theme.side[1][1] : null, ...(normal ? { normal } : {}) });
  // a mostly empty set piece (cubegen/setpieces.js): a few things here and there, nothing in the way
  const sparse = m.sparse ? 0.25 : 1;
  const shoreOf = f => DIRS.some(([dx, dz]) => inb(f.x + dx, f.z + dz)
    && m.cols[idx(f.x + dx, f.z + dz)].some(g => g.fluid && Math.abs(g.surf - f.top) <= 3));

  for (const f of m.floors) {
    if (f.arenaCell) continue;   // guardian arena: dressed with its terrain (cubegen/arenaprops.js)
    const col = m.cols[f.c], above = col[col.indexOf(f) + 1];
    const pieces = m.pieces[f.c], top = Math.max(...f.cs), ceiling = above ? above.bottom * LH : Infinity;
    const slope = top - Math.min(...f.cs), s = 0.85 + R() * 0.3;
    const dry = !f.fluid && !f.covered && !pieces.length;
    const focal = reserved(f);

    // Ordinary objects retain the sparse one-prop draw. Shore items are never inland.
    if (dry && !f.prot && !focal && R() < (theme.propDensity ?? 0.32) * CLUTTER * sparse) {
      const blockOK = !m.sparse && !nearRoute(f) && !nearPortal(f) && !nearSite(f) && !nearHorde(f) && slope < 0.25;
      const p = pick('ground', p => !p.cover && (!p.shore || shoreOf(f)) && (blockOK || !p.blocking));
      if (p) {
        const room = Math.max(0, 0.9 - 2 * p.radius * s), fx = 0.5 + (R() - 0.5) * room, fz = 0.5 + (R() - 0.5) * room;
        const y = floorY(f, fx, fz) - 0.02;
        if (y + p.maxY * s + 0.2 < ceiling) {
          add(p, f.x + fx, y, f.z + fz, R() * Math.PI * 2, s);
          if (p.blocking) blockers[f.c].push({ x: f.x + fx, z: f.z + fz, r: p.radius * s * 0.8, bottom: y, top: y + p.height * s });
        }
      }
    }

    // Ground cover can dress routes and slopes, but not structure decks or focal footprints.
    if (dry && (!focal || f.hordeReserved) && R() < (f.hordeReserved ? .12 : .55) * CLUTTER * (m.sparse ? 0.4 : 1))
      for (let n = f.hordeReserved ? 1 : 1 + Math.floor(R() * 2); n > 0; n--) {
      const p = pick('ground', p => p.cover && !p.blocking);
      if (!p) break;
      const cs = 0.7 + R() * 0.3, room = Math.max(0, 0.9 - 2 * p.radius * cs);
      const fx = 0.5 + (R() - 0.5) * room, fz = 0.5 + (R() - 0.5) * room;
      const y = floorY(f, fx, fz) + 0.008, e = 0.01;
      const dx = (floorY(f, fx + e, fz) - floorY(f, fx - e, fz)) / (2 * e);
      const dz = (floorY(f, fx, fz + e) - floorY(f, fx, fz - e)) / (2 * e);
      if (top + p.maxY * cs + 0.2 < ceiling) add(p, f.x + fx, y, f.z + fz, R() * Math.PI * 2, cs, [-dx, 1, -dz]);
    }

    if (f.fluid && !pieces.length && !focal && R() < 0.12 * CLUTTER) {
      const p = pick('water', p => !p.blocking && p.fluid === FLUID_NAME[f.fluid]);
      if (p && f.surf * LH + p.maxY * s + 0.2 < ceiling)
        add(p, f.x + 0.5, f.surf * LH, f.z + 0.5, R() * Math.PI * 2, s);
    }

    // No ceiling props: undersides of slabs are never visible from the camera.
    // Hanging decoration is limited to lip props draped over visible ledges.

    if (f.fluid || focal || nearPortal(f)) continue;
    for (let d = 0; d < 4; d++) {
      const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
      if (!inb(nx, nz) || f.link[d]) continue;
      const [a, b] = EDGE_CORNERS[d], edgeTop = Math.min(f.cs[a], f.cs[b]);
      const other = m.cols[idx(nx, nz)];
      if (other.some(g => g.bottom * LH < edgeTop + 0.1
        && (g.fluid ? g.surf * LH : Math.max(...g.cs)) >= edgeTop - 0.1)) continue;
      const low = Math.max(-BASE, ...other.filter(g => g.top * LH < edgeTop - 0.1)
        .map(g => g.fluid ? g.surf * LH : Math.max(...g.cs)));
      const t = 0.3 + R() * 0.4, [ex, ez] = [[1, t], [0, t], [t, 1], [t, 0]][d];
      const yaw = Math.atan2(-DIRS[d][0], -DIRS[d][1]);
      if (R() < 0.15 * CLUTTER) {
        const p = pick('lip', p => !p.blocking && p.drop * s + 0.2 < edgeTop - low);
        if (p && edgeTop + p.maxY * s + 0.1 < ceiling)
          add(p, f.x + ex, edgeTop, f.z + ez, yaw, s);
      }
      const wallLow = Math.max(low, f.bottom * LH);
      if (edgeTop - wallLow < 1.2 || R() > 0.12 * CLUTTER) continue;
      const p = pick('wall', p => !p.blocking);
      if (p) {
        const y = wallLow + (edgeTop - wallLow) * 0.5;
        if (fits(p, y, s, wallLow, edgeTop)) add(p, f.x + ex, y, f.z + ez, yaw, s);
      }
    }
  }
  return { out, blockers };
}

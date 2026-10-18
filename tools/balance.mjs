// Balance simulation: plays runs through the real tables (layouts, rosters, enemy levels, XP,
// drops, chests, combat stats) and prints, for every depth, where the player stands on arrival
// and how the fights there go. docs/balance.md explains the targets.
//   node tools/balance.mjs [seeds, default 8] [kill share, default 0.6]
// The player kills `kill share` of every ordinary cube on the route, all of a guardian arena,
// and visits half of the branch cubes (killing the same share and opening their chests). It
// equips the best weapon by damage per second. Numbers are averages over the seeds.
globalThis.location = { search: '' };
const { makeLayouts } = await import('../src/world/layout.js');
const { enemyFreeAt } = await import('../src/world/town.js');
const { population } = await import('../src/core/spawns.js');
const { swarmKind } = await import('../src/core/hordes.js');
const { ENEMY_KINDS, GUARDIAN_KINDS, DESCENT_GUARDIAN_KINDS, enemyProfile, enemyRoll, guardianLevel, threat, attackDamage, depthLevel } =
  await import('../src/core/enemies.js');
const { enemyDrops } = await import('../src/core/gear/drops.js');
const { chestLoot } = await import('../src/core/chests.js');
const { weaponDps } = await import('../src/core/gear/stats.js');
const P = await import('../src/core/progression.js');
const { combatStats, swordState, favoredKind } = await import('../src/core/combat.js');
const { addInstance, equipItem, takeItem, equippedItem } = await import('../src/core/inventory.js');
const { mulberry32, hash32 } = await import('../src/core/util.js');

const SEEDS = Number(process.argv[2] || 8), SHARE = Number(process.argv[3] || 0.6);

const pick = (kinds, r) => {
  const list = Object.entries(kinds);
  let w = r * list.reduce((n, [, k]) => n + k, 0);
  for (const [t, k] of list) if ((w -= k) < 0) return ENEMY_KINDS[t];
  return ENEMY_KINDS[list.at(-1)[0]];
};
const dps = p => { const s = combatStats(p); return s ? weaponDps(s) : 0; };

const rows = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const R = mulberry32(hash32(seed * 7919)), layouts = makeLayouts(seed);
  const p = { ...P.createPlayerStats(), x: 0, y: 0, z: 0, yaw: 0, stun: 0, sword: swordState() }, run = P.createRun();
  let serial = 0, potions = 0, copper = 0, row = null;
  const offer = (item, from) => {   // keep a weapon when it beats the one in hand
    const before = dps(p), id = addInstance(p.inventory, item), was = p.inventory.equipped;
    if (!id) return;
    equipItem(p.inventory, id);
    if (dps(p) > before) { takeItem(p.inventory, was); row.upgrades[from]++; }
    else { equipItem(p.inventory, was); takeItem(p.inventory, id); }
  };
  const take = (items, from) => { for (const i of items) if (i.gen) offer(i, from); else potions += i.count; };
  const kill = (kind, level, extra = {}) => {
    const e = { id: `s${seed}:${serial++}`, level, kind, mode: 'dead', hp: 0, profile: enemyProfile(kind, level), coinDrop: 0, ...extra };
    const before = p.xp;
    P.awardKill(p, run, e);
    row.xpShare += (p.xp - before) / e.profile.xp; row.kills++;
    take(enemyDrops(e, seed, favoredKind(p)), extra.guardian ? 'guardian' : 'enemy');
  };
  for (let depth = 0; depth <= 20; depth++) {
    const L = layouts(depth), s = combatStats(p);
    row = rows[depth] ??= { depth, n: 0, level: 0, hp: 0, hit: 0, dps: 0, interval: 0, kills: 0, xp: 0, xpShare: 0, potions: 0, chests: 0,
      upgrades: { enemy: 0, guardian: 0, chest: 0 }, weapons: new Map(), kinds: new Map(), guards: { side: [], descent: [] } };
    row.n++; row.level += p.level; row.hp += p.maxHp; row.hit += s.damage; row.dps += dps(p); row.interval += s.interval;
    const w = equippedItem(p.inventory), wl = `${w.gen.rarity} ${w.itemId.replace('weapon_', '').replace('_', ' ')} i${w.gen.ilvl}`;
    row.weapons.set(wl, (row.weapons.get(wl) || 0) + 1);
    const xp0 = p.xp, potions0 = potions;
    const cubes = [...L.route.map(k => ({ k, share: L.guardians.has(k) ? 1 : SHARE })),
      ...[...L.exists].filter(k => !L.route.includes(k)).map(k => ({ k, share: R() < 0.5 ? SHARE : 0 }))];
    for (const { k, share } of cubes) {
      if (enemyFreeAt(k) || !share) continue;
      const g = L.guardians.get(k), map = { seed: hash32(seed * 31 + serial * 977), depth, key: k, guardian: g ?? null, horde: L.hordes.get(k), populationScale: L.populationScale.get(k) ?? 1 };
      // a real boss (core/bosses.js) stands alone: it is the guardian, below
      if (!g?.boss) for (const [, spec] of population(map)) for (let i = 0; i < spec.count; i++) {
        const base = pick(spec.kinds, R()), kind = spec.swarm ? swarmKind(base, spec.rewardScale) : base;
        const level = enemyRoll(map, kind, i * 13 + 1).level;
        const k2 = row.kinds.get(kind.type) ?? { kind, level: 0, n: 0 };
        k2.level += level; k2.n++; row.kinds.set(kind.type, k2);
        if (R() < share) kill(kind, level);
      }
      if (g) {
        const species = [...population(map).keys()], chosen = species[Math.floor(R() * species.length)];
        const kind = g.boss ? ENEMY_KINDS[g.boss] : (g.role === 'descent' ? DESCENT_GUARDIAN_KINDS : GUARDIAN_KINDS)[chosen];
        const level = guardianLevel(depth, g.role), prof = enemyProfile(kind, level), hit = combatStats(p).damage;
        const ttk = prof.hp / dps(p);
        row.guards[g.role].push({ type: chosen, level, hp: prof.hp, ttk, php: p.maxHp,
          blows: p.maxHp / attackDamage(prof), brawl: threat(prof) * ttk / p.maxHp, hits: prof.hp / hit });
        kill(kind, level, { guardian: true, guardianRole: g.role });
      }
      for (const site of L.sitePlans.get(k) || []) { const c = chestLoot(site, depth, seed, favoredKind(p)); take(c.items, 'chest'); copper += c.copper; row.chests++; }
    }
    row.xp += p.xp - xp0; row.potions += potions - potions0;
  }
}

const f = (n, d = 0) => n.toFixed(d);
console.log(`${SEEDS} seeds, ${SHARE * 100}% of each ordinary cube killed. On arrival at each depth:\n`);
console.log('depth elvl plvl maxHP  hit   int   DPS  kills  XP got  xp%  potions chests  upgrades e/g/c  weapon (most common)');
for (const r of rows) {
  const w = [...r.weapons].sort((a, b) => b[1] - a[1])[0][0], n = r.n;
  console.log(`${String(r.depth).padStart(5)} ${String(depthLevel(r.depth)).padStart(4)} ${f(r.level / n, 1).padStart(4)} ${f(r.hp / n).padStart(5)} ${f(r.hit / n).padStart(4)} ${f(r.interval / n, 2).padStart(5)} ${f(r.dps / n).padStart(5)} ${f(r.kills / n).padStart(6)} ${f(r.xp / n).padStart(7)} ${f(r.xpShare / r.kills * 100).padStart(4)} ${f(r.potions / n, 1).padStart(8)} ${f(r.chests / n, 1).padStart(6)}  ${[r.upgrades.enemy, r.upgrades.guardian, r.upgrades.chest].map(x => f(x / n, 1)).join('/').padStart(14)}  ${w}`);
}
console.log('\nOrdinary kinds on arrival: level, the hits it takes, the blows it needs to kill the player');
for (const r of rows) {
  const n = r.n, hit = r.hit / n, hp = r.hp / n;
  const parts = [...r.kinds.values()].sort((a, b) => b.n - a.n).slice(0, 8).map(({ kind, level, n }) => {
    const lv = Math.round(level / n), prof = enemyProfile(kind, lv);
    return `${kind.type} L${lv} ${Math.ceil(prof.hp / hit)}/${f(hp / attackDamage(prof), 1)}`;
  });
  console.log(`d${r.depth}: ${parts.join(', ')}`);
}
console.log('\nGuardians: level, HP, hits to kill, seconds at full DPS, their blows to kill the player, a toe-to-toe brawl (their damage over that time / max HP)');
for (const r of rows) for (const role of ['side', 'descent']) {
  const g = r.guards[role];
  if (!g.length) continue;
  const avg = k => g.reduce((n, x) => n + x[k], 0) / g.length, max = k => Math.max(...g.map(x => x[k]));
  console.log(`d${String(r.depth).padEnd(2)} ${role.padEnd(7)} L${f(avg('level'), 0).padEnd(3)} HP ${f(avg('hp')).padStart(5)}  hits ${f(avg('hits')).padStart(3)}  ${f(avg('ttk'), 1).padStart(4)}s  blows ${f(avg('blows'), 1).padStart(4)}  brawl ${f(avg('brawl') * 100).padStart(3)}% (worst ${f(max('brawl') * 100)}%)  [${[...new Set(g.map(x => x.type))].join(' ')}]`);
}

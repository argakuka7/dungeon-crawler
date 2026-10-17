// The console's commands (typed in the chat box after a '/', game/console.js) and the types of
// their arguments, whose values the box offers to complete: the game's items, weapons,
// enemies, rarities and the like, read from the game's own tables so new ones show up by
// themselves. core/commands.js reads and completes the lines; game/devcommands.js adds the
// developer commands (?dev=1).
import { createRegistry, addCommand, addType, commandsFor, usage, parse } from '../core/commands.js';
import { ITEMS, WEARABLES } from '../core/items.js';
import { ENEMY_KINDS } from '../core/enemies.js';
import { RARITIES } from '../core/gear/rarities.js';
import { MOODS } from '../audio/score.js';
import { MAX_DEPTH, themeAt } from '../themes/depth.js';
import { online } from '../net/online.js';
import { state } from './state.js';
import { note, clearChronicle } from './log.js';

export const commands = createRegistry();

// --- what arguments can be ----------------------------------------------------------------------

const once = make => { let list = null; return () => list ??= make(); };
const items = once(() => Object.values(ITEMS).map(d => ({ value: d.id, label: d.name, hint: d.weapon ? d.weapon.kind : d.category, icon: d.icon })));
addType(commands, { name: 'item', values: items });
addType(commands, { name: 'weapon', values: once(() => items().filter(i => ITEMS[i.value].weapon)) });
// what the hero can wear (only headwear for now: game/equipment.js devWear), or 'off'
addType(commands, { name: 'wearable', values: once(() => [...WEARABLES.filter(w => w.slot === 'head')
  .map(w => ({ value: w.id, label: w.name, hint: w.slot, icon: w.icon })), { value: 'off', label: 'off', hint: 'take it off' }]) });
// the ordinary kinds first, the guardians after
addType(commands, { name: 'enemy', values: once(() => Object.values(ENEMY_KINDS).sort((a, b) => !!a.guardian - !!b.guardian)
  .map(k => ({ value: k.type, label: k.label, hint: k.guardian ? `guardian (${k.guardianRole})` : k.species }))) });
addType(commands, { name: 'rarity', values: () => RARITIES.map(r => ({ value: r.id, label: r.name, color: r.css })) });
addType(commands, { name: 'depth', values: () => Array.from({ length: MAX_DEPTH + 1 }, (_, d) => ({ value: String(d), label: String(d), hint: themeAt(d, state.cubes?.layout.themes).name })) });
addType(commands, { name: 'mood', values: () => [...MOODS.map(m => ({ value: m, label: m })), { value: 'auto', label: 'auto', hint: 'the game picks again' }] });
const choice = (name, list) => addType(commands, { name, values: () => list.map(([value, hint]) => ({ value, label: value, hint })) });
choice('toggle', [['on'], ['off']]);
choice('way', [['down', 'the way down'], ['up', 'the way up']]);
choice('dir', [['east'], ['west'], ['south'], ['north']]);
choice('where', [['front', 'in front of you'], ['cursor', 'under the mouse']]);
choice('drop', [['drop', 'at your feet instead of in hand']]);

// --- the commands everyone has ------------------------------------------------------------------

addCommand(commands, {
  name: 'help', help: 'what the commands are (or how one works)', args: [{ name: 'command', type: 'command', optional: true }],
  run({ command }, ctx) {
    const one = command && commands.commands.get(command);
    if (one) return `${usage(one)}: ${one.help}`;
    const list = commandsFor(commands, ctx).map(c => `${usage(c)}: ${c.help}`);
    return ['Type to chat. A line that starts with / is a command (Tab completes it):', ...list].join('\n');
  },
});
addType(commands, { name: 'command', values: ctx => commandsFor(commands, ctx).map(c => ({ value: c.name, label: c.name, hint: c.help })) });
addCommand(commands, {
  name: 'seed', help: "this world's seed (?seed= in the address plays it again)",
  run: () => state.cubes ? `Seed ${state.cubes.seed}` : 'No world yet',
});
addCommand(commands, { name: 'clear', help: 'empty the chat box', run() { clearChronicle(); } });
addCommand(commands, {
  name: 'who', help: 'who is playing',
  run() {
    if (!online.peers.size) return 'Only you. O plays together';
    const at = slot => online.buddies.find(b => b.slot === slot);
    return [...online.peers].sort(([a], [b]) => a - b).map(([slot, p]) => {
      const b = at(slot);
      return `${p.name}${b ? b.here ? ' (here)' : ` (cube ${b.cube})` : ''}`;
    }).join(', ');
  },
});

// Run a typed command line ('/give potion'): what it says goes into the chronicle (as a
// developer line for developer commands). Resolves once it is done.
export async function runCommand(line, ctx = { dev: state.dev }) {
  const p = parse(commands, line, ctx);
  if (p.error) { note(p.error, 'system', { error: true }); return false; }
  const kind = p.command.dev ? 'dev' : 'system';
  try {
    const said = await p.command.run(p.values, ctx);
    if (said) note(String(said), kind);
    return true;
  } catch (e) {
    console.warn(`/${p.command.name} failed`, e);
    note(`/${p.command.name}: ${e.message}`, kind, { error: true });
    return false;
  }
}

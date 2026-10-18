// Pure asset catalog shared by generation, placement and rendering. No GLTF/Three dependency.
// The catalog is complete from the start: every prop's metadata (tools/prop-metadata.mjs) is in
// it, so placement and colliders never wait for a download. Rendering loads a prop set's
// geometry when a cube needs it (render/props.js loadPropSets) and adds it to the entries.
import { PROP_METADATA } from './propmetadata.js';

// Focal props are placed by site recipes, not a uniform scatter draw. Asset priority is
// unrelated to reward prestige. Older architectural props also need deliberate placement, and so do
// landmarks (assets/themes/: bigger than a cell) and string segments (attach 'line').
const SIGNATURES = new Set(['altar', 'broken_altar', 'ritual_circle', 'weapon_graveyard',
  'collapsed_arch', 'frozen_adventurer', 'adventurer_remains', 'abandoned_pack', 'old_campfire',
  'signpost', 'sword_in_ground', 'sarcophagus', 'statue', 'mine_rail', 'rail', 'support_frame']);
// How much clutter there is: a factor on every ambient scatter pass (render/propplace.js), on the
// guardian arenas' cover and loose things (cubegen/arenaprops.js) and on the town's ground cover
// (world/town.js). Authored set pieces are not affected.
export const CLUTTER = 0.75;
export const signatureProp = p => p.landmark || SIGNATURES.has(p.base) || /rail|frame/.test(p.base);
export const propMetadata = new Map(PROP_METADATA.map(p => [p.name, p]));
export const props = { byName: new Map(), sets: new Map() };

// a prop's catalog entry from its metadata: the extras the exporters may leave out get their defaults
export const catalogEntry = m => ({ attach: 'ground', radius: 0.3, intensity: 1, sway: 0, priority: 1, drop: 0, ...m,
  blocking: !!m.blocking, cover: !!m.cover, shore: !!m.shore });

// add an entry, or replace one in its place (placement draws from the sets in their order)
export function catalogProp(p) {
  const old = props.byName.get(p.name), key = p.set + '/' + p.attach;
  props.byName.set(p.name, p);
  if (old) {
    const list = props.sets.get(old.set + '/' + old.attach), i = list.indexOf(old);
    if (old.set + '/' + old.attach === key) { list[i] = p; return; }
    list.splice(i, 1);
  }
  if (!props.sets.has(key)) props.sets.set(key, []);
  props.sets.get(key).push(p);
}

for (const m of PROP_METADATA) catalogProp(catalogEntry(m));

// Pure asset catalog shared by generation, placement and rendering. No GLTF/Three dependency.
import { PROP_METADATA } from './propmetadata.js';

// Focal props are placed by site recipes, not a uniform scatter draw. Asset priority is
// unrelated to reward prestige. Older architectural props also need deliberate placement, and so do
// landmarks (themes.glb: bigger than a cell) and string segments (attach 'line').
const SIGNATURES = new Set(['altar', 'broken_altar', 'ritual_circle', 'weapon_graveyard',
  'collapsed_arch', 'frozen_adventurer', 'adventurer_remains', 'abandoned_pack', 'old_campfire',
  'signpost', 'sword_in_ground', 'sarcophagus', 'statue', 'mine_rail', 'rail', 'support_frame']);
export const signatureProp = p => p.landmark || SIGNATURES.has(p.base) || /rail|frame/.test(p.base);
export const propMetadata = new Map(PROP_METADATA.map(p => [p.name, p]));
export const props = { ready: false, byName: new Map(), sets: new Map() };

// Runtime registration fills in geometries/materials, without duplicating catalog entries.
export function catalogProp(p) {
  const old = props.byName.get(p.name);
  if (old) {
    const list = props.sets.get(old.set + '/' + old.attach);
    list.splice(list.indexOf(old), 1);
  }
  props.byName.set(p.name, p);
  const key = p.set + '/' + p.attach;
  if (!props.sets.has(key)) props.sets.set(key, []);
  props.sets.get(key).push(p);
}

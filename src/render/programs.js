// Compiled shaders stay. three.js deletes a shader program as soon as the last material using
// it is disposed, and the next material that needs it compiles it again, in the middle of a
// frame, waiting for the driver: every cube change threw away about a dozen (the old cube's
// materials go before the new cube's are drawn) and built them again, 100 ms and more on a fast
// machine; a lone shot, projectile or loot glow did the same each time. There are only some tens
// of variants, so each is kept for good once compiled: one more use than three.js counts.
import { renderer } from './scene.js';

const kept = new WeakSet();
let known = 0;   // kept programs are never deleted: any beyond these are new

// after rendering (main.js)
export function keepPrograms() {
  const programs = renderer.info.programs;
  if (programs.length === known) return;
  for (const p of programs) if (!kept.has(p)) { kept.add(p); p.usedTimes++; }
  known = programs.length;
}

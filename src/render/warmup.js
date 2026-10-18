// Shader programs compiled before anything needs them. three.js compiles a material's program
// the first time it draws it, and that frame waits for the driver: on a phone a new depth's
// materials stalled entering it by a second and more, and an enemy's first death (its coins) or
// first glow held up a frame mid-fight. So what a cube shows is built once off-screen while the
// cube is fetched ahead (render/cubeassets.js), compiled here and thrown away again: the
// programs stay (render/programs.js), the cube is entered without compiling anything.
// renderer.compile only starts the compiling: with KHR_parallel_shader_compile the driver
// works on it in the background and we wait until it is done (travel waits for that behind
// its spinner, game/hud.js whenReady); without it the first draw still waits for whatever is
// left, but the work was started long before.
import { renderer, scene, camera } from './scene.js';
import { keepPrograms } from './programs.js';

const LIMIT = 3000;   // ms: a driver this slow does not hold travel up for good

// entries: objects (not in the scene, or hidden in it) to compile as they are, or
// { object, material }: object drawn with material instead (the proxies' glass, a second
// draw of the same batch, render/neighbors.js). Resolves once their programs are ready.
export function warm(entries) {
  const materials = new Set();
  for (const e of entries) {
    const object = e.isObject3D ? e : e.object, swap = e.isObject3D ? null : object.material;
    if (swap) object.material = e.material;
    try { for (const m of renderer.compile(object, camera, scene)) materials.add(m); }
    finally { if (swap) object.material = swap; }
  }
  keepPrograms();   // before the throwaway materials are disposed, which would delete them
  return ready(materials);
}

// every scene object: what hides in it until used (the particle layers, the portal cloud)
export const warmScene = () => warm([scene]);

function ready(materials) {
  const start = performance.now();
  return new Promise(res => {
    const check = () => {
      for (const m of materials) {
        const program = renderer.properties.get(m).currentProgram;
        if (!program || program.isReady()) materials.delete(m);
      }
      if (!materials.size || performance.now() - start > LIMIT) res();
      else setTimeout(check, 10);
    };
    check();
  });
}

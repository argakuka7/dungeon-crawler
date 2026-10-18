// Heavy one-off work on the main thread (parsing a model, building a cube once to warm its
// shaders: render/warmup.js) waits for its turn: right after a frame went out, when there is
// the most time until the next, and one per frame. So the models and cubes fetched ahead while
// you play (world/client.js prefetch) do not all land in the same frame. turn() resolves when
// it is the caller's turn; turns come in the order they were asked for.
const FALLBACK = 100;   // ms: no frames (a hidden tab) do not hold the work up for good
let last = Promise.resolve();

const nextFrame = () => new Promise(res => {
  const t = setTimeout(res, FALLBACK);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { clearTimeout(t); setTimeout(res, 0); });
});

export function turn() {
  const mine = last.then(nextFrame);
  last = mine;
  return mine;
}

// Main-thread side of the world: asks the worker for cubes and keeps the ones it got.
// cubes: key -> { key, map, geo, info, visits }. `get` resolves when the cube is ready; asking for
// cubes early (prefetch) makes walking through a portal instant.
import { key } from './coords.js';
import { makeLayouts } from './layout.js';
import { worldThemes } from '../themes/depth.js';

// learn: architecture.html#worker (see learn/README.md)
export class WorldClient {
  constructor(seed, opts = {}) {
    this.seed = seed;
    this.start = key(0, 0, 0);
    this.layout = makeLayouts(seed, worldThemes(seed, opts.themes || []));   // which cubes exist (cheap, also needed here)
    this.cubes = new Map();
    this.waiting = new Map();   // key -> [resolve, reject][]
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => this.receive(data);
    this.worker.postMessage({ type: 'init', seed, opts });
  }

  receive(data) {
    const list = this.waiting.get(data.key) || [];
    this.waiting.delete(data.key);
    if (data.type === 'error') { console.error('cube failed', data.key, data.message); list.forEach(([, rej]) => rej(new Error(data.message))); return; }
    const c = { key: data.key, map: data.map, geo: data.geo, info: data.info, visits: 0 };
    this.cubes.set(data.key, c);
    list.forEach(([res]) => res(c));
  }

  get(k) {
    const c = this.cubes.get(k);
    if (c) return Promise.resolve(c);
    return new Promise((res, rej) => {
      if (!this.waiting.has(k)) { this.waiting.set(k, []); this.worker.postMessage({ type: 'cube', key: k }); }
      this.waiting.get(k).push([res, rej]);
    });
  }

  prefetch(keys) { for (const k of keys) if (!this.cubes.has(k)) this.get(k).catch(() => {}); }

  dispose() { this.worker.terminate(); }
}

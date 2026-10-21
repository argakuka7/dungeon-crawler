// A small file system in the browser's own storage (IndexedDB), for pi-durable's JSONL storage
// (JsonlStorage only needs files it appends to, reads at start, truncates, replaces and lists).
//
// All files live in memory too; every change is first written to the volume in one atomic
// IndexedDB transaction, then applied in memory. Appends add a chunk instead of rewriting the
// file, so a long chat does not get slower to save; a file with many chunks is rewritten as one.
//
// One page owns the files at a time (tutor.js takes a Web Lock). claim() makes this page the
// owner; a page that has lost ownership (another tab took over) fails every later write, so two
// pages can never interleave commits.
import { FileError, ok, err } from '../../vendor/pi-durable/pi-durable.js';

const MAX_CHUNKS = 64;
const now = () => Date.now();
const concat = parts => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const bytes = content => typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
const norm = path => {
  const out = [];
  for (const part of String(path).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return '/' + out.join('/');
};
const parentOf = path => path.slice(0, path.lastIndexOf('/')) || '/';
const nameOf = path => path.slice(path.lastIndexOf('/') + 1);

// ---- volumes: where the files are kept --------------------------------------------------------------
// load() -> Map path -> { kind, mtimeMs, chunks: [Uint8Array] }
// write({ files: Map path -> meta | null, chunks: [{ path, n, data }], drop: [{ path, from }] })
//   stores all of it or nothing; meta is { kind, size, chunks, mtimeMs }

// IndexedDB: store "files" (path -> meta), "chunks" ([path, n] -> bytes), "meta" ("owner" -> token)
// When another tab deletes the database ("Forget everything"), this page lets go of it at once and
// calls onGone: an open connection blocks the delete, and a blocked delete holds every later open
// (in every tab) forever.
export async function idbVolume(name, { onGone = () => {}, timeoutMs = 10_000 } = {}) {
  const db = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the tutor storage did not open (another tab of the guide may be holding it; close the other tabs)')), timeoutMs);
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('files');
      d.createObjectStore('chunks');
      d.createObjectStore('meta');
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const d = req.result;
      d.onversionchange = () => { d.close(); onGone(); };
      resolve(d);
    };
    req.onerror = () => { clearTimeout(timer); reject(req.error); };
    req.onblocked = () => { clearTimeout(timer); reject(new Error('the tutor storage is busy in another tab')); };
  });
  // randomUUID only exists in secure contexts (not on plain http over a LAN IP)
  const token = crypto.randomUUID?.()
    ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const done = tx => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new FileError('permission_denied', 'The tutor was opened in another tab'));
  });
  const all = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  return {
    async claim() {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(token, 'owner');
      await done(tx);
    },
    async load() {
      const tx = db.transaction(['files', 'chunks'], 'readonly');
      const [paths, metas, keys, datas] = await Promise.all([
        all(tx.objectStore('files').getAllKeys()), all(tx.objectStore('files').getAll()),
        all(tx.objectStore('chunks').getAllKeys()), all(tx.objectStore('chunks').getAll()),
      ]);
      const files = new Map(paths.map((p, i) => [p, { kind: metas[i].kind, mtimeMs: metas[i].mtimeMs, chunks: [], count: metas[i].chunks }]));
      // keys come sorted by [path, n]
      keys.forEach(([p, n], i) => { const f = files.get(p); if (f && n < f.count) f.chunks.push(datas[i]); });
      for (const f of files.values()) delete f.count;
      return files;
    },
    async write(change) {
      const tx = db.transaction(['files', 'chunks', 'meta'], 'readwrite');
      const result = done(tx);
      const req = tx.objectStore('meta').get('owner');
      req.onsuccess = () => {
        if (req.result !== token) { tx.abort(); return; }
        const files = tx.objectStore('files'), chunks = tx.objectStore('chunks');
        for (const { path, from } of change.drop) chunks.delete(IDBKeyRange.bound([path, from], [path, Infinity]));
        for (const { path, n, data } of change.chunks) chunks.put(data, [path, n]);
        for (const [path, meta] of change.files) if (meta) files.put(meta, path); else files.delete(path);
      };
      return result;
    },
    async destroy() {
      db.close();
      // other pages close their connections when asked (onversionchange), so this finishes; if
      // one does not, do not hang on it
      await new Promise((resolve, reject) => {
        const r = indexedDB.deleteDatabase(name);
        r.onsuccess = resolve;
        r.onerror = () => reject(r.error);
        r.onblocked = () => setTimeout(resolve, 3000);
      });
    },
    close() { db.close(); },
  };
}

// in memory, for tests: memoryStore().volume() is one page's view of the same storage, with
// the same ownership rule as IndexedDB (the last to claim it may write)
export function memoryStore() {
  const files = new Map(), chunks = new Map();
  let owner = null;
  return { files, volume: () => memoryVolume(files, chunks, () => owner, t => { owner = t; }) };
}
function memoryVolume(files, chunks, getOwner, setOwner) {
  const token = {};
  return {
    async claim() { setOwner(token); },
    async load() {
      const out = new Map();
      for (const [path, meta] of files) out.set(path, { kind: meta.kind, mtimeMs: meta.mtimeMs, chunks: [...Array(meta.chunks).keys()].map(n => chunks.get(`${path}\0${n}`)) });
      return out;
    },
    async write(change) {
      if (getOwner() !== token) throw new FileError('permission_denied', 'The tutor was opened in another tab');
      for (const { path, from } of change.drop) for (const k of [...chunks.keys()]) { const [p, n] = k.split('\0'); if (p === path && +n >= from) chunks.delete(k); }
      for (const { path, n, data } of change.chunks) chunks.set(`${path}\0${n}`, data);
      for (const [path, meta] of change.files) if (meta) files.set(path, meta); else files.delete(path);
    },
  };
}

// ---- the file system pi-durable sees ------------------------------------------------------------
export async function openFiles(volume) {
  await volume.claim();
  const files = await volume.load();
  if (!files.has('/')) files.set('/', { kind: 'directory', mtimeMs: now(), chunks: [] });
  return new VolumeFs(volume, files);
}

class VolumeFs {
  id = 'learn-tutor';
  cwd = '/';
  #volume;
  #files;
  #queue = Promise.resolve();
  constructor(volume, files) { this.#volume = volume; this.#files = files; }

  // one change at a time, in order, each stored before it shows in memory
  #change(build) {
    const run = this.#queue.then(async () => {
      const change = { files: new Map(), chunks: [], drop: [] }, apply = [];
      const failure = build(change, apply);
      if (failure) return err(failure);
      try { await this.#volume.write(change); }
      catch (e) { return err(e instanceof FileError ? e : new FileError('unknown', e?.message ?? String(e))); }
      for (const f of apply) f();
      return ok(undefined);
    });
    this.#queue = run.catch(() => {});
    return run;
  }
  #meta(f) { return { kind: f.kind, size: f.chunks.reduce((n, c) => n + c.length, 0), chunks: f.chunks.length, mtimeMs: f.mtimeMs }; }
  // set a file's whole content
  #put(change, apply, path, data, kind = 'file') {
    const f = { kind, mtimeMs: now(), chunks: data.length ? [data] : [] };
    change.drop.push({ path, from: 0 });
    if (data.length) change.chunks.push({ path, n: 0, data });
    change.files.set(path, this.#meta(f));
    apply.push(() => this.#files.set(path, f));
  }
  #parentMissing(path) {
    const p = this.#files.get(parentOf(path));
    if (!p) return new FileError('not_found', `No such directory: ${parentOf(path)}`, path);
    if (p.kind !== 'directory') return new FileError('not_directory', `Not a directory: ${parentOf(path)}`, path);
  }
  #file(path) {
    const f = this.#files.get(norm(path));
    if (!f) return err(new FileError('not_found', `No such file: ${path}`, path));
    if (f.kind !== 'file') return err(new FileError('is_directory', `Is a directory: ${path}`, path));
    return ok(f);
  }

  async absolutePath(path) { return ok(norm(String(path).startsWith('/') ? path : this.cwd + '/' + path)); }
  async canonicalPath(path) { return this.absolutePath(path); }
  async joinPath(parts) { return ok(norm(parts.join('/'))); }
  async exists(path) { return ok(this.#files.has(norm(path))); }

  async fileInfo(path) {
    const p = norm(path), f = this.#files.get(p);
    if (!f) return err(new FileError('not_found', `No such file: ${path}`, path));
    return ok({ name: nameOf(p), path: p, kind: f.kind, size: this.#meta(f).size, mtimeMs: f.mtimeMs });
  }
  async listDir(path) {
    const dir = norm(path), d = this.#files.get(dir);
    if (!d) return err(new FileError('not_found', `No such directory: ${path}`, path));
    if (d.kind !== 'directory') return err(new FileError('not_directory', `Not a directory: ${path}`, path));
    const out = [];
    for (const [p, f] of this.#files) if (p !== '/' && parentOf(p) === dir)
      out.push({ name: nameOf(p), path: p, kind: f.kind, size: this.#meta(f).size, mtimeMs: f.mtimeMs });
    return ok(out);
  }

  async readBinaryFile(path) {
    const f = this.#file(path);
    if (!f.ok) return f;
    const data = concat(f.value.chunks);
    // read at start: a file that grew from many appends is stored again as one piece
    if (f.value.chunks.length > 1) await this.#change((change, apply) => this.#put(change, apply, norm(path), data));
    return ok(data);
  }
  async readTextFile(path) {
    const r = await this.readBinaryFile(path);
    return r.ok ? ok(new TextDecoder().decode(r.value)) : r;
  }
  async readTextLines(path, options) {
    const r = await this.readTextFile(path);
    if (!r.ok) return r;
    const lines = r.value.split('\n');
    return ok(options?.maxLines ? lines.slice(0, options.maxLines) : lines);
  }

  writeFile(path, content) {
    const p = norm(path), data = bytes(content);
    return this.#change((change, apply) => {
      if (this.#files.get(p)?.kind === 'directory') return new FileError('is_directory', `Is a directory: ${path}`, path);
      return this.#parentMissing(p) ?? this.#put(change, apply, p, data);
    });
  }
  appendFile(path, content) {
    const p = norm(path), data = bytes(content);
    return this.#change((change, apply) => {
      const f = this.#files.get(p);
      if (!f) return this.#parentMissing(p) ?? this.#put(change, apply, p, data);
      if (f.kind !== 'file') return new FileError('is_directory', `Is a directory: ${path}`, path);
      if (!data.length) return;
      if (f.chunks.length + 1 >= MAX_CHUNKS) return this.#put(change, apply, p, concat([...f.chunks, data]));
      const next = { kind: 'file', mtimeMs: now(), chunks: [...f.chunks, data] };
      change.chunks.push({ path: p, n: f.chunks.length, data });
      change.files.set(p, this.#meta(next));
      apply.push(() => this.#files.set(p, next));
    });
  }
  truncateFile(path, size) {
    const p = norm(path);
    return this.#change((change, apply) => {
      const f = this.#files.get(p);
      if (!f) return new FileError('not_found', `No such file: ${path}`, path);
      if (f.kind !== 'file') return new FileError('is_directory', `Is a directory: ${path}`, path);
      const data = concat(f.chunks), out = new Uint8Array(size);
      out.set(data.subarray(0, Math.min(size, data.length)));
      this.#put(change, apply, p, out);
    });
  }
  // every change is a finished IndexedDB transaction already
  async flushFile(path) { return this.#files.has(norm(path)) ? ok(undefined) : err(new FileError('not_found', `No such file: ${path}`, path)); }

  renameFile(from, to) {
    const a = norm(from), b = norm(to);
    return this.#change((change, apply) => {
      const f = this.#files.get(a);
      if (!f) return new FileError('not_found', `No such file: ${from}`, from);
      if (f.kind !== 'file') return new FileError('not_supported', 'Only files can be renamed', from);
      const missing = this.#parentMissing(b);
      if (missing) return missing;
      change.drop.push({ path: a, from: 0 });
      change.files.set(a, null);
      this.#put(change, apply, b, concat(f.chunks));
      apply.push(() => this.#files.delete(a));
    });
  }
  createDir(path, options) {
    const p = norm(path);
    return this.#change((change, apply) => {
      const chain = [];
      for (let q = p; q !== '/'; q = parentOf(q)) chain.unshift(q);
      for (const [i, q] of chain.entries()) {
        const f = this.#files.get(q);
        if (f?.kind === 'directory') continue;
        if (f) return new FileError('not_directory', `Not a directory: ${q}`, q);
        if (i < chain.length - 1 && !options?.recursive) return new FileError('not_found', `No such directory: ${parentOf(p)}`, path);
        this.#put(change, apply, q, new Uint8Array(0), 'directory');
      }
    });
  }
  remove(path, options) {
    const p = norm(path);
    return this.#change((change, apply) => {
      const f = this.#files.get(p);
      if (!f) return options?.force ? undefined : new FileError('not_found', `No such file: ${path}`, path);
      const below = [...this.#files.keys()].filter(q => q.startsWith(p === '/' ? '/' : p + '/') && q !== p);
      if (below.length && !options?.recursive) return new FileError('invalid', `Directory not empty: ${path}`, path);
      for (const q of [p, ...below]) {
        change.drop.push({ path: q, from: 0 });
        change.files.set(q, null);
        apply.push(() => this.#files.delete(q));
      }
    });
  }

  // not needed by JsonlStorage
  async #unsupported(what) { return err(new FileError('not_supported', `${what} is not available in the browser`)); }
  openTextLineReader() { return this.#unsupported('openTextLineReader'); }
  openBinaryReader() { return this.#unsupported('openBinaryReader'); }
  openDirReader() { return this.#unsupported('openDirReader'); }
  watch() { return this.#unsupported('watch'); }
  createTempDir() { return this.#unsupported('createTempDir'); }
  createTempFile() { return this.#unsupported('createTempFile'); }
  async cleanup() {}
}

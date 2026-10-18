// Reading the exported GLBs in Node (tools/, tests/): the JSON, the binary chunk, accessor data
// (meshopt-compressed or not) and a root's mesh bounds.
//
// The committed GLBs are meshopt-compressed and quantized (tools/compress-assets.mjs): their
// accessors' min / max are no longer in model units. compress-assets.mjs keeps each prop root's
// exact bounds, taken before compressing, in its extras (BOUNDS), and rootBounds reads them from
// there.
import { readFileSync } from 'node:fs';
import { MeshoptDecoder } from '../vendor/three/addons/libs/meshopt_decoder.module.js';

export const BOUNDS = 'cube_crawler_bounds';
const MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;

export function readGlb(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== MAGIC) throw Error('not a GLB: ' + path);
  const size = b.readUInt32LE(12);
  if (b.readUInt32LE(16) !== JSON_CHUNK) throw Error('no JSON chunk: ' + path);
  const json = JSON.parse(b.subarray(20, 20 + size)), at = 20 + size;
  const bin = at < b.length && b.readUInt32LE(at + 4) === BIN_CHUNK ? b.subarray(at + 8, at + 8 + b.readUInt32LE(at)) : null;
  return { json, bin };
}

// a GLB with its JSON replaced (the binary chunk as it was)
export function writeGlb({ json, bin }) {
  const pad = (buf, fill) => Buffer.concat([buf, Buffer.alloc((4 - buf.length % 4) % 4, fill)]);
  const text = pad(Buffer.from(JSON.stringify(json)), 0x20), data = bin && pad(bin, 0);
  const chunk = (type, buf) => { const h = Buffer.alloc(8); h.writeUInt32LE(buf.length, 0); h.writeUInt32LE(type, 4); return [h, buf]; };
  const body = [...chunk(JSON_CHUNK, text), ...(data ? chunk(BIN_CHUNK, data) : [])];
  const header = Buffer.alloc(12), length = 12 + body.reduce((n, c) => n + c.length, 0);
  header.writeUInt32LE(MAGIC, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(length, 8);
  return Buffer.concat([header, ...body]);
}

export const isCompressed = json => !!json.extensionsUsed?.includes('EXT_meshopt_compression');

// The exact bounds of a root's meshes, in the root's frame: { min, max } ([x, y, z], glTF
// axes), or null without meshes. Only from model-unit accessors (an uncompressed export) whose
// transforms are baked: no rotation, scale or matrix anywhere, no translation on the root
// (children may sit at a pivot, like the chest's lid).
export function exactBounds(json, rootIndex) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], root = json.nodes[rootIndex];
  const visit = (n, at = [0, 0, 0]) => {
    if (n.matrix || n.rotation || n.scale || (n === root && n.translation)) throw Error('Expected baked prop transforms: ' + root.name);
    at = at.map((v, k) => v + (n.translation?.[k] ?? 0));
    if (n.mesh !== undefined) for (const p of json.meshes[n.mesh].primitives) {
      const a = json.accessors[p.attributes.POSITION];
      if (a.componentType !== 5126 || a.normalized) throw Error('Quantized positions without stored bounds: ' + root.name);
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], a.min[k] + at[k]); max[k] = Math.max(max[k], a.max[k] + at[k]); }
    }
    for (const child of n.children || []) visit(json.nodes[child], at);
  };
  visit(root);
  return min[0] === Infinity ? null : { min, max };
}

// a root's bounds: stored by compress-assets.mjs, or exact from an uncompressed export
export const rootBounds = (json, rootIndex) => json.nodes[rootIndex].extras?.[BOUNDS] ?? exactBounds(json, rootIndex);

// the scene's root node indices
export const roots = json => json.scenes[json.scene ?? 0].nodes;

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NORMALIZE = { 5120: v => Math.max(v / 127, -1), 5121: v => v / 255, 5122: v => Math.max(v / 32767, -1), 5123: v => v / 65535 };

// An accessor's values as plain numbers (normalized integers as the floats they stand for),
// decoding meshopt-compressed buffer views. await MeshoptDecoder.ready first (decoderReady).
export const decoderReady = MeshoptDecoder.ready;
export function accessorValues({ json, bin }, index) {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView], n = COMPONENTS[a.type], Type = TYPES[a.componentType];
  const meshopt = view.extensions?.EXT_meshopt_compression;
  let bytes, stride;
  if (meshopt) {
    stride = meshopt.byteStride;
    bytes = new Uint8Array(meshopt.count * stride);
    const source = new Uint8Array(bin.buffer, bin.byteOffset + (meshopt.byteOffset ?? 0), meshopt.byteLength);
    MeshoptDecoder.decodeGltfBuffer(bytes, meshopt.count, stride, source, meshopt.mode, meshopt.filter);
  } else {
    stride = view.byteStride ?? n * Type.BYTES_PER_ELEMENT;
    bytes = new Uint8Array(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0), view.byteLength);
  }
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = [];
  const read = { 5120: o => data.getInt8(o), 5121: o => data.getUint8(o), 5122: o => data.getInt16(o, true),
    5123: o => data.getUint16(o, true), 5125: o => data.getUint32(o, true), 5126: o => data.getFloat32(o, true) }[a.componentType];
  const norm = a.normalized ? NORMALIZE[a.componentType] : v => v;
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++)
    out.push(norm(read((a.byteOffset ?? 0) + i * stride + k * Type.BYTES_PER_ELEMENT)));
  return out;
}

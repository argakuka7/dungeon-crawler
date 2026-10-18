// Anti-aliasing (MSAA) at the level the settings ask for (game/settings.js: off, 2x, 4x, 8x). A
// canvas made with antialias: true smooths edges with as many samples as the browser picks, and
// changing that would take a new WebGL context. So the canvas has none, and while MSAA is on,
// everything three.js draws to the screen goes into a multisampled framebuffer of ours, copied
// (resolved) onto the canvas at the end of the frame (main.js: beginFrame before drawing,
// endFrame after). three.js still thinks it draws to the screen, so it writes the same 8-bit
// sRGB colours, blended the same way: the picture only gets smoother edges.
//   - three.js binds null for the screen; gl.bindFramebuffer passes our framebuffer instead
//     (and gl.drawBuffers its colour attachment for the screen's BACK).
//   - Off draws straight onto the canvas, as cheap as it gets.
import { renderer } from './scene.js';

const gl = renderer.getContext();
const bindFramebuffer = gl.bindFramebuffer.bind(gl), drawBuffers = gl.drawBuffers.bind(gl);
const stencil = gl.getContextAttributes()?.stencil;
const DEPTH = stencil ? gl.DEPTH24_STENCIL8 : gl.DEPTH_COMPONENT24;
const DEPTH_ATTACHMENT = stencil ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT;
const COLOR_ONLY = [gl.COLOR_ATTACHMENT0];

let want = 0;                      // the samples asked for (0: off)
let samples = 0, fbo = null, color = null, depth = null, w = 0, h = 0;

gl.bindFramebuffer = (target, fb) => bindFramebuffer(target, fb ?? fbo);
gl.drawBuffers = buffers => drawBuffers(fbo && buffers.length === 1 && buffers[0] === gl.BACK ? COLOR_ONLY : buffers);

// the levels this GPU can do (both for colours and for depth): 0 (off), then 2, 4, 8 as offered
const offered = format => [...(gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES) ?? [])];
const both = offered(gl.RGBA8).filter(n => offered(DEPTH).includes(n));
export const MSAA_LEVELS = [0, ...[2, 4, 8].filter(n => both.includes(n))];
// the level used for `n` asked for: the most this GPU can do up to n
export const msaaLevel = n => Math.max(...MSAA_LEVELS.filter(l => l <= n));

export function setMsaa(n) { want = msaaLevel(n); }

function release() {
  if (fbo) { gl.deleteFramebuffer(fbo); gl.deleteRenderbuffer(color); gl.deleteRenderbuffer(depth); }
  fbo = color = depth = null; samples = 0;
}
function build(n, width, height) {
  release();
  if (!n) return;
  const buffer = format => {
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, n, format, width, height);
    return rb;
  };
  color = buffer(gl.RGBA8); depth = buffer(DEPTH);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  fbo = gl.createFramebuffer();
  bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { console.warn(`MSAA ${n}x failed, off`); release(); return; }
  samples = n; w = width; h = height;
}

// before drawing: the framebuffer at the level asked for and the canvas's size, bound for "the screen"
export function beginFrame() {
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
  if (want !== samples || (fbo && (width !== w || height !== h))) build(want, width, height);
  renderer.setRenderTarget(null);   // three.js's own note of what is bound: the screen ...
  bindFramebuffer(gl.FRAMEBUFFER, fbo);   // ... which is ours while MSAA is on
}

// after drawing: resolve onto the canvas
export function endFrame() {
  if (!fbo) return;
  renderer.setScissorTest(false);            // a blit is cut by the scissor
  renderer.state.buffers.color.setMask(true);
  bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
  bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.invalidateFramebuffer(gl.READ_FRAMEBUFFER, [gl.COLOR_ATTACHMENT0, DEPTH_ATTACHMENT]);   // nothing to keep: the next frame clears
  bindFramebuffer(gl.FRAMEBUFFER, fbo);
}

// a lost context took the buffers with it: build them again once it is back
renderer.domElement.addEventListener('webglcontextlost', () => { fbo = color = depth = null; samples = 0; });

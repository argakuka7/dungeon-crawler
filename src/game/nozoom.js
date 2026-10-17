// The page never zooms, whatever the fingers, the trackpad or the keys do (docs/touch.md). The
// game zooms its own view (two fingers on the game, the wheel: game/touch.js, game/input.js);
// the browser's zoom only ever got in the way.
//   - double tap: style.css, touch-action: manipulation on every element
//   - pinch on iPad / iPhone: Safari ignores user-scalable=no (index.html), but its own gesture
//     events can be called off; and any move with two or more fingers is, as a backup (one
//     finger still scrolls a list). The game's pinch reads pointer events: it goes on.
//   - a field getting focus: iOS zooms into text smaller than 16 px (style.css: 16 px on touch)
//   - pinch on a trackpad (Chrome, Edge, Firefox send it as a wheel with Ctrl) and Ctrl/Cmd with
//     + - = 0: not the browser's zoom (a pinch over the game still zooms the game's view)
//   - a canvas bigger than the page for a moment (an iPad turning, the keyboard): the game's
//     canvas fills the window by CSS and is never sized from innerWidth (render/scene.js)
//   - and should Safari zoom anyway, it is set back (below)
const stop = e => { if (e.cancelable) e.preventDefault(); };

for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, stop, { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) stop(e); }, { passive: false });
addEventListener('wheel', e => { if (e.ctrlKey) stop(e); }, { passive: false });
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'Numpad0'].includes(e.code)) stop(e);
}, true);

// Should Safari zoom anyway (turning an iPad, the keyboard), the zoom would stay: the pinch back
// out is called off above. Writing the viewport tag anew makes Safari go back to its first scale.
const vv = globalThis.visualViewport, meta = document.querySelector('meta[name=viewport]');
if (vv && meta) {
  const content = meta.content;
  let waiting = false;
  const unzoom = () => {
    if (waiting || Math.abs(vv.scale - 1) < 0.01) return;
    waiting = true;
    meta.content = content + ', minimum-scale=1';   // a real change, or Safari skips it
    requestAnimationFrame(() => { meta.content = content; scrollTo(0, 0); waiting = false; });
  };
  vv.addEventListener('resize', unzoom);
  addEventListener('orientationchange', () => setTimeout(unzoom, 300));
  document.addEventListener('focusout', () => setTimeout(unzoom, 100));   // after the keyboard
}

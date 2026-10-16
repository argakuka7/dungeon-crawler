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
const stop = e => { if (e.cancelable) e.preventDefault(); };

for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, stop, { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) stop(e); }, { passive: false });
addEventListener('wheel', e => { if (e.ctrlKey) stop(e); }, { passive: false });
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'Numpad0'].includes(e.code)) stop(e);
}, true);

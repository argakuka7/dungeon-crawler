// Camera distance scales: smaller means closer. Start at 1.23x the old magnification.
export const DEFAULT_ZOOM = 1 / 1.23;
export const ZOOM_INTERVAL = 1.1;
export const CLOSEST_ZOOM = DEFAULT_ZOOM * ZOOM_INTERVAL ** -2 / 1.25 / 1.2;   // 20% more magnification
export const FARTHEST_ZOOM = DEFAULT_ZOOM * ZOOM_INTERVAL ** 2 * 1.1;          // 10% further out
const zoomLevels = [
  CLOSEST_ZOOM,
  Math.sqrt(CLOSEST_ZOOM * DEFAULT_ZOOM / ZOOM_INTERVAL),   // extra level, halfway (geometrically) into the widest gap
  DEFAULT_ZOOM / ZOOM_INTERVAL,
  DEFAULT_ZOOM,
  DEFAULT_ZOOM * ZOOM_INTERVAL,
  FARTHEST_ZOOM,
];
export const ZOOM_LEVELS = Object.freeze(zoomLevels.slice());

// Keyboard and wheel share six reversible presets: three closer than the default, two further.
// direction: -1 zooms in, +1 zooms out, 0 leaves the target unchanged.
export function stepZoom(target, direction) {
  if (!direction) return target;
  const step = zoomLevels.reduce((best, zoom, i) =>
    Math.abs(target - zoom) < Math.abs(target - zoomLevels[best]) ? i : best, 0);
  const next = Math.max(0, Math.min(zoomLevels.length - 1, step + Math.sign(direction)));
  return zoomLevels[next];
}

// The enemies' palette (proposal, see tools/palette.html): every kind's colours are named
// swatches, a hue family and a tone, instead of free OKLCH values. A family is a fixed hue (or a
// near-grey); a tone a fixed lightness and the chroma it aims for. Hues cannot all carry the same
// chroma at the same lightness (sRGB holds far more red or violet than teal or ochre), so a tone's
// chroma is capped at FIT of the most its hue can show there: every family's `mid` looks about as
// strong. Eyes come in a few colours of their own (EYES). A swatch may turn its family's hue a
// little (`@±deg`, at most NUDGE): the frost kinds of different species are all frost, but not
// all the very same blue.
// Hot pink (350) and amber (65) are the guardians' alone (GUARDIAN_HUES, core/enemies.js
// GUARDIAN_KINDS): no other kind takes a hue near them.
import { oklabToLinear } from './oklch.js';

export const HUES = { crimson: 25, ember: 45, ochre: 80, moss: 130, jade: 165, frost: 230, azure: 260, violet: 305 };
export const GUARDIAN_HUES = { pink: 350, amber: 65 };
export const NEUTRALS = { ink: { h: 285, c: 0.014 }, stone: { h: 75, c: 0.028 } };
export const TONES = {
  pale: { l: 0.88, c: 0.05 },
  light: { l: 0.76, c: 0.11 },
  mid: { l: 0.62, c: 0.15 },
  deep: { l: 0.46, c: 0.11 },
  dark: { l: 0.32, c: 0.07 },
  glow: { l: 0.72, c: 0.2 },
  // the guardians': as strong as the hue goes, louder than anything else
  vivid: { l: 0.72, c: 0.3, fit: 1 },
};
export const EYES = {
  sun: { l: 0.9, c: 0.15, h: 100 },
  ember: { l: 0.72, c: 0.17, h: 45 },
  ice: { l: 0.84, c: 0.11, h: 215 },
  bone: { l: 0.96, c: 0.02, h: 95 },
};
const FIT = 0.85, NUDGE = 12;

const fits = (l, c, h) => oklabToLinear([l, c * Math.cos(h * Math.PI / 180), c * Math.sin(h * Math.PI / 180)])
  .every(v => v >= -1e-5 && v <= 1 + 1e-5);
// the most chroma sRGB shows at lightness l and hue h
export function maxChroma(l, h) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (fits(l, m, h)) lo = m; else hi = m; }
  return lo;
}

// 'moss.mid' (family.tone), 'frost.pale@-8' (its hue turned) or 'eyes.sun' -> { l, c, h }
export function swatch(name) {
  const [base, turn = '0'] = name.split('@'), [family, tone] = base.split('.'), dh = +turn;
  if (!Number.isFinite(dh) || Math.abs(dh) > NUDGE) throw new Error('Bad hue turn ' + name);
  if (family === 'eyes') {
    if (!EYES[tone]) throw new Error('No eye colour ' + name);
    return EYES[tone];
  }
  const t = TONES[tone];
  if (!t) throw new Error('No tone ' + name);
  if (NEUTRALS[family]) return { l: t.l, c: NEUTRALS[family].c, h: NEUTRALS[family].h };
  const hue = HUES[family] ?? GUARDIAN_HUES[family];
  if (hue === undefined) throw new Error('No family ' + name);
  const h = (hue + dh + 360) % 360;
  return { l: t.l, c: Math.min(t.c, (t.fit ?? FIT) * maxChroma(t.l, h)), h };
}
// a swatch as a colour string for a kind's `colors` (core/oklch.js recolorFn)
export function paint(name) {
  const { l, c, h } = swatch(name);
  return `oklch(${l} ${+c.toFixed(3)} ${h})`;
}

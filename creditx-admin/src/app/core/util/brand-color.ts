/**
 * Runtime brand theming.
 *
 * An org configures a single primary + accent hex in backend settings; we
 * generate the full 10-shade ramp each app expects (--cx-primary-50..900,
 * --cx-accent-50..900) by anchoring the chosen colour at its brand level
 * (primary → 600, accent → 500) and mixing toward white/black for the rest,
 * then push them onto document.documentElement via setProperty (same pattern
 * as dark-mode / font-scale). The --cx-primary / --cx-accent aliases point at
 * the anchored shades, so they update automatically.
 */

type RGB = { r: number; g: number; b: number };

const HEX = /^#?[0-9a-fA-F]{6}$/;

function hexToRgb(hex: string): RGB | null {
  if (!HEX.test(hex)) return null;
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function toHex(n: number): string { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }
function rgbToHex(c: RGB): string { return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`; }

/** Mix `a` toward `b` by amount t (0..1). */
function mix(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };

// Negative = lighten (mix white by |t|), positive = darken (mix black by t).
const PRIMARY_STEPS: Record<string, number> = {
  '50': -0.9, '100': -0.8, '200': -0.65, '300': -0.48, '400': -0.3,
  '500': -0.15, '600': 0, '700': 0.18, '800': 0.33, '900': 0.5,
};
const ACCENT_STEPS: Record<string, number> = {
  '50': -0.88, '100': -0.76, '200': -0.58, '300': -0.38, '400': -0.18,
  '500': 0, '600': 0.16, '700': 0.32, '800': 0.5, '900': 0.66,
};

function shades(baseHex: string, steps: Record<string, number>): Record<string, string> {
  const base = hexToRgb(baseHex);
  if (!base) return {};
  const out: Record<string, string> = {};
  for (const [shade, t] of Object.entries(steps)) {
    const c = t === 0 ? base : (t < 0 ? mix(base, WHITE, -t) : mix(base, BLACK, t));
    out[shade] = rgbToHex(c);
  }
  return out;
}

export function applyBrandColors(primaryHex?: string | null, accentHex?: string | null): void {
  const root = document.documentElement.style;
  if (primaryHex && HEX.test(primaryHex)) {
    const s = shades(primaryHex, PRIMARY_STEPS);
    for (const k in s) root.setProperty(`--cx-primary-${k}`, s[k]);
  }
  if (accentHex && HEX.test(accentHex)) {
    const s = shades(accentHex, ACCENT_STEPS);
    for (const k in s) root.setProperty(`--cx-accent-${k}`, s[k]);
  }
}

/** Point the browser tab favicon at the org logo (if any). */
export function applyFavicon(url?: string | null): void {
  if (!url) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

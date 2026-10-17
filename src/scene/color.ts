export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isHexColor = (value: string): boolean => HEX_RE.test(value);

export function parseHex(hex: string): Rgb {
  const m = HEX_RE.exec(hex.trim());
  if (!m || !m[1]) return { r: 0, g: 0, b: 0 };
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

export const rgbToHex = ({ r, g, b }: Rgb): string => `#${toHex(r)}${toHex(g)}${toHex(b)}`;

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

export function mix(a: string, b: string, p: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return rgbToHex({ r: ca.r + (cb.r - ca.r) * p, g: ca.g + (cb.g - ca.g) * p, b: ca.b + (cb.b - ca.b) * p });
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Picks whichever of `light` / `dark` reads better on `bg`. */
export function readableOn(bg: string, light = '#ffffff', dark = '#14122b'): string {
  return contrastRatio(bg, light) >= contrastRatio(bg, dark) ? light : dark;
}

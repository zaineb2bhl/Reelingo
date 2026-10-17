export type Easing = (x: number) => number;

export const clamp = (x: number, min = 0, max = 1): number => Math.min(max, Math.max(min, x));
export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const linear: Easing = (x) => x;
export const easeInQuad: Easing = (x) => x * x;
export const easeOutQuad: Easing = (x) => 1 - (1 - x) * (1 - x);
export const easeInOutQuad: Easing = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
export const easeInCubic: Easing = (x) => x * x * x;
export const easeOutCubic: Easing = (x) => 1 - (1 - x) ** 3;
export const easeInOutCubic: Easing = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
export const easeOutQuart: Easing = (x) => 1 - (1 - x) ** 4;
export const easeOutExpo: Easing = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));

export const easeOutBack: Easing = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

export const easeOutElastic: Easing = (x) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
};

/** Normalised, eased progress of `t` through the window [start, start + duration]. */
export function progress(t: number, start: number, duration: number, ease: Easing = linear): number {
  if (duration <= 0) return t >= start ? 1 : 0;
  return ease(clamp((t - start) / duration));
}

/** Smooth 0 -> 1 -> 0 pulse across a window, handy for flashes and highlights. */
export function pulse(t: number, start: number, duration: number): number {
  const p = progress(t, start, duration);
  return Math.sin(p * Math.PI);
}

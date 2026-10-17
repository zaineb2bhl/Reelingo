/**
 * Building blocks shared by the bundled formats. Formats are free to ignore
 * these; they only exist to keep the look consistent and the code short.
 */
import { SAFE, SAFE_WIDTH, VIDEO } from '@/config';
import {
  clamp,
  contrastRatio,
  detectDirection,
  drawLabel,
  drawPanel,
  drawProgressBar,
  measureLabel,
  mix,
  popIn,
  rgba,
  stripMarkup,
  withTransform,
  type Ctx,
  type Direction,
} from '@/scene';
import type { Theme } from '@/themes';

export const CX = VIDEO.width / 2;

/** Seconds needed to type a headline in. */
export function typingDuration(text: string, min = 0.7, max = 2.2): number {
  return clamp(stripMarkup(text).length / 30, min, max);
}

/** Comfortable reading time for a block of text, in seconds. */
export function readingTime(text: string, min = 2, max = 7): number {
  const words = stripMarkup(text).trim().split(/\s+/).filter(Boolean).length;
  return clamp(1 + words * 0.32, min, max);
}

/** Direction of the first non-empty string (falls back to LTR). */
export function contentDirection(...texts: string[]): Direction {
  const first = texts.find((t) => t.trim().length > 0) ?? '';
  return detectDirection(stripMarkup(first));
}

export function optionLetters(dir: Direction): readonly string[] {
  return dir === 'rtl' ? ['أ', 'ب', 'ج', 'د', 'هـ'] : ['A', 'B', 'C', 'D', 'E'];
}

/** The small pill at the top of most formats ("Quick quiz", "Word of the day"...). */
export function drawTagPill(ctx: Ctx, text: string, theme: Theme, p: number, y: number = SAFE.top): number {
  const label = text.trim();
  if (!label) return y;
  const upper = /[a-z]/.test(label) ? label.toLocaleUpperCase() : label;
  const size = 34;
  const w = measureLabel(ctx, upper, size, 800) + 70;
  const h = 78;
  withTransform(ctx, popIn(p, CX, y + h / 2), () => {
    drawPanel(ctx, CX - w / 2, y, w, h, { fill: theme.accent, radius: h / 2 });
    drawLabel(ctx, upper, CX, y + h / 2 + 2, { size, weight: 800, color: theme.accentText });
  });
  return y + h;
}

/** Thin bar along the bottom of the safe area showing overall progress. */
export function drawTimeline(ctx: Ctx, theme: Theme, t: number, total: number): void {
  drawProgressBar(ctx, {
    x: SAFE.left,
    y: SAFE.bottom + 36,
    width: SAFE_WIDTH,
    height: 10,
    progress: total > 0 ? t / total : 0,
    track: rgba(theme.text, 0.14),
    fill: rgba(theme.text, 0.55),
  });
}

/** Emphasis colour for `*stars*` that stays readable on panels. */
export function emphOnPanel(theme: Theme): string {
  return contrastRatio(theme.accent, theme.panel) >= 2.6 ? theme.accent : mix(theme.accent, theme.panelText, 0.55);
}

/** Emphasis colour for `*stars*` drawn straight on the background. */
export function emphOnBg(theme: Theme): string {
  const bg = mix(theme.bg[0], theme.bg[1], 0.5);
  return contrastRatio(theme.accent, bg) >= 2.2 ? theme.accent : mix(theme.accent, theme.text, 0.6);
}

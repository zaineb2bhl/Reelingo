import { clamp, easeOutCubic } from './easing';
import { roundRectPath } from './shapes';
import { fontFor } from './text';
import type { Ctx } from './types';

export interface CountdownRingOptions {
  cx: number;
  cy: number;
  radius: number;
  thickness?: number;
  /** Elapsed fraction of the countdown, 0..1. */
  progress: number;
  /** Total countdown length in seconds; used for the number in the middle. */
  seconds: number;
  track: string;
  color: string;
  /** Colour for the last few seconds. */
  urgentColor?: string;
  fill?: string;
  textColor: string;
}

/** Ring that empties clockwise, with the remaining whole seconds in the centre. */
export function drawCountdownRing(ctx: Ctx, o: CountdownRingOptions): void {
  const p = clamp(o.progress);
  const thickness = o.thickness ?? o.radius * 0.16;
  const remaining = o.seconds * (1 - p);
  const shown = p >= 1 ? 0 : Math.ceil(remaining - 1e-6);
  // Little pulse each time the number changes.
  const frac = remaining - Math.floor(remaining);
  const beat = p > 0 && p < 1 ? (frac > 0.85 ? (frac - 0.85) / 0.15 : 0) : 0;
  const scale = 1 + 0.07 * beat;
  const urgent = o.urgentColor && remaining <= Math.min(3, o.seconds / 2) && p < 1;
  const color = urgent && o.urgentColor ? o.urgentColor : o.color;

  ctx.save();
  ctx.translate(o.cx, o.cy);
  ctx.scale(scale, scale);
  if (o.fill) {
    ctx.beginPath();
    ctx.arc(0, 0, o.radius + thickness / 2, 0, Math.PI * 2);
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.strokeStyle = o.track;
  ctx.beginPath();
  ctx.arc(0, 0, o.radius, 0, Math.PI * 2);
  ctx.stroke();
  if (p < 1) {
    const start = -Math.PI / 2 + Math.PI * 2 * p;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, o.radius, start, Math.PI * 1.5);
    ctx.stroke();
  }
  ctx.fillStyle = o.textColor;
  ctx.font = fontFor(o.radius * 0.95, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(shown), 0, o.radius * 0.04);
  ctx.restore();
}

export interface ProgressBarOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  progress: number;
  track: string;
  fill: string;
}

export function drawProgressBar(ctx: Ctx, o: ProgressBarOptions): void {
  const p = clamp(o.progress);
  ctx.save();
  roundRectPath(ctx, o.x, o.y, o.width, o.height, o.height / 2);
  ctx.fillStyle = o.track;
  ctx.fill();
  if (p > 0) {
    roundRectPath(ctx, o.x, o.y, Math.max(o.height, o.width * p), o.height, o.height / 2);
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  ctx.restore();
}

export interface Transform {
  alpha?: number;
  dx?: number;
  dy?: number;
  scale?: number;
  rotate?: number;
  /** Pivot for scale/rotate. */
  originX?: number;
  originY?: number;
}

/** Runs `draw` with alpha / translate / scale applied. Skips fully transparent draws. */
export function withTransform(ctx: Ctx, tr: Transform, draw: () => void): void {
  const alpha = tr.alpha ?? 1;
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(tr.dx ?? 0, tr.dy ?? 0);
  if (tr.scale !== undefined || tr.rotate !== undefined) {
    const ox = tr.originX ?? 0;
    const oy = tr.originY ?? 0;
    ctx.translate(ox, oy);
    if (tr.rotate) ctx.rotate(tr.rotate);
    const s = tr.scale ?? 1;
    ctx.scale(s, s);
    ctx.translate(-ox, -oy);
  }
  draw();
  ctx.restore();
}

/** Common entrance: fade + rise. `p` is 0..1 (already eased or not). */
export function riseIn(p: number, distance = 60): Transform {
  const e = easeOutCubic(clamp(p));
  return { alpha: e, dy: (1 - e) * distance };
}

/** Fade + slide from the side; `fromRight` respects RTL layouts. */
export function slideIn(p: number, distance = 120, fromRight = false): Transform {
  const e = easeOutCubic(clamp(p));
  return { alpha: e, dx: (1 - e) * distance * (fromRight ? 1 : -1) };
}

/** Pops in with a slight overshoot around a pivot. */
export function popIn(p: number, originX: number, originY: number): Transform {
  const x = clamp(p);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const s = x <= 0 ? 0 : 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  return { alpha: clamp(x * 3), scale: Math.max(0, s), originX, originY };
}

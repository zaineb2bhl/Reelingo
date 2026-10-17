import type { Ctx } from './types';

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

export interface PanelStyle {
  fill: string;
  radius?: number;
  stroke?: string;
  strokeWidth?: number;
  /** Soft drop shadow colour, e.g. rgba(0,0,0,0.2). */
  shadow?: string;
  shadowBlur?: number;
  shadowOffsetY?: number;
}

export function drawPanel(ctx: Ctx, x: number, y: number, w: number, h: number, style: PanelStyle): void {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, style.radius ?? 36);
  if (style.shadow) {
    ctx.shadowColor = style.shadow;
    ctx.shadowBlur = style.shadowBlur ?? 40;
    ctx.shadowOffsetY = style.shadowOffsetY ?? 14;
  }
  ctx.fillStyle = style.fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (style.stroke) {
    ctx.lineWidth = style.strokeWidth ?? 4;
    ctx.strokeStyle = style.stroke;
    ctx.stroke();
  }
  ctx.restore();
}

/** A tick (check) mark drawn progressively, p = 0..1. */
export function drawTick(ctx: Ctx, cx: number, cy: number, size: number, color: string, p = 1, width = size * 0.16): void {
  const pts: Array<[number, number]> = [
    [cx - size * 0.42, cy + size * 0.02],
    [cx - size * 0.12, cy + size * 0.32],
    [cx + size * 0.45, cy - size * 0.3],
  ];
  drawPolyline(ctx, pts, color, width, p);
}

/** A cross mark drawn progressively, p = 0..1. */
export function drawCross(ctx: Ctx, cx: number, cy: number, size: number, color: string, p = 1, width = size * 0.16): void {
  const s = size * 0.34;
  const p1 = Math.min(1, p * 2);
  const p2 = Math.max(0, p * 2 - 1);
  drawPolyline(ctx, [[cx - s, cy - s], [cx + s, cy + s]], color, width, p1);
  if (p2 > 0) drawPolyline(ctx, [[cx + s, cy - s], [cx - s, cy + s]], color, width, p2);
}

function drawPolyline(ctx: Ctx, pts: Array<[number, number]>, color: string, width: number, p: number): void {
  if (p <= 0 || pts.length < 2) return;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(len);
    total += len;
  }
  let remaining = total * Math.min(1, p);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const first = pts[0];
  if (first) ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < pts.length && remaining > 0; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = lengths[i - 1] ?? 0;
    if (!a || !b) continue;
    const f = Math.min(1, remaining / (len || 1));
    ctx.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
    remaining -= len;
  }
  ctx.stroke();
  ctx.restore();
}

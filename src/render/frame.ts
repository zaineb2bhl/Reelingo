import { SAFE, VIDEO } from '@/config';
import type { AnyFormat } from '@/formats/types';
import { drawBackground } from '@/scene/background';
import { drawLabel } from '@/scene/text';
import type { Ctx } from '@/scene/types';
import type { Theme } from '@/themes';
import { drawBranding, type FrameBranding } from './branding';

export interface FrameOptions {
  /** Draw the platform safe-zone guides (preview only, never exported). */
  showSafeZones?: boolean;
  /** Watermark and logo burned into the video. */
  branding?: FrameBranding | null;
}

/**
 * Draws one complete frame in 1080x1920 logical units. The caller is
 * responsible for any scale transform (preview canvases are smaller).
 */
export function renderFrame(ctx: Ctx, format: AnyFormat, data: unknown, t: number, theme: Theme, opts: FrameOptions = {}): void {
  ctx.save();
  drawBackground(ctx, theme, t);
  try {
    ctx.save();
    format.render(ctx, data, Math.max(0, t), theme);
  } catch (err) {
    console.error(`[${format.id}] render failed`, err);
    drawLabel(ctx, 'Preview unavailable – check your content', VIDEO.width / 2, VIDEO.height / 2, { size: 40, color: theme.text });
  } finally {
    ctx.restore();
  }
  if (opts.branding) drawBranding(ctx, opts.branding, theme);
  if (opts.showSafeZones) drawSafeZones(ctx);
  ctx.restore();
}

function drawSafeZones(ctx: Ctx): void {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 0, 90, 0.16)';
  ctx.fillRect(0, 0, VIDEO.width, SAFE.top);
  ctx.fillRect(0, SAFE.bottom, VIDEO.width, VIDEO.height - SAFE.bottom);
  ctx.fillRect(0, SAFE.top, SAFE.left, SAFE.bottom - SAFE.top);
  ctx.fillRect(SAFE.right, SAFE.top, VIDEO.width - SAFE.right, SAFE.bottom - SAFE.top);
  ctx.setLineDash([18, 14]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 0, 90, 0.75)';
  ctx.strokeRect(SAFE.left, SAFE.top, SAFE.right - SAFE.left, SAFE.bottom - SAFE.top);
  ctx.restore();
}

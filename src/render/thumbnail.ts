import { VIDEO } from '@/config';
import type { AnyFormat } from '@/formats/types';
import type { Theme } from '@/themes';
import type { FrameBranding } from './branding';
import { safeDuration } from './duration';
import { renderFrame } from './frame';

/** Renders a representative frame as a small JPEG data URL. */
export function renderThumbnail(format: AnyFormat, data: unknown, theme: Theme, branding: FrameBranding | null, width = 216): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((width * VIDEO.height) / VIDEO.width);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const scale = width / VIDEO.width;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // Late in the video most content is visible.
    renderFrame(ctx, format, data, safeDuration(format, data) * 0.82, theme, { branding });
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}

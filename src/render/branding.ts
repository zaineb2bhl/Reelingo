import { SAFE, VIDEO } from '@/config';
import { rgba } from '@/scene/color';
import { drawPanel } from '@/scene/shapes';
import { drawLabel, measureLabel } from '@/scene/text';
import type { Ctx } from '@/scene/types';
import type { Theme } from '@/themes';

export const BRAND_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export type BrandPosition = (typeof BRAND_POSITIONS)[number];

export const LOGO_SIZES = { sm: 96, md: 136, lg: 184 } as const;
export type LogoSize = keyof typeof LOGO_SIZES;

export interface LogoImage {
  image: CanvasImageSource;
  width: number;
  height: number;
}

export interface FrameBranding {
  watermark: string;
  watermarkPos: BrandPosition;
  logo: LogoImage | null;
  logoPos: BrandPosition;
  logoSize: LogoSize;
}

const MARGIN_X = 56;
const TOP_Y = 128;
const BOTTOM_Y = SAFE.bottom + 150;

interface Item {
  width: number;
  height: number;
  draw: (x: number, cy: number) => void;
}

/** Burns the watermark handle and logo into the frame. */
export function drawBranding(ctx: Ctx, b: FrameBranding, theme: Theme): void {
  const groups = new Map<BrandPosition, Item[]>();
  const add = (pos: BrandPosition, item: Item): void => {
    const list = groups.get(pos) ?? [];
    list.push(item);
    groups.set(pos, list);
  };

  if (b.logo && b.logo.width > 0 && b.logo.height > 0) {
    const logo = b.logo;
    const box = LOGO_SIZES[b.logoSize];
    const s = Math.min(box / logo.width, box / logo.height);
    const w = logo.width * s;
    const h = logo.height * s;
    add(b.logoPos, { width: w, height: h, draw: (x, cy) => ctx.drawImage(logo.image, x, cy - h / 2, w, h) });
  }

  const text = b.watermark.trim();
  if (text) {
    const size = 34;
    const w = measureLabel(ctx, text, size, 600) + 44;
    const h = 62;
    add(b.watermarkPos, {
      width: w,
      height: h,
      draw: (x, cy) => {
        drawPanel(ctx, x, cy - h / 2, w, h, { fill: rgba(theme.dark ? '#000000' : '#ffffff', theme.dark ? 0.3 : 0.55), radius: h / 2 });
        drawLabel(ctx, text, x + w / 2, cy + 1, { size, weight: 600, color: rgba(theme.text, 0.92) });
      },
    });
  }

  ctx.save();
  for (const [pos, items] of groups) {
    const right = pos.endsWith('right');
    const cy = pos.startsWith('top') ? TOP_Y : BOTTOM_Y;
    // Items closest to the edge first (logo, then handle).
    let x = right ? VIDEO.width - MARGIN_X : MARGIN_X;
    for (const item of items) {
      const left = right ? x - item.width : x;
      item.draw(left, cy);
      x = right ? left - 18 : left + item.width + 18;
    }
  }
  ctx.restore();
}

import { VIDEO } from '@/config';
import type { Theme } from '@/themes';
import { rgba } from './color';
import { mulberry32 } from './random';
import type { Ctx } from './types';

const W = VIDEO.width;
const H = VIDEO.height;

/** Theme background: gradient, subtle pattern and two slowly drifting glows. */
export function drawBackground(ctx: Ctx, theme: Theme, t: number): void {
  const rad = (theme.bgAngle * Math.PI) / 180;
  const half = (Math.abs(Math.cos(rad)) * W + Math.abs(Math.sin(rad)) * H) / 2;
  const dx = Math.cos(rad) * half;
  const dy = Math.sin(rad) * half;
  const g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
  g.addColorStop(0, theme.bg[0]);
  g.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  drawGlow(ctx, W * 0.15 + Math.sin(t * 0.5) * 60, H * 0.18 + Math.cos(t * 0.4) * 50, 520, theme.glow[0], theme.dark ? 0.35 : 0.5);
  drawGlow(ctx, W * 0.9 + Math.cos(t * 0.35) * 70, H * 0.8 + Math.sin(t * 0.45) * 60, 600, theme.glow[1], theme.dark ? 0.28 : 0.45);

  drawPattern(ctx, theme);
}

function drawGlow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawPattern(ctx: Ctx, theme: Theme): void {
  ctx.save();
  ctx.fillStyle = theme.patternColor;
  ctx.strokeStyle = theme.patternColor;
  switch (theme.pattern) {
    case 'dots': {
      const step = 60;
      ctx.beginPath();
      for (let y = step / 2; y < H; y += step) {
        for (let x = step / 2; x < W; x += step) {
          ctx.moveTo(x + 3.5, y);
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      break;
    }
    case 'grid': {
      const step = 72;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= W; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let y = 0; y <= H; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      break;
    }
    case 'ruled': {
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = 140; y < H; y += 64) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220,70,70,0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(110, 0);
      ctx.lineTo(110, H);
      ctx.stroke();
      break;
    }
    case 'speckle': {
      const rand = mulberry32(42);
      for (let i = 0; i < 500; i++) {
        const x = rand() * W;
        const y = rand() * H;
        const r = 1 + rand() * 2.5;
        ctx.globalAlpha = 0.4 + rand() * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'none':
      break;
  }
  ctx.restore();
}

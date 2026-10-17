import { clamp } from './easing';
import { mulberry32 } from './random';
import type { Ctx } from './types';

export interface ConfettiOptions {
  /** Seconds since the burst started. Nothing is drawn before 0. */
  t: number;
  originX: number;
  originY: number;
  colors: readonly string[];
  seed?: number;
  count?: number;
  /** Spread angle in radians around straight up. */
  spread?: number;
  speed?: number;
  gravity?: number;
  lifetime?: number;
}

/**
 * Analytic confetti: every particle's position is a closed-form function of
 * time, so any frame can be rendered in isolation (needed for scrubbing and export).
 */
export function drawConfetti(ctx: Ctx, o: ConfettiOptions): void {
  const lifetime = o.lifetime ?? 2.6;
  if (o.t < 0 || o.t > lifetime || o.colors.length === 0) return;
  const rand = mulberry32(o.seed ?? 7);
  const count = o.count ?? 110;
  const spread = o.spread ?? Math.PI * 0.9;
  const baseSpeed = o.speed ?? 1700;
  const gravity = o.gravity ?? 2600;
  const drag = 2.2;
  const t = o.t;
  const fade = clamp((lifetime - t) / 0.6);

  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (rand() - 0.5) * spread;
    const speed = baseSpeed * (0.45 + rand() * 0.75);
    const size = 14 + rand() * 16;
    const color = o.colors[Math.floor(rand() * o.colors.length)] ?? '#ffffff';
    const spin = (rand() - 0.5) * 18;
    const wobble = rand() * Math.PI * 2;
    const round = rand() < 0.3;
    const delay = rand() * 0.12;
    const lt = t - delay;
    if (lt < 0) continue;
    const ltau = (1 - Math.exp(-drag * lt)) / drag;
    const x = o.originX + Math.cos(angle) * speed * ltau + Math.sin(lt * 3 + wobble) * 18;
    const y = o.originY + Math.sin(angle) * speed * ltau + 0.5 * gravity * lt * lt * 0.55;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = color;
    ctx.translate(x, y);
    ctx.rotate(spin * lt + wobble);
    if (round) {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const flutter = Math.abs(Math.cos(lt * 7 + wobble));
      ctx.fillRect(-size / 2, (-size * 0.32 * flutter) / 2, size, size * 0.32 * flutter + 2);
    }
    ctx.restore();
  }
}

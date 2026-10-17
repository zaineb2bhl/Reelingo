import type { AnyFormat } from '@/formats/types';

/** Duration guarded against bad input so the player never divides by zero. */
export function safeDuration(format: AnyFormat, data: unknown): number {
  try {
    const d = format.duration(data);
    return Number.isFinite(d) && d > 0 ? d : 1;
  } catch {
    return 1;
  }
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, '0')}`;
}

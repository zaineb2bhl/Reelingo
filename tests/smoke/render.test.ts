import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { VIDEO } from '@/config';
import { allFormats } from '@/formats/registry';
import { renderFrame } from '@/render/frame';
import type { Ctx } from '@/scene/types';
import { THEMES } from '@/themes';

/**
 * Renders frames of every format in Node using a real 2D canvas
 * implementation. Fails if render() throws or produces a blank frame.
 */
describe('smoke: render one frame of each format', () => {
  const theme = THEMES[0];
  if (!theme) throw new Error('no themes');

  it.each(allFormats.map((f) => [f.id, f] as const))('%s', (_id, format) => {
    const canvas = createCanvas(VIDEO.width, VIDEO.height);
    const ctx = canvas.getContext('2d') as unknown as Ctx;
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const d = format.duration(format.defaults);
      for (const t of [0, d * 0.25, d * 0.5, d * 0.9, d]) {
        renderFrame(ctx, format, format.defaults, t, theme);
      }
    } finally {
      console.error = original;
    }
    expect(errors).toEqual([]);

    // The frame must contain more than a flat colour.
    const { data } = canvas.getContext('2d').getImageData(0, 0, VIDEO.width, VIDEO.height);
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 997) {
      colours.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
    }
    expect(colours.size).toBeGreaterThan(10);
  });

  it('renders right-to-left text without throwing', () => {
    const format = allFormats[0];
    if (!format) throw new Error('no formats');
    const canvas = createCanvas(VIDEO.width, VIDEO.height);
    const ctx = canvas.getContext('2d') as unknown as Ctx;
    const arabic = { ...(format.defaults as Record<string, unknown>) };
    for (const [k, v] of Object.entries(arabic)) {
      if (typeof v === 'string' && k !== 'pace') arabic[k] = 'تعلّم *كلمة* جديدة كل يوم مع Reelingo 2026';
    }
    expect(() => renderFrame(ctx, format, arabic, 2, theme)).not.toThrow();
  });
});

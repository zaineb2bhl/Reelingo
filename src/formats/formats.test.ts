import { describe, expect, it } from 'vitest';
import { allFormats } from './registry';

describe('format registry', () => {
  it('discovers at least one format with unique ids', () => {
    expect(allFormats.length).toBeGreaterThan(0);
    const ids = allFormats.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(allFormats.map((f) => [f.id, f] as const))('%s', (_id, format) => {
    it('ships defaults that pass its own schema', () => {
      const result = format.schema.safeParse(format.defaults);
      expect(result.error?.issues ?? []).toEqual([]);
    });

    it('has a positive, finite duration for its defaults', () => {
      const d = format.duration(format.defaults);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(90);
    });

    it('only cues sounds inside the video', () => {
      const d = format.duration(format.defaults);
      for (const cue of format.cues?.(format.defaults) ?? []) {
        expect(cue.t).toBeGreaterThanOrEqual(0);
        expect(cue.t).toBeLessThanOrEqual(d);
      }
    });
  });
});

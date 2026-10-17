import { describe, expect, it } from 'vitest';
import { AVC_CANDIDATES, exportFilename } from './capabilities';
import { audioChunks } from './webcodecs';

describe('export helpers', () => {
  it('builds safe, dated filenames', () => {
    const name = exportFilename('Word of the Day!', 'mp4', new Date('2026-10-17T09:30:00'));
    expect(name).toMatch(/^reelingo-word-of-the-day-2026-10-1\d-\d{4}\.mp4$/);
  });

  it('tries High profile H.264 first', () => {
    expect(AVC_CANDIDATES[0]).toBe('avc1.64002a');
  });

  it('splits audio into planar chunks with correct timestamps', () => {
    const left = Float32Array.from({ length: 10 }, (_, i) => i);
    const right = Float32Array.from({ length: 10 }, (_, i) => 100 + i);
    const chunks = [...audioChunks([left, right], 1000, 4)];
    expect(chunks.map((c) => c.frames)).toEqual([4, 4, 2]);
    expect(chunks.map((c) => c.timestamp)).toEqual([0, 4000, 8000]);
    // Planar: all of channel 0, then all of channel 1.
    expect(Array.from(chunks[2]?.data ?? [])).toEqual([8, 9, 108, 109]);
  });
});

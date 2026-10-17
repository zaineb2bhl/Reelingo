import { describe, expect, it } from 'vitest';
import { musicEnvelope, planHasAudio, type AudioPlan } from './mix';

const fakeBuffer = (duration: number): AudioBuffer => ({ duration }) as AudioBuffer;

const base: AudioPlan = { duration: 10, cues: [], sfxEnabled: true, sfxVolume: 0.8, music: null, voice: null, duck: true };

const at = (env: Array<[number, number]>, t: number): number | undefined => env.find(([x]) => Math.abs(x - t) < 1e-9)?.[1];

describe('audio plan', () => {
  it('knows when there is nothing to play', () => {
    expect(planHasAudio(base)).toBe(false);
    expect(planHasAudio({ ...base, cues: [{ t: 1, sfx: 'pop' }] })).toBe(true);
    expect(planHasAudio({ ...base, cues: [{ t: 1, sfx: 'pop' }], sfxEnabled: false })).toBe(false);
    expect(planHasAudio({ ...base, music: { buffer: fakeBuffer(3), volume: 0.5 } })).toBe(true);
  });

  it('fades music in and out', () => {
    const env = musicEnvelope({ ...base, music: { buffer: fakeBuffer(30), volume: 0.5 } });
    expect(at(env, 0)).toBe(0);
    expect(at(env, 0.4)).toBeCloseTo(0.5);
    expect(at(env, 10)).toBe(0);
  });

  it('ducks music under a voiceover', () => {
    const env = musicEnvelope({ ...base, music: { buffer: fakeBuffer(30), volume: 1 }, voice: { buffer: fakeBuffer(4), volume: 1 } });
    expect(at(env, 4)).toBeCloseTo(0.35);
    expect(at(env, 4.25)).toBeCloseTo(1);
  });

  it('does not duck when ducking is off', () => {
    const env = musicEnvelope({ ...base, duck: false, music: { buffer: fakeBuffer(30), volume: 1 }, voice: { buffer: fakeBuffer(4), volume: 1 } });
    expect(env.every(([t, v]) => t < 0.4 || t > 8.8 || v === 1)).toBe(true);
  });
});

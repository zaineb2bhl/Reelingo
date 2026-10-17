import type { SfxName } from '@/formats/types';

/**
 * Sound effects are synthesised with oscillators and filtered noise, so there
 * are no audio files and no licensing questions. Every function only schedules
 * nodes, which works the same in a live AudioContext and an OfflineAudioContext.
 */

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic noise keeps exports byte-for-byte reproducible.
  let seed = 1234567;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 4294967296) * 2 - 1;
  }
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

function envelope(ctx: BaseAudioContext, dest: AudioNode, when: number, attack: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  g.connect(dest);
  return g;
}

function tone(ctx: BaseAudioContext, dest: AudioNode, when: number, type: OscillatorType, freq: number, attack: number, peak: number, decay: number, endFreq?: number): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, when + attack + decay);
  osc.connect(envelope(ctx, dest, when, attack, peak, decay));
  osc.start(when);
  osc.stop(when + attack + decay + 0.05);
}

function noise(ctx: BaseAudioContext, dest: AudioNode, when: number, duration: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.connect(dest);
  src.start(when);
  src.stop(when + duration);
  return src;
}

const synths: Record<SfxName, (ctx: BaseAudioContext, out: AudioNode, when: number) => void> = {
  tick(ctx, out, when) {
    tone(ctx, out, when, 'sine', 1650, 0.002, 0.45, 0.06);
    tone(ctx, out, when, 'triangle', 3300, 0.001, 0.12, 0.03);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;
    hp.connect(envelope(ctx, out, when, 0.001, 0.25, 0.015));
    noise(ctx, hp, when, 0.03);
  },
  pop(ctx, out, when) {
    tone(ctx, out, when, 'sine', 300, 0.004, 0.55, 0.11, 880);
    tone(ctx, out, when, 'triangle', 600, 0.003, 0.12, 0.06, 1500);
  },
  whoosh(ctx, out, when) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(350, when);
    bp.frequency.exponentialRampToValueAtTime(2600, when + 0.28);
    bp.frequency.exponentialRampToValueAtTime(700, when + 0.55);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-0.6, when);
    pan.pan.linearRampToValueAtTime(0.6, when + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.55, when + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.6);
    bp.connect(g);
    g.connect(pan);
    pan.connect(out);
    noise(ctx, bp, when, 0.65);
  },
  correct(ctx, out, when) {
    const notes = [880, 1108.73, 1318.51, 1760];
    notes.forEach((f, i) => {
      const t = when + i * 0.075;
      tone(ctx, out, t, 'triangle', f, 0.005, 0.28, 0.55);
      tone(ctx, out, t, 'sine', f * 2, 0.005, 0.08, 0.35);
    });
  },
  wrong(ctx, out, when) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(out);
    tone(ctx, lp, when, 'sawtooth', 220, 0.01, 0.3, 0.38, 140);
    tone(ctx, lp, when, 'sawtooth', 233, 0.01, 0.3, 0.38, 148);
  },
  reveal(ctx, out, when) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    hp.connect(envelope(ctx, out, when, 0.02, 0.18, 0.9));
    noise(ctx, hp, when, 1);
    [1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => tone(ctx, out, when + i * 0.05, 'sine', f, 0.01, 0.2, 0.9));
    tone(ctx, out, when, 'sine', 130.81, 0.01, 0.5, 0.7, 65);
  },
};

export function playSfx(ctx: BaseAudioContext, dest: AudioNode, name: SfxName, when: number, gain = 1): void {
  const g = ctx.createGain();
  g.gain.value = gain;
  g.connect(dest);
  synths[name](ctx, g, Math.max(0, when));
}

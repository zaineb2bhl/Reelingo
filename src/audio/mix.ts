import type { Cue } from '@/formats/types';
import { playSfx } from './sfx';

export interface AudioTrack {
  buffer: AudioBuffer;
  /** 0..1 */
  volume: number;
}

/** Everything needed to produce the soundtrack of one video. */
export interface AudioPlan {
  duration: number;
  cues: readonly Cue[];
  sfxEnabled: boolean;
  sfxVolume: number;
  music: AudioTrack | null;
  voice: AudioTrack | null;
  /** Lower the music while the voiceover plays. */
  duck: boolean;
}

export const EXPORT_SAMPLE_RATE = 48000;
const MUSIC_FADE_IN = 0.4;
const MUSIC_FADE_OUT = 1.2;
const DUCK_LEVEL = 0.35;
const DUCK_RAMP = 0.25;

export function planHasAudio(plan: AudioPlan): boolean {
  return (plan.sfxEnabled && plan.cues.length > 0 && plan.sfxVolume > 0) || !!plan.music || !!plan.voice;
}

/** Piecewise-linear music volume over video time (fades and ducking). */
export function musicEnvelope(plan: AudioPlan): Array<[number, number]> {
  const music = plan.music;
  if (!music) return [];
  const d = plan.duration;
  const points = new Set<number>([0, Math.min(MUSIC_FADE_IN, d), Math.max(0, d - MUSIC_FADE_OUT), d]);
  const voiceEnd = plan.voice && plan.duck ? Math.min(d, plan.voice.buffer.duration) : 0;
  if (voiceEnd > 0) {
    [DUCK_RAMP, voiceEnd, Math.min(d, voiceEnd + DUCK_RAMP)].forEach((p) => points.add(Math.min(d, p)));
  }
  const level = (t: number): number => {
    let v = music.volume;
    if (t < MUSIC_FADE_IN) v *= t / MUSIC_FADE_IN;
    if (t > d - MUSIC_FADE_OUT) v *= Math.max(0, (d - t) / MUSIC_FADE_OUT);
    if (voiceEnd > 0) {
      let duck = 1;
      if (t <= voiceEnd) duck = t < DUCK_RAMP ? 1 - (1 - DUCK_LEVEL) * (t / DUCK_RAMP) : DUCK_LEVEL;
      else if (t < voiceEnd + DUCK_RAMP) duck = DUCK_LEVEL + (1 - DUCK_LEVEL) * ((t - voiceEnd) / DUCK_RAMP);
      v *= duck;
    }
    return Math.max(0, v);
  };
  return [...points].sort((a, b) => a - b).map((t) => [t, level(t)]);
}

function valueAt(envelope: Array<[number, number]>, t: number): number {
  for (let i = 1; i < envelope.length; i++) {
    const a = envelope[i - 1];
    const b = envelope[i];
    if (a && b && t <= b[0]) {
      const span = b[0] - a[0];
      return span <= 0 ? b[1] : a[1] + (b[1] - a[1]) * ((t - a[0]) / span);
    }
  }
  return envelope[envelope.length - 1]?.[1] ?? 0;
}

/**
 * Schedules the soundtrack from video time `offset`, starting at context time
 * `startAt`. Returns a function that silences and releases everything.
 */
export function schedulePlan(ctx: BaseAudioContext, dest: AudioNode, plan: AudioPlan, offset: number, startAt: number): () => void {
  const sources: AudioScheduledSourceNode[] = [];
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  master.connect(limiter);
  limiter.connect(dest);
  const remaining = plan.duration - offset;
  const end = startAt + Math.max(0, remaining);

  if (plan.sfxEnabled && plan.sfxVolume > 0) {
    const sfxBus = ctx.createGain();
    sfxBus.gain.value = plan.sfxVolume;
    sfxBus.connect(master);
    for (const cue of plan.cues) {
      if (cue.t < offset - 0.02 || cue.t >= plan.duration) continue;
      playSfx(ctx, sfxBus, cue.sfx, startAt + Math.max(0, cue.t - offset), cue.gain ?? 1);
    }
  }

  if (plan.music && remaining > 0) {
    const src = ctx.createBufferSource();
    src.buffer = plan.music.buffer;
    src.loop = plan.music.buffer.duration < plan.duration;
    const gain = ctx.createGain();
    const env = musicEnvelope(plan);
    gain.gain.setValueAtTime(valueAt(env, offset), startAt);
    for (const [t, v] of env) {
      if (t > offset) gain.gain.linearRampToValueAtTime(v, startAt + (t - offset));
    }
    src.connect(gain);
    gain.connect(master);
    src.start(startAt, offset % Math.max(0.001, plan.music.buffer.duration));
    src.stop(end);
    sources.push(src);
  }

  if (plan.voice && offset < plan.voice.buffer.duration && remaining > 0) {
    const src = ctx.createBufferSource();
    src.buffer = plan.voice.buffer;
    const gain = ctx.createGain();
    gain.gain.value = plan.voice.volume;
    src.connect(gain);
    gain.connect(master);
    src.start(startAt, offset);
    src.stop(end);
    sources.push(src);
  }

  return () => {
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    master.disconnect();
    limiter.disconnect();
  };
}

/** Renders the full soundtrack offline for export. */
export async function renderPlanOffline(plan: AudioPlan, sampleRate = EXPORT_SAMPLE_RATE): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(plan.duration * sampleRate));
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate });
  schedulePlan(ctx, ctx.destination, plan, 0, 0);
  return ctx.startRendering();
}

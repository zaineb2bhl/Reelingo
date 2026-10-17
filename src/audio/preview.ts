import { planHasAudio, schedulePlan, type AudioPlan } from './mix';

/**
 * Plays the soundtrack alongside the preview player. Browsers only allow audio
 * after a user gesture, so nothing is scheduled until `unlock()` has run.
 */
class PreviewAudio {
  private ctx: AudioContext | null = null;
  private stopCurrent: (() => void) | null = null;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Call from a click / key handler. */
  async unlock(): Promise<boolean> {
    if (typeof AudioContext === 'undefined') return false;
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: 'interactive' });
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    return this.ctx.state === 'running';
  }

  start(plan: AudioPlan, offset: number): void {
    this.stop();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !planHasAudio(plan)) return;
    this.stopCurrent = schedulePlan(ctx, ctx.destination, plan, offset, ctx.currentTime + 0.02);
  }

  stop(): void {
    this.stopCurrent?.();
    this.stopCurrent = null;
  }

  /** Decodes an uploaded file; the buffer can be used in any context. */
  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 1, sampleRate: 48000 });
    return ctx.decodeAudioData(data);
  }
}

export const previewAudio = new PreviewAudio();

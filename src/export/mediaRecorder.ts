import { planHasAudio, schedulePlan } from '@/audio/mix';
import { VIDEO } from '@/config';
import { safeDuration } from '@/render/duration';
import { renderFrame } from '@/render/frame';
import { ExportCancelled, type ExportJob, type ExportResult, type ProgressFn } from './types';

/**
 * Fallback for browsers without WebCodecs: plays the video in real time on a
 * hidden canvas and records it with MediaRecorder. Slower (takes as long as
 * the video) and usually produces WebM.
 */
export async function exportWithMediaRecorder(job: ExportJob, mime: string, onProgress: ProgressFn, signal: AbortSignal): Promise<ExportResult> {
  const started = performance.now();
  const duration = safeDuration(job.format, job.data);
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO.width;
  canvas.height = VIDEO.height;
  // Some browsers only emit frames for canvases that are in the document.
  Object.assign(canvas.style, { position: 'fixed', left: '-99999px', top: '0', width: '108px', height: '192px', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is not available');

  const draw = (t: number): void => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    renderFrame(ctx, job.format, job.data, t, job.theme, { branding: job.branding });
  };
  draw(0);

  const stream = canvas.captureStream(VIDEO.fps);
  let audioCtx: AudioContext | null = null;
  let stopAudio: (() => void) | null = null;
  if (planHasAudio(job.audio) && typeof AudioContext !== 'undefined') {
    audioCtx = new AudioContext();
    await audioCtx.resume();
    const dest = audioCtx.createMediaStreamDestination();
    dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    stopAudio = schedulePlan(audioCtx, dest, job.audio, 0, audioCtx.currentTime + 0.05);
  }

  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const cleanup = (): void => {
    stopAudio?.();
    void audioCtx?.close();
    stream.getTracks().forEach((track) => track.stop());
    canvas.remove();
  };

  try {
    recorder.start(250);
    const t0 = performance.now() + 50;
    await new Promise<void>((resolve, reject) => {
      const tick = (): void => {
        if (signal.aborted) {
          reject(new ExportCancelled());
          return;
        }
        const t = Math.max(0, (performance.now() - t0) / 1000);
        draw(Math.min(t, duration));
        onProgress({ stage: 'video', progress: Math.min(0.98, t / duration) });
        if (t >= duration + 0.1) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    recorder.stop();
    await stopped;
  } catch (err) {
    if (recorder.state !== 'inactive') recorder.stop();
    cleanup();
    throw err;
  }
  cleanup();

  const type = mime.split(';')[0] ?? 'video/webm';
  const blob = new Blob(chunks, { type });
  onProgress({ stage: 'finalizing', progress: 1 });
  return {
    blob,
    mime: type,
    extension: type.includes('mp4') ? 'mp4' : 'webm',
    method: 'mediarecorder',
    renderSeconds: (performance.now() - started) / 1000,
  };
}

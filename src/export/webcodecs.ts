import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { EXPORT_SAMPLE_RATE, planHasAudio, renderPlanOffline } from '@/audio/mix';
import { VIDEO } from '@/config';
import { safeDuration } from '@/render/duration';
import { renderFrame } from '@/render/frame';
import type { Ctx } from '@/scene/types';
import { AUDIO_BITRATE, VIDEO_BITRATE, type ExportSupport } from './capabilities';
import { ExportCancelled, type ExportJob, type ExportResult, type ProgressFn } from './types';

const AUDIO_CHUNK_FRAMES = 4096;
const KEYFRAME_EVERY = VIDEO.fps * 2;

/** Splits an AudioBuffer into planar f32 chunks for AudioEncoder. */
export function* audioChunks(
  channels: readonly Float32Array[],
  sampleRate: number,
  chunkFrames = AUDIO_CHUNK_FRAMES,
): Generator<{ data: Float32Array; frames: number; timestamp: number }> {
  const total = channels[0]?.length ?? 0;
  for (let start = 0; start < total; start += chunkFrames) {
    const frames = Math.min(chunkFrames, total - start);
    const data = new Float32Array(frames * channels.length);
    channels.forEach((ch, c) => data.set(ch.subarray(start, start + frames), c * frames));
    yield { data, frames, timestamp: Math.round((start / sampleRate) * 1e6) };
  }
}

function createCanvas(): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(VIDEO.width, VIDEO.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) return { canvas, ctx };
  }
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO.width;
  canvas.height = VIDEO.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is not available');
  return { canvas, ctx };
}

const nextTick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Renders every frame offline as fast as the machine allows and muxes real
 * H.264 + AAC (or Opus) into an MP4 file.
 */
export async function exportWithWebCodecs(job: ExportJob, support: ExportSupport, onProgress: ProgressFn, signal: AbortSignal): Promise<ExportResult> {
  const started = performance.now();
  const videoCodec = support.videoCodec;
  if (!videoCodec) throw new Error('No supported H.264 encoder');
  const duration = safeDuration(job.format, job.data);
  const frameCount = Math.max(1, Math.ceil(duration * VIDEO.fps));
  const wantAudio = planHasAudio(job.audio) && support.audioCodec !== null;

  onProgress({ stage: 'audio', progress: 0.01 });
  const audioBuffer = wantAudio ? await renderPlanOffline({ ...job.audio, duration: frameCount / VIDEO.fps }) : null;
  if (signal.aborted) throw new ExportCancelled();

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: VIDEO.width, height: VIDEO.height, frameRate: VIDEO.fps },
    audio: audioBuffer && support.audioCodec ? { codec: support.audioCodec, numberOfChannels: 2, sampleRate: EXPORT_SAMPLE_RATE } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encoderError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
    },
  });
  videoEncoder.configure({
    codec: videoCodec,
    width: VIDEO.width,
    height: VIDEO.height,
    bitrate: VIDEO_BITRATE,
    framerate: VIDEO.fps,
    latencyMode: 'quality',
    avc: { format: 'avc' },
  });

  // Audio first: it is quick and lets the muxer interleave properly.
  if (audioBuffer && support.audioCodec) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encoderError = e;
      },
    });
    audioEncoder.configure({
      codec: support.audioCodec === 'aac' ? 'mp4a.40.2' : 'opus',
      sampleRate: EXPORT_SAMPLE_RATE,
      numberOfChannels: 2,
      bitrate: AUDIO_BITRATE,
    });
    const channels = [audioBuffer.getChannelData(0), audioBuffer.getChannelData(audioBuffer.numberOfChannels > 1 ? 1 : 0)];
    for (const chunk of audioChunks(channels, EXPORT_SAMPLE_RATE)) {
      const data = new AudioData({
        format: 'f32-planar',
        sampleRate: EXPORT_SAMPLE_RATE,
        numberOfFrames: chunk.frames,
        numberOfChannels: 2,
        timestamp: chunk.timestamp,
        data: chunk.data,
      });
      audioEncoder.encode(data);
      data.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }
  onProgress({ stage: 'video', progress: 0.08 });

  const { canvas, ctx } = createCanvas();
  const frameDuration = 1e6 / VIDEO.fps;
  try {
    for (let i = 0; i < frameCount; i++) {
      if (signal.aborted) throw new ExportCancelled();
      if (encoderError) throw encoderError;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      renderFrame(ctx, job.format, job.data, i / VIDEO.fps, job.theme, { branding: job.branding });
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDuration), duration: Math.round(frameDuration) });
      videoEncoder.encode(frame, { keyFrame: i % KEYFRAME_EVERY === 0 });
      frame.close();
      // Back-pressure: keep the encoder queue short so memory stays flat.
      while (videoEncoder.encodeQueueSize > 6) await nextTick();
      if (i % 5 === 0) {
        onProgress({ stage: 'video', progress: 0.08 + 0.87 * (i / frameCount) });
        await nextTick();
      }
    }
    onProgress({ stage: 'finalizing', progress: 0.96 });
    await videoEncoder.flush();
    if (encoderError) throw encoderError;
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
  }

  muxer.finalize();
  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
  onProgress({ stage: 'finalizing', progress: 1 });
  return { blob, mime: 'video/mp4', extension: 'mp4', method: 'webcodecs', renderSeconds: (performance.now() - started) / 1000 };
}

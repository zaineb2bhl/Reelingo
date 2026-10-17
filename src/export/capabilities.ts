import { VIDEO } from '@/config';

export const VIDEO_BITRATE = 8_000_000;
export const AUDIO_BITRATE = 160_000;

/** H.264 profiles to try, best first. Level 4.2 covers 1080x1920 at 30 fps. */
export const AVC_CANDIDATES = ['avc1.64002a', 'avc1.640028', 'avc1.4d002a', 'avc1.4d0028', 'avc1.42002a', 'avc1.42e028'] as const;

export const RECORDER_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const;

export interface ExportSupport {
  webcodecs: boolean;
  videoCodec: string | null;
  audioCodec: 'aac' | 'opus' | null;
  recorderMime: string | null;
}

let cached: Promise<ExportSupport> | null = null;

export function detectSupport(): Promise<ExportSupport> {
  cached ??= detect();
  return cached;
}

async function detect(): Promise<ExportSupport> {
  const recorderMime =
    typeof MediaRecorder !== 'undefined' ? (RECORDER_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null) : null;

  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return { webcodecs: false, videoCodec: null, audioCodec: null, recorderMime };
  }

  let videoCodec: string | null = null;
  for (const codec of AVC_CANDIDATES) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width: VIDEO.width,
        height: VIDEO.height,
        bitrate: VIDEO_BITRATE,
        framerate: VIDEO.fps,
      });
      if (res.supported) {
        videoCodec = codec;
        break;
      }
    } catch {
      // try the next one
    }
  }

  let audioCodec: ExportSupport['audioCodec'] = null;
  if (typeof AudioEncoder !== 'undefined') {
    for (const [codec, name] of [
      ['mp4a.40.2', 'aac'],
      ['opus', 'opus'],
    ] as const) {
      try {
        const res = await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: AUDIO_BITRATE });
        if (res.supported) {
          audioCodec = name;
          break;
        }
      } catch {
        // try the next one
      }
    }
  }

  return { webcodecs: videoCodec !== null, videoCodec, audioCodec, recorderMime };
}

export function exportFilename(formatId: string, extension: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const time = date.toTimeString().slice(0, 5).replace(':', '');
  const slug = formatId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video';
  return `reelingo-${slug}-${day}-${time}.${extension}`;
}

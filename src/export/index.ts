import { detectSupport } from './capabilities';
import { exportWithMediaRecorder } from './mediaRecorder';
import type { ExportJob, ExportResult, ProgressFn } from './types';
import { exportWithWebCodecs } from './webcodecs';

export { detectSupport, exportFilename } from './capabilities';
export type { ExportSupport } from './capabilities';
export * from './types';

/** Picks the best available encoder and renders the video. */
export async function exportVideo(job: ExportJob, onProgress: ProgressFn, signal: AbortSignal): Promise<ExportResult> {
  onProgress({ stage: 'preparing', progress: 0 });
  const support = await detectSupport();
  if (support.webcodecs) {
    try {
      return await exportWithWebCodecs(job, support, onProgress, signal);
    } catch (err) {
      if (signal.aborted || !support.recorderMime) throw err;
      console.warn('WebCodecs export failed, falling back to MediaRecorder', err);
    }
  }
  if (!support.recorderMime) throw new Error('This browser cannot record video. Please use a recent Chrome, Edge, Firefox or Safari.');
  return exportWithMediaRecorder(job, support.recorderMime, onProgress, signal);
}

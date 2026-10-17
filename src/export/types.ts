import type { AudioPlan } from '@/audio/mix';
import type { AnyFormat } from '@/formats/types';
import type { FrameBranding } from '@/render/branding';
import type { Theme } from '@/themes';

export interface ExportJob {
  format: AnyFormat;
  data: unknown;
  theme: Theme;
  branding: FrameBranding | null;
  audio: AudioPlan;
}

export type ExportStage = 'preparing' | 'audio' | 'video' | 'finalizing';

export interface ExportProgress {
  stage: ExportStage;
  /** Overall progress 0..1. */
  progress: number;
}

export type ExportMethod = 'webcodecs' | 'mediarecorder';

export interface ExportResult {
  blob: Blob;
  mime: string;
  extension: 'mp4' | 'webm';
  method: ExportMethod;
  /** Wall-clock render time in seconds. */
  renderSeconds: number;
}

export type ProgressFn = (p: ExportProgress) => void;

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelled';
  }
}

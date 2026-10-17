import { useCallback, useEffect, useRef, useState } from 'react';
import { planHasAudio } from '@/audio/mix';
import { detectSupport, exportFilename, exportVideo, ExportCancelled, type ExportJob, type ExportProgress, type ExportResult, type ExportSupport } from '@/export';
import { useT } from '@/i18n';
import { Dialog } from './ui/Dialog';

type State =
  | { kind: 'running'; progress: ExportProgress }
  | { kind: 'done'; result: ExportResult; url: string; filename: string }
  | { kind: 'error'; message: string };

interface ExportDialogProps {
  open: boolean;
  job: ExportJob;
  onClose: () => void;
}

export function ExportDialog({ open, job, onClose }: ExportDialogProps) {
  const t = useT();
  const [state, setState] = useState<State>({ kind: 'running', progress: { stage: 'preparing', progress: 0 } });
  const [support, setSupport] = useState<ExportSupport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const jobRef = useRef(job);
  jobRef.current = job;

  const start = useCallback(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: 'running', progress: { stage: 'preparing', progress: 0 } });
    let lastUpdate = 0;
    exportVideo(
      jobRef.current,
      (progress) => {
        const now = performance.now();
        if (now - lastUpdate > 80 || progress.progress >= 1) {
          lastUpdate = now;
          setState({ kind: 'running', progress });
        }
      },
      controller.signal,
    )
      .then((result) => {
        const url = URL.createObjectURL(result.blob);
        const filename = exportFilename(jobRef.current.format.id, result.extension);
        setState({ kind: 'done', result, url, filename });
        triggerDownload(url, filename);
      })
      .catch((err: unknown) => {
        if (err instanceof ExportCancelled) return;
        console.error(err);
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    void detectSupport().then(setSupport);
    start();
    return () => abortRef.current?.abort();
  }, [open, start]);

  useEffect(() => {
    if (state.kind !== 'done') return;
    const url = state.url;
    return () => URL.revokeObjectURL(url);
  }, [state]);

  const close = (): void => {
    abortRef.current?.abort();
    onClose();
  };

  const running = state.kind === 'running';
  const fallback = support !== null && !support.webcodecs;
  const noAudio = support !== null && support.webcodecs && support.audioCodec === null && planHasAudio(job.audio);

  return (
    <Dialog open={open} title={running ? t('export.titleRunning') : state.kind === 'done' ? t('export.titleDone') : t('export.titleError')} onClose={close} locked={false}>
      {fallback && (
        <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">{t('export.fallbackTitle')}</p>
          <p className="mt-1 text-amber-800">{t('export.fallbackBody')}</p>
        </div>
      )}
      {noAudio && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{t('export.noAudioCodec')}</p>}

      {state.kind === 'running' && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-ink/70">{t(`export.stage.${state.progress.stage}`)}</span>
            <span className="font-mono font-semibold tabular-nums">{Math.round(state.progress.progress * 100)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-ink/8" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress.progress * 100)}>
            <div className="h-full rounded-full bg-tangerine transition-[width] duration-150" style={{ width: `${Math.max(2, state.progress.progress * 100)}%` }} />
          </div>
          <p className="text-xs text-ink/50">{fallback ? t('export.realtimeHint') : t('export.keepOpen')}</p>
          <div className="flex justify-end pt-2">
            <button type="button" onClick={close} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 hover:text-ink">
              {t('export.cancel')}
            </button>
          </div>
        </div>
      )}

      {state.kind === 'done' && (
        <div className="space-y-4">
          <div className="flex gap-4">
            <video src={state.url} controls playsInline className="aspect-[9/16] w-32 shrink-0 rounded-xl bg-ink object-cover sm:w-36" />
            <div className="min-w-0 space-y-1.5 text-sm">
              <p className="font-semibold break-all">{state.filename}</p>
              <p className="text-ink/60">
                {(state.result.blob.size / (1024 * 1024)).toFixed(1)} MB · {state.result.extension.toUpperCase()}
              </p>
              <p className="text-ink/60">{t('export.renderedIn', { s: state.result.renderSeconds.toFixed(1) })}</p>
              {state.result.method === 'mediarecorder' && <p className="text-xs text-amber-700">{t('export.recordedRealtime')}</p>}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={start} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink/60 hover:bg-ink/5 hover:text-ink">
              {t('export.again')}
            </button>
            <a href={state.url} download={state.filename} className="rounded-xl bg-tangerine px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-tangerine/90">
              {t('export.download', { ext: state.result.extension.toUpperCase() })}
            </a>
          </div>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="space-y-4">
          <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{state.message}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink/60 hover:bg-ink/5">
              {t('export.close')}
            </button>
            <button type="button" onClick={start} className="rounded-xl bg-ink px-5 py-2.5 text-sm font-bold text-white">
              {t('export.retry')}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

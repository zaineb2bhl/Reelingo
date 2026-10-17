import { useRef, useState, type ReactNode } from 'react';
import { ThemePicker } from '@/components/ThemePicker';
import { FileButton, UploadIcon } from '@/components/ui/FileButton';
import { Field, Section, TextArea } from '@/components/ui/fields';
import { runSeriesInWorker } from '@/engine/client';
import type { SeriesResult } from '@/engine/index';
import { MAX_SERIES_VIDEOS } from '@/engine/limits';
import { DOCUMENT_ERROR_KEYS } from '@/engine/messages';
import { DOCUMENT_ACCEPT, DocumentError, readDocument } from '@/engine/reader';
import { getFormat, visibleFormats } from '@/formats/registry';
import { pickText, useLocale, useT } from '@/i18n';
import { loadLogo } from '@/media/hooks';
import type { FrameBranding } from '@/render/branding';
import { renderThumbnail } from '@/render/thumbnail';
import { useEditor } from '@/state/editor';
import { useSeries } from '@/state/series';
import { getMedia, saveMedia } from '@/storage/media';
import { newProjectId, saveProject } from '@/storage/projects';
import { resolveTheme } from '@/themes';
import { hrefFor } from './router';

const PER_FORMAT_MAX = 5;

type Phase = 'idle' | 'reading' | 'analysing' | 'saving' | 'done';

interface Result {
  id: string;
  name: string;
  thumbnail: string | null;
  note: string;
}

export function SeriesPage() {
  const t = useT();
  const locale = useLocale();
  const { docId, docName, docSize, instructions, counts, setDocument, setInstructions, setCount } = useSeries();
  const themeId = useEditor((s) => s.themeId);
  const accent = useEditor((s) => s.accent);
  const [docError, setDocError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [summary, setSummary] = useState<SeriesResult | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const total = visibleFormats.reduce((sum, f) => sum + (counts[f.id] ?? 0), 0);
  const running = phase !== 'idle' && phase !== 'done';

  const upload = async (file: File): Promise<void> => {
    setDocError(null);
    setUploading(true);
    try {
      await readDocument(file); // validates type, size and that there is readable text
      const rec = await saveMedia('document', file);
      setDocument(rec.id, file.name, file.size);
    } catch (err) {
      setDocError(t(err instanceof DocumentError ? DOCUMENT_ERROR_KEYS[err.code] : 'series.errUnreadable'));
    } finally {
      setUploading(false);
    }
  };

  const generate = async (): Promise<void> => {
    if (!docId) return;
    setActionError(null);
    if (total === 0) {
      setActionError(t('series.errNoVideos'));
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setResults([]);
    setSummary(null);
    try {
      setPhase('reading');
      const rec = await getMedia(docId);
      if (!rec) {
        setDocument(null, '', 0);
        setDocError(t('series.errMissing'));
        setPhase('idle');
        return;
      }
      const doc = await readDocument(new File([rec.blob], rec.name, { type: rec.type }));

      setPhase('analysing');
      const wanted = Object.fromEntries(visibleFormats.map((f) => [f.id, counts[f.id] ?? 0] as const).filter(([, n]) => n > 0));
      const result = await runSeriesInWorker(doc, { counts: wanted, query: instructions }, controller.signal);

      setPhase('saving');
      const editor = useEditor.getState();
      const theme = resolveTheme(editor.themeId, editor.accent);
      const logo = editor.branding.logoId ? await loadLogo(editor.branding.logoId) : null;
      const branding: FrameBranding = { ...editor.branding, logo };
      const docBase = rec.name.replace(/\.[^.]+$/, '').slice(0, 32);
      const numbering = new Map<string, number>();
      for (const video of result.videos) {
        if (controller.signal.aborted) break;
        const format = getFormat(video.formatId);
        if (!format) continue;
        const n = (numbering.get(format.id) ?? 0) + 1;
        numbering.set(format.id, n);
        const now = Date.now();
        const id = newProjectId();
        const name = `${docBase} · ${pickText(locale, format.title)} ${n}`;
        const thumbnail = renderThumbnail(format, video.data, theme, branding);
        await saveProject({
          id,
          name,
          formatId: format.id,
          data: video.data,
          themeId: editor.themeId,
          accent: editor.accent,
          branding: editor.branding,
          audio: editor.audio,
          note: `${rec.name} · ${video.source}`,
          createdAt: now,
          updatedAt: now,
          thumbnail,
        });
        setResults((list) => [...list, { id, name, thumbnail, note: video.source }]);
      }
      setSummary(result);
      setPhase('done');
    } catch (err) {
      setPhase('idle');
      if (controller.signal.aborted) return;
      console.error(err);
      if (err instanceof DocumentError) setDocError(t(DOCUMENT_ERROR_KEYS[err.code]));
      else setActionError(t('series.errGenerate'));
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('series.title')}</h1>

      <Section title={t('series.document')}>
        <div className="flex flex-wrap items-center gap-3">
          {docId ? (
            <p className="min-w-0 flex-1 truncate rounded-xl bg-ink/[0.04] px-3 py-2.5 text-sm font-semibold" title={docName}>
              {docName} <span className="font-normal text-ink/50">· {formatBytes(docSize)}</span>
            </p>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-ink/55">{t('series.documentHint')}</p>
          )}
          <FileButton accept={DOCUMENT_ACCEPT} onFile={(f) => void upload(f)} disabled={uploading || running}>
            <UploadIcon />
            {uploading ? t('audio.loading') : docId ? t('series.replace') : t('series.upload')}
          </FileButton>
        </div>
        {docError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{docError}</p>}
        <Field label={t('series.instructions')} optional hint={t('series.instructionsHint')}>
          {(id) => <TextArea id={id} rows={2} value={instructions} maxLength={200} placeholder={t('series.instructionsPlaceholder')} onChange={setInstructions} />}
        </Field>
      </Section>

      <Section title={t('series.templates')} action={<span className="text-xs font-semibold text-ink/50">{t('series.total', { n: total, max: MAX_SERIES_VIDEOS })}</span>}>
        <ul className="divide-y divide-ink/8">
          {visibleFormats.map((f) => {
            const n = counts[f.id] ?? 0;
            return (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{pickText(locale, f.title)}</span>
                  <span className="block truncate text-xs text-ink/50">{pickText(locale, f.description)}</span>
                </span>
                <div className="flex items-center gap-1 rounded-xl bg-ink/[0.05] p-1" dir="ltr">
                  <StepButton label="−" disabled={n === 0 || running} onClick={() => setCount(f.id, n - 1)} />
                  <span className="w-7 text-center font-mono text-sm font-bold tabular-nums">{n}</span>
                  <StepButton label="+" disabled={n >= PER_FORMAT_MAX || total >= MAX_SERIES_VIDEOS || running} onClick={() => setCount(f.id, n + 1)} />
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t('series.style')}>
        <ThemePicker themeId={themeId} accent={accent} onTheme={(id) => useEditor.getState().setTheme(id)} onAccent={(a) => useEditor.getState().setAccent(a)} />
        <p className="text-xs text-ink/50">{t('series.styleHint')}</p>
      </Section>

      <div className="space-y-3">
        {actionError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{actionError}</p>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {running && <span className="text-sm text-ink/55">{t(`series.phase.${phase as 'reading' | 'analysing' | 'saving'}`)}</span>}
          {running && (
            <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink/60 hover:bg-ink/5">
              {t('export.cancel')}
            </button>
          )}
          <button
            type="button"
            disabled={!docId || running}
            onClick={() => void generate()}
            className="flex items-center gap-2 rounded-xl bg-tangerine px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-tangerine/90 disabled:opacity-40"
          >
            {running && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {running ? t('series.generating') : t('series.generate', { n: total })}
          </button>
        </div>
      </div>

      {summary && (
        <div className="space-y-2">
          {!summary.matchedQuery && <Notice>{t('series.noMatch')}</Notice>}
          {summary.shortfalls.map((s) => {
            const format = getFormat(s.formatId);
            return (
              <Notice key={s.formatId}>
                {t('series.shortfall', { made: s.made, requested: s.requested, format: format ? pickText(locale, format.title) : s.formatId })}
              </Notice>
            );
          })}
          {summary.videos.length === 0 && <Notice>{t('series.nothing')}</Notice>}
        </div>
      )}

      {results.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-extrabold tracking-tight">{t('series.results')}</h2>
            <a href={hrefFor({ name: 'home' })} className="text-sm font-semibold text-tangerine">
              {t('series.allProjects')}
            </a>
          </div>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {results.map((r) => (
              <li key={r.id}>
                <a href={hrefFor({ name: 'project', id: r.id })} className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-ink/8 transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="aspect-[9/16] bg-ink/5">{r.thumbnail && <img src={r.thumbnail} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="space-y-0.5 px-3 py-2.5">
                    <p className="truncate text-sm font-bold">{r.name}</p>
                    {r.note && (
                      <p className="line-clamp-2 text-xs text-ink/50" dir="auto">
                        {r.note}
                      </p>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{children}</p>;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StepButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg bg-white text-lg font-bold shadow-sm transition hover:bg-ink hover:text-white disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-ink"
    >
      {label}
    </button>
  );
}

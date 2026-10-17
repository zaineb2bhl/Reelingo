import { useEffect, useRef, useState } from 'react';
import { defaultCountFor, parseInstructions } from '@/ai/instructions';
import { OllamaGenerator } from '@/ai/ollamaGenerator';
import { runGeneration } from '@/ai/pipeline';
import type { PreparedDocument } from '@/ai/prepare';
import { summarizeItem } from '@/ai/summary';
import type { ContentGenerator, FallbackReason, GeneratedItem } from '@/ai/types';
import { saveItemsAsProjects } from '@/app/documentProjects';
import { prepareInWorker } from '@/engine/client';
import { DOCUMENT_ERROR_KEYS } from '@/engine/messages';
import { DOCUMENT_ACCEPT, DocumentError, readDocument } from '@/engine/reader';
import type { AnyFormat } from '@/formats/types';
import { useLocale, useT } from '@/i18n';
import { useDocumentInput } from '@/state/document';
import { useSettings } from '@/state/settings';
import { getMedia, saveMedia } from '@/storage/media';
import { normaliseBaseUrl } from '@/ai/ollama';
import { OllamaHelp } from './OllamaHelp';
import { FileButton, UploadIcon } from './ui/FileButton';
import { TextArea } from './ui/fields';

type Phase = 'idle' | 'reading' | 'retrieving' | 'generating' | 'done';

interface DocumentPanelProps {
  format: AnyFormat;
  defaultOpen: boolean;
  /** Loads generated data into the template form. */
  onApply: (data: unknown) => void;
  /** Creates the primary (LLM) generator; defaults to Ollama with the saved settings. */
  createPrimary?: (prepared: PreparedDocument) => ContentGenerator | null;
}

/**
 * Document path: upload, instructions, retrieval, generation. Results fill the
 * form as they arrive; the teacher reviews or edits before generating the video.
 */
export function DocumentPanel({ format, defaultOpen, onApply, createPrimary }: DocumentPanelProps) {
  const ollamaUrl = useSettings((s) => s.ollamaUrl);
  const ollamaModel = useSettings((s) => s.ollamaModel);
  const t = useT();
  const locale = useLocale();
  const level = useSettings((s) => s.level);
  const { docId, docName, instructions, setDocument, setInstructions } = useDocumentInput();
  const [open, setOpen] = useState(defaultOpen);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [engine, setEngine] = useState('');
  const [items, setItems] = useState<GeneratedItem[]>([]);
  const [selected, setSelected] = useState(0);
  const [primaryError, setPrimaryError] = useState<FallbackReason | undefined>();
  const [noMatch, setNoMatch] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const running = phase !== 'idle' && phase !== 'done';

  // Elapsed-time counter while running.
  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const timer = setInterval(() => setElapsed((performance.now() - started) / 1000), 200);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const upload = async (file: File): Promise<void> => {
    setError(null);
    setUploading(true);
    try {
      await readDocument(file); // validates type, size and readable text
      const rec = await saveMedia('document', file);
      setDocument(rec.id, file.name, file.size);
    } catch (err) {
      setError(t(err instanceof DocumentError ? DOCUMENT_ERROR_KEYS[err.code] : 'series.errUnreadable'));
    } finally {
      setUploading(false);
    }
  };

  const select = (index: number, list: readonly GeneratedItem[] = items): void => {
    const item = list[index];
    if (!item) return;
    setSelected(index);
    onApply(item.data);
  };

  const generate = async (): Promise<void> => {
    if (!docId || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setItems([]);
    setSaved(null);
    setPrimaryError(undefined);
    setNoMatch(false);
    setElapsed(0);
    const { count, topic } = parseInstructions(instructions, defaultCountFor(format.id));
    try {
      setPhase('reading');
      const rec = await getMedia(docId);
      if (!rec) {
        setDocument(null, '', 0);
        setError(t('series.errMissing'));
        setPhase('idle');
        return;
      }
      const doc = await readDocument(new File([rec.blob], rec.name, { type: rec.type }));

      setPhase('retrieving');
      const prepared = await prepareInWorker(doc, { formatId: format.id, count, topic }, controller.signal);
      setNoMatch(!prepared.matchedQuery);

      setPhase('generating');
      const primary = createPrimary
        ? createPrimary(prepared)
        : new OllamaGenerator({ baseUrl: ollamaUrl, model: ollamaModel, ipa: (w) => prepared.ipa[w] });
      setEngine(primary?.label ?? t('doc.engine.rules'));
      const received: GeneratedItem[] = [];
      const result = await runGeneration({
        prepared,
        formatId: format.id,
        count,
        instructions,
        topic,
        level,
        primary,
        signal: controller.signal,
        onItem: (item) => {
          received.push(item);
          setItems([...received]);
          if (received.length === 1) select(0, received);
        },
      });
      setPrimaryError(result.primaryError);
      if (!result.items.length) setError(t('doc.nothing'));
      setPhase('done');
    } catch (err) {
      setPhase('idle');
      if (controller.signal.aborted) return;
      console.error(err);
      setError(t(err instanceof DocumentError ? DOCUMENT_ERROR_KEYS[err.code] : 'doc.errGenerate'));
    } finally {
      abortRef.current = null;
    }
  };

  const current = items[selected];

  return (
    <div className="rounded-2xl bg-gradient-to-br from-lilac/10 to-tangerine/10 ring-1 ring-lilac/20">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-start">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-lilac shadow-sm">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5M9 13h6M9 17h4" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{t('doc.title')}</span>
          <span className="block truncate text-xs text-ink/55">{docName || t('doc.teaser')}</span>
        </span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 text-ink/40 transition ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-xs font-semibold text-emerald-700">{t('doc.privacy')}</p>
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate rounded-lg bg-white/70 px-3 py-2 text-xs font-medium" title={docName}>
              {docName || t('series.documentHint')}
            </p>
            <FileButton accept={DOCUMENT_ACCEPT} onFile={(f) => void upload(f)} disabled={uploading || running}>
              <UploadIcon />
              {uploading ? t('audio.loading') : docId ? t('series.replace') : t('series.upload')}
            </FileButton>
          </div>
          <TextArea value={instructions} onChange={setInstructions} rows={2} maxLength={200} placeholder={t('doc.instructionsPlaceholder')} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {running && (
              <span className="me-auto text-xs text-ink/60" aria-live="polite">
                {t(`doc.phase.${phase as 'reading' | 'retrieving' | 'generating'}`)} · {elapsed.toFixed(0)}s{engine && phase === 'generating' ? ` · ${engine}` : ''}
              </span>
            )}
            {running && (
              <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-xl px-3 py-2 text-sm font-semibold text-ink/60 hover:bg-white/60">
                {t('export.cancel')}
              </button>
            )}
            <button
              type="button"
              disabled={!docId || running}
              onClick={() => void generate()}
              className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {running && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {t('doc.generate')}
            </button>
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}
          {noMatch && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t('doc.noMatch')}</p>}
          {phase === 'done' && primaryError && items.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t('doc.fallbackAll', { reason: t(`doc.reason.${primaryError}`) })}</p>
          )}
          {phase === 'done' && (primaryError === 'not-running' || primaryError === 'cors' || primaryError === 'model-missing' || primaryError === 'timeout') && (
            <OllamaHelp error={primaryError} baseUrl={normaliseBaseUrl(ollamaUrl)} model={ollamaModel} />
          )}

          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink/60">{t('doc.results', { n: items.length })}</p>
              <ol className="space-y-1.5">
                {items.map((item, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => select(i)}
                      className={`w-full rounded-xl px-3 py-2 text-start transition ${i === selected ? 'bg-white shadow-sm ring-2 ring-tangerine' : 'bg-white/60 hover:bg-white'}`}
                    >
                      <span className="flex items-start gap-2">
                        <span className="text-xs font-bold text-ink/40">{i + 1}</span>
                        <span className="min-w-0 flex-1 text-sm font-semibold" dir="auto">
                          {summarizeItem(item.formatId, item.data)}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${item.origin === 'llm' ? 'bg-lilac/15 text-lilac' : 'bg-ink/8 text-ink/55'}`}>
                          {item.origin === 'llm' ? (item.model ?? 'LLM') : t('doc.origin.rules')}
                        </span>
                      </span>
                      {item.supportingSentence && (
                        <span className="mt-1 block text-xs text-ink/55" dir="auto">
                          {t('doc.supporting')}: “{item.supportingSentence}”
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
              {current?.origin === 'rules' && (
                <p className="text-xs text-ink/55">
                  {t('doc.fallbackNote', { reason: t(`doc.reason.${current.fallbackReason ?? 'insufficient'}`) })}
                </p>
              )}
              {phase === 'done' && (
                <div className="flex items-center justify-end gap-3">
                  {saved !== null && <span className="text-xs font-medium text-emerald-700">{t('doc.saved', { n: saved })}</span>}
                  <button
                    type="button"
                    onClick={() => void saveItemsAsProjects(format, items, docName, locale).then(setSaved)}
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-ink/70 hover:bg-white/60"
                  >
                    {t('doc.saveAll')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

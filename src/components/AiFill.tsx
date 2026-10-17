import { useRef, useState } from 'react';
import { AiError, generateFormatData } from '@/ai/generate';
import { AI_ERROR_KEYS } from '@/ai/messages';
import { hrefFor } from '@/app/router';
import type { AnyFormat } from '@/formats/types';
import { useT } from '@/i18n';
import { useSettings } from '@/state/settings';
import { TextArea } from './ui/fields';

interface AiFillProps {
  format: AnyFormat;
  onResult: (data: unknown) => void;
}


/** "Describe a topic, get a filled-in form" via the user's own Anthropic API key. */
export function AiFill({ format, onResult }: AiFillProps) {
  const t = useT();
  const apiKey = useSettings((s) => s.apiKey);
  const model = useSettings((s) => s.aiModel);
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await generateFormatData(format, topic, { apiKey, model, signal: controller.signal });
      onResult(data);
      setOpen(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setError(err instanceof AiError ? t(AI_ERROR_KEYS[err.kind]) : t('ai.errUnknown'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-lilac/10 to-tangerine/10 px-4 py-3 text-start ring-1 ring-lilac/20 transition hover:ring-lilac/40"
      >
        <SparkIcon />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{t('ai.title')}</span>
          <span className="block text-xs text-ink/55">{t('ai.teaser')}</span>
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-gradient-to-br from-lilac/10 to-tangerine/10 p-4 ring-1 ring-lilac/25">
      <div className="flex items-center gap-2">
        <SparkIcon />
        <h3 className="flex-1 text-sm font-bold">{t('ai.title')}</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-ink/50 hover:text-ink">
          {t('export.close')}
        </button>
      </div>
      {!apiKey ? (
        <p className="text-sm text-ink/70">
          {t('ai.needKey')}{' '}
          <a href={hrefFor({ name: 'settings' })} className="font-semibold text-tangerine underline-offset-2 hover:underline">
            {t('nav.settings')}
          </a>
        </p>
      ) : (
        <>
          <TextArea value={topic} onChange={setTopic} rows={2} maxLength={300} placeholder={t('ai.placeholder')} />
          <p className="text-xs text-ink/50">{t('ai.replaceWarning')}</p>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2">
            {busy && (
              <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-xl px-3 py-2 text-sm font-semibold text-ink/60 hover:bg-white/60">
                {t('export.cancel')}
              </button>
            )}
            <button
              type="button"
              disabled={busy || topic.trim().length < 3}
              onClick={() => void run()}
              className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {busy ? t('ai.generating') : t('ai.generate')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SparkIcon() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-lilac shadow-sm">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9zM19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9z" />
      </svg>
    </span>
  );
}

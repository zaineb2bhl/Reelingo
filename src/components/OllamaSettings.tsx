import { useEffect, useRef, useState } from 'react';
import type { ModelOption } from '@/ai/models';
import { normaliseBaseUrl, testConnection, type ConnectionResult } from '@/ai/ollama';
import { CEFR_LEVELS } from '@/ai/types';
import { OLLAMA } from '@/config';
import { useT } from '@/i18n';
import { useSettings } from '@/state/settings';
import { OllamaHelp } from './OllamaHelp';
import { Field } from './ui/fields';

const selectClass = 'w-full rounded-xl border border-ink/12 bg-white px-3 py-2.5 text-[15px]';

/** Base URL, model dropdown (from /api/tags), CEFR level and a connection test. */
export function OllamaSettings() {
  const t = useT();
  const { ollamaUrl, ollamaModel, level, setOllamaUrl, setOllamaModel, setLevel } = useSettings();
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [testing, setTesting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = async (): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTesting(true);
    try {
      const res = await testConnection(ollamaModel, { baseUrl: ollamaUrl }, controller.signal);
      setResult(res);
      if (res.ok && !res.missingModel && res.model !== ollamaModel) setOllamaModel(res.model);
    } catch {
      // aborted by a newer test
    } finally {
      if (abortRef.current === controller) setTesting(false);
    }
  };

  // Populate the model list once when the screen opens.
  useEffect(() => {
    void run();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options: ModelOption[] = result?.options.length ? result.options : OLLAMA.models.map((m) => ({ id: m.id, role: m.role }));
  const roleLabel = (o: ModelOption): string => (o.role === 'other' ? (o.size ?? '') : t(`settings.modelRole.${o.role}`));

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink/65">{t('settings.aiIntro')}</p>
      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        {t('doc.privacy')}
      </p>

      <Field label={t('settings.ollamaUrl')}>
        {(id) => (
          <div className="flex gap-2">
            <input
              id={id}
              value={ollamaUrl}
              spellCheck={false}
              onChange={(e) => setOllamaUrl(e.target.value)}
              onBlur={() => setOllamaUrl(normaliseBaseUrl(ollamaUrl))}
              className="min-w-0 flex-1 rounded-xl border border-ink/12 bg-white px-3.5 py-2.5 font-mono text-sm outline-none focus:border-tangerine focus:ring-4 focus:ring-tangerine/15"
            />
            <button
              type="button"
              onClick={() => void run()}
              disabled={testing}
              className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {testing && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {testing ? t('settings.testing') : t('settings.test')}
            </button>
          </div>
        )}
      </Field>

      {result && !testing && (
        result.ok ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            {t('settings.connected', { n: result.options.length, model: result.model })}
          </p>
        ) : (
          <OllamaHelp error={result.error} baseUrl={normaliseBaseUrl(ollamaUrl)} model={ollamaModel} />
        )
      )}
      {result?.ok && result.missingModel && !testing && <OllamaHelp error="missing-model" baseUrl={normaliseBaseUrl(ollamaUrl)} model={result.missingModel} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.model')} hint={t('settings.modelHint')}>
          {(id) => (
            <select id={id} value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} className={selectClass}>
              {!options.some((o) => o.id === ollamaModel) && <option value={ollamaModel}>{ollamaModel}</option>}
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id}
                  {roleLabel(o) ? ` · ${roleLabel(o)}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('settings.level')}>
          {(id) => (
            <select id={id} value={level} onChange={(e) => setLevel(CEFR_LEVELS.find((l) => l === e.target.value) ?? 'B1')} className={selectClass}>
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
    </div>
  );
}

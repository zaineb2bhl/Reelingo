import { useState } from 'react';
import { Field, Section } from '@/components/ui/fields';
import { LOCALES, useT, type Locale } from '@/i18n';
import { AI_MODELS, useSettings, type AiModelId } from '@/state/settings';

const isLocale = (v: string): v is Locale => LOCALES.some((l) => l.id === v);
const isModel = (v: string): v is AiModelId => AI_MODELS.some((m) => m.id === v);

export function SettingsPage() {
  const t = useT();
  const { locale, apiKey, aiModel, setLocale, setApiKey, setAiModel } = useSettings();
  const [draft, setDraft] = useState(apiKey);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">{t('nav.settings')}</h1>

      <Section title={t('settings.language')}>
        <Field label={t('settings.uiLanguage')} hint={t('settings.uiLanguageHint')}>
          {(id) => (
            <select
              id={id}
              value={locale}
              onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
              className="w-full rounded-xl border border-ink/12 bg-white px-3 py-2.5 text-[15px]"
            >
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </Section>

      <Section title={t('settings.ai')}>
        <p className="text-sm text-ink/65">{t('settings.aiIntro')}</p>
        <Field label={t('settings.apiKey')} hint={t('settings.apiKeyHint')}>
          {(id) => (
            <div className="flex gap-2">
              <input
                id={id}
                type={show ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={draft}
                placeholder="sk-ant-…"
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSaved(false);
                }}
                className="min-w-0 flex-1 rounded-xl border border-ink/12 bg-white px-3.5 py-2.5 font-mono text-sm outline-none focus:border-tangerine focus:ring-4 focus:ring-tangerine/15"
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="rounded-xl px-3 text-sm font-semibold text-ink/60 hover:bg-ink/5">
                {show ? t('settings.hide') : t('settings.show')}
              </button>
            </div>
          )}
        </Field>
        <Field label={t('settings.model')}>
          {(id) => (
            <select
              id={id}
              value={aiModel}
              onChange={(e) => isModel(e.target.value) && setAiModel(e.target.value)}
              className="w-full rounded-xl border border-ink/12 bg-white px-3 py-2.5 text-[15px]"
            >
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {saved && <span className="text-sm font-medium text-emerald-700">{t('settings.saved')}</span>}
          {apiKey && (
            <button
              type="button"
              onClick={() => {
                setApiKey('');
                setDraft('');
                setSaved(false);
              }}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              {t('settings.clearKey')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setApiKey(draft);
              setSaved(true);
            }}
            className="rounded-xl bg-ink px-5 py-2 text-sm font-bold text-white"
          >
            {t('settings.saveKey')}
          </button>
        </div>
      </Section>

      <Section title={t('settings.privacy')}>
        <p className="text-sm leading-relaxed text-ink/65">{t('settings.privacyBody')}</p>
      </Section>
    </div>
  );
}

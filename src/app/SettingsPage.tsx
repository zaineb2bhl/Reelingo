import { OllamaSettings } from '@/components/OllamaSettings';
import { Field, Section } from '@/components/ui/fields';
import { LOCALES, useT, type Locale } from '@/i18n';
import { useSettings } from '@/state/settings';

const isLocale = (v: string): v is Locale => LOCALES.some((l) => l.id === v);

export function SettingsPage() {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const setLocale = useSettings((s) => s.setLocale);

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
        <OllamaSettings />
      </Section>

      <Section title={t('settings.privacy')}>
        <p className="text-sm leading-relaxed text-ink/65">{t('settings.privacyBody')}</p>
      </Section>
    </div>
  );
}

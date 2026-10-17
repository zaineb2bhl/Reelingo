import { useCallback } from 'react';
import { useSettings } from '@/state/settings';
import { en, type MessageKey } from './en';
import { fr } from './fr';
import { ar } from './ar';

export type Locale = 'en' | 'fr' | 'ar';
export const LOCALES: readonly { id: Locale; label: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'fr', label: 'Français', dir: 'ltr' },
  { id: 'ar', label: 'العربية', dir: 'rtl' },
];

const catalogs: Record<Locale, Partial<Record<MessageKey, string>>> = { en, fr, ar };

/** Text that a format module ships in its own folder. English is required. */
export type LocalizedText = { en: string } & Partial<Record<Exclude<Locale, 'en'>, string>>;

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = catalogs[locale][key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function pickText(locale: Locale, text: LocalizedText): string {
  return (locale === 'en' ? text.en : text[locale]) ?? text.en;
}

export function useLocale(): Locale {
  return useSettings((s) => s.locale);
}

export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string {
  const locale = useLocale();
  return useCallback((key, vars) => translate(locale, key, vars), [locale]);
}

/** Per-format message dictionaries, English required, others fall back to it. */
export function useMessages<K extends string>(messages: { en: Record<K, string> } & Partial<Record<Exclude<Locale, 'en'>, Partial<Record<K, string>>>>): Record<K, string> {
  const locale = useLocale();
  if (locale === 'en') return messages.en;
  return { ...messages.en, ...messages[locale] };
}

export type { MessageKey };

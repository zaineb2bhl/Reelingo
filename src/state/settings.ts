import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale } from '@/i18n';

interface SettingsState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'reelingo.settings',
      version: 2,
      // Older versions also stored an API key; drop it.
      migrate: (persisted) => ({ locale: (persisted as { locale?: Locale } | null)?.locale ?? 'en' }),
    },
  ),
);

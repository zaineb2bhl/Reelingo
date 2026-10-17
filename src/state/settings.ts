import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CEFR_LEVELS, type CefrLevel } from '@/ai/types';
import { OLLAMA } from '@/config';
import type { Locale } from '@/i18n';

interface SettingsState {
  locale: Locale;
  /** Local Ollama server used on the document path. */
  ollamaUrl: string;
  ollamaModel: string;
  /** Target learner level for generated content. */
  level: CefrLevel;
  setLocale: (locale: Locale) => void;
  setOllamaUrl: (url: string) => void;
  setOllamaModel: (model: string) => void;
  setLevel: (level: CefrLevel) => void;
}

interface PersistedSettings {
  locale?: Locale;
  ollamaUrl?: string;
  ollamaModel?: string;
  level?: string;
}

const isLevel = (v: string | undefined): v is CefrLevel => !!v && (CEFR_LEVELS as readonly string[]).includes(v);

/** Upgrades stored settings; older versions also stored an Anthropic API key, which is dropped. */
export function migrateSettings(persisted: unknown): Pick<SettingsState, 'locale' | 'ollamaUrl' | 'ollamaModel' | 'level'> {
  const p = (persisted ?? {}) as PersistedSettings;
  return {
    locale: p.locale ?? 'en',
    ollamaUrl: p.ollamaUrl ?? OLLAMA.baseUrl,
    ollamaModel: p.ollamaModel ?? OLLAMA.defaultModel,
    level: isLevel(p.level) ? p.level : 'B1',
  };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      locale: 'en',
      ollamaUrl: OLLAMA.baseUrl,
      ollamaModel: OLLAMA.defaultModel,
      level: 'B1',
      setLocale: (locale) => set({ locale }),
      setOllamaUrl: (ollamaUrl) => set({ ollamaUrl: ollamaUrl.trim() }),
      setOllamaModel: (ollamaModel) => set({ ollamaModel }),
      setLevel: (level) => set({ level }),
    }),
    {
      name: 'reelingo.settings',
      version: 3,
      migrate: migrateSettings,
    },
  ),
);

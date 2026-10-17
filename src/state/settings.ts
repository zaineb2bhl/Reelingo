import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale } from '@/i18n';

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
] as const;
export type AiModelId = (typeof AI_MODELS)[number]['id'];

interface SettingsState {
  locale: Locale;
  /** Anthropic API key, stored only in this browser's localStorage. */
  apiKey: string;
  aiModel: AiModelId;
  setLocale: (locale: Locale) => void;
  setApiKey: (apiKey: string) => void;
  setAiModel: (model: AiModelId) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      locale: 'en',
      apiKey: '',
      aiModel: 'claude-opus-5-5',
      setLocale: (locale) => set({ locale }),
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setAiModel: (aiModel) => set({ aiModel }),
    }),
    { name: 'reelingo.settings', version: 1 },
  ),
);

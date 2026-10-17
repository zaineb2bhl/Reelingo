import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnyFormat } from '@/formats/types';
import type { BrandPosition, LogoSize } from '@/render/branding';
import type { ThemeId } from '@/themes';

export interface BrandingSettings {
  watermark: string;
  watermarkPos: BrandPosition;
  logoId: string | null;
  logoName: string;
  logoPos: BrandPosition;
  logoSize: LogoSize;
}

export interface AudioSettings {
  sfx: boolean;
  sfxVolume: number;
  musicId: string | null;
  musicName: string;
  musicVolume: number;
  voiceId: string | null;
  voiceName: string;
  voiceVolume: number;
  duck: boolean;
}

/** The part of the editor that a saved project captures. */
export interface ProjectSnapshot {
  formatId: string;
  data: unknown;
  themeId: ThemeId;
  accent: string | null;
  branding: BrandingSettings;
  audio: AudioSettings;
  /** Where the content came from (e.g. a page of an uploaded document). Not shown in the video. */
  note?: string;
}

export const DEFAULT_BRANDING: BrandingSettings = {
  watermark: '',
  watermarkPos: 'top-left',
  logoId: null,
  logoName: '',
  logoPos: 'top-right',
  logoSize: 'md',
};

export const DEFAULT_AUDIO: AudioSettings = {
  sfx: true,
  sfxVolume: 0.8,
  musicId: null,
  musicName: '',
  musicVolume: 0.5,
  voiceId: null,
  voiceName: '',
  voiceVolume: 1,
  duck: true,
};

interface EditorState {
  /** Unsaved content per format id. Missing entries fall back to the format's defaults. */
  drafts: Record<string, unknown>;
  themeId: ThemeId;
  accent: string | null;
  branding: BrandingSettings;
  audio: AudioSettings;
  /** Project currently being edited, if it has been saved. */
  projectId: string | null;
  projectName: string;
  /** Format of the open project; autosave only writes when it matches. */
  projectFormatId: string | null;
  projectNote: string;
  previewMuted: boolean;
  setDraft: (formatId: string, data: unknown) => void;
  resetDraft: (formatId: string) => void;
  setTheme: (themeId: ThemeId) => void;
  setAccent: (accent: string | null) => void;
  setBranding: (patch: Partial<BrandingSettings>) => void;
  setAudio: (patch: Partial<AudioSettings>) => void;
  setProject: (id: string | null, name: string, formatId?: string | null) => void;
  setProjectName: (name: string) => void;
  setPreviewMuted: (muted: boolean) => void;
  loadSnapshot: (snapshot: ProjectSnapshot, projectId: string | null, name: string) => void;
}

export const useEditor = create<EditorState>()(
  persist(
    (set) => ({
      drafts: {},
      themeId: 'ink',
      accent: null,
      branding: DEFAULT_BRANDING,
      audio: DEFAULT_AUDIO,
      projectId: null,
      projectName: '',
      projectFormatId: null,
      projectNote: '',
      previewMuted: true,
      setDraft: (formatId, data) => set((s) => ({ drafts: { ...s.drafts, [formatId]: data } })),
      resetDraft: (formatId) =>
        set((s) => {
          const drafts = { ...s.drafts };
          delete drafts[formatId];
          return { drafts };
        }),
      setTheme: (themeId) => set({ themeId }),
      setAccent: (accent) => set({ accent }),
      setBranding: (patch) => set((s) => ({ branding: { ...s.branding, ...patch } })),
      setAudio: (patch) => set((s) => ({ audio: { ...s.audio, ...patch } })),
      setProject: (projectId, projectName, projectFormatId = null) =>
        set(projectId === null ? { projectId, projectName, projectFormatId, projectNote: '' } : { projectId, projectName, projectFormatId }),
      setProjectName: (projectName) => set({ projectName }),
      setPreviewMuted: (previewMuted) => set({ previewMuted }),
      loadSnapshot: (snap, projectId, projectName) =>
        set((s) => ({
          drafts: { ...s.drafts, [snap.formatId]: snap.data },
          themeId: snap.themeId,
          accent: snap.accent,
          branding: { ...DEFAULT_BRANDING, ...snap.branding },
          audio: { ...DEFAULT_AUDIO, ...snap.audio },
          projectId,
          projectName,
          projectFormatId: projectId ? snap.formatId : null,
          projectNote: snap.note ?? '',
        })),
    }),
    {
      name: 'reelingo.editor',
      version: 1,
      // Browsers block audio until a click, so the preview always starts muted.
      partialize: ({ previewMuted: _muted, ...rest }) => rest,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<EditorState>;
        return {
          ...current,
          ...p,
          branding: { ...DEFAULT_BRANDING, ...p.branding },
          audio: { ...DEFAULT_AUDIO, ...p.audio },
        };
      },
    },
  ),
);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Fills top-level fields missing from saved data with the format's defaults,
 * so drafts saved by an older version never crash the renderer.
 */
export function withDefaults(format: AnyFormat, data: unknown): unknown {
  if (!isRecord(data) || !isRecord(format.defaults)) return data ?? format.defaults;
  const merged: Record<string, unknown> = { ...format.defaults };
  for (const [k, v] of Object.entries(data)) {
    const def = format.defaults[k];
    if (def === undefined || typeof def === typeof v) merged[k] = v;
  }
  return merged;
}

/** Current content for a format: the draft (patched with defaults) or the sample data. */
export function useDraft(format: AnyFormat): unknown {
  const draft = useEditor((s) => s.drafts[format.id]);
  return draft === undefined ? format.defaults : withDefaults(format, draft);
}

export function snapshotFor(format: AnyFormat): ProjectSnapshot {
  const s = useEditor.getState();
  return {
    formatId: format.id,
    data: format.id in s.drafts ? withDefaults(format, s.drafts[format.id]) : format.defaults,
    themeId: s.themeId,
    accent: s.accent,
    branding: s.branding,
    audio: s.audio,
    note: s.projectId && s.projectFormatId === format.id && s.projectNote ? s.projectNote : undefined,
  };
}

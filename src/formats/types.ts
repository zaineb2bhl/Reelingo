import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { LocalizedText } from '@/i18n';
import type { Ctx } from '@/scene/types';
import type { Theme } from '@/themes';

/** Validation messages keyed by dotted field path, e.g. "options.1.text". */
export type FieldErrors = Readonly<Record<string, string>>;

export interface FormProps<T> {
  value: T;
  onChange: (next: T) => void;
  errors: FieldErrors;
}

export const SFX_NAMES = ['tick', 'pop', 'whoosh', 'correct', 'wrong', 'reveal'] as const;
export type SfxName = (typeof SFX_NAMES)[number];

/** A sound effect to play at time `t` (seconds). */
export interface Cue {
  t: number;
  sfx: SfxName;
  gain?: number;
}

/**
 * Everything a video format needs. One folder under `src/formats/` exporting
 * `defineFormat({...})` as default is all it takes to add a new format.
 */
export interface FormatModule<T> {
  /** Stable id used in URLs and saved projects. */
  id: string;
  /** Position on the home grid. */
  order: number;
  title: LocalizedText;
  description: LocalizedText;
  /** Hide from the home grid (e.g. examples, work in progress). */
  hidden?: boolean;
  schema: z.ZodType<T>;
  defaults: T;
  Form: ComponentType<FormProps<T>>;
  /** Draw frame at time `t` on a 1080x1920 canvas. Must be deterministic. */
  render: (ctx: Ctx, data: T, t: number, theme: Theme) => void;
  /** Total length in seconds. */
  duration: (data: T) => number;
  /** Sound effect cues, optional. */
  cues?: (data: T) => Cue[];
}

/** Type-erased format as stored in the registry. Data is validated by `schema`. */
export type AnyFormat = FormatModule<unknown>;

export function defineFormat<T>(format: FormatModule<T>): AnyFormat {
  // Erasing T is safe: the editor only ever feeds a format data produced by its
  // own defaults / form / schema.
  return format as unknown as AnyFormat;
}

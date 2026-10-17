import { z } from 'zod';
import type { FieldErrors } from './types';

/** "Length per card" presets shared by formats that have timed cards. */
export const PACES = ['quick', 'standard', 'relaxed'] as const;
export type Pace = (typeof PACES)[number];
export const PACE_SECONDS: Record<Pace, number> = { quick: 5, standard: 7, relaxed: 10 };
export const paceSchema = z.enum(PACES);

/** Flattens Zod issues into `{ "options.1.text": "message" }`. */
export function issuesToErrors(error: z.ZodError | undefined): FieldErrors {
  if (!error) return {};
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

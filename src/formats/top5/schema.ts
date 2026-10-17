import { z } from 'zod';
import { paceSchema, type Pace } from '../shared';

export const rankItemSchema = z.object({
  text: z.string().trim().min(1, 'Write this item').max(60),
  detail: z.string().trim().max(90),
});

export const top5Schema = z.object({
  title: z.string().trim().min(1, 'Write a title').max(100),
  /** items[0] is #1. */
  items: z.array(rankItemSchema).min(3, 'Add at least 3 items').max(5, 'Use at most 5 items'),
  pace: paceSchema,
});

export type Top5Data = z.infer<typeof top5Schema>;
export type RankItem = z.infer<typeof rankItemSchema>;

/** Seconds each item stays in focus before the next one is revealed. */
export const ITEM_SECONDS: Record<Pace, number> = { quick: 1.6, standard: 2.4, relaxed: 3.4 };

export const top5Defaults: Top5Data = {
  title: 'Top 5 *phrasal verbs* for the office',
  items: [
    { text: 'Follow up', detail: 'check back on something later' },
    { text: 'Set up', detail: 'arrange a meeting or a system' },
    { text: 'Run by', detail: 'ask someone’s opinion first' },
    { text: 'Put off', detail: 'delay doing something' },
    { text: 'Fill in', detail: 'replace a colleague for a while' },
  ],
  pace: 'standard',
};

import { z } from 'zod';
import { paceSchema } from '../shared';

export const wordOfDaySchema = z.object({
  label: z.string().trim().max(30),
  word: z.string().trim().min(1, 'Write the word').max(40),
  ipa: z.string().trim().max(60),
  partOfSpeech: z.string().trim().max(30),
  definition: z.string().trim().min(1, 'Write a definition').max(220),
  example: z.string().trim().max(220),
  translation: z.string().trim().max(140),
  highlight: z.boolean(),
  pace: paceSchema,
});

export type WordOfDayData = z.infer<typeof wordOfDaySchema>;

export const wordOfDayDefaults: WordOfDayData = {
  label: 'Word of the day',
  word: 'serendipity',
  ipa: 'ˌser.ənˈdɪp.ə.ti',
  partOfSpeech: 'noun',
  definition: 'The luck of finding something good or useful without looking for it.',
  example: 'Meeting my best friend on a delayed train was pure serendipity.',
  translation: 'FR : un heureux hasard',
  highlight: true,
  pace: 'standard',
};

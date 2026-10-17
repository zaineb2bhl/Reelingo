import { z } from 'zod';
import { paceSchema } from '../shared';

export const quizOptionSchema = z.object({
  text: z.string().trim().min(1, 'Write the answer option').max(80),
  correct: z.boolean(),
});

export const quizSchema = z.object({
  label: z.string().trim().max(30),
  question: z.string().trim().min(1, 'Write a question').max(160),
  options: z
    .array(quizOptionSchema)
    .min(2, 'Add at least 2 options')
    .max(4, 'Use at most 4 options')
    .refine((opts) => opts.some((o) => o.correct), 'Mark at least one option as correct'),
  pace: paceSchema,
  explanation: z.string().trim().max(240),
});

export type QuizData = z.infer<typeof quizSchema>;
export type QuizOption = z.infer<typeof quizOptionSchema>;

export const quizDefaults: QuizData = {
  label: 'Quick quiz',
  question: 'Which sentence is *correct*?',
  options: [
    { text: 'She don’t like coffee.', correct: false },
    { text: 'She doesn’t like coffee.', correct: true },
    { text: 'She not like coffee.', correct: false },
  ],
  pace: 'quick',
  explanation: 'With he / she / it, use *doesn’t* + the base verb.',
};

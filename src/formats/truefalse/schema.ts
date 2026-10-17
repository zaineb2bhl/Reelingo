import { z } from 'zod';
import { paceSchema } from '../shared';

export const trueFalseSchema = z.object({
  label: z.string().trim().max(30),
  statement: z.string().trim().min(1, 'Write a statement').max(180),
  answer: z.boolean(),
  trueLabel: z.string().trim().min(1, 'Required').max(14),
  falseLabel: z.string().trim().min(1, 'Required').max(14),
  pace: paceSchema,
  explanation: z.string().trim().max(240),
});

export type TrueFalseData = z.infer<typeof trueFalseSchema>;

export const trueFalseDefaults: TrueFalseData = {
  label: 'True or false?',
  statement: '“I’m *boring*” means the same as “I’m bored”.',
  answer: false,
  trueLabel: 'True',
  falseLabel: 'False',
  pace: 'quick',
  explanation: '*Bored* is how you feel. *Boring* describes something (or someone) that makes others feel bored.',
};

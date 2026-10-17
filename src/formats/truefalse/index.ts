import { defineFormat } from '../types';
import { TrueFalseForm } from './Form';
import { renderTrueFalse, trueFalseCues, trueFalseDuration } from './render';
import { trueFalseDefaults, trueFalseSchema, type TrueFalseData } from './schema';

export default defineFormat<TrueFalseData>({
  id: 'true-false',
  order: 3,
  title: { en: 'True or False', fr: 'Vrai ou faux', ar: 'صح أم خطأ' },
  description: {
    en: 'One statement, a countdown, then a stamped TRUE or FALSE with an optional explanation.',
    fr: 'Une affirmation, un compte à rebours, puis VRAI ou FAUX avec une explication.',
    ar: 'عبارة واحدة وعدّ تنازلي ثم ختم صح أو خطأ مع شرح اختياري.',
  },
  schema: trueFalseSchema,
  defaults: trueFalseDefaults,
  Form: TrueFalseForm,
  render: renderTrueFalse,
  duration: trueFalseDuration,
  cues: trueFalseCues,
  aiGuide:
    'label: ≤30 chars, e.g. "True or false?". statement: ≤180 chars, one clear claim, may wrap a key word in *stars*. answer: boolean. trueLabel / falseLabel: ≤14 chars in the video language (e.g. "True"/"False", "Vrai"/"Faux", "صح"/"خطأ"). pace: "quick" | "standard" | "relaxed". explanation: ≤240 chars.',
});

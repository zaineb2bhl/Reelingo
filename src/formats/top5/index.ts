import { defineFormat } from '../types';
import { Top5Form } from './Form';
import { renderTop5, top5Cues, top5Duration } from './render';
import { top5Defaults, top5Schema, type Top5Data } from './schema';

export default defineFormat<Top5Data>({
  id: 'top5',
  order: 2,
  title: { en: 'Top 5 ranking', fr: 'Top 5', ar: 'أفضل 5' },
  description: {
    en: 'Count down from #5 to #1, with a drumroll and confetti for the winner.',
    fr: 'Du n°5 au n°1, avec roulement de tambour et confettis pour le gagnant.',
    ar: 'عدّ تنازلي من 5 إلى 1 مع احتفال بالمركز الأول.',
  },
  schema: top5Schema,
  defaults: top5Defaults,
  Form: Top5Form,
  render: renderTop5,
  duration: top5Duration,
  cues: top5Cues,
  aiGuide:
    'title: ≤100 chars, may wrap a key phrase in *stars*. items: 3–5 entries, items[0] is #1 (the best / most important); text ≤60 chars, detail ≤90 chars (one short line). pace: "quick" | "standard" | "relaxed".',
});

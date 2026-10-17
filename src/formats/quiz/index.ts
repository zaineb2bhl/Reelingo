import { defineFormat } from '../types';
import { QuizForm } from './Form';
import { quizCues, quizDuration, renderQuiz } from './render';
import { quizDefaults, quizSchema, type QuizData } from './schema';

export default defineFormat<QuizData>({
  id: 'quiz',
  order: 1,
  title: { en: 'Quiz', fr: 'Quiz', ar: 'اختبار سريع' },
  description: {
    en: 'A question with up to four answers, a countdown and a big reveal.',
    fr: 'Une question, jusqu’à quatre réponses, un compte à rebours et la révélation.',
    ar: 'سؤال مع حتى أربع إجابات وعدّ تنازلي ثم كشف الإجابة.',
  },
  schema: quizSchema,
  defaults: quizDefaults,
  Form: QuizForm,
  render: renderQuiz,
  duration: quizDuration,
  cues: quizCues,
  aiGuide:
    'label: short header (≤30 chars), e.g. "Quick quiz". question: ≤160 chars, may wrap one key word in *stars*. options: 2–4 items, each text ≤80 chars, set correct=true on exactly the right answer(s), plausible distractors. pace: "quick" | "standard" | "relaxed". explanation: ≤240 chars, why the answer is right, may use *stars*.',
});

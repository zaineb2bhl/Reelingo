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
});

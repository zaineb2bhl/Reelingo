import { defineFormat } from '../types';
import { WordOfDayForm } from './Form';
import { renderWordOfDay, wordOfDayCues, wordOfDayDuration } from './render';
import { wordOfDayDefaults, wordOfDaySchema, type WordOfDayData } from './schema';

export default defineFormat<WordOfDayData>({
  id: 'word-of-the-day',
  order: 4,
  title: { en: 'Word of the day', fr: 'Mot du jour', ar: 'كلمة اليوم' },
  description: {
    en: 'The word, its pronunciation, meaning, an example and a translation, layered in.',
    fr: 'Le mot, sa prononciation, son sens, un exemple et une traduction.',
    ar: 'الكلمة ونطقها ومعناها ومثال وترجمة تظهر تباعًا.',
  },
  schema: wordOfDaySchema,
  defaults: wordOfDayDefaults,
  Form: WordOfDayForm,
  render: renderWordOfDay,
  duration: wordOfDayDuration,
  cues: wordOfDayCues,
  aiGuide:
    'label: ≤30 chars, e.g. "Word of the day". word: ≤40 chars. ipa: IPA transcription without slashes, ≤60 chars. partOfSpeech: ≤30 chars. definition: ≤220 chars, learner-friendly. example: ≤220 chars, a natural sentence that contains the word. translation: ≤140 chars, prefixed with a language code like "FR : …" if a translation is requested, else empty. highlight: true. pace: "quick" | "standard" | "relaxed".',
});

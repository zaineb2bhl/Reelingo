import type { Lang, Pos } from './types';

/** Text the engine writes into videos, in the language of the document. */
export interface ContentStrings {
  gapLabel: string;
  meaningLabel: string;
  meaningQuestion: (term: string) => string;
  explainAnswer: (term: string, definition: string) => string;
  fromText: (quote: string) => string;
  tfLabel: string;
  trueLabel: string;
  falseLabel: string;
  means: (term: string, definition: string) => string;
  textSays: (quote: string) => string;
  wotdLabel: string;
  top5Title: (count: number, topic: string) => string;
  top5PhrasalTitle: (count: number, topic: string) => string;
  thisLesson: string;
  pos: Record<Pos, string>;
}

export const CONTENT_STRINGS: Record<Lang, ContentStrings> = {
  en: {
    gapLabel: 'Fill the gap',
    meaningLabel: 'Quick quiz',
    meaningQuestion: (t) => `What does *${t}* mean?`,
    explainAnswer: (t, d) => `*${t}*: ${d}`,
    fromText: (q) => `From the text: “${q}”`,
    tfLabel: 'True or false?',
    trueLabel: 'True',
    falseLabel: 'False',
    means: (t, d) => `“${t}” means ${d}`,
    textSays: (q) => `The text says: “${q}”`,
    wotdLabel: 'Word of the day',
    top5Title: (n, topic) => `Top ${n} *key words*: ${topic}`,
    top5PhrasalTitle: (n, topic) => `Top ${n} *phrasal verbs*: ${topic}`,
    thisLesson: 'this lesson',
    pos: { noun: 'noun', verb: 'verb', adjective: 'adjective', adverb: 'adverb', phrasal: 'phrasal verb' },
  },
  fr: {
    gapLabel: 'Complète la phrase',
    meaningLabel: 'Quiz express',
    meaningQuestion: (t) => `Que signifie *${t}* ?`,
    explainAnswer: (t, d) => `*${t}* : ${d}`,
    fromText: (q) => `D’après le texte : « ${q} »`,
    tfLabel: 'Vrai ou faux ?',
    trueLabel: 'Vrai',
    falseLabel: 'Faux',
    means: (t, d) => `« ${t} » signifie ${d}`,
    textSays: (q) => `Le texte dit : « ${q} »`,
    wotdLabel: 'Mot du jour',
    top5Title: (n, topic) => `Top ${n} des *mots clés* : ${topic}`,
    top5PhrasalTitle: (n, topic) => `Top ${n} des *verbes à particule* : ${topic}`,
    thisLesson: 'la leçon',
    pos: { noun: 'nom', verb: 'verbe', adjective: 'adjectif', adverb: 'adverbe', phrasal: 'verbe à particule' },
  },
  ar: {
    gapLabel: 'أكمل الفراغ',
    meaningLabel: 'اختبار سريع',
    meaningQuestion: (t) => `ما معنى *${t}*؟`,
    explainAnswer: (t, d) => `*${t}*: ${d}`,
    fromText: (q) => `من النص: «${q}»`,
    tfLabel: 'صح أم خطأ؟',
    trueLabel: 'صح',
    falseLabel: 'خطأ',
    means: (t, d) => `«${t}» تعني ${d}`,
    textSays: (q) => `يقول النص: «${q}»`,
    wotdLabel: 'كلمة اليوم',
    top5Title: (n, topic) => `أهم ${n} *كلمات*: ${topic}`,
    top5PhrasalTitle: (n, topic) => `أهم ${n} *أفعال مركّبة*: ${topic}`,
    thisLesson: 'هذا الدرس',
    pos: { noun: 'اسم', verb: 'فعل', adjective: 'صفة', adverb: 'ظرف', phrasal: 'فعل مركّب' },
  },
};

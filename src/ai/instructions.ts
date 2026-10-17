import { DOCUMENT_GENERATION } from '@/config';

/**
 * Splits "5 quiz questions on the past tense" into a count (5) and a topic
 * ("the past tense") for retrieval. Format words and counts would otherwise
 * distort BM25 ("quiz" rarely appears in the lesson itself).
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
  'واحد': 1, 'اثنين': 2, 'اثنان': 2, 'ثلاث': 3, 'ثلاثة': 3, 'أربع': 4, 'أربعة': 4, 'خمس': 5, 'خمسة': 5,
};

// Words that describe the request rather than the lesson content.
const REQUEST_WORDS = new Set(
  `quiz quizzes question questions true false true/false statement statements word words day daily top ranking rank list items item
  video videos card cards about on of the a an for from in with please make create give generate some
  vrai faux mot mots jour question questions quiz liste sur de des du la le les pour avec une un en
  اختبار أسئلة سؤال صح خطأ كلمة كلمات اليوم عن حول في من`
    .split(/\s+/)
    .filter(Boolean),
);

export interface ParsedInstructions {
  count: number;
  topic: string;
}

/** One ranking is usually what a teacher means by "top 5 …"; other formats default to a small batch. */
export const defaultCountFor = (formatId: string): number => (formatId === 'top5' ? 1 : DOCUMENT_GENERATION.defaultCount);

const TOP_WORDS = new Set(['top', 'أفضل', 'أهم']);

export function parseInstructions(text: string, fallbackCount: number = DOCUMENT_GENERATION.defaultCount): ParsedInstructions {
  const { maxCount } = DOCUMENT_GENERATION;
  let count: number | null = null;
  let previous = '';
  const kept: string[] = [];
  for (const raw of text.trim().split(/\s+/).filter(Boolean)) {
    const word = raw.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}/]+$/gu, '');
    if (!word) continue;
    const digits = /^\d{1,2}$/.test(word) ? Number(word) : (NUMBER_WORDS[word] ?? null);
    const afterTop = TOP_WORDS.has(previous);
    previous = word;
    // "top 5" is the length of a ranking, not a number of videos.
    if (afterTop && digits !== null) continue;
    if (count === null && digits !== null && digits > 0) {
      count = digits;
      continue;
    }
    if (REQUEST_WORDS.has(word)) continue;
    kept.push(raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
  }
  return {
    count: Math.min(maxCount, Math.max(1, count ?? fallbackCount)),
    topic: kept.filter(Boolean).join(' '),
  };
}

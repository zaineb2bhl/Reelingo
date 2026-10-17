const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One-line description of a generated item, for the results list. */
export function summarizeItem(formatId: string, data: unknown): string {
  if (!isRecord(data)) return '';
  const field = formatId === 'quiz' ? 'question' : formatId === 'true-false' ? 'statement' : formatId === 'word-of-the-day' ? 'word' : 'title';
  const value = data[field];
  return typeof value === 'string' ? value.replace(/\*/g, '') : '';
}

/** Formats with a document generator (the hidden starter format has none). */
export const DOCUMENT_FORMATS: readonly string[] = ['quiz', 'true-false', 'word-of-the-day', 'top5'];

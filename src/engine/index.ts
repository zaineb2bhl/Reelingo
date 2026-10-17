import { hashString, mulberry32 } from '@/scene/random';
import { analyze, type Analysis } from './analyze';
import { generateQuizzes, generateTop5, generateTrueFalse, generateWordOfDay, type GenContext, type GeneratedVideo } from './generators';
import type { Lexicon } from './lexicon';
import { CONTENT_STRINGS } from './strings';
import type { Lang, SourceDocument } from './types';

export type { GeneratedVideo } from './generators';

export { MAX_SERIES_VIDEOS } from './limits';

export interface SeriesRequest {
  /** Number of videos wanted per format id. */
  counts: Record<string, number>;
  /** Optional instructions used to focus on part of the document. */
  query: string;
}

export interface SeriesResult {
  videos: GeneratedVideo[];
  /** Formats for which the document didn't contain enough material. */
  shortfalls: Array<{ formatId: string; requested: number; made: number }>;
  lang: Lang;
  /** False when instructions were given but nothing in the document matched them. */
  matchedQuery: boolean;
  termCount: number;
}

const GENERATORS: Record<string, (ctx: GenContext, count: number) => GeneratedVideo[]> = {
  quiz: generateQuizzes,
  'true-false': generateTrueFalse,
  'word-of-the-day': generateWordOfDay,
  top5: generateTop5,
};

/** Order matters: formats that need one strong term each go first. */
const ORDER = ['word-of-the-day', 'quiz', 'true-false', 'top5'];

/** Runs one format's rule-based generator on an existing analysis. */
export function generateForFormat(analysis: Analysis, formatId: string, count: number, seed = ''): GeneratedVideo[] {
  const generate = GENERATORS[formatId];
  if (!generate || count <= 0) return [];
  const ctx: GenContext = {
    a: analysis,
    s: CONTENT_STRINGS[analysis.lang],
    used: new Set(),
    rand: mulberry32(hashString(`${analysis.name}|${seed}|${formatId}`)),
  };
  return generate(ctx, count);
}

/**
 * Builds a series of videos from a document using only the document itself
 * plus the bundled English lexicon. Deterministic: the same document and
 * request always give the same videos.
 */
export function generateSeries(doc: SourceDocument, req: SeriesRequest, lexicon: Lexicon | null): SeriesResult {
  const analysis = analyze(doc, lexicon, req.query);
  const ctx: GenContext = {
    a: analysis,
    s: CONTENT_STRINGS[analysis.lang],
    used: new Set(),
    rand: mulberry32(hashString(`${doc.name}|${req.query}|${doc.blocks.length}`)),
  };
  const byFormat = new Map<string, GeneratedVideo[]>();
  const shortfalls: SeriesResult['shortfalls'] = [];
  for (const formatId of ORDER) {
    const requested = Math.max(0, Math.floor(req.counts[formatId] ?? 0));
    const generate = GENERATORS[formatId];
    if (!requested || !generate) continue;
    const videos = generate(ctx, requested);
    byFormat.set(formatId, videos);
    if (videos.length < requested) shortfalls.push({ formatId, requested, made: videos.length });
  }
  // Return in the order the formats were requested.
  const videos = Object.keys(req.counts).flatMap((id) => byFormat.get(id) ?? []);
  return { videos, shortfalls, lang: analysis.lang, matchedQuery: analysis.matchedQuery || !req.query.trim(), termCount: analysis.terms.length };
}

export { analyze } from './analyze';
export { createLexicon, loadLexicon, type Lexicon } from './lexicon';
export { readDocument, DocumentError, DOCUMENT_ACCEPT } from './reader';

import type { Lang } from '@/engine/types';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** A sentence (or table row) retrieved from the document for the teacher's instructions. */
export interface RetrievedPassage {
  id: number;
  text: string;
  page?: number;
  heading: string;
  /** BM25 score (or term density when there is no topic). */
  score: number;
}

export interface GenerationRequest {
  formatId: string;
  /** How many videos to produce. */
  count: number;
  /** The teacher's instructions as typed. */
  instructions: string;
  /** Instructions without count / format words, used for retrieval. */
  topic: string;
  /** Top passages from retrieval; the only material a generator may use. */
  passages: RetrievedPassage[];
  lang: Lang;
  level: CefrLevel;
  signal?: AbortSignal;
}

export type GenerationOrigin = 'llm' | 'rules';

/** Why an item came from the rule-based engine instead of the local model. */
export type FallbackReason =
  | 'not-configured'
  | 'not-running'
  | 'cors'
  | 'model-missing'
  | 'timeout'
  | 'invalid'
  | 'ungrounded'
  | 'insufficient'
  | 'error';

export interface GeneratedItem {
  formatId: string;
  /** Data for the template form, valid against the format's Zod schema. */
  data: unknown;
  /** Exact sentence from the document that supports the item ('' if none). */
  supportingSentence: string;
  /** Human-readable location (page, section, quote). */
  source: string;
  origin: GenerationOrigin;
  /** Model calls it took (0 for rule-based items). */
  attempts: number;
  model?: string;
  fallbackReason?: FallbackReason;
}

export interface GenerationOutcome {
  items: GeneratedItem[];
  /** One entry per requested item that could not be produced, with the reason. */
  failures: FallbackReason[];
}

/** Anything that can turn retrieved passages into template content. */
export interface ContentGenerator {
  readonly id: string;
  /** Shown in the UI (e.g. the model name). */
  readonly label: string;
  generate(request: GenerationRequest, onItem?: (item: GeneratedItem) => void): Promise<GenerationOutcome>;
}

import type { Analysis } from '@/engine/analyze';
import { generateForFormat } from '@/engine/index';
import type { ContentGenerator, GeneratedItem, GenerationOutcome, GenerationRequest } from './types';

/** Runs the deterministic engine and turns its videos into generator items. */
export function ruleCandidates(a: Analysis, formatId: string, count: number, seed = ''): GeneratedItem[] {
  return generateForFormat(a, formatId, count, seed).map((video) => ({
    formatId: video.formatId,
    data: video.data,
    supportingSentence: video.passage === undefined ? '' : (a.passages[video.passage]?.text ?? ''),
    source: video.source,
    origin: 'rules',
    attempts: 0,
  }));
}

/**
 * The deterministic engine behind the ContentGenerator interface. Its
 * candidates are computed up front (in the worker, next to the analysis),
 * so it is always available as a fallback.
 */
export class RuleBasedGenerator implements ContentGenerator {
  readonly id = 'rules';
  readonly label = 'Rule-based engine';

  constructor(private readonly candidates: readonly GeneratedItem[]) {}

  async generate(request: GenerationRequest, onItem?: (item: GeneratedItem) => void): Promise<GenerationOutcome> {
    const items = this.candidates.filter((c) => c.formatId === request.formatId).slice(0, request.count);
    for (const item of items) onItem?.(item);
    const failures = Array.from({ length: Math.max(0, request.count - items.length) }, () => 'insufficient' as const);
    return { items, failures };
  }
}

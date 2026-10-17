import { OllamaError } from './ollama';
import { RuleBasedGenerator } from './ruleBasedGenerator';
import type { CefrLevel, ContentGenerator, FallbackReason, GeneratedItem, GenerationRequest } from './types';
import type { PreparedDocument } from './prepare';

export interface PipelineOptions {
  prepared: PreparedDocument;
  formatId: string;
  count: number;
  instructions: string;
  topic: string;
  level: CefrLevel;
  /** The local model, or null when it isn't available / configured. */
  primary: ContentGenerator | null;
  onItem?: (item: GeneratedItem) => void;
  signal?: AbortSignal;
}

export interface PipelineResult {
  items: GeneratedItem[];
  /** Set when the primary generator failed as a whole (not running, CORS, …). */
  primaryError?: FallbackReason;
  usedFallback: boolean;
}

export function reasonOf(err: unknown): FallbackReason {
  if (err instanceof OllamaError) {
    if (err.kind === 'not-running' || err.kind === 'cors' || err.kind === 'model-missing' || err.kind === 'timeout') return err.kind;
    if (err.kind === 'bad-response') return 'invalid';
  }
  return 'error';
}

const fingerprint = (item: GeneratedItem): string => JSON.stringify(item.data);

/**
 * Document path: ask the primary generator (local LLM) for the items, then fill
 * every gap with the rule-based engine's candidates, labelling why. The result
 * always contains something usable when the document has enough material.
 */
export async function runGeneration(opts: PipelineOptions): Promise<PipelineResult> {
  const { prepared, formatId, count, signal } = opts;
  const request: GenerationRequest = {
    formatId,
    count,
    instructions: opts.instructions,
    topic: opts.topic,
    passages: prepared.passages,
    lang: prepared.lang,
    level: opts.level,
    signal,
  };

  const items: GeneratedItem[] = [];
  let failures: FallbackReason[] = [];
  let primaryError: FallbackReason | undefined;

  if (opts.primary) {
    try {
      const outcome = await opts.primary.generate(request, opts.onItem);
      items.push(...outcome.items.slice(0, count));
      failures = outcome.failures;
    } catch (err) {
      if (signal?.aborted) throw err;
      primaryError = reasonOf(err);
    }
  } else {
    primaryError = 'not-configured';
  }

  const missing = count - items.length;
  if (missing > 0) {
    const taken = new Set(items.map(fingerprint));
    const rules = new RuleBasedGenerator(prepared.ruleItems.filter((c) => !taken.has(fingerprint(c))));
    const outcome = await rules.generate({ ...request, count: missing });
    outcome.items.forEach((item, i) => {
      const labelled: GeneratedItem = { ...item, fallbackReason: primaryError ?? failures[i] ?? 'insufficient' };
      items.push(labelled);
      opts.onItem?.(labelled);
    });
  }

  return { items, primaryError, usedFallback: items.some((i) => i.origin === 'rules') };
}

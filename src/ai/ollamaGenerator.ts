import { OLLAMA } from '@/config';
import { checkItem, parseModelJson, passageFor, type CheckFailure } from './checks';
import { clampBatchSize } from './models';
import { chat, OllamaError, type FetchLike } from './ollama';
import { buildMessages } from './prompts';
import { isLlmFormat, llmJsonSchema } from './schemas';
import type { ContentGenerator, FallbackReason, GeneratedItem, GenerationOutcome, GenerationRequest, RetrievedPassage } from './types';

/** One model call, as recorded for the evaluation harness. */
export interface AttemptLog {
  formatId: string;
  model: string;
  attempt: number;
  requested: number;
  /** Items in the response (parsed JSON). */
  returned: number;
  /** Items that passed schema validation. */
  valid: number;
  /** Valid items whose supporting sentence is in the passages. */
  grounded: number;
  accepted: number;
  parseError: boolean;
  ms: number;
  errors: string[];
}

export interface OllamaGeneratorOptions {
  model: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  batchSize?: number;
  maxPassages?: number;
  timeoutMs?: number;
  /** IPA lookup from the English dictionary (Word of the day). */
  ipa?: (word: string) => string | undefined;
  onAttempt?: (log: AttemptLog) => void;
}

const sourceOf = (p: RetrievedPassage | undefined): string =>
  [p?.page ? `p. ${p.page}` : '', p?.heading ?? '', p ? `“${p.text.length > 110 ? `${p.text.slice(0, 109)}…` : p.text}”` : ''].filter(Boolean).join(' · ');

/**
 * The local LLM behind the ContentGenerator interface. Each batch: prompt with
 * at most N retrieved passages → structured JSON → Zod + grounding + format
 * checks → one retry with the errors → anything still failing is reported so
 * the pipeline can fill it from the rule-based engine.
 */
export class OllamaGenerator implements ContentGenerator {
  readonly id = 'ollama';
  readonly label: string;

  constructor(private readonly opts: OllamaGeneratorOptions) {
    this.label = opts.model;
  }

  async generate(request: GenerationRequest, onItem?: (item: GeneratedItem) => void): Promise<GenerationOutcome> {
    const { formatId } = request;
    if (!isLlmFormat(formatId)) return { items: [], failures: Array.from({ length: request.count }, () => 'invalid' as const) };
    const batchSize = clampBatchSize(this.opts.batchSize ?? OLLAMA.generation.batchSize);
    const maxPassages = this.opts.maxPassages ?? OLLAMA.generation.maxPassages;
    const items: GeneratedItem[] = [];
    const failures: FallbackReason[] = [];
    const used = new Set<string>();
    const seenData = new Set<string>();

    while (items.length + failures.length < request.count) {
      const want = Math.min(batchSize, request.count - items.length - failures.length);
      // Unused passages first, so each batch can cover new material.
      const passages = [...request.passages.filter((p) => !used.has(p.text)), ...request.passages.filter((p) => used.has(p.text))].slice(0, maxPassages);
      let accepted = 0;
      let lastFailure: CheckFailure | 'insufficient' = 'insufficient';
      let errors: string[] = [];

      for (let attempt = 1; attempt <= 1 + OLLAMA.generation.retries && accepted < want; attempt++) {
        const need = want - accepted;
        const started = performance.now();
        const log: AttemptLog = { formatId, model: this.opts.model, attempt, requested: need, returned: 0, valid: 0, grounded: 0, accepted: 0, parseError: false, ms: 0, errors: [] };
        let raw: unknown;
        try {
          const response = await chat(
            {
              model: this.opts.model,
              messages: buildMessages({ formatId, passages, count: need, instructions: request.instructions, lang: request.lang, level: request.level, avoid: [...used], errors }),
              format: llmJsonSchema(formatId, need),
            },
            { baseUrl: this.opts.baseUrl, fetchImpl: this.opts.fetchImpl, timeoutMs: this.opts.timeoutMs },
            request.signal,
          );
          raw = parseModelJson(response.content);
        } catch (err) {
          log.ms = performance.now() - started;
          if (err instanceof OllamaError || request.signal?.aborted) {
            this.opts.onAttempt?.({ ...log, errors: [String(err)] });
            // Environment problems end generation; keep what we already have.
            if (!items.length) throw err;
            const reason: FallbackReason = err instanceof OllamaError && (err.kind === 'timeout' || err.kind === 'not-running' || err.kind === 'cors') ? err.kind : 'error';
            while (items.length + failures.length < request.count) failures.push(reason);
            return { items, failures };
          }
          log.parseError = true;
          errors = ['the answer was not valid JSON'];
          lastFailure = 'invalid';
          this.opts.onAttempt?.({ ...log, errors });
          continue;
        }

        const list = typeof raw === 'object' && raw !== null && Array.isArray((raw as { items?: unknown }).items) ? ((raw as { items: unknown[] }).items) : [];
        log.returned = list.length;
        errors = [];
        for (const [index, entry] of list.entries()) {
          if (accepted >= want) break;
          const result = checkItem(entry, { formatId, passages, lang: request.lang, ipa: this.opts.ipa ?? (() => undefined) });
          if (result.failedAt !== 'schema') log.valid++;
          if (result.ok || result.failedAt === 'format') log.grounded++;
          if (!result.ok) {
            errors.push(...result.errors.map((e) => `item ${index + 1}: ${e}`));
            lastFailure = result.failure ?? 'invalid';
            continue;
          }
          const fingerprint = JSON.stringify(result.data);
          if (seenData.has(fingerprint)) {
            errors.push(`item ${index + 1}: duplicate of an earlier item`);
            continue;
          }
          seenData.add(fingerprint);
          used.add(passageFor(result.supportingSentence, passages)?.text ?? result.supportingSentence);
          const item: GeneratedItem = {
            formatId,
            data: result.data,
            supportingSentence: result.supportingSentence,
            source: sourceOf(passageFor(result.supportingSentence, passages)),
            origin: 'llm',
            attempts: attempt,
            model: this.opts.model,
          };
          items.push(item);
          onItem?.(item);
          accepted++;
          log.accepted++;
        }
        if (list.length < need && !errors.length) errors.push(`you returned ${list.length} items; return up to ${need} if the passages allow`);
        log.ms = performance.now() - started;
        log.errors = errors;
        this.opts.onAttempt?.(log);
      }
      for (let i = accepted; i < want; i++) failures.push(lastFailure);
    }
    return { items, failures };
  }
}

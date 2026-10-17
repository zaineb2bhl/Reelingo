import type { ContentGenerator, GeneratedItem, GenerationOutcome, GenerationRequest } from './types';

type Script = GenerationOutcome | Error | ((request: GenerationRequest) => GenerationOutcome | Promise<GenerationOutcome>);

/** Test double: plays back scripted outcomes (or throws scripted errors) in order. */
export class MockGenerator implements ContentGenerator {
  readonly id = 'mock';
  readonly calls: GenerationRequest[] = [];
  private index = 0;

  constructor(
    private readonly script: readonly Script[],
    readonly label = 'mock-model',
  ) {}

  async generate(request: GenerationRequest, onItem?: (item: GeneratedItem) => void): Promise<GenerationOutcome> {
    this.calls.push(request);
    const step = this.script[Math.min(this.index, this.script.length - 1)];
    this.index++;
    if (!step) return { items: [], failures: Array.from({ length: request.count }, () => 'error' as const) };
    if (step instanceof Error) throw step;
    const outcome = typeof step === 'function' ? await step(request) : step;
    for (const item of outcome.items) onItem?.(item);
    return outcome;
  }
}

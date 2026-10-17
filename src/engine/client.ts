import type { SeriesRequest, SeriesResult } from './index';
import type { SourceDocument } from './types';
import type { WorkerRequest, WorkerResponse } from './worker';

/** Runs the analysis + generation in a Web Worker so the page stays responsive. */
export function runSeriesInWorker(doc: SourceDocument, request: SeriesRequest, signal?: AbortSignal): Promise<SeriesResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const done = (): void => worker.terminate();
    signal?.addEventListener('abort', () => {
      done();
      reject(new DOMException('Cancelled', 'AbortError'));
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      done();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      done();
      reject(new Error(event.message || 'Worker failed'));
    };
    const lexiconUrl = new URL(`${import.meta.env.BASE_URL}lexicon/`, window.location.href).href;
    worker.postMessage({ doc, request, lexiconUrl } satisfies WorkerRequest);
  });
}

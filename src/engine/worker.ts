import { prepareDocument, type PrepareRequest, type PreparedDocument } from '@/ai/prepare';
import { loadLexicon, type Lexicon } from './lexicon';
import { detectLang } from './text';
import type { SourceDocument } from './types';

export interface WorkerRequest {
  doc: SourceDocument;
  request: PrepareRequest;
  /** Absolute URL of the folder holding the lexicon files. */
  lexiconUrl: string;
}

export type WorkerResponse = { ok: true; result: PreparedDocument } | { ok: false; error: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
}

const scope = self as unknown as WorkerScope;
let lexicon: Promise<Lexicon> | null = null;

/** Analysis, retrieval and rule-based candidates run here so the page stays responsive. */
scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { doc, request, lexiconUrl } = event.data;
  try {
    const lang = detectLang(doc.blocks.map((b) => b.text).join('\n'));
    // The English lexicon (frequency, IPA, WordNet) is only needed for English documents.
    let lex: Lexicon | null = null;
    if (lang === 'en') {
      lexicon ??= loadLexicon(lexiconUrl);
      lex = await lexicon.catch((err: unknown) => {
        lexicon = null;
        console.warn('Lexicon unavailable, continuing without it', err);
        return null;
      });
    }
    scope.postMessage({ ok: true, result: prepareDocument(doc, request, lex) });
  } catch (err) {
    scope.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

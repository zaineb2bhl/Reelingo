import { DOCUMENT_GENERATION } from '@/config';
import { analyze } from '@/engine/analyze';
import type { Lexicon } from '@/engine/lexicon';
import { tokenize } from '@/engine/text';
import type { Lang, SourceDocument } from '@/engine/types';
import { retrievePassages } from './retrieval';
import { ruleCandidates } from './ruleBasedGenerator';
import type { GeneratedItem, RetrievedPassage } from './types';

export interface PrepareRequest {
  formatId: string;
  count: number;
  topic: string;
}

/** Everything the document path needs, computed once (in the worker). */
export interface PreparedDocument {
  name: string;
  lang: Lang;
  passages: RetrievedPassage[];
  /** False when a topic was given but nothing in the document matched it. */
  matchedQuery: boolean;
  /** Rule-based candidates (a few spares beyond the count), used as fallback. */
  ruleItems: GeneratedItem[];
  /** IPA for words in the retrieved passages (English only), so the model never invents pronunciation. */
  ipa: Record<string, string>;
}

/** Dictionary forms a passage word might be cited as ("arranged" -> "arrange"). */
function baseForms(word: string): string[] {
  const forms = [word];
  if (word.endsWith('ies')) forms.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('es')) forms.push(word.slice(0, -2));
  if (word.endsWith('s')) forms.push(word.slice(0, -1));
  if (word.endsWith('ed')) forms.push(word.slice(0, -2), word.slice(0, -1));
  if (word.endsWith('ing')) forms.push(word.slice(0, -3), `${word.slice(0, -3)}e`);
  return forms;
}

function ipaFor(passages: readonly RetrievedPassage[], lexicon: Lexicon | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!lexicon) return out;
  for (const p of passages) {
    for (const t of tokenize(p.text)) {
      for (const form of baseForms(t.norm)) {
        const ipa = lexicon.ipa(form);
        if (ipa) out[form] = ipa;
      }
    }
  }
  return out;
}

export function prepareDocument(doc: SourceDocument, req: PrepareRequest, lexicon: Lexicon | null): PreparedDocument {
  const analysis = analyze(doc, lexicon, req.topic);
  const passages = retrievePassages(analysis, req.topic, DOCUMENT_GENERATION.retrievedPassages);
  return {
    name: doc.name,
    lang: analysis.lang,
    passages,
    matchedQuery: !req.topic.trim() || analysis.matchedQuery,
    ruleItems: ruleCandidates(analysis, req.formatId, req.count + 2, req.topic),
    ipa: analysis.lang === 'en' ? ipaFor(passages, lexicon) : {},
  };
}

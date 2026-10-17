import type { Analysis } from '@/engine/analyze';
import { queryStems } from '@/engine/analyze';
import { Bm25 } from '@/engine/search';
import { stem, tokenize, wordCount } from '@/engine/text';
import type { RetrievedPassage } from './types';

/**
 * Retrieval step of the document path: the top-k sentences for the topic.
 *
 * - A heading containing every topic word selects its section first.
 * - Otherwise passages are ranked with BM25 (headings count as context).
 * - With no topic, passages are ranked by how many key terms they contain.
 */
export function retrievePassages(a: Analysis, topic: string, k: number): RetrievedPassage[] {
  const usable = a.passages.filter((p) => wordCount(p.text) >= 3);
  const headingStems = a.sections.map((s) => tokenize(s.heading).map((t) => stem(t.norm, a.lang)));
  const toResult = (id: number, score: number): RetrievedPassage => {
    const p = a.passages[id];
    return { id, text: p?.text ?? '', page: p?.page, heading: a.sections[p?.section ?? 0]?.heading ?? '', score };
  };

  const q = queryStems(topic, a.lang);
  if (q.length) {
    const sectionHits = new Set(
      a.sections.filter((s, i) => s.heading && q.every((w) => headingStems[i]?.includes(w))).map((s) => s.index),
    );
    const bm25 = new Bm25(usable.map((p) => [...p.stems, ...(headingStems[p.section] ?? [])]));
    const ranked = bm25.search(q).map(([i, score]) => ({ id: usable[i]?.id ?? -1, score })).filter((r) => r.id >= 0);
    // Passages from a matching section come first: complete sentences before list items / table rows, then document order.
    const fromSection = usable
      .filter((p) => sectionHits.has(p.section))
      .map((p) => ({ id: p.id, score: (p.kind === 'paragraph' ? 2000 : 1000) - p.id / 1000 }))
      .sort((x, y) => y.score - x.score);
    const merged = new Map<number, number>();
    for (const r of [...fromSection, ...ranked]) if (!merged.has(r.id)) merged.set(r.id, r.score);
    const results = [...merged.entries()].slice(0, k).map(([id, score]) => toResult(id, score));
    if (results.length >= Math.ceil(k / 2)) return results;
    if (results.length) {
      // Few direct hits: add their neighbours (same section) for context, then key-term passages.
      const ids = new Set(results.map((r) => r.id));
      for (const r of [...results]) {
        for (const n of [r.id - 1, r.id + 1]) {
          const p = a.passages[n];
          if (p && !ids.has(n) && p.section === a.passages[r.id]?.section && wordCount(p.text) >= 3 && results.length < k) {
            ids.add(n);
            results.push(toResult(n, r.score * 0.5));
          }
        }
      }
      for (const r of keyTermPassages(a, usable, k)) {
        if (results.length >= k) break;
        if (!ids.has(r.id)) {
          ids.add(r.id);
          results.push({ ...r, score: 0 });
        }
      }
      return results;
    }
  }

  // No topic (or nothing matched): passages dense in the document's key terms.
  return keyTermPassages(a, usable, k);
}

function keyTermPassages(a: Analysis, usable: readonly Analysis['passages'][number][], k: number): RetrievedPassage[] {
  const weight = new Map<number, number>();
  for (const term of a.terms.slice(0, 40)) {
    for (const occ of term.occurrences) weight.set(occ.passage, (weight.get(occ.passage) ?? 0) + term.score);
  }
  return usable
    .map((p) => ({ id: p.id, score: (weight.get(p.id) ?? 0) / Math.sqrt(Math.max(4, p.tokens.length)) }))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score || x.id - y.id)
    .slice(0, k)
    .map((r) => {
      const p = a.passages[r.id];
      return { id: r.id, text: p?.text ?? '', page: p?.page, heading: a.sections[p?.section ?? 0]?.heading ?? '', score: r.score };
    });
}

/** Normalises text for exact-sentence comparisons (whitespace, case, quotes, dashes). */
export function normaliseForMatch(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”«»„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

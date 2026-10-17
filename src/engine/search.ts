/**
 * Okapi BM25 ranking over pre-tokenised passages. This is the "retrieval"
 * step: given the teacher's instructions, find the parts of the document
 * they are about.
 */
export class Bm25 {
  private readonly df = new Map<string, number>();
  private readonly tf: Array<Map<string, number>>;
  private readonly lengths: number[];
  private readonly avgLength: number;

  constructor(
    docs: readonly (readonly string[])[],
    private readonly k1 = 1.4,
    private readonly b = 0.75,
  ) {
    this.tf = docs.map((terms) => {
      const counts = new Map<string, number>();
      for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return counts;
    });
    this.lengths = docs.map((d) => d.length);
    this.avgLength = this.lengths.reduce((a, b) => a + b, 0) / Math.max(1, docs.length);
  }

  idf(term: string): number {
    const n = this.tf.length;
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /** Scores every passage; returns [index, score] pairs with score > 0, best first. */
  search(query: readonly string[]): Array<[number, number]> {
    const terms = [...new Set(query)];
    const results: Array<[number, number]> = [];
    this.tf.forEach((counts, i) => {
      let score = 0;
      const len = this.lengths[i] ?? 0;
      for (const term of terms) {
        const f = counts.get(term);
        if (!f) continue;
        score += (this.idf(term) * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * len) / (this.avgLength || 1)));
      }
      if (score > 0) results.push([i, score]);
    });
    return results.sort((a, b) => b[1] - a[1]);
  }
}

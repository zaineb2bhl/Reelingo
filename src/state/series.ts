import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SeriesState {
  /** Uploaded document, kept in IndexedDB so it can be reused. */
  docId: string | null;
  docName: string;
  docSize: number;
  instructions: string;
  /** Number of videos to create per format id. */
  counts: Record<string, number>;
  setDocument: (id: string | null, name: string, size: number) => void;
  setInstructions: (instructions: string) => void;
  setCount: (formatId: string, count: number) => void;
}

export const useSeries = create<SeriesState>()(
  persist(
    (set) => ({
      docId: null,
      docName: '',
      docSize: 0,
      instructions: '',
      counts: { quiz: 3, 'word-of-the-day': 2 },
      setDocument: (docId, docName, docSize) => set({ docId, docName, docSize }),
      setInstructions: (instructions) => set({ instructions }),
      setCount: (formatId, count) => set((s) => ({ counts: { ...s.counts, [formatId]: Math.max(0, count) } })),
    }),
    { name: 'reelingo.series', version: 1 },
  ),
);

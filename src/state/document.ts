import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DocumentInputState {
  /** Uploaded document, kept in IndexedDB so it can be reused across templates. */
  docId: string | null;
  docName: string;
  docSize: number;
  instructions: string;
  setDocument: (id: string | null, name: string, size: number) => void;
  setInstructions: (instructions: string) => void;
}

export const useDocumentInput = create<DocumentInputState>()(
  persist(
    (set) => ({
      docId: null,
      docName: '',
      docSize: 0,
      instructions: '',
      setDocument: (docId, docName, docSize) => set({ docId, docName, docSize }),
      setInstructions: (instructions) => set({ instructions }),
    }),
    { name: 'reelingo.document', version: 1 },
  ),
);

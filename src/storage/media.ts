import { createStore, del, get, set } from 'idb-keyval';

export type MediaKind = 'music' | 'voice' | 'logo' | 'document';

export interface MediaRecord {
  id: string;
  kind: MediaKind;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

const store = createStore('reelingo-media', 'files');

export const MEDIA_LIMITS: Record<MediaKind, { maxBytes: number; types: readonly string[]; extensions: readonly string[] }> = {
  music: {
    maxBytes: 10 * 1024 * 1024,
    types: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
    extensions: ['mp3', 'wav'],
  },
  voice: {
    maxBytes: 10 * 1024 * 1024,
    types: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/webm'],
    extensions: ['mp3', 'wav', 'm4a', 'ogg', 'webm'],
  },
  logo: {
    maxBytes: 2 * 1024 * 1024,
    types: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'],
  },
  document: {
    maxBytes: 20 * 1024 * 1024,
    types: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'],
    extensions: ['pdf', 'docx', 'txt', 'md', 'markdown'],
  },
};

export type UploadError = 'tooLarge' | 'badType';

export function validateUpload(kind: MediaKind, file: { name: string; type: string; size: number }): UploadError | null {
  const limits = MEDIA_LIMITS[kind];
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeOk = (file.type && limits.types.includes(file.type)) || limits.extensions.includes(ext);
  if (!typeOk) return 'badType';
  if (file.size > limits.maxBytes) return 'tooLarge';
  return null;
}

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export async function saveMedia(kind: MediaKind, file: File): Promise<MediaRecord> {
  const record: MediaRecord = { id: newId(), kind, name: file.name, type: file.type, size: file.size, blob: file, createdAt: Date.now() };
  await set(record.id, record, store);
  return record;
}

export async function getMedia(id: string): Promise<MediaRecord | undefined> {
  return get<MediaRecord>(id, store);
}

export async function deleteMedia(id: string): Promise<void> {
  await del(id, store);
}

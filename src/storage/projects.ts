import { createStore, del, get, set, values } from 'idb-keyval';
import type { ProjectSnapshot } from '@/state/editor';

export interface Project extends ProjectSnapshot {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Small JPEG data URL for the projects grid. */
  thumbnail: string | null;
}

const store = createStore('reelingo-projects', 'projects');

export const newProjectId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export async function listProjects(): Promise<Project[]> {
  const all = await values<Project>(store);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  return get<Project>(id, store);
}

export async function saveProject(project: Project): Promise<void> {
  await set(project.id, project, store);
}

export async function deleteProject(id: string): Promise<void> {
  await del(id, store);
}

export async function duplicateProject(id: string, copySuffix: string): Promise<Project | undefined> {
  const original = await getProject(id);
  if (!original) return undefined;
  const now = Date.now();
  const copy: Project = { ...original, id: newProjectId(), name: `${original.name} ${copySuffix}`.trim(), createdAt: now, updatedAt: now };
  await saveProject(copy);
  return copy;
}

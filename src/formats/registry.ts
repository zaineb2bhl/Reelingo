import type { AnyFormat } from './types';

// Every folder with an index.ts that default-exports `defineFormat(...)` is a format.
const modules = import.meta.glob<{ default: AnyFormat }>('./*/index.ts', { eager: true });

function collect(): AnyFormat[] {
  const seen = new Set<string>();
  const list: AnyFormat[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    const format = mod.default;
    if (!format || typeof format.render !== 'function') {
      throw new Error(`${path} does not default-export a format`);
    }
    if (seen.has(format.id)) throw new Error(`Duplicate format id "${format.id}" in ${path}`);
    seen.add(format.id);
    list.push(format);
  }
  return list.sort((a, b) => a.order - b.order);
}

export const allFormats: readonly AnyFormat[] = collect();
export const visibleFormats: readonly AnyFormat[] = allFormats.filter((f) => !f.hidden);

export function getFormat(id: string): AnyFormat | undefined {
  return allFormats.find((f) => f.id === id);
}

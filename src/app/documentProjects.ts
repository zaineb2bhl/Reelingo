import type { GeneratedItem } from '@/ai/types';
import type { AnyFormat } from '@/formats/types';
import { pickText, type Locale } from '@/i18n';
import { loadLogo } from '@/media/hooks';
import type { FrameBranding } from '@/render/branding';
import { renderThumbnail } from '@/render/thumbnail';
import { useEditor } from '@/state/editor';
import { newProjectId, saveProject } from '@/storage/projects';
import { resolveTheme } from '@/themes';

/** Saves generated items as projects (current theme, branding and audio), returns how many were saved. */
export async function saveItemsAsProjects(format: AnyFormat, items: readonly GeneratedItem[], docName: string, locale: Locale): Promise<number> {
  const editor = useEditor.getState();
  const theme = resolveTheme(editor.themeId, editor.accent);
  const logo = editor.branding.logoId ? await loadLogo(editor.branding.logoId) : null;
  const branding: FrameBranding = { ...editor.branding, logo };
  const docBase = docName.replace(/\.[^.]+$/, '').slice(0, 32);
  let saved = 0;
  for (const [i, item] of items.entries()) {
    const now = Date.now();
    await saveProject({
      id: newProjectId(),
      name: `${docBase} · ${pickText(locale, format.title)} ${i + 1}`,
      formatId: format.id,
      data: item.data,
      themeId: editor.themeId,
      accent: editor.accent,
      branding: editor.branding,
      audio: editor.audio,
      note: [docName, item.source, item.origin === 'llm' && item.model ? item.model : 'rule-based'].filter(Boolean).join(' · '),
      createdAt: now,
      updatedAt: now,
      thumbnail: renderThumbnail(format, item.data, theme, branding),
    });
    saved++;
  }
  return saved;
}

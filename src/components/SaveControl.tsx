import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnyFormat } from '@/formats/types';
import { pickText, useLocale, useT } from '@/i18n';
import type { FrameBranding } from '@/render/branding';
import { renderThumbnail } from '@/render/thumbnail';
import { snapshotFor, useEditor } from '@/state/editor';
import { getProject, newProjectId, saveProject } from '@/storage/projects';
import type { Theme } from '@/themes';

interface SaveControlProps {
  format: AnyFormat;
  data: unknown;
  theme: Theme;
  branding: FrameBranding;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

/** Project name + Save button. Once saved, later edits autosave. */
export function SaveControl({ format, data, theme, branding }: SaveControlProps) {
  const t = useT();
  const locale = useLocale();
  const projectId = useEditor((s) => s.projectId);
  const projectFormatId = useEditor((s) => s.projectFormatId);
  const projectName = useEditor((s) => s.projectName);
  const brandingSettings = useEditor((s) => s.branding);
  const audio = useEditor((s) => s.audio);
  const [status, setStatus] = useState<Status>('idle');
  const isOpenProject = projectId !== null && projectFormatId === format.id;
  const latest = useRef({ data, theme, branding });
  latest.current = { data, theme, branding };

  const save = useCallback(async (): Promise<void> => {
    setStatus('saving');
    try {
      const s = useEditor.getState();
      const id = s.projectId && s.projectFormatId === format.id ? s.projectId : newProjectId();
      const existing = s.projectId === id ? await getProject(id) : undefined;
      const now = Date.now();
      const name = s.projectName.trim() || `${pickText(locale, format.title)} · ${new Date(now).toLocaleDateString(locale)}`;
      const { data: d, theme: th, branding: b } = latest.current;
      await saveProject({
        ...snapshotFor(format),
        id,
        name,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        thumbnail: renderThumbnail(format, d, th, b),
      });
      useEditor.getState().setProject(id, name, format.id);
      setStatus('saved');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }, [format, locale]);

  // Autosave an open project shortly after any change.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!isOpenProject) return;
    setStatus('idle');
    const timer = setTimeout(() => void save(), 1200);
    return () => clearTimeout(timer);
  }, [data, theme, brandingSettings, audio, projectName, isOpenProject, save]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        value={projectName}
        onChange={(e) => useEditor.getState().setProjectName(e.target.value)}
        placeholder={t('projects.untitled')}
        aria-label={t('projects.name')}
        dir="auto"
        maxLength={60}
        className="w-28 min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none hover:border-ink/12 focus:border-tangerine focus:bg-white sm:w-48"
      />
      <span className="hidden text-xs text-ink/45 sm:inline" aria-live="polite">
        {status === 'saving' ? t('projects.saving') : status === 'saved' ? t('projects.saved') : status === 'error' ? t('projects.error') : ''}
      </span>
      {!isOpenProject && (
        <button type="button" onClick={() => void save()} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white hover:bg-ink/85">
          {t('projects.save')}
        </button>
      )}
    </div>
  );
}

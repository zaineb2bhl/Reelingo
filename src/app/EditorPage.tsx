import { useEffect, useMemo, useState } from 'react';
import { BottomBar } from '@/components/BottomBar';
import { BrandingSection } from '@/components/BrandingSection';
import { Player } from '@/components/Player';
import { SaveControl } from '@/components/SaveControl';
import { ThemePicker } from '@/components/ThemePicker';
import { Section } from '@/components/ui/fields';
import { getFormat } from '@/formats/registry';
import { issuesToErrors } from '@/formats/shared';
import type { AnyFormat } from '@/formats/types';
import { pickText, useLocale, useT } from '@/i18n';
import type { ExportJob } from '@/export';
import { useAudioPlan, useFrameBranding } from '@/media/hooks';
import { safeDuration } from '@/render/duration';
import { useDraft, useEditor } from '@/state/editor';
import { resolveTheme } from '@/themes';
import { hrefFor } from './router';

export function EditorPage({ formatId }: { formatId: string }) {
  const t = useT();
  const format = getFormat(formatId);
  if (!format) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
        <a className="mt-4 inline-block font-semibold text-tangerine" href={hrefFor({ name: 'home' })}>
          {t('editor.back')}
        </a>
      </div>
    );
  }
  return <Editor key={format.id} format={format} />;
}

export function Editor({ format }: { format: AnyFormat }) {
  const t = useT();
  const locale = useLocale();
  const data = useDraft(format);
  const themeId = useEditor((s) => s.themeId);
  const accent = useEditor((s) => s.accent);
  const previewMuted = useEditor((s) => s.previewMuted);
  const projectNote = useEditor((s) => (s.projectId && s.projectFormatId === format.id ? s.projectNote : ''));
  const { setDraft, resetDraft, setTheme, setAccent, setPreviewMuted } = useEditor.getState();
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const theme = useMemo(() => resolveTheme(themeId, accent), [themeId, accent]);
  const errors = useMemo(() => issuesToErrors(format.schema.safeParse(data).error), [format, data]);
  const duration = useMemo(() => safeDuration(format, data), [format, data]);
  const branding = useFrameBranding();
  const audioPlan = useAudioPlan(format, data);
  const job = useMemo<ExportJob>(() => ({ format, data, theme, branding, audio: audioPlan }), [format, data, theme, branding, audioPlan]);
  const invalid = Object.keys(errors).length > 0;
  const Form = format.Form;

  // Opening a different template detaches the editor from the open project.
  useEffect(() => {
    const s = useEditor.getState();
    if (s.projectId && s.projectFormatId !== format.id) s.setProject(null, '', null);
  }, [format.id]);

  return (
    <div className="flex h-[calc(100dvh-60px)] flex-col">
      <div className="flex items-center gap-3 border-b border-ink/8 bg-white/60 px-4 py-2.5 sm:px-5">
        <a href={hrefFor({ name: 'home' })} className="flex items-center gap-1.5 text-sm font-semibold text-ink/55 hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M19 12H5m6 6-6-6 6-6" /></svg>
          <span className="hidden sm:inline">{t('editor.back')}</span>
        </a>
        <span className="h-4 w-px bg-ink/15" />
        <h1 className="hidden truncate text-sm font-bold sm:block">{pickText(locale, format.title)}</h1>
        <SaveControl format={format} data={data} theme={theme} branding={branding} />
        <div className="flex-1" />
        <div className="flex rounded-xl bg-ink/[0.06] p-1 lg:hidden">
          {(['edit', 'preview'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === id ? 'bg-white shadow-sm' : 'text-ink/55'}`}
            >
              {t(id === 'edit' ? 'editor.tabEdit' : 'editor.tabPreview')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className={`w-full overflow-y-auto border-ink/8 p-4 sm:p-5 lg:block lg:w-[460px] lg:shrink-0 lg:border-e ${tab === 'edit' ? 'block' : 'hidden'}`}>
          <div className="mx-auto max-w-xl space-y-4">
            <Section
              title={t('editor.content')}
              action={
                <button type="button" onClick={() => resetDraft(format.id)} className="text-xs font-semibold text-ink/45 hover:text-ink">
                  {t('editor.resetSample')}
                </button>
              }
            >
              {invalid && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{t('editor.invalid')}</p>
              )}
              {projectNote && (
                <p className="rounded-xl bg-lilac/8 px-3 py-2 text-xs text-ink/70 ring-1 ring-lilac/20" dir="auto">
                  <span className="font-semibold">{t('series.fromDocument')}:</span> {projectNote}
                </p>
              )}
              <Form value={data} onChange={(next) => setDraft(format.id, next)} errors={errors} />
            </Section>
            <Section title={t('editor.style')}>
              <ThemePicker themeId={themeId} accent={accent} onTheme={setTheme} onAccent={setAccent} />
            </Section>
            <Section title={t('editor.branding')}>
              <BrandingSection />
            </Section>
          </div>
        </aside>
        <main
          className={`min-w-0 flex-1 bg-[radial-gradient(circle_at_center,rgba(20,18,43,0.07)_1px,transparent_1px)] [background-size:22px_22px] p-4 sm:p-6 lg:flex ${
            tab === 'preview' ? 'flex' : 'hidden'
          }`}
        >
          <Player
            format={format}
            data={data}
            theme={theme}
            branding={branding}
            audio={audioPlan}
            muted={previewMuted}
            onMutedChange={setPreviewMuted}
          />
        </main>
      </div>

      <BottomBar duration={duration} job={job} invalid={invalid} />
    </div>
  );
}

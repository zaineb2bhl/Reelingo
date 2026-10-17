import { useEffect, useState } from 'react';
import { getFormat } from '@/formats/registry';
import type { AnyFormat } from '@/formats/types';
import { useT } from '@/i18n';
import { useEditor } from '@/state/editor';
import { getProject } from '@/storage/projects';
import { Editor } from './EditorPage';
import { hrefFor } from './router';

type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'ready'; format: AnyFormat };

/** Loads a saved project into the editor state, then shows the editor. */
export function ProjectPage({ id }: { id: string }) {
  const t = useT();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    void getProject(id).then((project) => {
      if (!alive) return;
      const format = project ? getFormat(project.formatId) : undefined;
      if (!project || !format) {
        setState({ kind: 'missing' });
        return;
      }
      useEditor.getState().loadSnapshot(project, project.id, project.name);
      setState({ kind: 'ready', format });
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.kind === 'loading') return <div className="grid h-[60vh] place-items-center text-ink/40">…</div>;
  if (state.kind === 'missing') {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-bold">{t('projects.missing')}</h1>
        <a className="mt-4 inline-block font-semibold text-tangerine" href={hrefFor({ name: 'home' })}>
          {t('editor.back')}
        </a>
      </div>
    );
  }
  return <Editor key={id} format={state.format} />;
}

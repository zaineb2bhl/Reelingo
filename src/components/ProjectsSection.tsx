import { useEffect, useState } from 'react';
import { hrefFor } from '@/app/router';
import { getFormat } from '@/formats/registry';
import { pickText, useLocale, useT } from '@/i18n';
import { deleteProject, duplicateProject, listProjects, type Project } from '@/storage/projects';

/** "Your projects" grid on the home screen. Renders nothing when empty. */
export function ProjectsSection() {
  const t = useT();
  const locale = useLocale();
  const [projects, setProjects] = useState<Project[] | null>(null);

  const refresh = (): void => {
    void listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  };
  useEffect(refresh, []);

  if (!projects || projects.length === 0) return null;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <section className="mt-12">
      <h2 className="text-xl font-extrabold tracking-tight">{t('projects.title')}</h2>
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {projects.map((p) => {
          const format = getFormat(p.formatId);
          return (
            <li key={p.id} className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-ink/8">
              <a href={hrefFor({ name: 'project', id: p.id })} className="block">
                <div className="aspect-[9/16] bg-ink/5">
                  {p.thumbnail ? <img src={p.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
                </div>
                <div className="px-3 pt-2.5">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <p className="truncate text-xs text-ink/50">
                    {format ? pickText(locale, format.title) : p.formatId} · {dateFmt.format(p.updatedAt)}
                  </p>
                </div>
              </a>
              <div className="flex gap-1 px-2 pt-1 pb-2">
                <button
                  type="button"
                  onClick={() => void duplicateProject(p.id, t('projects.copySuffix')).then(refresh)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-ink/55 hover:bg-ink/5 hover:text-ink"
                >
                  {t('projects.duplicate')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(t('projects.confirmDelete', { name: p.name }))) void deleteProject(p.id).then(refresh);
                  }}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-ink/55 hover:bg-rose-50 hover:text-rose-600"
                >
                  {t('projects.delete')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

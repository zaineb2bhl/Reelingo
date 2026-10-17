import { FormatThumb } from '@/components/FormatThumb';
import { ProjectsSection } from '@/components/ProjectsSection';
import { visibleFormats } from '@/formats/registry';
import { pickText, useLocale, useT } from '@/i18n';
import { useEditor } from '@/state/editor';
import { THEMES } from '@/themes';
import { hrefFor } from './router';

export function HomePage() {
  const t = useT();
  const locale = useLocale();

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pt-14">
      <div className="max-w-2xl">
        <h1 className="font-display text-[clamp(2rem,5vw,3.4rem)] leading-[1.02] font-extrabold tracking-tight text-ink">
          {t('home.title')}
          <span className="text-tangerine">.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ink/60">{t('home.subtitle')}</p>
      </div>

      <a
        href={hrefFor({ name: 'editor', formatId: 'quiz', fromDocument: true })}
        className="group mt-8 flex items-center gap-4 rounded-2xl bg-ink p-4 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 text-amber">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5M9 13h6M9 17h4" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{t('home.seriesTitle')}</span>
          <span className="block text-sm text-white/65">{t('home.seriesBody')}</span>
        </span>
        <span className="hidden shrink-0 rounded-xl bg-tangerine px-4 py-2 text-sm font-bold sm:block">{t('home.seriesCta')}</span>
      </a>

      <ul className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
        {visibleFormats.map((format, i) => {
          const theme = THEMES[i % THEMES.length] ?? THEMES[0];
          if (!theme) return null;
          return (
            <li key={format.id}>
              <a
                href={hrefFor({ name: 'editor', formatId: format.id })}
                onClick={() => useEditor.getState().setProject(null, '', null)}
                className="group block rounded-[1.6rem] bg-white p-2 shadow-sm ring-1 ring-ink/8 transition hover:-translate-y-1 hover:shadow-xl hover:ring-ink/15 focus-visible:ring-4 focus-visible:ring-tangerine/40 focus-visible:outline-none"
              >
                <div className="aspect-[9/16] overflow-hidden rounded-[1.2rem] bg-ink">
                  <FormatThumb format={format} theme={theme} offset={i * 0.7} />
                </div>
                <div className="px-2 pt-3 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[15px] font-bold text-ink sm:text-base">{pickText(locale, format.title)}</h2>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink/5 text-ink/60 transition group-hover:bg-tangerine group-hover:text-white rtl:rotate-180">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink/55">{pickText(locale, format.description)}</p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>

      <ProjectsSection />
    </div>
  );
}

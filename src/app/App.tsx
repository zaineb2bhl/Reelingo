import { useEffect } from 'react';
import { APP_NAME } from '@/config';
import { LOCALES, useLocale, useT } from '@/i18n';
import { useSettings } from '@/state/settings';
import { EditorPage } from './EditorPage';
import { HomePage } from './HomePage';
import { ProjectPage } from './ProjectPage';
import { SeriesPage } from './SeriesPage';
import { SettingsPage } from './SettingsPage';
import { hrefFor, useRoute } from './router';

export function App() {
  const route = useRoute();
  const t = useT();
  const locale = useLocale();
  const setLocale = useSettings((s) => s.setLocale);

  useEffect(() => {
    const meta = LOCALES.find((l) => l.id === locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = meta?.dir ?? 'ltr';
  }, [locale]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex h-[60px] items-center gap-4 border-b border-ink/8 bg-cream/85 px-4 backdrop-blur sm:px-6">
        <a href={hrefFor({ name: 'home' })} className="flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-extrabold tracking-tight">{APP_NAME}</span>
        </a>
        <span className="hidden text-sm text-ink/45 md:inline">{t('app.tagline')}</span>
        <div className="flex-1" />
        <a
          href={hrefFor({ name: 'series' })}
          className={`hidden rounded-lg px-2.5 py-1.5 text-sm font-semibold transition sm:inline ${route.name === 'series' ? 'bg-ink text-white' : 'text-ink/60 hover:bg-ink/5 hover:text-ink'}`}
        >
          {t('nav.series')}
        </a>
        <a
          href={hrefFor({ name: 'settings' })}
          className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold transition ${route.name === 'settings' ? 'bg-ink text-white' : 'text-ink/60 hover:bg-ink/5 hover:text-ink'}`}
        >
          {t('nav.settings')}
        </a>
        <label className="sr-only" htmlFor="locale">
          {t('settings.uiLanguage')}
        </label>
        <select
          id="locale"
          value={locale}
          onChange={(e) => {
            const next = LOCALES.find((l) => l.id === e.target.value);
            if (next) setLocale(next.id);
          }}
          className="rounded-lg border border-ink/12 bg-white px-2 py-1.5 text-sm font-medium"
        >
          {LOCALES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </header>
      {route.name === 'editor' ? (
        <EditorPage formatId={route.formatId} />
      ) : route.name === 'project' ? (
        <ProjectPage id={route.id} />
      ) : route.name === 'settings' ? (
        <SettingsPage />
      ) : route.name === 'series' ? (
        <SeriesPage />
      ) : (
        <HomePage />
      )}
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      <rect x="7" y="2" width="18" height="28" rx="5" fill="#14122b" />
      <path d="M13.5 11v10l8-5z" fill="#ff6a3d" />
      <circle cx="25" cy="7" r="4" fill="#ffb547" stroke="#f7f4ee" strokeWidth="2" />
    </svg>
  );
}

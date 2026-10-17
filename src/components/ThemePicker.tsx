import { THEMES, type ThemeId } from '@/themes';
import { useT } from '@/i18n';
import { Field } from './ui/fields';

interface ThemePickerProps {
  themeId: ThemeId;
  accent: string | null;
  onTheme: (id: ThemeId) => void;
  onAccent: (accent: string | null) => void;
}

export function ThemePicker({ themeId, accent, onTheme, onAccent }: ThemePickerProps) {
  const t = useT();
  const current = THEMES.find((th) => th.id === themeId);
  return (
    <div className="space-y-5">
      <Field label={t('editor.theme')}>
        {() => (
          <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label={t('editor.theme')}>
            {THEMES.map((th) => {
              const active = th.id === themeId;
              return (
                <button
                  key={th.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onTheme(th.id)}
                  className={`group overflow-hidden rounded-xl text-start ring-2 transition ${active ? 'ring-tangerine' : 'ring-transparent hover:ring-ink/15'}`}
                >
                  <span
                    className="relative block h-14"
                    style={{ background: `linear-gradient(${th.bgAngle + 90}deg, ${th.bg[0]}, ${th.bg[1]})` }}
                  >
                    <span className="absolute start-2 top-2 h-2 w-8 rounded-full" style={{ background: th.text, opacity: 0.85 }} />
                    <span className="absolute start-2 top-6 h-2 w-5 rounded-full" style={{ background: accent ?? th.accent }} />
                    <span className="absolute end-2 bottom-2 h-5 w-5 rounded-md" style={{ background: th.panel }} />
                  </span>
                  <span className="block bg-white px-2 py-1.5 text-xs font-semibold text-ink">{th.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </Field>
      <Field label={t('editor.accent')} optional>
        {(id) => (
          <div className="flex items-center gap-3">
            <input
              id={id}
              type="color"
              value={accent ?? current?.accent ?? '#ff6a3d'}
              onChange={(e) => onAccent(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-ink/12 bg-white p-1"
            />
            {accent && (
              <button type="button" className="text-sm font-medium text-ink/60 underline-offset-2 hover:text-ink hover:underline" onClick={() => onAccent(null)}>
                {t('editor.accentReset')}
              </button>
            )}
          </div>
        )}
      </Field>
    </div>
  );
}

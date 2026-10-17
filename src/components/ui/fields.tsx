import { useId, type ReactNode } from 'react';
import { useT } from '@/i18n';

const inputBase =
  'w-full rounded-xl border bg-white px-3.5 py-2.5 text-[15px] text-ink shadow-sm outline-none transition placeholder:text-ink/35 focus:border-tangerine focus:ring-4 focus:ring-tangerine/15';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, optional, children }: FieldProps) {
  const id = useId();
  const t = useT();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline gap-2 text-sm font-semibold text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-ink/45">{t('common.optional')}</span>}
      </label>
      {children(id)}
      {error ? (
        <p className="text-xs font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink/50">{hint}</p>
      ) : null}
    </div>
  );
}

interface TextInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  invalid?: boolean;
}

export function TextInput({ id, value, onChange, placeholder, maxLength, invalid }: TextInputProps) {
  return (
    <input
      id={id}
      dir="auto"
      className={`${inputBase} ${invalid ? 'border-rose-400' : 'border-ink/12'}`}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({ id, value, onChange, placeholder, maxLength, invalid, rows = 3 }: TextInputProps & { rows?: number }) {
  return (
    <textarea
      id={id}
      dir="auto"
      rows={rows}
      className={`${inputBase} resize-y leading-snug ${invalid ? 'border-rose-400' : 'border-ink/12'}`}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

interface SegmentedProps<V extends string> {
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (value: V) => void;
  ariaLabel?: string;
}

export function Segmented<V extends string>({ value, options, onChange, ariaLabel }: SegmentedProps<V>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex w-full gap-1 rounded-xl bg-ink/[0.06] p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-lg px-2 py-2 text-[13px] font-semibold transition ${
              active ? 'bg-white text-ink shadow-sm' : 'text-ink/55 hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-sm font-medium text-ink"
    >
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-tangerine' : 'bg-ink/15'}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'start-[1.375rem]' : 'start-0.5'
          }`}
        />
      </span>
      {label}
    </button>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-ink/8 bg-white/70 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-[13px] font-bold tracking-[0.08em] text-ink/55 uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

import type { ReactNode } from 'react';
import { useT } from '@/i18n';

interface ListRowProps {
  index: number;
  count: number;
  minItems: number;
  onRemove: () => void;
  onMove?: (delta: -1 | 1) => void;
  badge?: ReactNode;
  children: ReactNode;
}

/** One row of an editable list with remove / reorder controls. */
export function ListRow({ index, count, minItems, onRemove, onMove, badge, children }: ListRowProps) {
  const t = useT();
  return (
    <div className="flex items-start gap-2">
      {badge !== undefined && <div className="pt-2.5">{badge}</div>}
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
      <div className="flex shrink-0 flex-col items-center pt-1">
        {onMove && (
          <>
            <IconButton label={t('common.moveUp')} disabled={index === 0} onClick={() => onMove(-1)}>
              <path d="m6 15 6-6 6 6" />
            </IconButton>
            <IconButton label={t('common.moveDown')} disabled={index === count - 1} onClick={() => onMove(1)}>
              <path d="m6 9 6 6 6-6" />
            </IconButton>
          </>
        )}
        <IconButton label={t('common.remove')} disabled={count <= minItems} onClick={onRemove}>
          <path d="M6 6l12 12M18 6 6 18" />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg text-ink/45 transition hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-25"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

export function AddButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink/12 py-2.5 text-sm font-semibold text-ink/55 transition hover:border-tangerine/50 hover:text-tangerine disabled:opacity-40 disabled:hover:border-ink/12 disabled:hover:text-ink/55"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M12 5v14M5 12h14" /></svg>
      {label}
    </button>
  );
}

export function moveItem<T>(list: readonly T[], index: number, delta: number): T[] {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(target, 0, item);
  return next;
}

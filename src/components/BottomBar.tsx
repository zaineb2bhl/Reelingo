import { useEffect, useRef, useState } from 'react';
import type { ExportJob } from '@/export';
import { useT } from '@/i18n';
import { useEditor } from '@/state/editor';
import { AudioPanel } from './AudioPanel';
import { ExportDialog } from './ExportDialog';

interface BottomBarProps {
  duration: number;
  job: ExportJob;
  invalid: boolean;
}

export function BottomBar({ duration, job, invalid }: BottomBarProps) {
  const t = useT();
  const audio = useEditor((s) => s.audio);
  const setAudio = useEditor((s) => s.setAudio);
  const [panel, setPanel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const musicCount = (audio.musicId ? 1 : 0) + (audio.voiceId ? 1 : 0);

  useEffect(() => {
    if (!panel) return;
    const onDown = (e: PointerEvent): void => {
      if (panelRef.current && e.target instanceof Node && !panelRef.current.contains(e.target)) setPanel(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPanel(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  return (
    <footer className="relative z-30 flex items-center gap-1.5 border-t border-ink/8 bg-white px-3 py-2.5 sm:gap-3 sm:px-5">
      <div className="flex items-baseline gap-1.5 rounded-xl bg-ink/[0.05] px-3 py-2" title={t('bar.duration')}>
        <span className="hidden text-xs font-medium text-ink/50 sm:inline">{t('bar.duration')}</span>
        <span className="font-mono text-sm font-semibold tabular-nums">{duration.toFixed(1)}s</span>
      </div>

      <div ref={panelRef} className="relative">
        <button
          type="button"
          onClick={() => setPanel((p) => !p)}
          aria-expanded={panel}
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${panel ? 'bg-ink text-white' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>
          <span className="hidden sm:inline">{t('bar.music')}</span>
          {musicCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-tangerine px-1 text-[11px] font-bold text-white">{musicCount}</span>}
        </button>
        {panel && (
          <div className="fixed inset-x-3 bottom-[68px] max-h-[70dvh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-ink/10 sm:absolute sm:inset-x-auto sm:start-0 sm:bottom-[calc(100%+12px)] sm:w-[360px]">
            <AudioPanel videoDuration={duration} />
          </div>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={audio.sfx}
        onClick={() => setAudio({ sfx: !audio.sfx })}
        title={t('bar.sfx')}
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${audio.sfx ? 'text-ink/70 hover:bg-ink/5' : 'text-ink/35 line-through hover:bg-ink/5'}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M11 5 6 9H2v6h4l5 4z" />
          {audio.sfx ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /> : <path d="m16 9 6 6m0-6-6 6" />}
        </svg>
        <span className="hidden sm:inline">{t('bar.sfx')}</span>
      </button>

      <div className="flex-1" />
      {invalid && <span className="hidden text-xs font-medium text-amber-700 md:inline">{t('editor.invalid')}</span>}
      <button
        type="button"
        onClick={() => setExporting(true)}
        className="flex items-center gap-2 rounded-xl bg-tangerine px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-tangerine/90 active:scale-[0.98]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" /></svg>
        <span className="hidden min-[400px]:inline">{t('bar.download')}</span>
      </button>
      {exporting && <ExportDialog open job={job} onClose={() => setExporting(false)} />}
    </footer>
  );
}

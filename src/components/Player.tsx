import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioPlan } from '@/audio/mix';
import { previewAudio } from '@/audio/preview';
import { VIDEO } from '@/config';
import type { AnyFormat } from '@/formats/types';
import { useT } from '@/i18n';
import { formatTime, safeDuration } from '@/render/duration';
import type { FrameBranding } from '@/render/branding';
import { renderFrame } from '@/render/frame';
import type { Theme } from '@/themes';

interface PlayerProps {
  format: AnyFormat;
  data: unknown;
  theme: Theme;
  branding: FrameBranding;
  audio: AudioPlan;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
}

const ASPECT = VIDEO.height / VIDEO.width;

/** Phone-shaped live preview with play / pause / scrub. */
export function Player({ format, data, theme, branding, audio, muted, onMutedChange }: PlayerProps) {
  const t = useT();
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [showSafe, setShowSafe] = useState(false);
  const [phoneWidth, setPhoneWidth] = useState(300);
  const duration = useMemo(() => safeDuration(format, data), [format, data]);
  const audioRef = useRef(audio);
  audioRef.current = audio;

  // Fit the phone into whatever space the layout gives us.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const w = Math.max(160, Math.floor(Math.min(width, height / ASPECT, 440)));
      setPhoneWidth(w);
    });
    ro.observe(area);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(
    (tm: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const scale = canvas.width / VIDEO.width;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      renderFrame(ctx, format, data, tm, theme, { showSafeZones: showSafe, branding });
    },
    [format, data, theme, showSafe, branding],
  );

  // Backing-store size follows the on-screen size (capped at full resolution).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.min(VIDEO.width, Math.round(phoneWidth * dpr));
    canvas.width = w;
    canvas.height = Math.round(w * ASPECT);
    draw(timeRef.current);
  }, [phoneWidth, draw]);

  useEffect(() => {
    if (timeRef.current > duration) {
      timeRef.current = 0;
      setTime(0);
    }
    if (!playing) {
      draw(timeRef.current);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let next = timeRef.current + dt;
      if (next >= duration) {
        next = 0;
        if (!muted) previewAudio.start(audioRef.current, 0);
      }
      timeRef.current = next;
      draw(next);
      setTime(next);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, draw, duration, muted]);

  // Soundtrack follows play state, mute and any change to the plan.
  useEffect(() => {
    if (playing && !muted) previewAudio.start(audio, timeRef.current);
    else previewAudio.stop();
  }, [playing, muted, audio]);
  useEffect(() => () => previewAudio.stop(), []);

  const toggleMute = async (): Promise<void> => {
    if (muted) {
      const ok = await previewAudio.unlock();
      if (ok) onMutedChange(false);
    } else {
      onMutedChange(true);
    }
  };

  const seek = (value: number): void => {
    timeRef.current = value;
    setTime(value);
    draw(value);
  };

  return (
    <div className="flex h-full w-full flex-col items-center gap-4">
      <div ref={areaRef} className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div
          className="relative rounded-[2.2rem] bg-ink p-[9px] shadow-[0_30px_80px_-20px_rgba(20,18,43,0.55)]"
          style={{ width: phoneWidth + 18 }}
        >
          <div className="absolute top-[18px] left-1/2 z-10 h-[6px] w-16 -translate-x-1/2 rounded-full bg-white/25" aria-hidden />
          <canvas
            ref={canvasRef}
            className="block rounded-[1.65rem]"
            style={{ width: phoneWidth, height: phoneWidth * ASPECT }}
            onClick={() => setPlaying((p) => !p)}
            aria-label={`${format.title.en} preview`}
          />
        </div>
      </div>

      <div dir="ltr" className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-ink/8">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-ink/85"
          aria-label={playing ? t('player.pause') : t('player.play')}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-[1px]" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={duration}
          step={1 / VIDEO.fps}
          value={Math.min(time, duration)}
          onPointerDown={() => setPlaying(false)}
          onChange={(e) => seek(Number(e.target.value))}
          className="min-w-0 flex-1 accent-tangerine"
          aria-label="Scrub"
        />
        <span className="shrink-0 font-mono text-xs whitespace-nowrap text-ink/60 tabular-nums">
          {formatTime(time)} / {formatTime(duration)}
        </span>
        <button
          type="button"
          onClick={() => void toggleMute()}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${muted ? 'text-ink/40 hover:text-ink' : 'text-tangerine'}`}
          aria-pressed={!muted}
          aria-label={muted ? t('player.unmute') : t('player.mute')}
          title={muted ? t('player.unmute') : t('player.mute')}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M11 5 6 9H2v6h4l5 4z" />
            {muted ? <path d="m16 9 6 6m0-6-6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setShowSafe((s) => !s)}
          className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold transition ${showSafe ? 'bg-rose-100 text-rose-700' : 'text-ink/50 hover:text-ink'}`}
          aria-pressed={showSafe}
          title={t('player.safeZones')}
          aria-label={t('player.safeZones')}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.5">
            <rect x="5" y="3" width="14" height="18" rx="2" />
          </svg>
          <span className="hidden sm:inline">{t('player.safeZones')}</span>
        </button>
      </div>
    </div>
  );
}

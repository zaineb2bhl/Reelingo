import { useEffect, useRef } from 'react';
import { VIDEO } from '@/config';
import type { AnyFormat } from '@/formats/types';
import { safeDuration } from '@/render/duration';
import { renderFrame } from '@/render/frame';
import type { Theme } from '@/themes';

type Tick = (now: number) => void;
const subscribers = new Set<Tick>();
let rafId = 0;

/** One shared animation loop for every thumbnail on the page. */
function subscribe(fn: Tick): () => void {
  subscribers.add(fn);
  if (subscribers.size === 1) {
    const loop = (now: number): void => {
      subscribers.forEach((s) => s(now));
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) cancelAnimationFrame(rafId);
  };
}

const THUMB_W = 270;

/** Live, looping render of a format's sample data, using the real renderer. */
export function FormatThumb({ format, theme, offset = 0 }: { format: AnyFormat; theme: Theme; offset?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = safeDuration(format, format.defaults);
    const scale = canvas.width / VIDEO.width;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e?.isIntersecting ?? true;
    });
    io.observe(canvas);
    const start = performance.now() - offset * 1000;
    const paint = (t: number): void => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      renderFrame(ctx, format, format.defaults, t, theme);
    };
    let lastDraw = 0;
    const draw = (now: number): void => {
      // ~30 fps is plenty for thumbnails.
      if (!visible || now - lastDraw < 32) return;
      lastDraw = now;
      paint(((now - start) / 1000) % duration);
    };
    paint(duration * 0.6);
    if (reduceMotion) return () => io.disconnect();
    const unsubscribe = subscribe(draw);
    return () => {
      unsubscribe();
      io.disconnect();
    };
  }, [format, theme, offset]);

  return (
    <canvas
      ref={canvasRef}
      width={THUMB_W}
      height={Math.round((THUMB_W * VIDEO.height) / VIDEO.width)}
      className="block h-full w-full"
      aria-hidden
    />
  );
}

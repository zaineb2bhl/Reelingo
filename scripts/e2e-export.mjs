/**
 * End-to-end export check in a real Chrome. Needs the dev server running
 * (npm run dev) and a local Chrome / Edge.
 *
 *   node scripts/e2e-export.mjs [formatId=all] [outDir=.]
 *
 * For each format it renders the sample video through the real exporter,
 * reports the render time and validates the MP4 structure.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.REELINGO_URL ?? 'http://localhost:5173';
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) throw new Error('No Chrome found; set CHROME_PATH');

const [only = 'all', outDir = '.'] = process.argv.slice(2);

/** Minimal MP4 box walker: returns top-level and nested box types + mvhd duration. */
function inspectMp4(buf) {
  const types = [];
  let durationSec = null;
  const walk = (start, end, depth) => {
    let off = start;
    while (off + 8 <= end) {
      let size = buf.readUInt32BE(off);
      const type = buf.toString('latin1', off + 4, off + 8);
      let header = 8;
      if (size === 1) {
        size = Number(buf.readBigUInt64BE(off + 8));
        header = 16;
      }
      if (size < header || off + size > end) break;
      types.push(`${'  '.repeat(depth)}${type}`);
      if (type === 'mvhd') {
        const version = buf[off + header];
        const timescale = version === 1 ? buf.readUInt32BE(off + header + 20) : buf.readUInt32BE(off + header + 12);
        const duration = version === 1 ? Number(buf.readBigUInt64BE(off + header + 24)) : buf.readUInt32BE(off + header + 16);
        durationSec = duration / timescale;
      }
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(type)) walk(off + header, off + size, depth + 1);
      if (type === 'stsd') walk(off + header + 8, off + size, depth + 1);
      off += size;
    }
  };
  walk(0, buf.length, 0);
  return { types, durationSec };
}

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
let failed = false;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle0' });

  const ids = await page.evaluate(async () => {
    const { visibleFormats } = await import('/src/formats/registry.ts');
    return visibleFormats.map((f) => f.id);
  });
  for (const id of ids.filter((i) => only === 'all' || i === only)) {
    const res = await page.evaluate(async (formatId) => {
      const { getFormat } = await import('/src/formats/registry.ts');
      const { exportVideo, detectSupport } = await import('/src/export/index.ts');
      const { resolveTheme } = await import('/src/themes/index.ts');
      const format = getFormat(formatId);
      const support = await detectSupport();
      const cues = format.cues ? format.cues(format.defaults) : [];
      const job = {
        format,
        data: format.defaults,
        theme: resolveTheme('ink'),
        branding: { watermark: '@teacher.demo', watermarkPos: 'top-left', logo: null, logoPos: 'top-right', logoSize: 'md' },
        audio: { duration: format.duration(format.defaults), cues, sfxEnabled: true, sfxVolume: 0.8, music: null, voice: null, duck: true },
      };
      const result = await exportVideo(job, () => {}, new AbortController().signal);
      const raw = await result.blob.arrayBuffer();
      let peak = 0;
      try {
        const decoded = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(raw.slice(0));
        for (let c = 0; c < decoded.numberOfChannels; c++) {
          const ch = decoded.getChannelData(c);
          for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
        }
      } catch {
        peak = -1;
      }
      const bytes = new Uint8Array(raw);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { peak, support, method: result.method, ext: result.extension, seconds: result.renderSeconds, duration: job.audio.duration, b64: btoa(bin) };
    }, id);

    const buf = Buffer.from(res.b64, 'base64');
    const file = join(outDir, `e2e-${id}.${res.ext}`);
    writeFileSync(file, buf);
    const info = res.ext === 'mp4' ? inspectMp4(buf) : { types: [], durationSec: null };
    const hasVideo = info.types.some((t) => t.trim() === 'avc1');
    const hasAudio = info.types.some((t) => ['mp4a', 'Opus'].includes(t.trim()));
    const ok = res.ext === 'mp4' && hasVideo && hasAudio && res.peak > 0.05 && info.durationSec !== null && Math.abs(info.durationSec - res.duration) < 0.2;
    if (!ok) failed = true;
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(10)} ${res.method} ${(buf.length / 1024 / 1024).toFixed(2)} MB  video ${res.duration.toFixed(2)}s  ` +
        `mp4 ${info.durationSec?.toFixed(2)}s  avc1=${hasVideo} audio=${hasAudio} peak=${res.peak.toFixed(2)}  rendered in ${res.seconds.toFixed(1)}s  (codec ${res.support.videoCodec}, ${res.support.audioCodec})`,
    );
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);

import { isHexColor, mix, readableOn } from '@/scene/color';

export type BackgroundPattern = 'dots' | 'grid' | 'ruled' | 'speckle' | 'none';

export interface Theme {
  id: ThemeId;
  name: string;
  dark: boolean;
  /** Two-stop background gradient. */
  bg: readonly [string, string];
  /** Gradient angle in degrees (0 = left to right, 90 = top to bottom). */
  bgAngle: number;
  pattern: BackgroundPattern;
  patternColor: string;
  /** Slow drifting soft shapes behind the content. */
  glow: readonly [string, string];
  text: string;
  textMuted: string;
  panel: string;
  panelText: string;
  panelMuted: string;
  accent: string;
  accentText: string;
  correct: string;
  wrong: string;
}

export const THEME_IDS = ['ink', 'coral', 'mint', 'paper', 'grape', 'chalk'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

const presets: Record<ThemeId, Omit<Theme, 'accentText'>> = {
  ink: {
    id: 'ink',
    name: 'Ink',
    dark: true,
    bg: ['#14122b', '#2c2668'],
    bgAngle: 115,
    pattern: 'dots',
    patternColor: 'rgba(255,255,255,0.06)',
    glow: ['#6c5ce7', '#ff6a3d'],
    text: '#ffffff',
    textMuted: '#bdb9e0',
    panel: '#ffffff',
    panelText: '#14122b',
    panelMuted: '#5e5a7d',
    accent: '#ffb547',
    correct: '#22c47a',
    wrong: '#ff5a6a',
  },
  coral: {
    id: 'coral',
    name: 'Coral',
    dark: true,
    bg: ['#ff5f3a', '#ffa25e'],
    bgAngle: 100,
    pattern: 'dots',
    patternColor: 'rgba(255,255,255,0.12)',
    glow: ['#ffd166', '#ff3d6e'],
    text: '#ffffff',
    textMuted: '#ffe7da',
    panel: '#fff8f2',
    panelText: '#2b1608',
    panelMuted: '#8a5a44',
    accent: '#2b1e5c',
    correct: '#14a05a',
    wrong: '#d7263d',
  },
  mint: {
    id: 'mint',
    name: 'Mint',
    dark: false,
    bg: ['#eafbf3', '#bfeedb'],
    bgAngle: 110,
    pattern: 'grid',
    patternColor: 'rgba(14,59,46,0.07)',
    glow: ['#8fe3bd', '#ffe08a'],
    text: '#0e3b2e',
    textMuted: '#3f6e5f',
    panel: '#ffffff',
    panelText: '#0e3b2e',
    panelMuted: '#5c7f73',
    accent: '#6d4aff',
    correct: '#12a565',
    wrong: '#e5484d',
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    dark: false,
    bg: ['#fbf6ec', '#f2e8d5'],
    bgAngle: 90,
    pattern: 'ruled',
    patternColor: 'rgba(60,90,160,0.12)',
    glow: ['#f7c948', '#9ad0ec'],
    text: '#1f1a14',
    textMuted: '#6b6152',
    panel: '#ffffff',
    panelText: '#1f1a14',
    panelMuted: '#7a6f60',
    accent: '#e4572e',
    correct: '#2e9e5b',
    wrong: '#c8323b',
  },
  grape: {
    id: 'grape',
    name: 'Grape',
    dark: true,
    bg: ['#2b1055', '#6a5acd'],
    bgAngle: 130,
    pattern: 'none',
    patternColor: 'rgba(255,255,255,0.05)',
    glow: ['#ff6ec7', '#7ad7f0'],
    text: '#ffffff',
    textMuted: '#d8ccff',
    panel: '#ffffff',
    panelText: '#24123f',
    panelMuted: '#6b5a8a',
    accent: '#ffd166',
    correct: '#2fd08c',
    wrong: '#ff6b8b',
  },
  chalk: {
    id: 'chalk',
    name: 'Chalkboard',
    dark: true,
    bg: ['#1c362b', '#26503f'],
    bgAngle: 95,
    pattern: 'speckle',
    patternColor: 'rgba(245,241,230,0.10)',
    glow: ['#f7d774', '#9ad0ec'],
    text: '#f5f1e6',
    textMuted: '#b9c9bc',
    panel: '#f5f1e6',
    panelText: '#1c362b',
    panelMuted: '#55705f',
    accent: '#f7d774',
    correct: '#4cc46b',
    wrong: '#e8574c',
  },
};

export const THEMES: readonly Theme[] = THEME_IDS.map((id) => {
  const p = presets[id];
  return { ...p, accentText: readableOn(p.accent) };
});

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}

/** Returns a theme, optionally with the user's accent colour swapped in. */
export function resolveTheme(id: ThemeId, accentOverride?: string | null): Theme {
  const base = THEMES.find((t) => t.id === id) ?? THEMES[0];
  if (!base) throw new Error('No themes defined');
  if (!accentOverride || !isHexColor(accentOverride)) return base;
  return {
    ...base,
    accent: accentOverride,
    accentText: readableOn(accentOverride),
    glow: [mix(accentOverride, base.bg[1], 0.3), base.glow[1]],
  };
}

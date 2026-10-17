/** Product name lives here so it is trivial to rename. */
export const APP_NAME = 'Reelingo';

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

/**
 * Area that stays clear of the platform UI overlays (captions, buttons,
 * profile row) on Reels / TikTok / Shorts. Formats keep key content inside it.
 */
export const SAFE = {
  top: 230,
  bottom: VIDEO.height - 400,
  left: 90,
  right: VIDEO.width - 90,
} as const;

export const SAFE_WIDTH = SAFE.right - SAFE.left;
export const SAFE_HEIGHT = SAFE.bottom - SAFE.top;

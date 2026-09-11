import { CaptionConfig, CaptionPosition, WordTimestamp } from './captionTypes';

/**
 * Validates and sanitizes caption position.
 * Allows positions partially or completely outside the visible canvas [-1.0, 2.0]
 * while safeguarding against NaN or non-numeric corruptions.
 */
export function clampCaptionPosition(pos: CaptionPosition): CaptionPosition {
  const rawX = typeof pos?.x === 'number' && !isNaN(pos.x) ? pos.x : 0.50;
  const rawY = typeof pos?.y === 'number' && !isNaN(pos.y) ? pos.y : 0.72;
  return {
    x: Math.max(-1.0, Math.min(2.0, Math.round(rawX * 1000) / 1000)),
    y: Math.max(-1.0, Math.min(2.0, Math.round(rawY * 1000) / 1000)),
  };
}

/**
 * Validates and sanitizes a sequence of WordTimestamps.
 * Ensures start is non-negative and end is strictly greater than start.
 */
export function sanitizeWordTimestamps(rawWords: WordTimestamp[]): WordTimestamp[] {
  if (!Array.isArray(rawWords)) return [];

  return rawWords
    .map((w) => {
      const cleanWord = (w.word || '').trim();
      let start = Math.max(0, isNaN(w.start) ? 0 : w.start);
      let end = Math.max(start + 0.05, isNaN(w.end) ? start + 0.3 : w.end);
      return {
        word: cleanWord,
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
      };
    })
    .filter((w) => w.word.length > 0 && w.word !== '[BLANK_AUDIO]');
}

/**
 * Validates and clamps an entire CaptionConfig to ensure safe rendering parameters.
 * Clamps all numeric fields strictly before reaching the ASS generator or FFmpeg.
 */
export function sanitizeCaptionConfig(config: Partial<CaptionConfig>): CaptionConfig {
  const sanitizedPos = clampCaptionPosition(config.textPosition || { x: 0.50, y: 0.72 });

  // Map legacy and new presets to strictly 'karaoke' or 'standard'
  let preset: 'karaoke' | 'standard' = 'karaoke';
  if (config.preset === 'standard' || config.preset === 'simple_single') {
    preset = 'standard';
  }

  // Max words per group (default 3, min 1, max 10)
  let maxWordsPerGroup = 3;
  if (typeof config.maxWordsPerGroup === 'number' && !isNaN(config.maxWordsPerGroup)) {
    maxWordsPerGroup = Math.max(1, Math.min(10, Math.round(config.maxWordsPerGroup)));
  } else if (config.preset === 'karaoke_double') {
    maxWordsPerGroup = 6;
  }

  // Visual wrap width % (default 80, min 20, max 100)
  const wrapWidthPercent = typeof config.wrapWidthPercent === 'number' && !isNaN(config.wrapWidthPercent)
    ? Math.max(20, Math.min(100, Math.round(config.wrapWidthPercent)))
    : 80;

  // Text Size in px (default 64, min 16, max 160)
  let textSize = 64;
  if (typeof config.textSize === 'number' && !isNaN(config.textSize)) {
    textSize = Math.max(16, Math.min(160, Math.round(config.textSize)));
  } else if (config.textSize === 'small') {
    textSize = 48;
  } else if (config.textSize === 'large') {
    textSize = 80;
  }

  // Text Background Size in px (default 12, min 0, max 60; 0 = no box)
  let textBackgroundSize = 12;
  if (typeof config.textBackgroundSize === 'number' && !isNaN(config.textBackgroundSize)) {
    textBackgroundSize = Math.max(0, Math.min(60, Math.round(config.textBackgroundSize)));
  } else if (config.textBackgroundSize === 'none') {
    textBackgroundSize = 0;
  } else if (config.textBackgroundSize === 'small') {
    textBackgroundSize = 8;
  } else if (config.textBackgroundSize === 'medium') {
    textBackgroundSize = 14;
  } else if (config.textBackgroundSize === 'large') {
    textBackgroundSize = 24;
  }

  // Text Shadow Size in px (default 4, min 0, max 24; 0 = no shadow)
  let textShadowSize = 4;
  if (typeof config.textShadowSize === 'number' && !isNaN(config.textShadowSize)) {
    textShadowSize = Math.max(0, Math.min(24, Math.round(config.textShadowSize)));
  } else if (config.textShadow === 'none') {
    textShadowSize = 0;
  } else if (config.textShadow === 'soft') {
    textShadowSize = 4;
  } else if (config.textShadow === 'hard') {
    textShadowSize = 6;
  }

  // Highlight Word Animation (applies strictly to the active word in Karaoke mode)
  let highlightAnimation: 'pop' | 'scale' | 'none' = 'pop';
  const animCandidate = config.highlightAnimation || config.animation;
  if (animCandidate === 'scale' || animCandidate === 'none') {
    highlightAnimation = animCandidate;
  } else {
    highlightAnimation = 'pop';
  }

  return {
    enabled: config.enabled !== false,
    preset,
    maxWordsPerGroup,
    wrapWidthPercent,
    highlightWord: preset === 'karaoke',
    highlightColorMode: config.highlightColorMode === 'random' ? 'random' : 'custom',
    highlightColor: (config.highlightColor && /^#[0-9A-Fa-f]{6}$/.test(config.highlightColor))
      ? config.highlightColor
      : '#22c55e',
    highlightAnimation,
    animation: highlightAnimation,
    textBackgroundColor: (config.textBackgroundColor && /^#[0-9A-Fa-f]{6}$/.test(config.textBackgroundColor))
      ? config.textBackgroundColor
      : '#000000',
    textBackgroundSize,
    textBackgroundCornerRadius: Math.max(0, Math.min(32, Math.round(config.textBackgroundCornerRadius ?? 8))),
    textBackgroundOpacity: Math.max(0, Math.min(1.0, config.textBackgroundOpacity ?? 0.0)),
    textColor: (config.textColor && /^#[0-9A-Fa-f]{6}$/.test(config.textColor))
      ? config.textColor
      : '#FFFFFF',
    textOpacity: Math.max(0.0, Math.min(1.0, config.textOpacity ?? 1.0)),
    textOutlineColor: (config.textOutlineColor && /^#[0-9A-Fa-f]{6}$/.test(config.textOutlineColor))
      ? config.textOutlineColor
      : '#000000',
    textOutlineSize: Math.max(0, Math.min(16, Math.round(config.textOutlineSize ?? 3))),
    textShadowSize,
    textShadowColor: (config.textShadowColor && /^#[0-9A-Fa-f]{6}$/.test(config.textShadowColor))
      ? config.textShadowColor
      : '#000000',
    textFont: (config.textFont || 'Impact').trim(),
    customFontPath: config.customFontPath,
    customFontName: config.customFontName,
    textSize,
    textWeight: config.textWeight === 'normal' || config.textWeight === 'bold' ? config.textWeight : 'extra-bold',
    textStyle: config.textStyle === 'italic' ? 'italic' : 'normal',
    textPosition: sanitizedPos,
    textUppercase: config.textUppercase !== false,
    aspectRatio: config.aspectRatio === '16:9' || config.aspectRatio === '1:1' || config.aspectRatio === 'original'
      ? config.aspectRatio
      : '9:16',
  };
}


import { CaptionConfig, CaptionPosition, WordTimestamp } from './captionTypes';

/**
 * Centralized temporary unwanted-character replacement list.
 * Only characters explicitly listed here are removed/replaced before caption rendering.
 * Deterministic and easily modifiable for future passes.
 */
export const TEMPORARY_UNWANTED_CAPTION_CHARACTERS: { char: string; replaceWith: string }[] = [
  // Music notes & sound effect cues from speech recognition
  { char: '♪', replaceWith: '' },
  { char: '♫', replaceWith: '' },
  // Unicode replacement / corrupt encoding characters
  { char: '\uFFFD', replaceWith: '' },
  // Zero-width & invisible formatting characters
  { char: '\u200B', replaceWith: '' }, // Zero-width space
  { char: '\u200C', replaceWith: '' }, // Zero-width non-joiner
  { char: '\u200D', replaceWith: '' }, // Zero-width joiner
  { char: '\uFEFF', replaceWith: '' }, // Zero-width no-break space / BOM
  { char: '\u00AD', replaceWith: '' }, // Soft hyphen
  { char: '\u200E', replaceWith: '' }, // Left-to-right mark
  { char: '\u200F', replaceWith: '' }, // Right-to-left mark
  // Stray typographical artifacts
  { char: '•', replaceWith: '' }, // Bullet
  { char: '·', replaceWith: '' }, // Middle dot
  { char: '`', replaceWith: '' }, // Backtick
  { char: '~', replaceWith: '' }, // Tilde
  { char: '|', replaceWith: '' }, // Pipe
  { char: '[BLANK_AUDIO]', replaceWith: '' }, // Whisper blank audio marker
];

/**
 * Applies centralized temporary caption cleanup to text before visual rendering.
 *
 * Rules:
 * A. Remove parenthesized content: (...) including the parentheses.
 *    Examples:
 *    "(cheering) THAT ladies and gentlemen" -> "THAT ladies and gentlemen"
 *    "(applause) This is crazy!" -> "This is crazy!"
 *    "(background music) Look at this." -> "Look at this"
 *
 * B. Remove bracketed content: [...] including the brackets.
 *    Examples:
 *    "[cheering] THAT ladies and gentlemen" -> "THAT ladies and gentlemen"
 *    "[Music] This is crazy!" -> "This is crazy!"
 *    "[background noise] Look at this." -> "Look at this"
 *
 * C. Remove commas: ,
 *    Example:
 *    "THAT, ladies, and gentlemen" -> "THAT ladies and gentlemen"
 *
 * D. Remove periods: .
 *    Example:
 *    "The truth. is simple." -> "The truth is simple"
 *
 * Preserves useful punctuation:
 *    ' (apostrophes)
 *    ? (question marks)
 *    ! (exclamation marks)
 *    : (colons)
 *    ; (semicolons)
 *
 * Examples:
 *    "DON'T DO THIS!" must remain "DON'T DO THIS!"
 *    "WHAT?!" must remain "WHAT?!"
 *    "WAIT: THIS IS CRAZY!" must remain "WAIT: THIS IS CRAZY!"
 *
 * Whitespace cleanup:
 *    Collapses repeated spaces into a single space and trims leading/trailing whitespace.
 *    Preserves exact casing and words without AI paraphrasing.
 */
export function sanitizeCaptionText(text: string): string {
  if (!text) return '';
  let result = text;

  // 1. Remove explicit unwanted characters (music notes, zero-width spaces, corrupt encoding)
  for (const item of TEMPORARY_UNWANTED_CAPTION_CHARACTERS) {
    if (result.includes(item.char)) {
      result = result.split(item.char).join(item.replaceWith);
    }
  }

  // 2. Remove parenthesized content: (...) including parentheses
  result = result.replace(/\([^)]*\)/g, '');

  // 3. Remove bracketed content: [...] including brackets
  result = result.replace(/\[[^\]]*\]/g, '');

  // 4. Remove any stray orphan parentheses or brackets that might remain
  result = result.replace(/[()[\]]/g, '');

  // 5. Remove commas
  result = result.replace(/,/g, '');

  // 6. Remove periods
  result = result.replace(/\./g, '');

  // 7. Collapse repeated whitespace into a single space and trim leading/trailing whitespace
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

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
 * Validates and sanitizes a sequence of WordTimestamps before caption rendering.
 * Ensures start is non-negative, end is strictly greater than start,
 * handles parenthesized and bracketed annotations that may span across words,
 * and applies the centralized caption text sanitizer to each word.
 */
export function sanitizeWordTimestamps(rawWords: WordTimestamp[]): WordTimestamp[] {
  if (!Array.isArray(rawWords)) return [];

  let inParen = false;
  let inBracket = false;
  const sanitized: WordTimestamp[] = [];

  for (const w of rawWords) {
    let wordStr = (w.word || '').trim();
    if (!wordStr) continue;

    // Handle cross-word parentheses if active
    if (inParen) {
      const closeIdx = wordStr.indexOf(')');
      if (closeIdx !== -1) {
        wordStr = wordStr.slice(closeIdx + 1);
        inParen = false;
      } else {
        // Still inside multi-word parenthesized annotation: skip this word
        continue;
      }
    }

    // Handle cross-word brackets if active
    if (inBracket) {
      const closeIdx = wordStr.indexOf(']');
      if (closeIdx !== -1) {
        wordStr = wordStr.slice(closeIdx + 1);
        inBracket = false;
      } else {
        // Still inside multi-word bracketed annotation: skip this word
        continue;
      }
    }

    // Remove any complete parenthesized or bracketed blocks within this token
    wordStr = wordStr.replace(/\([^)]*\)/g, '');
    wordStr = wordStr.replace(/\[[^\]]*\]/g, '');

    // Check if an unclosed '(' begins in this word
    const openParenIdx = wordStr.indexOf('(');
    if (openParenIdx !== -1) {
      wordStr = wordStr.slice(0, openParenIdx);
      inParen = true;
    }

    // Check if an unclosed '[' begins in this word
    const openBracketIdx = wordStr.indexOf('[');
    if (openBracketIdx !== -1) {
      wordStr = wordStr.slice(0, openBracketIdx);
      inBracket = true;
    }

    const cleanWord = sanitizeCaptionText(wordStr);
    if (!cleanWord || cleanWord === '[BLANK_AUDIO]') continue;

    let start = Math.max(0, isNaN(w.start) ? 0 : w.start);
    let end = Math.max(start + 0.05, isNaN(w.end) ? start + 0.3 : w.end);
    sanitized.push({
      word: cleanWord,
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
    });
  }

  return sanitized;
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


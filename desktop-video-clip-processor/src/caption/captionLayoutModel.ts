import { CaptionConfig, OutputAspectRatio, WordTimestamp } from './captionTypes';

export interface CompositionDimensions {
  width: number;
  height: number;
}

/**
 * Returns the reference logical composition dimensions for an aspect ratio.
 * All layout math (font size, outline, padding, coordinates) is defined in this space.
 */
export function getCompositionDimensions(
  aspectRatio: OutputAspectRatio,
  sourceWidth?: number,
  sourceHeight?: number
): CompositionDimensions {
  if (aspectRatio === '16:9') {
    return { width: 1920, height: 1080 };
  }
  if (aspectRatio === '1:1') {
    return { width: 1080, height: 1080 };
  }
  if (aspectRatio === 'original') {
    const w = Math.max(2, sourceWidth || 1920);
    const h = Math.max(2, sourceHeight || 1080);
    return { width: w, height: h };
  }
  // Default: 9:16 vertical
  return { width: 1080, height: 1920 };
}

/**
 * Accurately estimates rendered width of a word glyph sequence in composition pixels.
 */
export function estimateWordWidthInComp(
  word: string,
  fontSize: number,
  fontName: string,
  isBold: boolean,
  isUppercase: boolean
): number {
  const clean = isUppercase ? word.toUpperCase() : word;
  let fontMultiplier = 0.54;
  const lowerFont = (fontName || '').toLowerCase();
  if (lowerFont.includes('impact') || lowerFont.includes('anton') || lowerFont.includes('bebas')) {
    fontMultiplier = 0.44;
  } else if (lowerFont.includes('montserrat')) {
    fontMultiplier = isUppercase ? 0.64 : 0.56;
  } else if (lowerFont.includes('trebuchet') || lowerFont.includes('oswald')) {
    fontMultiplier = isUppercase ? 0.60 : 0.54;
  } else {
    fontMultiplier = isUppercase ? 0.60 : 0.52;
  }

  if (isBold) {
    fontMultiplier *= 1.08;
  }

  let width = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if ('Iijl1!|:;,\'. '.includes(ch)) {
      width += fontSize * fontMultiplier * 0.45;
    } else if ('WMmw@#%&Q'.includes(ch)) {
      width += fontSize * fontMultiplier * 1.35;
    } else if (ch === ' ') {
      width += fontSize * fontMultiplier * 0.55;
    } else {
      width += fontSize * fontMultiplier;
    }
  }

  return Math.max(1, Math.round(width));
}

export interface PlacedWord {
  word: string;
  originalIndex: number;
  width: number;
  centerX: number;
  centerY: number;
}

export interface PlacedLine {
  lineIndex: number;
  words: PlacedWord[];
  lineWidth: number;
  lineHeight: number;
  lineCenterY: number;
}

export interface CaptionGroupLayoutResult {
  compWidth: number;
  compHeight: number;
  fontSize: number;
  spaceWidth: number;
  lines: PlacedLine[];
  allWords: PlacedWord[];
  textBlock: {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
  backgroundBox: {
    hasBox: boolean;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width: number;
    height: number;
    radius: number;
  };
}

/**
 * Deterministic caption group layout engine.
 * Solves word metrics, wrapping, absolute word centers, and background box in composition space.
 * Both the Live Interactive Preview and the ASS renderer consume this exact same model.
 */
export function computeCaptionGroupLayout(
  rawWords: (WordTimestamp | string)[],
  config: CaptionConfig,
  sourceWidth?: number,
  sourceHeight?: number
): CaptionGroupLayoutResult {
  const { width: compWidth, height: compHeight } = getCompositionDimensions(
    config.aspectRatio,
    sourceWidth,
    sourceHeight
  );

  const fontSize = Math.max(16, Math.min(180, Number(config.textSize) || 64));
  const fontName = config.textFont || 'Impact';
  const isBold = config.textWeight === 'bold' || config.textWeight === 'extra-bold';
  const isUppercase = config.textUppercase !== false;

  const wordStrings = rawWords.map((w) => (typeof w === 'string' ? w : w.word));
  const spaceWidth = Math.max(4, Math.round(fontSize * 0.28));
  const lineHeight = Math.round(fontSize * 1.25);

  const clampedWrap = Math.min(100, Math.max(20, config.wrapWidthPercent || 80));
  const maxLineWidth = Math.max(140, Math.round((clampedWrap / 100) * compWidth));

  // Break words into lines based on visual wrap width threshold
  interface TempLineWord {
    word: string;
    originalIndex: number;
    width: number;
  }
  const linesData: TempLineWord[][] = [];
  let currentLine: TempLineWord[] = [];
  let currentLineWidth = 0;

  for (let i = 0; i < wordStrings.length; i++) {
    const rawWord = wordStrings[i];
    const displayWord = isUppercase ? rawWord.toUpperCase() : rawWord;
    const wWidth = estimateWordWidthInComp(displayWord, fontSize, fontName, isBold, isUppercase);
    const addedWidth = currentLine.length === 0 ? wWidth : spaceWidth + wWidth;

    if (currentLine.length > 0 && currentLineWidth + addedWidth > maxLineWidth) {
      linesData.push(currentLine);
      currentLine = [{ word: displayWord, originalIndex: i, width: wWidth }];
      currentLineWidth = wWidth;
    } else {
      currentLine.push({ word: displayWord, originalIndex: i, width: wWidth });
      currentLineWidth += addedWidth;
    }
  }

  if (currentLine.length > 0) {
    linesData.push(currentLine);
  }

  // Caption group center coordinate in composition space
  const centerX = Math.round(config.textPosition.x * compWidth);
  const centerY = Math.round(config.textPosition.y * compHeight);

  // Measure lines and calculate block geometry
  const lineMetrics = linesData.map((lineWords) => {
    const lineWidth =
      lineWords.reduce((sum, w) => sum + w.width, 0) +
      Math.max(0, lineWords.length - 1) * spaceWidth;
    return { words: lineWords, lineWidth };
  });

  const totalLinesHeight = Math.max(lineHeight, lineMetrics.length * lineHeight);
  const maxBlockWidth = Math.max(...lineMetrics.map((l) => l.lineWidth), 60);

  const blockStartY = Math.round(centerY - totalLinesHeight / 2);

  const placedLines: PlacedLine[] = [];
  const allWords: PlacedWord[] = [];

  for (let lineIdx = 0; lineIdx < lineMetrics.length; lineIdx++) {
    const lm = lineMetrics[lineIdx];
    const lineCenterY = Math.round(blockStartY + lineIdx * lineHeight + lineHeight / 2);
    const lineStartX = Math.round(centerX - lm.lineWidth / 2);

    let currX = lineStartX;
    const placedWords: PlacedWord[] = [];

    for (const tw of lm.words) {
      const wordCenterX = Math.round(currX + tw.width / 2);
      const pw: PlacedWord = {
        word: tw.word,
        originalIndex: tw.originalIndex,
        width: tw.width,
        centerX: wordCenterX,
        centerY: lineCenterY,
      };
      placedWords.push(pw);
      allWords.push(pw);
      currX += tw.width + spaceWidth;
    }

    placedLines.push({
      lineIndex: lineIdx,
      words: placedWords,
      lineWidth: lm.lineWidth,
      lineHeight,
      lineCenterY,
    });
  }

  // Background box calculations in composition space
  const rawPad = Number(config.textBackgroundSize) || 0;
  const hasBox = rawPad > 0 && config.textBackgroundOpacity > 0.02;

  let padX = 0;
  let padY = 0;
  if (hasBox) {
    padX = Math.max(6, Math.round(rawPad * 1.5));
    padY = Math.max(4, Math.round(rawPad * 0.8));
  }

  const boxWidth = Math.min(compWidth - 20, maxBlockWidth + padX * 2);
  const boxHeight = totalLinesHeight + padY * 2;
  const x1 = Math.round(centerX - boxWidth / 2);
  const y1 = Math.round(centerY - boxHeight / 2);
  const x2 = Math.round(centerX + boxWidth / 2);
  const y2 = Math.round(centerY + boxHeight / 2);

  const rawRadius = Math.max(0, Number(config.textBackgroundCornerRadius) || 0);
  const radius = Math.min(rawRadius, Math.floor(Math.min(boxWidth / 2, boxHeight / 2)));

  return {
    compWidth,
    compHeight,
    fontSize,
    spaceWidth,
    lines: placedLines,
    allWords,
    textBlock: {
      width: maxBlockWidth,
      height: totalLinesHeight,
      centerX,
      centerY,
    },
    backgroundBox: {
      hasBox,
      x1,
      y1,
      x2,
      y2,
      width: boxWidth,
      height: boxHeight,
      radius,
    },
  };
}

/**
 * Shared active-word animation specifications for both Preview and ASS Subtitles.
 */
export function getActiveWordAnimationSpec(
  animation: string,
  wordDurationMs = 300
): {
  activeScale: number;
  assTransitionTags: string;
  cssClassName: string;
} {
  if (animation === 'pop') {
    // Pop Bounce curve:
    // Phase 1: 0ms -> 90ms: scale 100 -> 132 (overshoot peak)
    // Phase 2: 90ms -> 180ms: scale 132 -> 110 (bounce back)
    // Phase 3: 180ms -> 260ms: scale 110 -> 116 (settled active size)
    const t1 = Math.min(90, Math.max(30, Math.round(wordDurationMs * 0.35)));
    const t2 = Math.min(180, Math.max(t1 + 30, Math.round(wordDurationMs * 0.65)));
    const t3 = Math.min(260, Math.max(t2 + 30, Math.round(wordDurationMs * 0.85)));

    return {
      activeScale: 1.16,
      assTransitionTags: `\\fscx100\\fscy100\\t(0,${t1},\\fscx132\\fscy132)\\t(${t1},${t2},\\fscx110\\fscy110)\\t(${t2},${t3},\\fscx116\\fscy116)`,
      cssClassName: 'caption-active-pop-bounce',
    };
  }

  if (animation === 'scale') {
    // Scale Up: clean constant enlargement (120%)
    return {
      activeScale: 1.20,
      assTransitionTags: `\\fscx120\\fscy120`,
      cssClassName: 'caption-active-scale-up',
    };
  }

  // 'none' or fallback: no scale transform (100%)
  return {
    activeScale: 1.00,
    assTransitionTags: `\\fscx100\\fscy100`,
    cssClassName: 'caption-active-none',
  };
}

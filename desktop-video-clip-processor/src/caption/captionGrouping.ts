import { CaptionGroup, CaptionPreset, WordTimestamp } from './captionTypes';
import { estimateWordWidthInComp } from './captionLayoutModel';

/**
 * Estimates visual rendered width for a word based on character metrics.
 */
export function estimateWordWidth(word: string, fontSize = 64, isUppercase = true, fontName = 'Impact'): number {
  return estimateWordWidthInComp(word, fontSize, fontName, true, isUppercase);
}

/**
 * Greedily packs words into lines based on visual wrap width threshold.
 */
export function layoutWordsIntoLines(
  words: WordTimestamp[],
  wrapWidthPercent = 80,
  fontSize = 64,
  targetWidth = 1080,
  isUppercase = true,
  fontName = 'Impact'
): WordTimestamp[][] {
  if (words.length === 0) return [];
  const clampedPercent = Math.min(100, Math.max(20, wrapWidthPercent));
  const maxLineWidth = Math.max(140, (clampedPercent / 100) * targetWidth);
  const spaceWidth = Math.max(4, Math.round(fontSize * 0.28));

  const lines: WordTimestamp[][] = [];
  let currentLine: WordTimestamp[] = [];
  let currentLineWidth = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wWidth = estimateWordWidth(w.word, fontSize, isUppercase, fontName);
    const addedWidth = currentLine.length === 0 ? wWidth : spaceWidth + wWidth;

    if (currentLine.length > 0 && currentLineWidth + addedWidth > maxLineWidth) {
      lines.push(currentLine);
      currentLine = [w];
      currentLineWidth = wWidth;
    } else {
      currentLine.push(w);
      currentLineWidth += addedWidth;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Dedicated Caption Grouping Engine — V2.
 *
 * Takes a sequence of Whisper word-level timestamps and chunks them into rhythmic caption groups
 * based on user-configurable maxWords (default: 3, min: 1, max: 10) and visual wrap width.
 */
export function groupWordsForCaption(
  words: WordTimestamp[],
  maxWordsOrPreset: number | CaptionPreset = 3,
  wrapWidthPercent = 80,
  fontSize = 64,
  targetWidth = 1080,
  isUppercase = true
): CaptionGroup[] {
  if (!words || words.length === 0) {
    return [];
  }

  const rawMaxWords = typeof maxWordsOrPreset === 'number' 
    ? maxWordsOrPreset 
    : (maxWordsOrPreset.defaultMaxWords || 3);
  const maxWords = Math.min(10, Math.max(1, rawMaxWords));

  const groups: CaptionGroup[] = [];
  let currentWords: WordTimestamp[] = [];
  let groupId = 1;

  const flushGroup = () => {
    if (currentWords.length === 0) return;

    const firstWord = currentWords[0];
    const lastWord = currentWords[currentWords.length - 1];
    const startSec = firstWord.start;
    const endSec = Math.max(startSec + 0.1, lastWord.end);

    // Layout words into lines according to visual wrap width
    const lineWordGroups = layoutWordsIntoLines(
      currentWords,
      wrapWidthPercent,
      fontSize,
      targetWidth,
      isUppercase
    );

    const lines = lineWordGroups.map((lg) => lg.map((w) => w.word).join(' '));

    groups.push({
      id: groupId++,
      words: [...currentWords],
      startSec,
      endSec,
      lines,
      fullText: currentWords.map((w) => w.word).join(' '),
    });

    currentWords = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    currentWords.push(w);

    if (currentWords.length >= maxWords) {
      flushGroup();
    }
  }

  if (currentWords.length > 0) {
    flushGroup();
  }

  return groups;
}


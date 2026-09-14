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

  return normalizeCaptionTimeline(groups);
}

/**
 * Normalizes the visual caption timeline to prevent simultaneous caption overlaps on screen.
 *
 * General Rule:
 * - Caption groups are processed chronologically.
 * - When a newer caption group starts while an existing caption group is still active,
 *   the previous caption's effective end time is truncated to the newer caption's start time (replacement).
 * - Caption B then becomes the active caption.
 * - If truncation leaves a caption with zero or negligible visual duration (< 0.05s / 50ms),
 *   it is discarded safely to prevent visual flicker or negative/zero durations.
 * - Non-overlapping captions preserve their exact timing.
 * - The original Whisper transcript and word timestamps in `group.words` remain untouched.
 */
export function normalizeCaptionTimeline(groups: CaptionGroup[]): CaptionGroup[] {
  if (!groups || groups.length === 0) {
    return [];
  }

  // Sort deterministically in chronological order
  const sorted = [...groups].sort((a, b) => a.startSec - b.startSec || a.id - b.id);
  const resolved: CaptionGroup[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const rawCurrent = sorted[i];
    const currentStart = Math.round(rawCurrent.startSec * 1000) / 1000;
    const currentEnd = Math.round(rawCurrent.endSec * 1000) / 1000;

    // Discard any fundamentally invalid input group where end <= start or duration < 50ms
    if (currentEnd - currentStart < 0.05) {
      continue;
    }

    const current: CaptionGroup = {
      ...rawCurrent,
      startSec: currentStart,
      endSec: currentEnd,
    };

    // Resolve overlaps against preceding active captions in chronological order
    while (resolved.length > 0) {
      const prev = resolved[resolved.length - 1];

      // If current starts at or before prev's startSec, prev has no valid display window before current
      if (current.startSec <= prev.startSec) {
        resolved.pop();
        continue;
      }

      // If current starts before prev ends, truncate prev's effective end time to current's start time
      if (current.startSec < prev.endSec) {
        prev.endSec = current.startSec;

        // If truncation leaves prev with zero or negligible visual duration (< 50ms), discard safely
        if (prev.endSec - prev.startSec < 0.05) {
          resolved.pop();
          continue;
        }
      }

      break;
    }

    resolved.push(current);
  }

  // Re-index ids sequentially to maintain clean 1-based ordering
  for (let i = 0; i < resolved.length; i++) {
    resolved[i].id = i + 1;
  }

  return resolved;
}


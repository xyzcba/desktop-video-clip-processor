import fs from 'fs';
import {
  CaptionConfig,
  WordTimestamp,
} from '../src/caption/captionTypes';
import { getCaptionPreset } from '../src/caption/captionPresets';
import {
  groupWordsForCaption,
} from '../src/caption/captionGrouping';
import {
  getWordHighlightColor,
  hexToAssColor,
  opacityToAssAlpha,
} from '../src/caption/captionColors';
import { sanitizeCaptionConfig } from '../src/caption/captionValidation';
import {
  computeCaptionGroupLayout,
  getActiveWordAnimationSpec,
  getCompositionDimensions,
} from '../src/caption/captionLayoutModel';

/**
 * Formats seconds into ASS time format: H:MM:SS.cs (centiseconds).
 */
export function formatAssTime(seconds: number): string {
  const safeSec = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const h = Math.floor(safeSec / 3600);
  const m = Math.floor((safeSec % 3600) / 60);
  const s = Math.floor(safeSec % 60);
  const cs = Math.floor((safeSec % 1) * 100);

  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Converts a standard 6-digit hex color (#RRGGBB) to ASS BGR format (BBGGRR).
 */
function hexToAssBgr(hex: string): string {
  const cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length !== 6) return 'FFFFFF';
  const r = cleanHex.substring(0, 2);
  const g = cleanHex.substring(2, 4);
  const b = cleanHex.substring(4, 6);
  return `${b}${g}${r}`;
}

/**
 * Generates an ASS vector drawing path (\p1 ... \p0) for a rounded rectangle.
 * When radius <= 0, outputs a sharp rectangle.
 * When radius > 0, outputs smooth cubic bezier curves (b command) for all 4 corners.
 */
export function getRoundedRectAssPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rawRadius: number
): string {
  const w = x2 - x1;
  const h = y2 - y1;
  const maxR = Math.min(w / 2, h / 2);
  const radius = Math.max(0, Math.min(Math.round(rawRadius), Math.floor(maxR)));

  if (radius <= 0) {
    return `m ${x1} ${y1} l ${x2} ${y1} l ${x2} ${y2} l ${x1} ${y2}`;
  }

  // Kappa constant for cubic bezier approximation of a quarter circle
  const c = Math.round(radius * 0.55228475);
  const p: string[] = [
    `m ${x1 + radius} ${y1}`,
    `l ${x2 - radius} ${y1}`,
    `b ${x2 - radius + c} ${y1} ${x2} ${y1 + radius - c} ${x2} ${y1 + radius}`,
    `l ${x2} ${y2 - radius}`,
    `b ${x2} ${y2 - radius + c} ${x2 - radius + c} ${y2} ${x2 - radius} ${y2}`,
    `l ${x1 + radius} ${y2}`,
    `b ${x1 + radius - c} ${y2} ${x1} ${y2 - radius + c} ${x1} ${y2 - radius}`,
    `l ${x1} ${y1 + radius}`,
    `b ${x1 + radius - c} ${x1 + radius - c} ${y1} ${x1 + radius} ${y1}`,
  ];

  return p.join(' ');
}

/**
 * Generates an Advanced SubStation Alpha (.ass) subtitle file.
 * Driven strictly by the unified normalized caption layout model:
 * - PlayResX & PlayResY match composition space
 * - Captions retain full group stability throughout the group duration
 * - Inactive words stay completely visible and stationary
 * - Active word pop/scale animation applies only to the active word
 */
export function generateAssSubtitleFile(
  clipWords: WordTimestamp[],
  rawConfig: CaptionConfig,
  targetWidth: number,
  targetHeight: number,
  outputPath: string
): string {
  const config = sanitizeCaptionConfig(rawConfig);
  const preset = getCaptionPreset(config.preset);

  // Logical composition dimensions derived from aspect ratio
  const { width: compWidth, height: compHeight } = getCompositionDimensions(
    config.aspectRatio,
    targetWidth,
    targetHeight
  );

  const baseFontSize = Math.max(16, Math.min(180, Number(config.textSize) || 64));
  const fontName = config.textFont || 'Impact';
  const primaryColorAss = hexToAssColor(config.textColor, opacityToAssAlpha(config.textOpacity));

  const boldVal = config.textWeight === 'normal' ? 0 : -1;
  const italicVal = config.textStyle === 'italic' ? -1 : 0;

  const outlineVal = Math.max(0, config.textOutlineSize);
  const outlineColorAss = hexToAssColor(config.textOutlineColor, '00');

  const shadowVal = Math.max(0, config.textShadowSize);
  const shadowColorAss = hexToAssColor(
    config.textShadowColor || '#000000',
    config.textShadowSize <= 0 ? 'FF' : '00'
  );

  // Group words based on user-configured maxWords
  const groups = groupWordsForCaption(
    clipWords,
    config.maxWordsPerGroup,
    config.wrapWidthPercent,
    baseFontSize,
    compWidth,
    config.textUppercase
  );

  // Build ASS Header & Styles in Composition Space
  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${compWidth}`,
    `PlayResY: ${compHeight}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${fontName},${baseFontSize},${primaryColorAss},&H000000FF,${outlineColorAss},${shadowColorAss},${boldVal},${italicVal},0,0,100,100,0,0,1,${outlineVal},${shadowVal},5,10,10,10,1`,
    `Style: BgShape,Arial,${baseFontSize},&H00000000,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  let globalWordCounter = 0;

  for (const group of groups) {
    if (group.words.length === 0) continue;

    // Unified layout calculation in composition coordinates
    const layout = computeCaptionGroupLayout(group.words, config, compWidth, compHeight);

    // Layer 0: Background Box (spans entire group duration)
    if (layout.backgroundBox.hasBox) {
      const bgPath = getRoundedRectAssPath(
        layout.backgroundBox.x1,
        layout.backgroundBox.y1,
        layout.backgroundBox.x2,
        layout.backgroundBox.y2,
        layout.backgroundBox.radius
      );
      const bgBgr = hexToAssBgr(config.textBackgroundColor);
      const bgAlpha = opacityToAssAlpha(config.textBackgroundOpacity);

      lines.push(
        `Dialogue: 0,${formatAssTime(group.startSec)},${formatAssTime(group.endSec)},BgShape,,0,0,0,,{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H${bgBgr}&\\1a&H${bgAlpha}&\\p1}${bgPath}{\\p0}`
      );
    }

    // Layer 1: Text Rendering
    if (!preset.highlightWord || !config.highlightWord) {
      // Standard preset: Clean, stable lines centered at lineCenterY across the group duration
      for (const line of layout.lines) {
        const lineText = line.words.map((w) => w.word).join(' ');
        lines.push(
          `Dialogue: 1,${formatAssTime(group.startSec)},${formatAssTime(group.endSec)},Default,,0,0,0,,{\\an5\\pos(${layout.textBlock.centerX},${line.lineCenterY})}${lineText}`
        );
      }
      globalWordCounter += group.words.length;
    } else {
      // Karaoke preset: Every word is positioned at its own fixed (centerX, centerY).
      // Inactive words remain completely visible and spatially fixed.
      // Active word scales and highlights around its own center without shifting adjacent words.
      const groupDurationStart = group.startSec;
      const groupDurationEnd = group.endSec;

      for (const pw of layout.allWords) {
        const wIdx = pw.originalIndex;
        const activeWord = group.words[wIdx];

        // Contiguous active time window for this word, strictly bounded by the group's effective timeline
        const rawWordStart = wIdx === 0 ? groupDurationStart : activeWord.start;
        const wordStart = Math.min(groupDurationEnd, Math.max(groupDurationStart, rawWordStart));

        const rawNextWordStart =
          wIdx + 1 < group.words.length ? group.words[wIdx + 1].start : groupDurationEnd;
        const nextWordStart = Math.min(groupDurationEnd, Math.max(wordStart, rawNextWordStart));
        const wordEnd = Math.min(groupDurationEnd, Math.max(wordStart, nextWordStart));

        const stableWordIdx = globalWordCounter + wIdx;
        const highlightHex = getWordHighlightColor(
          config.highlightColorMode,
          config.highlightColor,
          stableWordIdx
        );
        const highlightColorAss = hexToAssColor(highlightHex, '00');

        // 1. Inactive before active window (if not the first word)
        if (wordStart > groupDurationStart) {
          lines.push(
            `Dialogue: 1,${formatAssTime(groupDurationStart)},${formatAssTime(wordStart)},Default,,0,0,0,,{\\an5\\pos(${pw.centerX},${pw.centerY})\\c${primaryColorAss}\\fscx100\\fscy100}${pw.word}`
          );
        }

        // 2. Active window with highlight color & animation
        if (wordEnd > wordStart) {
          const wordDurationMs = Math.round((wordEnd - wordStart) * 1000);
          const animSpec = getActiveWordAnimationSpec(config.highlightAnimation, wordDurationMs);
          lines.push(
            `Dialogue: 1,${formatAssTime(wordStart)},${formatAssTime(wordEnd)},Default,,0,0,0,,{\\an5\\pos(${pw.centerX},${pw.centerY})\\c${highlightColorAss}${animSpec.assTransitionTags}}${pw.word}`
          );
        }

        // 3. Inactive after active window (if not the last word)
        if (wordEnd < groupDurationEnd) {
          lines.push(
            `Dialogue: 1,${formatAssTime(wordEnd)},${formatAssTime(groupDurationEnd)},Default,,0,0,0,,{\\an5\\pos(${pw.centerX},${pw.centerY})\\c${primaryColorAss}\\fscx100\\fscy100}${pw.word}`
          );
        }
      }

      globalWordCounter += group.words.length;
    }
  }

  const content = lines.join('\n');
  fs.writeFileSync(outputPath, content, 'utf8');
  return outputPath;
}



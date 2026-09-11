import { HighlightColorMode } from './captionTypes';

/**
 * Curated readable palette for Random highlight mode.
 * High-saturation, vibrant colors that remain distinct and clear against dark or light video.
 */
export const VIBRANT_HIGHLIGHT_PALETTE = [
  '#22c55e', // Emerald Green
  '#eab308', // Amber Gold
  '#ec4899', // Hot Pink
  '#38bdf8', // Sky Cyan
  '#fb923c', // Tangerine Orange
  '#a855f7', // Electric Purple
  '#34d399', // Mint Turquoise
  '#f43f5e', // Bright Rose
];

export const RANDOM_HIGHLIGHT_PALETTE = VIBRANT_HIGHLIGHT_PALETTE;

export const POPULAR_HIGHLIGHT_SWATCHES = [
  { name: 'Neon Yellow', hex: '#FFFF00' },
  { name: 'Emerald Green', hex: '#22C55E' },
  { name: 'Electric Cyan', hex: '#00F0FF' },
  { name: 'Hot Pink', hex: '#FF1493' },
  { name: 'Bright Orange', hex: '#FB923C' },
  { name: 'Pure Gold', hex: '#FFD700' },
  { name: 'Vivid Purple', hex: '#A855F7' },
  { name: 'Pure White', hex: '#FFFFFF' },
];

/**
 * Returns the highlight color for a given word index.
 * In custom mode, returns the user's custom color.
 * In random mode, cycles through the vibrant palette per word.
 */
export function getWordHighlightColor(
  mode: HighlightColorMode,
  customColor: string,
  wordIndex: number
): string {
  if (mode === 'custom') {
    return customColor || '#22c55e';
  }
  const paletteIndex = Math.abs(wordIndex) % VIBRANT_HIGHLIGHT_PALETTE.length;
  return VIBRANT_HIGHLIGHT_PALETTE[paletteIndex];
}

/**
 * Converts a standard 6-digit hex color (#RRGGBB) to ASS subtitle format (&H00BBGGRR&).
 */
export function hexToAssColor(hex: string, alphaHex: string = '00'): string {
  const cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length !== 6) {
    return '&H00FFFFFF&';
  }
  const r = cleanHex.substring(0, 2);
  const g = cleanHex.substring(2, 4);
  const b = cleanHex.substring(4, 6);
  // ASS color order is &HAABBGGRR& where AA is opacity (00 = opaque, FF = fully transparent)
  return `&H${alphaHex}${b}${g}${r}&`;
}

/**
 * Converts opacity (0.0 to 1.0) to ASS 2-digit hex alpha (00 = opaque, FF = transparent).
 */
export function opacityToAssAlpha(opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  // In ASS, 0 is fully opaque, 255 is fully transparent
  const assVal = Math.round((1 - clamped) * 255);
  return assVal.toString(16).padStart(2, '0').toUpperCase();
}

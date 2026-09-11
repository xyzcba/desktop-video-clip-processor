/**
 * Caption & Aspect Ratio Types — V2
 * Clean configuration model for presets (Karaoke, Standard), configurable word counts,
 * wrap width, typography, word-level animations, and aspect ratios.
 */

export interface WordTimestamp {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
}

// Exactly two presets: Karaoke and Standard (with legacy IDs supported for smooth migration)
export type CaptionPresetId = 'karaoke' | 'standard' | 'karaoke_single' | 'karaoke_double' | 'simple_single';

export interface CaptionPreset {
  id: 'karaoke' | 'standard';
  name: string;
  description: string;
  defaultMaxWords: number;
  highlightWord: boolean;
}

export type HighlightColorMode = 'custom' | 'random';

// Highlight Word Animation applies strictly to the active word in Karaoke mode
export type HighlightWordAnimation = 'pop' | 'scale' | 'none';
export type CaptionAnimation = HighlightWordAnimation | 'fade' | 'slide_up' | 'slide_down';

export type OutputAspectRatio = '9:16' | '16:9' | '1:1' | 'original';
export type FramingMode = 'crop' | 'face_tracking';

export interface CaptionPosition {
  x: number; // Normalized horizontal position 0.0 to 1.0 (default 0.50 center; can extend outside)
  y: number; // Normalized vertical position 0.0 to 1.0 (default 0.72 lower third; can extend outside)
}

export type TextWeightOption = 'normal' | 'bold' | 'extra-bold';
export type TextStyleOption = 'normal' | 'italic';

// Legacy type helpers for backwards compatibility
export type TextSizeOption = 'small' | 'medium' | 'large';
export type TextShadowOption = 'none' | 'soft' | 'hard';
export type BackgroundPaddingOption = 'none' | 'small' | 'medium' | 'large';

export interface CaptionConfig {
  enabled?: boolean;                 // Burn Captions into Video (default: true)
  preset: CaptionPresetId;          // 'karaoke' | 'standard'
  maxWordsPerGroup: number;         // Configurable max words per group (default: 3, min: 1, max: 10)
  wrapWidthPercent: number;         // Visual wrap width % before wrapping onto next line (default: 80, min: 20, max: 100)
  highlightWord: boolean;           // true for karaoke, false for standard
  highlightColorMode: HighlightColorMode; // 'custom' | 'random'
  highlightColor: string;           // Vibrant green e.g. '#22c55e'
  highlightAnimation: HighlightWordAnimation; // 'pop' | 'scale' | 'none' (applies to active word only)
  animation?: CaptionAnimation;     // Backwards-compatible alias
  textBackgroundColor: string;      // Hex color e.g. '#000000'
  textBackgroundSize: number | BackgroundPaddingOption; // Numeric padding in px (0 = no background)
  textBackgroundCornerRadius: number; // Corner radius in px (0 to 32px)
  textBackgroundOpacity: number;     // 0.0 to 1.0
  textColor: string;                 // Base text color, e.g. '#FFFFFF'
  textOpacity: number;               // 0.0 to 1.0
  textOutlineColor: string;          // Stroke color e.g. '#000000'
  textOutlineSize: number;           // Outline size in px (0 to 16px)
  textShadowSize: number;            // Shadow offset/blur in px (0 to 24px, 0 = none)
  textShadowColor: string;           // Shadow color e.g. '#000000'
  textShadow?: TextShadowOption;     // Legacy fallback
  textFont: string;                  // e.g. 'Montserrat', 'Arial', 'Impact'
  customFontPath?: string;           // Path to uploaded custom font asset
  customFontName?: string;           // Display name of uploaded custom font
  textSize: number | TextSizeOption; // Numeric font size in px (default 64, min 16, max 160)
  textWeight: TextWeightOption;      // 'normal' | 'bold' | 'extra-bold'
  textStyle: TextStyleOption;        // 'normal' | 'italic'
  textPosition: CaptionPosition;     // Normalized { x, y }
  textUppercase: boolean;            // Default true
  aspectRatio: OutputAspectRatio;    // '9:16' | '16:9' | '1:1' | 'original'
  framingMode?: FramingMode;         // 'crop' (static center crop) | 'face_tracking' (dynamic face auto-framing)
}

export interface CaptionGroup {
  id: number;
  words: WordTimestamp[];
  startSec: number;
  endSec: number;
  lines: string[];
  fullText: string;
}

export const DEFAULT_CAPTION_CONFIG: CaptionConfig = {
  enabled: true,
  preset: 'karaoke',
  maxWordsPerGroup: 3,
  wrapWidthPercent: 80,
  highlightWord: true,
  highlightColorMode: 'custom',
  highlightColor: '#22c55e', // Vibrant emerald green
  highlightAnimation: 'pop',
  animation: 'pop',
  textBackgroundColor: '#000000',
  textBackgroundSize: 12,
  textBackgroundCornerRadius: 8,
  textBackgroundOpacity: 0.0,
  textColor: '#FFFFFF',
  textOpacity: 1.0,
  textOutlineColor: '#000000',
  textOutlineSize: 3,
  textShadowSize: 4,
  textShadowColor: '#000000',
  textFont: 'Impact',
  textSize: 64,
  textWeight: 'extra-bold',
  textStyle: 'normal',
  textPosition: { x: 0.50, y: 0.72 }, // Centered, lower third
  textUppercase: true,
  aspectRatio: '9:16',
  framingMode: 'face_tracking',
};

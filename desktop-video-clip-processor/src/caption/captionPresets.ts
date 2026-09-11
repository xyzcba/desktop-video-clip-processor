import { CaptionPreset, CaptionPresetId } from './captionTypes';

export const CAPTION_PRESETS: Record<'karaoke' | 'standard', CaptionPreset> = {
  karaoke: {
    id: 'karaoke',
    name: 'Karaoke',
    description: 'Rhythmic caption groups with real-time active word highlighting and animation.',
    defaultMaxWords: 3,
    highlightWord: true,
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    description: 'Clean, consistent modern subtitle style without word highlighting.',
    defaultMaxWords: 3,
    highlightWord: false,
  },
};

// Helper lookup that also maps legacy preset IDs smoothly
export function getCaptionPreset(id: CaptionPresetId | string): CaptionPreset {
  if (id === 'standard' || id === 'simple_single') {
    return CAPTION_PRESETS.standard;
  }
  return CAPTION_PRESETS.karaoke;
}

export const PRESET_LIST: CaptionPreset[] = [
  CAPTION_PRESETS.karaoke,
  CAPTION_PRESETS.standard,
];


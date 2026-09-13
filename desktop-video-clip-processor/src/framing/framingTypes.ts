export type FramingMode = 'crop' | 'face_tracking' | 'dynamic_face_tracking';

export interface FramingConfig {
  mode: FramingMode;
  /** Normalized horizontal crop position (0.0 = left, 0.5 = center, 1.0 = right) */
  cropPositionX?: number;
  /** Normalized vertical crop position (0.0 = top, 0.5 = center, 1.0 = bottom) */
  cropPositionY?: number;
  /** Zoom scale multiplier (default 1.0 = standard fit) */
  cropZoom?: number;
}

export const DEFAULT_FRAMING_CONFIG: FramingConfig = {
  mode: 'face_tracking',
  cropPositionX: 0.5,
  cropPositionY: 0.5,
  cropZoom: 1.0,
};

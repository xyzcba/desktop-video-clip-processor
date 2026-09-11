export interface DetectedFace {
  /** Center X in source video coordinates */
  x: number;
  /** Center Y in source video coordinates */
  y: number;
  /** Width in source video coordinates */
  width: number;
  /** Height in source video coordinates */
  height: number;
  /** Confidence score between 0 and 1 */
  score: number;
}

export interface FrameFaceDetection {
  /** Relative timestamp in seconds from clip start */
  timestampSec: number;
  faces: DetectedFace[];
}

export interface TrackingCropResult {
  cropW: number;
  cropH: number;
  cropFilter: string;
  hasTrackedFace: boolean;
}

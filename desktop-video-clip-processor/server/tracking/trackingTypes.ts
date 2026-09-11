export interface FaceBoundingBox {
  x1: number; // normalized 0..1
  y1: number; // normalized 0..1
  x2: number; // normalized 0..1
  y2: number; // normalized 0..1
  confidence: number;
}

export interface SampledFrameDetection {
  timestamp: number; // seconds relative to clip start
  frameIndex: number;
  faces: FaceBoundingBox[];
  /** Motion variation in mouth/lower-face region for each detected face */
  mouthMotionScores: number[];
}

export interface FaceTrackPoint {
  timestamp: number;
  box: FaceBoundingBox;
  mouthMotion: number;
}

export interface FaceTrack {
  id: number;
  firstTimestamp: number;
  lastSeenTimestamp: number;
  points: FaceTrackPoint[];
  /** Exponentially smoothed face center (normalized 0..1) */
  smoothedCenter: { x: number; y: number };
  /** Average width & height of the face bounding box (normalized 0..1) */
  averageSize: { width: number; height: number };
  /** Accumulated speaking activity score */
  speakingScore: number;
  /** When this face was last considered actively speaking */
  lastSpokeTimestamp: number;
}

export interface CropKeyframe {
  timestamp: number; // seconds relative to clip start
  x: number; // pixel crop x
  y: number; // pixel crop y
  width: number;
  height: number;
}

export interface TrackingResult {
  hasFaces: boolean;
  cropFilter: string;
  sendcmdFilePath?: string;
  keyframes: CropKeyframe[];
  detectedTracksCount: number;
}

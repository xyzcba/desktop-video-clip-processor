import { WordTimestamp } from '../../src/types';
import { OutputAspectRatio } from '../../src/caption/captionTypes';
import { detectFacesInClipRange } from './faceDetector';
import { buildFaceTracks } from './faceTracker';
import { computeSpeakerTrajectory } from './speakerSelector';
import { generateSmoothCropPath } from './cropPathGenerator';
import { TrackingResult } from './trackingTypes';
import { calculateTargetResolution } from '../ffmpegService';

export interface TrackingPipelineOptions {
  videoPath: string;
  startSec: number;
  durationSec: number;
  sourceWidth: number;
  sourceHeight: number;
  aspectRatio: OutputAspectRatio;
  words?: WordTimestamp[];
  workingDir: string;
  clipId: string | number;
  abortSignal?: AbortSignal;
}

/**
 * Executes the complete face detection, track association, multimodal speaker selection,
 * and smooth cinematic crop path generation for a single clip.
 */
export async function executeFaceTrackingPipeline(
  options: TrackingPipelineOptions
): Promise<TrackingResult> {
  const {
    videoPath,
    startSec,
    durationSec,
    sourceWidth,
    sourceHeight,
    aspectRatio,
    words = [],
    workingDir,
    clipId,
    abortSignal,
  } = options;

  console.log(`[Face Tracking] Analyzing clip ${clipId} (${startSec.toFixed(1)}s - ${(startSec + durationSec).toFixed(1)}s)...`);

  // Step 1: Sparse ONNX Face Detection at 2 FPS
  const detections = await detectFacesInClipRange(videoPath, startSec, durationSec, abortSignal);

  // Check if any faces were found
  const totalDetections = detections.reduce((sum, d) => sum + d.faces.length, 0);
  if (totalDetections === 0) {
    console.log(`[Face Tracking] Clip ${clipId}: No faces detected. Falling back to default center framing.`);
    const { cropFilter } = calculateTargetResolution(sourceWidth, sourceHeight, aspectRatio);
    return {
      hasFaces: false,
      cropFilter,
      keyframes: [],
      detectedTracksCount: 0,
    };
  }

  // Step 2: Temporal Track Association
  const tracks = buildFaceTracks(detections);
  if (tracks.length === 0) {
    console.log(`[Face Tracking] Clip ${clipId}: Detections were transient noise. Falling back to default center framing.`);
    const { cropFilter } = calculateTargetResolution(sourceWidth, sourceHeight, aspectRatio);
    return {
      hasFaces: false,
      cropFilter,
      keyframes: [],
      detectedTracksCount: 0,
    };
  }

  console.log(`[Face Tracking] Clip ${clipId}: Identified ${tracks.length} stable face track(s).`);

  // Step 3: Multimodal Speaker Selection with Hysteresis
  const trajectory = computeSpeakerTrajectory(tracks, durationSec, words);

  // Step 4: Cinematic Crop Path Generation with Deadband and Smoothstep
  const { keyframes, sendcmdFilePath, cropFilter } = generateSmoothCropPath(
    trajectory,
    sourceWidth,
    sourceHeight,
    durationSec,
    aspectRatio,
    workingDir,
    clipId
  );

  console.log(`[Face Tracking] Clip ${clipId}: Generated smooth crop path with ${keyframes.length} keyframes.`);

  return {
    hasFaces: true,
    cropFilter,
    sendcmdFilePath,
    keyframes,
    detectedTracksCount: tracks.length,
  };
}

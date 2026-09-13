import { WordTimestamp } from '../../src/types';
import { OutputAspectRatio } from '../../src/caption/captionTypes';
import { detectFacesInClipRange } from './faceDetector';
import { buildFaceTracks } from './faceTracker';
import { computeSpeakerTrajectory, computeDynamicSpeakerTrajectory } from './speakerSelector';
import { generateSmoothCropPath } from './cropPathGenerator';
import { generateDynamicSmoothCropPath } from './dynamicCropPathGenerator';
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
  mode?: 'face_tracking' | 'dynamic_face_tracking';
  abortSignal?: AbortSignal;
}

/**
 * Executes the complete face detection, track association, multimodal speaker selection,
 * and smooth camera crop path generation for a single clip.
 * Supports both:
 * - 'face_tracking': Horizontal Face Tracking (preserves existing 1D horizontal follow)
 * - 'dynamic_face_tracking': Dynamic Face Tracking (2D horizontal + vertical follow with natural face zoom)
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
    mode = 'face_tracking',
    abortSignal,
  } = options;

  const isDynamic = mode === 'dynamic_face_tracking';
  const modeLabel = isDynamic ? 'Dynamic Face Tracking' : 'Horizontal Face Tracking';
  console.log(`[${modeLabel}] Analyzing clip ${clipId} (${startSec.toFixed(1)}s - ${(startSec + durationSec).toFixed(1)}s)...`);

  // Step 1: Sparse ONNX Face Detection at 2 FPS
  const detections = await detectFacesInClipRange(videoPath, startSec, durationSec, abortSignal);

  // Check if any faces were found
  const totalDetections = detections.reduce((sum, d) => sum + d.faces.length, 0);
  if (totalDetections === 0) {
    console.log(`[${modeLabel}] Clip ${clipId}: No faces detected. Falling back to default center framing.`);
    if (isDynamic) {
      const fallback = generateDynamicSmoothCropPath(
        [],
        sourceWidth,
        sourceHeight,
        durationSec,
        aspectRatio,
        workingDir,
        clipId
      );
      return {
        hasFaces: false,
        cropFilter: fallback.cropFilter,
        keyframes: fallback.keyframes,
        detectedTracksCount: 0,
      };
    } else {
      const { cropFilter } = calculateTargetResolution(sourceWidth, sourceHeight, aspectRatio);
      return {
        hasFaces: false,
        cropFilter,
        keyframes: [],
        detectedTracksCount: 0,
      };
    }
  }

  // Step 2: Temporal Track Association
  const tracks = buildFaceTracks(detections);
  if (tracks.length === 0) {
    console.log(`[${modeLabel}] Clip ${clipId}: Detections were transient noise. Falling back to default center framing.`);
    if (isDynamic) {
      const fallback = generateDynamicSmoothCropPath(
        [],
        sourceWidth,
        sourceHeight,
        durationSec,
        aspectRatio,
        workingDir,
        clipId
      );
      return {
        hasFaces: false,
        cropFilter: fallback.cropFilter,
        keyframes: fallback.keyframes,
        detectedTracksCount: 0,
      };
    } else {
      const { cropFilter } = calculateTargetResolution(sourceWidth, sourceHeight, aspectRatio);
      return {
        hasFaces: false,
        cropFilter,
        keyframes: [],
        detectedTracksCount: 0,
      };
    }
  }

  console.log(`[${modeLabel}] Clip ${clipId}: Identified ${tracks.length} stable face track(s).`);

  if (isDynamic) {
    // Dynamic Face Tracking: tuned speaker selection & 2D pan/tilt + moderate zoom
    const trajectory = computeDynamicSpeakerTrajectory(tracks, durationSec, words);
    const { keyframes, sendcmdFilePath, cropFilter } = generateDynamicSmoothCropPath(
      trajectory,
      sourceWidth,
      sourceHeight,
      durationSec,
      aspectRatio,
      workingDir,
      clipId
    );

    console.log(`[Dynamic Face Tracking] Clip ${clipId}: Generated 2D smooth crop path with ${keyframes.length} keyframes.`);

    return {
      hasFaces: true,
      cropFilter,
      sendcmdFilePath,
      keyframes,
      detectedTracksCount: tracks.length,
    };
  }

  // Horizontal Face Tracking: 100% preserved existing pipeline
  const trajectory = computeSpeakerTrajectory(tracks, durationSec, words);
  const { keyframes, sendcmdFilePath, cropFilter } = generateSmoothCropPath(
    trajectory,
    sourceWidth,
    sourceHeight,
    durationSec,
    aspectRatio,
    workingDir,
    clipId
  );

  console.log(`[Horizontal Face Tracking] Clip ${clipId}: Generated smooth crop path with ${keyframes.length} keyframes.`);

  return {
    hasFaces: true,
    cropFilter,
    sendcmdFilePath,
    keyframes,
    detectedTracksCount: tracks.length,
  };
}

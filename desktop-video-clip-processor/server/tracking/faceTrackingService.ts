/**
 * Face Tracking Analysis Service for Phase 1.
 * Analyzes ONLY the selected clip range using sparse 2 fps sampling.
 * Extracts frames directly in-memory via raw RGB pipe, runs local ONNX face detection,
 * tracks temporal continuity, and generates the camera crop filter expression.
 */

import { spawn } from 'child_process';
import { getFfmpegBinary } from '../resourcePaths';
import { detectFacesInRgbBuffer } from './faceDetector';
import { generateFaceCropFilter, calculateCropDimensions } from './faceTracker';
import { FrameFaceDetection, TrackingCropResult } from '../../src/tracking/faceTypes';
import { OutputAspectRatio } from '../../src/types';

/**
 * Analyzes the selected clip range at ~2 fps, tracks faces, and generates a dynamic crop filter.
 */
export async function analyzeClipFaceFraming(
  sourceVideoPath: string,
  startSec: number,
  durationSec: number,
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: OutputAspectRatio = '9:16'
): Promise<TrackingCropResult> {
  const fps = 2; // Sparse 2 fps sampling as mandated
  const frameWidth = 320;
  const frameHeight = 240;
  const bytesPerFrame = frameWidth * frameHeight * 3;

  const ffmpegBin = getFfmpegBinary();
  const startTime = Date.now();

  const detections: FrameFaceDetection[] = [];

  try {
    const args = [
      '-y',
      '-ss', startSec.toString(),
      '-t', durationSec.toString(),
      '-i', sourceVideoPath,
      '-vf', `fps=${fps},scale=${frameWidth}:${frameHeight}`,
      '-pix_fmt', 'rgb24',
      '-f', 'rawvideo',
      'pipe:1',
    ];

    const child = spawn(ffmpegBin, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    let buffer = Buffer.alloc(0);
    let frameIndex = 0;
    const detectionTasks: Promise<void>[] = [];

    child.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= bytesPerFrame) {
        const frameData = Buffer.from(buffer.subarray(0, bytesPerFrame));
        buffer = buffer.subarray(bytesPerFrame);

        const currentFrameIdx = frameIndex++;
        const timestampSec = Math.round((currentFrameIdx / fps) * 100) / 100;

        detectionTasks.push(
          (async () => {
            try {
              const faces = await detectFacesInRgbBuffer(
                frameData,
                sourceWidth,
                sourceHeight,
                0.65
              );
              detections.push({ timestampSec, faces });
            } catch (err) {
              console.warn(`[FaceTracking] Detection failed on frame ${currentFrameIdx}:`, err);
            }
          })()
        );
      }
    });

    await new Promise<void>((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0 || code === null) resolve();
        else reject(new Error(`FFmpeg frame extraction exited with code ${code}`));
      });
      child.on('error', reject);
    });

    await Promise.all(detectionTasks);

    // Sort detections by timestamp
    detections.sort((a, b) => a.timestampSec - b.timestampSec);

    const result = generateFaceCropFilter(
      detections,
      durationSec,
      sourceWidth,
      sourceHeight,
      aspectRatio
    );

    const elapsed = Date.now() - startTime;
    console.log(
      `[FaceTracking] Analyzed ${detections.length} frames for clip (${startSec}s–${startSec + durationSec}s) in ${elapsed}ms. Face tracked: ${result.hasTrackedFace}`
    );

    return result;
  } catch (err) {
    console.warn('[FaceTracking] Non-fatal analysis error, falling back to static center crop:', err);
    // Graceful fallback to static center crop
    const { cropW, cropH, targetW, targetH } = calculateCropDimensions(
      sourceWidth,
      sourceHeight,
      aspectRatio
    );
    const maxX = Math.max(0, sourceWidth - cropW);
    const maxY = Math.max(0, sourceHeight - cropH);
    const defaultCropX = Math.round(maxX / 2 / 2) * 2;
    const defaultCropY = Math.round(maxY / 2 / 2) * 2;

    return {
      cropW,
      cropH,
      cropFilter: `crop=w=${cropW}:h=${cropH}:x=${defaultCropX}:y=${defaultCropY},scale=${targetW}:${targetH}`,
      hasTrackedFace: false,
    };
  }
}

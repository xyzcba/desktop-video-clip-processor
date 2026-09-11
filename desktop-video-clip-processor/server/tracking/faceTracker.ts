/**
 * Temporal Face Tracker and Camera Crop Path Generator for Phase 1.
 * Maintains continuity of one target face across sampled frames,
 * manages hold & center fallback if occluded, eliminates micro-jitter,
 * and outputs mathematical FFmpeg crop filter expressions.
 */

import { FrameFaceDetection, TrackingCropResult, DetectedFace } from '../../src/tracking/faceTypes';
import { OutputAspectRatio } from '../../src/types';

interface CameraKeyframe {
  t: number;
  x: number;
  y: number;
}

interface CropInterval {
  start: number;
  end: number;
  isTransition: boolean;
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
}

/**
 * Calculates target crop dimensions without stretching the source video.
 */
export function calculateCropDimensions(
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: OutputAspectRatio = '9:16'
): { cropW: number; cropH: number; targetW: number; targetH: number } {
  const sW = Math.max(2, sourceWidth || 1920);
  const sH = Math.max(2, sourceHeight || 1080);

  if (aspectRatio === '16:9') {
    const targetW = sW >= 1920 ? 1920 : sW >= 1280 ? 1280 : Math.round(sW / 2) * 2;
    const targetH = Math.round(((targetW * 9) / 16) / 2) * 2;
    const cropH = Math.min(sH, Math.round(((sW * 9) / 16) / 2) * 2);
    const cropW = Math.min(sW, Math.round(((cropH * 16) / 9) / 2) * 2);
    return { cropW: cropW & ~1, cropH: cropH & ~1, targetW, targetH };
  }

  if (aspectRatio === '1:1') {
    const minDim = Math.min(sW, sH);
    const targetDim = minDim >= 1080 ? 1080 : minDim >= 720 ? 720 : Math.round(minDim / 2) * 2;
    const cropDim = minDim & ~1;
    return { cropW: cropDim, cropH: cropDim, targetW: targetDim, targetH: targetDim };
  }

  if (aspectRatio === 'original') {
    const targetW = Math.round(sW / 2) * 2;
    const targetH = Math.round(sH / 2) * 2;
    return { cropW: targetW, cropH: targetH, targetW, targetH };
  }

  // Default: 9:16 vertical
  const targetH = sH >= 1080 ? 1920 : sH >= 720 ? 1280 : Math.round((sH * 16) / 9 / 2) * 2;
  const targetW = Math.round(((targetH * 9) / 16) / 2) * 2;

  // Real crop from source: height = sH, width = sH * 9 / 16
  const cropH = sH & ~1;
  const rawCropW = Math.round((sH * 9) / 16);
  const cropW = Math.min(sW, rawCropW) & ~1;

  return { cropW, cropH, targetW, targetH };
}

/**
 * Builds the piecewise FFmpeg expression from smooth intervals.
 */
function buildAxisExpression(
  intervals: CropInterval[],
  axis: 'x' | 'y',
  defaultValue: number,
  maxBound: number
): string {
  if (intervals.length === 0 || maxBound <= 0) {
    return defaultValue.toString();
  }

  // Check if axis is completely constant across all intervals
  const isAllConstant = intervals.every(
    (iv) => !iv.isTransition && (axis === 'x' ? iv.xStart : iv.yStart) === defaultValue
  );
  if (isAllConstant) {
    return defaultValue.toString();
  }

  const terms: string[] = [];
  for (const iv of intervals) {
    const t0 = iv.start.toFixed(3);
    const t1 = iv.end.toFixed(3);
    const vStart = axis === 'x' ? iv.xStart : iv.yStart;
    const vEnd = axis === 'x' ? iv.xEnd : iv.yEnd;

    if (iv.isTransition) {
      const dur = Math.max(0.01, iv.end - iv.start);
      const slope = (vEnd - vStart) / dur;
      terms.push(
        `(between(t,${t0},${t1})*(${vStart.toFixed(1)}+${slope.toFixed(2)}*(t-${t0})))`
      );
    } else {
      terms.push(`(between(t,${t0},${t1})*${vStart.toFixed(1)})`);
    }
  }

  // Wrap in min/max bounds and ensure even pixel output
  const rawSum = terms.join('+');
  return `min(${maxBound},max(0,trunc((${rawSum})/2)*2))`;
}

/**
 * Generates camera crop intervals and the FFmpeg filter expression.
 */
export function generateFaceCropFilter(
  detections: FrameFaceDetection[],
  durationSec: number,
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: OutputAspectRatio = '9:16'
): TrackingCropResult {
  const { cropW, cropH, targetW, targetH } = calculateCropDimensions(
    sourceWidth,
    sourceHeight,
    aspectRatio
  );

  if (aspectRatio === 'original') {
    return {
      cropW,
      cropH,
      cropFilter: `scale=${targetW}:${targetH}`,
      hasTrackedFace: false,
    };
  }

  const maxX = Math.max(0, sourceWidth - cropW);
  const maxY = Math.max(0, sourceHeight - cropH);
  const defaultCropX = Math.round(maxX / 2 / 2) * 2;
  const defaultCropY = Math.round(maxY / 2 / 2) * 2;

  // If no detections or no room to crop horizontally or vertically
  if (detections.length === 0 || (maxX === 0 && maxY === 0)) {
    return {
      cropW,
      cropH,
      cropFilter: `crop=w=${cropW}:h=${cropH}:x=${defaultCropX}:y=${defaultCropY},scale=${targetW}:${targetH}`,
      hasTrackedFace: false,
    };
  }

  // Phase 1 Temporal Tracker: Track ONE target face across sampled frames
  let trackedFace: (DetectedFace & { lastSeenT: number }) | null = null;
  let lastValidTargetX = defaultCropX;
  let lastValidTargetY = defaultCropY;
  let everTracked = false;

  const keyframes: CameraKeyframe[] = [];

  for (const frame of detections) {
    const t = Math.max(0, frame.timestampSec);

    if (!trackedFace) {
      if (frame.faces.length > 0) {
        // Pick primary face (highest score biased toward center)
        let bestFace: DetectedFace | null = null;
        let bestScore = -1;
        for (const f of frame.faces) {
          const distFromCenter = Math.abs(f.x - sourceWidth / 2) / (sourceWidth / 2);
          const centralityScore = f.score * (1 - 0.25 * distFromCenter);
          if (centralityScore > bestScore) {
            bestScore = centralityScore;
            bestFace = f;
          }
        }
        if (bestFace) {
          trackedFace = { ...bestFace, lastSeenT: t };
          everTracked = true;
        }
      }
    } else {
      // Find candidate matching current track
      let matchedCandidate: DetectedFace | null = null;
      let minDistance = Infinity;
      const maxDistanceThreshold = 0.38 * sourceWidth;

      for (const cand of frame.faces) {
        const dist = Math.hypot(cand.x - trackedFace.x, cand.y - trackedFace.y);
        if (dist < maxDistanceThreshold && dist < minDistance) {
          minDistance = dist;
          matchedCandidate = cand;
        }
      }

      if (matchedCandidate) {
        // Smooth position update
        trackedFace.x = Math.round(trackedFace.x * 0.35 + matchedCandidate.x * 0.65);
        trackedFace.y = Math.round(trackedFace.y * 0.35 + matchedCandidate.y * 0.65);
        trackedFace.width = matchedCandidate.width;
        trackedFace.height = matchedCandidate.height;
        trackedFace.score = matchedCandidate.score;
        trackedFace.lastSeenT = t;
      } else {
        // Face temporarily disappeared
        const timeSinceLost = t - trackedFace.lastSeenT;
        if (timeSinceLost > 3.5) {
          // Lost for over 3.5 seconds: reset track to allow re-acquisition
          trackedFace = null;
        }
      }
    }

    // Determine camera framing target at timestamp t
    let targetX = defaultCropX;
    let targetY = defaultCropY;

    if (trackedFace) {
      const timeSinceLost = t - trackedFace.lastSeenT;
      if (timeSinceLost <= 1.5) {
        // Hold last known target
        const rawX = trackedFace.x - cropW / 2;
        const rawY = trackedFace.y - cropH / 2;
        targetX = Math.max(0, Math.min(maxX, Math.round(rawX / 2) * 2));
        targetY = Math.max(0, Math.min(maxY, Math.round(rawY / 2) * 2));
        lastValidTargetX = targetX;
        lastValidTargetY = targetY;
      } else {
        // Smoothly fall back toward center (from 1.5s to 3.5s)
        const alpha = Math.min(1, Math.max(0, (timeSinceLost - 1.5) / 2.0));
        targetX = Math.round(((1 - alpha) * lastValidTargetX + alpha * defaultCropX) / 2) * 2;
        targetY = Math.round(((1 - alpha) * lastValidTargetY + alpha * defaultCropY) / 2) * 2;
      }
    } else {
      targetX = defaultCropX;
      targetY = defaultCropY;
    }

    keyframes.push({ t, x: targetX, y: targetY });
  }

  if (keyframes.length === 0 || !everTracked) {
    return {
      cropW,
      cropH,
      cropFilter: `crop=w=${cropW}:h=${cropH}:x=${defaultCropX}:y=${defaultCropY},scale=${targetW}:${targetH}`,
      hasTrackedFace: false,
    };
  }

  // Motion Deadband & Transition Smoothing
  // Filter out micro-jitter (< 16px deadband) and create 0.1s linear transitions for movement
  const deadbandPx = 16;
  const transitionDuration = 0.1; // 0.1s short transition as requested
  const snapThreshold = 0.42 * sourceWidth; // Large movements snap

  const intervals: CropInterval[] = [];
  let currentSteadyX = keyframes[0].x;
  let currentSteadyY = keyframes[0].y;
  let intervalStartT = 0;

  for (let i = 1; i < keyframes.length; i++) {
    const kf = keyframes[i];
    const dx = Math.abs(kf.x - currentSteadyX);
    const dy = Math.abs(kf.y - currentSteadyY);

    if (dx > deadbandPx || dy > deadbandPx) {
      // Movement detected: close current steady interval up to transition start
      const moveT = kf.t;
      if (moveT > intervalStartT) {
        intervals.push({
          start: intervalStartT,
          end: moveT,
          isTransition: false,
          xStart: currentSteadyX,
          xEnd: currentSteadyX,
          yStart: currentSteadyY,
          yEnd: currentSteadyY,
        });
      }

      // Check if snap or smooth transition
      const isSnap = dx > snapThreshold || dy > snapThreshold;
      const transEndT = isSnap ? moveT : Math.min(durationSec, moveT + transitionDuration);

      if (!isSnap && transEndT > moveT) {
        intervals.push({
          start: moveT,
          end: transEndT,
          isTransition: true,
          xStart: currentSteadyX,
          xEnd: kf.x,
          yStart: currentSteadyY,
          yEnd: kf.y,
        });
      }

      currentSteadyX = kf.x;
      currentSteadyY = kf.y;
      intervalStartT = transEndT;
    }
  }

  // Close final interval to clip end
  if (intervalStartT < durationSec) {
    intervals.push({
      start: intervalStartT,
      end: durationSec + 0.5, // Ensure coverage through the end
      isTransition: false,
      xStart: currentSteadyX,
      xEnd: currentSteadyX,
      yStart: currentSteadyY,
      yEnd: currentSteadyY,
    });
  }

  const xExpr = buildAxisExpression(intervals, 'x', defaultCropX, maxX);
  const yExpr = buildAxisExpression(intervals, 'y', defaultCropY, maxY);

  const cropFilter = `crop=w=${cropW}:h=${cropH}:x='${xExpr}':y='${yExpr}',scale=${targetW}:${targetH}`;

  return {
    cropW,
    cropH,
    cropFilter,
    hasTrackedFace: true,
  };
}

import path from 'path';
import fs from 'fs';
import { TargetSpeakerTrajectoryPoint } from './speakerSelector';
import { CropKeyframe } from './trackingTypes';
import { OutputAspectRatio } from '../../src/caption/captionTypes';

// ============================================================================
// DYNAMIC FACE TRACKING CONFIGURATION (2D PAN/TILT + FIXED MODERATE ZOOM)
// ============================================================================
/**
 * Fixed moderate zoom factor for Dynamic Face Tracking.
 * Keeps the speaker's face/head naturally in focus without extreme close-up.
 * Crop width and height remain CONSTANT throughout the clip to avoid FFmpeg
 * filtergraph re-initialization bottlenecks.
 */
export const DYNAMIC_BASE_ZOOM = 1.25;

/**
 * Sampling rate for dynamic camera path keyframes emitted to FFmpeg sendcmd (30 FPS).
 * Produces frame-by-frame liquid smooth 2D tracking without altering video FPS.
 */
export const DYNAMIC_CAMERA_PATH_FPS = 30;

/**
 * Smoothing factor for 2D face targets (EMA alpha).
 * Provides responsive, natural head-follow feeling attached to the speaker.
 */
export const DYNAMIC_TARGET_EMA_ALPHA = 0.34;

/**
 * Maximum 2D camera velocity in pixels per second.
 */
export const DYNAMIC_MAX_VELOCITY_PX_PER_SEC = 700;

/**
 * Maximum 2D camera acceleration in pixels per second squared.
 */
export const DYNAMIC_MAX_ACCELERATION_PX_PER_SEC2 = 1600;

/**
 * Maximum 2D camera deceleration in pixels per second squared for smooth settling.
 */
export const DYNAMIC_MAX_DECELERATION_PX_PER_SEC2 = 1750;

/**
 * Large movement threshold ratio relative to the fixed crop dimension.
 * Movements exceeding this threshold (e.g. speaker switch across the room) snap immediately.
 */
export const DYNAMIC_SNAP_DISTANCE_RATIO = 0.55;

/**
 * Deadband threshold in pixels to filter out micro-jitter while preserving natural head motion.
 */
export const DYNAMIC_DEADBAND_PIXELS = 18;

export interface DynamicCameraMotionOptions {
  cameraPathFps?: number;
  emaAlpha?: number;
  maxVelocityPxPerSec?: number;
  maxAccelerationPxPerSec2?: number;
  maxDecelerationPxPerSec2?: number;
  snapDistanceRatio?: number;
  deadbandPixels?: number;
  zoom?: number;
}

/**
 * Calculates FIXED crop dimensions matching the target aspect ratio at a fixed moderate zoom.
 * Preserves exact aspect ratio to ensure zero stretching and zero distortion when scaled.
 * The dimensions remain constant for the entire clip.
 */
export function calculateFixedDynamicCropDimensions(
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: OutputAspectRatio = '9:16',
  zoom: number = DYNAMIC_BASE_ZOOM
): { cropWidth: number; cropHeight: number } {
  const sW = Math.max(2, sourceWidth || 1920);
  const sH = Math.max(2, sourceHeight || 1080);
  const clampedZoom = Math.max(1.0, zoom || DYNAMIC_BASE_ZOOM);

  // Helper to ensure crop dimensions are valid, even, and <= source dimensions
  const clampDim = (dim: number, maxDim: number) => {
    const minSafe = Math.min(maxDim, 120);
    const clamped = Math.min(maxDim, Math.max(minSafe, dim));
    return Math.min(maxDim, Math.max(2, Math.floor(clamped / 2) * 2));
  };

  if (aspectRatio === '16:9') {
    // 16:9 aspect ratio
    let cropWidth = Math.min(sW, Math.round((sW / clampedZoom) / 2) * 2);
    let cropHeight = Math.round((cropWidth * 9 / 16) / 2) * 2;
    if (cropHeight > sH) {
      cropHeight = Math.floor(sH / 2) * 2;
      cropWidth = Math.round((cropHeight * 16 / 9) / 2) * 2;
    }
    return {
      cropWidth: clampDim(cropWidth, sW),
      cropHeight: clampDim(cropHeight, sH),
    };
  }

  if (aspectRatio === '1:1') {
    // 1:1 square
    const minDim = Math.min(sW, sH);
    const cropDim = Math.round((minDim / clampedZoom) / 2) * 2;
    const safeCropDim = clampDim(cropDim, minDim);
    return { cropWidth: safeCropDim, cropHeight: safeCropDim };
  }

  if (aspectRatio === 'original') {
    // Original aspect ratio
    const cropWidth = Math.round((sW / clampedZoom) / 2) * 2;
    const cropHeight = Math.round((sH / clampedZoom) / 2) * 2;
    return {
      cropWidth: clampDim(cropWidth, sW),
      cropHeight: clampDim(cropHeight, sH),
    };
  }

  // Default: 9:16 vertical crop
  let cropHeight = Math.min(sH, Math.round((sH / clampedZoom) / 2) * 2);
  let cropWidth = Math.round((cropHeight * 9 / 16) / 2) * 2;
  if (cropWidth > sW) {
    cropWidth = Math.floor(sW / 2) * 2;
    cropHeight = Math.round((cropWidth * 16 / 9) / 2) * 2;
  }
  return {
    cropWidth: clampDim(cropWidth, sW),
    cropHeight: clampDim(cropHeight, sH),
  };
}

/**
 * Defensive boundary clamping for Dynamic Face Tracking camera coordinates.
 * Strictly guarantees that:
 * 1. X >= 0
 * 2. X <= sourceWidth - cropWidth
 * 3. Y >= 0
 * 4. Y <= sourceHeight - cropHeight
 *
 * Never allows the crop rectangle to extend past left, right, top, or bottom edges.
 * Prevents invalid negative bounds and maintains safe even-pixel alignment.
 */
export function clampFinalCropCoordinate(
  calculatedCoord: number,
  sourceDimension: number,
  cropDimension: number
): number {
  const maxBound = Math.max(0, sourceDimension - cropDimension);
  if (maxBound <= 0 || !Number.isFinite(calculatedCoord)) {
    return 0;
  }

  // Align to even pixel boundary for standard video codecs
  const evenVal = Math.round(calculatedCoord / 2) * 2;

  // Never allow crop rectangle to extend past right or bottom edges
  if (evenVal > maxBound) {
    return Math.max(0, Math.floor(maxBound / 2) * 2);
  }

  // Never allow crop rectangle to extend past left or top edges
  return Math.max(0, evenVal);
}

/**
 * Backward-compatible alias for calculateFixedDynamicCropDimensions
 */
export const calculateZoomedCropDimensions = calculateFixedDynamicCropDimensions;

/**
 * Generates dynamic 2D (horizontal + vertical) crop keyframes with fixed moderate face zoom.
 * - Uses a CONSTANT cropWidth and cropHeight for the entire clip (no runtime w/h reconfiguration)
 * - Tracks the speaker's head movement both horizontally (left/right) and vertically (up/down)
 * - Emits ONLY runtime 'crop x' and 'crop y' commands in the sendcmd timeline
 * - Smooth camera following for normal/moderate movement via 2D position + velocity dynamics
 * - Distance-based snapping for large repositioning / established speaker transitions
 * - Bounded strictly inside source video dimensions with mathematical precision
 */
export function generateDynamicSmoothCropPath(
  trajectory: TargetSpeakerTrajectoryPoint[],
  sourceWidth: number,
  sourceHeight: number,
  clipDurationSec: number,
  aspectRatio: OutputAspectRatio,
  workingDir: string,
  clipId: string | number,
  options?: DynamicCameraMotionOptions
): { keyframes: CropKeyframe[]; sendcmdFilePath: string; cropFilter: string } {
  const zoom = options?.zoom ?? DYNAMIC_BASE_ZOOM;

  // 1. Calculate ONE FIXED crop width and height for the entire clip
  const rawDims = calculateFixedDynamicCropDimensions(
    sourceWidth,
    sourceHeight,
    aspectRatio,
    zoom
  );

  // Defensive check: safely constrain crop dimensions if >= source dimensions
  // so valid ranges exist without negative bounds.
  let cropWidth = rawDims.cropWidth;
  let cropHeight = rawDims.cropHeight;

  if (cropWidth > sourceWidth) {
    cropWidth = Math.max(2, Math.floor(sourceWidth / 2) * 2);
  }
  if (cropHeight > sourceHeight) {
    cropHeight = Math.max(2, Math.floor(sourceHeight / 2) * 2);
  }

  const maxX = Math.max(0, sourceWidth - cropWidth);
  const maxY = Math.max(0, sourceHeight - cropHeight);

  // Fallback: If no trajectory points detected, center safely with the fixed zoom
  if (trajectory.length === 0) {
    const defaultX = clampFinalCropCoordinate(maxX / 2, sourceWidth, cropWidth);
    const defaultY = clampFinalCropCoordinate(maxY / 2, sourceHeight, cropHeight);
    return {
      keyframes: [{ timestamp: 0, x: defaultX, y: defaultY, width: cropWidth, height: cropHeight }],
      sendcmdFilePath: '',
      cropFilter: `crop=w=${cropWidth}:h=${cropHeight}:x=${defaultX}:y=${defaultY}`,
    };
  }

  // 2. Calculate raw target X and Y for each trajectory waypoint
  const rawWaypoints = trajectory
    .map((pt) => {
      const facePxX = pt.faceCenter.x * sourceWidth;
      const facePxY = pt.faceCenter.y * sourceHeight;

      // Positioning: face centered horizontally, natural ~38% headroom vertically
      const idealX = facePxX - cropWidth * 0.5;
      const idealY = facePxY - cropHeight * 0.38;

      const clampedX = clampFinalCropCoordinate(idealX, sourceWidth, cropWidth);
      const clampedY = clampFinalCropCoordinate(idealY, sourceHeight, cropHeight);

      return {
        timestamp: pt.timestamp,
        trackId: pt.trackId,
        targetX: clampedX,
        targetY: clampedY,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  // Resolve kinematic tuning options
  const fps = options?.cameraPathFps ?? DYNAMIC_CAMERA_PATH_FPS;
  const baseEmaAlpha = options?.emaAlpha ?? DYNAMIC_TARGET_EMA_ALPHA;
  const maxVelocity = options?.maxVelocityPxPerSec ?? DYNAMIC_MAX_VELOCITY_PX_PER_SEC;
  const maxAccel = options?.maxAccelerationPxPerSec2 ?? DYNAMIC_MAX_ACCELERATION_PX_PER_SEC2;
  const maxDecel = options?.maxDecelerationPxPerSec2 ?? DYNAMIC_MAX_DECELERATION_PX_PER_SEC2;
  const snapRatio = options?.snapDistanceRatio ?? DYNAMIC_SNAP_DISTANCE_RATIO;
  const baseDeadband = options?.deadbandPixels ?? DYNAMIC_DEADBAND_PIXELS;

  const dt = 1.0 / fps;
  const effectiveEmaAlpha = 1 - Math.pow(1 - Math.min(0.99, Math.max(0.01, baseEmaAlpha)), dt / 0.1);
  const totalFrames = Math.ceil(clipDurationSec * fps);
  const keyframes: CropKeyframe[] = [];

  // Fixed reference dimension for snap and deadband thresholds
  const refDim = Math.min(cropWidth, cropHeight);
  const largeMovementThreshold = Math.round(refDim * snapRatio);
  const deadband = Math.max(baseDeadband, Math.round(refDim * 0.035));

  // Initial continuous camera state
  let currentCameraX = rawWaypoints[0].targetX;
  let currentCameraY = rawWaypoints[0].targetY;
  let currentVx = 0;
  let currentVy = 0;

  let smoothedTargetX = currentCameraX;
  let smoothedTargetY = currentCameraY;
  let activeRawTargetX = currentCameraX;
  let activeRawTargetY = currentCameraY;

  let wpIdx = 0;

  for (let f = 0; f <= totalFrames; f++) {
    const t = Math.round(f * dt * 1000) / 1000;

    // Check newly arrived trajectory waypoints up to time t
    while (wpIdx + 1 < rawWaypoints.length && rawWaypoints[wpIdx + 1].timestamp <= t) {
      wpIdx++;
      const nextWp = rawWaypoints[wpIdx];
      const candX = nextWp.targetX;
      const candY = nextWp.targetY;

      // 2D distance from camera's actual continuous position
      const distFromCamera = Math.hypot(candX - currentCameraX, candY - currentCameraY);

      if (distFromCamera >= largeMovementThreshold) {
        // LARGE MOVEMENT / WIDE SPEAKER SWITCH: Snap immediately!
        currentCameraX = candX;
        currentCameraY = candY;
        smoothedTargetX = candX;
        smoothedTargetY = candY;
        activeRawTargetX = candX;
        activeRawTargetY = candY;
        currentVx = 0;
        currentVy = 0;
      } else {
        // SMALL/MODERATE MOVEMENT: Deadband check against active target
        const distFromActive = Math.hypot(candX - activeRawTargetX, candY - activeRawTargetY);
        if (distFromActive > deadband) {
          activeRawTargetX = candX;
          activeRawTargetY = candY;
        }
      }
    }

    // Advance 2D kinematic dynamics (for f > 0)
    if (f > 0) {
      // 1. Advance EMA smoothed target in both X and Y
      smoothedTargetX += (activeRawTargetX - smoothedTargetX) * effectiveEmaAlpha;
      smoothedTargetY += (activeRawTargetY - smoothedTargetY) * effectiveEmaAlpha;

      // 2. Vector from current camera position to smoothed target
      const dx = smoothedTargetX - currentCameraX;
      const dy = smoothedTargetY - currentCameraY;
      const distToTarget = Math.hypot(dx, dy);

      if (distToTarget <= 0.25 && Math.hypot(currentVx, currentVy) <= 1.0) {
        // Settle smoothly to prevent micro-oscillation
        currentCameraX = smoothedTargetX;
        currentCameraY = smoothedTargetY;
        currentVx = 0;
        currentVy = 0;
      } else {
        // Kinematic braking curve: v_stop = sqrt(2 * a_dec * distance)
        const linearZonePx = 10.0;
        let approachSpeed: number;
        if (distToTarget <= linearZonePx) {
          const slope = Math.sqrt((2 * maxDecel) / linearZonePx);
          approachSpeed = distToTarget * slope;
        } else {
          approachSpeed = Math.sqrt(2 * maxDecel * distToTarget);
        }

        const desiredSpeed = Math.min(maxVelocity, approachSpeed);
        const dirX = dx / distToTarget;
        const dirY = dy / distToTarget;

        const desiredVx = dirX * desiredSpeed;
        const desiredVy = dirY * desiredSpeed;

        const deltaVx = desiredVx - currentVx;
        const deltaVy = desiredVy - currentVy;
        const deltaV = Math.hypot(deltaVx, deltaVy);

        if (deltaV > 0) {
          const isAccelerating = (currentVx * deltaVx + currentVy * deltaVy) >= 0;
          const accelLimit = isAccelerating ? maxAccel : maxDecel;
          const maxDeltaV = accelLimit * dt;

          if (deltaV <= maxDeltaV) {
            currentVx = desiredVx;
            currentVy = desiredVy;
          } else {
            const ratio = maxDeltaV / deltaV;
            currentVx += deltaVx * ratio;
            currentVy += deltaVy * ratio;
          }
        }

        // Integrate 2D position
        currentCameraX += currentVx * dt;
        currentCameraY += currentVy * dt;

        // Clean clamp if stepping past target at low velocity
        const newDx = smoothedTargetX - currentCameraX;
        const newDy = smoothedTargetY - currentCameraY;
        if (dx * newDx + dy * newDy < 0 && Math.hypot(currentVx, currentVy) < 25) {
          currentCameraX = smoothedTargetX;
          currentCameraY = smoothedTargetY;
          currentVx = 0;
          currentVy = 0;
        }
      }
    }

    // Defensive boundary clamping applied to the FINAL crop coordinates
    // regardless of whether position came from normal interpolation, EMA smoothing,
    // velocity limiting, acceleration/deceleration, snap movement, speaker switching,
    // face-loss fallback, or vertical tracking.
    const finalX = clampFinalCropCoordinate(currentCameraX, sourceWidth, cropWidth);
    const finalY = clampFinalCropCoordinate(currentCameraY, sourceHeight, cropHeight);

    keyframes.push({
      timestamp: t,
      x: finalX,
      y: finalY,
      width: cropWidth,
      height: cropHeight,
    });
  }

  // 3. Write FFmpeg sendcmd timeline script with ONLY runtime X and Y commands
  // Omitting redundant duplicate commands when camera is stationary avoids unnecessary FFmpeg filter dispatch
  let cmdText = '';
  let lastEmittedX = -1;
  let lastEmittedY = -1;

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    // Final defensive boundary clamping before emitting to sendcmd
    const emitX = clampFinalCropCoordinate(kf.x, sourceWidth, cropWidth);
    const emitY = clampFinalCropCoordinate(kf.y, sourceHeight, cropHeight);

    // Always emit the first frame, last frame, or whenever position changes
    if (i === 0 || i === keyframes.length - 1 || emitX !== lastEmittedX || emitY !== lastEmittedY) {
      const timeStr = kf.timestamp.toFixed(3);
      cmdText += `${timeStr} [enter] crop x ${emitX};\n`;
      cmdText += `${timeStr} [enter] crop y ${emitY};\n`;
      lastEmittedX = emitX;
      lastEmittedY = emitY;
    }
  }

  const sendcmdDir = path.join(workingDir, 'dynamic_tracking_cmds');
  if (!fs.existsSync(sendcmdDir)) {
    fs.mkdirSync(sendcmdDir, { recursive: true });
  }

  const sendcmdFilePath = path.join(sendcmdDir, `sendcmd_dynamic_clip_${clipId}.txt`);
  fs.writeFileSync(sendcmdFilePath, cmdText, 'utf-8');

  // Escape sendcmd path for safe FFmpeg filter graph
  const escapedCmdPath = sendcmdFilePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const initialX = clampFinalCropCoordinate(keyframes[0]?.x ?? 0, sourceWidth, cropWidth);
  const initialY = clampFinalCropCoordinate(keyframes[0]?.y ?? 0, sourceHeight, cropHeight);

  // FFmpeg crop filter initialized with constant crop dimensions and initial position
  const cropFilter = `sendcmd=f='${escapedCmdPath}',crop=w=${cropWidth}:h=${cropHeight}:x=${initialX}:y=${initialY}`;

  return {
    keyframes,
    sendcmdFilePath,
    cropFilter,
  };
}

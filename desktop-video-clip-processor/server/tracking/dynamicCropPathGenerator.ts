import path from 'path';
import fs from 'fs';
import { TargetSpeakerTrajectoryPoint } from './speakerSelector';
import { CropKeyframe } from './trackingTypes';
import { OutputAspectRatio } from '../../src/caption/captionTypes';

// ============================================================================
// DYNAMIC FACE TRACKING CONFIGURATION (2D PAN/TILT + NATURAL MODERATE ZOOM)
// ============================================================================
/**
 * Sampling rate for dynamic camera path keyframes emitted to FFmpeg sendcmd (30 FPS).
 * Produces frame-by-frame liquid smooth 2D tracking and zoom without altering video FPS.
 */
export const DYNAMIC_CAMERA_PATH_FPS = 30;

/**
 * Smoothing factor for 2D face targets (EMA alpha).
 * Provides responsive, natural head-follow feeling attached to the speaker.
 */
export const DYNAMIC_TARGET_EMA_ALPHA = 0.28;

/**
 * Maximum 2D camera velocity in pixels per second.
 */
export const DYNAMIC_MAX_VELOCITY_PX_PER_SEC = 600;

/**
 * Maximum 2D camera acceleration in pixels per second squared.
 */
export const DYNAMIC_MAX_ACCELERATION_PX_PER_SEC2 = 1300;

/**
 * Maximum 2D camera deceleration in pixels per second squared for smooth settling.
 */
export const DYNAMIC_MAX_DECELERATION_PX_PER_SEC2 = 1500;

/**
 * Large movement threshold ratio relative to reference crop dimension.
 * Movements exceeding this threshold (e.g. speaker switch across the room) snap immediately.
 */
export const DYNAMIC_SNAP_DISTANCE_RATIO = 0.55;

/**
 * Deadband threshold in pixels to filter out micro-jitter while preserving natural head motion.
 */
export const DYNAMIC_DEADBAND_PIXELS = 18;

/**
 * Default moderate zoom factor. Keeps speaker's face naturally focused without extreme close-up.
 */
export const DYNAMIC_BASE_ZOOM = 1.25;

/**
 * Zoom bounds: guaranteed moderate creator framing (never extreme close-up, never zoom out past 1.0).
 */
export const DYNAMIC_MIN_ZOOM = 1.15;
export const DYNAMIC_MAX_ZOOM = 1.35;

export interface DynamicCameraMotionOptions {
  cameraPathFps?: number;
  emaAlpha?: number;
  maxVelocityPxPerSec?: number;
  maxAccelerationPxPerSec2?: number;
  maxDecelerationPxPerSec2?: number;
  snapDistanceRatio?: number;
  deadbandPixels?: number;
  baseZoom?: number;
}

/**
 * Calculates crop dimensions matching the target aspect ratio at a specified zoom scale.
 * Preserves exact aspect ratio to ensure zero stretching and zero distortion when scaled.
 */
export function calculateZoomedCropDimensions(
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: OutputAspectRatio = '9:16',
  zoom: number = DYNAMIC_BASE_ZOOM
): { cropWidth: number; cropHeight: number } {
  const sW = Math.max(2, sourceWidth || 1920);
  const sH = Math.max(2, sourceHeight || 1080);
  const clampedZoom = Math.max(DYNAMIC_MIN_ZOOM, Math.min(DYNAMIC_MAX_ZOOM, zoom));

  if (aspectRatio === '16:9') {
    // 16:9 aspect ratio
    let cropWidth = Math.min(sW, Math.round((sW / clampedZoom) / 2) * 2);
    let cropHeight = Math.round((cropWidth * 9 / 16) / 2) * 2;
    if (cropHeight > sH) {
      cropHeight = Math.floor(sH / 2) * 2;
      cropWidth = Math.round((cropHeight * 16 / 9) / 2) * 2;
    }
    return {
      cropWidth: Math.max(120, Math.min(sW, cropWidth)),
      cropHeight: Math.max(120, Math.min(sH, cropHeight)),
    };
  }

  if (aspectRatio === '1:1') {
    // 1:1 square
    const minDim = Math.min(sW, sH);
    const cropDim = Math.max(120, Math.min(minDim, Math.round((minDim / clampedZoom) / 2) * 2));
    return { cropWidth: cropDim, cropHeight: cropDim };
  }

  if (aspectRatio === 'original') {
    // Original aspect ratio
    const cropWidth = Math.max(120, Math.min(sW, Math.round((sW / clampedZoom) / 2) * 2));
    const cropHeight = Math.max(120, Math.min(sH, Math.round((sH / clampedZoom) / 2) * 2));
    return { cropWidth, cropHeight };
  }

  // Default: 9:16 vertical crop
  let cropHeight = Math.min(sH, Math.round((sH / clampedZoom) / 2) * 2);
  let cropWidth = Math.round((cropHeight * 9 / 16) / 2) * 2;
  if (cropWidth > sW) {
    cropWidth = Math.floor(sW / 2) * 2;
    cropHeight = Math.round((cropWidth * 16 / 9) / 2) * 2;
  }
  return {
    cropWidth: Math.max(120, Math.min(sW, cropWidth)),
    cropHeight: Math.max(120, Math.min(sH, cropHeight)),
  };
}

/**
 * Estimates a stable, natural zoom factor for a given face size.
 * Targets ~26-29% face height in vertical frame, bounded strictly between 1.15 and 1.35.
 */
function estimateNaturalZoom(faceNormalizedHeight?: number): number {
  if (!faceNormalizedHeight || faceNormalizedHeight <= 0) {
    return DYNAMIC_BASE_ZOOM;
  }
  const desiredRatio = 0.27;
  const estimatedZoom = desiredRatio / Math.max(0.18, faceNormalizedHeight);
  return Math.max(DYNAMIC_MIN_ZOOM, Math.min(DYNAMIC_MAX_ZOOM, Math.round(estimatedZoom * 100) / 100));
}

/**
 * Generates dynamic 2D (horizontal + vertical) crop keyframes with moderate, natural face zoom.
 * - Continuous 2D position + velocity state integration with kinematic acceleration and braking
 * - Tracks the speaker's head movement both horizontally (left/right) and vertically (up/down)
 * - Moderate face-focused zoom remains stable and natural without dizzying in/out fluctuations
 * - Distance-based large-movement snapping preserves instant cuts on wide speaker transitions
 * - Mathematical bounds guarantee crops never exceed source boundaries or distort
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
  // If no trajectory points detected, fallback safely to center with standard moderate zoom
  if (trajectory.length === 0) {
    const { cropWidth, cropHeight } = calculateZoomedCropDimensions(
      sourceWidth,
      sourceHeight,
      aspectRatio,
      DYNAMIC_BASE_ZOOM
    );
    const defaultX = Math.round(Math.max(0, sourceWidth - cropWidth) / 4) * 2;
    const defaultY = Math.round(Math.max(0, sourceHeight - cropHeight) / 4) * 2;
    return {
      keyframes: [{ timestamp: 0, x: defaultX, y: defaultY, width: cropWidth, height: cropHeight }],
      sendcmdFilePath: '',
      cropFilter: `crop=w=${cropWidth}:h=${cropHeight}:x=${defaultX}:y=${defaultY}`,
    };
  }

  // Precalculate stable zoom per track to prevent distracting zoom breathing
  const trackZoomMap = new Map<number, number>();
  for (const pt of trajectory) {
    if (!trackZoomMap.has(pt.trackId)) {
      const zoom = estimateNaturalZoom(pt.faceSize?.height);
      trackZoomMap.set(pt.trackId, zoom);
    }
  }

  // 1. Calculate raw target boxes for each trajectory waypoint
  const rawWaypoints = trajectory
    .map((pt) => {
      const trackZoom = trackZoomMap.get(pt.trackId) ?? DYNAMIC_BASE_ZOOM;
      const { cropWidth, cropHeight } = calculateZoomedCropDimensions(
        sourceWidth,
        sourceHeight,
        aspectRatio,
        trackZoom
      );

      const maxX = Math.max(0, sourceWidth - cropWidth);
      const maxY = Math.max(0, sourceHeight - cropHeight);

      const facePxX = pt.faceCenter.x * sourceWidth;
      const facePxY = pt.faceCenter.y * sourceHeight;

      // Positioning: face centered horizontally, natural ~38% headroom vertically
      const idealX = facePxX - cropWidth * 0.5;
      const idealY = facePxY - cropHeight * 0.38;

      const clampedX = Math.max(0, Math.min(maxX, Math.round(idealX / 2) * 2));
      const clampedY = Math.max(0, Math.min(maxY, Math.round(idealY / 2) * 2));

      return {
        timestamp: pt.timestamp,
        trackId: pt.trackId,
        targetX: clampedX,
        targetY: clampedY,
        cropW: cropWidth,
        cropH: cropHeight,
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

  // Initial state from first waypoint
  let currentCameraX = rawWaypoints[0].targetX;
  let currentCameraY = rawWaypoints[0].targetY;
  let currentCropW = rawWaypoints[0].cropW;
  let currentCropH = rawWaypoints[0].cropH;
  let currentVx = 0;
  let currentVy = 0;

  let smoothedTargetX = currentCameraX;
  let smoothedTargetY = currentCameraY;
  let activeRawTargetX = currentCameraX;
  let activeRawTargetY = currentCameraY;
  let activeRawCropW = currentCropW;
  let activeRawCropH = currentCropH;

  let wpIdx = 0;

  for (let f = 0; f <= totalFrames; f++) {
    const t = Math.round(f * dt * 1000) / 1000;

    // Check newly arrived trajectory waypoints up to time t
    while (wpIdx + 1 < rawWaypoints.length && rawWaypoints[wpIdx + 1].timestamp <= t) {
      wpIdx++;
      const nextWp = rawWaypoints[wpIdx];
      const candX = nextWp.targetX;
      const candY = nextWp.targetY;
      const candW = nextWp.cropW;
      const candH = nextWp.cropH;

      const refDim = Math.min(currentCropW, currentCropH);
      const largeMovementThreshold = Math.round(refDim * snapRatio);
      const deadband = Math.max(baseDeadband, Math.round(refDim * 0.035));

      // 2D distance from camera's actual continuous position
      const distFromCamera = Math.hypot(candX - currentCameraX, candY - currentCameraY);

      if (distFromCamera >= largeMovementThreshold) {
        // LARGE MOVEMENT / WIDE SPEAKER SWITCH: Snap immediately!
        currentCameraX = candX;
        currentCameraY = candY;
        currentCropW = candW;
        currentCropH = candH;
        smoothedTargetX = candX;
        smoothedTargetY = candY;
        activeRawTargetX = candX;
        activeRawTargetY = candY;
        activeRawCropW = candW;
        activeRawCropH = candH;
        currentVx = 0;
        currentVy = 0;
      } else {
        // SMALL/MODERATE MOVEMENT: Deadband check against active target
        const distFromActive = Math.hypot(candX - activeRawTargetX, candY - activeRawTargetY);
        if (distFromActive > deadband) {
          activeRawTargetX = candX;
          activeRawTargetY = candY;
          activeRawCropW = candW;
          activeRawCropH = candH;
        }
      }
    }

    // Advance 2D kinematic dynamics (for f > 0)
    if (f > 0) {
      // 1. Advance EMA smoothed target in both horizontal and vertical axes
      smoothedTargetX += (activeRawTargetX - smoothedTargetX) * effectiveEmaAlpha;
      smoothedTargetY += (activeRawTargetY - smoothedTargetY) * effectiveEmaAlpha;

      // Smoothly transition crop dimensions (gentle zoom transition between speakers)
      currentCropW += (activeRawCropW - currentCropW) * Math.min(1.0, effectiveEmaAlpha * 0.4);
      currentCropH += (activeRawCropH - currentCropH) * Math.min(1.0, effectiveEmaAlpha * 0.4);

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

    // Align crop dimensions to even numbers and clamp inside frame
    const finalW = Math.max(120, Math.min(sourceWidth, Math.round(currentCropW / 2) * 2));
    const finalH = Math.max(120, Math.min(sourceHeight, Math.round(currentCropH / 2) * 2));

    const maxX = Math.max(0, sourceWidth - finalW);
    const maxY = Math.max(0, sourceHeight - finalH);

    const finalX = Math.max(0, Math.min(maxX, Math.round(currentCameraX / 2) * 2));
    const finalY = Math.max(0, Math.min(maxY, Math.round(currentCameraY / 2) * 2));

    keyframes.push({
      timestamp: t,
      x: finalX,
      y: finalY,
      width: finalW,
      height: finalH,
    });
  }

  // 2. Write FFmpeg sendcmd timeline command script
  let cmdText = '';
  for (const kf of keyframes) {
    const timeStr = kf.timestamp.toFixed(3);
    cmdText += `${timeStr} [enter] crop x ${kf.x};\n`;
    cmdText += `${timeStr} [enter] crop y ${kf.y};\n`;
    cmdText += `${timeStr} [enter] crop w ${kf.width};\n`;
    cmdText += `${timeStr} [enter] crop h ${kf.height};\n`;
  }

  const sendcmdDir = path.join(workingDir, 'dynamic_tracking_cmds');
  if (!fs.existsSync(sendcmdDir)) {
    fs.mkdirSync(sendcmdDir, { recursive: true });
  }

  const sendcmdFilePath = path.join(sendcmdDir, `sendcmd_dynamic_clip_${clipId}.txt`);
  fs.writeFileSync(sendcmdFilePath, cmdText, 'utf-8');

  // Escape sendcmd path for safe FFmpeg filter graph
  const escapedCmdPath = sendcmdFilePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const initialX = keyframes[0].x;
  const initialY = keyframes[0].y;
  const initialW = keyframes[0].width;
  const initialH = keyframes[0].height;

  const cropFilter = `sendcmd=f='${escapedCmdPath}',crop=w=${initialW}:h=${initialH}:x=${initialX}:y=${initialY}`;

  return {
    keyframes,
    sendcmdFilePath,
    cropFilter,
  };
}

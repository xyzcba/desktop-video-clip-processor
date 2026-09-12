import path from 'path';
import fs from 'fs';
import { TargetSpeakerTrajectoryPoint } from './speakerSelector';
import { CropKeyframe } from './trackingTypes';
import { OutputAspectRatio } from '../../src/caption/captionTypes';

// ============================================================================
// CAMERA MOVEMENT & SMOOTHING CONFIGURATION (EMA + VELOCITY LIMIT MODEL)
// ============================================================================
/**
 * Sampling rate for crop keyframes emitted to FFmpeg sendcmd (keyframes per second).
 */
export const INTERPOLATION_FPS = 10;

/**
 * Smoothing factor for raw face targets (0 < alpha <= 1).
 * Evaluated at each INTERPOLATION_FPS timestep (dt = 0.1s).
 * - Lower values (e.g. 0.15 - 0.25) create softer, more damped following.
 * - Higher values (e.g. 0.30 - 0.45) increase responsiveness.
 */
export const TARGET_EMA_ALPHA = 0.30;

/**
 * Maximum camera movement speed in pixels per second.
 * Constrains camera pan speed so small/moderate movements never whip dizzyingly.
 */
export const MAX_VELOCITY_PX_PER_SEC = 500;

/**
 * Large movement threshold as a ratio of the reference crop dimension.
 * When a target jumps further than (refDimension * SNAP_DISTANCE_RATIO) pixels,
 * the camera immediately snaps to the new position instead of slowly traversing.
 */
export const SNAP_DISTANCE_RATIO = 0.66;

/**
 * Deadband threshold in pixels to filter out detection micro-jitter.
 * Target adjustments below this distance are ignored so the camera remains stable.
 */
export const DEADBAND_PIXELS = 24;

export interface CameraMotionOptions {
  emaAlpha?: number;
  maxVelocityPxPerSec?: number;
  snapDistanceRatio?: number;
  deadbandPixels?: number;
}

/**
 * Calculates base crop window dimensions for the source resolution and aspect ratio
 */
export function calculateCropDimensions(
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: OutputAspectRatio = '9:16'
): { cropWidth: number; cropHeight: number } {
  const sW = Math.max(2, sourceWidth || 1920);
  const sH = Math.max(2, sourceHeight || 1080);

  if (aspectRatio === '16:9') {
    const cropWidth = Math.min(sW, Math.round(sH * 16 / 9 / 2) * 2);
    const cropHeight = Math.round(cropWidth * 9 / 16 / 2) * 2;
    return { cropWidth, cropHeight };
  }

  if (aspectRatio === '1:1') {
    const minDim = Math.min(sW, sH);
    const cropDim = Math.round(minDim / 2) * 2;
    return { cropWidth: cropDim, cropHeight: cropDim };
  }

  if (aspectRatio === 'original') {
    return { cropWidth: Math.round(sW / 2) * 2, cropHeight: Math.round(sH / 2) * 2 };
  }

  // Default: 9:16 vertical crop
  const cropHeight = sH;
  const cropWidth = Math.min(sW, Math.round(cropHeight * 9 / 16 / 2) * 2);
  return { cropWidth, cropHeight };
}

/**
 * Generates crop keyframes and a sendcmd command file for FFmpeg.
 * Implements a continuous EMA + velocity-limited camera movement model:
 * - Raw face targets are smoothed using EMA
 * - Camera movement is constrained by a maximum velocity so it follows responsively and settles naturally
 * - Continuous camera position & velocity maintained over time (no fixed-duration event boundaries)
 * - Large movements (exceeding dimension-scaled distance threshold) SNAP immediately
 * - Deadband suppresses detection micro-jitter
 */
export function generateSmoothCropPath(
  trajectory: TargetSpeakerTrajectoryPoint[],
  sourceWidth: number,
  sourceHeight: number,
  clipDurationSec: number,
  aspectRatio: OutputAspectRatio,
  workingDir: string,
  clipId: string | number,
  options?: CameraMotionOptions
): { keyframes: CropKeyframe[]; sendcmdFilePath: string; cropFilter: string } {
  const { cropWidth, cropHeight } = calculateCropDimensions(sourceWidth, sourceHeight, aspectRatio);

  const maxX = Math.max(0, sourceWidth - cropWidth);
  const maxY = Math.max(0, sourceHeight - cropHeight);

  // If no trajectory points or video matches crop dimensions exactly (no horizontal freedom)
  if (trajectory.length === 0 || maxX === 0) {
    const defaultX = Math.round(maxX / 2);
    const defaultY = Math.round(maxY / 2);
    return {
      keyframes: [{ timestamp: 0, x: defaultX, y: defaultY, width: cropWidth, height: cropHeight }],
      sendcmdFilePath: '',
      cropFilter: `crop=w=${cropWidth}:h=${cropHeight}:x=${defaultX}:y=${defaultY}`,
    };
  }

  // 1. Calculate raw target crop box for each sampled point in the trajectory
  const rawWaypoints = trajectory
    .map((pt) => {
      const facePxX = pt.faceCenter.x * sourceWidth;
      const facePxY = pt.faceCenter.y * sourceHeight;

      // Desired positioning: face centered horizontally in crop box
      const idealX = facePxX - cropWidth * 0.5;
      // Desired vertical headroom: face center sits at ~40% from top of crop box
      const idealY = facePxY - cropHeight * 0.40;

      // Clamp strictly inside source bounds and align to even numbers
      const clampedX = Math.max(0, Math.min(maxX, Math.round(idealX / 2) * 2));
      const clampedY = Math.max(0, Math.min(maxY, Math.round(idealY / 2) * 2));

      return {
        timestamp: pt.timestamp,
        targetX: clampedX,
        targetY: clampedY,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  // Resolve tuning parameters
  const emaAlpha = options?.emaAlpha ?? TARGET_EMA_ALPHA;
  const maxVelocity = options?.maxVelocityPxPerSec ?? MAX_VELOCITY_PX_PER_SEC;
  const snapRatio = options?.snapDistanceRatio ?? SNAP_DISTANCE_RATIO;
  const baseDeadband = options?.deadbandPixels ?? DEADBAND_PIXELS;

  // Dynamic distance thresholds scaled to actual crop & resolution dimensions
  const refDimension = Math.min(cropWidth, cropHeight);
  // Deadband: ~4% of crop dimension (e.g. 24px on 608px 1080p vertical crop)
  const deadband = Math.max(baseDeadband, Math.round(refDimension * 0.04));
  // Large movement threshold: ~66% of crop dimension (e.g. ~401px on 608px 1080p vertical crop)
  const largeMovementThreshold = Math.round(refDimension * snapRatio);

  // 2. Continuous simulation loop with EMA smoothing + velocity limiting + large-movement snap
  const dt = 1.0 / INTERPOLATION_FPS;
  const totalFrames = Math.ceil(clipDurationSec * INTERPOLATION_FPS);
  const keyframes: CropKeyframe[] = [];

  // Initialize state with first waypoint
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

    // Check for newly arrived waypoints up to current time t
    while (wpIdx + 1 < rawWaypoints.length && rawWaypoints[wpIdx + 1].timestamp <= t) {
      wpIdx++;
      const nextWp = rawWaypoints[wpIdx];
      const candX = nextWp.targetX;
      const candY = nextWp.targetY;

      // Distance from camera's actual current continuous position
      const distFromCamera = Math.hypot(candX - currentCameraX, candY - currentCameraY);

      if (distFromCamera >= largeMovementThreshold) {
        // LARGE MOVEMENT: Snap immediately!
        currentCameraX = candX;
        currentCameraY = candY;
        smoothedTargetX = candX;
        smoothedTargetY = candY;
        activeRawTargetX = candX;
        activeRawTargetY = candY;
        currentVx = 0;
        currentVy = 0;
      } else {
        // SMALL/MODERATE MOVEMENT: Check deadband against active raw target
        const distFromActive = Math.hypot(candX - activeRawTargetX, candY - activeRawTargetY);
        if (distFromActive > deadband) {
          activeRawTargetX = candX;
          activeRawTargetY = candY;
        }
      }
    }

    // Step continuous dynamics (for f > 0)
    if (f > 0) {
      // 1. Update smoothed target using EMA
      smoothedTargetX += (activeRawTargetX - smoothedTargetX) * emaAlpha;
      smoothedTargetY += (activeRawTargetY - smoothedTargetY) * emaAlpha;

      // 2. Constrain camera movement toward smoothed target by maximum velocity
      const dx = smoothedTargetX - currentCameraX;
      const dy = smoothedTargetY - currentCameraY;
      const distToTarget = Math.hypot(dx, dy);

      if (distToTarget <= 0.5) {
        currentCameraX = smoothedTargetX;
        currentCameraY = smoothedTargetY;
        currentVx = 0;
        currentVy = 0;
      } else {
        const maxStepDist = maxVelocity * dt;
        if (distToTarget <= maxStepDist) {
          currentCameraX = smoothedTargetX;
          currentCameraY = smoothedTargetY;
          currentVx = dx / dt;
          currentVy = dy / dt;
        } else {
          const stepRatio = maxStepDist / distToTarget;
          currentCameraX += dx * stepRatio;
          currentCameraY += dy * stepRatio;
          currentVx = (dx / distToTarget) * maxVelocity;
          currentVy = (dy / distToTarget) * maxVelocity;
        }
      }
    }

    // Clamp inside frame boundaries and align to even pixels for encoder
    const finalX = Math.max(0, Math.min(maxX, Math.round(currentCameraX / 2) * 2));
    const finalY = Math.max(0, Math.min(maxY, Math.round(currentCameraY / 2) * 2));

    keyframes.push({
      timestamp: t,
      x: finalX,
      y: finalY,
      width: cropWidth,
      height: cropHeight,
    });
  }

  // 3. Write FFmpeg sendcmd script
  let cmdText = '';
  for (const kf of keyframes) {
    const timeStr = kf.timestamp.toFixed(3);
    cmdText += `${timeStr} [enter] crop x ${kf.x};\n`;
    cmdText += `${timeStr} [enter] crop y ${kf.y};\n`;
  }

  const sendcmdDir = path.join(workingDir, 'tracking_cmds');
  if (!fs.existsSync(sendcmdDir)) {
    fs.mkdirSync(sendcmdDir, { recursive: true });
  }

  const sendcmdFilePath = path.join(sendcmdDir, `sendcmd_clip_${clipId}.txt`);
  fs.writeFileSync(sendcmdFilePath, cmdText, 'utf-8');

  // Escape sendcmd path for FFmpeg filter
  const escapedCmdPath = sendcmdFilePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const initialX = keyframes[0].x;
  const initialY = keyframes[0].y;

  const cropFilter = `sendcmd=f='${escapedCmdPath}',crop=w=${cropWidth}:h=${cropHeight}:x=${initialX}:y=${initialY}`;

  return {
    keyframes,
    sendcmdFilePath,
    cropFilter,
  };
}

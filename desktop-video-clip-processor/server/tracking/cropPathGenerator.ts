import path from 'path';
import fs from 'fs';
import { TargetSpeakerTrajectoryPoint } from './speakerSelector';
import { CropKeyframe } from './trackingTypes';
import { OutputAspectRatio } from '../../src/caption/captionTypes';

// ============================================================================
// CAMERA MOVEMENT & SMOOTHING CONFIGURATION (CONTINUOUS EMA + DYNAMICS MODEL)
// ============================================================================
/**
 * Sampling rate for camera path keyframes emitted to FFmpeg sendcmd (keyframes per second).
 * Independent of the face-analysis sampling rate (~2 FPS).
 * 30 FPS ensures dense, frame-by-frame updates without visible stepping, without altering video FPS.
 */
export const CAMERA_PATH_FPS = 30;
export const INTERPOLATION_FPS = CAMERA_PATH_FPS; // Backward-compatible alias

/**
 * Smoothing factor for raw face targets (0 < alpha <= 1).
 * Normalized at 10 FPS reference rate and automatically scaled to CAMERA_PATH_FPS.
 * - Lower values (e.g. 0.15 - 0.25) create softer, more damped following.
 * - Higher values (e.g. 0.30 - 0.45) increase responsiveness.
 */
export const TARGET_EMA_ALPHA = 0.25;

/**
 * Maximum camera movement speed in pixels per second.
 * Constrains maximum pan rate so small/moderate movements never whip dizzyingly.
 */
export const MAX_VELOCITY_PX_PER_SEC = 550;

/**
 * Maximum camera acceleration in pixels per second squared.
 * Controls how smoothly and swiftly the camera picks up speed toward the target.
 */
export const MAX_ACCELERATION_PX_PER_SEC2 = 1200;

/**
 * Maximum camera deceleration in pixels per second squared.
 * Controls how smoothly and naturally the camera brakes as it settles onto the target.
 */
export const MAX_DECELERATION_PX_PER_SEC2 = 1400;

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
  cameraPathFps?: number;
  emaAlpha?: number;
  maxVelocityPxPerSec?: number;
  maxAccelerationPxPerSec2?: number;
  maxDecelerationPxPerSec2?: number;
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
 * Implements genuine continuous camera motion with position + velocity dynamics:
 * - Raw face targets are smoothed using EMA
 * - Camera maintains continuous position and velocity over time
 * - Camera accelerates toward the smoothed target and naturally decelerates as it approaches
 * - Mid-movement redirections curve smoothly using current position and velocity (no animation restarts)
 * - Dense camera-path sampling rate (30 FPS) provides frame-by-frame smoothness without altering video FPS
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
  const fps = options?.cameraPathFps ?? CAMERA_PATH_FPS;
  const baseEmaAlpha = options?.emaAlpha ?? TARGET_EMA_ALPHA;
  const maxVelocity = options?.maxVelocityPxPerSec ?? MAX_VELOCITY_PX_PER_SEC;
  const maxAccel = options?.maxAccelerationPxPerSec2 ?? MAX_ACCELERATION_PX_PER_SEC2;
  const maxDecel = options?.maxDecelerationPxPerSec2 ?? MAX_DECELERATION_PX_PER_SEC2;
  const snapRatio = options?.snapDistanceRatio ?? SNAP_DISTANCE_RATIO;
  const baseDeadband = options?.deadbandPixels ?? DEADBAND_PIXELS;

  // Dynamic distance thresholds scaled to actual crop & resolution dimensions
  const refDimension = Math.min(cropWidth, cropHeight);
  // Deadband: ~4% of crop dimension (e.g. 24px on 608px 1080p vertical crop)
  const deadband = Math.max(baseDeadband, Math.round(refDimension * 0.04));
  // Large movement threshold: ~66% of crop dimension (e.g. ~401px on 608px 1080p vertical crop)
  const largeMovementThreshold = Math.round(refDimension * snapRatio);

  // 2. Continuous simulation loop with true position + velocity dynamics
  const dt = 1.0 / fps;
  // Make EMA smoothing rate independent of the sampling rate:
  // Evaluates same effective smoothing per unit time regardless of fps
  const effectiveEmaAlpha = 1 - Math.pow(1 - Math.min(0.99, Math.max(0.01, baseEmaAlpha)), dt / 0.1);

  const totalFrames = Math.ceil(clipDurationSec * fps);
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

    // Advance continuous dynamics (for f > 0)
    if (f > 0) {
      // 1. Advance EMA smoothed target
      smoothedTargetX += (activeRawTargetX - smoothedTargetX) * effectiveEmaAlpha;
      smoothedTargetY += (activeRawTargetY - smoothedTargetY) * effectiveEmaAlpha;

      // 2. Vector from current camera position to smoothed target
      const dx = smoothedTargetX - currentCameraX;
      const dy = smoothedTargetY - currentCameraY;
      const distToTarget = Math.hypot(dx, dy);

      if (distToTarget <= 0.2 && Math.hypot(currentVx, currentVy) <= 1.0) {
        // Target reached: settle camera to prevent micro-chatter
        currentCameraX = smoothedTargetX;
        currentCameraY = smoothedTargetY;
        currentVx = 0;
        currentVy = 0;
      } else {
        // Natural braking curve: v_stop = sqrt(2 * a_dec * distance)
        // For very small distances, use a linear transition zone to avoid infinite derivative at zero
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

        // Compute required change in velocity vector
        const deltaVx = desiredVx - currentVx;
        const deltaVy = desiredVy - currentVy;
        const deltaV = Math.hypot(deltaVx, deltaVy);

        if (deltaV > 0) {
          // Determine whether we are accelerating or braking/turning
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

        // Integrate position with updated velocity
        currentCameraX += currentVx * dt;
        currentCameraY += currentVy * dt;

        // If the camera stepped past the target while moving slowly, clamp cleanly
        const newDx = smoothedTargetX - currentCameraX;
        const newDy = smoothedTargetY - currentCameraY;
        if (dx * newDx + dy * newDy < 0 && Math.hypot(currentVx, currentVy) < 20) {
          currentCameraX = smoothedTargetX;
          currentCameraY = smoothedTargetY;
          currentVx = 0;
          currentVy = 0;
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

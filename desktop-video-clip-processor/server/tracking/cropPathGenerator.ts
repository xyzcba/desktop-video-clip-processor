import path from 'path';
import fs from 'fs';
import { TargetSpeakerTrajectoryPoint } from './speakerSelector';
import { CropKeyframe } from './trackingTypes';
import { OutputAspectRatio } from '../../src/caption/captionTypes';

export type EasingMode = 'linear' | 'easeInOut' | 'easeOut' | 'easeOutCubic' | 'easeOutExpo';

const INTERPOLATION_FPS = 10; // 10 keyframes per second baseline sampling
const LERP_DURATION_SEC = 0.5; // Tuned duration for smooth small/moderate camera repositioning
const SNAP_DISTANCE_RATIO = 0.66; // Movements exceeding ~66% of crop dimension snap immediately
const LERP_EASING: EasingMode = 'easeOutCubic'; // Default easing mode: fast start, smooth natural settling

/**
 * Evaluates standard normalized easing curves mapping t in [0, 1] to [0, 1]
 */
export function evaluateEasing(mode: EasingMode, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (mode) {
    case 'linear':
      return clamped;
    case 'easeOut':
      // Quadratic ease-out: 1 - (1 - t)^2
      return 1 - Math.pow(1 - clamped, 2);
    case 'easeOutCubic':
      // Cubic ease-out: 1 - (1 - t)^3 (starts fast, smooth natural settling)
      return 1 - Math.pow(1 - clamped, 3);
    case 'easeOutExpo':
      // Exponential ease-out: 1 - 2^(-10t)
      return clamped === 0 ? 0 : clamped === 1 ? 1 : 1 - Math.pow(2, -10 * clamped);
    case 'easeInOut':
      // Cubic ease-in-out S-curve
      return clamped < 0.5
        ? 4 * clamped * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
    default:
      return 1 - Math.pow(1 - clamped, 3);
  }
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

interface CameraMovementEvent {
  timestamp: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  isSnap: boolean;
  duration: number; // 0 for snap, LERP_DURATION_SEC for small/moderate lerp
}

/**
 * Generates crop keyframes and a sendcmd command file for FFmpeg.
 * Implements dual-mode camera response:
 * - Small/moderate movements interpolate smoothly over ~0.5s using configurable easing (default easeOutCubic)
 * - Continuous tracking: when a new waypoint arrives while moving, smoothly redirects from current position
 * - Large movements (exceeding distance threshold) SNAP immediately
 * - Deadband filters out detection noise/jitter
 */
export function generateSmoothCropPath(
  trajectory: TargetSpeakerTrajectoryPoint[],
  sourceWidth: number,
  sourceHeight: number,
  clipDurationSec: number,
  aspectRatio: OutputAspectRatio,
  workingDir: string,
  clipId: string | number,
  easingMode: EasingMode = LERP_EASING
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

      // Clamp strictly inside source bounds
      const clampedX = Math.max(0, Math.min(maxX, Math.round(idealX / 2) * 2));
      const clampedY = Math.max(0, Math.min(maxY, Math.round(idealY / 2) * 2));

      return {
        timestamp: pt.timestamp,
        targetX: clampedX,
        targetY: clampedY,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  // Dynamic distance thresholds scaled to actual crop & resolution dimensions
  const refDimension = Math.min(cropWidth, cropHeight);
  // Deadband: ~4% of crop dimension (e.g. 24px on 608px 1080p vertical crop)
  const deadbandPixels = Math.max(16, Math.round(refDimension * 0.04));
  // Large movement threshold: ~66% of crop dimension (e.g. ~401px on 608px 1080p vertical crop)
  const largeMovementThreshold = Math.round(refDimension * SNAP_DISTANCE_RATIO);

  // Helper to sample crop coordinates at any continuous timestamp t given current events list
  function getCropAtTime(
    t: number,
    eventsList: CameraMovementEvent[],
    easing: EasingMode
  ): { x: number; y: number } {
    let activeEvent = eventsList[0];
    for (let i = eventsList.length - 1; i >= 0; i--) {
      if (eventsList[i].timestamp <= t) {
        activeEvent = eventsList[i];
        break;
      }
    }

    if (activeEvent.isSnap || activeEvent.duration <= 0) {
      return { x: activeEvent.targetX, y: activeEvent.targetY };
    }

    const elapsed = t - activeEvent.timestamp;
    if (elapsed >= activeEvent.duration) {
      return { x: activeEvent.targetX, y: activeEvent.targetY };
    }

    const prog = Math.max(0, Math.min(1, elapsed / activeEvent.duration));
    const eased = evaluateEasing(easing, prog);

    const curX = activeEvent.startX + (activeEvent.targetX - activeEvent.startX) * eased;
    const curY = activeEvent.startY + (activeEvent.targetY - activeEvent.startY) * eased;
    return { x: curX, y: curY };
  }

  // 2. Build camera movement timeline (Snap vs Continuous Lerp vs Deadband)
  const events: CameraMovementEvent[] = [];
  const initialTargetX = rawWaypoints[0].targetX;
  const initialTargetY = rawWaypoints[0].targetY;

  // Initial position at t = 0
  events.push({
    timestamp: 0,
    startX: initialTargetX,
    startY: initialTargetY,
    targetX: initialTargetX,
    targetY: initialTargetY,
    isSnap: true,
    duration: 0,
  });

  for (let i = 1; i < rawWaypoints.length; i++) {
    const wp = rawWaypoints[i];

    // CONTINUOUS MOVEMENT: Evaluate camera's actual interpolated position at this timestamp
    const currentPos = getCropAtTime(wp.timestamp, events, easingMode);

    // Calculate required distance from current camera position to the new target
    const dx = wp.targetX - currentPos.x;
    const dy = wp.targetY - currentPos.y;
    const distance = Math.hypot(dx, dy);

    // Deadband check: ignore micro-movements / jitter
    if (distance <= deadbandPixels) {
      continue;
    }

    if (distance >= largeMovementThreshold) {
      // Large movement: SNAP immediately to new target (no slow pan across the frame)
      events.push({
        timestamp: wp.timestamp,
        startX: wp.targetX,
        startY: wp.targetY,
        targetX: wp.targetX,
        targetY: wp.targetY,
        isSnap: true,
        duration: 0,
      });
    } else {
      // Small/moderate movement: smoothly redirect toward the new target starting from
      // the actual interpolated current camera position (preventing micro-snaps / jump-backs)
      events.push({
        timestamp: wp.timestamp,
        startX: currentPos.x,
        startY: currentPos.y,
        targetX: wp.targetX,
        targetY: wp.targetY,
        isSnap: false,
        duration: LERP_DURATION_SEC,
      });
    }
  }

  // 3. Collect keyframe timestamps: base 10 FPS grid + event boundaries for precision
  const timestampSet = new Set<number>();
  const totalFrames = Math.ceil(clipDurationSec * INTERPOLATION_FPS);
  const dt = 1.0 / INTERPOLATION_FPS;

  for (let f = 0; f <= totalFrames; f++) {
    timestampSet.add(Math.round(f * dt * 1000) / 1000);
  }

  for (const ev of events) {
    const tStart = Math.round(ev.timestamp * 1000) / 1000;
    if (tStart <= clipDurationSec) {
      timestampSet.add(tStart);
    }
    if (!ev.isSnap && ev.duration > 0) {
      const tEnd = Math.round((ev.timestamp + ev.duration) * 1000) / 1000;
      if (tEnd <= clipDurationSec) {
        timestampSet.add(tEnd);
      }
    }
  }

  const sortedTimestamps = Array.from(timestampSet).sort((a, b) => a - b);
  const keyframes: CropKeyframe[] = [];

  for (const t of sortedTimestamps) {
    const { x, y } = getCropAtTime(t, events, easingMode);
    const finalX = Math.max(0, Math.min(maxX, Math.round(x / 2) * 2));
    const finalY = Math.max(0, Math.min(maxY, Math.round(y / 2) * 2));

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

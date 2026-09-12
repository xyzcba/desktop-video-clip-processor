import path from 'path';
import fs from 'fs';
import { TargetSpeakerTrajectoryPoint } from './speakerSelector';
import { CropKeyframe } from './trackingTypes';
import { OutputAspectRatio } from '../../src/caption/captionTypes';

const INTERPOLATION_FPS = 10; // 10 keyframes per second baseline sampling
const LERP_DURATION_SEC = 0.10; // ~0.1s transition for small/moderate camera repositioning
const SNAP_DISTANCE_RATIO = 0.33; // Movements exceeding ~33% of crop dimension snap immediately

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
 * - Small/moderate movements interpolate smoothly over ~0.1s
 * - Large movements (exceeding dimension-scaled distance threshold) SNAP immediately
 * - Deadband filters out detection noise/jitter
 */
export function generateSmoothCropPath(
  trajectory: TargetSpeakerTrajectoryPoint[],
  sourceWidth: number,
  sourceHeight: number,
  clipDurationSec: number,
  aspectRatio: OutputAspectRatio,
  workingDir: string,
  clipId: string | number
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
  const rawWaypoints = trajectory.map((pt) => {
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
  });

  // Dynamic distance thresholds scaled to actual crop & resolution dimensions
  const refDimension = Math.min(cropWidth, cropHeight);
  // Deadband: ~4% of crop dimension (e.g. 24px on 608px 1080p vertical crop)
  const deadbandPixels = Math.max(16, Math.round(refDimension * 0.04));
  // Large movement threshold: ~33% of crop dimension (e.g. ~201px on 608px 1080p vertical crop)
  const largeMovementThreshold = Math.round(refDimension * SNAP_DISTANCE_RATIO);

  // 2. Build camera movement timeline (Snap vs Lerp vs Deadband)
  const events: CameraMovementEvent[] = [];
  let currentTargetX = rawWaypoints[0].targetX;
  let currentTargetY = rawWaypoints[0].targetY;

  // Initial position at t = 0
  events.push({
    timestamp: 0,
    startX: currentTargetX,
    startY: currentTargetY,
    targetX: currentTargetX,
    targetY: currentTargetY,
    isSnap: true,
    duration: 0,
  });

  for (let i = 1; i < rawWaypoints.length; i++) {
    const wp = rawWaypoints[i];
    // 1. Calculate dx, dy
    const dx = wp.targetX - currentTargetX;
    const dy = wp.targetY - currentTargetY;
    // 2. Calculate actual movement distance
    const distance = Math.hypot(dx, dy);

    // 5. Preserve deadband behavior for tiny detection noise
    if (distance <= deadbandPixels) {
      continue;
    }

    if (distance >= largeMovementThreshold) {
      // 4. Large movement: SNAP immediately to new target (no velocity limit, no multi-second pan)
      events.push({
        timestamp: wp.timestamp,
        startX: currentTargetX,
        startY: currentTargetY,
        targetX: wp.targetX,
        targetY: wp.targetY,
        isSnap: true,
        duration: 0,
      });
      currentTargetX = wp.targetX;
      currentTargetY = wp.targetY;
    } else {
      // 3. Small/moderate movement: interpolate over ~0.1 seconds
      events.push({
        timestamp: wp.timestamp,
        startX: currentTargetX,
        startY: currentTargetY,
        targetX: wp.targetX,
        targetY: wp.targetY,
        isSnap: false,
        duration: LERP_DURATION_SEC,
      });
      currentTargetX = wp.targetX;
      currentTargetY = wp.targetY;
    }
  }

  // Helper to sample crop coordinates at any continuous timestamp t
  function getCropAtTime(t: number): { x: number; y: number } {
    let activeEvent = events[0];
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].timestamp <= t) {
        activeEvent = events[i];
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
    // Subtle easing curve (smoothstep) over ~0.1s
    const eased = prog * prog * (3 - 2 * prog);

    const curX = Math.round(activeEvent.startX + (activeEvent.targetX - activeEvent.startX) * eased);
    const curY = Math.round(activeEvent.startY + (activeEvent.targetY - activeEvent.startY) * eased);
    return { x: curX, y: curY };
  }

  // 3. Collect keyframe timestamps: base 10 FPS grid + transition midpoints for smooth rendering
  const timestampSet = new Set<number>();
  const totalFrames = Math.ceil(clipDurationSec * INTERPOLATION_FPS);
  const dt = 1.0 / INTERPOLATION_FPS;

  for (let f = 0; f <= totalFrames; f++) {
    timestampSet.add(Math.round(f * dt * 1000) / 1000);
  }

  for (const ev of events) {
    if (!ev.isSnap && ev.duration > 0) {
      const midT = Math.round((ev.timestamp + ev.duration * 0.5) * 1000) / 1000;
      if (midT <= clipDurationSec) {
        timestampSet.add(midT);
      }
    }
  }

  const sortedTimestamps = Array.from(timestampSet).sort((a, b) => a - b);
  const keyframes: CropKeyframe[] = [];

  for (const t of sortedTimestamps) {
    const { x, y } = getCropAtTime(t);
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

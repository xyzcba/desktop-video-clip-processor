import path from 'path';
import fs from 'fs';
import { TargetSpeakerTrajectoryPoint } from './speakerSelector';
import { CropKeyframe } from './trackingTypes';
import { OutputAspectRatio } from '../../src/caption/captionTypes';

const DEADBAND_PIXELS = 24; // Ignore movements smaller than 24 pixels
const MAX_PAN_SPEED_PX_PER_SEC = 300; // Cinematic camera pan speed cap
const INTERPOLATION_FPS = 10; // 10 keyframes per second in sendcmd for ultra-smooth movement

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
 * Generates smooth crop keyframes and a sendcmd command file for FFmpeg
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

  // 2. Interpolate and smooth keyframes at 10 FPS
  const totalFrames = Math.ceil(clipDurationSec * INTERPOLATION_FPS);
  const dt = 1.0 / INTERPOLATION_FPS;
  const keyframes: CropKeyframe[] = [];

  let currentX = rawWaypoints[0].targetX;
  let currentY = rawWaypoints[0].targetY;

  for (let f = 0; f <= totalFrames; f++) {
    const t = Math.round(f * dt * 1000) / 1000;

    // Find surrounding waypoints
    let wpIdx = 0;
    while (wpIdx < rawWaypoints.length - 1 && rawWaypoints[wpIdx + 1].timestamp <= t) {
      wpIdx++;
    }

    const currentWp = rawWaypoints[wpIdx];
    const nextWp = rawWaypoints[Math.min(wpIdx + 1, rawWaypoints.length - 1)];

    let desiredX = currentWp.targetX;
    let desiredY = currentWp.targetY;

    if (nextWp.timestamp > currentWp.timestamp) {
      const prog = (t - currentWp.timestamp) / (nextWp.timestamp - currentWp.timestamp);
      // Smoothstep ease-in-out: 3p^2 - 2p^3
      const clampedProg = Math.max(0, Math.min(1, prog));
      const eased = clampedProg * clampedProg * (3 - 2 * clampedProg);
      desiredX = Math.round(currentWp.targetX + (nextWp.targetX - currentWp.targetX) * eased);
      desiredY = Math.round(currentWp.targetY + (nextWp.targetY - currentWp.targetY) * eased);
    }

    // Deadband check: if change is smaller than threshold, do not drift
    const dx = desiredX - currentX;
    const dy = desiredY - currentY;
    const dist = Math.hypot(dx, dy);

    if (dist > DEADBAND_PIXELS) {
      // Velocity limiting
      const maxDistStep = MAX_PAN_SPEED_PX_PER_SEC * dt;
      const stepDist = Math.min(dist, maxDistStep);
      const ratio = stepDist / dist;

      currentX += dx * ratio;
      currentY += dy * ratio;
    }

    // Clamp and enforce even numbers for encoder alignment
    const finalX = Math.max(0, Math.min(maxX, Math.round(currentX / 2) * 2));
    const finalY = Math.max(0, Math.min(maxY, Math.round(currentY / 2) * 2));

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

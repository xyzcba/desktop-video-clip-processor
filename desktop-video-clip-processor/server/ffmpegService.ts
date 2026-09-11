/**
 * FFmpeg and FFprobe Service
 * Executes local media probing, audio extraction, chunking, and 9:16 vertical clip rendering
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { VideoMetadata } from '../src/types';
import { OutputAspectRatio } from '../src/caption/captionTypes';
import { FramingConfig } from '../src/framing/framingTypes';
import { formatSecondsToTimestamp, formatDurationHuman, formatBytes } from '../src/utils/timestamps';
import { getFfmpegBinary, getFfprobeBinary } from './resourcePaths';

export const FFMPEG_BIN = 'ffmpeg';
export const FFPROBE_BIN = 'ffprobe';

/**
 * Executes a CLI command with promise and optional cancellation
 */
export function runProcess(
  bin: string,
  args: string[],
  onData?: (data: string) => void,
  abortSignal?: AbortSignal
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    if (abortSignal) {
      const abortHandler = () => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        reject(new Error('Process was cancelled by user.'));
      };
      if (abortSignal.aborted) {
        abortHandler();
        return;
      }
      abortSignal.addEventListener('abort', abortHandler, { once: true });
    }

    child.stdout?.on('data', (d) => {
      const str = d.toString();
      stdout += str;
      if (onData) onData(str);
    });

    child.stderr?.on('data', (d) => {
      const str = d.toString();
      stderr += str;
      if (onData) onData(str);
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start ${bin}: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        // Extract meaningful error from stderr
        const lines = stderr.trim().split('\n');
        const lastFew = lines.slice(-5).join(' ').trim();
        reject(
          new Error(
            `${bin} exited with code ${code}. Details: ${lastFew || stderr.slice(-300)}`
          )
        );
      }
    });
  });
}

/**
 * Checks if FFmpeg and FFprobe are accessible
 */
export async function checkSystemDependencies(): Promise<{
  ffmpeg: boolean;
  ffprobe: boolean;
  ffmpegVersion?: string;
  error?: string;
}> {
  try {
    const probeBin = getFfprobeBinary();
    const ffmpegBin = getFfmpegBinary();
    const { stdout: ffprobeOut } = await runProcess(probeBin, ['-version']);
    const { stdout: ffmpegOut } = await runProcess(ffmpegBin, ['-version']);
    const firstLine = ffmpegOut.split('\n')[0] || '';
    return {
      ffmpeg: true,
      ffprobe: true,
      ffmpegVersion: firstLine.trim(),
    };
  } catch (err: any) {
    return {
      ffmpeg: false,
      ffprobe: false,
      error: err.message,
    };
  }
}

/**
 * Runs FFprobe on a video file to retrieve metadata
 */
export async function probeVideoFile(filePath: string): Promise<VideoMetadata> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Video file not found at: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ];

  const { stdout } = await runProcess(getFfprobeBinary(), args);
  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch (err: any) {
    throw new Error(`Failed to parse FFprobe JSON output: ${err.message}`);
  }

  const format = parsed.format || {};
  const streams = parsed.streams || [];
  const videoStream = streams.find((s: any) => s.codec_type === 'video');
  const audioStream = streams.find((s: any) => s.codec_type === 'audio');

  if (!videoStream) {
    throw new Error('No video stream found in the selected file. Only valid video files are accepted.');
  }

  const durationSec = parseFloat(format.duration || videoStream.duration || '0');
  if (durationSec <= 0) {
    throw new Error('Could not determine valid video duration. The video file may be corrupted or unreadable.');
  }

  const width = parseInt(videoStream.width || '0', 10);
  const height = parseInt(videoStream.height || '0', 10);

  // FPS calculation
  let fps = 30;
  if (videoStream.avg_frame_rate && videoStream.avg_frame_rate.includes('/')) {
    const [num, den] = videoStream.avg_frame_rate.split('/').map(Number);
    if (den > 0 && num > 0) {
      fps = Math.round((num / den) * 100) / 100;
    }
  } else if (videoStream.r_frame_rate && videoStream.r_frame_rate.includes('/')) {
    const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
    if (den > 0 && num > 0) {
      fps = Math.round((num / den) * 100) / 100;
    }
  }

  const aspectRatio = width && height ? `${width}:${height}` : 'unknown';

  return {
    filename: path.basename(filePath),
    originalPath: filePath,
    durationSec: Math.round(durationSec * 100) / 100,
    formattedDuration: formatSecondsToTimestamp(durationSec),
    width,
    height,
    aspectRatio,
    fps,
    fileSizeBytes: stat.size,
    formattedSize: formatBytes(stat.size),
    formatName: format.format_long_name || format.format_name || 'Video',
    videoCodec: videoStream.codec_long_name || videoStream.codec_name || 'unknown',
    audioCodec: audioStream ? audioStream.codec_long_name || audioStream.codec_name : undefined,
    audioSampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined,
    audioChannels: audioStream?.channels,
  };
}

/**
 * Extracts 16kHz Mono 16-bit PCM WAV audio optimized for local Whisper
 */
export async function extractAudioFromVideo(
  videoPath: string,
  outputWavPath: string,
  abortSignal?: AbortSignal
): Promise<void> {
  const dir = path.dirname(outputWavPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // FFmpeg command: -vn (no video) -acodec pcm_s16le -ar 16000 -ac 1
  const args = [
    '-y',
    '-i', videoPath,
    '-vn',
    '-acodec', 'pcm_s16le',
    '-ar', '16000',
    '-ac', '1',
    outputWavPath,
  ];

  await runProcess(getFfmpegBinary(), args, undefined, abortSignal);

  if (!fs.existsSync(outputWavPath) || fs.statSync(outputWavPath).size < 100) {
    throw new Error('Audio extraction failed: Output WAV file was not generated or is empty.');
  }
}

/**
 * Calculates target output resolution and FFmpeg crop/scale filter for a given aspect ratio and optional framing config.
 */
export function calculateTargetResolution(
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: OutputAspectRatio = '9:16',
  framingConfig?: FramingConfig
): { targetWidth: number; targetHeight: number; cropFilter: string } {
  const sW = Math.max(2, sourceWidth || 1920);
  const sH = Math.max(2, sourceHeight || 1080);

  const posX = framingConfig?.cropPositionX !== undefined ? Math.max(0, Math.min(1, framingConfig.cropPositionX)) : 0.5;
  const posY = framingConfig?.cropPositionY !== undefined ? Math.max(0, Math.min(1, framingConfig.cropPositionY)) : 0.5;

  if (aspectRatio === '16:9') {
    const targetWidth = sW >= 1920 ? 1920 : sW >= 1280 ? 1280 : Math.round(sW / 2) * 2;
    const targetHeight = Math.round((targetWidth * 9) / 16 / 2) * 2;
    const cropFilter = `crop=w='min(iw,ih*16/9)':h='min(ih,iw*9/16)':x='(iw-ow)*${posX}':y='(ih-oh)*${posY}',scale=${targetWidth}:${targetHeight}`;
    return { targetWidth, targetHeight, cropFilter };
  }

  if (aspectRatio === '1:1') {
    const minDim = Math.min(sW, sH);
    const targetDim = minDim >= 1080 ? 1080 : minDim >= 720 ? 720 : Math.round(minDim / 2) * 2;
    const cropFilter = `crop=w='min(iw,ih)':h='min(iw,ih)':x='(iw-ow)*${posX}':y='(ih-oh)*${posY}',scale=${targetDim}:${targetDim}`;
    return { targetWidth: targetDim, targetHeight: targetDim, cropFilter };
  }

  if (aspectRatio === 'original') {
    const targetWidth = Math.round(sW / 2) * 2;
    const targetHeight = Math.round(sH / 2) * 2;
    const cropFilter = `scale=${targetWidth}:${targetHeight}`;
    return { targetWidth, targetHeight, cropFilter };
  }

  // Default: 9:16 vertical
  const targetHeight = sH >= 1080 ? 1920 : sH >= 720 ? 1280 : Math.round(sH * 16 / 9 / 2) * 2;
  const targetWidth = Math.round((targetHeight * 9) / 16 / 2) * 2;
  const cropFilter = `crop=w='min(iw,ih*9/16)':h='min(ih,iw*16/9)':x='(iw-ow)*${posX}':y='(ih-oh)*${posY}',scale=${targetWidth}:${targetHeight}`;
  return { targetWidth, targetHeight, cropFilter };
}

/**
 * Escapes file paths for safe usage in FFmpeg filter graphs (handling Windows colons, backslashes).
 */
export function escapeFfmpegFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * Extracts a clip with specified aspect ratio, dynamic face tracking or manual crop, and optional burned-in ASS subtitles
 */
export async function extractClipWithStyle(
  sourceVideoPath: string,
  startSec: number,
  durationSec: number,
  outputClipPath: string,
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: OutputAspectRatio = '9:16',
  assSubtitlePath?: string,
  abortSignal?: AbortSignal,
  fontsDir?: string,
  customCropFilter?: string,
  framingConfig?: FramingConfig
): Promise<void> {
  const dir = path.dirname(outputClipPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const { targetWidth, targetHeight, cropFilter: defaultCropFilter } = calculateTargetResolution(
    sourceWidth,
    sourceHeight,
    aspectRatio,
    framingConfig
  );

  let videoFilter: string;
  if (customCropFilter) {
    videoFilter = `${customCropFilter},scale=${targetWidth}:${targetHeight}`;
  } else {
    videoFilter = defaultCropFilter;
  }

  if (assSubtitlePath && fs.existsSync(assSubtitlePath)) {
    const escapedAss = escapeFfmpegFilterPath(assSubtitlePath);
    if (fontsDir && fs.existsSync(fontsDir)) {
      const escapedFontsDir = escapeFfmpegFilterPath(fontsDir);
      videoFilter = `${videoFilter},ass='${escapedAss}':fontsdir='${escapedFontsDir}'`;
    } else {
      videoFilter = `${videoFilter},ass='${escapedAss}'`;
    }
  }

  const args = [
    '-y',
    '-ss', startSec.toString(),
    '-i', sourceVideoPath,
    '-t', durationSec.toString(),
    '-vf', videoFilter,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputClipPath,
  ];

  await runProcess(getFfmpegBinary(), args, undefined, abortSignal);

  if (!fs.existsSync(outputClipPath) || fs.statSync(outputClipPath).size < 1000) {
    throw new Error('Clip generation failed: Output video file was not generated.');
  }
}

/**
 * Cuts a 9:16 vertical clip from the ORIGINAL VIDEO using FFmpeg
 * Performs center crop and scales to clean 9:16 vertical resolution (backward compatible)
 */
export async function extractVerticalClip(
  sourceVideoPath: string,
  startSec: number,
  durationSec: number,
  outputClipPath: string,
  sourceWidth: number,
  sourceHeight: number,
  abortSignal?: AbortSignal
): Promise<void> {
  return extractClipWithStyle(
    sourceVideoPath,
    startSec,
    durationSec,
    outputClipPath,
    sourceWidth,
    sourceHeight,
    '9:16',
    undefined,
    abortSignal
  );
}

/**
 * Generates a synthetic test video (15 seconds, 640x360 @ 24fps) with test pattern and sine audio
 * Allows immediate testing of the workstation without waiting for huge uploads
 */
export async function generateSampleTestVideo(outputPath: string): Promise<VideoMetadata> {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=15:size=640x360:rate=24',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=15',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    outputPath,
  ];

  await runProcess(getFfmpegBinary(), args);
  return await probeVideoFile(outputPath);
}

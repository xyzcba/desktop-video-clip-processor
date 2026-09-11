import * as ort from 'onnxruntime-node';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { getFfmpegBinary } from '../resourcePaths';
import { FaceBoundingBox, SampledFrameDetection } from './trackingTypes';

const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;
const FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT * 3;
const CONFIDENCE_THRESHOLD = 0.65;
const NMS_IOU_THRESHOLD = 0.35;

let inferenceSession: ort.InferenceSession | null = null;

/**
 * Initializes and caches the lightweight ONNX Face Detection session
 */
async function getInferenceSession(): Promise<ort.InferenceSession> {
  if (inferenceSession) return inferenceSession;

  const modelPath = path.resolve(process.cwd(), 'models/face/version-RFB-320.onnx');
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Face tracking model not found at: ${modelPath}`);
  }

  inferenceSession = await ort.InferenceSession.create(modelPath, {
    logSeverityLevel: 3, // Suppress verbose init logs
    executionProviders: ['cpu'],
  });

  return inferenceSession;
}

/**
 * Computes Intersection over Union (IoU) between two bounding boxes
 */
function computeIoU(b1: FaceBoundingBox, b2: FaceBoundingBox): number {
  const ix1 = Math.max(b1.x1, b2.x1);
  const iy1 = Math.max(b1.y1, b2.y1);
  const ix2 = Math.min(b1.x2, b2.x2);
  const iy2 = Math.min(b1.y2, b2.y2);

  const interW = Math.max(0, ix2 - ix1);
  const interH = Math.max(0, iy2 - iy1);
  const interArea = interW * interH;

  const area1 = (b1.x2 - b1.x1) * (b1.y2 - b1.y1);
  const area2 = (b2.x2 - b2.x1) * (b2.y2 - b2.y1);
  const unionArea = area1 + area2 - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Hard Non-Maximum Suppression (NMS)
 */
function applyNms(boxes: FaceBoundingBox[], iouThreshold: number = NMS_IOU_THRESHOLD): FaceBoundingBox[] {
  if (boxes.length <= 1) return boxes;

  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const selected: FaceBoundingBox[] = [];

  for (const current of sorted) {
    let keep = true;
    for (const chosen of selected) {
      if (computeIoU(current, chosen) > iouThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) {
      selected.push(current);
    }
  }

  return selected;
}

/**
 * Computes pixel motion difference in the lower 40% (mouth/chin area) of the face ROI
 */
function computeMouthMotion(
  currentBuffer: Uint8Array,
  previousBuffer: Uint8Array | null,
  box: FaceBoundingBox
): number {
  if (!previousBuffer) return 0;

  const xMin = Math.max(0, Math.floor(box.x1 * FRAME_WIDTH));
  const xMax = Math.min(FRAME_WIDTH - 1, Math.ceil(box.x2 * FRAME_WIDTH));
  const boxH = (box.y2 - box.y1) * FRAME_HEIGHT;
  const mouthYMin = Math.max(0, Math.floor((box.y1 + 0.6 * (box.y2 - box.y1)) * FRAME_HEIGHT));
  const mouthYMax = Math.min(FRAME_HEIGHT - 1, Math.ceil(box.y2 * FRAME_HEIGHT));

  let totalDiff = 0;
  let count = 0;

  for (let y = mouthYMin; y <= mouthYMax; y += 2) {
    for (let x = xMin; x <= xMax; x += 2) {
      const idx = (y * FRAME_WIDTH + x) * 3;
      const dR = Math.abs(currentBuffer[idx] - previousBuffer[idx]);
      const dG = Math.abs(currentBuffer[idx + 1] - previousBuffer[idx + 1]);
      const dB = Math.abs(currentBuffer[idx + 2] - previousBuffer[idx + 2]);
      totalDiff += (dR + dG + dB) / 3;
      count++;
    }
  }

  return count > 0 ? totalDiff / count : 0;
}

/**
 * Runs sparse frame extraction at 2 FPS for the requested clip range only,
 * and executes local ONNX face detection on each frame.
 */
export async function detectFacesInClipRange(
  videoPath: string,
  startSec: number,
  durationSec: number,
  abortSignal?: AbortSignal
): Promise<SampledFrameDetection[]> {
  const session = await getInferenceSession();
  const ffmpegBin = getFfmpegBinary();

  return new Promise<SampledFrameDetection[]>((resolve, reject) => {
    // Seek to startSec and decode only durationSec at 2 FPS scaled to 320x240 RGB24
    const args = [
      '-ss', startSec.toString(),
      '-i', videoPath,
      '-t', durationSec.toString(),
      '-vf', 'fps=2,scale=320:240',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      'pipe:1',
    ];

    const child = spawn(ffmpegBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let bufferQueue = Buffer.alloc(0);
    const detections: SampledFrameDetection[] = [];
    let frameCounter = 0;
    let previousFrameBuffer: Uint8Array | null = null;
    let isProcessing = false;
    let isStreamEnded = false;
    let streamError: Error | null = null;

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        child.kill('SIGTERM');
        reject(new Error('Face detection aborted.'));
      });
    }

    const processNextFrame = async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        while (bufferQueue.length >= FRAME_BYTES) {
          if (abortSignal?.aborted) return;

          const frameBuffer = new Uint8Array(bufferQueue.subarray(0, FRAME_BYTES));
          bufferQueue = bufferQueue.subarray(FRAME_BYTES);

          const frameIndex = frameCounter++;
          const timestamp = Math.round((frameIndex * 0.5) * 1000) / 1000;

          // Convert RGB bytes to normalized Float32 [1, 3, 240, 320]
          // (pixel - 127.0) / 128.0
          const floatData = new Float32Array(1 * 3 * FRAME_HEIGHT * FRAME_WIDTH);
          const planeSize = FRAME_HEIGHT * FRAME_WIDTH;

          for (let y = 0; y < FRAME_HEIGHT; y++) {
            const yOffset = y * FRAME_WIDTH;
            for (let x = 0; x < FRAME_WIDTH; x++) {
              const srcIdx = (yOffset + x) * 3;
              const dstIdx = yOffset + x;
              floatData[dstIdx] = (frameBuffer[srcIdx] - 127.0) / 128.0;
              floatData[planeSize + dstIdx] = (frameBuffer[srcIdx + 1] - 127.0) / 128.0;
              floatData[2 * planeSize + dstIdx] = (frameBuffer[srcIdx + 2] - 127.0) / 128.0;
            }
          }

          const tensor = new ort.Tensor('float32', floatData, [1, 3, FRAME_HEIGHT, FRAME_WIDTH]);
          const results = await session.run({ input: tensor });

          const scoresData = results.scores.data as Float32Array;
          const boxesData = results.boxes.data as Float32Array;
          const candidateBoxes: FaceBoundingBox[] = [];

          // Shape is [1, 4420, 2] for scores and [1, 4420, 4] for boxes
          const numAnchors = 4420;
          for (let i = 0; i < numAnchors; i++) {
            const faceConfidence = scoresData[i * 2 + 1];
            if (faceConfidence >= CONFIDENCE_THRESHOLD) {
              const rawX1 = boxesData[i * 4];
              const rawY1 = boxesData[i * 4 + 1];
              const rawX2 = boxesData[i * 4 + 2];
              const rawY2 = boxesData[i * 4 + 3];

              // Clamp to normalized coordinates
              const x1 = Math.max(0, Math.min(1, rawX1));
              const y1 = Math.max(0, Math.min(1, rawY1));
              const x2 = Math.max(0, Math.min(1, rawX2));
              const y2 = Math.max(0, Math.min(1, rawY2));

              if (x2 - x1 >= 0.04 && y2 - y1 >= 0.04) {
                candidateBoxes.push({
                  x1,
                  y1,
                  x2,
                  y2,
                  confidence: faceConfidence,
                });
              }
            }
          }

          const nmsFiltered = applyNms(candidateBoxes, NMS_IOU_THRESHOLD);

          // Compute mouth motion variations
          const mouthScores = nmsFiltered.map((box) =>
            computeMouthMotion(frameBuffer, previousFrameBuffer, box)
          );

          previousFrameBuffer = frameBuffer;

          detections.push({
            timestamp,
            frameIndex,
            faces: nmsFiltered,
            mouthMotionScores: mouthScores,
          });
        }
      } catch (err: any) {
        streamError = err;
      } finally {
        isProcessing = false;
        if (isStreamEnded) {
          if (streamError) reject(streamError);
          else resolve(detections);
        }
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      bufferQueue = Buffer.concat([bufferQueue, chunk]);
      processNextFrame();
    });

    child.stderr.on('data', () => {
      // ffmpeg progress stderr (ignored)
    });

    child.on('error', (err) => {
      streamError = err;
      reject(err);
    });

    child.on('close', (code) => {
      isStreamEnded = true;
      if (!isProcessing) {
        if (streamError) reject(streamError);
        else resolve(detections);
      }
    });
  });
}

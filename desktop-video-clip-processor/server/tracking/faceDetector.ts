/**
 * Ultra-Light-Fast Face Detector using bundled local ONNX runtime (version-RFB-320.onnx).
 * Runs 100% offline on local CPU with zero cloud dependencies or runtime downloads.
 */

import fs from 'fs';
import * as ort from 'onnxruntime-node';
import { getFaceModelPath } from '../resourcePaths';
import { DetectedFace } from '../../src/tracking/faceTypes';

let inferenceSessionPromise: Promise<ort.InferenceSession | null> | null = null;

export async function getFaceDetectorSession(): Promise<ort.InferenceSession | null> {
  if (!inferenceSessionPromise) {
    inferenceSessionPromise = (async () => {
      const modelPath = getFaceModelPath();
      if (!fs.existsSync(modelPath)) {
        console.warn(`[FaceDetector] Model file not found at ${modelPath}. Face tracking will fallback.`);
        return null;
      }
      try {
        const session = await ort.InferenceSession.create(modelPath, {
          logSeverityLevel: 3, // Suppress info/warning messages
          executionProviders: ['cpu'],
        });
        return session;
      } catch (err) {
        console.error('[FaceDetector] Failed to create ONNX inference session:', err);
        return null;
      }
    })();
  }
  return inferenceSessionPromise;
}

/**
 * Calculates Intersection over Union (IoU) between two bounding boxes [x1, y1, x2, y2].
 */
function calculateIoU(boxA: number[], boxB: number[]): number {
  const xA = Math.max(boxA[0], boxB[0]);
  const yA = Math.max(boxA[1], boxB[1]);
  const xB = Math.min(boxA[2], boxB[2]);
  const yB = Math.min(boxA[3], boxB[3]);

  const interW = Math.max(0, xB - xA);
  const interH = Math.max(0, yB - yA);
  const interArea = interW * interH;

  const boxAArea = Math.max(0, boxA[2] - boxA[0]) * Math.max(0, boxA[3] - boxA[1]);
  const boxBArea = Math.max(0, boxB[2] - boxB[0]) * Math.max(0, boxB[3] - boxB[1]);

  const unionArea = boxAArea + boxBArea - interArea;
  if (unionArea <= 0) return 0;
  return interArea / unionArea;
}

/**
 * Detects faces in a raw 320x240 RGB24 buffer and maps them to original video coordinates.
 */
export async function detectFacesInRgbBuffer(
  rawRgb24: Buffer,
  sourceWidth: number,
  sourceHeight: number,
  confThreshold = 0.65
): Promise<DetectedFace[]> {
  const session = await getFaceDetectorSession();
  if (!session) return [];

  const width = 320;
  const height = 240;
  const totalPixels = width * height;
  if (rawRgb24.length < totalPixels * 3) {
    return [];
  }

  // Preprocessing: Planar float32 tensor [1, 3, 240, 320] normalized by (val - 127) / 128
  const floatData = new Float32Array(3 * totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const r = rawRgb24[i * 3];
    const g = rawRgb24[i * 3 + 1];
    const b = rawRgb24[i * 3 + 2];
    floatData[i] = (r - 127.0) / 128.0;
    floatData[totalPixels + i] = (g - 127.0) / 128.0;
    floatData[2 * totalPixels + i] = (b - 127.0) / 128.0;
  }

  const tensor = new ort.Tensor('float32', floatData, [1, 3, height, width]);
  const results = await session.run({ input: tensor });

  const scores = results.scores.data as Float32Array;
  const boxes = results.boxes.data as Float32Array;
  const totalPriors = 4420;

  // 1. Filter candidate face boxes by confidence threshold
  interface Candidate {
    box: [number, number, number, number];
    score: number;
  }
  const candidates: Candidate[] = [];

  for (let i = 0; i < totalPriors; i++) {
    const faceScore = scores[i * 2 + 1];
    if (faceScore >= confThreshold) {
      const x1 = Math.max(0, Math.min(1, boxes[i * 4]));
      const y1 = Math.max(0, Math.min(1, boxes[i * 4 + 1]));
      const x2 = Math.max(0, Math.min(1, boxes[i * 4 + 2]));
      const y2 = Math.max(0, Math.min(1, boxes[i * 4 + 3]));
      if (x2 > x1 && y2 > y1) {
        candidates.push({ box: [x1, y1, x2, y2], score: faceScore });
      }
    }
  }

  if (candidates.length === 0) return [];

  // 2. Sort by confidence descending
  candidates.sort((a, b) => b.score - a.score);

  // 3. Non-Maximum Suppression (NMS)
  const picked: Candidate[] = [];
  const iouThreshold = 0.35;

  for (const cand of candidates) {
    let keep = true;
    for (const p of picked) {
      if (calculateIoU(cand.box, p.box) > iouThreshold) {
        keep = false;
        break;
      }
    }
    if (keep) {
      picked.push(cand);
    }
  }

  // 4. Map normalized boxes to source video coordinates
  return picked.map((cand) => {
    const [x1, y1, x2, y2] = cand.box;
    const boxW = (x2 - x1) * sourceWidth;
    const boxH = (y2 - y1) * sourceHeight;
    const cx = ((x1 + x2) / 2) * sourceWidth;
    const cy = ((y1 + y2) / 2) * sourceHeight;

    return {
      x: Math.round(cx),
      y: Math.round(cy),
      width: Math.round(boxW),
      height: Math.round(boxH),
      score: Math.round(cand.score * 100) / 100,
    };
  });
}

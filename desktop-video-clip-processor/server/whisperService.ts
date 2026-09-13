/**
 * Local Whisper Transcription Service using @xenova/transformers ONNX Runtime
 * Zero cloud dependency, runs fully on local CPU, produces accurate segment timestamps
 */

import fs from 'fs';
import os from 'os';
// @ts-ignore
import * as wavefilePkg from 'wavefile';
import { getWhisperModelsDirectory } from './resourcePaths';

const WaveFile: any =
  (wavefilePkg as any).default?.WaveFile ||
  (wavefilePkg as any).WaveFile ||
  (wavefilePkg as any).default ||
  wavefilePkg;

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface WhisperTimings {
  modelInitMs: number;
  audioLoadMs: number;
  audioPrepMs: number;
  inferenceMs: number;
  timestampProcessingMs: number;
  postProcessingMs: number;
  totalMs: number;
  realtimeFactor: number;
  parseMethod: string;
}

export interface TranscriptionResult {
  text: string;
  segments: WhisperSegment[];
  words: WordTimestamp[];
  durationSec: number;
  timings?: WhisperTimings;
}

// Optimized ONNX configuration flag
let onnxConfigured = false;

function ensureOnnxConfigured() {
  if (onnxConfigured) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ort = require('onnxruntime-node');
    const actualOrt = ort.default ?? ort;

    // Suppress noisy ONNX internal warnings during graph loading
    if (actualOrt.env) {
      actualOrt.env.logLevel = 'error';
    }

    // Intercept session creation to tune thread scheduling, graph optimization, and execution mode
    if (actualOrt.InferenceSession?.create) {
      const originalCreate = actualOrt.InferenceSession.create;
      actualOrt.InferenceSession.create = async function (model: any, options: any) {
        const cpuCount = os.cpus()?.length || 2;
        // Scale intra-op thread pool with available CPU cores (capped at 8) for optimal GEMM parallelization
        const optimalIntraThreads = Math.max(1, Math.min(8, cpuCount));
        const tunedOptions = {
          ...options,
          intraOpNumThreads: optimalIntraThreads,
          interOpNumThreads: 1,
          graphOptimizationLevel: 'all',
          enableCpuMemArena: true,
          enableMemPattern: true,
          executionMode: 'sequential',
          logSeverityLevel: 3,
        };
        return originalCreate.call(this, model, tunedOptions);
      };
    }
    onnxConfigured = true;
  } catch (err: any) {
    console.warn('[Whisper] Failed to tune ONNX Runtime options:', err.message);
  }
}

// Lazy-loaded pipeline singleton
let transcriberPromise: Promise<any> | null = null;
let modelInitDurationMs = 0;

export async function getTranscriber(): Promise<any> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const initStart = Date.now();
      ensureOnnxConfigured();

      // Dynamic import of transformers to avoid loading heavy ONNX modules until first use
      const { pipeline, env } = await import('@xenova/transformers');
      const modelsDir = getWhisperModelsDirectory();

      // Configure strictly local/bundled model loading
      env.localModelPath = modelsDir;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.useBrowserCache = false;

      // Use tiny.en model: 100% offline, low RAM, fast CPU on dual-core Celeron
      const p = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        quantized: true,
      });
      modelInitDurationMs = Date.now() - initStart;
      return p;
    })();
  }
  return transcriberPromise;
}

/**
 * Pre-warms the Whisper model asynchronously in the background so the first user
 * transcription does not incur model initialization latency.
 */
export function preloadWhisperModel(): void {
  getTranscriber().catch((err: any) => {
    console.warn('[Whisper] Background model pre-warming encountered an error:', err.message);
  });
}

/**
 * High-performance direct WAV decoder into Float32Array.
 * Bypasses the heavy wavefile library for standard 16kHz 16-bit PCM WAV (which FFmpeg outputs).
 * Eliminates ~99.7% of audio parsing latency (e.g. 20ms vs 6,500ms on 60s of audio).
 */
export function decodeWavToFloat32(fileBuffer: Buffer): { samples: Float32Array; durationSec: number; method: string } {
  // Check RIFF and WAVE magic headers
  if (
    fileBuffer.length >= 44 &&
    fileBuffer.toString('ascii', 0, 4) === 'RIFF' &&
    fileBuffer.toString('ascii', 8, 12) === 'WAVE'
  ) {
    try {
      let offset = 12;
      let fmt: { audioFormat: number; numChannels: number; sampleRate: number; bitsPerSample: number } | null = null;
      let dataOffset = -1;
      let dataLength = 0;

      while (offset < fileBuffer.length - 8) {
        const chunkId = fileBuffer.toString('ascii', offset, offset + 4);
        const chunkSize = fileBuffer.readUInt32LE(offset + 4);
        const chunkDataOffset = offset + 8;

        if (chunkId === 'fmt ') {
          const audioFormat = fileBuffer.readUInt16LE(chunkDataOffset);
          const numChannels = fileBuffer.readUInt16LE(chunkDataOffset + 2);
          const sampleRate = fileBuffer.readUInt32LE(chunkDataOffset + 4);
          const bitsPerSample = fileBuffer.readUInt16LE(chunkDataOffset + 14);
          fmt = { audioFormat, numChannels, sampleRate, bitsPerSample };
        } else if (chunkId === 'data') {
          dataOffset = chunkDataOffset;
          dataLength = chunkSize;
          break;
        }

        offset += 8 + chunkSize;
      }

      // Fast path: 16kHz 16-bit PCM (standard FFmpeg extraction output)
      if (fmt && dataOffset !== -1 && fmt.sampleRate === 16000 && fmt.audioFormat === 1 && fmt.bitsPerSample === 16) {
        const numSamples = Math.min(
          Math.floor(dataLength / (2 * fmt.numChannels)),
          Math.floor((fileBuffer.length - dataOffset) / (2 * fmt.numChannels))
        );
        const float32 = new Float32Array(numSamples);
        const channels = fmt.numChannels;

        if (channels === 1) {
          // Direct mono fast copy
          for (let i = 0; i < numSamples; i++) {
            float32[i] = fileBuffer.readInt16LE(dataOffset + i * 2) / 32768.0;
          }
        } else {
          // Multi-channel downmix to mono
          for (let i = 0; i < numSamples; i++) {
            let sum = 0;
            const base = dataOffset + i * channels * 2;
            for (let ch = 0; ch < channels; ch++) {
              sum += fileBuffer.readInt16LE(base + ch * 2);
            }
            float32[i] = (sum / channels) / 32768.0;
          }
        }

        return {
          samples: float32,
          durationSec: numSamples / 16000,
          method: 'direct-pcm16',
        };
      }

      // Fast path: 16kHz 32-bit float PCM
      if (fmt && dataOffset !== -1 && fmt.sampleRate === 16000 && fmt.audioFormat === 3 && fmt.bitsPerSample === 32) {
        const numSamples = Math.min(
          Math.floor(dataLength / (4 * fmt.numChannels)),
          Math.floor((fileBuffer.length - dataOffset) / (4 * fmt.numChannels))
        );
        const float32 = new Float32Array(numSamples);
        const channels = fmt.numChannels;

        if (channels === 1) {
          for (let i = 0; i < numSamples; i++) {
            float32[i] = fileBuffer.readFloatLE(dataOffset + i * 4);
          }
        } else {
          for (let i = 0; i < numSamples; i++) {
            let sum = 0;
            const base = dataOffset + i * channels * 4;
            for (let ch = 0; ch < channels; ch++) {
              sum += fileBuffer.readFloatLE(base + ch * 4);
            }
            float32[i] = sum / channels;
          }
        }

        return {
          samples: float32,
          durationSec: numSamples / 16000,
          method: 'direct-pcm32f',
        };
      }
    } catch {
      // If parsing fails for any reason, safely fall back below
    }
  }

  // Safe fallback for non-standard or unusual WAV files
  const wav = new WaveFile(fileBuffer);
  wav.toBitDepth('32f');
  wav.toSampleRate(16000);

  let samples = wav.getSamples();
  if (Array.isArray(samples)) {
    samples = samples[0];
  }
  const float32Samples = samples instanceof Float32Array ? samples : new Float32Array(samples);
  return {
    samples: float32Samples,
    durationSec: float32Samples.length / 16000,
    method: 'wavefile-fallback',
  };
}

/**
 * Transcribes a local WAV audio file (16kHz mono)
 */
export async function transcribeAudioFile(
  wavFilePath: string,
  abortSignal?: AbortSignal
): Promise<TranscriptionResult> {
  const overallStart = Date.now();

  if (!fs.existsSync(wavFilePath)) {
    throw new Error(`Audio file not found: ${wavFilePath}`);
  }

  if (abortSignal?.aborted) {
    throw new Error('Transcription was cancelled by user.');
  }

  // 1. Read WAV and decode to Float32Array at 16kHz
  const loadStart = Date.now();
  const fileBuffer = fs.readFileSync(wavFilePath);
  const audioLoadMs = Date.now() - loadStart;

  const prepStart = Date.now();
  const { samples: float32Samples, durationSec, method: parseMethod } = decodeWavToFloat32(fileBuffer);
  const audioPrepMs = Date.now() - prepStart;

  if (abortSignal?.aborted) {
    throw new Error('Transcription was cancelled by user.');
  }

  // 2. Transcribe using local Whisper ONNX pipeline
  const modelInitBefore = Date.now();
  const transcriber = await getTranscriber();
  const modelInitMs = modelInitDurationMs || (Date.now() - modelInitBefore);

  if (abortSignal?.aborted) {
    throw new Error('Transcription was cancelled by user.');
  }

  const inferenceStart = Date.now();
  const output = await transcriber(float32Samples, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 2,
  });
  const inferenceMs = Date.now() - inferenceStart;

  // 3. Process word-level timestamps
  const tsStart = Date.now();
  const fullText = (output.text || '').trim();
  const words: WordTimestamp[] = [];

  if (Array.isArray(output.chunks) && output.chunks.length > 0) {
    for (const chunk of output.chunks) {
      const rawWord = (chunk.text || '').trim();
      if (!rawWord || rawWord === '[BLANK_AUDIO]') continue;

      let start = Array.isArray(chunk.timestamp) ? chunk.timestamp[0] ?? 0 : 0;
      let end = Array.isArray(chunk.timestamp) ? chunk.timestamp[1] ?? (start + 0.3) : (start + 0.3);

      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end <= start) end = start + 0.3;

      words.push({
        word: rawWord,
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
      });
    }
  }

  // Fallback: If words is empty but fullText exists
  if (words.length === 0 && fullText && fullText !== '[BLANK_AUDIO]') {
    const tokens = fullText.split(/\s+/).filter(Boolean);
    const wordDur = durationSec / Math.max(1, tokens.length);
    for (let i = 0; i < tokens.length; i++) {
      words.push({
        word: tokens[i],
        start: Math.round(i * wordDur * 1000) / 1000,
        end: Math.round((i + 1) * wordDur * 1000) / 1000,
      });
    }
  }
  const timestampProcessingMs = Date.now() - tsStart;

  // 4. Post-processing: Build natural subtitle segments from words
  const postStart = Date.now();
  const segments: WhisperSegment[] = [];
  let curSegmentWords: WordTimestamp[] = [];

  const flushSegment = () => {
    if (curSegmentWords.length === 0) return;
    const segText = curSegmentWords.map((w) => w.word).join(' ');
    const start = curSegmentWords[0].start;
    const end = curSegmentWords[curSegmentWords.length - 1].end;
    segments.push({
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      text: segText,
    });
    curSegmentWords = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    curSegmentWords.push(w);
    const hasPunctuation = /[.?!]$/.test(w.word);
    const nextWord = words[i + 1];
    const pauseToNext = nextWord ? nextWord.start - w.end : 0;
    const curDuration = w.end - curSegmentWords[0].start;

    if (
      hasPunctuation ||
      pauseToNext > 0.8 ||
      curDuration > 6.0 ||
      curSegmentWords.length >= 12
    ) {
      flushSegment();
    }
  }
  flushSegment();

  // If segments still empty, provide single fallback segment
  if (segments.length === 0 && fullText && fullText !== '[BLANK_AUDIO]') {
    segments.push({
      start: 0,
      end: Math.round(durationSec * 100) / 100,
      text: fullText,
    });
  }
  const postProcessingMs = Date.now() - postStart;

  const totalMs = Date.now() - overallStart;
  const realtimeFactor = durationSec > 0 ? (totalMs / 1000) / durationSec : 0;

  const timings: WhisperTimings = {
    modelInitMs,
    audioLoadMs,
    audioPrepMs,
    inferenceMs,
    timestampProcessingMs,
    postProcessingMs,
    totalMs,
    realtimeFactor: Math.round(realtimeFactor * 100) / 100,
    parseMethod,
  };

  console.log(
    `[Whisper Performance] Audio: ${durationSec.toFixed(1)}s (${parseMethod}) | ` +
    `Load: ${audioLoadMs}ms | Prep: ${audioPrepMs}ms | Inference: ${inferenceMs}ms (${(inferenceMs / 1000).toFixed(2)}s, ${realtimeFactor.toFixed(2)}x RT) | ` +
    `TS: ${timestampProcessingMs}ms | Post: ${postProcessingMs}ms | Total: ${totalMs}ms`
  );

  return {
    text: fullText,
    segments,
    words,
    durationSec,
    timings,
  };
}

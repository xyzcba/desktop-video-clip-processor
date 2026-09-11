/**
 * Local Whisper Transcription Service using @xenova/transformers ONNX Runtime
 * Zero cloud dependency, runs fully on local CPU, produces accurate segment timestamps
 */

import fs from 'fs';
// @ts-ignore
import wavefilePkg from 'wavefile';
import { getWhisperModelsDirectory } from './resourcePaths';

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

const WaveFile = (wavefilePkg as any).WaveFile || wavefilePkg;

// Lazy-loaded pipeline singleton
let transcriberPromise: Promise<any> | null = null;

export async function getTranscriber(): Promise<any> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      // Dynamic import of transformers to avoid loading heavy ONNX modules until first use
      const { pipeline, env } = await import('@xenova/transformers');
      const modelsDir = getWhisperModelsDirectory();

      // Configure strictly local/bundled model loading
      env.localModelPath = modelsDir;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.useBrowserCache = false;

      // Use tiny.en model: 100% offline, low RAM, fast CPU on dual-core Celeron
      return await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        quantized: true,
      });
    })();
  }
  return transcriberPromise;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptionResult {
  text: string;
  segments: WhisperSegment[];
  words: WordTimestamp[];
  durationSec: number;
}

/**
 * Transcribes a local WAV audio file (16kHz mono)
 */
export async function transcribeAudioFile(
  wavFilePath: string,
  abortSignal?: AbortSignal
): Promise<TranscriptionResult> {
  if (!fs.existsSync(wavFilePath)) {
    throw new Error(`Audio file not found: ${wavFilePath}`);
  }

  if (abortSignal?.aborted) {
    throw new Error('Transcription was cancelled by user.');
  }

  // 1. Read WAV and decode to Float32Array at 16kHz
  const fileBuffer = fs.readFileSync(wavFilePath);
  const wav = new WaveFile(fileBuffer);
  wav.toBitDepth('32f');
  wav.toSampleRate(16000);

  let samples = wav.getSamples();
  if (Array.isArray(samples)) {
    samples = samples[0];
  }
  const float32Samples = samples instanceof Float32Array ? samples : new Float32Array(samples);
  const durationSec = float32Samples.length / 16000;

  if (abortSignal?.aborted) {
    throw new Error('Transcription was cancelled by user.');
  }

  // 2. Transcribe using local Whisper ONNX pipeline
  const transcriber = await getTranscriber();

  if (abortSignal?.aborted) {
    throw new Error('Transcription was cancelled by user.');
  }

  const output = await transcriber(float32Samples, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });

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

  // Build natural subtitle segments from words
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

  return {
    text: fullText,
    segments,
    words,
    durationSec,
  };
}

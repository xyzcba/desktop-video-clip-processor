/**
 * Types and interfaces for the Local Windows Desktop Video Processing Application
 */

export interface VideoMetadata {
  filename: string;
  originalPath?: string;
  durationSec: number;
  formattedDuration: string;
  width: number;
  height: number;
  aspectRatio: string;
  fps: number;
  fileSizeBytes: number;
  formattedSize: string;
  formatName: string;
  videoCodec: string;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
}

import { CaptionConfig, WordTimestamp, OutputAspectRatio, FramingMode } from './caption/captionTypes';
export * from './caption/captionTypes';

export interface MasterTranscriptItem {
  id: number;
  globalStartSec: number;
  globalEndSec: number;
  formattedTimestamp: string;
  text: string;
}

export interface MasterTranscript {
  totalDurationSec: number;
  items: MasterTranscriptItem[];
  rawText: string;
  srtText?: string;
  processingTimeMs?: number;
  words?: WordTimestamp[];
}

export interface ViralClipItem {
  id: number | string;
  title: string;
  description: string;
  start: string; // HH:MM:SS or MM:SS
  end: string;   // HH:MM:SS or MM:SS
  hashtags: string[];
  keywords: string[];
  // Calculated / normalized fields:
  startSec?: number;
  endSec?: number;
  durationSec?: number;
}

export interface ViralClipsPayload {
  clips: ViralClipItem[];
}

export interface ValidationError {
  clipId?: number | string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  clips: (ViralClipItem & { startSec: number; endSec: number; durationSec: number })[];
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ClipJob {
  clipId: number | string;
  title: string;
  description: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  outputPath?: string;
  outputFilename?: string;
  fileSizeBytes?: number;
  formattedSize?: string;
  error?: string;
  progressPercent?: number;
  renderTimeMs?: number;
  hashtags?: string[];
  keywords?: string[];
  framingMode?: FramingMode;
  hasTrackedFace?: boolean;
}

export interface ProjectSession {
  sessionId: string;
  createdAt: number;
  video: VideoMetadata | null;
  videoFilePath: string | null;
  audioFilePath: string | null;
  workingDir: string;
  outputDir: string;
  recommendedClipDurationSec: number;
  maxClipDurationSec?: number;
  isTranscribing: boolean;
  transcriptionStartTime?: number;
  transcriptionElapsedMs?: number;
  transcriptionError?: string;
  transcriptionProgress: {
    status: 'idle' | 'extracting_audio' | 'transcribing' | 'completed' | 'failed';
    elapsedSec: number;
    totalDurationSec: number;
    segmentsCount?: number;
    message?: string;
  };
  masterTranscript: MasterTranscript | null;
  pastedJson: string;
  validationResult: ValidationResult | null;
  clipJobs: ClipJob[];
  isGeneratingClips: boolean;
  clipGenError?: string;
  clipGenProgress: {
    currentClipIndex: number;
    completedCount: number;
    failedCount: number;
    waitingCount: number;
    totalCount: number;
  };
  captionConfig?: CaptionConfig;
}

export type AppStep =
  | 'video'
  | 'transcription'
  | 'viral_json'
  | 'clip_generation'
  | 'results';

export type AppTheme = 'light' | 'semi-dark';

export * from './caption/captionTypes';
export * from './caption/captionPresets';
export * from './tracking/faceTypes';



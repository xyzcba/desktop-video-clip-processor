/**
 * Project Session Manager
 * Orchestrates session lifecycle, cancellation controllers, temp directories, and queues
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ZipArchive } from 'archiver';
import {
  ProjectSession,
  VideoMetadata,
  MasterTranscript,
  MasterTranscriptItem,
  ClipJob,
  ValidationResult,
} from '../src/types';
import { generateClipFilename } from '../src/utils/filenameSanitizer';
import { formatBytes, formatSecondsToTimestamp } from '../src/utils/timestamps';
import {
  extractAudioFromVideo,
  extractVerticalClip,
  extractClipWithStyle,
  calculateTargetResolution,
  probeVideoFile,
} from './ffmpegService';
import { transcribeAudioFile } from './whisperService';
import { getDownloadsDirectory, getWorkstationTempDir } from './resourcePaths';
import { DEFAULT_CAPTION_CONFIG, WordTimestamp } from '../src/caption/captionTypes';
import { DEFAULT_FRAMING_CONFIG, FramingConfig } from '../src/framing/framingTypes';
import { generateAssSubtitleFile } from './captionAssGenerator';
import { sanitizeCaptionConfig } from '../src/caption/captionValidation';
import { executeFaceTrackingPipeline } from './tracking/trackingPipeline';

// Default Windows Downloads directory resolver
export function resolveDefaultDownloadsDir(): string {
  const baseDownloads = getDownloadsDirectory();
  const clipsOutputDir = path.join(baseDownloads, 'ViralClips');
  try {
    if (!fs.existsSync(clipsOutputDir)) {
      fs.mkdirSync(clipsOutputDir, { recursive: true });
    }
    return clipsOutputDir;
  } catch {
    return baseDownloads;
  }
}

// In-memory active sessions map
const sessions = new Map<string, ProjectSession>();
const activeAbortControllers = new Map<string, { transcription?: AbortController; clips?: AbortController }>();

export function getSession(sessionId: string): ProjectSession | undefined {
  return sessions.get(sessionId);
}

export function createSession(): ProjectSession {
  const sessionId = crypto.randomUUID ? crypto.randomUUID() : 'sess_' + Math.random().toString(36).substring(2, 10);
  const workingDir = path.join(getWorkstationTempDir(), 'sessions', sessionId);
  const outputDir = resolveDefaultDownloadsDir();

  if (!fs.existsSync(workingDir)) {
    fs.mkdirSync(workingDir, { recursive: true });
  }
  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  const session: ProjectSession = {
    sessionId,
    createdAt: Date.now(),
    video: null,
    videoFilePath: null,
    audioFilePath: null,
    workingDir,
    outputDir,
    recommendedClipDurationSec: 60,
    maxClipDurationSec: 60,
    isTranscribing: false,
    transcriptionProgress: {
      status: 'idle',
      elapsedSec: 0,
      totalDurationSec: 0,
      segmentsCount: 0,
      message: '',
    },
    masterTranscript: null,
    pastedJson: '',
    validationResult: null,
    clipJobs: [],
    isGeneratingClips: false,
    clipGenProgress: {
      currentClipIndex: 0,
      completedCount: 0,
      failedCount: 0,
      waitingCount: 0,
      totalCount: 0,
    },
    captionConfig: { ...DEFAULT_CAPTION_CONFIG },
    framingConfig: DEFAULT_FRAMING_CONFIG,
  };

  sessions.set(sessionId, session);
  activeAbortControllers.set(sessionId, {});
  return session;
}

/**
 * Resets all video-related state for a session so a new video can be chosen cleanly
 */
export function resetSessionVideo(sessionId: string): ProjectSession {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  // Cancel any running operations
  cancelTranscription(sessionId);
  cancelClipGeneration(sessionId);

  session.video = null;
  session.videoFilePath = null;
  session.audioFilePath = null;
  session.masterTranscript = null;
  session.pastedJson = '';
  session.validationResult = null;
  session.clipJobs = [];
  session.isTranscribing = false;
  session.isGeneratingClips = false;
  session.transcriptionError = undefined;
  session.clipGenError = undefined;
  session.transcriptionProgress = {
    status: 'idle',
    elapsedSec: 0,
    totalDurationSec: 0,
    segmentsCount: 0,
    message: '',
  };
  session.clipGenProgress = {
    currentClipIndex: 0,
    completedCount: 0,
    failedCount: 0,
    waitingCount: 0,
    totalCount: 0,
  };

  return session;
}

/**
 * Sets video file for session and initializes metadata
 */
export async function setSessionVideo(
  sessionId: string,
  videoFilePath: string
): Promise<ProjectSession> {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  // Clear any existing video data first
  resetSessionVideo(sessionId);

  const metadata = await probeVideoFile(videoFilePath);
  session.video = metadata;
  session.videoFilePath = videoFilePath;
  session.transcriptionProgress = {
    status: 'idle',
    elapsedSec: 0,
    totalDurationSec: metadata.durationSec,
    segmentsCount: 0,
    message: 'Ready for audio extraction and transcription.',
  };

  return session;
}

/**
 * Starts unified audio extraction and local Whisper transcription
 */
export async function startTranscription(
  sessionId: string
): Promise<void> {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  if (!session.videoFilePath || !session.video) {
    throw new Error('No video loaded for this session');
  }

  if (session.isTranscribing) {
    return; // Already in progress
  }

  const abortController = new AbortController();
  const controllers = activeAbortControllers.get(sessionId) || {};
  controllers.transcription = abortController;
  activeAbortControllers.set(sessionId, controllers);

  const startTime = Date.now();
  session.isTranscribing = true;
  session.transcriptionStartTime = startTime;
  session.transcriptionError = undefined;
  session.transcriptionProgress = {
    status: 'extracting_audio',
    elapsedSec: 0,
    totalDurationSec: session.video.durationSec,
    segmentsCount: 0,
    message: 'Extracting 16 kHz mono PCM audio with local FFmpeg...',
  };

  // Run in background
  (async () => {
    let timer: NodeJS.Timeout | null = null;
    try {
      const masterAudioPath = path.join(session.workingDir, 'master_audio.wav');

      // Step 1: Extract complete audio WAV if not yet extracted
      if (!fs.existsSync(masterAudioPath) || fs.statSync(masterAudioPath).size < 100) {
        console.log(`[FFmpeg Pipeline] Extracting master audio: "${session.videoFilePath}" -> "${masterAudioPath}"`);
        await extractAudioFromVideo(session.videoFilePath!, masterAudioPath, abortController.signal);
        console.log(`[FFmpeg Pipeline] Master audio extracted (${fs.statSync(masterAudioPath).size} bytes).`);
      }
      session.audioFilePath = masterAudioPath;

      if (abortController.signal.aborted) return;

      // Step 2: Unified Whisper transcription
      session.transcriptionProgress.status = 'transcribing';
      session.transcriptionProgress.message = 'Whisper is processing the audio locally...';

      timer = setInterval(() => {
        if (session.isTranscribing) {
          session.transcriptionProgress.elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        } else if (timer) {
          clearInterval(timer);
        }
      }, 1000);

      const whisperRes = await transcribeAudioFile(masterAudioPath, abortController.signal);
      if (timer) clearInterval(timer);

      if (abortController.signal.aborted) return;

      // Step 3: Build MasterTranscript items from native Whisper segments
      const items: MasterTranscriptItem[] = whisperRes.segments.map((seg, idx) => ({
        id: idx + 1,
        globalStartSec: seg.start,
        globalEndSec: seg.end,
        formattedTimestamp: formatSecondsToTimestamp(seg.start),
        text: seg.text,
      }));

      // Generate formatted SRT
      let srtText = '';
      items.forEach((item, idx) => {
        const formatSrtTime = (sec: number) => {
          const ms = Math.round((sec % 1) * 1000);
          const totalSec = Math.floor(sec);
          const h = Math.floor(totalSec / 3600);
          const m = Math.floor((totalSec % 3600) / 60);
          const s = totalSec % 60;
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
        };
        srtText += `${idx + 1}\n${formatSrtTime(item.globalStartSec)} --> ${formatSrtTime(item.globalEndSec)}\n${item.text}\n\n`;
      });

      const elapsedMs = Date.now() - startTime;
      session.transcriptionElapsedMs = elapsedMs;
      session.masterTranscript = {
        totalDurationSec: session.video.durationSec,
        items,
        rawText: whisperRes.text,
        srtText: srtText.trim(),
        processingTimeMs: elapsedMs,
        words: whisperRes.words,
      };

      session.transcriptionProgress = {
        status: 'completed',
        elapsedSec: Math.floor(elapsedMs / 1000),
        totalDurationSec: session.video.durationSec,
        segmentsCount: items.length,
        message: `Transcription complete (${items.length} segments).`,
      };
    } catch (err: any) {
      if (timer) clearInterval(timer);
      if (abortController.signal.aborted) {
        session.transcriptionProgress = {
          status: 'idle',
          elapsedSec: 0,
          totalDurationSec: session.video.durationSec,
          message: 'Transcription cancelled.',
        };
        return;
      }
      console.error(`Transcription pipeline error in session ${sessionId}:`, err);
      session.transcriptionError = err.message || 'Audio extraction or transcription pipeline failed.';
      session.transcriptionProgress = {
        status: 'failed',
        elapsedSec: Math.floor((Date.now() - startTime) / 1000),
        totalDurationSec: session.video.durationSec,
        message: session.transcriptionError,
      };
    } finally {
      session.isTranscribing = false;
    }
  })();
}

/**
 * Retries transcription (re-runs unified transcription)
 */
export async function retryTranscription(
  sessionId: string
): Promise<void> {
  return startTranscription(sessionId);
}

/**
 * Cancels active transcription
 */
export function cancelTranscription(sessionId: string): void {
  const controllers = activeAbortControllers.get(sessionId);
  if (controllers?.transcription) {
    controllers.transcription.abort();
    controllers.transcription = undefined;
  }
  const session = getSession(sessionId);
  if (session) {
    session.isTranscribing = false;
    session.transcriptionProgress = {
      status: 'idle',
      elapsedSec: 0,
      totalDurationSec: session.video ? session.video.durationSec : 0,
      message: 'Transcription cancelled.',
    };
  }
}

/**
 * Sets validated clips and prepares clip jobs
 */
export function prepareClipJobs(sessionId: string, validationResult: ValidationResult): ProjectSession {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  session.validationResult = validationResult;
  session.clipJobs = validationResult.clips.map((clip, idx) => {
    const filename = generateClipFilename(idx + 1, clip.title);
    return {
      clipId: clip.id,
      title: clip.title,
      description: clip.description,
      startSec: clip.startSec,
      endSec: clip.endSec,
      durationSec: clip.durationSec,
      status: 'waiting',
      outputFilename: filename,
      hashtags: clip.hashtags || [],
      keywords: clip.keywords || [],
    };
  });

  session.clipGenProgress = {
    currentClipIndex: 0,
    completedCount: 0,
    failedCount: 0,
    waitingCount: session.clipJobs.length,
    totalCount: session.clipJobs.length,
  };

  return session;
}

/**
 * Starts sequential clip rendering
 */
export async function startClipGeneration(sessionId: string): Promise<void> {
  const session = getSession(sessionId);
  if (!session || !session.videoFilePath || !session.video) {
    throw new Error('No valid session or video file found');
  }

  if (session.isGeneratingClips) return;

  const abortController = new AbortController();
  const controllers = activeAbortControllers.get(sessionId) || {};
  controllers.clips = abortController;
  activeAbortControllers.set(sessionId, controllers);

  session.isGeneratingClips = true;
  session.clipGenError = undefined;

  (async () => {
    try {
      const outputDir = session.outputDir || path.join(session.workingDir, 'output_clips');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      for (let i = 0; i < session.clipJobs.length; i++) {
        if (abortController.signal.aborted) break;

        const job = session.clipJobs[i];
        if (job.status === 'completed') continue;

        job.status = 'processing';
        session.clipGenProgress.currentClipIndex = i + 1;
        updateClipProgress(session);

        const outputPath = path.join(outputDir, job.outputFilename || `clip_${i + 1}.mp4`);
        const startTime = Date.now();

        const captionConfig = session.captionConfig || DEFAULT_CAPTION_CONFIG;
        const { targetWidth, targetHeight } = calculateTargetResolution(
          session.video.width,
          session.video.height,
          captionConfig.aspectRatio
        );

        // Derive clip-relative word timestamps from Master Transcript
        const allWords = session.masterTranscript?.words || [];
        const rawClipWords = allWords.filter(
          (w) => w.end > job.startSec && w.start < job.endSec
        );
        const clipRelativeWords: WordTimestamp[] = rawClipWords.map((w) => ({
          word: w.word,
          start: Math.max(0, Math.round((w.start - job.startSec) * 1000) / 1000),
          end: Math.max(0.05, Math.round((w.end - job.startSec) * 1000) / 1000),
        }));

        let assSubtitlePath: string | undefined = undefined;
        let customFontsDir: string | undefined = undefined;

        if (captionConfig.customFontPath) {
          if (fs.existsSync(captionConfig.customFontPath)) {
            customFontsDir = path.dirname(captionConfig.customFontPath);
          } else {
            throw new Error(
              `Custom font asset not found: ${path.basename(captionConfig.customFontPath)}. Please re-upload or select an available font.`
            );
          }
        }

        if (clipRelativeWords.length > 0 && captionConfig.enabled !== false) {
          const assFile = path.join(session.workingDir, `clip_${i + 1}_subtitles.ass`);
          try {
            generateAssSubtitleFile(clipRelativeWords, captionConfig, targetWidth, targetHeight, assFile);
            assSubtitlePath = assFile;
          } catch (assErr) {
            console.error('Failed to generate ASS subtitles, continuing with video render:', assErr);
          }
        }

        const framingConfig = session.framingConfig || DEFAULT_FRAMING_CONFIG;
        let trackingCropFilter: string | undefined = undefined;

        if (framingConfig.mode === 'face_tracking' || framingConfig.mode === 'dynamic_face_tracking') {
          try {
            const trackingRes = await executeFaceTrackingPipeline({
              videoPath: session.videoFilePath!,
              startSec: job.startSec,
              durationSec: job.durationSec,
              sourceWidth: session.video.width,
              sourceHeight: session.video.height,
              aspectRatio: captionConfig.aspectRatio,
              words: clipRelativeWords,
              workingDir: session.workingDir,
              clipId: i + 1,
              mode: framingConfig.mode,
              abortSignal: abortController.signal,
            });
            if (trackingRes.hasFaces && trackingRes.cropFilter) {
              trackingCropFilter = trackingRes.cropFilter;
            }
          } catch (trackErr) {
            console.error(`Face tracking failed for clip ${i + 1}, falling back to standard framing:`, trackErr);
          }
        }

        try {
          await extractClipWithStyle(
            session.videoFilePath!,
            job.startSec,
            job.durationSec,
            outputPath,
            session.video.width,
            session.video.height,
            captionConfig.aspectRatio,
            assSubtitlePath,
            abortController.signal,
            customFontsDir,
            trackingCropFilter,
            framingConfig
          );

          const stat = fs.statSync(outputPath);
          job.status = 'completed';
          job.outputPath = outputPath;
          job.fileSizeBytes = stat.size;
          job.formattedSize = formatBytes(stat.size);
          job.renderTimeMs = Date.now() - startTime;
          job.error = undefined;
        } catch (err: any) {
          if (abortController.signal.aborted) {
            job.status = 'waiting';
            break;
          }
          job.status = 'failed';
          job.error = err.message || 'Clip rendering failed';
        }

        updateClipProgress(session);
      }
    } catch (err: any) {
      console.error(`Clip generation error in session ${sessionId}:`, err);
      session.clipGenError = err.message || 'Clip rendering failed';
    } finally {
      session.isGeneratingClips = false;
      updateClipProgress(session);
    }
  })();
}

/**
 * Retries rendering a single clip
 */
export async function retryClipJob(sessionId: string, clipId: string | number): Promise<void> {
  const session = getSession(sessionId);
  if (!session || !session.videoFilePath || !session.video) throw new Error('Session not ready');

  const job = session.clipJobs.find((j) => String(j.clipId) === String(clipId));
  if (!job) throw new Error(`Clip job ${clipId} not found`);

  job.status = 'processing';
  job.error = undefined;
  updateClipProgress(session);

  const outputDir = session.outputDir || path.join(session.workingDir, 'output_clips');
  const outputPath = path.join(outputDir, job.outputFilename || `clip_${clipId}.mp4`);
  const startTime = Date.now();

  const captionConfig = session.captionConfig || DEFAULT_CAPTION_CONFIG;
  const { targetWidth, targetHeight } = calculateTargetResolution(
    session.video.width,
    session.video.height,
    captionConfig.aspectRatio
  );

  const allWords = session.masterTranscript?.words || [];
  const rawClipWords = allWords.filter(
    (w) => w.end > job.startSec && w.start < job.endSec
  );
  const clipRelativeWords: WordTimestamp[] = rawClipWords.map((w) => ({
    word: w.word,
    start: Math.max(0, Math.round((w.start - job.startSec) * 1000) / 1000),
    end: Math.max(0.05, Math.round((w.end - job.startSec) * 1000) / 1000),
  }));

  let assSubtitlePath: string | undefined = undefined;
  let customFontsDir: string | undefined = undefined;

  if (captionConfig.customFontPath) {
    if (fs.existsSync(captionConfig.customFontPath)) {
      customFontsDir = path.dirname(captionConfig.customFontPath);
    } else {
      throw new Error(
        `Custom font asset not found: ${path.basename(captionConfig.customFontPath)}. Please re-upload or select an available font.`
      );
    }
  }

  if (clipRelativeWords.length > 0 && captionConfig.enabled !== false) {
    const assFile = path.join(session.workingDir, `clip_${clipId}_subtitles.ass`);
    try {
      generateAssSubtitleFile(clipRelativeWords, captionConfig, targetWidth, targetHeight, assFile);
      assSubtitlePath = assFile;
    } catch (assErr) {
      console.error('Failed to generate ASS subtitles for retry:', assErr);
    }
  }

  const framingConfig = session.framingConfig || DEFAULT_FRAMING_CONFIG;
  let trackingCropFilter: string | undefined = undefined;

  if (framingConfig.mode === 'face_tracking' || framingConfig.mode === 'dynamic_face_tracking') {
    try {
      const trackingRes = await executeFaceTrackingPipeline({
        videoPath: session.videoFilePath!,
        startSec: job.startSec,
        durationSec: job.durationSec,
        sourceWidth: session.video.width,
        sourceHeight: session.video.height,
        aspectRatio: captionConfig.aspectRatio,
        words: clipRelativeWords,
        workingDir: session.workingDir,
        clipId: String(clipId),
        mode: framingConfig.mode,
      });
      if (trackingRes.hasFaces && trackingRes.cropFilter) {
        trackingCropFilter = trackingRes.cropFilter;
      }
    } catch (trackErr) {
      console.error(`Face tracking retry failed for clip ${clipId}, falling back to standard framing:`, trackErr);
    }
  }

  try {
    await extractClipWithStyle(
      session.videoFilePath,
      job.startSec,
      job.durationSec,
      outputPath,
      session.video.width,
      session.video.height,
      captionConfig.aspectRatio,
      assSubtitlePath,
      undefined,
      customFontsDir,
      trackingCropFilter,
      framingConfig
    );

    const stat = fs.statSync(outputPath);
    job.status = 'completed';
    job.outputPath = outputPath;
    job.fileSizeBytes = stat.size;
    job.formattedSize = formatBytes(stat.size);
    job.renderTimeMs = Date.now() - startTime;
  } catch (err: any) {
    job.status = 'failed';
    job.error = err.message || 'Retry failed';
  } finally {
    updateClipProgress(session);
  }
}

/**
 * Updates caption configuration on session
 */
export function setSessionCaptionConfig(sessionId: string, config: any): ProjectSession {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  session.captionConfig = sanitizeCaptionConfig(config);
  return session;
}

/**
 * Updates framing configuration on session
 */
export function setSessionFramingConfig(sessionId: string, config: any): ProjectSession {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  session.framingConfig = {
    mode:
      config?.mode === 'dynamic_face_tracking'
        ? 'dynamic_face_tracking'
        : config?.mode === 'face_tracking'
        ? 'face_tracking'
        : 'crop',
    cropPositionX: typeof config?.cropPositionX === 'number' ? Math.max(0, Math.min(1, config.cropPositionX)) : 0.5,
    cropPositionY: typeof config?.cropPositionY === 'number' ? Math.max(0, Math.min(1, config.cropPositionY)) : 0.5,
    cropZoom: typeof config?.cropZoom === 'number' ? Math.max(1, Math.min(3, config.cropZoom)) : 1.0,
  };
  return session;
}

function updateClipProgress(session: ProjectSession) {
  let completed = 0;
  let failed = 0;
  let waiting = 0;
  for (const job of session.clipJobs) {
    if (job.status === 'completed') completed++;
    else if (job.status === 'failed') failed++;
    else waiting++;
  }
  session.clipGenProgress.completedCount = completed;
  session.clipGenProgress.failedCount = failed;
  session.clipGenProgress.waitingCount = waiting;
  session.clipGenProgress.totalCount = session.clipJobs.length;
}

/**
 * Cancels active clip generation
 */
export function cancelClipGeneration(sessionId: string): void {
  const controllers = activeAbortControllers.get(sessionId);
  if (controllers?.clips) {
    controllers.clips.abort();
    controllers.clips = undefined;
  }
  const session = getSession(sessionId);
  if (session) {
    session.isGeneratingClips = false;
    for (const j of session.clipJobs) {
      if (j.status === 'processing') j.status = 'waiting';
    }
    updateClipProgress(session);
  }
}

/**
 * Streams a ZIP file of all completed clips
 */
export function streamClipsZip(sessionId: string, res: any): void {
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).send('Session not found');
    return;
  }

  const completed = session.clipJobs.filter((j) => j.status === 'completed' && j.outputPath && fs.existsSync(j.outputPath));
  if (completed.length === 0) {
    res.status(400).send('No completed clips available to download');
    return;
  }

  res.attachment(`viral_clips_${sessionId.substring(0, 8)}.zip`);
  const archive = new ZipArchive({ zlib: { level: 5 } });

  archive.pipe(res);

  for (const job of completed) {
    archive.file(job.outputPath!, { name: job.outputFilename || path.basename(job.outputPath!) });
  }

  archive.finalize();
}

/**
 * Safe cleanup of temporary files (audio chunks, intermediate wavs)
 * Keeps original video and final output clips safe
 */
export function cleanupSessionTemp(sessionId: string): { cleanedBytes: number } {
  const session = getSession(sessionId);
  if (!session) throw new Error('Session not found');

  let cleanedBytes = 0;
  if (fs.existsSync(session.workingDir)) {
    const files = fs.readdirSync(session.workingDir);
    for (const file of files) {
      // Remove wav chunks and temp audio, but never original video if stored there
      if (file.endsWith('.wav') || file.startsWith('chunk_')) {
        const full = path.join(session.workingDir, file);
        try {
          const stat = fs.statSync(full);
          cleanedBytes += stat.size;
          fs.unlinkSync(full);
        } catch {
          // ignore
        }
      }
    }
  }
  return { cleanedBytes };
}

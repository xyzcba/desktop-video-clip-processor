/**
 * Full-Stack Express Server & Vite Middleware
 * Local Windows Desktop Video Processing Workstation API
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { checkSystemDependencies, generateSampleTestVideo, probeVideoFile } from './server/ffmpegService';
import {
  createSession,
  getSession,
  setSessionVideo,
  resetSessionVideo,
  startTranscription,
  cancelTranscription,
  retryTranscription,
  prepareClipJobs,
  startClipGeneration,
  cancelClipGeneration,
  retryClipJob,
  streamClipsZip,
  cleanupSessionTemp,
  resolveDefaultDownloadsDir,
  setSessionCaptionConfig,
  setSessionFramingConfig,
} from './server/sessionManager';
import { getWorkstationTempDir, validateAllResources } from './server/resourcePaths';
import { validateViralClipsJson } from './src/utils/jsonValidator';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Temp upload storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = (req.body.sessionId as string) || (req.query.sessionId as string) || 'temp_upload';
    const uploadDir = path.join(getWorkstationTempDir(), 'uploads', sessionId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep extension safe
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `source_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10 GB limit for desktop video
  fileFilter: (req, file, cb) => {
    // Only accept video files
    if (file.mimetype.startsWith('video/') || /\.(mp4|mkv|mov|avi|webm|flv|wmv|m4v)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are accepted. Audio-only or other file types are rejected.'));
    }
  },
});

// Custom Font upload storage
const fontsDir = path.join(process.cwd(), 'uploads', 'fonts');
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

const fontStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, fontsDir);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${cleanName}`);
  },
});

const fontUpload = multer({
  storage: fontStorage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB limit for font file
  fileFilter: (req, file, cb) => {
    if (/\.(ttf|otf|ttc)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only TrueType (.ttf), OpenType (.otf), and TrueType Collection (.ttc) font files are accepted.'));
    }
  },
});

// ==========================================
// API ROUTES
// ==========================================

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 2. System Status (FFmpeg, FFprobe, OS info, default paths)
app.get('/api/system/status', async (req, res) => {
  try {
    const deps = await checkSystemDependencies();
    const defaultDownloads = resolveDefaultDownloadsDir();
    const resourceValidation = validateAllResources();
    res.json({
      ...deps,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      defaultDownloads,
      whisperEngine: 'local-onnx-cpu',
      localProcessingOnly: true,
      resourceValidation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Session Management
app.post('/api/session/create', (req, res) => {
  try {
    const session = createSession();
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/session/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

// 4. Video: Upload file
app.post('/api/video/upload', upload.single('video'), async (req, res) => {
  try {
    const file = req.file;
    const sessionId = req.body.sessionId;
    if (!file) {
      res.status(400).json({ error: 'No video file provided.' });
      return;
    }

    let session = getSession(sessionId);
    if (!session) {
      session = createSession();
    }

    session = await setSessionVideo(session.sessionId, file.path);

    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Video: Use existing local path (for desktop mode)
app.post('/api/video/local-path', async (req, res) => {
  try {
    const { sessionId, filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(400).json({ error: 'Specified file path does not exist on disk.' });
      return;
    }

    let session = getSession(sessionId);
    if (!session) session = createSession();

    session = await setSessionVideo(session.sessionId, filePath);
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5b. Video: Reset video state (Change Video workflow)
app.post('/api/video/reset', (req, res) => {
  try {
    const { sessionId } = req.body;
    let session = getSession(sessionId);
    if (!session) session = createSession();
    session = resetSessionVideo(session.sessionId);
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Developer testing utility: Generate synthetic test fixture (isolated for dev testing only)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev/generate-test-fixture', async (req, res) => {
    try {
      const sessionId = req.body.sessionId;
      let session = getSession(sessionId);
      if (!session) session = createSession();

      const samplePath = path.join(session.workingDir, 'dev_test_fixture.mp4');
      await generateSampleTestVideo(samplePath);

      session = await setSessionVideo(session.sessionId, samplePath);

      res.json(session);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

// 7. Update Session Settings (output directory, recommended clip duration)
const handleSessionSettings = (req: express.Request, res: express.Response) => {
  try {
    const { sessionId, outputDir, maxClipDurationSec, recommendedClipDurationSec } = req.body;
    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (outputDir) session.outputDir = outputDir;
    const recDur = recommendedClipDurationSec || maxClipDurationSec;
    if (recDur) {
      session.recommendedClipDurationSec = recDur;
      session.maxClipDurationSec = recDur;
    }

    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/api/session/settings', handleSessionSettings);
app.post('/api/session/output-dir', handleSessionSettings);

// 7b. Font Upload & Serving for Custom Subtitle Fonts
app.use('/api/fonts', express.static(fontsDir));

app.post('/api/upload-font', fontUpload.single('font'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No font file uploaded.' });
      return;
    }
    const fontPath = req.file.path;
    const originalName = req.file.originalname;
    const fontName = path.parse(originalName).name.replace(/[_-]/g, ' ').trim();
    const fileName = req.file.filename;
    res.json({
      fontName,
      fileName,
      fontPath,
      url: `/api/fonts/${fileName}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Transcription: Start unified pipeline
const handleStartTranscription = (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    startTranscription(sessionId).catch((err) => {
      console.error(`Background transcription error:`, err);
    });
    // Return the updated session directly for client state synchronization
    res.json(getSession(sessionId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/api/transcription/start', handleStartTranscription);
app.post('/api/transcribe/start', handleStartTranscription);

// 9. Transcription: Cancel
const handleCancelTranscription = (req: express.Request, res: express.Response) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;
    cancelTranscription(sessionId);
    res.json(getSession(sessionId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/api/transcription/cancel/:sessionId', handleCancelTranscription);
app.post('/api/transcription/cancel', handleCancelTranscription);
app.post('/api/transcribe/cancel', handleCancelTranscription);

// 10. Transcription: Retry
const handleRetryTranscription = async (req: express.Request, res: express.Response) => {
  try {
    const sessionId = req.body.sessionId || req.params.sessionId;
    retryTranscription(sessionId).catch((err) => {
      console.error(`Transcription retry error:`, err);
    });
    res.json(getSession(sessionId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/api/transcription/retry', handleRetryTranscription);
app.post('/api/transcribe/retry', handleRetryTranscription);
app.post('/api/transcription/retry-chunk', handleRetryTranscription);
app.post('/api/transcribe/retry-chunk', handleRetryTranscription);

// 11. Viral JSON: Validate
app.post('/api/clips/validate-json', (req, res) => {
  try {
    const { sessionId, rawJson, maxDurationSec, maxClipDurationSec } = req.body;
    const session = getSession(sessionId);
    const videoDuration = session?.video?.durationSec || 0;
    const maxDur = maxDurationSec || maxClipDurationSec || session?.maxClipDurationSec || 60;

    const result = validateViralClipsJson(rawJson, videoDuration, maxDur);
    if (result.isValid && session) {
      session.pastedJson = rawJson;
      session.validationResult = result;
      const updated = prepareClipJobs(sessionId, result);
      res.json(updated);
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Viral JSON: Apply and prepare clip jobs
app.post('/api/clips/apply-json', (req, res) => {
  try {
    const { sessionId, rawJson, maxClipDurationSec } = req.body;
    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const videoDuration = session.video?.durationSec || 0;
    const maxDur = maxClipDurationSec || session.maxClipDurationSec || 60;
    const result = validateViralClipsJson(rawJson, videoDuration, maxDur);

    if (!result.isValid) {
      res.status(400).json({ error: 'JSON validation failed', validationResult: result });
      return;
    }

    session.pastedJson = rawJson;
    const updated = prepareClipJobs(sessionId, result);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Clips: Start sequential 9:16 rendering
const handleStartClips = (req: express.Request, res: express.Response) => {
  try {
    const { sessionId } = req.body;
    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    startClipGeneration(sessionId).catch((err) => {
      console.error(`Clip rendering error:`, err);
    });
    res.json(getSession(sessionId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/api/clips/start', handleStartClips);
app.post('/api/clips/generate', handleStartClips);

// 14. Clips: Cancel rendering
const handleCancelClips = (req: express.Request, res: express.Response) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;
    cancelClipGeneration(sessionId);
    res.json(getSession(sessionId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/api/clips/cancel/:sessionId', handleCancelClips);
app.post('/api/clips/cancel', handleCancelClips);

// 15. Clips: Retry specific clip
app.post('/api/clips/retry-clip', async (req, res) => {
  try {
    const { sessionId, clipId } = req.body;
    await retryClipJob(sessionId, clipId);
    res.json(getSession(sessionId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 15b. Caption Configuration
app.post('/api/caption/config', (req, res) => {
  try {
    const { sessionId, captionConfig } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }
    const session = setSessionCaptionConfig(sessionId, captionConfig);
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 15c. Framing Configuration
app.post('/api/framing/config', (req, res) => {
  try {
    const { sessionId, framingConfig } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }
    const session = setSessionFramingConfig(sessionId, framingConfig);
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 16. Clips: Download single clip
app.get('/api/clips/download/:sessionId/:clipId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).send('Session not found');
    return;
  }

  const job = session.clipJobs.find((j) => String(j.clipId) === String(req.params.clipId));
  if (!job || !job.outputPath || !fs.existsSync(job.outputPath)) {
    res.status(404).send('Clip file not found or not yet rendered');
    return;
  }

  res.download(job.outputPath, job.outputFilename || path.basename(job.outputPath));
});

// 17. Clips: Download All Completed (ZIP)
app.get('/api/clips/download-all/:sessionId', (req, res) => {
  streamClipsZip(req.params.sessionId, res);
});

// 18. Video Stream (HTTP Range 206 for in-browser video playback)
app.get('/api/media/stream/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session || !session.videoFilePath || !fs.existsSync(session.videoFilePath)) {
    res.status(404).send('Video not found');
    return;
  }

  const videoPath = session.videoFilePath;
  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(videoPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(videoPath).pipe(res);
  }
});

// 19. Rendered Clip Stream (for previewing completed 9:16 vertical clips)
app.get('/api/media/clip-stream/:sessionId/:clipId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).send('Session not found');
    return;
  }

  const job = session.clipJobs.find((j) => String(j.clipId) === String(req.params.clipId));
  if (!job || !job.outputPath || !fs.existsSync(job.outputPath)) {
    res.status(404).send('Clip file not found');
    return;
  }

  const clipPath = job.outputPath;
  const stat = fs.statSync(clipPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(clipPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(clipPath).pipe(res);
  }
});

// 20. Session Temp Cleanup
const handleCleanupSession = (req: express.Request, res: express.Response) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;
    const result = cleanupSessionTemp(sessionId);
    res.json({ status: 'cleaned', ...result, session: getSession(sessionId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/api/session/cleanup/:sessionId', handleCleanupSession);
app.post('/api/session/cleanup', handleCleanupSession);
app.post('/api/session/cleanup-temp', handleCleanupSession);

// ==========================================
// VITE OR STATIC SERVING
// ==========================================

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.IS_PACKAGED === 'true';

  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (devErr) {
      console.warn('Vite development server could not be started, falling back to static files:', devErr);
    }
  } else {
    // In bundled production: Vite is never imported or used.
    // Frontend is served directly from the compiled dist directory containing index.html and assets.
    const candidateDistPaths = [
      __dirname,
      path.join(__dirname, 'dist'),
      path.join(process.cwd(), 'dist'),
    ];
    const distPath = candidateDistPaths.find((p) => fs.existsSync(path.join(p, 'index.html'))) || __dirname;

    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Video Processor Workstation running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Film,
  Play,
  Clock,
  HardDrive,
  AlertCircle,
  CheckCircle2,
  Folder,
  ArrowRight,
  Loader2,
  RotateCw,
  Cpu,
  FileText,
  FolderOpen,
  Check,
} from 'lucide-react';
import { ProjectSession, VideoMetadata } from '../types';
import { formatDurationHuman } from '../utils/timestamps';

interface Step1VideoProps {
  session: ProjectSession | null;
  onVideoLoaded: (session: ProjectSession) => void;
  onChangeVideo?: () => void;
  onStartTranscription: () => void;
  onUpdateOutputDir?: (newDir: string) => void;
}

export const Step1Video: React.FC<Step1VideoProps> = ({
  session,
  onVideoLoaded,
  onChangeVideo,
  onStartTranscription,
  onUpdateOutputDir,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Folder configuration states
  const [currentOutputDir, setCurrentOutputDir] = useState<string>(session?.outputDir || '');
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [folderSavedNotice, setFolderSavedNotice] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const videoMeta: VideoMetadata | null = session?.video || null;

  // Keep local output dir state synced with session prop
  useEffect(() => {
    if (session?.outputDir) {
      setCurrentOutputDir(session.outputDir);
    }
  }, [session?.outputDir]);

  // Handle video file upload
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('video/') && !/\.(mp4|mkv|mov|avi|webm|flv|wmv|m4v)$/i.test(file.name)) {
      setErrorMessage('Invalid file type. Only video files (MP4, MKV, MOV, WEBM, AVI, etc.) are accepted. Audio-only files are rejected.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('video', file);
    if (session?.sessionId) {
      formData.append('sessionId', session.sessionId);
    }

    try {
      const res = await fetch('/api/video/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed with status ${res.status}`);
      }

      const updatedSession = await res.json();
      onVideoLoaded(updatedSession);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process video file.');
    } finally {
      setIsLoading(false);
    }
  };

  // Change video handler - returns to initial video selection workflow
  const handleChangeVideo = async () => {
    if (onChangeVideo) {
      onChangeVideo();
      return;
    }

    if (session?.sessionId) {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch('/api/video/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId }),
        });

        if (res.ok) {
          const updatedSession = await res.json();
          onVideoLoaded(updatedSession);
        } else {
          // Client-side fallback if reset API had error
          onVideoLoaded({
            ...session,
            video: null,
            videoFilePath: null,
            audioFilePath: null,
            masterTranscript: null,
            pastedJson: '',
            validationResult: null,
            clipJobs: [],
            isTranscribing: false,
            isGeneratingClips: false,
          });
        }
      } catch (err: any) {
        console.error('Error resetting video state:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Output folder change handlers
  const handleSaveOutputDir = (newPath: string) => {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    setCurrentOutputDir(trimmed);
    setIsEditingFolder(false);
    if (onUpdateOutputDir) {
      onUpdateOutputDir(trimmed);
    }
    setFolderSavedNotice(true);
    setTimeout(() => setFolderSavedNotice(false), 3000);
  };

  const handleBrowseNativeFolder = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        // @ts-ignore
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        if (dirHandle?.name) {
          const simulatedPath = `C:\\VideoProjects\\${dirHandle.name}\\Clips`;
          handleSaveOutputDir(simulatedPath);
          return;
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.log('Native folder picker fallback to input');
      }
    }

    if (folderInputRef.current) {
      folderInputRef.current.click();
    }
  };

  const handleFolderFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const firstFile = files[0];
      // @ts-ignore
      const relPath = firstFile.webkitRelativePath || '';
      const folderRoot = relPath.split('/')[0] || firstFile.name;
      const constructedPath = `C:\\VideoProjects\\${folderRoot}\\Clips`;
      handleSaveOutputDir(constructedPath);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  return (
    <div id="step-1-video-container" className="max-w-6xl mx-auto space-y-5">
      {/* Hidden File Input for video selection */}
      <input
        id="input-video-file-picker"
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.flv,.wmv,.m4v"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleFileUpload(e.target.files[0]);
          }
        }}
      />

      {/* Hidden Directory Input for folder selection fallback */}
      <input
        id="input-output-folder-picker"
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={handleFolderFileInputChange}
      />

      {/* Title & Stage Banner */}
      <div className="ws-panel p-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center shrink-0">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold ws-title">
              Stage 1: Video & Output Setup
            </h2>
            <p className="text-xs ws-muted mt-0.5">
              Choose a video file to work with and select the folder where your finished clips will be saved.
            </p>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div id="video-error-banner" className="ws-alert-error p-3.5 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-4 h-4 text-[var(--error-solid)] shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-semibold">Unable to process video:</div>
            <div>{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Input Selection Zone (When no video is loaded) */}
      {!videoMeta && (
        <div className="space-y-4">
          <div
            id="dropzone-video"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[220px] ${
              isDragging
                ? 'border-[var(--brand-primary)] bg-[var(--brand-subtle)]'
                : 'border-[var(--border-strong)] hover:border-[var(--brand-primary)] ws-panel'
            }`}
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-[var(--brand-primary)] animate-spin" />
                <div className="text-sm font-semibold ws-title">Inspecting video with local FFprobe...</div>
                <div className="text-xs ws-muted">Extracting stream metadata and audio channels</div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-[var(--brand-subtle)] flex items-center justify-center text-[var(--brand-primary)] mb-3 shadow-xs">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold ws-title">
                  Drag and drop your video here, or <span className="text-[var(--brand-text)] underline font-bold">Browse</span>
                </div>
                <p className="text-xs ws-muted mt-1.5 max-w-md">
                  Supports MP4, MOV, MKV, WEBM, AVI, and all formats decoded by local FFmpeg. Audio-only files are rejected.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Loaded Video Source & Technical Specifications (When video is loaded) */}
      {videoMeta && (
        <div id="video-metadata-card" className="ws-panel overflow-hidden">
          {/* Header row */}
          <div className="p-4 border-b border-[var(--border-default)] flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded bg-[var(--success-subtle)] text-[var(--success-text)] border border-[var(--success-border)] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--success-text)]">
                  Loaded Source Video
                </div>
                <div className="text-sm font-bold ws-title truncate max-w-md">
                  {videoMeta.filename}
                </div>
              </div>
            </div>

            {/* Change Video Button */}
            <button
              id="btn-replace-video"
              type="button"
              onClick={handleChangeVideo}
              disabled={isLoading}
              className="ws-btn-secondary shrink-0"
              title="Select another video to replace this source"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Change Video</span>
            </button>
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Media Preview Player */}
            <div className="md:col-span-1 flex flex-col justify-center">
              <div className="rounded overflow-hidden bg-black aspect-video border border-[var(--border-default)] relative shadow-inner flex items-center justify-center">
                {session?.sessionId ? (
                  <video
                    id="video-preview-player"
                    controls
                    className="w-full h-full object-contain ws-video-stage"
                    src={`/api/media/stream/${session.sessionId}`}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                    <Play className="w-6 h-6 text-slate-600" />
                  </div>
                )}
              </div>
              <div className="text-[11px] text-center ws-muted mt-1.5">
                Source Video Preview
              </div>
            </div>

            {/* Technical Specifications Grid */}
            <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="ws-well p-3">
                <div className="text-[11px] ws-muted font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[var(--brand-primary)]" /> Duration
                </div>
                <div className="text-sm font-bold ws-title mt-0.5">{videoMeta.formattedDuration}</div>
                <div className="text-[10px] ws-muted">{formatDurationHuman(videoMeta.durationSec)}</div>
              </div>

              <div className="ws-well p-3">
                <div className="text-[11px] ws-muted font-medium flex items-center gap-1">
                  <Film className="w-3 h-3 text-[var(--brand-primary)]" /> Resolution
                </div>
                <div className="text-sm font-bold ws-title mt-0.5">{videoMeta.width} × {videoMeta.height}</div>
                <div className="text-[10px] ws-muted">{videoMeta.aspectRatio} @ {videoMeta.fps} fps</div>
              </div>

              <div className="ws-well p-3">
                <div className="text-[11px] ws-muted font-medium flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-[var(--brand-primary)]" /> File Size
                </div>
                <div className="text-sm font-bold ws-title mt-0.5">{videoMeta.formattedSize}</div>
                <div className="text-[10px] ws-muted truncate">{videoMeta.formatName.split(',')[0]}</div>
              </div>

              <div className="ws-well p-3">
                <div className="text-[11px] ws-muted font-medium">Video Codec</div>
                <div className="text-xs font-semibold ws-title mt-0.5 truncate" title={videoMeta.videoCodec}>
                  {videoMeta.videoCodec}
                </div>
              </div>

              <div className="ws-well p-3">
                <div className="text-[11px] ws-muted font-medium">Audio Track</div>
                <div className="text-xs font-semibold ws-title mt-0.5 truncate">
                  {videoMeta.audioCodec || 'None'}
                </div>
                {videoMeta.audioSampleRate && (
                  <div className="text-[10px] ws-muted">{videoMeta.audioSampleRate} Hz</div>
                )}
              </div>

              <div className="ws-well p-3">
                <div className="text-[11px] ws-muted font-medium">Local Path</div>
                <div className="text-xs font-mono ws-muted mt-0.5 truncate" title={videoMeta.originalPath}>
                  {videoMeta.originalPath || 'Uploaded Video'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Target Output Folder Configuration Section */}
      <div id="target-output-folder-card" className="ws-panel p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center shrink-0">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold ws-title">Target Output Folder</h3>
              <p className="text-xs ws-muted">
                Specify where completed 9:16 vertical video clips will be saved on your computer.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              id="btn-browse-output-folder"
              type="button"
              onClick={handleBrowseNativeFolder}
              className="ws-btn-secondary"
              title="Open folder selection dialog"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
              <span>Browse Folder...</span>
            </button>

            {!isEditingFolder ? (
              <button
                id="btn-toggle-edit-output-path"
                type="button"
                onClick={() => setIsEditingFolder(true)}
                className="ws-btn-secondary"
              >
                Edit Path
              </button>
            ) : null}
          </div>
        </div>

        {/* Path Display or Editable Input */}
        {!isEditingFolder ? (
          <div className="p-2.5 ws-well flex items-center justify-between gap-3">
            <div className="font-mono text-xs text-[var(--brand-text)] font-semibold truncate select-all" title={currentOutputDir || session?.outputDir || ''}>
              {currentOutputDir || session?.outputDir || 'Resolving default downloads folder...'}
            </div>
            {folderSavedNotice && (
              <span className="text-[11px] text-[var(--success-text)] font-medium flex items-center gap-1 shrink-0 animate-in fade-in">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveOutputDir(currentOutputDir);
            }}
            className="flex items-center gap-2"
          >
            <input
              id="input-manual-output-folder"
              type="text"
              value={currentOutputDir}
              onChange={(e) => setCurrentOutputDir(e.target.value)}
              placeholder="C:\Users\username\Downloads\ViralClips"
              className="flex-1 ws-input font-mono text-xs"
            />
            <button
              id="btn-save-manual-output-folder"
              type="submit"
              className="ws-btn-primary"
            >
              Save Path
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentOutputDir(session?.outputDir || '');
                setIsEditingFolder(false);
              }}
              className="ws-btn-secondary"
            >
              Cancel
            </button>
          </form>
        )}

        <div className="text-[11px] ws-muted flex items-center gap-1.5">
          <span>Clips generated in Stage 4 will be saved directly into this directory.</span>
        </div>
      </div>

      {/* Informative Audio & Transcription Details Panel */}
      <div id="transcription-config-section" className="ws-panel p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold ws-title flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[var(--brand-primary)]" />
            <span>Audio & Transcription Setup</span>
          </h3>
          <p className="text-xs ws-muted mt-0.5">
            How audio extraction and local Whisper speech recognition will run on this video.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Card A: Audio Preparation */}
          <div className="ws-section p-4 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold ws-title">Audio Extraction</span>
                <span className="ws-badge-success">
                  Lossless Track
                </span>
              </div>
              <p className="text-xs ws-muted mt-2 leading-relaxed">
                The sound track is extracted from your video into a clean audio file for accurate speech recognition.
              </p>
            </div>
            <div className="pt-2 border-t border-[var(--border-default)] text-[11px] text-[var(--success-text)] font-medium">
              Full-length audio • Synchronized timing
            </div>
          </div>

          {/* Card B: Speech Recognition Engine */}
          <div className="ws-section p-4 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold ws-title">Speech Recognition</span>
                <span className="ws-badge-brand">
                  Local Whisper
                </span>
              </div>
              <p className="text-xs ws-muted mt-2 leading-relaxed">
                Speech recognition runs 100% on your device using local Whisper. Your files and transcripts never leave your computer.
              </p>
            </div>
            <div className="pt-2 border-t border-[var(--border-default)] text-[11px] text-[var(--brand-text)] font-medium">
              100% Private • Works Offline
            </div>
          </div>

          {/* Card C: Subtitles */}
          <div className="ws-section p-4 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold ws-title">Subtitle SubRip (SRT)</span>
                <span className="ws-badge-neutral">
                  Standard SRT
                </span>
              </div>
              <p className="text-xs ws-muted mt-2 leading-relaxed">
                Creates subtitle segments with exact start and end times to accurately cut viral highlights.
              </p>
            </div>
            <div className="pt-2 border-t border-[var(--border-default)] text-[11px] text-[var(--brand-text)] font-medium flex items-center gap-1">
              <FileText className="w-3 h-3" />
              <span>Accurate highlight cutting</span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Action Button (when video is loaded) */}
      {videoMeta && (
        <div className="flex justify-end pt-1">
          <button
            id="btn-start-transcription"
            type="button"
            onClick={() => onStartTranscription()}
            disabled={isLoading || !videoMeta}
            className="ws-btn-primary py-2.5 px-5 text-sm"
          >
            <span>Start Transcription</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

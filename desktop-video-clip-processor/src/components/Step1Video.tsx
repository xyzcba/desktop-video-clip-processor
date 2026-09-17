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

      {/* Stage Header: Creator-oriented headline & Primary CTA */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-sm sm:text-base font-bold tracking-tight text-[var(--text-primary)] uppercase">
            {videoMeta ? 'SOURCE VIDEO READY' : 'WHAT ARE WE CLIPPING?'}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {videoMeta
              ? 'Video inspected and verified. Ready for Whisper speech recognition.'
              : 'Drop in a long-form video and ClipRush will take it from there.'}
          </p>
        </div>

        {videoMeta ? (
          <button
            id="btn-start-transcription"
            type="button"
            onClick={() => onStartTranscription()}
            disabled={isLoading || !videoMeta}
            className="ws-btn-primary group py-2 px-5 text-xs font-semibold tracking-wide shadow-xs hover:shadow active:scale-[0.98] transition-all duration-150 cursor-pointer self-start sm:self-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>START TRANSCRIPTION</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-1" />
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono self-start sm:self-auto">
            <span>No video selected</span>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div id="video-error-banner" className="ws-alert-error p-3.5 flex items-start gap-3 rounded-lg shadow-xs animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-[var(--error-solid)] shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-semibold text-[var(--error-text)]">Unable to inspect video:</div>
            <div className="text-[var(--text-secondary)] mt-0.5">{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Empty State / Upload Zone (When no video is loaded) */}
      {!videoMeta && (
        <div className="space-y-4">
          <div
            id="dropzone-video"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`group border-2 border-dashed rounded-xl p-12 sm:p-16 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center min-h-[260px] select-none ${
              isDragging
                ? 'border-[var(--brand-primary)] bg-[var(--brand-subtle)] ring-2 ring-[var(--brand-primary)]/20 scale-[1.005]'
                : 'border-[var(--border-strong)] hover:border-[var(--brand-primary)] hover:bg-[var(--surface-hover)] bg-[var(--surface-primary)]'
            }`}
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="w-8 h-8 text-[var(--brand-primary)] animate-spin" />
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  Checking your video...
                </div>
                <div className="text-xs text-[var(--text-muted)] font-mono">
                  Inspecting streams and audio channels with local FFprobe
                </div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-[var(--surface-subtle)] group-hover:bg-[var(--brand-subtle)] border border-[var(--border-default)] group-hover:border-[var(--brand-border)] flex items-center justify-center text-[var(--text-secondary)] group-hover:text-[var(--brand-primary)] mb-3.5 transition-all duration-150 shadow-xs">
                  <Upload className="w-5 h-5 transition-transform duration-150 group-hover:-translate-y-0.5" />
                </div>
                <div className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                  Drag and drop your video here, or{' '}
                  <span className="text-[var(--brand-primary)] underline font-bold decoration-2 underline-offset-2">
                    Browse
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 max-w-md leading-relaxed">
                  Supports MP4, MOV, MKV, WEBM, AVI, and all standard formats decoded by local FFmpeg. Audio-only files are rejected.
                </p>
                <div className="mt-4 inline-flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-medium px-2.5 py-1 rounded-full bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
                  <span>100% on-device processing</span>
                  <span>•</span>
                  <span>Zero cloud uploads</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Loaded Video State (Recognize & Confirm) */}
      {videoMeta && (
        <div id="video-metadata-card" className="ws-panel p-4 sm:p-5 space-y-4 rounded-xl">
          {/* Header row: Ready badge, filename, and Change Video */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-default)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[var(--success-subtle)] text-[var(--success-text)] border border-[var(--success-border)] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--success-text)]">
                  VIDEO READY
                </div>
                <div className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate max-w-md sm:max-w-xl" title={videoMeta.filename}>
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
              className="ws-btn-secondary shrink-0 text-xs gap-1.5"
              title="Select another video to replace this source"
            >
              <RotateCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Change Video</span>
            </button>
          </div>

          {/* Media Player and Technical Metadata Two-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left: Source Video Workspace Preview (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col space-y-1.5">
              <div className="rounded-lg overflow-hidden bg-black aspect-video border border-[var(--border-default)] relative shadow-inner flex items-center justify-center">
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
              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] px-1">
                <span>Source Video Preview</span>
                <span className="font-mono text-[10px]">{videoMeta.width}×{videoMeta.height} ({videoMeta.aspectRatio})</span>
              </div>
            </div>

            {/* Right: Primary Metrics + Technical Specifications (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col space-y-3">
              {/* Primary Creator Metrics: Duration & Resolution */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="ws-well p-3 rounded-lg">
                  <div className="text-[11px] font-medium text-[var(--text-muted)] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                    <span>Duration</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-[var(--text-primary)] mt-1 tracking-tight">
                    {videoMeta.formattedDuration}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">
                    {formatDurationHuman(videoMeta.durationSec)}
                  </div>
                </div>

                <div className="ws-well p-3 rounded-lg">
                  <div className="text-[11px] font-medium text-[var(--text-muted)] flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                    <span>Resolution</span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-[var(--text-primary)] mt-1 tracking-tight">
                    {videoMeta.width} × {videoMeta.height}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">
                    {videoMeta.aspectRatio} @ {videoMeta.fps} fps
                  </div>
                </div>
              </div>

              {/* Secondary Technical Specifications (Compact Rows) */}
              <div className="ws-well p-3 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)] text-[11px] font-medium flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-[var(--text-muted)]" /> File Size
                  </span>
                  <span className="font-mono text-[11px] font-medium text-[var(--text-primary)]">
                    {videoMeta.formattedSize}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)] text-[11px] font-medium">Video Codec</span>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate max-w-[170px]" title={`${videoMeta.formatName} / ${videoMeta.videoCodec}`}>
                    {videoMeta.videoCodec} <span className="text-[var(--text-muted)]">({videoMeta.formatName.split(',')[0]})</span>
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)] text-[11px] font-medium">Audio Track</span>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                    {videoMeta.audioCodec || 'None'} {videoMeta.audioSampleRate ? `@ ${videoMeta.audioSampleRate} Hz` : ''}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-[var(--text-muted)] text-[11px] font-medium">Source Path</span>
                  <span className="font-mono text-[10px] text-[var(--text-muted)] truncate max-w-[170px]" title={videoMeta.originalPath}>
                    {videoMeta.originalPath || 'Uploaded File'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Target Output Folder Confirmation */}
      <div id="target-output-folder-card" className="ws-well p-3.5 sm:p-4 rounded-xl border border-[var(--border-default)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--surface-primary)] text-[var(--brand-primary)] border border-[var(--border-default)] flex items-center justify-center shrink-0 shadow-2xs">
            <Folder className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                OUTPUT DESTINATION
              </span>
              {folderSavedNotice && (
                <span className="text-[10px] text-[var(--success-text)] font-semibold flex items-center gap-1 animate-in fade-in">
                  <Check className="w-2.5 h-2.5" /> Saved
                </span>
              )}
            </div>
            <div
              className="font-mono text-xs text-[var(--text-primary)] font-medium truncate select-all mt-0.5"
              title={currentOutputDir || session?.outputDir || ''}
            >
              {currentOutputDir || session?.outputDir || 'Resolving default output folder...'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
          <button
            id="btn-browse-output-folder"
            type="button"
            onClick={handleBrowseNativeFolder}
            className="ws-btn-secondary text-xs py-1.5 px-3 gap-1.5"
            title="Select destination folder"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
            <span>Browse...</span>
          </button>
        </div>
      </div>
    </div>
  );
};

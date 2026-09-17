import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  XCircle,
  Loader2,
  Film,
  Play,
  FileCheck,
  FileText,
  Copy,
  Check,
  Share2,
  Hash,
  Tag,
  X,
  Folder,
  FolderOpen,
} from 'lucide-react';
import {
  ProjectSession,
  CaptionConfig,
  DEFAULT_CAPTION_CONFIG,
  ClipJob,
} from '../types';
import { formatSecondsToTimestamp } from '../utils/timestamps';
import { safeCopyToClipboard } from '../utils/clipboard';

interface Step5ClipGenerationProps {
  session: ProjectSession;
  onRetryClip: (clipId: string | number) => void;
  onCancelGeneration: () => void;
  onProceedToResults?: () => void;
  onUpdateCaptionConfig?: (config: CaptionConfig) => Promise<void> | void;
}

export const Step5ClipGeneration: React.FC<Step5ClipGenerationProps> = ({
  session,
  onRetryClip,
  onCancelGeneration,
}) => {
  const captionConfig = session?.captionConfig || DEFAULT_CAPTION_CONFIG;
  const isGeneratingClips = Boolean(session?.isGeneratingClips);
  const clipJobs = session?.clipJobs || [];
  const clipGenProgress = session?.clipGenProgress || {
    currentClipIndex: 0,
    completedCount: 0,
    failedCount: 0,
    waitingCount: 0,
    totalCount: clipJobs.length || 1,
  };
  const clipGenError = session?.clipGenError;

  const totalClips = clipJobs.length || 1;
  const completedCount = clipGenProgress.completedCount || 0;
  const failedCount = clipGenProgress.failedCount || 0;
  const currentClipIndex = clipGenProgress.currentClipIndex || 0;

  // Percentage reflects successfully completed clips
  const percentComplete = Math.min(100, Math.round((completedCount / totalClips) * 100));

  // Completion semantics
  const isFullyComplete = completedCount === totalClips && totalClips > 0 && failedCount === 0;
  const isPartialComplete =
    completedCount > 0 && failedCount > 0 && completedCount + failedCount === totalClips;
  const isAllFailed = failedCount === totalClips && totalClips > 0;

  // Selected clip for vertical preview
  const [selectedClipId, setSelectedClipId] = useState<string | number | null>(null);

  // Active clip resolution: user selected, or currently processing, or first completed, or first in list
  const activeClip: ClipJob | undefined =
    clipJobs.find((j) => String(j.clipId) === String(selectedClipId)) ||
    clipJobs.find((j) => j.status === 'processing') ||
    clipJobs.find((j) => j.status === 'completed') ||
    clipJobs[0];

  // Video preview element ref for seeking source moment
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // Details modal state
  const [detailsModalClip, setDetailsModalClip] = useState<ClipJob | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Live timer for active render session
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const prevIsGenerating = useRef<boolean>(false);

  useEffect(() => {
    if (!prevIsGenerating.current && isGeneratingClips) {
      setElapsedSeconds(0);
    }
    prevIsGenerating.current = isGeneratingClips;

    let timer: NodeJS.Timeout | null = null;
    if (isGeneratingClips) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isGeneratingClips]);

  // When active clip changes and is not yet completed, seek source video to start time
  useEffect(() => {
    if (activeClip && activeClip.status !== 'completed' && previewVideoRef.current) {
      previewVideoRef.current.currentTime = Math.max(0, activeClip.startSec);
    }
  }, [activeClip?.clipId, activeClip?.status, activeClip?.startSec]);

  // Close details modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && detailsModalClip) {
        setDetailsModalClip(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailsModalClip]);

  const handleCopyText = async (text: string, fieldName: string) => {
    await safeCopyToClipboard(text);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField((curr) => (curr === fieldName ? null : curr));
    }, 2000);
  };

  const handleOpenOutputFolder = async (filePathOrDir?: string) => {
    let folderToOpen = session.outputDir || '';
    if (!folderToOpen && filePathOrDir) {
      const lastSlash = Math.max(filePathOrDir.lastIndexOf('/'), filePathOrDir.lastIndexOf('\\'));
      if (lastSlash > 0) {
        folderToOpen = filePathOrDir.substring(0, lastSlash);
      } else {
        folderToOpen = filePathOrDir;
      }
    }

    // 1. If running in Electron, use the IPC handler
    if (typeof (window as any).electronAPI?.openFolder === 'function') {
      try {
        const success = await (window as any).electronAPI.openFolder(folderToOpen);
        if (success) return;
      } catch (err) {
        console.warn('Electron openFolder failed, falling back to server API:', err);
      }
    }

    // 2. Call backend server endpoint
    try {
      await fetch('/api/system/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderToOpen }),
      });
    } catch (err) {
      console.warn('Failed to open output folder:', err);
    }
  };

  const getClipMetadata = (clip: ClipJob) => {
    const matchingJsonClip = session.validationResult?.clips?.find(
      (c) => String(c.id) === String(clip.clipId)
    );
    const hashtags: string[] =
      clip.hashtags && clip.hashtags.length > 0
        ? clip.hashtags
        : matchingJsonClip?.hashtags || [];
    const keywords: string[] =
      clip.keywords && clip.keywords.length > 0
        ? clip.keywords
        : matchingJsonClip?.keywords || [];

    const formattedHashtags = hashtags
      .map((h) => (h.startsWith('#') ? h : `#${h}`))
      .join(' ');

    const outputFolder = session.outputDir || '';
    const fullPath = clip.outputPath
      ? clip.outputPath
      : outputFolder && clip.outputFilename
      ? `${outputFolder}/${clip.outputFilename}`
      : clip.outputFilename || '';

    return {
      title: clip.title,
      description: clip.description || matchingJsonClip?.description || '',
      hashtags,
      keywords,
      formattedHashtags,
      fullPath,
      durationSec: clip.durationSec,
      startSec: clip.startSec,
      endSec: clip.endSec,
      outputFilename: clip.outputFilename,
      formattedSize: clip.formattedSize,
    };
  };

  return (
    <div id="step-5-clip-generation-container" className="max-w-6xl mx-auto space-y-5">
      {/* 1. STAGE HEADER: Creator-Oriented Title & Production Summary */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-sm sm:text-base font-bold tracking-tight text-[var(--text-primary)] uppercase">
            {isFullyComplete
              ? 'CLIPS CREATED'
              : isPartialComplete
              ? `${completedCount} CLIPS CREATED · ${failedCount} FAILED`
              : isAllFailed
              ? 'CLIPS GENERATION FAILED'
              : isGeneratingClips
              ? 'CREATING YOUR CLIPS'
              : 'CREATE YOUR CLIPS'}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {isFullyComplete
              ? `All ${completedCount} vertical clips have been created and saved to your output directory.`
              : isPartialComplete
              ? `${completedCount} of ${totalClips} clips rendered successfully. ${failedCount} failed and can be retried individually below.`
              : isAllFailed
              ? `All ${totalClips} clips in the queue encountered an issue. Review the error details below.`
              : isGeneratingClips
              ? `Rendering clip ${currentClipIndex} of ${totalClips} with smart vertical framing and dynamic captions.`
              : 'Turn your selected moments into finished vertical videos.'}
          </p>
        </div>

        {/* Top Header Status & Actions */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isGeneratingClips && (
            <button
              id="btn-cancel-clip-generation"
              type="button"
              onClick={onCancelGeneration}
              className="ws-btn-destructive py-1.5 px-3 text-xs gap-1.5 cursor-pointer shadow-xs"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Rendering</span>
            </button>
          )}

          {isFullyComplete && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--success-text)] font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>All Clips Complete</span>
            </div>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {clipGenError && (
        <div
          id="clip-generation-error-alert"
          className="ws-alert-error p-3.5 rounded-xl border border-[var(--error-border)] flex items-start gap-3 shadow-xs animate-in fade-in duration-200"
        >
          <AlertCircle className="w-4 h-4 text-[var(--error-solid)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-xs text-[var(--error-text)]">
              Clip Rendering Encountered an Issue:
            </div>
            <div className="text-xs mt-1 font-mono break-words text-[var(--error-text)]/90">
              {clipGenError}
            </div>
          </div>
        </div>
      )}

      {/* 2. ACTIVE PROGRESS BAR & HONEST PRODUCTION METRICS */}
      <div className="ws-panel p-4 rounded-xl border border-[var(--border-default)] space-y-3 shadow-xs">
        <div className="flex items-center justify-between text-xs">
          <div className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
            {isGeneratingClips ? (
              <Loader2 className="w-4 h-4 text-[var(--brand-primary)] animate-spin" />
            ) : isFullyComplete ? (
              <CheckCircle2 className="w-4 h-4 text-[var(--success-text)]" />
            ) : isPartialComplete ? (
              <AlertCircle className="w-4 h-4 text-[var(--warning-text)]" />
            ) : (
              <Clock className="w-4 h-4 text-[var(--text-muted)]" />
            )}
            <span>
              {isFullyComplete
                ? 'All clips generated successfully!'
                : isPartialComplete
                ? `Finished queue with ${completedCount} successful, ${failedCount} requiring retry`
                : isGeneratingClips
                ? `Rendering Clip ${currentClipIndex} of ${totalClips}...`
                : 'Queue ready for processing'}
            </span>
          </div>

          <div className="font-mono text-xs text-[var(--text-secondary)] font-bold">
            {completedCount}/{totalClips} Done ({percentComplete}%)
          </div>
        </div>

        {/* Progress Bar Track */}
        <div className="w-full bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-full h-2.5 overflow-hidden">
          <div
            id="clip-generation-progress-fill"
            className={`h-full transition-all duration-300 ${
              isFullyComplete
                ? 'bg-[var(--success-solid)]'
                : isGeneratingClips
                ? 'bg-[var(--brand-primary)]'
                : 'bg-[var(--brand-primary)]'
            }`}
            style={{ width: `${percentComplete}%` }}
          />
        </div>

        {/* Dynamic Metric Badges Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="ws-well p-2 rounded-lg text-center">
            <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Completed</div>
            <div className="text-xs font-mono font-bold text-[var(--success-text)] mt-0.5">
              {completedCount}
            </div>
          </div>
          <div className="ws-well p-2 rounded-lg text-center">
            <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Rendering</div>
            <div className="text-xs font-mono font-bold text-[var(--brand-text)] mt-0.5">
              {isGeneratingClips ? '1 Active' : '0'}
            </div>
          </div>
          <div className="ws-well p-2 rounded-lg text-center">
            <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Failed</div>
            <div className={`text-xs font-mono font-bold mt-0.5 ${failedCount > 0 ? 'text-[var(--error-text)]' : 'text-[var(--text-muted)]'}`}>
              {failedCount}
            </div>
          </div>
          <div className="ws-well p-2 rounded-lg text-center">
            <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Elapsed</div>
            <div className="text-xs font-mono font-bold text-[var(--text-primary)] mt-0.5">
              {elapsedSeconds}s
            </div>
          </div>
        </div>
      </div>

      {/* 3. DUAL WORKSPACE: Live 9:16 Preview + Sequential Production Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: 9:16 Vertical Video Preview Stage */}
        <div className="lg:col-span-5 space-y-3">
          <div className="ws-panel p-4 rounded-xl border border-[var(--border-default)] flex flex-col items-center shadow-xs">
            <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-[var(--border-subtle)] text-xs">
              <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5 uppercase">
                <Play className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                <span>Clip Preview</span>
              </span>
              <span className="text-[11px] font-mono text-[var(--brand-text)] bg-[var(--brand-subtle)] px-2 py-0.5 rounded border border-[var(--brand-border)]">
                {captionConfig.aspectRatio} Vertical
              </span>
            </div>

            {/* Vertical 9:16 Video Frame Container */}
            <div className="relative w-[210px] sm:w-[240px] h-[373px] sm:h-[426px] bg-black rounded-xl overflow-hidden border-2 border-[var(--border-strong)] shadow-lg flex items-center justify-center">
              {activeClip ? (
                activeClip.status === 'completed' && (activeClip.outputPath || activeClip.outputFilename) ? (
                  <video
                    key={`completed-clip-${activeClip.clipId}`}
                    controls
                    playsInline
                    preload="auto"
                    className="w-full h-full object-contain"
                    src={`/api/media/clip-stream/${session.sessionId}/${encodeURIComponent(activeClip.clipId)}`}
                  />
                ) : (
                  <div className="relative w-full h-full flex flex-col items-center justify-center bg-zinc-950">
                    {session?.sessionId && (
                      <video
                        ref={previewVideoRef}
                        className="w-full h-full object-cover opacity-35"
                        src={`/api/media/stream/${session.sessionId}`}
                        muted
                        playsInline
                      />
                    )}

                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-black/60 backdrop-blur-[2px]">
                      {activeClip.status === 'processing' ? (
                        <>
                          <Loader2 className="w-8 h-8 text-[var(--brand-primary)] animate-spin mb-2" />
                          <div className="text-xs font-bold text-white uppercase tracking-wider">
                            Rendering 9:16...
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-1 font-mono">
                            Framing & Burn-in Captions
                          </div>
                        </>
                      ) : activeClip.status === 'failed' ? (
                        <>
                          <AlertCircle className="w-8 h-8 text-[var(--error-solid)] mb-2" />
                          <div className="text-xs font-bold text-[var(--error-text)]">
                            Render Interrupted
                          </div>
                          <button
                            type="button"
                            onClick={() => onRetryClip(activeClip.clipId)}
                            className="mt-3 ws-btn-primary text-xs py-1 px-3 gap-1 cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3" />
                            <span>Retry Clip</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <Film className="w-8 h-8 text-zinc-500 mb-2" />
                          <div className="text-xs font-bold text-zinc-200">
                            Queued for Generation
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-1 font-mono">
                            {formatSecondsToTimestamp(activeClip.startSec)} → {formatSecondsToTimestamp(activeClip.endSec)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <div className="text-xs text-zinc-500">No clip selected</div>
              )}
            </div>

            {/* Active Clip Metadata Footer */}
            {activeClip && (
              <div className="w-full mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[var(--text-primary)] truncate">
                    #{clipJobs.findIndex((j) => j.clipId === activeClip.clipId) + 1} • {activeClip.title}
                  </span>
                  <span className="font-mono text-[var(--brand-text)] font-bold shrink-0">
                    {activeClip.durationSec}s
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono">
                  <span>
                    {formatSecondsToTimestamp(activeClip.startSec)} → {formatSecondsToTimestamp(activeClip.endSec)}
                  </span>
                  {activeClip.formattedSize && (
                    <span className="text-[var(--text-secondary)]">{activeClip.formattedSize}</span>
                  )}
                </div>

                {activeClip.status === 'completed' ? (
                  <div className="pt-2 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)]">
                    <div className="text-[11px] font-mono text-[var(--success-text)] flex items-center gap-1 truncate">
                      <FileCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{activeClip.outputFilename}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailsModalClip(activeClip)}
                      className="ws-btn-secondary text-[11px] py-1 px-2.5 gap-1.5 font-semibold hover:border-[var(--brand-border)] hover:text-[var(--brand-text)] cursor-pointer shrink-0"
                      title="View clip details, hashtags and copy post"
                    >
                      <FileText className="w-3 h-3 text-[var(--brand-primary)]" />
                      <span>DETAILS</span>
                    </button>
                  </div>
                ) : (
                  <div className="text-[10px] text-[var(--text-muted)] pt-0.5">
                    {activeClip.status === 'processing'
                      ? 'Currently rendering. Video will update once completed.'
                      : 'Source moment preview. The finished vertical video will appear here once rendered.'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Sequential Production Queue */}
        <div className="lg:col-span-7 space-y-3">
          <div id="clip-render-queue" className="ws-panel rounded-xl border border-[var(--border-default)] overflow-hidden shadow-xs">
            <div className="p-3.5 border-b border-[var(--border-default)] flex items-center justify-between">
              <div className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Film className="w-4 h-4 text-[var(--brand-primary)]" />
                <span>Production Queue</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] font-mono">
                {captionConfig.aspectRatio.toUpperCase()} (H.264/AAC)
              </div>
            </div>

            {/* Clip Job Rows */}
            <div className="divide-y divide-[var(--border-default)] max-h-[560px] overflow-y-auto">
              {clipJobs.map((job, idx) => {
                const isProcessing = job.status === 'processing';
                const isDone = job.status === 'completed';
                const isFailed = job.status === 'failed';
                const isSelected = activeClip?.clipId === job.clipId;

                return (
                  <div
                    key={job.clipId}
                    id={`clip-job-row-${job.clipId}`}
                    onClick={() => setSelectedClipId(job.clipId)}
                    className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--brand-subtle)]/40 ring-1 ring-inset ring-[var(--brand-primary)]'
                        : 'hover:bg-[var(--surface-hover)] bg-[var(--surface-primary)]'
                    }`}
                  >
                    {/* Left info */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs font-bold shrink-0 mt-0.5 ${
                          isDone
                            ? 'bg-[var(--success-subtle)] text-[var(--success-text)] border border-[var(--success-border)]'
                            : isProcessing
                            ? 'bg-[var(--brand-subtle)] text-[var(--brand-text)] border border-[var(--brand-border)]'
                            : isFailed
                            ? 'bg-[var(--error-subtle)] text-[var(--error-text)] border border-[var(--error-border)]'
                            : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border-default)]'
                        }`}
                      >
                        {idx + 1}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-bold text-[var(--text-primary)] truncate" title={job.title}>
                          {job.title}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-mono">
                          <span>
                            {formatSecondsToTimestamp(job.startSec)} → {formatSecondsToTimestamp(job.endSec)}
                          </span>
                          <span>•</span>
                          <span>{job.durationSec}s</span>
                          {job.formattedSize && (
                            <>
                              <span>•</span>
                              <span>{job.formattedSize}</span>
                            </>
                          )}
                        </div>

                        {job.outputFilename && isDone && (
                          <div className="text-[11px] font-mono text-[var(--success-text)] truncate flex items-center gap-1 pt-0.5">
                            <FileCheck className="w-3 h-3 shrink-0" />
                            <span className="truncate">{job.outputFilename}</span>
                          </div>
                        )}

                        {job.error && (
                          <div className="text-xs text-[var(--error-text)] mt-1 font-mono break-words">
                            Error: {job.error}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {isProcessing && (
                        <span className="ws-badge-brand flex items-center gap-1.5 text-[11px] py-1 px-2.5">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Rendering 9:16</span>
                        </span>
                      )}

                      {isDone && (
                        <div className="flex items-center gap-2">
                          <span className="ws-badge-success flex items-center gap-1 text-[11px] py-1 px-2.5 font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>COMPLETE</span>
                          </span>
                          <button
                            id={`btn-clip-details-${job.clipId}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailsModalClip(job);
                            }}
                            className="ws-btn-secondary text-[11px] py-1 px-2.5 gap-1.5 font-semibold hover:border-[var(--brand-border)] hover:text-[var(--brand-text)] cursor-pointer"
                            title="View clip details, hashtags and copy post"
                          >
                            <FileText className="w-3 h-3 text-[var(--brand-primary)]" />
                            <span>DETAILS</span>
                          </button>
                        </div>
                      )}

                      {job.status === 'waiting' && (
                        <span className="ws-badge-neutral text-[11px] py-1 px-2">
                          Queued
                        </span>
                      )}

                      {isFailed && (
                        <button
                          id={`btn-retry-clip-${job.clipId}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetryClip(job.clipId);
                          }}
                          className="ws-btn-destructive text-xs py-1 px-2.5 gap-1 cursor-pointer"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. LIGHTWEIGHT NATIVE DETAILS MODAL */}
      {detailsModalClip && (() => {
        const meta = getClipMetadata(detailsModalClip);
        const fullSocialPostText = `${meta.title}\n\n${meta.description}\n\n${meta.formattedHashtags}`.trim();

        return (
          <div
            id="clip-details-modal-backdrop"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
            onClick={() => setDetailsModalClip(null)}
          >
            <div
              id="clip-details-modal"
              className="ws-panel w-full max-w-xl rounded-xl border border-[var(--border-strong)] bg-[var(--surface-primary)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-[var(--border-default)] flex items-start justify-between gap-3 bg-[var(--surface-subtle)]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="ws-badge-success text-[10px] py-0.5 px-2 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>COMPLETE</span>
                    </span>
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">
                      {meta.durationSec}s • {formatSecondsToTimestamp(meta.startSec)} - {formatSecondsToTimestamp(meta.endSec)}
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] mt-1 truncate" title={meta.title}>
                    {meta.title}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailsModalClip(null)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg hover:bg-[var(--surface-hover)] transition cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
                {/* File Location on Local Disk */}
                <div className="ws-well p-3 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-[11px] pb-1">
                    <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      OUTPUT FILE LOCATION
                    </span>
                    <button
                      id="btn-browse-output-folder"
                      type="button"
                      onClick={() => handleOpenOutputFolder(meta.fullPath)}
                      className="text-[var(--brand-text)] hover:underline flex items-center gap-1.5 font-semibold cursor-pointer shrink-0"
                      title="Open output folder in Windows Explorer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Browse Folder</span>
                    </button>
                  </div>
                  <div className="font-mono text-xs text-[var(--text-primary)] break-all select-all bg-[var(--surface-primary)] p-2 rounded border border-[var(--border-default)]">
                    {meta.fullPath || meta.outputFilename || 'Saved to project output folder'}
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                      <span>Description</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(meta.description, 'description')}
                      className="text-[var(--brand-text)] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      {copiedField === 'description' ? (
                        <>
                          <Check className="w-3 h-3 text-[var(--success-text)]" />
                          <span className="text-[var(--success-text)]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-primary)] text-[var(--text-secondary)] leading-relaxed select-all whitespace-pre-wrap">
                    {meta.description || 'No description provided.'}
                  </div>
                </div>

                {/* Hashtags */}
                {meta.hashtags.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                        <span>Hashtags ({meta.hashtags.length})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText(meta.formattedHashtags, 'hashtags')}
                        className="text-[var(--brand-text)] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        {copiedField === 'hashtags' ? (
                          <>
                            <Check className="w-3 h-3 text-[var(--success-text)]" />
                            <span className="text-[var(--success-text)]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {meta.hashtags.map((tag, i) => {
                        const cleanTag = tag.startsWith('#') ? tag : `#${tag}`;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleCopyText(cleanTag, `tag-${i}`)}
                            className="px-2 py-0.5 rounded-full text-xs font-mono bg-[var(--surface-subtle)] text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--brand-border)] hover:text-[var(--brand-text)] transition cursor-pointer flex items-center gap-1"
                            title="Click to copy tag"
                          >
                            <span>{cleanTag}</span>
                            {copiedField === `tag-${i}` && (
                              <Check className="w-2.5 h-2.5 text-[var(--success-text)]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Keywords */}
                {meta.keywords.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                        <span>Keywords ({meta.keywords.length})</span>
                      </span>
                      <button
                        id="btn-copy-keywords"
                        type="button"
                        onClick={() => handleCopyText(meta.keywords.join(', '), 'keywords')}
                        className="text-[var(--brand-text)] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        {copiedField === 'keywords' ? (
                          <>
                            <Check className="w-3 h-3 text-[var(--success-text)]" />
                            <span className="text-[var(--success-text)]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {meta.keywords.map((kw, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-[11px] bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer: Copy Social Post Action */}
              <div className="p-4 border-t border-[var(--border-default)] bg-[var(--surface-subtle)] flex items-center justify-between gap-3">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Formatted for TikTok, Reels, Shorts & X
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailsModalClip(null)}
                    className="ws-btn-secondary text-xs py-1.5 px-3"
                  >
                    Close
                  </button>

                  <button
                    id="btn-copy-full-social-post"
                    type="button"
                    onClick={() => handleCopyText(fullSocialPostText, 'full_post')}
                    className="ws-btn-primary text-xs py-1.5 px-4 gap-1.5 cursor-pointer shadow-xs font-semibold"
                  >
                    {copiedField === 'full_post' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>COPIED SOCIAL POST!</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5" />
                        <span>COPY SOCIAL POST</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

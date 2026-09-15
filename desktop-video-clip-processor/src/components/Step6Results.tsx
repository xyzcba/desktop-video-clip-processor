import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  Folder,
  Play,
  Film,
  Clock,
  Info,
  X,
  Copy,
  Check,
  FileText,
  Hash,
  Tag,
  Share2,
  Download,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RotateCw,
  Loader2,
  FileCheck,
  Archive,
} from 'lucide-react';
import { ProjectSession, ClipJob } from '../types';
import { formatSecondsToTimestamp } from '../utils/timestamps';
import { safeCopyToClipboard } from '../utils/clipboard';

interface Step6ResultsProps {
  session: ProjectSession;
  onRetryClip?: (clipId: string | number) => void;
}

export const Step6Results: React.FC<Step6ResultsProps> = ({ session, onRetryClip }) => {
  const clipJobs = session.clipJobs || [];
  const completedClips = clipJobs.filter((j) => j.status === 'completed');
  const failedClips = clipJobs.filter((j) => j.status === 'failed');
  const processingClips = clipJobs.filter((j) => j.status === 'processing');
  const totalClips = clipJobs.length;

  // Active preview clip state
  const [activePreviewClip, setActivePreviewClip] = useState<ClipJob | null>(
    () => completedClips[0] || clipJobs[0] || null
  );

  // Synchronize activePreviewClip if list changes or previous selection becomes invalid
  useEffect(() => {
    if (!activePreviewClip && completedClips.length > 0) {
      setActivePreviewClip(completedClips[0]);
    } else if (activePreviewClip) {
      const refreshed = clipJobs.find((j) => String(j.clipId) === String(activePreviewClip.clipId));
      if (refreshed && refreshed !== activePreviewClip) {
        setActivePreviewClip(refreshed);
      }
    }
  }, [clipJobs, completedClips.length]);

  // Social metadata details modal state
  const [detailsModalClip, setDetailsModalClip] = useState<ClipJob | null>(null);

  // Copy feedback state: tracks key of currently copied field
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Retry state for in-flight retry requests
  const [retryingClipId, setRetryingClipId] = useState<string | number | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && detailsModalClip) {
        setDetailsModalClip(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailsModalClip]);

  // Helper to retrieve hashtags, keywords, and full file path
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
      matchingJsonClip,
      hashtags,
      keywords,
      formattedHashtags,
      fullPath,
    };
  };

  const handleCopyText = async (text: string, fieldName: string) => {
    await safeCopyToClipboard(text);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField((curr) => (curr === fieldName ? null : curr));
    }, 2000);
  };

  // Internal or delegated retry handler
  const handleRetry = async (clipId: string | number) => {
    if (onRetryClip) {
      onRetryClip(clipId);
      return;
    }
    setRetryingClipId(clipId);
    try {
      await fetch('/api/clips/retry-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          clipId,
        }),
      });
    } catch (err) {
      console.error('Failed to retry clip:', err);
    } finally {
      setRetryingClipId(null);
    }
  };

  // Navigation between completed clips
  const currentCompletedIndex = completedClips.findIndex(
    (c) => String(c.clipId) === String(activePreviewClip?.clipId)
  );

  const handlePrevClip = () => {
    if (currentCompletedIndex > 0) {
      setActivePreviewClip(completedClips[currentCompletedIndex - 1]);
    }
  };

  const handleNextClip = () => {
    if (currentCompletedIndex < completedClips.length - 1) {
      setActivePreviewClip(completedClips[currentCompletedIndex + 1]);
    }
  };

  // Active clip metadata
  const activeMeta = activePreviewClip ? getClipMetadata(activePreviewClip) : null;
  const modalMeta = detailsModalClip ? getClipMetadata(detailsModalClip) : null;

  // Batch status semantics
  const isAllComplete = completedClips.length === totalClips && totalClips > 0;
  const isPartialComplete = completedClips.length > 0 && failedClips.length > 0;
  const isAllFailed = failedClips.length === totalClips && totalClips > 0;

  return (
    <div id="step-6-results-container" className="max-w-6xl mx-auto space-y-5">
      {/* 1. STAGE TITLE & BATCH PAYOFF HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm sm:text-base font-bold tracking-tight text-[var(--text-primary)] uppercase">
              {isAllFailed ? 'CLIPS GENERATION FAILED' : 'CLIPS ARE READY'}
            </h2>

            {/* Batch Status Badge */}
            {totalClips > 0 && (
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                  isAllComplete
                    ? 'ws-badge-success'
                    : isPartialComplete
                    ? 'ws-badge-brand'
                    : isAllFailed
                    ? 'ws-badge-destructive'
                    : 'ws-badge-neutral'
                }`}
              >
                {isAllComplete
                  ? `${completedClips.length} ${completedClips.length === 1 ? 'CLIP' : 'CLIPS'} CREATED`
                  : isPartialComplete
                  ? `${completedClips.length} CREATED · ${failedClips.length} FAILED`
                  : isAllFailed
                  ? `ALL ${failedClips.length} FAILED`
                  : `${completedClips.length} READY`}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {isAllFailed
              ? 'All clip generation tasks encountered an error. Review error details below and retry.'
              : 'Review your finished clips and export the moments worth sharing.'}
          </p>
        </div>

        {/* Global Batch Actions (Download All ZIP) */}
        {completedClips.length > 1 && session.sessionId && (
          <div className="flex items-center gap-2 shrink-0">
            <a
              id="btn-download-all-zip"
              href={`/api/clips/download-all/${session.sessionId}`}
              download={`cliprush_clips_${session.sessionId}.zip`}
              className="ws-btn-secondary py-1.5 px-3 text-xs gap-1.5 cursor-pointer font-medium"
              title="Download all completed clips as a single ZIP archive"
            >
              <Archive className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
              <span>Download All ZIP ({completedClips.length})</span>
            </a>
          </div>
        )}
      </div>

      {/* Output Destination Banner (Quiet, functional directory bar) */}
      <div className="ws-well p-3 rounded-lg border border-[var(--border-default)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Folder className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
          <span className="text-[var(--text-muted)] font-medium shrink-0">Output Folder:</span>
          <span
            className="font-mono text-[11px] text-[var(--text-primary)] truncate max-w-md select-all"
            title={session.outputDir || 'outputs/session/clips'}
          >
            {session.outputDir || 'outputs/session/clips'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={() => handleCopyText(session.outputDir || '', 'output-dir')}
            className="text-[11px] text-[var(--brand-text)] hover:underline flex items-center gap-1 font-medium cursor-pointer"
          >
            {copiedField === 'output-dir' ? (
              <span className="text-[var(--success-text)] flex items-center gap-1 font-semibold">
                <Check className="w-3 h-3" /> Copied Folder Path
              </span>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy Path</span>
              </>
            )}
          </button>
          <span className="text-[var(--border-default)]">•</span>
          <span className="text-[11px] font-mono text-[var(--text-muted)]">
            1080×1920 (9:16 Vertical)
          </span>
        </div>
      </div>

      {/* 2. MEDIA WORKSPACE: HERO 9:16 PREVIEW (LEFT) & CLIP COLLECTION (RIGHT) */}
      {completedClips.length === 0 && failedClips.length === 0 ? (
        // Empty State: No clips generated yet
        <div className="ws-panel p-12 text-center rounded-xl border border-[var(--border-default)] space-y-3">
          <Film className="w-10 h-10 text-[var(--text-muted)] mx-auto opacity-40" />
          <div className="text-sm font-bold text-[var(--text-primary)]">No Clips Available</div>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
            There are no rendered clips in this session yet. Complete the previous clip generation stage to review your results here.
          </p>
        </div>
      ) : isAllFailed ? (
        // All Failed State: Transparent error summary with retries
        <div className="ws-panel p-6 rounded-xl border border-[var(--error-border)] bg-[var(--error-subtle)]/30 space-y-4">
          <div className="flex items-center gap-2.5 text-[var(--error-text)]">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div className="font-bold text-sm">All Clip Rendering Tasks Failed</div>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            None of the clips could be encoded into vertical video. Check the specific errors below and trigger a retry.
          </p>
          <div className="divide-y divide-[var(--border-default)] border border-[var(--border-default)] rounded-lg bg-[var(--surface-primary)] overflow-hidden">
            {failedClips.map((job) => (
              <div key={job.clipId} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-[var(--text-primary)] truncate">{job.title}</div>
                  <div className="text-[11px] font-mono text-[var(--error-text)] mt-0.5 truncate">
                    {job.error || 'Encoding process failed'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRetry(job.clipId)}
                  disabled={retryingClipId === job.clipId}
                  className="ws-btn-destructive py-1.5 px-3 text-xs gap-1.5 shrink-0 cursor-pointer"
                >
                  {retryingClipId === job.clipId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="w-3.5 h-3.5" />
                  )}
                  <span>Retry Clip</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Standard Media Workspace Layout
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT / MAIN HERO AREA: LARGE 9:16 RENDERED VIDEO STAGE */}
          <div className="lg:col-span-6 xl:col-span-6 space-y-3 lg:sticky lg:top-4">
            <div className="ws-panel p-4 rounded-xl border border-[var(--border-default)] space-y-3.5 shadow-xs">
              {/* Hero Top Bar: Active Clip Navigation & Title */}
              <div className="flex items-center justify-between gap-2 text-xs border-b border-[var(--border-subtle)] pb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Sequence Counter (e.g. 01 / 08) */}
                  {completedClips.length > 0 && currentCompletedIndex >= 0 && (
                    <span className="font-mono text-xs font-bold text-[var(--brand-text)] bg-[var(--brand-subtle)] px-2 py-0.5 rounded border border-[var(--brand-border)] shrink-0">
                      {String(currentCompletedIndex + 1).padStart(2, '0')} /{' '}
                      {String(completedClips.length).padStart(2, '0')}
                    </span>
                  )}
                  <span className="font-bold text-[var(--text-primary)] truncate" title={activePreviewClip?.title}>
                    {activePreviewClip?.title || '9:16 Vertical Player'}
                  </span>
                </div>

                {/* Quick Prev / Next Clip Navigator */}
                {completedClips.length > 1 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handlePrevClip}
                      disabled={currentCompletedIndex <= 0}
                      aria-label="Previous clip"
                      title="Previous clip"
                      className="p-1 rounded hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--text-secondary)] transition cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextClip}
                      disabled={currentCompletedIndex >= completedClips.length - 1}
                      aria-label="Next clip"
                      title="Next clip"
                      className="p-1 rounded hover:bg-[var(--surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--text-secondary)] transition cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* 9:16 Video Player Container (Hero Visual Object) */}
              <div className="rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[500px] mx-auto border border-[var(--border-default)] relative shadow-inner flex items-center justify-center">
                {activePreviewClip && activePreviewClip.status === 'completed' ? (
                  <video
                    id="active-vertical-video-player"
                    key={activePreviewClip.clipId}
                    controls
                    playsInline
                    className="w-full h-full object-contain ws-video-stage"
                    src={`/api/media/clip-stream/${session.sessionId}/${activePreviewClip.clipId}`}
                  />
                ) : (
                  <div className="p-6 text-center text-[var(--text-muted)] text-xs space-y-2">
                    <Play className="w-8 h-8 mx-auto opacity-40 text-[var(--text-muted)]" />
                    <div>Select a completed clip from the right to preview</div>
                  </div>
                )}
              </div>

              {/* Action Hierarchy: Primary, Secondary, Utility */}
              {activePreviewClip && activePreviewClip.status === 'completed' && (
                <div className="space-y-2.5 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* PRIMARY ACTION: Download MP4 file */}
                    <a
                      id={`btn-download-clip-${activePreviewClip.clipId}`}
                      href={`/api/clips/download/${session.sessionId}/${activePreviewClip.clipId}`}
                      download={activePreviewClip.outputFilename || `cliprush_${activePreviewClip.clipId}.mp4`}
                      className="ws-btn-primary py-2 px-3.5 text-xs font-semibold gap-2 shadow-xs cursor-pointer text-center flex items-center justify-center"
                      title="Download this high-definition vertical MP4 clip"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download MP4</span>
                    </a>

                    {/* SECONDARY ACTION: Show Social Post & Details Modal */}
                    <button
                      id={`btn-show-details-${activePreviewClip.clipId}`}
                      type="button"
                      onClick={() => setDetailsModalClip(activePreviewClip)}
                      className="ws-btn-secondary py-2 px-3.5 text-xs font-semibold gap-2 cursor-pointer flex items-center justify-center text-[var(--brand-text)]"
                      title="Open social copy, hashtags, and description ready for posting"
                    >
                      <Share2 className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                      <span>Social Post & Metadata</span>
                    </button>
                  </div>

                  {/* UTILITY ACTION ROW: Copy Path & Details */}
                  {activeMeta && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--border-subtle)]">
                      <button
                        type="button"
                        onClick={() => handleCopyText(activeMeta.fullPath, 'active-filepath')}
                        className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition font-mono cursor-pointer"
                        title="Copy full local file path to clipboard"
                      >
                        {copiedField === 'active-filepath' ? (
                          <span className="text-[var(--success-text)] flex items-center gap-1 font-semibold">
                            <Check className="w-3 h-3" /> Copied File Path!
                          </span>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-[var(--brand-primary)]" />
                            <span>Copy File Path</span>
                          </>
                        )}
                      </button>

                      <span className="text-[11px] font-mono text-[var(--text-muted)] truncate max-w-[200px]" title={activePreviewClip.outputFilename}>
                        {activePreviewClip.outputFilename}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Visually Quiet Technical Metadata Footer */}
              {activePreviewClip && activePreviewClip.status === 'completed' && (
                <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[var(--text-muted)]">
                  <span>
                    {formatSecondsToTimestamp(activePreviewClip.startSec)} →{' '}
                    {formatSecondsToTimestamp(activePreviewClip.endSec)} ({activePreviewClip.durationSec}s)
                  </span>
                  <div className="flex items-center gap-2">
                    {activePreviewClip.formattedSize && (
                      <span>{activePreviewClip.formattedSize}</span>
                    )}
                    {activePreviewClip.renderTimeMs && (
                      <>
                        <span>•</span>
                        <span>{(activePreviewClip.renderTimeMs / 1000).toFixed(1)}s render</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT / SECONDARY AREA: COMPACT MEDIA COLLECTION & FAILED ITEMS */}
          <div className="lg:col-span-6 xl:col-span-6 space-y-4">
            {/* Completed Clips Collection */}
            <div className="ws-panel rounded-xl border border-[var(--border-default)] overflow-hidden shadow-xs">
              <div className="p-3.5 border-b border-[var(--border-default)] flex items-center justify-between">
                <div className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                  <Film className="w-4 h-4 text-[var(--brand-primary)]" />
                  <span>Clips Collection</span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] font-mono">
                  {completedClips.length} {completedClips.length === 1 ? 'Clip' : 'Clips'} Available
                </div>
              </div>

              {/* Clips List */}
              <div className="divide-y divide-[var(--border-default)] max-h-[580px] overflow-y-auto">
                {completedClips.map((clip, index) => {
                  const isSelected = activePreviewClip?.clipId === clip.clipId;
                  const meta = getClipMetadata(clip);

                  return (
                    <div
                      key={clip.clipId}
                      id={`result-clip-card-${clip.clipId}`}
                      onClick={() => setActivePreviewClip(clip)}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--brand-subtle)]/40 ring-1 ring-inset ring-[var(--brand-primary)]'
                          : 'hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Number Badge (e.g. 01) */}
                        <div
                          className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs font-mono shrink-0 mt-0.5 ${
                            isSelected
                              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                              : 'bg-[var(--brand-subtle)] text-[var(--brand-text)] border border-[var(--brand-border)]'
                          }`}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2">
                            <span className="truncate">{clip.title}</span>
                            <span className="font-mono text-[11px] font-medium text-[var(--brand-text)] shrink-0">
                              {clip.durationSec}s
                            </span>
                          </div>

                          {clip.description && (
                            <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                              {clip.description}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[var(--text-muted)] pt-0.5">
                            <span>
                              {formatSecondsToTimestamp(clip.startSec)} → {formatSecondsToTimestamp(clip.endSec)}
                            </span>
                            {clip.formattedSize && (
                              <>
                                <span>•</span>
                                <span>{clip.formattedSize}</span>
                              </>
                            )}
                          </div>

                          {/* Hashtag summary chips */}
                          {meta.hashtags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              {meta.hashtags.slice(0, 3).map((h, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border-subtle)] font-mono"
                                >
                                  {h.startsWith('#') ? h : `#${h}`}
                                </span>
                              ))}
                              {meta.hashtags.length > 3 && (
                                <span className="text-[10px] text-[var(--text-muted)]">
                                  +{meta.hashtags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Action Controls */}
                      <div
                        className="flex items-center gap-2 self-end sm:self-center shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setActivePreviewClip(clip)}
                          className={`py-1.5 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                              : 'ws-btn-secondary text-[var(--text-secondary)]'
                          }`}
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{isSelected ? 'Active' : 'Preview'}</span>
                        </button>

                        <button
                          id={`btn-show-details-${clip.clipId}`}
                          type="button"
                          onClick={() => setDetailsModalClip(clip)}
                          className="ws-btn-secondary py-1.5 px-2.5 text-xs text-[var(--brand-text)] font-semibold cursor-pointer"
                          title="View copyable social description and hashtags"
                        >
                          <Info className="w-3 h-3" />
                          <span className="hidden sm:inline">Details</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Background Rendering Status Notification */}
            {processingClips.length > 0 && (
              <div className="p-3 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-subtle)]/40 flex items-center gap-2.5 text-xs text-[var(--warning-text)]">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>
                  {processingClips.length} {processingClips.length === 1 ? 'clip is' : 'clips are'} currently rendering in the background...
                </span>
              </div>
            )}

            {/* FAILED CLIPS SECTION (Distinct, actionable, non-dominating) */}
            {failedClips.length > 0 && (
              <div className="ws-panel rounded-xl border border-[var(--error-border)] overflow-hidden shadow-xs">
                <div className="p-3.5 border-b border-[var(--error-border)] bg-[var(--error-subtle)]/30 flex items-center justify-between">
                  <div className="text-xs font-bold text-[var(--error-text)] uppercase tracking-wider flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <span>Failed Moments ({failedClips.length})</span>
                  </div>
                  <div className="text-[11px] text-[var(--error-text)]/80 font-mono">
                    Can be retried individually
                  </div>
                </div>

                <div className="divide-y divide-[var(--border-default)]">
                  {failedClips.map((job) => (
                    <div
                      key={job.clipId}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-[var(--surface-primary)]"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-[var(--text-primary)] truncate">
                          {job.title}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono">
                          {formatSecondsToTimestamp(job.startSec)} → {formatSecondsToTimestamp(job.endSec)} ({job.durationSec}s)
                        </div>
                        <div className="text-[11px] font-mono text-[var(--error-text)] truncate pt-0.5">
                          Reason: {job.error || 'FFmpeg encoding error'}
                        </div>
                      </div>

                      <button
                        id={`btn-retry-clip-${job.clipId}`}
                        type="button"
                        onClick={() => handleRetry(job.clipId)}
                        disabled={retryingClipId === job.clipId}
                        className="ws-btn-destructive py-1.5 px-3 text-xs gap-1.5 shrink-0 self-end sm:self-center cursor-pointer"
                      >
                        {retryingClipId === job.clipId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCw className="w-3.5 h-3.5" />
                        )}
                        <span>Retry</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. SHOW DETAILS MODAL (SOCIAL POST & METADATA READY FOR SHARING) */}
      {detailsModalClip && modalMeta && (
        <div
          id="clip-details-modal-backdrop"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setDetailsModalClip(null)}
        >
          <div
            id="clip-details-modal-dialog"
            className="ws-panel max-w-2xl w-full p-6 shadow-xl space-y-5 my-8 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-primary)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-[var(--brand-subtle)] text-[var(--brand-primary)] flex items-center justify-center font-bold text-xs shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                    Clip Details & Social Metadata
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Ready to copy for TikTok, Instagram Reels, and YouTube Shorts.
                  </p>
                </div>
              </div>

              <button
                id="btn-close-details-modal"
                type="button"
                onClick={() => setDetailsModalClip(null)}
                className="ws-btn-secondary p-1.5 cursor-pointer rounded-md"
                aria-label="Close details modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick One-Click Full Social Post Copy */}
            <div className="ws-section p-3 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-subtle)]/30 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[var(--text-primary)] flex items-center gap-1.5 font-semibold">
                <Share2 className="w-4 h-4 text-[var(--brand-primary)]" />
                <span>Complete Social Post Bundle:</span>
              </div>

              <button
                id="btn-copy-full-social-post"
                type="button"
                onClick={() => {
                  const postContent = `${detailsModalClip.title}\n\n${detailsModalClip.description}\n\n${modalMeta.formattedHashtags}`;
                  handleCopyText(postContent, 'full-post');
                }}
                className="ws-btn-primary py-1.5 px-3 text-xs font-semibold gap-1.5 cursor-pointer shadow-xs"
              >
                {copiedField === 'full-post' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied Full Post!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Post (Title + Desc + Tags)</span>
                  </>
                )}
              </button>
            </div>

            {/* Field 1: Title */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--text-primary)]">Clip Title</span>
                <button
                  type="button"
                  onClick={() => handleCopyText(detailsModalClip.title, 'title')}
                  className="text-xs text-[var(--brand-text)] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                >
                  {copiedField === 'title' ? (
                    <span className="text-[var(--success-text)] flex items-center gap-1 font-semibold">
                      <Check className="w-3 h-3" /> Copied Title
                    </span>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy Title
                    </>
                  )}
                </button>
              </div>
              <div className="ws-well p-3 text-xs font-semibold text-[var(--text-primary)] rounded-md select-text">
                {detailsModalClip.title}
              </div>
            </div>

            {/* Field 2: Timestamps, Duration & File Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="ws-well p-3 rounded-md space-y-1">
                <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 font-medium">
                  <Clock className="w-3 h-3 text-[var(--brand-primary)]" /> Timeline & Duration
                </div>
                <div className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                  {formatSecondsToTimestamp(detailsModalClip.startSec)} → {formatSecondsToTimestamp(detailsModalClip.endSec)} ({detailsModalClip.durationSec}s)
                </div>
              </div>

              <div className="ws-well p-3 rounded-md space-y-1">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium">
                  <span className="flex items-center gap-1">
                    <Folder className="w-3 h-3 text-[var(--brand-primary)]" /> Output File
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(modalMeta.fullPath, 'filepath')}
                    className="text-[11px] text-[var(--brand-text)] hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    {copiedField === 'filepath' ? (
                      <span className="text-[var(--success-text)] flex items-center gap-0.5 font-semibold">
                        <Check className="w-2.5 h-2.5" /> Copied
                      </span>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5" /> Copy Path
                      </>
                    )}
                  </button>
                </div>
                <div className="text-xs font-mono font-semibold text-[var(--brand-text)] truncate" title={modalMeta.fullPath}>
                  {detailsModalClip.outputFilename || 'Completed clip'}
                </div>
              </div>
            </div>

            {/* Field 3: Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--text-primary)]">Description</span>
                <button
                  type="button"
                  onClick={() => handleCopyText(detailsModalClip.description, 'description')}
                  className="text-xs text-[var(--brand-text)] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                >
                  {copiedField === 'description' ? (
                    <span className="text-[var(--success-text)] flex items-center gap-1 font-semibold">
                      <Check className="w-3 h-3" /> Copied Description
                    </span>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy Description
                    </>
                  )}
                </button>
              </div>
              <div className="ws-well p-3 text-xs text-[var(--text-primary)] rounded-md leading-relaxed whitespace-pre-wrap select-text">
                {detailsModalClip.description || 'No description provided.'}
              </div>
            </div>

            {/* Field 4: Hashtags */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5 text-[var(--brand-primary)]" /> Hashtags
                </span>
                {modalMeta.hashtags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(modalMeta.formattedHashtags, 'hashtags')}
                    className="text-xs text-[var(--brand-text)] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                  >
                    {copiedField === 'hashtags' ? (
                      <span className="text-[var(--success-text)] flex items-center gap-1 font-semibold">
                        <Check className="w-3 h-3" /> Copied Hashtags
                      </span>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy All Hashtags
                      </>
                    )}
                  </button>
                )}
              </div>

              {modalMeta.hashtags.length > 0 ? (
                <div className="ws-well p-3 rounded-md flex flex-wrap gap-1.5">
                  {modalMeta.hashtags.map((tag, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleCopyText(tag.startsWith('#') ? tag : `#${tag}`, `tag-${idx}`)}
                      className="px-2.5 py-1 text-xs font-mono rounded bg-[var(--brand-subtle)] hover:bg-[var(--surface-hover)] text-[var(--brand-text)] border border-[var(--brand-border)] transition flex items-center gap-1 cursor-pointer"
                      title="Click to copy single hashtag"
                    >
                      <span>{tag.startsWith('#') ? tag : `#${tag}`}</span>
                      {copiedField === `tag-${idx}` && <Check className="w-2.5 h-2.5 text-[var(--success-solid)]" />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="ws-well p-3 rounded-md text-xs text-[var(--text-muted)]">
                  No hashtags specified in the highlight response.
                </div>
              )}
            </div>

            {/* Field 5: Keywords */}
            {modalMeta.keywords.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-[var(--brand-primary)]" /> Keywords
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(modalMeta.keywords.join(', '), 'keywords')}
                    className="text-xs text-[var(--brand-text)] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                  >
                    {copiedField === 'keywords' ? (
                      <span className="text-[var(--success-text)] flex items-center gap-1 font-semibold">
                        <Check className="w-3 h-3" /> Copied Keywords
                      </span>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy Keywords
                      </>
                    )}
                  </button>
                </div>
                <div className="ws-well p-3 rounded-md flex flex-wrap gap-1.5">
                  {modalMeta.keywords.map((kw, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 text-xs rounded bg-[var(--surface-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="border-t border-[var(--border-default)] pt-3.5 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailsModalClip(null)}
                className="ws-btn-secondary py-1.5 px-4 text-xs font-semibold cursor-pointer rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

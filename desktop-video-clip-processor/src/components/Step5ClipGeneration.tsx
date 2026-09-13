import React from 'react';
import {
  Scissors,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  XCircle,
  ArrowRight,
  Loader2,
  Film,
  Sparkles,
} from 'lucide-react';
import { ProjectSession, CaptionConfig, DEFAULT_CAPTION_CONFIG } from '../types';
import { getCaptionPreset } from '../caption/captionPresets';
import { formatSecondsToTimestamp } from '../utils/timestamps';

interface Step5ClipGenerationProps {
  session: ProjectSession;
  onRetryClip: (clipId: string | number) => void;
  onCancelGeneration: () => void;
  onProceedToResults: () => void;
  onUpdateCaptionConfig?: (config: CaptionConfig) => Promise<void> | void;
}

export const Step5ClipGeneration: React.FC<Step5ClipGenerationProps> = ({
  session,
  onRetryClip,
  onCancelGeneration,
  onProceedToResults,
}) => {
  const captionConfig = session?.captionConfig || DEFAULT_CAPTION_CONFIG;
  const currentPreset = getCaptionPreset(captionConfig.preset);

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
  const waitingCount = clipGenProgress.waitingCount || 0;
  const currentClipIndex = clipGenProgress.currentClipIndex || 0;
  const percentComplete = Math.round((completedCount / totalClips) * 100);

  const isAllComplete = completedCount === totalClips && totalClips > 0;
  const hasSomeCompleted = completedCount > 0;

  return (
    <div id="step-5-clip-generation-container" className="max-w-5xl mx-auto space-y-5">
      {/* Error Alert */}
      {clipGenError && (
        <div id="clip-generation-error-alert" className="ws-alert-error p-3.5 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-4 h-4 text-[var(--error-solid)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-xs">Clip Rendering Error:</div>
            <div className="text-xs mt-1 font-mono break-words">
              {clipGenError}
            </div>
          </div>
        </div>
      )}

      {/* Header & Status Card */}
      <div className="ws-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold ws-title">
                Stage 4: Clip Generation
              </h2>
              <p className="text-xs ws-muted mt-0.5">
                Extracting clips from the original video with selected framing and caption style.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Informational applied configuration display — Stage 4 does not reopen config modal */}
            <div
              id="stage4-caption-status-info"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-default)] text-xs text-[var(--text-secondary)] select-none"
              title="Applied framing and caption configuration"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
              <span className="font-semibold text-[var(--text-primary)]">
                {captionConfig.aspectRatio === 'original' ? 'Original' : captionConfig.aspectRatio}
              </span>
              <span className="text-[var(--text-muted)]">•</span>
              <span className="font-medium text-[var(--text-primary)]">
                {session?.framingConfig?.mode === 'dynamic_face_tracking'
                  ? 'Dynamic Face Tracking'
                  : session?.framingConfig?.mode === 'face_tracking'
                  ? 'Horizontal Face Tracking'
                  : 'Crop'}
              </span>
              <span className="text-[var(--text-muted)]">•</span>
              <span>{currentPreset.name}</span>
              <span className="text-[var(--text-muted)]">•</span>
              <span className={captionConfig.enabled !== false ? 'text-[var(--success-text)] font-medium' : 'ws-muted'}>
                {captionConfig.enabled !== false ? 'Captions Enabled' : 'Captions Disabled'}
              </span>
            </div>

            {isGeneratingClips && (
              <button
                id="btn-cancel-clip-generation"
                type="button"
                onClick={onCancelGeneration}
                className="ws-btn-destructive"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel Rendering</span>
              </button>
            )}

            {hasSomeCompleted && (
              <button
                id="btn-proceed-results-view"
                type="button"
                onClick={onProceedToResults}
                className="ws-btn-primary"
              >
                <span>Proceed to Results ({completedCount} Ready)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold ws-title flex items-center gap-1.5">
              {isGeneratingClips && <Loader2 className="w-3.5 h-3.5 text-[var(--brand-primary)] animate-spin" />}
              {isAllComplete
                ? 'All clips generated successfully!'
                : isGeneratingClips
                ? `Rendering Clip ${currentClipIndex} of ${totalClips}...`
                : 'Rendering queue ready'}
            </span>
            <span className="font-mono text-[var(--brand-text)] font-bold">
              {completedCount} / {totalClips} clips ({percentComplete}%)
            </span>
          </div>

          <div className="w-full h-2.5 bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-full overflow-hidden">
            <div
              id="clip-generation-progress-bar"
              className="h-full bg-[var(--brand-primary)] transition-all duration-300 rounded-full"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>

        {/* Summary Metric Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="ws-well p-3 text-center">
            <div className="text-[11px] ws-muted font-medium">Total In Queue</div>
            <div className="text-base font-bold ws-title mt-0.5">{totalClips}</div>
          </div>

          <div className="ws-well p-3 text-center">
            <div className="text-[11px] text-[var(--success-text)] font-medium flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Completed
            </div>
            <div className="text-base font-bold text-[var(--success-text)] mt-0.5">{completedCount}</div>
          </div>

          <div className="ws-well p-3 text-center">
            <div className="text-[11px] text-[var(--warning-text)] font-medium flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" /> Waiting
            </div>
            <div className="text-base font-bold text-[var(--warning-text)] mt-0.5">{waitingCount}</div>
          </div>

          <div className="ws-well p-3 text-center">
            <div className="text-[11px] text-[var(--error-text)] font-medium flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" /> Failed
            </div>
            <div className="text-base font-bold text-[var(--error-text)] mt-0.5">{failedCount}</div>
          </div>
        </div>
      </div>

      {/* Sequential Clips Queue */}
      <div id="clip-render-queue" className="ws-panel overflow-hidden">
        <div className="p-3.5 border-b border-[var(--border-default)] flex items-center justify-between">
          <div className="text-xs font-bold ws-title flex items-center gap-2">
            <Film className="w-4 h-4 text-[var(--brand-primary)]" />
            <span>Sequential Clip Encoding Queue</span>
          </div>
          <div className="text-[11px] ws-muted">
            Format: <span className="font-mono text-[var(--brand-text)] font-medium">{captionConfig.aspectRatio.toUpperCase()} (H.264/AAC)</span>
          </div>
        </div>

        <div className="divide-y divide-[var(--border-default)] max-h-[500px] overflow-y-auto">
          {clipJobs.map((job, idx) => {
            const isProcessing = job.status === 'processing';
            const isDone = job.status === 'completed';
            const isFailed = job.status === 'failed';

            return (
              <div
                key={job.clipId}
                id={`clip-job-row-${job.clipId}`}
                className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                  isProcessing
                    ? 'bg-[var(--brand-subtle)]'
                    : isDone
                    ? 'hover:bg-[var(--surface-hover)]'
                    : isFailed
                    ? 'bg-[var(--error-subtle)]'
                    : 'opacity-70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold shrink-0 ${
                      isDone
                        ? 'bg-[var(--success-subtle)] text-[var(--success-text)] border border-[var(--success-border)]'
                        : isProcessing
                        ? 'bg-[var(--brand-primary)] text-white animate-pulse'
                        : isFailed
                        ? 'bg-[var(--error-subtle)] text-[var(--error-text)] border border-[var(--error-border)]'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-muted)]'
                    }`}
                  >
                    #{idx + 1}
                  </div>

                  <div>
                    <div className="text-xs font-semibold ws-title flex items-center gap-2">
                      <span>{job.title}</span>
                      <span className="text-[11px] font-mono text-[var(--brand-text)] font-normal">
                        ({job.durationSec}s)
                      </span>
                    </div>

                    <div className="text-[11px] ws-muted mt-0.5 flex flex-wrap items-center gap-3">
                      <span>Timeline: {formatSecondsToTimestamp(job.startSec)} – {formatSecondsToTimestamp(job.endSec)}</span>
                      {job.formattedSize && <span>File: {job.formattedSize}</span>}
                      {job.renderTimeMs && (
                        <span>Rendered in: {(job.renderTimeMs / 1000).toFixed(1)}s</span>
                      )}
                    </div>

                    {job.outputFilename && isDone && (
                      <div className="text-[11px] font-mono text-[var(--success-text)] mt-0.5">
                        Saved: {job.outputFilename}
                      </div>
                    )}

                    {job.error && (
                      <div className="text-xs text-[var(--error-text)] mt-1 font-mono">
                        Error: {job.error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  {isProcessing && (
                    <span className="ws-badge-brand flex items-center gap-1 text-[11px]">
                      <Loader2 className="w-3 h-3 animate-spin" /> Rendering {captionConfig.aspectRatio === 'original' ? 'Original' : captionConfig.aspectRatio}
                    </span>
                  )}

                  {isDone && (
                    <span className="ws-badge-success flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3 h-3" /> Complete
                    </span>
                  )}

                  {job.status === 'waiting' && (
                    <span className="ws-badge-neutral text-[11px]">
                      Waiting
                    </span>
                  )}

                  {isFailed && (
                    <button
                      id={`btn-retry-clip-${job.clipId}`}
                      type="button"
                      onClick={() => onRetryClip(job.clipId)}
                      className="ws-btn-destructive text-xs"
                    >
                      <RotateCw className="w-3 h-3" /> Retry Clip
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

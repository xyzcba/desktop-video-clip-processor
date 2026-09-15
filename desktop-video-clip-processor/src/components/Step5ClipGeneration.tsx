import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  XCircle,
  ArrowRight,
  Loader2,
  Film,
  Sparkles,
  Play,
  Folder,
  FileCheck,
  Zap,
  Sliders,
  ChevronDown,
  ChevronUp,
  Crop,
  Scan,
  Focus,
  Type,
  Palette,
  ExternalLink,
} from 'lucide-react';
import {
  ProjectSession,
  CaptionConfig,
  DEFAULT_CAPTION_CONFIG,
  ClipJob,
  FramingConfig,
  DEFAULT_FRAMING_CONFIG,
} from '../types';
import { getCaptionPreset, PRESET_LIST } from '../caption/captionPresets';
import { CaptionConfigModal } from './CaptionConfigModal';
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
  onUpdateCaptionConfig,
}) => {
  const captionConfig = session?.captionConfig || DEFAULT_CAPTION_CONFIG;
  const framingConfig = session?.framingConfig || DEFAULT_FRAMING_CONFIG;
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

  // Percentage reflects successfully completed clips
  const percentComplete = Math.min(100, Math.round((completedCount / totalClips) * 100));

  // Completion semantics
  const isFullyComplete = completedCount === totalClips && totalClips > 0 && failedCount === 0;
  const isPartialComplete =
    completedCount > 0 && failedCount > 0 && completedCount + failedCount === totalClips;
  const isAllFailed = failedCount === totalClips && totalClips > 0;
  const hasSomeCompleted = completedCount > 0;

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

  // Live timer for active render session: strictly reset to 0 whenever a new render begins
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const prevIsGenerating = useRef<boolean>(false);

  useEffect(() => {
    // When generation transitions from false to true, reset elapsed time
    if (!prevIsGenerating.current && isGeneratingClips) {
      setElapsedSeconds(0);
    }
    prevIsGenerating.current = isGeneratingClips;

    let timer: any;
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

  // Expandable compact creative controls state
  const [isCreativeExpanded, setIsCreativeExpanded] = useState(false);
  const [activeConfigTab, setActiveConfigTab] = useState<'framing' | 'captions' | 'style' | 'output'>('framing');
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  // Format framing mode name
  const framingLabel =
    framingConfig.mode === 'dynamic_face_tracking'
      ? 'Dynamic Face Tracking'
      : framingConfig.mode === 'face_tracking'
      ? 'Horizontal Face Tracking'
      : '9:16 Center Crop';

  // Handlers for compact creative adjustments
  const handleUpdateCaption = async (partial: Partial<CaptionConfig>) => {
    const updated: CaptionConfig = {
      ...captionConfig,
      ...partial,
    };
    if (onUpdateCaptionConfig) {
      await onUpdateCaptionConfig(updated);
    }
  };

  const handleUpdateFramingMode = async (mode: 'crop' | 'face_tracking' | 'dynamic_face_tracking') => {
    if (!session?.sessionId) return;
    const newFraming: FramingConfig = {
      ...framingConfig,
      mode,
    };
    try {
      await fetch('/api/framing/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          framingConfig: newFraming,
        }),
      });
    } catch (err) {
      console.error('Failed to update framing mode:', err);
    }
  };

  const handleUpdateAspectRatio = async (aspectRatio: '9:16' | '1:1' | '16:9' | 'original') => {
    await handleUpdateCaption({ aspectRatio });
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
              ? `All ${completedCount} vertical clips have been created and saved to your project directory.`
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

          {hasSomeCompleted && (
            <button
              id="btn-proceed-results-view"
              type="button"
              onClick={onProceedToResults}
              className="ws-btn-primary group py-2 px-5 text-xs font-semibold tracking-wide shadow-xs hover:shadow active:scale-[0.98] transition-all duration-150 cursor-pointer"
            >
              <span>CONTINUE TO RESULTS ({completedCount} READY)</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-1" />
            </button>
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

      {/* 2. CREATIVE CONFIGURATION STRIP & EXPANDABLE CONTROLS ACCORDION */}
      <div className="ws-well rounded-xl border border-[var(--border-default)] overflow-hidden">
        <div className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Selected Clips Summary & Applied Badges */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 font-mono">
              <Film className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
              <span className="font-bold text-[var(--text-primary)]">
                {totalClips} {totalClips === 1 ? 'MOMENT' : 'MOMENTS'} SELECTED
              </span>
            </div>

            <div className="hidden sm:block h-3 w-px bg-[var(--border-default)]" />

            {/* Applied Creative Format & Caption Badge */}
            <div
              id="stage4-caption-status-info"
              className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]"
              title="Applied framing and caption configuration"
            >
              <span className="font-semibold text-[var(--text-primary)]">
                {captionConfig.aspectRatio === 'original' ? 'Original' : captionConfig.aspectRatio} Vertical
              </span>
              <span className="text-[var(--text-muted)]">•</span>
              <span className="text-[var(--text-primary)] font-medium">{framingLabel}</span>
              <span className="text-[var(--text-muted)]">•</span>
              <span className="text-[var(--brand-text)] font-semibold">{currentPreset.name} Captions</span>
            </div>
          </div>

          {/* Toggle Creative Controls Button & Live Stopwatch */}
          <div className="flex items-center gap-2.5">
            {isGeneratingClips ? (
              <span className="flex items-center gap-1.5 text-[var(--brand-text)] font-bold text-xs font-mono">
                <Zap className="w-3.5 h-3.5 animate-pulse text-[var(--brand-primary)]" />
                <span>Elapsed: {formatSecondsToTimestamp(elapsedSeconds)}</span>
              </span>
            ) : session.outputDir ? (
              <span className="hidden md:flex items-center gap-1.5 text-xs font-mono text-[var(--text-muted)] truncate max-w-[200px]" title={session.outputDir}>
                <Folder className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
                <span className="truncate">{session.outputDir.split('/').pop() || 'Output'}</span>
              </span>
            ) : null}

            <button
              id="btn-toggle-creative-controls"
              type="button"
              onClick={() => setIsCreativeExpanded((prev) => !prev)}
              className="ws-btn-secondary py-1 px-2.5 text-xs gap-1.5 cursor-pointer font-medium"
            >
              <Sliders className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
              <span>Creative Controls</span>
              {isCreativeExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              )}
            </button>
          </div>
        </div>

        {/* Expandable Creative Configuration Accordion Area */}
        {isCreativeExpanded && (
          <div id="creative-controls-panel" className="p-4 border-t border-[var(--border-default)] bg-[var(--surface-sunken)]/60 space-y-4">
            {/* Tab Navigation: Framing, Captions, Style, Output */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] pb-2.5">
              <button
                type="button"
                onClick={() => setActiveConfigTab('framing')}
                className={`py-1 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeConfigTab === 'framing'
                    ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Crop className="w-3.5 h-3.5" />
                <span>Framing</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveConfigTab('captions')}
                className={`py-1 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeConfigTab === 'captions'
                    ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Captions</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveConfigTab('style')}
                className={`py-1 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeConfigTab === 'style'
                    ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Style & Effects</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveConfigTab('output')}
                className={`py-1 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeConfigTab === 'output'
                    ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Output</span>
              </button>

              <div className="ml-auto">
                <button
                  type="button"
                  onClick={() => setIsStudioOpen(true)}
                  className="text-xs text-[var(--brand-text)] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Full Caption Studio</span>
                </button>
              </div>
            </div>

            {/* TAB 1: FRAMING */}
            {activeConfigTab === 'framing' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                      Aspect Ratio
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['9:16', '1:1', '16:9'] as const).map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => handleUpdateAspectRatio(ratio)}
                          className={`py-1.5 px-2 rounded-md font-semibold text-xs border text-center transition-all cursor-pointer ${
                            captionConfig.aspectRatio === ratio
                              ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] shadow-xs'
                              : 'bg-[var(--surface-primary)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          {ratio === '9:16' ? '9:16 Vertical' : ratio === '1:1' ? '1:1 Square' : '16:9 Wide'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                      Tracking Mode
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateFramingMode('crop')}
                        className={`py-1.5 px-2 rounded-md font-semibold text-xs border text-center transition-all cursor-pointer ${
                          framingConfig.mode === 'crop'
                            ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] shadow-xs'
                            : 'bg-[var(--surface-primary)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        Center Crop
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateFramingMode('face_tracking')}
                        className={`py-1.5 px-2 rounded-md font-semibold text-xs border text-center transition-all cursor-pointer ${
                          framingConfig.mode === 'face_tracking'
                            ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] shadow-xs'
                            : 'bg-[var(--surface-primary)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        Horizontal Face
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateFramingMode('dynamic_face_tracking')}
                        className={`py-1.5 px-2 rounded-md font-semibold text-xs border text-center transition-all cursor-pointer ${
                          framingConfig.mode === 'dynamic_face_tracking'
                            ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] shadow-xs'
                            : 'bg-[var(--surface-primary)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        Dynamic 2D
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Controls how horizontal videos are framed vertically in 9:16. Dynamic tracking follows head movement with natural smooth zoom.
                </p>
              </div>
            )}

            {/* TAB 2: CAPTIONS */}
            {activeConfigTab === 'captions' && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Preset Choice */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                      Caption Style Preset
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PRESET_LIST.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            handleUpdateCaption({
                              preset: preset.id,
                              highlightWord: preset.highlightWord,
                            })
                          }
                          className={`py-1.5 px-2.5 rounded-md font-semibold text-xs border text-center transition-all cursor-pointer ${
                            captionConfig.preset === preset.id
                              ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] shadow-xs'
                              : 'bg-[var(--surface-primary)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Words Per Group */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                      Words Per Subtitle ({captionConfig.maxWordsPerGroup || 3})
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => handleUpdateCaption({ maxWordsPerGroup: count })}
                          className={`flex-1 py-1.5 rounded-md font-mono text-xs border text-center transition-all cursor-pointer ${
                            (captionConfig.maxWordsPerGroup || 3) === count
                              ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)] font-bold'
                              : 'bg-[var(--surface-primary)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Highlight Color */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                      Active Highlight Color
                    </label>
                    <div className="flex items-center gap-2">
                      {['#22c55e', '#facc15', '#06b6d4', '#ec4899', '#f97316'].map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => handleUpdateCaption({ highlightColor: color })}
                          style={{ backgroundColor: color }}
                          className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                            captionConfig.highlightColor === color
                              ? 'scale-110 ring-2 ring-[var(--brand-primary)] border-white'
                              : 'border-black/20 hover:scale-105'
                          }`}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: STYLE & EFFECTS */}
            {activeConfigTab === 'style' && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Font Choice */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                      Font Family
                    </label>
                    <select
                      value={captionConfig.textFont || 'Montserrat'}
                      onChange={(e) => handleUpdateCaption({ textFont: e.target.value })}
                      className="ws-input w-full py-1.5 text-xs bg-[var(--surface-primary)] cursor-pointer"
                    >
                      <option value="Montserrat">Montserrat (Standard Bold)</option>
                      <option value="Impact">Impact (Bold High Energy)</option>
                      <option value="Arial">Arial (Clean Modern)</option>
                      <option value="Komika Axis">Komika Axis (Punchy Creator)</option>
                    </select>
                  </div>

                  {/* Uppercase Toggle */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                      Letter Case
                    </label>
                    <button
                      type="button"
                      onClick={() => handleUpdateCaption({ textUppercase: !captionConfig.textUppercase })}
                      className={`w-full py-1.5 px-3 rounded-md font-semibold text-xs border transition-all cursor-pointer ${
                        captionConfig.textUppercase
                          ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]'
                          : 'bg-[var(--surface-primary)] text-[var(--text-secondary)] border-[var(--border-default)]'
                      }`}
                    >
                      {captionConfig.textUppercase ? 'ALL CAPS (RECOMMENDED)' : 'Mixed Case'}
                    </button>
                  </div>

                  {/* Highlight Animation */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                      Active Word Animation
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['pop', 'scale', 'none'] as const).map((anim) => (
                        <button
                          key={anim}
                          type="button"
                          onClick={() => handleUpdateCaption({ highlightAnimation: anim })}
                          className={`py-1.5 rounded-md font-semibold text-[11px] border capitalize text-center transition-all cursor-pointer ${
                            (captionConfig.highlightAnimation || 'pop') === anim
                              ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]'
                              : 'bg-[var(--surface-primary)] text-[var(--text-secondary)] border-[var(--border-default)]'
                          }`}
                        >
                          {anim}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: OUTPUT */}
            {activeConfigTab === 'output' && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 bg-[var(--surface-primary)] rounded-lg border border-[var(--border-default)] space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Target Encoding & Container
                    </div>
                    <div className="font-mono text-xs text-[var(--text-primary)] font-semibold">
                      MP4 (H.264 High Profile / AAC Audio 48kHz)
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Optimized for Instagram Reels, YouTube Shorts, and TikTok uploads.
                    </div>
                  </div>

                  <div className="p-3 bg-[var(--surface-primary)] rounded-lg border border-[var(--border-default)] space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Project Output Directory
                    </div>
                    <div className="font-mono text-xs text-[var(--text-primary)] truncate" title={session.outputDir}>
                      {session.outputDir || 'outputs/session/clips'}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Clips are saved locally in the project repository outputs directory.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isGeneratingClips && (
              <div className="text-[11px] text-[var(--brand-text)] flex items-center gap-1.5 pt-1">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Rendering is currently in progress. Updates to styling will apply to queued or retried clips.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. ACTIVE PROGRESS BAR & HONEST PRODUCTION METRICS */}
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
                : 'Production queue ready'}
            </span>
          </div>

          {/* Honest progress semantics: explicit successful counts and failure notice */}
          <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
            {failedCount > 0 ? (
              <span className="text-[var(--brand-text)]">
                {completedCount} / {totalClips} successful{' '}
                <span className="text-[var(--error-text)]">({failedCount} failed)</span>
              </span>
            ) : (
              <span className="text-[var(--brand-text)]">
                {completedCount} / {totalClips} successful ({percentComplete}%)
              </span>
            )}
          </span>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full h-2.5 bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-full overflow-hidden relative">
          <div
            id="clip-generation-progress-bar"
            className={`h-full rounded-full transition-all duration-300 ${
              isFullyComplete
                ? 'bg-[var(--success-solid)]'
                : isPartialComplete
                ? 'bg-[var(--warning-solid)]'
                : 'bg-[var(--brand-primary)]'
            }`}
            style={{ width: `${percentComplete}%` }}
          />
        </div>

        {/* Queue Metric Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="ws-well p-2.5 rounded-lg text-center border border-[var(--border-default)]">
            <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
              Total In Queue
            </div>
            <div className="text-sm font-bold text-[var(--text-primary)] font-mono mt-0.5">
              {totalClips}
            </div>
          </div>

          <div className="ws-well p-2.5 rounded-lg text-center border border-[var(--border-default)]">
            <div className="text-[10px] text-[var(--success-text)] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Completed
            </div>
            <div className="text-sm font-bold text-[var(--success-text)] font-mono mt-0.5">
              {completedCount}
            </div>
          </div>

          <div className="ws-well p-2.5 rounded-lg text-center border border-[var(--border-default)]">
            <div className="text-[10px] text-[var(--warning-text)] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" /> Waiting
            </div>
            <div className="text-sm font-bold text-[var(--warning-text)] font-mono mt-0.5">
              {waitingCount}
            </div>
          </div>

          <div className="ws-well p-2.5 rounded-lg text-center border border-[var(--border-default)]">
            <div className="text-[10px] text-[var(--error-text)] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" /> Failed
            </div>
            <div className="text-sm font-bold text-[var(--error-text)] font-mono mt-0.5">
              {failedCount}
            </div>
          </div>
        </div>
      </div>

      {/* 4. MAIN WORKSPACE: VERTICAL PREVIEW + SEQUENTIAL PRODUCTION QUEUE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: 9:16 Vertical Video Preview Player */}
        <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-4">
          <div className="ws-panel p-4 rounded-xl border border-[var(--border-default)] space-y-3 shadow-xs">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
              <div className="flex items-center gap-1.5 truncate">
                <Play className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
                <span className="truncate">
                  {activeClip
                    ? activeClip.status === 'completed'
                      ? `Finished Clip: ${activeClip.title}`
                      : `Source Video (${activeClip.title})`
                    : '9:16 Vertical Preview'}
                </span>
              </div>

              {activeClip && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold shrink-0 ${
                    activeClip.status === 'completed'
                      ? 'ws-badge-success'
                      : activeClip.status === 'processing'
                      ? 'ws-badge-brand'
                      : 'ws-badge-neutral'
                  }`}
                >
                  {activeClip.status === 'completed'
                    ? 'RENDERED 9:16 OUTPUT'
                    : activeClip.status === 'processing'
                    ? 'RENDERING NOW'
                    : 'SOURCE MOMENT PREVIEW'}
                </span>
              )}
            </div>

            {/* Realistic 9:16 Vertical Video Stage */}
            <div className="rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[480px] mx-auto border border-[var(--border-default)] relative shadow-inner flex items-center justify-center group">
              {activeClip?.status === 'completed' ? (
                // 1. Fully Rendered 9:16 Clip Playback
                <video
                  id="active-vertical-video-player"
                  key={`completed-${activeClip.clipId}`}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                  src={`/api/media/clip-stream/${session.sessionId}/${activeClip.clipId}`}
                />
              ) : session?.sessionId ? (
                // 2. Source Moment Player with Honest Guidance Banner
                <div className="relative w-full h-full flex items-center justify-center">
                  <video
                    ref={previewVideoRef}
                    key={`source-${session.sessionId}`}
                    src={`/api/media/stream/${session.sessionId}`}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover opacity-80"
                  />

                  {/* Active Rendering Overlay Badge */}
                  {activeClip?.status === 'processing' && (
                    <div className="absolute inset-0 bg-black/50 pointer-events-none flex flex-col items-center justify-center gap-2 p-4 text-center">
                      <div className="w-10 h-10 rounded-full bg-[var(--brand-primary)] text-white flex items-center justify-center shadow-lg animate-pulse">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                      <div className="text-white font-bold text-xs tracking-wide uppercase">
                        RENDERING VERTICAL 9:16
                      </div>
                      <div className="text-white/80 text-[11px] font-mono">
                        Applying {framingLabel} & {currentPreset.name} captions
                      </div>
                    </div>
                  )}

                  {/* Honest Source Preview Notice Overlay */}
                  <div className="absolute bottom-12 left-3 right-3 pointer-events-none text-center">
                    <span className="inline-block px-2.5 py-1 rounded bg-black/75 text-[var(--brand-light)] font-bold text-[10px] tracking-wide border border-white/10 backdrop-blur-xs">
                      SOURCE MOMENT PREVIEW (CROP & CAPTIONS APPLY IN FINAL RENDER)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-[var(--text-muted)] text-xs">
                  <Play className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Select a clip to preview
                </div>
              )}
            </div>

            {/* Active Clip Timing Information & Truthful Render Status */}
            {activeClip && (
              <div className="p-3 ws-well rounded-lg text-xs space-y-1.5 border border-[var(--border-default)]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[var(--text-primary)] truncate">
                    #{clipJobs.findIndex((j) => j.clipId === activeClip.clipId) + 1} • {activeClip.title}
                  </span>
                  <span className="font-mono text-[var(--brand-text)] font-bold">
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
                {activeClip.outputFilename && activeClip.status === 'completed' ? (
                  <div className="text-[11px] font-mono text-[var(--success-text)] flex items-center gap-1 truncate pt-0.5">
                    <FileCheck className="w-3 h-3 shrink-0" />
                    <span className="truncate">{activeClip.outputFilename}</span>
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
                        : isProcessing
                        ? 'bg-[var(--brand-subtle)]/25'
                        : isDone
                        ? 'hover:bg-[var(--surface-hover)]'
                        : isFailed
                        ? 'bg-[var(--error-subtle)]'
                        : 'opacity-75 hover:opacity-100 hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Sequence Badge */}
                      <div
                        className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
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

                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2">
                          <span className="truncate">{job.title}</span>
                          <span className="text-[11px] font-mono text-[var(--brand-text)] font-medium shrink-0">
                            {job.durationSec}s
                          </span>
                        </div>

                        <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap items-center gap-2 font-mono">
                          <span>
                            {formatSecondsToTimestamp(job.startSec)} → {formatSecondsToTimestamp(job.endSec)}
                          </span>
                          {job.formattedSize && (
                            <>
                              <span>•</span>
                              <span>{job.formattedSize}</span>
                            </>
                          )}
                          {job.renderTimeMs && (
                            <>
                              <span>•</span>
                              <span>{(job.renderTimeMs / 1000).toFixed(1)}s render</span>
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
                        <span className="ws-badge-success flex items-center gap-1 text-[11px] py-1 px-2.5">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Ready</span>
                        </span>
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

          {/* Bottom Confirmation & Continuation Bar */}
          <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] self-start sm:self-center">
              {isFullyComplete ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[var(--success-text)] shrink-0" />
                  <span>
                    All <strong>{completedCount}</strong> vertical clips are ready for playback and export.
                  </span>
                </>
              ) : isPartialComplete ? (
                <>
                  <AlertCircle className="w-4 h-4 text-[var(--warning-text)] shrink-0" />
                  <span>
                    <strong>{completedCount}</strong> clips succeeded and <strong>{failedCount}</strong> failed. You can continue with ready clips or retry failed ones.
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[var(--brand-primary)] shrink-0" />
                  <span>
                    {hasSomeCompleted
                      ? `${completedCount} of ${totalClips} clips ready. You can proceed now or wait for the full queue.`
                      : 'Rendering your clips sequentially to preserve CPU performance.'}
                  </span>
                </>
              )}
            </div>

            {hasSomeCompleted && (
              <button
                id="btn-proceed-results-view-bottom"
                type="button"
                onClick={onProceedToResults}
                className="ws-btn-primary group py-2 px-6 text-xs font-semibold tracking-wide shadow-xs hover:shadow active:scale-[0.98] transition-all duration-150 cursor-pointer w-full sm:w-auto text-center"
              >
                <span>CONTINUE TO RESULTS ({completedCount} READY)</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-1" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full Caption & Framing Studio Modal */}
      {isStudioOpen && (
        <CaptionConfigModal
          isOpen={isStudioOpen}
          onClose={() => setIsStudioOpen(false)}
          config={captionConfig}
          framingConfig={framingConfig}
          videoSrc={session.video ? `/api/media/stream/${session.sessionId}` : undefined}
          sourceVideoWidth={session.video?.width}
          sourceVideoHeight={session.video?.height}
          onSave={async (savedCfg, savedFraming) => {
            if (onUpdateCaptionConfig) await onUpdateCaptionConfig(savedCfg);
            if (savedFraming && session?.sessionId) {
              await fetch('/api/framing/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId: session.sessionId,
                  framingConfig: savedFraming,
                }),
              });
            }
          }}
          clipCount={totalClips}
        />
      )}
    </div>
  );
};

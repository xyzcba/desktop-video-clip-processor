import React, { useState, useEffect } from 'react';
import {
  Mic,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  XCircle,
  ArrowRight,
  Loader2,
  FileText,
  Search,
  Play,
  Volume2,
  Info,
} from 'lucide-react';
import { ProjectSession } from '../types';
import { formatDurationHuman } from '../utils/timestamps';

interface Step2AudioWhisperProps {
  session: ProjectSession;
  onRetryTranscription?: () => void;
  onCancelTranscription: () => void;
  onProceedToViralJson: () => void;
}

export const Step2AudioWhisper: React.FC<Step2AudioWhisperProps> = ({
  session,
  onRetryTranscription,
  onCancelTranscription,
  onProceedToViralJson,
}) => {
  const isTranscribing = Boolean(session?.isTranscribing);
  const progress = session?.transcriptionProgress || {
    status: isTranscribing ? 'transcribing' : 'idle',
    elapsedSec: 0,
    totalDurationSec: session?.video?.durationSec || 0,
    segmentsCount: 0,
    message: '',
  };

  const status = progress.status || (isTranscribing ? 'transcribing' : 'idle');
  const transcriptionError = session?.transcriptionError || (status === 'failed' ? progress.message : null);
  const masterTranscript = session?.masterTranscript;
  const isCompleted = status === 'completed' || Boolean(masterTranscript && masterTranscript.items && masterTranscript.items.length > 0);
  const hasFailed = status === 'failed' || Boolean(transcriptionError && !isTranscribing);

  // Live client-side elapsed timer ticker during active transcription
  const [liveElapsedSec, setLiveElapsedSec] = useState<number>(progress.elapsedSec || 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeVideoSeekTime, setActiveVideoSeekTime] = useState<number | null>(null);

  // SRT is the default format
  const [formatMode, setFormatMode] = useState<'srt' | 'compact'>('srt');

  useEffect(() => {
    if (progress.elapsedSec) {
      setLiveElapsedSec(progress.elapsedSec);
    }
  }, [progress.elapsedSec]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTranscribing) {
      interval = setInterval(() => {
        setLiveElapsedSec((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTranscribing]);

  const totalDurationSec = session?.video?.durationSec || progress.totalDurationSec || 0;
  const items = masterTranscript?.items || [];

  const filteredItems = searchQuery.trim()
    ? items.filter((item) =>
        item.text.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items;

  const handleSeekVideo = (seconds: number) => {
    setActiveVideoSeekTime(seconds);
    const videoEl = document.getElementById('transcript-video-player') as HTMLVideoElement;
    if (videoEl) {
      videoEl.currentTime = seconds;
      videoEl.play().catch(() => {});
    }
  };

  // Format SRT timestamp with milliseconds (00:00:00,000)
  const formatSrtTime = (sec: number) => {
    const ms = Math.round((sec % 1) * 1000);
    const totalSec = Math.floor(sec);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  return (
    <div id="step-2-transcription-container" className="max-w-5xl mx-auto space-y-5">
      {/* Transcription Failure Alert */}
      {hasFailed && transcriptionError && (
        <div id="transcription-pipeline-error-alert" className="ws-alert-error p-3.5 flex items-start justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-[var(--error-solid)] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-xs">Audio Extraction / Transcription Error:</div>
              <div className="text-xs mt-1 font-mono break-words">
                {transcriptionError}
              </div>
              <div className="text-[11px] ws-muted mt-1.5">
                Verify that your video contains an audible sound track. You can retry the transcription below.
              </div>
            </div>
          </div>

          {onRetryTranscription && (
            <button
              id="btn-retry-transcription"
              type="button"
              onClick={onRetryTranscription}
              className="ws-btn-destructive shrink-0 text-xs"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* Main Stage Header */}
      <div className="ws-panel p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Mic className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              {/* 1. Stage Title */}
              <h2 className="text-lg font-bold ws-title leading-tight">
                Stage 2: Transcription
              </h2>
              {/* 2. One clear, readable explanatory sentence */}
              <p className="text-sm ws-subtitle leading-relaxed max-w-2xl">
                Extract audio and generate timestamped subtitles completely on your computer.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {isCompleted && (
              <button
                id="btn-proceed-viral-json"
                type="button"
                onClick={onProceedToViralJson}
                className="ws-btn-primary"
              >
                <span>Proceed to Stage 3</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 3, 4, 5: ACTIVE TRANSCRIPTION INFORMATION & HIERARCHY */}
        {isTranscribing && (
          <div
            id="transcription-active-panel"
            className="mt-4 p-5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-subtle)] space-y-4"
          >
            {/* Header: Status & Operation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Loader2 className="w-5 h-5 text-[var(--brand-primary)] animate-spin shrink-0" />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold ws-title">
                      Transcribing Video
                    </h3>
                    <span className="ws-badge-brand text-[10px]">Processing</span>
                  </div>
                  <div className="text-xs text-[var(--brand-text)] font-medium">
                    {status === 'extracting_audio'
                      ? 'Extracting Audio Track with FFmpeg...'
                      : (progress.message || 'Transcribing speech with local Whisper model...')}
                  </div>
                </div>
              </div>

              <button
                id="btn-cancel-transcription"
                type="button"
                onClick={onCancelTranscription}
                className="ws-btn-destructive self-start sm:self-center"
                title="Cancel ongoing transcription"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>

            {/* Honest Indeterminate Activity Indicator (Strictly no fake percentages) */}
            <div className="w-full bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-full h-2 overflow-hidden relative">
              <div className="h-full bg-[var(--brand-primary)] rounded-full animate-indeterminate-slide" />
            </div>

            {/* Grouped Runtime & Source Metrics */}
            <div className="ws-well p-3 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                <span className="ws-muted">Elapsed Time:</span>
                <span className="font-mono font-semibold ws-title">
                  {formatDurationHuman(liveElapsedSec)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                <span className="ws-muted">Source Duration:</span>
                <span className="font-mono font-semibold ws-title">
                  {formatDurationHuman(totalDurationSec)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] ws-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success-solid)] shrink-0" />
                <span>Local CPU ONNX • Zero Cloud Uploads</span>
              </div>
            </div>

            {/* Reassurance tips: Visually subordinate */}
            <div className="pt-2 border-t border-[var(--brand-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] shrink-0" />
                <span>If it looks stuck, don&apos;t panic.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] shrink-0" />
                <span>For a faster result, close other apps you&apos;re not using.</span>
              </div>
            </div>
          </div>
        )}

        {/* Completion Statistics Banner (when completed) */}
        {isCompleted && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="ws-well p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-[var(--success-subtle)] text-[var(--success-text)] border border-[var(--success-border)] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold ws-muted">Status</div>
                <div className="text-xs font-bold text-[var(--success-text)]">Transcription Complete</div>
              </div>
            </div>

            <div className="ws-well p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-[var(--brand-subtle)] text-[var(--brand-text)] border border-[var(--brand-border)] flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold ws-muted">Total Processing Time</div>
                <div className="text-xs font-bold ws-title font-mono">
                  {session.transcriptionElapsedMs
                    ? `${(session.transcriptionElapsedMs / 1000).toFixed(1)}s`
                    : `${liveElapsedSec}s`}
                </div>
              </div>
            </div>

            <div className="ws-well p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-default)] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold ws-muted">Speech Segments</div>
                <div className="text-xs font-bold ws-title font-mono">
                  {items.length} segments (SRT Default)
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Synchronized Master Transcript UI (Visible when completed or has items) */}
      {isCompleted && (
        <div className="ws-panel overflow-hidden">
          {/* Transcript Search and Format Header Bar */}
          <div className="p-3.5 border-b border-[var(--border-default)] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-2.5" />
              <input
                id="input-search-transcript"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transcript speech..."
                className="w-full ws-input pl-8 py-1 text-xs"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <span className="text-xs ws-muted font-mono">
                {filteredItems.length} of {items.length} segments
              </span>

              {/* View Mode Toggle */}
              <div className="flex ws-well p-0.5 text-xs">
                <button
                  id="toggle-view-srt"
                  type="button"
                  onClick={() => setFormatMode('srt')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                    formatMode === 'srt'
                      ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                      : 'ws-muted hover:text-[var(--text-primary)]'
                  }`}
                >
                  SRT Segments
                </button>
                <button
                  id="toggle-view-compact"
                  type="button"
                  onClick={() => setFormatMode('compact')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                    formatMode === 'compact'
                      ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                      : 'ws-muted hover:text-[var(--text-primary)]'
                  }`}
                >
                  Full Raw Text
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-default)]">
            {/* Left: Synchronized Video Player */}
            <div className="lg:col-span-5 p-4 flex flex-col justify-start space-y-3">
              <div className="text-xs font-semibold ws-title flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                  <span>Synchronized Video Player</span>
                </span>
                {activeVideoSeekTime !== null && (
                  <span className="font-mono text-[var(--brand-text)] text-[11px]">
                    Seeked: {formatDurationHuman(activeVideoSeekTime)}
                  </span>
                )}
              </div>

              <div className="rounded overflow-hidden bg-black aspect-video border border-[var(--border-default)] shadow-inner relative flex items-center justify-center">
                {session?.sessionId ? (
                  <video
                    id="transcript-video-player"
                    controls
                    className="w-full h-full object-contain ws-video-stage"
                    src={`/api/media/stream/${session.sessionId}`}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                    No video loaded
                  </div>
                )}
              </div>

              <div className="p-2.5 ws-well text-[11px] ws-muted flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                <span>
                  Click any timestamp badge in the transcript to jump the video directly to that spoken segment.
                </span>
              </div>
            </div>

            {/* Right: Master Transcript Segment List / Raw View */}
            <div className="lg:col-span-7 p-4 max-h-[480px] overflow-y-auto">
              {formatMode === 'compact' ? (
                <div className="ws-well p-4 font-mono text-xs ws-title leading-relaxed select-all whitespace-pre-wrap">
                  {masterTranscript?.rawText || masterTranscript?.srtText || 'No transcript text available.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredItems.length === 0 ? (
                    <div className="py-12 text-center ws-muted text-xs">
                      {searchQuery ? 'No matching segments found' : 'No transcript segments'}
                    </div>
                  ) : (
                    filteredItems.map((item, index) => {
                      return (
                        <div
                          key={item.id || index}
                          id={`transcript-segment-${item.id || index}`}
                          className="p-2.5 rounded border border-[var(--border-default)] ws-section hover:border-[var(--border-strong)] transition flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 text-xs"
                        >
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSeekVideo(item.globalStartSec)}
                                className="px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-[var(--brand-subtle)] text-[var(--brand-text)] border border-[var(--brand-border)] hover:bg-[var(--brand-primary)] hover:text-white transition flex items-center gap-1 cursor-pointer"
                                title="Click to seek video to this segment"
                              >
                                <Play className="w-2.5 h-2.5" />
                                <span>{formatSrtTime(item.globalStartSec)}</span>
                              </button>
                              <span className="ws-muted text-[10px]">→</span>
                              <span className="font-mono text-[11px] ws-muted">
                                {formatSrtTime(item.globalEndSec)}
                              </span>
                            </div>
                            <p className="ws-title leading-relaxed pt-0.5">
                              {item.text}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

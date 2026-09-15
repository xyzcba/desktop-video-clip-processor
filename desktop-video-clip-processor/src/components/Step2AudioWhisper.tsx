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
  ShieldCheck,
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

  // Acoustic waveform heights for the central listening visualization
  const waveHeights = [16, 26, 42, 58, 72, 48, 64, 80, 68, 52, 70, 44, 32, 50, 28, 18];

  return (
    <div id="step-2-transcription-container" className="max-w-5xl mx-auto space-y-5">
      {/* Transcription Failure Alert */}
      {hasFailed && transcriptionError && (
        <div id="transcription-pipeline-error-alert" className="ws-alert-error p-4 flex items-start justify-between gap-4 rounded-xl shadow-xs animate-in fade-in duration-200">
          <div className="flex items-start gap-3 min-w-0">
            <AlertCircle className="w-5 h-5 text-[var(--error-solid)] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--error-text)]">
                Transcription Interrupted
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                Verify that your video contains an audible sound track and that no other software is locking the file.
              </div>
              <div className="text-[11px] font-mono text-[var(--error-text)]/80 mt-1.5 p-2 rounded bg-black/20 border border-[var(--error-border)]/50 break-words">
                {transcriptionError}
              </div>
            </div>
          </div>

          {onRetryTranscription && (
            <button
              id="btn-retry-transcription"
              type="button"
              onClick={onRetryTranscription}
              className="ws-btn-destructive shrink-0 text-xs gap-1.5 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* Stage Header: Creator-oriented headline & Next CTA */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-sm sm:text-base font-bold tracking-tight text-[var(--text-primary)] uppercase">
            {isCompleted ? 'TRANSCRIPT READY' : 'CLIPRUSH IS LISTENING'}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {isCompleted
              ? 'ClipRush finished listening. Speech transcribed into timestamped segments.'
              : "Turning your video's speech into a searchable, timestamped transcript."}
          </p>
        </div>

        {isCompleted ? (
          <button
            id="btn-proceed-viral-json"
            type="button"
            onClick={onProceedToViralJson}
            className="ws-btn-primary group py-2 px-5 text-xs font-semibold tracking-wide shadow-xs hover:shadow active:scale-[0.98] transition-all duration-150 cursor-pointer self-start sm:self-auto"
          >
            <span>CONTINUE TO AI HIGHLIGHTS</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-1" />
          </button>
        ) : isTranscribing ? (
          <div className="flex items-center gap-2 text-xs text-[var(--brand-text)] font-semibold self-start sm:self-auto">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--brand-primary)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--brand-primary)]"></span>
            </span>
            <span>Speech Recognition Active</span>
          </div>
        ) : null}
      </div>

      {/* ACTIVE TRANSCRIPTION STATE: Calm, Focused, Dynamic Central Visual */}
      {isTranscribing && (
        <div
          id="transcription-active-panel"
          className="ws-panel p-6 sm:p-8 rounded-xl border border-[var(--brand-border)] bg-[var(--surface-primary)] space-y-6 shadow-sm"
        >
          {/* Central Acoustic Waveform Hub */}
          <div className="flex flex-col items-center justify-center pt-3 pb-1 text-center">
            {/* Visual Listening Waveform Bars */}
            <div className="w-full max-w-md h-24 flex items-center justify-center gap-1.5 px-4 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] shadow-inner">
              {waveHeights.map((h, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-[var(--brand-primary)] animate-acoustic-bar"
                  style={{
                    height: `${h}px`,
                    animationDelay: `${i * 0.09}s`,
                  }}
                />
              ))}
            </div>

            {/* Status Headline & Dynamic Server Message */}
            <div className="mt-5 space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] tracking-tight uppercase">
                {status === 'extracting_audio'
                  ? 'Extracting Audio Track'
                  : 'Transcribing Speech'}
              </h3>
              <p className="text-xs text-[var(--brand-text)] font-medium max-w-md mx-auto">
                {progress.message || (status === 'extracting_audio'
                  ? 'Extracting lossless audio stream with local FFmpeg...'
                  : 'Detecting spoken dialogue & generating timestamped SubRip segments...')}
              </p>
            </div>
          </div>

          {/* Honest Indeterminate Progress Bar */}
          <div className="w-full max-w-xl mx-auto space-y-1.5">
            <div className="w-full bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-full h-2 overflow-hidden relative">
              <div className="h-full bg-[var(--brand-primary)] rounded-full animate-indeterminate-slide" />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono px-0.5">
              <span>Whisper Speech Engine</span>
              <span>Processing dialogue blocks</span>
            </div>
          </div>

          {/* Structured Runtime & Source Metrics Card */}
          <div className="ws-well p-4 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs max-w-2xl mx-auto">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--surface-primary)] text-[var(--brand-primary)] border border-[var(--border-default)] flex items-center justify-center shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Elapsed Time</div>
                <div className="font-mono font-semibold text-[var(--text-primary)] mt-0.5">
                  {formatDurationHuman(liveElapsedSec)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--surface-primary)] text-[var(--brand-primary)] border border-[var(--border-default)] flex items-center justify-center shrink-0">
                <Volume2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Source Video</div>
                <div className="font-mono font-semibold text-[var(--text-primary)] mt-0.5 truncate" title={session?.video?.filename}>
                  {formatDurationHuman(totalDurationSec)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--surface-primary)] text-[var(--brand-primary)] border border-[var(--border-default)] flex items-center justify-center shrink-0">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Speech Detected</div>
                <div className="font-mono font-semibold text-[var(--text-primary)] mt-0.5">
                  {progress.segmentsCount > 0 ? `${progress.segmentsCount} segments` : 'Sampling audio...'}
                </div>
              </div>
            </div>
          </div>

          {/* Reassurance Note & Cancellation Bar */}
          <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-[11px] self-start sm:self-center">
              <ShieldCheck className="w-4 h-4 text-[var(--success-text)] shrink-0" />
              <span>100% on-device speech recognition. Your audio never leaves this computer.</span>
            </div>

            <button
              id="btn-cancel-transcription"
              type="button"
              onClick={onCancelTranscription}
              className="ws-btn-secondary text-xs py-1.5 px-3 self-end sm:self-center text-[var(--text-muted)] hover:text-[var(--error-text)] hover:border-[var(--error-border)] transition cursor-pointer"
              title="Cancel ongoing transcription"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Transcription</span>
            </button>
          </div>
        </div>
      )}

      {/* IDLE / PAUSED STATE (When not transcribing, not completed, and not failed) */}
      {!isTranscribing && !isCompleted && !hasFailed && (
        <div className="ws-panel p-10 rounded-xl text-center space-y-4 max-w-lg mx-auto border border-[var(--border-default)]">
          <div className="w-12 h-12 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-default)] flex items-center justify-center text-[var(--text-muted)] mx-auto">
            <Mic className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Transcription Paused</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-sm mx-auto">
              The speech recognition process was halted. No files were corrupted and you can restart anytime.
            </p>
          </div>
          {onRetryTranscription && (
            <button
              id="btn-retry-transcription"
              type="button"
              onClick={onRetryTranscription}
              className="ws-btn-primary py-2 px-5 text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Resume Transcription</span>
            </button>
          )}
        </div>
      )}

      {/* COMPLETION STATE: Verified Metrics Summary Strip */}
      {isCompleted && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="ws-well p-3.5 rounded-xl flex items-center gap-3 border border-[var(--border-default)]">
            <div className="w-8 h-8 rounded-lg bg-[var(--success-subtle)] text-[var(--success-text)] border border-[var(--success-border)] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Status</div>
              <div className="text-xs font-bold text-[var(--success-text)]">Transcription Complete</div>
            </div>
          </div>

          <div className="ws-well p-3.5 rounded-xl flex items-center gap-3 border border-[var(--border-default)]">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand-subtle)] text-[var(--brand-text)] border border-[var(--brand-border)] flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Processing Time</div>
              <div className="text-xs font-bold text-[var(--text-primary)] font-mono">
                {session.transcriptionElapsedMs
                  ? `${(session.transcriptionElapsedMs / 1000).toFixed(1)}s`
                  : `${liveElapsedSec}s`}
              </div>
            </div>
          </div>

          <div className="ws-well p-3.5 rounded-xl flex items-center gap-3 border border-[var(--border-default)]">
            <div className="w-8 h-8 rounded-lg bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-default)] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Speech Segments</div>
              <div className="text-xs font-bold text-[var(--text-primary)] font-mono">
                {items.length} segments (SRT Format)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Synchronized Master Transcript UI (Visible when completed or has items) */}
      {isCompleted && (
        <div className="ws-panel rounded-xl overflow-hidden border border-[var(--border-default)]">
          {/* Transcript Search and Format Header Bar */}
          <div className="p-3.5 border-b border-[var(--border-default)] flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--surface-primary)]">
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
              <span className="text-xs text-[var(--text-muted)] font-mono">
                {filteredItems.length} of {items.length} segments
              </span>

              {/* View Mode Toggle */}
              <div className="flex ws-well p-0.5 text-xs rounded-lg">
                <button
                  id="toggle-view-srt"
                  type="button"
                  onClick={() => setFormatMode('srt')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                    formatMode === 'srt'
                      ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
              <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center justify-between">
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

              <div className="rounded-lg overflow-hidden bg-black aspect-video border border-[var(--border-default)] shadow-inner relative flex items-center justify-center">
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

              <div className="p-2.5 ws-well rounded-lg text-[11px] text-[var(--text-muted)] flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                <span>
                  Click any timestamp badge in the transcript to jump the video directly to that spoken segment.
                </span>
              </div>
            </div>

            {/* Right: Master Transcript Segment List / Raw View */}
            <div className="lg:col-span-7 p-4 max-h-[480px] overflow-y-auto">
              {formatMode === 'compact' ? (
                <div className="ws-well p-4 rounded-lg font-mono text-xs text-[var(--text-primary)] leading-relaxed select-all whitespace-pre-wrap">
                  {masterTranscript?.rawText || masterTranscript?.srtText || 'No transcript text available.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredItems.length === 0 ? (
                    <div className="py-12 text-center text-[var(--text-muted)] text-xs">
                      {searchQuery ? 'No matching segments found' : 'No transcript segments'}
                    </div>
                  ) : (
                    filteredItems.map((item, index) => {
                      return (
                        <div
                          key={item.id || index}
                          id={`transcript-segment-${item.id || index}`}
                          className="p-2.5 rounded-lg border border-[var(--border-default)] ws-section hover:border-[var(--border-strong)] transition flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 text-xs"
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
                              <span className="text-[var(--text-muted)] text-[10px]">→</span>
                              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                                {formatSrtTime(item.globalEndSec)}
                              </span>
                            </div>
                            <p className="text-[var(--text-primary)] leading-relaxed pt-0.5">
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

          {/* Bottom Action Footer */}
          <div className="p-3.5 border-t border-[var(--border-default)] bg-[var(--surface-primary)] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 self-start sm:self-center">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success-solid)]"></span>
              <span>All speech segments timestamped and ready for AI viral highlight curation</span>
            </div>

            <button
              type="button"
              onClick={onProceedToViralJson}
              className="ws-btn-primary group py-2 px-5 text-xs font-semibold tracking-wide shadow-xs hover:shadow active:scale-[0.98] transition-all duration-150 cursor-pointer self-end sm:self-auto"
            >
              <span>CONTINUE TO AI HIGHLIGHTS</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

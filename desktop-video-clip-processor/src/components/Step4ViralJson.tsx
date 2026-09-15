import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Code,
  ArrowRight,
  FileCode,
  Clock,
  RotateCcw,
  Edit3,
  Play,
  Film,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
} from 'lucide-react';
import { ProjectSession, ValidationResult, CaptionConfig, DEFAULT_CAPTION_CONFIG, ViralClipItem } from '../types';
import { FramingConfig, DEFAULT_FRAMING_CONFIG } from '../framing/framingTypes';
import { getCaptionPreset } from '../caption/captionPresets';
import { generateLlmPrompt } from '../utils/promptGenerator';
import { validateViralClipsJson } from '../utils/jsonValidator';
import { formatSecondsToTimestamp, formatDurationHuman } from '../utils/timestamps';
import { safeCopyToClipboard } from '../utils/clipboard';
import { CaptionConfigModal } from './CaptionConfigModal';

interface Step4ViralJsonProps {
  session: ProjectSession;
  onApplyClipsJson: (
    rawJson: string,
    maxDurationSec: number,
    newCaptionConfig?: CaptionConfig,
    newFramingConfig?: FramingConfig
  ) => void;
  onUpdateCaptionConfig?: (config: CaptionConfig) => Promise<void> | void;
  onUpdateFramingConfig?: (config: FramingConfig) => Promise<void> | void;
}

export const Step4ViralJson: React.FC<Step4ViralJsonProps> = ({
  session,
  onApplyClipsJson,
  onUpdateCaptionConfig,
  onUpdateFramingConfig,
}) => {
  const [isCaptionModalOpen, setIsCaptionModalOpen] = useState(false);
  const captionConfig = session?.captionConfig || DEFAULT_CAPTION_CONFIG;
  const [framingDraft, setFramingDraft] = useState<FramingConfig>(
    session.framingConfig || DEFAULT_FRAMING_CONFIG
  );

  useEffect(() => {
    if (session.framingConfig) {
      setFramingDraft(session.framingConfig);
    }
  }, [session.framingConfig]);

  const handleFramingChange = (newConfig: FramingConfig) => {
    setFramingDraft(newConfig);
    if (onUpdateFramingConfig) {
      onUpdateFramingConfig(newConfig);
    }
  };

  const currentPreset = getCaptionPreset(captionConfig.preset);
  const initialDuration =
    session.recommendedClipDurationSec || session.maxClipDurationSec || 60;
  const [recommendedClipDurationSec, setRecommendedClipDurationSec] =
    useState<number>(initialDuration);
  const [jsonInput, setJsonInput] = useState<string>(session.pastedJson || '');
  const [validation, setValidation] = useState<ValidationResult | null>(
    session.validationResult || null
  );
  const [promptCopied, setPromptCopied] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [isJsonDrawerOpen, setIsJsonDrawerOpen] = useState(false);

  // Clip selection state
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string | number>>(new Set());

  // Video preview player ref & active clip playback tracking
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activePreviewClipId, setActivePreviewClipId] = useState<string | number | null>(null);

  const videoDurationSec = session.video?.durationSec || 60;
  const transcriptText =
    session.masterTranscript?.srtText || session.masterTranscript?.rawText || '';
  const transcriptSegmentCount = session.masterTranscript?.items?.length || 0;
  const defaultPromptText = generateLlmPrompt(
    recommendedClipDurationSec,
    transcriptText
  );

  const [editablePromptText, setEditablePromptText] = useState<string>(defaultPromptText);
  const [isPromptCustomized, setIsPromptCustomized] = useState(false);

  // Synchronize default prompt when duration or transcript changes if not customized
  useEffect(() => {
    if (!isPromptCustomized) {
      setEditablePromptText(defaultPromptText);
    }
  }, [defaultPromptText, isPromptCustomized]);

  // Handle Copy Prompt
  const handleCopyPrompt = async () => {
    await safeCopyToClipboard(editablePromptText);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2500);
  };

  const handleResetPrompt = () => {
    setEditablePromptText(defaultPromptText);
    setIsPromptCustomized(false);
  };

  // Automatically validate when jsonInput or recommendedClipDurationSec changes
  useEffect(() => {
    if (!jsonInput.trim()) {
      setValidation(null);
      setSelectedClipIds(new Set());
      return;
    }
    const res = validateViralClipsJson(
      jsonInput,
      videoDurationSec,
      recommendedClipDurationSec
    );
    setValidation(res);

    // If valid clips found, select all by default if selection set is empty
    if (res.isValid && res.clips.length > 0) {
      setSelectedClipIds((prev) => {
        // Keep existing selections that still exist, or select all
        const validIds = new Set(res.clips.map((c) => c.id));
        const filteredPrev = new Set([...prev].filter((id) => validIds.has(id)));
        return filteredPrev.size > 0 ? filteredPrev : validIds;
      });
    }
  }, [jsonInput, recommendedClipDurationSec, videoDurationSec]);

  // Toggle individual clip selection
  const toggleClipSelection = (clipId: string | number) => {
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) {
        next.delete(clipId);
      } else {
        next.add(clipId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!validation) return;
    setSelectedClipIds(new Set(validation.clips.map((c) => c.id)));
  };

  const handleDeselectAll = () => {
    setSelectedClipIds(new Set());
  };

  // Seek video player to clip start timestamp
  const handlePlayClipPreview = (clip: ViralClipItem & { startSec: number }) => {
    setActivePreviewClipId(clip.id);
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, clip.startSec);
      videoRef.current.play().catch(() => {});
    }
  };

  // Get JSON to apply (either raw JSON if all selected, or filtered JSON)
  const getJsonToApply = () => {
    if (!validation?.isValid || validation.clips.length === 0) return jsonInput;
    if (selectedClipIds.size === 0 || selectedClipIds.size === validation.clips.length) {
      return jsonInput;
    }
    const filtered = validation.clips.filter((c) => selectedClipIds.has(c.id));
    return JSON.stringify(
      {
        clips: filtered.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          start: c.start,
          end: c.end,
          hashtags: c.hashtags,
          keywords: c.keywords,
        })),
      },
      null,
      2
    );
  };

  // Generate sample valid JSON tailored to video duration
  const handleLoadSampleJson = () => {
    const dur = Math.max(20, Math.floor(videoDurationSec));
    const clip1End = Math.min(dur, Math.min(recommendedClipDurationSec, 25));
    const clip2Start = Math.min(dur - 5, clip1End > 10 ? clip1End - 2 : 0);
    const clip2End = Math.min(
      dur,
      clip2Start + Math.min(recommendedClipDurationSec, 20)
    );

    const sample = {
      clips: [
        {
          id: 1,
          title: 'The Core Viral Hook',
          description:
            'High energy introductory insight designed to capture viewer attention in the first 3 seconds.',
          start: '00:00:00',
          end: formatSecondsToTimestamp(clip1End),
          hashtags: ['#viral', '#shorts', '#mindset'],
          keywords: ['hook', 'curiosity', 'key insight'],
        },
        ...(clip2End > clip2Start + 5
          ? [
              {
                id: 2,
                title: 'Surprising Revelation',
                description:
                  'Crucial turnaround point that challenges conventional wisdom.',
                start: formatSecondsToTimestamp(clip2Start),
                end: formatSecondsToTimestamp(clip2End),
                hashtags: ['#reels', '#growth', '#secret'],
                keywords: ['reveal', 'truth', 'strategy'],
              },
            ]
          : []),
      ],
    };

    setJsonInput(JSON.stringify(sample, null, 2));
  };

  const handleApply = () => {
    if (!validation?.isValid || selectedClipIds.size === 0) return;
    setIsCaptionModalOpen(true);
  };

  const hasValidHighlights = Boolean(validation?.isValid && validation.clips.length > 0);

  return (
    <div id="step-4-viral-json-container" className="max-w-6xl mx-auto space-y-5">
      {/* 1. STAGE HEADER: Creator-Oriented Title & Context */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-sm sm:text-base font-bold tracking-tight text-[var(--text-primary)] uppercase">
            {hasValidHighlights ? 'AI HIGHLIGHTS READY' : 'AI HIGHLIGHTS'}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {hasValidHighlights
              ? 'Review candidate moments, preview timestamps, and select the clips to generate.'
              : 'Find the moments worth turning into clips.'}
          </p>
        </div>

        {/* Top Right Action & Highlights Counter */}
        {hasValidHighlights ? (
          <button
            id="btn-apply-json-proceed"
            type="button"
            onClick={handleApply}
            disabled={selectedClipIds.size === 0}
            className="ws-btn-primary group py-2 px-5 text-xs font-semibold tracking-wide shadow-xs hover:shadow active:scale-[0.98] transition-all duration-150 cursor-pointer self-start sm:self-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>CONTINUE TO CLIP GENERATION ({selectedClipIds.size})</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-1" />
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] self-start sm:self-auto font-mono">
            <span className="w-2 h-2 rounded-full bg-[var(--success-solid)]"></span>
            <span>Transcript Ready • {transcriptSegmentCount} segments</span>
          </div>
        )}
      </div>

      {/* 2. CONTEXT & PACING BAR */}
      <div className="ws-well p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs border border-[var(--border-default)]">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Film className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
            <span className="text-[var(--text-muted)]">Source:</span>
            <span className="font-semibold text-[var(--text-primary)] font-mono">
              {formatDurationHuman(videoDurationSec)}
            </span>
          </div>

          <div className="hidden sm:block h-3 w-px bg-[var(--border-default)]" />

          {/* Target Duration Preset Selector */}
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
            <span className="text-[var(--text-muted)]">Target Length:</span>
            <select
              id="select-duration-preset"
              value={
                [30, 45, 60, 90, 120].includes(recommendedClipDurationSec)
                  ? recommendedClipDurationSec
                  : 'custom'
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val !== 'custom') {
                  setRecommendedClipDurationSec(Number(val));
                }
              }}
              className="ws-input py-1 px-2 text-xs font-medium cursor-pointer"
            >
              <option value={30}>30s • Quick hook (Shorts / Reels)</option>
              <option value={45}>45s • Balanced story</option>
              <option value={60}>60s • Standard default</option>
              <option value={90}>90s • Extended narrative</option>
              <option value={120}>120s • In-depth clip</option>
              <option value="custom">Custom duration</option>
            </select>

            <div className="flex items-center gap-1">
              <input
                id="input-max-clip-duration"
                type="number"
                min="15"
                max="180"
                value={recommendedClipDurationSec}
                onChange={(e) =>
                  setRecommendedClipDurationSec(
                    Math.max(10, parseInt(e.target.value, 10) || 60)
                  )
                }
                className="w-12 ws-input px-1 py-1 text-xs text-center font-bold font-mono"
                title="Target duration in seconds"
              />
              <span className="text-[var(--text-muted)] text-[11px]">sec</span>
            </div>
          </div>
        </div>

        {/* Caption & Framing Style Shortcut */}
        <button
          type="button"
          onClick={() => setIsCaptionModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--brand-text)] bg-[var(--brand-subtle)] hover:bg-[var(--brand-subtle)]/80 border border-[var(--brand-border)] transition cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Style: {currentPreset.name} • 9:16 Crop</span>
        </button>
      </div>

      {/* 3. PROMPT / AI WORKFLOW AREA (Shown prominently before validation, or collapsible after validation) */}
      {(!hasValidHighlights || isJsonDrawerOpen) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-in fade-in duration-200">
          {/* STEP 1: AI Prompt Section */}
          <div className="ws-panel p-5 rounded-xl border border-[var(--border-default)] space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[var(--brand-subtle)] text-[var(--brand-primary)] flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Get AI Analysis Prompt
                  </h3>
                </div>

                {isPromptCustomized && (
                  <span className="ws-badge-brand text-[10px] flex items-center gap-1">
                    <Edit3 className="w-2.5 h-2.5" /> Edited
                  </span>
                )}
              </div>

              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Copy this prompt to ChatGPT, Claude, or Gemini alongside your transcript. It instructs the AI to locate moments with punchy hooks and complete thoughts.
              </p>
            </div>

            <div className="space-y-2.5">
              <textarea
                id="textarea-recommended-prompt"
                value={editablePromptText}
                onChange={(e) => {
                  setEditablePromptText(e.target.value);
                  setIsPromptCustomized(true);
                }}
                rows={6}
                className="w-full ws-input font-mono text-xs leading-relaxed resize-y p-3"
                placeholder="Paste or customize your LLM prompt instructions..."
              />

              <div className="flex items-center justify-between gap-2 pt-1">
                {isPromptCustomized ? (
                  <button
                    id="btn-reset-recommended-prompt"
                    type="button"
                    onClick={handleResetPrompt}
                    className="ws-btn-secondary text-xs py-1.5 px-2.5 gap-1 cursor-pointer"
                    title="Reset prompt back to generated default"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Includes timestamped transcript
                  </span>
                )}

                <button
                  id="btn-copy-recommended-prompt"
                  type="button"
                  onClick={handleCopyPrompt}
                  className={`ws-btn-primary py-1.5 px-4 text-xs font-semibold gap-1.5 shadow-xs cursor-pointer ${
                    promptCopied
                      ? 'bg-[var(--success-solid)] hover:bg-[var(--success-solid)]'
                      : ''
                  }`}
                >
                  {promptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{promptCopied ? 'Copied to Clipboard!' : 'Copy AI Prompt'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* STEP 2: Paste AI Response Section */}
          <div className="ws-panel p-5 rounded-xl border border-[var(--border-default)] space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[var(--brand-subtle)] text-[var(--brand-primary)] flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Paste AI Highlights Response
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="btn-toggle-schema-docs"
                    type="button"
                    onClick={() => setSchemaOpen(!schemaOpen)}
                    className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline cursor-pointer"
                  >
                    {schemaOpen ? 'Hide Schema' : 'Schema'}
                  </button>

                  <button
                    id="btn-load-sample-json"
                    type="button"
                    onClick={handleLoadSampleJson}
                    className="text-[11px] font-semibold text-[var(--brand-text)] hover:underline cursor-pointer"
                  >
                    Load Sample Highlights
                  </button>
                </div>
              </div>

              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Paste the JSON returned by your AI model. ClipRush instantly parses timestamps and validates clip candidates against your video duration.
              </p>
            </div>

            {/* Schema Reference Dropdown */}
            {schemaOpen && (
              <div className="p-3 ws-well rounded-lg border border-[var(--border-default)] text-xs font-mono space-y-1 animate-in fade-in duration-150">
                <div className="text-[10px] uppercase font-bold text-[var(--text-muted)]">Expected JSON Schema</div>
                <pre className="text-[11px] overflow-x-auto text-[var(--brand-text)]">
{`{
  "clips": [
    {
      "id": 1,
      "title": "Punchy hook under 60 chars",
      "description": "Why this moment is viral and engaging",
      "start": "00:01:25",
      "end": "00:02:15",
      "hashtags": ["#Shorts", "#mindset"]
    }
  ]
}`}
                </pre>
              </div>
            )}

            <div className="space-y-2.5">
              <textarea
                id="textarea-viral-json"
                rows={6}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder="Paste the JSON returned by ChatGPT or Claude here..."
                className="w-full ws-input font-mono text-xs leading-relaxed p-3"
              />

              {/* Validation Status Feedback */}
              <div id="validation-report-panel">
                {validation ? (
                  validation.isValid ? (
                    <div className="flex items-center justify-between text-xs text-[var(--success-text)] font-semibold p-2 rounded-lg bg-[var(--success-subtle)] border border-[var(--success-border)]">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Highlights Ready: {validation.clips.length} moments detected</span>
                      </span>
                      {hasValidHighlights && (
                        <button
                          type="button"
                          onClick={() => setIsJsonDrawerOpen(false)}
                          className="text-[11px] underline cursor-pointer text-[var(--success-text)] font-medium"
                        >
                          View Highlights Grid
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg ws-alert-error text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-[var(--error-text)]">
                        <AlertTriangle className="w-4 h-4 text-[var(--error-solid)]" />
                        <span>Highlights Need Attention ({validation.errors.length} issue{validation.errors.length > 1 ? 's' : ''})</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[var(--error-text)]/90">
                        {validation.errors.map((err, i) => (
                          <li key={i}>{err.message}</li>
                        ))}
                      </ul>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] p-2">
                    <Info className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                    <span>Paste JSON to generate candidate clips.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. VALID HIGHLIGHTS WORKSPACE: Candidate Moments & Synchronized Video Player */}
      {hasValidHighlights && validation && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Highlight Selection Summary Bar */}
          <div className="ws-panel p-3.5 rounded-xl border border-[var(--border-default)] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Candidate Moments
              </span>
              <span className="text-xs text-[var(--text-muted)] font-mono">
                {selectedClipIds.size} of {validation.clips.length} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="ws-btn-secondary text-xs py-1 px-2.5 cursor-pointer"
              >
                Select All
              </button>

              <button
                type="button"
                onClick={handleDeselectAll}
                className="ws-btn-secondary text-xs py-1 px-2.5 cursor-pointer"
              >
                Clear
              </button>

              <div className="h-4 w-px bg-[var(--border-default)] mx-1" />

              <button
                type="button"
                onClick={() => setIsJsonDrawerOpen(!isJsonDrawerOpen)}
                className="ws-btn-secondary text-xs py-1 px-2.5 gap-1.5 cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <Code className="w-3.5 h-3.5" />
                <span>{isJsonDrawerOpen ? 'Close JSON Editor' : 'Edit Response JSON'}</span>
                {isJsonDrawerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Main 2-Column Creative Workstation */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN: Synchronized Video Player & Preview */}
            <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-4">
              <div className="ws-panel p-4 rounded-xl border border-[var(--border-default)] space-y-3 shadow-xs">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
                  <span className="flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                    <span>Moment Preview Player</span>
                  </span>
                  {activePreviewClipId && (
                    <span className="ws-badge-brand text-[10px] font-mono">
                      Previewing Clip #{activePreviewClipId}
                    </span>
                  )}
                </div>

                <div className="rounded-lg overflow-hidden bg-black aspect-video border border-[var(--border-default)] shadow-inner relative flex items-center justify-center">
                  {session?.sessionId ? (
                    <video
                      id="highlight-video-player"
                      ref={videoRef}
                      src={`/api/media/stream/${session.sessionId}`}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">No video stream available</span>
                  )}
                </div>

                <div className="p-2.5 ws-well rounded-lg text-[11px] text-[var(--text-muted)] flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0 mt-0.5" />
                  <span>
                    Click <strong>Preview Timestamp</strong> on any candidate card below to verify where the clip begins.
                  </span>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Candidate Moment Cards Grid */}
            <div className="lg:col-span-7 space-y-3">
              {validation.clips.map((clip, idx) => {
                const isSelected = selectedClipIds.has(clip.id);
                const isActive = activePreviewClipId === clip.id;

                return (
                  <div
                    key={clip.id || idx}
                    id={`validated-clip-card-${clip.id}`}
                    onClick={() => toggleClipSelection(clip.id)}
                    className={`p-4 rounded-xl border transition-all duration-150 cursor-pointer text-xs space-y-2.5 relative group ${
                      isSelected
                        ? 'border-[var(--brand-primary)] bg-[var(--brand-subtle)]/35 shadow-xs'
                        : 'border-[var(--border-default)] bg-[var(--surface-primary)] opacity-65 hover:opacity-100 hover:border-[var(--border-strong)]'
                    } ${isActive ? 'ring-1 ring-[var(--brand-primary)]' : ''}`}
                  >
                    {/* Top Row: Selection Checkbox, Clip #, Title, Duration */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleClipSelection(clip.id);
                          }}
                          className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition cursor-pointer ${
                            isSelected
                              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                              : 'border border-[var(--border-default)] text-transparent hover:border-[var(--border-strong)]'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-[var(--brand-text)]">
                              #{String(idx + 1).padStart(2, '0')}
                            </span>
                            <h4 className="font-bold text-sm text-[var(--text-primary)] leading-tight truncate">
                              {clip.title}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--text-muted)] font-mono">
                            <Clock className="w-3 h-3 text-[var(--brand-primary)]" />
                            <span>
                              {clip.start} → {clip.end}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">•</span>
                            <span className="font-bold text-[var(--text-primary)]">
                              {clip.durationSec}s
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Preview Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayClipPreview(clip);
                        }}
                        className="ws-btn-secondary py-1 px-2.5 text-[11px] font-medium gap-1 shrink-0 cursor-pointer text-[var(--brand-text)] hover:text-[var(--brand-primary)]"
                        title="Preview video timestamp"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Preview</span>
                      </button>
                    </div>

                    {/* Description Hook */}
                    {clip.description && (
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed pl-8">
                        {clip.description}
                      </p>
                    )}

                    {/* Hashtags & Keywords */}
                    {clip.hashtags && clip.hashtags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pl-8 pt-0.5">
                        {clip.hashtags.map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Confirmation Bar */}
          <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-primary)] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] self-start sm:self-center">
              <CheckCircle2 className="w-4 h-4 text-[var(--success-text)] shrink-0" />
              <span>
                Ready to render <strong>{selectedClipIds.size}</strong> viral clips with dynamic captions and smart framing.
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setIsCaptionModalOpen(true)}
                className="ws-btn-secondary text-xs py-2 px-4 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                <span>Customize Captions</span>
              </button>

              <button
                type="button"
                onClick={handleApply}
                disabled={selectedClipIds.size === 0}
                className="ws-btn-primary group py-2 px-6 text-xs font-semibold tracking-wide shadow-xs hover:shadow active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-50"
              >
                <span>CONTINUE TO CLIP GENERATION ({selectedClipIds.size})</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Caption & Framing Configuration Checkpoint Modal */}
      <CaptionConfigModal
        isOpen={isCaptionModalOpen}
        onClose={() => setIsCaptionModalOpen(false)}
        config={captionConfig}
        framingConfig={framingDraft}
        onUpdateFramingConfig={handleFramingChange}
        videoSrc={session.video ? `/api/media/stream/${session.sessionId}` : undefined}
        sourceVideoWidth={session.video?.width}
        sourceVideoHeight={session.video?.height}
        onSave={async (savedCfg, savedFraming) => {
          if (onUpdateCaptionConfig) await onUpdateCaptionConfig(savedCfg);
          if (savedFraming && onUpdateFramingConfig) await onUpdateFramingConfig(savedFraming);
        }}
        onApplyAndProceed={async (savedCfg, savedFraming) => {
          if (onUpdateCaptionConfig) {
            await onUpdateCaptionConfig(savedCfg);
          }
          if (savedFraming && onUpdateFramingConfig) {
            await onUpdateFramingConfig(savedFraming);
          }
          setIsCaptionModalOpen(false);
          const finalFraming = savedFraming || framingDraft;
          onApplyClipsJson(getJsonToApply(), recommendedClipDurationSec, savedCfg, finalFraming);
        }}
        clipCount={selectedClipIds.size || validation?.clips?.length}
      />
    </div>
  );
};


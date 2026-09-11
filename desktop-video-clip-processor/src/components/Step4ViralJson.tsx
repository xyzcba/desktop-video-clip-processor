import React, { useState, useEffect } from 'react';
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
  Scissors,
  RotateCcw,
  Edit3,
} from 'lucide-react';
import { ProjectSession, ValidationResult, CaptionConfig, DEFAULT_CAPTION_CONFIG } from '../types';
import { FramingConfig, DEFAULT_FRAMING_CONFIG } from '../framing/framingTypes';
import { getCaptionPreset } from '../caption/captionPresets';
import { generateLlmPrompt } from '../utils/promptGenerator';
import { validateViralClipsJson } from '../utils/jsonValidator';
import { formatSecondsToTimestamp } from '../utils/timestamps';
import { safeCopyToClipboard } from '../utils/clipboard';
import { CaptionConfigModal } from './CaptionConfigModal';
import { FramingSelector } from './FramingSelector';

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

  const videoDurationSec = session.video?.durationSec || 60;
  const transcriptText = session.masterTranscript?.srtText || session.masterTranscript?.rawText || '';
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
      return;
    }
    const res = validateViralClipsJson(
      jsonInput,
      videoDurationSec,
      recommendedClipDurationSec
    );
    setValidation(res);
  }, [jsonInput, recommendedClipDurationSec, videoDurationSec]);

  // Generate a sample valid JSON tailored to the video's actual duration
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
            'High energy introductory insight designed to capture attention in the first 3 seconds.',
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
    if (!validation?.isValid) return;
    onApplyClipsJson(jsonInput, recommendedClipDurationSec);
  };

  return (
    <div id="step-4-viral-json-container" className="max-w-5xl mx-auto space-y-5">
      {/* Header & Recommended Duration Setting */}
      <div className="ws-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold ws-title">
                Stage 3: Clip Suggestions & AI Prompt
              </h2>
              <p className="text-xs ws-muted mt-0.5">
                Copy the prompt to ChatGPT, Claude, or Gemini to find highlights. Paste the JSON below to preview.
              </p>
            </div>
          </div>

          {/* Recommended Clip Duration Setting */}
          <div className="flex items-center gap-2.5 ws-well p-2 shrink-0">
            <Sliders className="w-4 h-4 text-[var(--brand-primary)]" />
            <div>
              <div className="text-[10px] ws-muted font-bold uppercase tracking-wider">
                Target Duration
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
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
                  className="w-12 ws-input px-1 py-0.5 text-xs text-center font-bold"
                />
                <span className="text-xs ws-muted">sec</span>
              </div>
            </div>
          </div>
        </div>

        {/* Compact Duration Option Dropdown (Scalable control for duration options) */}
        <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
          <div className="flex items-center gap-2">
            <span className="ws-label text-xs">Target Preset:</span>
            <select
              id="select-duration-preset"
              value={[30, 45, 60, 90, 120].includes(recommendedClipDurationSec) ? recommendedClipDurationSec : 'custom'}
              onChange={(e) => {
                const val = e.target.value;
                if (val !== 'custom') {
                  setRecommendedClipDurationSec(Number(val));
                }
              }}
              className="ws-input py-1 px-2.5 text-xs font-medium cursor-pointer"
            >
              <option value={30}>30s • Quick hook (Shorts / Reels)</option>
              <option value={45}>45s • Balanced story</option>
              <option value={60}>60s • Standard default</option>
              <option value={90}>90s • Extended narrative</option>
              <option value={120}>120s • In-depth clip</option>
              <option value="custom">Custom duration</option>
            </select>
          </div>
          <span className="text-[11px] ws-muted">
            Target guideline for the AI; clips can adjust when narrative completeness demands it.
          </span>
        </div>
      </div>

      {/* Recommended Prompt Editor Card (Editable) */}
      <div className="ws-panel p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-[var(--brand-primary)]" />
            <h3 className="text-sm font-bold ws-title flex items-center gap-2">
              <span>Recommended LLM Prompt (Editable)</span>
              {isPromptCustomized && (
                <span className="ws-badge-brand flex items-center gap-1 text-[10px]">
                  <Edit3 className="w-2.5 h-2.5" /> Edited
                </span>
              )}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {isPromptCustomized && (
              <button
                id="btn-reset-recommended-prompt"
                type="button"
                onClick={handleResetPrompt}
                className="ws-btn-secondary"
                title="Reset prompt instructions back to generated default"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to Default</span>
              </button>
            )}

            <button
              id="btn-copy-recommended-prompt"
              type="button"
              onClick={handleCopyPrompt}
              className={`ws-btn-primary ${
                promptCopied ? 'bg-[var(--success-solid)] hover:bg-[var(--success-solid)]' : ''
              }`}
            >
              {promptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{promptCopied ? 'Copied to Clipboard!' : 'Copy Prompt'}</span>
            </button>
          </div>
        </div>

        <p className="text-xs ws-muted">
          You can edit or tweak the instructions below before copying to ChatGPT, Claude, or your LLM.
        </p>

        <textarea
          id="textarea-recommended-prompt"
          value={editablePromptText}
          onChange={(e) => {
            setEditablePromptText(e.target.value);
            setIsPromptCustomized(true);
          }}
          rows={6}
          className="w-full ws-input font-mono text-xs leading-relaxed resize-y"
          placeholder="Paste or customize your LLM prompt instructions..."
        />
      </div>

      {/* JSON Input & Validation Zone */}
      <div className="ws-panel overflow-hidden">
        <div className="p-3.5 border-b border-[var(--border-default)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-[var(--brand-primary)]" />
            <h3 className="text-sm font-bold ws-title">Viral Clip JSON Response</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-toggle-schema-docs"
              type="button"
              onClick={() => setSchemaOpen(!schemaOpen)}
              className="ws-btn-secondary"
            >
              {schemaOpen ? 'Hide Schema' : 'View Schema'}
            </button>

            <button
              id="btn-load-sample-json"
              type="button"
              onClick={handleLoadSampleJson}
              className="ws-btn-secondary text-[var(--brand-text)]"
            >
              Load Sample Valid JSON
            </button>
          </div>
        </div>

        {/* Schema Documentation Modal / Collapsible */}
        {schemaOpen && (
          <div className="p-4 ws-well border-b border-[var(--border-default)] text-xs font-mono space-y-2">
            <div className="ws-muted font-semibold">Strict JSON Schema Specification:</div>
            <pre className="text-[11px] ws-well p-3 overflow-x-auto text-[var(--brand-text)]">
{`{
  "clips": [
    {
      "id": 1,
      "title": "Clear punchy title under 60 chars",
      "description": "Short explanation of viral hook and context",
      "start": "00:01:25",    // HH:MM:SS or MM:SS (original video timeline)
      "end": "00:02:15",      // Greater than start and within video duration
      "hashtags": ["#topic", "#viral"],
      "keywords": ["key concept", "hook phrase"]
    }
  ]
}`}
            </pre>
          </div>
        )}

        {/* Text Area for Pasting JSON */}
        <div className="p-4">
          <textarea
            id="textarea-viral-json"
            rows={8}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder="Paste the raw JSON returned by ChatGPT or your LLM here..."
            className="w-full ws-input font-mono text-xs leading-relaxed"
          />
        </div>

        {/* Live Validation Status & Error Reporting */}
        {validation && (
          <div id="validation-report-panel" className="p-4 border-t border-[var(--border-default)] ws-section space-y-3">
            {/* Status Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {validation.isValid ? (
                  <span className="ws-badge-success flex items-center gap-1.5 py-1 px-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Valid JSON: Ready to configure & generate {validation.clips.length} clips
                  </span>
                ) : (
                  <span className="ws-badge-error flex items-center gap-1.5 py-1 px-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-[var(--error-solid)]" />
                    Validation Failed: {validation.errors.length} error(s) detected
                  </span>
                )}
              </div>

              {validation.isValid && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    id="btn-apply-json-proceed"
                    type="button"
                    onClick={() => setIsCaptionModalOpen(true)}
                    className="ws-btn-primary"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Configure Captions & Generate {validation.clips.length} Clips</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Dedicated Framing Configuration */}
            {validation.isValid && (
              <div className="pt-2">
                <FramingSelector
                  config={framingDraft}
                  onChange={handleFramingChange}
                />
              </div>
            )}

            {/* Error List */}
            {validation.errors.length > 0 && (
              <div className="space-y-1 p-3 ws-alert-error text-xs">
                <div className="font-bold">Errors to fix:</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {validation.errors.map((err, i) => (
                    <li key={i}>{err.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings List */}
            {validation.warnings.length > 0 && (
              <div className="space-y-1 p-3 ws-alert-warning text-xs">
                <div className="font-bold">Recommendations & Warnings:</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {validation.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Validated Clips Preview Cards */}
            {validation.clips.length > 0 && (
              <div className="pt-2">
                <div className="text-xs font-semibold ws-title mb-2">Validated Clips Plan:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {validation.clips.map((clip, idx) => (
                    <div
                      key={idx}
                      id={`validated-clip-card-${clip.id}`}
                      className="p-3 ws-well text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold ws-title truncate">
                          #{idx + 1} - {clip.title}
                        </span>
                        <span className="font-mono font-bold ws-badge-brand px-1.5 py-0.5">
                          {clip.durationSec}s
                        </span>
                      </div>
                      <div className="ws-muted text-[11px] flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-[var(--brand-primary)]" />
                        <span>Timeline: {clip.start} – {clip.end}</span>
                      </div>
                      {clip.description && (
                        <p className="ws-title text-[11px] line-clamp-2">
                          {clip.description}
                        </p>
                      )}
                      {clip.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {clip.hashtags.map((tag, tIdx) => (
                            <span key={tIdx} className="text-[10px] ws-badge-neutral">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mandatory Caption & Framing Configuration Checkpoint Modal */}
      <CaptionConfigModal
        isOpen={isCaptionModalOpen}
        onClose={() => setIsCaptionModalOpen(false)}
        config={captionConfig}
        sourceVideoWidth={session.video?.width}
        sourceVideoHeight={session.video?.height}
        onSave={async (savedCfg) => {
          if (onUpdateCaptionConfig) await onUpdateCaptionConfig(savedCfg);
        }}
        onApplyAndProceed={async (savedCfg) => {
          if (onUpdateCaptionConfig) {
            await onUpdateCaptionConfig(savedCfg);
          }
          setIsCaptionModalOpen(false);
          onApplyClipsJson(jsonInput, recommendedClipDurationSec, savedCfg, framingDraft);
        }}
        clipCount={validation?.clips?.length}
      />
    </div>
  );
};

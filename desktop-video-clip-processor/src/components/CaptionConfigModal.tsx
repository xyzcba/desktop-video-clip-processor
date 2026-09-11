import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Palette,
  RotateCcw,
  Sparkles,
  Smartphone,
  Monitor,
  Square,
  Maximize2,
  Type,
  Layers,
  Move,
  Scissors,
  ArrowRight,
  Upload,
  Check,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Sliders,
  Type as TypeIcon,
  Eye,
  AlertCircle,
  ScanFace,
  Focus,
} from 'lucide-react';
import {
  CaptionConfig,
  CaptionPresetId,
  OutputAspectRatio,
  FramingMode,
  HighlightColorMode,
  DEFAULT_CAPTION_CONFIG,
  WordTimestamp,
} from '../caption/captionTypes';
import { CAPTION_PRESETS } from '../caption/captionPresets';
import { CURATED_FONTS, FONT_NAMES } from '../caption/captionFonts';
import {
  POPULAR_HIGHLIGHT_SWATCHES,
  VIBRANT_HIGHLIGHT_PALETTE,
  getWordHighlightColor,
} from '../caption/captionColors';
import { sanitizeCaptionConfig } from '../caption/captionValidation';
import { layoutWordsIntoLines } from '../caption/captionGrouping';
import {
  computeCaptionGroupLayout,
  getCompositionDimensions,
} from '../caption/captionLayoutModel';

interface CaptionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CaptionConfig;
  sourceVideoWidth?: number;
  sourceVideoHeight?: number;
  onSave: (newConfig: CaptionConfig) => Promise<void> | void;
  onApplyAndProceed?: (savedConfig: CaptionConfig) => Promise<void> | void;
  isSaving?: boolean;
  applyButtonLabel?: string;
  clipCount?: number;
}

const SAMPLE_SENTENCE_WORDS: string[] = [
  'LADIES',
  'AND',
  'GENTLEMEN',
  'THIS',
  'IS',
  'HOW',
  'YOUR',
  'CAPTIONS',
  'WILL',
  'LOOK',
];

type ActiveTab = 'framing_presets' | 'typography' | 'background_effects';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return `rgba(255, 255, 255, ${alpha})`;
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const CaptionConfigModal: React.FC<CaptionConfigModalProps> = ({
  isOpen,
  onClose,
  config: initialConfig,
  sourceVideoWidth,
  sourceVideoHeight,
  onSave,
  onApplyAndProceed,
  isSaving = false,
  applyButtonLabel,
  clipCount,
}) => {
  const [draft, setDraft] = useState<CaptionConfig>(() =>
    sanitizeCaptionConfig(initialConfig || DEFAULT_CAPTION_CONFIG)
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('framing_presets');
  const [activeWordIdx, setActiveWordIdx] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [showSnapX, setShowSnapX] = useState<boolean>(false);
  const [showSnapY, setShowSnapY] = useState<boolean>(false);
  const [fontUploadError, setFontUploadError] = useState<string | null>(null);
  const [isUploadingFont, setIsUploadingFont] = useState<boolean>(false);
  // Canvas dimensions for exact logical-to-display scale mapping
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: 216,
    height: 384,
  });

  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const dragContainerRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; initialPosX: number; initialPosY: number }>({
    pointerX: 0,
    pointerY: 0,
    initialPosX: 0.5,
    initialPosY: 0.72,
  });

  // Synchronize draft when opened or initialConfig updates
  useEffect(() => {
    if (isOpen) {
      setDraft(sanitizeCaptionConfig(initialConfig || DEFAULT_CAPTION_CONFIG));
      setActiveWordIdx(0);
      setFontUploadError(null);
    }
  }, [isOpen, initialConfig]);

  // Animated karaoke word highlight loop for live interactive preview
  useEffect(() => {
    if (!isOpen || draft.enabled === false) return;
    const interval = setInterval(() => {
      setActiveWordIdx((prev) => (prev + 1) % draft.maxWordsPerGroup);
    }, 440);
    return () => clearInterval(interval);
  }, [isOpen, draft.enabled, draft.maxWordsPerGroup]);

  // Canvas resize observer for exact logical-to-display scale mapping
  useEffect(() => {
    if (!isOpen || !previewCanvasRef.current) return;
    const updateDims = () => {
      if (previewCanvasRef.current) {
        const rect = previewCanvasRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setCanvasDimensions({ width: rect.width, height: rect.height });
        }
      }
    };
    updateDims();
    const obs = new ResizeObserver(updateDims);
    obs.observe(previewCanvasRef.current);
    return () => obs.disconnect();
  }, [isOpen, draft.aspectRatio]);

  // Global pointer release listener when dragging to guarantee drag never gets stuck
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalRelease = (e: PointerEvent) => {
      stopDrag(e.pointerId);
    };

    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('pointercancel', handleGlobalRelease);
    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('pointercancel', handleGlobalRelease);
    };
  }, [isDragging]);

  // Cleanly terminate drag interaction and release pointer capture
  const stopDrag = (pointerId?: number) => {
    setIsDragging(false);
    setShowSnapX(false);
    setShowSnapY(false);
    const pid = pointerId ?? activePointerIdRef.current;
    if (pid !== null && pid !== undefined && dragContainerRef.current) {
      try {
        if (dragContainerRef.current.hasPointerCapture(pid)) {
          dragContainerRef.current.releasePointerCapture(pid);
        }
      } catch {
        // Ignore pointer release error if capture was already released
      }
    }
    activePointerIdRef.current = null;
  };

  if (!isOpen) return null;

  // Handle Preset Selection (Karaoke vs Standard)
  const handleSelectPreset = (presetId: 'karaoke' | 'standard') => {
    setDraft((prev) => {
      const isKaraoke = presetId === 'karaoke';
      return sanitizeCaptionConfig({
        ...prev,
        preset: presetId,
        highlightWord: isKaraoke,
      });
    });
  };

  // Draggable Caption Handlers with smooth drag offset (no jumping) & unconstrained canvas bounds
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only primary pointer button (left click / touch)
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const container = dragContainerRef.current;
    if (!container) return;

    // Crucial: Set pointer capture strictly on the stable outer container, never child spans
    try {
      container.setPointerCapture(e.pointerId);
      activePointerIdRef.current = e.pointerId;
    } catch {
      // Ignore capture errors
    }

    setIsDragging(true);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      initialPosX: draft.textPosition.x,
      initialPosY: draft.textPosition.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !previewCanvasRef.current) return;
    const rect = previewCanvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaX = (e.clientX - dragStartRef.current.pointerX) / rect.width;
    const deltaY = (e.clientY - dragStartRef.current.pointerY) / rect.height;

    let newX = dragStartRef.current.initialPosX + deltaX;
    let newY = dragStartRef.current.initialPosY + deltaY;

    // Axis snap threshold: 3% of canvas
    const SNAP_THRESHOLD = 0.03;
    const isSnappedToCenterX = Math.abs(newX - 0.50) <= SNAP_THRESHOLD;
    const isSnappedToCenterY = Math.abs(newY - 0.50) <= SNAP_THRESHOLD;

    setShowSnapX(isSnappedToCenterX);
    setShowSnapY(isSnappedToCenterY);

    if (isSnappedToCenterX) newX = 0.50;
    if (isSnappedToCenterY) newY = 0.50;

    // Safe unconstrained range [-1.0, 2.0]
    setDraft((prev) => ({
      ...prev,
      textPosition: {
        x: Math.round(newX * 1000) / 1000,
        y: Math.round(newY * 1000) / 1000,
      },
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    stopDrag(e.pointerId);
  };

  // Position Action Buttons
  const setPositionPreset = (yPos: number) => {
    setDraft((prev) => ({
      ...prev,
      textPosition: {
        x: 0.50,
        y: yPos,
      },
    }));
  };

  // Custom Font File Upload Handler (.ttf, .otf, .ttc)
  const handleCustomFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFontUploadError(null);
    setIsUploadingFont(true);

    const formData = new FormData();
    formData.append('font', file);

    try {
      const res = await fetch('/api/upload-font', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to upload font file.');
      }

      const fontData = await res.json();

      // Register font face dynamically in the browser for instant live preview
      try {
        const fontFace = new FontFace(fontData.fontName, `url(${fontData.url})`);
        await fontFace.load();
        document.fonts.add(fontFace);
      } catch (fontErr) {
        console.warn('FontFace preview load failed:', fontErr);
      }

      setDraft((prev) => ({
        ...prev,
        textFont: fontData.fontName,
        customFontPath: fontData.fontPath,
        customFontName: fontData.fontName,
      }));
    } catch (err: any) {
      setFontUploadError(err.message || 'Font upload failed.');
    } finally {
      setIsUploadingFont(false);
      if (fontInputRef.current) fontInputRef.current.value = '';
    }
  };

  const handleResetDefaults = () => {
    setDraft({ ...DEFAULT_CAPTION_CONFIG });
  };

  const handleSaveOnly = async () => {
    const safe = sanitizeCaptionConfig(draft);
    await onSave(safe);
    onClose();
  };

  const handleApplyAndProceedClick = async () => {
    const safe = sanitizeCaptionConfig(draft);
    if (onApplyAndProceed) {
      await onApplyAndProceed(safe);
    } else {
      await onSave(safe);
      onClose();
    }
  };

  // Determine Aspect Ratio Container Sizing
  const getAspectRatioClasses = () => {
    switch (draft.aspectRatio) {
      case '16:9':
        return 'w-full max-w-[356px] aspect-[16/9]';
      case '1:1':
        return 'w-[250px] h-[250px]';
      case 'original':
        if (sourceVideoWidth && sourceVideoHeight && sourceVideoWidth > 0 && sourceVideoHeight > 0) {
          const ratio = sourceVideoWidth / sourceVideoHeight;
          if (ratio >= 1.5) return 'w-full max-w-[356px] aspect-[16/9]';
          if (ratio <= 0.65) return 'w-[216px] h-[384px]';
          if (ratio >= 0.95 && ratio <= 1.05) return 'w-[250px] h-[250px]';
          return 'w-[240px] h-[280px]';
        }
        return 'w-full max-w-[356px] aspect-[16/9]';
      case '9:16':
      default:
        return 'w-[216px] h-[384px]';
    }
  };

  // Preview Words Slice for current group size
  const activeWordTokens = SAMPLE_SENTENCE_WORDS.slice(0, draft.maxWordsPerGroup);

  // Logical composition dimensions derived from aspect ratio
  const { width: compWidth, height: compHeight } = getCompositionDimensions(
    draft.aspectRatio,
    sourceVideoWidth,
    sourceVideoHeight
  );

  // Exact scale factor mapping composition space to preview display pixels
  const previewScale = canvasDimensions.width > 0 ? canvasDimensions.width / compWidth : 0.2;

  // Unified deterministic layout model
  const layout = computeCaptionGroupLayout(
    activeWordTokens,
    draft,
    sourceVideoWidth,
    sourceVideoHeight
  );

  // Display sizes directly scaled from composition space
  const previewFontSize = Math.max(9, Math.round(layout.fontSize * previewScale * 10) / 10);
  const previewOutlineSize = Math.max(0, Math.round(draft.textOutlineSize * previewScale * 10) / 10);
  const previewShadowSize = Math.max(0, Math.round(draft.textShadowSize * previewScale * 10) / 10);

  // Text shadow CSS construction
  const shadowCss =
    previewShadowSize > 0
      ? `0 ${previewShadowSize}px ${previewShadowSize * 1.5}px ${draft.textShadowColor || '#000000'}`
      : 'none';

  return (
    <div
      id="caption-config-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="caption-config-modal-card"
        className="relative w-full max-w-5xl bg-[var(--surface-primary)] border border-[var(--border-default)] rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        style={{ backgroundColor: 'var(--surface-primary)', opacity: 1 }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-default)] bg-[var(--surface-elevated)] shrink-0"
          style={{ backgroundColor: 'var(--surface-elevated)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold ws-title">
                Caption Style & Video Framing Checkpoint
              </h2>
              <p className="text-xs ws-muted">
                Configure typography, animations, position, and video aspect ratio for exported clips.
              </p>
            </div>
          </div>

          <button
            id="btn-close-caption-modal"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Left Controls (Tabs), Right Live Canvas */}
        <div
          className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden bg-[var(--surface-primary)]"
          style={{ backgroundColor: 'var(--surface-primary)' }}
        >
          {/* Controls Column */}
          <div
            className="flex-1 flex flex-col min-w-0 border-r border-[var(--border-default)] bg-[var(--surface-primary)] overflow-hidden"
            style={{ backgroundColor: 'var(--surface-primary)' }}
          >
            {/* Tab Navigation */}
            <div
              className="flex items-center border-b border-[var(--border-default)] bg-[var(--surface-subtle)] px-4 shrink-0 overflow-x-auto"
              style={{ backgroundColor: 'var(--surface-subtle)' }}
            >
              <button
                id="tab-btn-framing-presets"
                type="button"
                onClick={() => setActiveTab('framing_presets')}
                className={`py-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'framing_presets'
                    ? 'border-[var(--brand-primary)] text-[var(--brand-text)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span>Framing & Layout</span>
              </button>

              <button
                id="tab-btn-typography"
                type="button"
                onClick={() => setActiveTab('typography')}
                className={`py-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'typography'
                    ? 'border-[var(--brand-primary)] text-[var(--brand-text)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Typography</span>
              </button>

              <button
                id="tab-btn-effects-background"
                type="button"
                onClick={() => setActiveTab('background_effects')}
                className={`py-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeTab === 'background_effects'
                    ? 'border-[var(--brand-primary)] text-[var(--brand-text)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Effects & Style</span>
              </button>
            </div>

            {/* Tab Content Panel (Scrollable) */}
            <div
              className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 bg-[var(--surface-primary)]"
              style={{ backgroundColor: 'var(--surface-primary)' }}
            >
              {/* TAB 1: Framing, Presets, Group Size, Wrap Width, Positioning */}
              {activeTab === 'framing_presets' && (
                <div className="space-y-5">
                  {/* Preset Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold ws-title block">
                      Caption Style Preset
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        id="preset-opt-karaoke"
                        type="button"
                        onClick={() => handleSelectPreset('karaoke')}
                        className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
                          draft.preset === 'karaoke'
                            ? 'border-[var(--brand-primary)] bg-[var(--brand-subtle)] ring-1 ring-[var(--brand-primary)]'
                            : 'border-[var(--border-default)] hover:border-[var(--border-strong)] bg-[var(--surface-default)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs ws-title">Karaoke</span>
                          {draft.preset === 'karaoke' && (
                            <Check className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                          )}
                        </div>
                        <p className="text-[11px] ws-muted mt-1">
                          Dynamic word-by-word highlight with active pop/scale animation.
                        </p>
                      </button>

                      <button
                        id="preset-opt-standard"
                        type="button"
                        onClick={() => handleSelectPreset('standard')}
                        className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
                          draft.preset === 'standard'
                            ? 'border-[var(--brand-primary)] bg-[var(--brand-subtle)] ring-1 ring-[var(--brand-primary)]'
                            : 'border-[var(--border-default)] hover:border-[var(--border-strong)] bg-[var(--surface-default)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs ws-title">Standard</span>
                          {draft.preset === 'standard' && (
                            <Check className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                          )}
                        </div>
                        <p className="text-[11px] ws-muted mt-1">
                          Clean static subtitles without word-by-word color highlight.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Maximum Words per Caption Group & Wrap Width */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold ws-title">
                          Words per Caption Group
                        </label>
                        <span className="text-xs font-mono font-bold text-[var(--brand-text)]">
                          {draft.maxWordsPerGroup}
                        </span>
                      </div>
                      <input
                        id="input-max-words-per-group"
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        value={draft.maxWordsPerGroup}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setDraft((prev) => ({
                              ...prev,
                              maxWordsPerGroup: Math.max(1, Math.min(10, val)),
                            }));
                          }
                        }}
                        className="w-full ws-input font-mono text-xs"
                      />
                      <span className="text-[10px] ws-muted block">
                        Range: 1 – 10 words per group (default 3).
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold ws-title">
                          Visual Wrap Width (%)
                        </label>
                        <span className="text-xs font-mono font-bold text-[var(--brand-text)]">
                          {draft.wrapWidthPercent}%
                        </span>
                      </div>
                      <input
                        id="input-wrap-width-percent"
                        type="number"
                        min={20}
                        max={100}
                        step={5}
                        value={draft.wrapWidthPercent}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setDraft((prev) => ({
                              ...prev,
                              wrapWidthPercent: Math.max(20, Math.min(100, val)),
                            }));
                          }
                        }}
                        className="w-full ws-input font-mono text-xs"
                      />
                      <span className="text-[10px] ws-muted block">
                        Range: 20% – 100% of video width (default 80%).
                      </span>
                    </div>
                  </div>

                  {/* Video Framing & Aspect Ratio */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold ws-title block">
                      Video Framing Aspect Ratio
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: '9:16', label: '9:16', sub: 'Vertical (Reels/Shorts)', icon: Smartphone },
                        { id: '16:9', label: '16:9', sub: 'Landscape (YouTube)', icon: Monitor },
                        { id: '1:1', label: '1:1', sub: 'Square (Feed)', icon: Square },
                        { id: 'original', label: 'Original', sub: 'Source Aspect Ratio', icon: Maximize2 },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isSelected = draft.aspectRatio === item.id;
                        return (
                          <button
                            key={item.id}
                            id={`aspect-ratio-btn-${item.id}`}
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                aspectRatio: item.id as OutputAspectRatio,
                              }))
                            }
                            className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                              isSelected
                                ? 'border-[var(--brand-primary)] bg-[var(--brand-subtle)] ring-1 ring-[var(--brand-primary)]'
                                : 'border-[var(--border-default)] hover:border-[var(--border-strong)] bg-[var(--surface-default)]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold ws-title">{item.label}</span>
                              <Icon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            </div>
                            <span className="text-[10px] ws-muted leading-tight">{item.sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* AI Face Tracking & Camera Framing Engine (when not using original aspect ratio) */}
                  {draft.aspectRatio !== 'original' && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold ws-title flex items-center gap-1.5">
                          <ScanFace className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                          <span>Camera Framing & Auto-Crop Engine</span>
                        </label>
                        <span className="text-[10px] font-mono text-[var(--success-text)] bg-[var(--success-subtle)] px-1.5 py-0.5 rounded border border-[var(--success-border)]">
                          100% Local CPU ONNX
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          id="framing-mode-btn-face-tracking"
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              framingMode: 'face_tracking',
                            }))
                          }
                          className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
                            (draft.framingMode || 'face_tracking') === 'face_tracking'
                              ? 'border-[var(--brand-primary)] bg-[var(--brand-subtle)] ring-1 ring-[var(--brand-primary)]'
                              : 'border-[var(--border-default)] hover:border-[var(--border-strong)] bg-[var(--surface-default)]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ScanFace className="w-4 h-4 text-[var(--brand-primary)]" />
                              <span className="text-xs font-bold ws-title">AI Face Tracking</span>
                            </div>
                            {(draft.framingMode || 'face_tracking') === 'face_tracking' && (
                              <Check className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                            )}
                          </div>
                          <p className="text-[11px] ws-muted mt-1.5 leading-normal">
                            Smart vertical auto-framing. Automatically tracks the primary speaker across frames, keeping them centered with smooth pans and zero cloud dependency.
                          </p>
                        </button>

                        <button
                          id="framing-mode-btn-crop"
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              framingMode: 'crop',
                            }))
                          }
                          className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
                            draft.framingMode === 'crop'
                              ? 'border-[var(--brand-primary)] bg-[var(--brand-subtle)] ring-1 ring-[var(--brand-primary)]'
                              : 'border-[var(--border-default)] hover:border-[var(--border-strong)] bg-[var(--surface-default)]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Focus className="w-4 h-4 text-[var(--text-secondary)]" />
                              <span className="text-xs font-bold ws-title">Fixed Center Crop</span>
                            </div>
                            {draft.framingMode === 'crop' && (
                              <Check className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                            )}
                          </div>
                          <p className="text-[11px] ws-muted mt-1.5 leading-normal">
                            Standard static center extraction without camera motion. Best for videos where subjects are already pre-centered in the frame.
                          </p>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Caption Position Controls: Action Buttons & Explicit Numeric X / Y */}
                  <div className="space-y-3 pt-2 border-t border-[var(--border-default)]">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold ws-title">
                        Caption Screen Positioning
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          id="btn-pos-preset-top"
                          type="button"
                          onClick={() => setPositionPreset(0.15)}
                          className="px-2 py-1 text-[11px] rounded border border-[var(--border-default)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                          title="Snap to top of frame (Y: 0.15)"
                        >
                          <AlignVerticalJustifyStart className="w-3 h-3" />
                          <span>Top</span>
                        </button>
                        <button
                          id="btn-pos-preset-center"
                          type="button"
                          onClick={() => setPositionPreset(0.50)}
                          className="px-2 py-1 text-[11px] rounded border border-[var(--border-default)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                          title="Snap to exact center (Y: 0.50)"
                        >
                          <AlignVerticalJustifyCenter className="w-3 h-3" />
                          <span>Center</span>
                        </button>
                        <button
                          id="btn-pos-preset-bottom"
                          type="button"
                          onClick={() => setPositionPreset(0.72)}
                          className="px-2 py-1 text-[11px] rounded border border-[var(--border-default)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                          title="Snap to standard lower third (Y: 0.72)"
                        >
                          <AlignVerticalJustifyEnd className="w-3 h-3" />
                          <span>Bottom</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] ws-muted">
                      Drag freely on the canvas preview to reposition, or enter precise normalized coordinates below.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-mono text-[var(--text-muted)]">
                          X Coordinate (0.00 – 1.00)
                        </label>
                        <input
                          id="input-coord-x"
                          type="number"
                          step={0.01}
                          min={-1.0}
                          max={2.0}
                          value={draft.textPosition.x}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              setDraft((prev) => ({
                                ...prev,
                                textPosition: { ...prev.textPosition, x: val },
                              }));
                            }
                          }}
                          className="w-full ws-input font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-mono text-[var(--text-muted)]">
                          Y Coordinate (0.00 – 1.00)
                        </label>
                        <input
                          id="input-coord-y"
                          type="number"
                          step={0.01}
                          min={-1.0}
                          max={2.0}
                          value={draft.textPosition.y}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              setDraft((prev) => ({
                                ...prev,
                                textPosition: { ...prev.textPosition, y: val },
                              }));
                            }
                          }}
                          className="w-full ws-input font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Typography, Fonts, Upload Font, Text Size, Color, Weight, Italic, Uppercase */}
              {activeTab === 'typography' && (
                <div className="space-y-5">
                  {/* Font Family Selection & Upload Font */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold ws-title">Font Family</label>
                      <button
                        id="btn-trigger-font-upload"
                        type="button"
                        onClick={() => fontInputRef.current?.click()}
                        disabled={isUploadingFont}
                        className="text-[11px] font-semibold text-[var(--brand-text)] hover:underline flex items-center gap-1"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{isUploadingFont ? 'Uploading...' : 'Upload Font (.ttf/.otf)'}</span>
                      </button>
                      <input
                        ref={fontInputRef}
                        type="file"
                        accept=".ttf,.otf,.ttc"
                        onChange={handleCustomFontUpload}
                        className="hidden"
                      />
                    </div>

                    <select
                      id="select-font-family"
                      value={draft.textFont}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          textFont: e.target.value,
                          customFontPath: undefined,
                          customFontName: undefined,
                        }))
                      }
                      className="w-full ws-input text-xs"
                    >
                      {draft.customFontName && (
                        <option value={draft.customFontName}>
                          ★ Custom Font: {draft.customFontName}
                        </option>
                      )}
                      {CURATED_FONTS.map((font) => (
                        <option key={font.name} value={font.name}>
                          {font.name} — {font.description}
                        </option>
                      ))}
                    </select>

                    {fontUploadError && (
                      <div className="flex items-center gap-1.5 text-xs text-[var(--error-solid)]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{fontUploadError}</span>
                      </div>
                    )}
                  </div>

                  {/* Text Size (px) & Text Opacity */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold ws-title">
                          Text Size (px)
                        </label>
                        <span className="text-xs font-mono font-bold text-[var(--brand-text)]">
                          {draft.textSize}px
                        </span>
                      </div>
                      <input
                        id="input-text-size"
                        type="number"
                        min={16}
                        max={160}
                        step={2}
                        value={draft.textSize}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setDraft((prev) => ({
                              ...prev,
                              textSize: Math.max(16, Math.min(160, val)),
                            }));
                          }
                        }}
                        className="w-full ws-input font-mono text-xs"
                      />
                      <span className="text-[10px] ws-muted block">
                        Range: 16px – 160px (default 64px).
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold ws-title">
                          Text Opacity
                        </label>
                        <span className="text-xs font-mono font-bold text-[var(--brand-text)]">
                          {Math.round(draft.textOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        id="input-text-opacity"
                        type="number"
                        min={0.0}
                        max={1.0}
                        step={0.05}
                        value={draft.textOpacity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            setDraft((prev) => ({
                              ...prev,
                              textOpacity: Math.max(0.0, Math.min(1.0, val)),
                            }));
                          }
                        }}
                        className="w-full ws-input font-mono text-xs"
                      />
                      <span className="text-[10px] ws-muted block">
                        Range: 0.0 – 1.0 (default 1.0).
                      </span>
                    </div>
                  </div>

                  {/* Text Color & Swatches */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold ws-title block">Text Color</label>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 border border-[var(--border-default)] rounded px-2.5 py-1 bg-[var(--surface-default)]">
                        <input
                          id="color-picker-text-color"
                          type="color"
                          value={draft.textColor || '#FFFFFF'}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, textColor: e.target.value }))
                          }
                          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                        />
                        <span className="font-mono text-xs uppercase">{draft.textColor}</span>
                      </div>

                      {/* Quick Swatches */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {['#FFFFFF', '#FFD700', '#22C55E', '#38BDF8', '#FB923C', '#E2E8F0'].map(
                          (hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() => setDraft((prev) => ({ ...prev, textColor: hex }))}
                              className={`w-5 h-5 rounded-full border border-black/30 transition-transform ${
                                draft.textColor.toUpperCase() === hex.toUpperCase()
                                  ? 'scale-125 ring-2 ring-[var(--brand-primary)]'
                                  : 'hover:scale-110'
                              }`}
                              style={{ backgroundColor: hex }}
                              title={`Set text color to ${hex}`}
                            />
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Styling: Weight, Italic & Uppercase */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[var(--border-default)]">
                    {/* Weight */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold ws-title block">Font Weight</label>
                      <div className="flex rounded-md border border-[var(--border-default)] overflow-hidden">
                        {[
                          { id: 'normal', label: 'Regular' },
                          { id: 'bold', label: 'Bold' },
                          { id: 'extra-bold', label: 'Heavy' },
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                textWeight: item.id as any,
                              }))
                            }
                            className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors ${
                              draft.textWeight === item.id
                                ? 'bg-[var(--brand-primary)] text-[var(--brand-on-primary)]'
                                : 'bg-[var(--surface-default)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Style (Italic) */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold ws-title block">Text Style</label>
                      <div className="flex rounded-md border border-[var(--border-default)] overflow-hidden">
                        {[
                          { id: 'normal', label: 'Normal' },
                          { id: 'italic', label: 'Italic' },
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                textStyle: item.id as any,
                              }))
                            }
                            className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors ${
                              draft.textStyle === item.id
                                ? 'bg-[var(--brand-primary)] text-[var(--brand-on-primary)]'
                                : 'bg-[var(--surface-default)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Uppercase Toggle */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold ws-title block">Case</label>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            textUppercase: !prev.textUppercase,
                          }))
                        }
                        className={`w-full py-1.5 px-3 rounded-md border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                          draft.textUppercase
                            ? 'border-[var(--brand-primary)] bg-[var(--brand-subtle)] text-[var(--brand-text)]'
                            : 'border-[var(--border-default)] bg-[var(--surface-default)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <span>ALL CAPS</span>
                        {draft.textUppercase && <Check className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Effects, Background Box, Outline, Shadow, Highlight Colors & Animation */}
              {activeTab === 'background_effects' && (
                <div className="space-y-5">
                  {/* Karaoke Word-Level Highlight & Animation (Only for Karaoke preset) */}
                  {draft.preset === 'karaoke' && (
                    <div className="p-3.5 rounded-lg border border-[var(--brand-primary)]/40 bg-[var(--brand-subtle)]/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[var(--brand-text)] flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Active Word Highlight & Animation</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                highlightColorMode: 'custom',
                              }))
                            }
                            className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                              draft.highlightColorMode === 'custom'
                                ? 'bg-[var(--brand-primary)] text-[var(--brand-on-primary)] font-bold'
                                : 'bg-[var(--surface-default)] text-[var(--text-secondary)]'
                            }`}
                          >
                            Single Color
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                highlightColorMode: 'random',
                              }))
                            }
                            className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                              draft.highlightColorMode === 'random'
                                ? 'bg-[var(--brand-primary)] text-[var(--brand-on-primary)] font-bold'
                                : 'bg-[var(--surface-default)] text-[var(--text-secondary)]'
                            }`}
                          >
                            Rainbow Palette
                          </button>
                        </div>
                      </div>

                      {draft.highlightColorMode === 'custom' && (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 border border-[var(--border-default)] rounded px-2.5 py-1 bg-[var(--surface-default)]">
                            <input
                              type="color"
                              value={draft.highlightColor || '#22C55E'}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  highlightColor: e.target.value,
                                }))
                              }
                              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                            />
                            <span className="font-mono text-xs uppercase">
                              {draft.highlightColor}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {POPULAR_HIGHLIGHT_SWATCHES.slice(0, 6).map((swatch) => (
                              <button
                                key={swatch.hex}
                                type="button"
                                onClick={() =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    highlightColor: swatch.hex,
                                  }))
                                }
                                className={`w-5 h-5 rounded-full border border-black/30 transition-transform ${
                                  draft.highlightColor.toUpperCase() === swatch.hex.toUpperCase()
                                    ? 'scale-125 ring-2 ring-[var(--brand-primary)]'
                                    : 'hover:scale-110'
                                }`}
                                style={{ backgroundColor: swatch.hex }}
                                title={swatch.name}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Active Word Animation Selector */}
                      <div className="space-y-1.5 pt-1">
                        <label className="text-[11px] font-semibold text-[var(--text-secondary)] block">
                          Active Word Animation (Applies only to current word)
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'pop', label: 'Pop Bounce', desc: 'Punchy scale & snap' },
                            { id: 'scale', label: 'Scale Up', desc: 'Enlarged while spoken' },
                            { id: 'none', label: 'None', desc: 'Color change only' },
                          ].map((anim) => (
                            <button
                              key={anim.id}
                              type="button"
                              onClick={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  highlightAnimation: anim.id as any,
                                  animation: anim.id as any,
                                }))
                              }
                              className={`p-2 rounded border text-left flex flex-col transition-colors ${
                                (draft.highlightAnimation || draft.animation) === anim.id
                                  ? 'border-[var(--brand-primary)] bg-[var(--surface-default)] ring-1 ring-[var(--brand-primary)]'
                                  : 'border-[var(--border-default)] bg-[var(--surface-default)] opacity-70 hover:opacity-100'
                              }`}
                            >
                              <span className="text-xs font-bold ws-title">{anim.label}</span>
                              <span className="text-[10px] ws-muted">{anim.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Text Outline Controls */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold ws-title block">Text Outline</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs ws-muted">Outline Size (px)</span>
                          <span className="text-xs font-mono font-bold text-[var(--brand-text)]">
                            {draft.textOutlineSize}px
                          </span>
                        </div>
                        <input
                          id="input-outline-size"
                          type="number"
                          min={0}
                          max={16}
                          step={1}
                          value={draft.textOutlineSize}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setDraft((prev) => ({
                                ...prev,
                                textOutlineSize: Math.max(0, Math.min(16, val)),
                              }));
                            }
                          }}
                          className="w-full ws-input font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs ws-muted block">Outline Color</span>
                        <div className="flex items-center gap-2 border border-[var(--border-default)] rounded px-2.5 py-1 bg-[var(--surface-default)]">
                          <input
                            type="color"
                            value={draft.textOutlineColor || '#000000'}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                textOutlineColor: e.target.value,
                              }))
                            }
                            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                          />
                          <span className="font-mono text-xs uppercase">
                            {draft.textOutlineColor}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Text Drop Shadow Controls */}
                  <div className="space-y-2 pt-2 border-t border-[var(--border-default)]">
                    <label className="text-xs font-bold ws-title block">Text Shadow</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs ws-muted">Shadow Size (px)</span>
                          <span className="text-xs font-mono font-bold text-[var(--brand-text)]">
                            {draft.textShadowSize ?? 4}px
                          </span>
                        </div>
                        <input
                          id="input-shadow-size"
                          type="number"
                          min={0}
                          max={24}
                          step={1}
                          value={draft.textShadowSize ?? 4}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setDraft((prev) => ({
                                ...prev,
                                textShadowSize: Math.max(0, Math.min(24, val)),
                              }));
                            }
                          }}
                          className="w-full ws-input font-mono text-xs"
                        />
                        <span className="text-[10px] ws-muted block">0 = No drop shadow</span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs ws-muted block">Shadow Color</span>
                        <div className="flex items-center gap-2 border border-[var(--border-default)] rounded px-2.5 py-1 bg-[var(--surface-default)]">
                          <input
                            type="color"
                            value={draft.textShadowColor || '#000000'}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                textShadowColor: e.target.value,
                              }))
                            }
                            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                          />
                          <span className="font-mono text-xs uppercase">
                            {draft.textShadowColor || '#000000'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Text Background Box Controls (Size, Corner Radius, Opacity, Color) */}
                  <div className="space-y-3 pt-2 border-t border-[var(--border-default)]">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold ws-title">
                        Background Box & Corner Radius
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) => {
                            const isCurrentlyOn =
                              (prev.textBackgroundSize as number) > 0 &&
                              prev.textBackgroundOpacity > 0.05;
                            return {
                              ...prev,
                              textBackgroundSize: isCurrentlyOn ? 0 : 12,
                              textBackgroundOpacity: isCurrentlyOn ? 0.0 : 0.65,
                              textBackgroundCornerRadius: 8,
                            };
                          })
                        }
                        className="text-[11px] font-semibold text-[var(--brand-text)] hover:underline"
                      >
                        {(draft.textBackgroundSize as number) > 0 && draft.textBackgroundOpacity > 0.05
                          ? 'Disable Box'
                          : 'Enable Standard Box'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] ws-muted">Padding (px)</span>
                          <span className="text-[11px] font-mono font-bold">
                            {draft.textBackgroundSize}px
                          </span>
                        </div>
                        <input
                          id="input-bg-size"
                          type="number"
                          min={0}
                          max={60}
                          step={2}
                          value={draft.textBackgroundSize as number}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setDraft((prev) => ({
                                ...prev,
                                textBackgroundSize: Math.max(0, Math.min(60, val)),
                              }));
                            }
                          }}
                          className="w-full ws-input font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] ws-muted">Radius (px)</span>
                          <span className="text-[11px] font-mono font-bold">
                            {draft.textBackgroundCornerRadius}px
                          </span>
                        </div>
                        <input
                          id="input-bg-radius"
                          type="number"
                          min={0}
                          max={32}
                          step={1}
                          value={draft.textBackgroundCornerRadius}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setDraft((prev) => ({
                                ...prev,
                                textBackgroundCornerRadius: Math.max(0, Math.min(32, val)),
                              }));
                            }
                          }}
                          className="w-full ws-input font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] ws-muted">Opacity</span>
                          <span className="text-[11px] font-mono font-bold">
                            {Math.round(draft.textBackgroundOpacity * 100)}%
                          </span>
                        </div>
                        <input
                          id="input-bg-opacity"
                          type="number"
                          min={0.0}
                          max={1.0}
                          step={0.05}
                          value={draft.textBackgroundOpacity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              setDraft((prev) => ({
                                ...prev,
                                textBackgroundOpacity: Math.max(0.0, Math.min(1.0, val)),
                              }));
                            }
                          }}
                          className="w-full ws-input font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] ws-muted block">Color</span>
                        <div className="flex items-center gap-1.5 border border-[var(--border-default)] rounded px-2 py-1 bg-[var(--surface-default)]">
                          <input
                            type="color"
                            value={draft.textBackgroundColor || '#000000'}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                textBackgroundColor: e.target.value,
                              }))
                            }
                            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                          />
                          <span className="font-mono text-[11px] uppercase truncate">
                            {draft.textBackgroundColor}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Live Preview Canvas */}
          <div className="w-full md:w-[380px] lg:w-[420px] bg-[var(--surface-subtle)] p-4 sm:p-5 flex flex-col items-center justify-between shrink-0 select-none overflow-hidden">
            <div className="w-full flex items-center justify-between pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold ws-title">
                <Eye className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                <span>Live Interactive Preview</span>
              </div>
              <span className="text-[10px] font-mono ws-muted">
                {draft.aspectRatio} • {draft.preset}
              </span>
            </div>

            {/* Video Canvas Container */}
            <div className="flex-1 w-full flex items-center justify-center p-1">
              <div
                ref={previewCanvasRef}
                id="caption-preview-canvas"
                className={`relative bg-[#0d1117] rounded-lg shadow-inner overflow-hidden border border-[var(--border-default)] flex items-center justify-center transition-all ${getAspectRatioClasses()}`}
                style={{ touchAction: 'none' }}
              >
                {/* Visual Video Frame Backdrop Mockup */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/40 pointer-events-none" />

                <div className="absolute inset-x-0 bottom-2 text-center text-[10px] text-white/30 font-mono tracking-wider pointer-events-none">
                  PREVIEW STAGE
                </div>

                {/* Vertical Center Axis Snap Guide */}
                {showSnapX && (
                  <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0 border-l border-dashed border-cyan-400 z-10 pointer-events-none opacity-80" />
                )}

                {/* Horizontal Center Axis Snap Guide */}
                {showSnapY && (
                  <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0 border-t border-dashed border-cyan-400 z-10 pointer-events-none opacity-80" />
                )}

                {/* Layer 0: Background Box (matches ASS vector drawing dimensions exactly) */}
                {layout.backgroundBox.hasBox && draft.enabled !== false && (
                  <div
                    className="absolute pointer-events-none transition-all"
                    style={{
                      left: `${layout.backgroundBox.x1 * previewScale}px`,
                      top: `${layout.backgroundBox.y1 * previewScale}px`,
                      width: `${layout.backgroundBox.width * previewScale}px`,
                      height: `${layout.backgroundBox.height * previewScale}px`,
                      borderRadius: `${layout.backgroundBox.radius * previewScale}px`,
                      backgroundColor: hexToRgba(
                        draft.textBackgroundColor,
                        draft.textBackgroundOpacity
                      ),
                    }}
                  />
                )}

                {/* Layer 1: Draggable Caption Container */}
                <div
                  ref={dragContainerRef}
                  id="draggable-caption-container"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={(e) => stopDrag(e.pointerId)}
                  onLostPointerCapture={(e) => stopDrag(e.pointerId)}
                  className={`absolute z-20 cursor-grab active:cursor-grabbing text-center select-none ${
                    isDragging ? 'ring-1 ring-cyan-400/80 rounded' : ''
                  }`}
                  style={{
                    left: `${layout.textBlock.centerX * previewScale}px`,
                    top: `${layout.textBlock.centerY * previewScale}px`,
                    transform: 'translate(-50%, -50%)',
                    width: `${layout.textBlock.width * previewScale + 16}px`,
                    touchAction: 'none',
                  }}
                >
                  {draft.enabled === false ? (
                    <div className="px-3 py-1 bg-black/70 text-white/50 text-[11px] italic rounded whitespace-nowrap pointer-events-none">
                      Captions Disabled (Framing Only)
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center pointer-events-none">
                      {layout.lines.map((line, lIdx) => (
                        <div
                          key={lIdx}
                          className="flex items-center justify-center whitespace-nowrap pointer-events-none"
                          style={{
                            height: `${line.lineHeight * previewScale}px`,
                            fontFamily: draft.textFont,
                            fontWeight:
                              draft.textWeight === 'normal'
                                ? 500
                                : draft.textWeight === 'bold'
                                ? 700
                                : 900,
                            fontStyle: draft.textStyle === 'italic' ? 'italic' : 'normal',
                            opacity: draft.textOpacity,
                            textTransform: draft.textUppercase ? 'uppercase' : 'none',
                            textShadow: shadowCss,
                          }}
                        >
                          {line.words.map((pw) => {
                            const isKaraokeActive =
                              draft.preset === 'karaoke' && pw.originalIndex === activeWordIdx;

                            const wordColor = isKaraokeActive
                              ? getWordHighlightColor(
                                  draft.highlightColorMode,
                                  draft.highlightColor,
                                  pw.originalIndex
                                )
                              : draft.textColor || '#FFFFFF';

                            let animClass = 'caption-word-stable';
                            if (isKaraokeActive) {
                              if (draft.highlightAnimation === 'pop') {
                                animClass = 'caption-active-pop-bounce';
                              } else if (draft.highlightAnimation === 'scale') {
                                animClass = 'caption-active-scale-up';
                              } else {
                                animClass = 'caption-active-none';
                              }
                            }

                            return (
                              <span
                                key={pw.originalIndex}
                                className={`${animClass} pointer-events-none`}
                                style={{
                                  color: wordColor,
                                  fontSize: `${previewFontSize}px`,
                                  lineHeight: 1.15,
                                  margin: `0 ${(layout.spaceWidth * previewScale) / 2}px`,
                                  WebkitTextStroke:
                                    previewOutlineSize > 0
                                      ? `${previewOutlineSize}px ${draft.textOutlineColor || '#000000'}`
                                      : undefined,
                                }}
                              >
                                {pw.word}
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full text-center pt-2">
              <span className="text-[11px] ws-muted">
                Drag caption freely on canvas • Snap to axis guides
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer: Burn Captions Toggle & Actions */}
        <div className="px-5 py-3.5 border-t border-[var(--border-default)] bg-[var(--surface-elevated)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          {/* Burn Captions Toggle Switch */}
          <div className="flex items-start gap-2.5">
            <input
              id="switch-burn-captions"
              type="checkbox"
              checked={draft.enabled !== false}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  enabled: e.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] cursor-pointer"
            />
            <div>
              <label
                htmlFor="switch-burn-captions"
                className="text-xs font-bold ws-title cursor-pointer block"
              >
                Burn Captions into Video
              </label>
              <p className="text-[11px] ws-muted max-w-md">
                When enabled, captions will be permanently rendered directly into the exported video frames using FFmpeg. When disabled, clean video without captions will be generated.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 justify-end">
            <button
              id="btn-caption-modal-reset"
              type="button"
              onClick={handleResetDefaults}
              className="ws-btn-secondary text-xs"
              title="Reset all settings to default"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              id="btn-caption-modal-save"
              type="button"
              onClick={handleSaveOnly}
              className="ws-btn-secondary text-xs font-semibold"
            >
              Save Settings
            </button>

            <button
              id="btn-caption-modal-apply-proceed"
              type="button"
              onClick={handleApplyAndProceedClick}
              disabled={isSaving}
              className="ws-btn-primary text-xs font-bold"
            >
              <span>{applyButtonLabel || `Apply Style & Extract Clips`}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

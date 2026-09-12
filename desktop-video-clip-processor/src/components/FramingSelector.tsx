import React from 'react';
import { Crop, Scan, RotateCcw } from 'lucide-react';
import { FramingConfig, FramingMode, DEFAULT_FRAMING_CONFIG } from '../framing/framingTypes';

interface FramingSelectorProps {
  config?: FramingConfig;
  onChange: (newConfig: FramingConfig) => void;
  disabled?: boolean;
  variant?: 'card' | 'embedded';
}

export const FramingSelector: React.FC<FramingSelectorProps> = ({
  config = DEFAULT_FRAMING_CONFIG,
  onChange,
  disabled = false,
  variant = 'card',
}) => {
  const currentMode: FramingMode = config.mode || 'face_tracking';
  const posX = config.cropPositionX !== undefined ? Math.round(config.cropPositionX * 100) : 50;
  const posY = config.cropPositionY !== undefined ? Math.round(config.cropPositionY * 100) : 50;

  const handleModeChange = (mode: FramingMode) => {
    if (disabled) return;
    onChange({
      ...config,
      mode,
    });
  };

  const handleResetCrop = () => {
    if (disabled) return;
    onChange({
      ...config,
      mode: 'crop',
      cropPositionX: 0.5,
      cropPositionY: 0.5,
      cropZoom: 1.0,
    });
  };

  const containerClasses =
    variant === 'card'
      ? 'ws-card p-4 space-y-3.5'
      : 'space-y-3.5';

  return (
    <div id="framing-selector-card" className={containerClasses}>
      {variant === 'card' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crop className="w-4 h-4 text-[var(--brand-primary)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Framing</h3>
          </div>
          <span className="text-[11px] font-mono text-[var(--text-muted)]">
            {currentMode === 'face_tracking' ? 'Speaker-Aware' : 'Manual Framing'}
          </span>
        </div>
      )}

      {/* Two Mode Buttons */}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Framing Mode Selection">
        <button
          id="btn-framing-mode-crop"
          type="button"
          disabled={disabled}
          onClick={() => handleModeChange('crop')}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
            currentMode === 'crop'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border-default)]'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <Crop className="w-3.5 h-3.5" />
          <span>Crop</span>
        </button>

        <button
          id="btn-framing-mode-face-tracking"
          type="button"
          disabled={disabled}
          onClick={() => handleModeChange('face_tracking')}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
            currentMode === 'face_tracking'
              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
              : 'bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border-default)]'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <Scan className="w-3.5 h-3.5" />
          <span>Face Tracking</span>
        </button>
      </div>

      {/* Mode Explanation */}
      <div className="text-xs text-[var(--text-secondary)] leading-relaxed bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded-md p-2.5">
        {currentMode === 'crop' ? (
          <div>
            <p className="font-semibold text-[var(--text-primary)] mb-1">Crop</p>
            <p>Manually control the horizontal and vertical framing position in the live preview.</p>
          </div>
        ) : (
          <div>
            <p className="font-semibold text-[var(--text-primary)] mb-1">Face Tracking</p>
            <p>
              Automatically follows the current speaker when possible and maintains a suitable face
              target when speaker detection is uncertain.
            </p>
          </div>
        )}
      </div>

      {/* Manual Crop Settings (shown only when Crop mode is active) */}
      {currentMode === 'crop' && (
        <div id="crop-manual-controls" className="pt-2 border-t border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">Manual Adjustments</span>
            <button
              id="btn-reset-crop"
              type="button"
              disabled={disabled}
              onClick={handleResetCrop}
              className="flex items-center gap-1 text-[11px] text-[var(--brand-text)] hover:underline cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Center</span>
            </button>
          </div>

          <div className="space-y-2.5">
            <div>
              <div className="flex justify-between text-[11px] text-[var(--text-secondary)] mb-1">
                <span>Horizontal Pan</span>
                <span className="font-mono font-bold text-[var(--brand-text)]">{posX}%</span>
              </div>
              <input
                id="slider-crop-pos-x"
                type="range"
                min="0"
                max="100"
                value={posX}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    ...config,
                    cropPositionX: parseInt(e.target.value, 10) / 100,
                  })
                }
                className="w-full h-1.5 bg-[var(--surface-sunken)] rounded-lg appearance-none cursor-pointer accent-[var(--brand-primary)]"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-[var(--text-secondary)] mb-1">
                <span>Vertical Pan</span>
                <span className="font-mono font-bold text-[var(--brand-text)]">{posY}%</span>
              </div>
              <input
                id="slider-crop-pos-y"
                type="range"
                min="0"
                max="100"
                value={posY}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    ...config,
                    cropPositionY: parseInt(e.target.value, 10) / 100,
                  })
                }
                className="w-full h-1.5 bg-[var(--surface-sunken)] rounded-lg appearance-none cursor-pointer accent-[var(--brand-primary)]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

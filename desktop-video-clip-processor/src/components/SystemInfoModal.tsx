import React from 'react';
import {
  X,
  Cpu,
  HardDrive,
  Monitor,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Terminal,
} from 'lucide-react';

interface SystemInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemStatus: {
    ffmpeg: boolean;
    ffprobe: boolean;
    whisperEngine: string;
    localProcessingOnly: boolean;
    nodeVersion?: string;
    platform?: string;
  } | null;
}

export const SystemInfoModal: React.FC<SystemInfoModalProps> = ({
  isOpen,
  onClose,
  systemStatus,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="system-info-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="system-info-modal-dialog"
        className="ws-panel max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl p-6 space-y-5 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center font-bold">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold ws-title">
                ClipRush System Diagnostics & Privacy
              </h2>
              <p className="text-xs ws-muted">
                Local media engine health, Whisper model runtime, and privacy architecture
              </p>
            </div>
          </div>

          <button
            id="btn-close-system-info-modal"
            type="button"
            onClick={onClose}
            className="ws-btn-secondary p-1"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 100% LOCAL & Privacy Guarantee Card */}
        <div className="p-3.5 rounded border border-[var(--success-border)] bg-[var(--success-subtle)] flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-[var(--success-text)] shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--success-text)]">100% Local Processing & Privacy</span>
              <span className="ws-badge-success text-[10px]">
                No Cloud Uploads
              </span>
            </div>
            <div className="text-[var(--text-secondary)] leading-relaxed text-[11px]">
              All video probing, audio extraction, local Whisper speech recognition, and 9:16 vertical video rendering run strictly on your local machine. Zero video, audio, or transcript data ever leaves your device.
            </div>
          </div>
        </div>

        {/* Diagnostics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* FFmpeg Engine */}
          <div className="p-3.5 ws-well space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold ws-title">
                <Cpu className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                <span>FFmpeg Engine</span>
              </div>
              {systemStatus?.ffmpeg ? (
                <span className="flex items-center gap-1 text-[var(--success-text)] font-semibold text-[11px]">
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[var(--warning-text)] font-semibold text-[11px]">
                  <AlertCircle className="w-3 h-3" /> Standby
                </span>
              )}
            </div>
            <p className="text-[11px] ws-muted">
              Handles 16 kHz mono WAV audio extraction and center-crop 9:16 vertical video rendering.
            </p>
          </div>

          {/* FFprobe Inspector */}
          <div className="p-3.5 ws-well space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold ws-title">
                <Terminal className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                <span>FFprobe Inspector</span>
              </div>
              {systemStatus?.ffprobe ? (
                <span className="flex items-center gap-1 text-[var(--success-text)] font-semibold text-[11px]">
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[var(--warning-text)] font-semibold text-[11px]">
                  <AlertCircle className="w-3 h-3" /> Standby
                </span>
              )}
            </div>
            <p className="text-[11px] ws-muted">
              Inspects source resolution, audio sample rates, video codecs, and frame duration.
            </p>
          </div>

          {/* Local Whisper ONNX Model */}
          <div className="p-3.5 ws-well space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold ws-title">
                <HardDrive className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                <span>Local Whisper Model</span>
              </div>
              <span className="flex items-center gap-1 text-[var(--success-text)] font-semibold text-[11px]">
                <CheckCircle2 className="w-3 h-3" /> CPU Ready
              </span>
            </div>
            <p className="text-[11px] ws-muted">
              Engine: {systemStatus?.whisperEngine || 'Local ONNX CPU Runtime'}. Produces timestamped segments with SRT precision.
            </p>
          </div>

          {/* Host Runtime */}
          <div className="p-3.5 ws-well space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold ws-title">
                <Monitor className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                <span>Host Runtime</span>
              </div>
              <span className="ws-muted font-mono text-[11px]">
                {systemStatus?.platform === 'win32' ? 'Windows x64' : 'Linux / Desktop'}
              </span>
            </div>
            <p className="text-[11px] ws-muted">
              Node: {systemStatus?.nodeVersion || 'v22'} • Local temp folder lifecycle management.
            </p>
          </div>
        </div>

        {/* Close Action */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="ws-btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

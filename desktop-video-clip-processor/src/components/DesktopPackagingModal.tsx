import React from 'react';
import {
  X,
  Package,
  ShieldCheck,
} from 'lucide-react';

interface DesktopPackagingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DesktopPackagingModal: React.FC<DesktopPackagingModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="desktop-packaging-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="ws-panel max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl p-6 space-y-5 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center font-bold">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold ws-title">
                Windows Desktop Packaging Architecture
              </h2>
              <p className="text-xs ws-muted">
                Standalone installer (.exe) with bundled FFmpeg and local ONNX Whisper
              </p>
            </div>
          </div>

          <button
            id="btn-close-modal"
            type="button"
            onClick={onClose}
            className="ws-btn-secondary p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 100% Offline / Zero Cloud Guarantee */}
        <div className="p-3.5 rounded border border-[var(--brand-border)] bg-[var(--brand-subtle)] flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-[var(--brand-primary)] shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold text-[var(--brand-text)]">Complete Privacy & Local Execution</div>
            <div className="text-[var(--text-secondary)] leading-relaxed text-[11px]">
              This application requires <strong>zero API keys</strong> and performs <strong>zero cloud uploads</strong>.
              All video probing, audio extraction, transcription, and 9:16 vertical video rendering happen strictly on the local machine.
            </div>
          </div>
        </div>

        {/* Packaging Blueprint */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider ws-muted">
            Bundled Desktop Architecture
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 ws-well">
              <div className="font-semibold ws-title">Self-Contained Executable</div>
              <p className="text-[11px] ws-muted mt-1">
                Packages the Node.js backend runtime and React frontend into a unified Windows application window using Electron or Tauri.
              </p>
            </div>

            <div className="p-3 ws-well">
              <div className="font-semibold ws-title">Bundled Binaries</div>
              <p className="text-[11px] ws-muted mt-1">
                Static builds of <code>ffmpeg.exe</code> and <code>ffprobe.exe</code> are bundled inside the app directory, requiring no system PATH setup.
              </p>
            </div>

            <div className="p-3 ws-well">
              <div className="font-semibold ws-title">Offline Whisper Engine</div>
              <p className="text-[11px] ws-muted mt-1">
                ONNX CPU runtime with pre-quantized Whisper model weights bundled in the installer for instant offline speech recognition.
              </p>
            </div>

            <div className="p-3 ws-well">
              <div className="font-semibold ws-title">Native File Dialogs</div>
              <p className="text-[11px] ws-muted mt-1">
                Integrates with Windows Explorer file open and folder picker dialogs for straightforward video selection and folder management.
              </p>
            </div>
          </div>
        </div>

        {/* Close Button */}
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

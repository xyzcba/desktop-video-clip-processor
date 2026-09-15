import React from 'react';
import {
  Zap,
  Cpu,
  HelpCircle,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';
import { ProjectSession, AppTheme } from '../types';

interface HeaderProps {
  session: ProjectSession | null;
  theme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  onOpenSystemInfo: () => void;
  onOpenPackagingModal: () => void;
  onNewProject: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  session,
  theme,
  onSelectTheme,
  onOpenSystemInfo,
  onOpenPackagingModal,
  onNewProject,
}) => {
  return (
    <header id="app-header" className="sticky top-0 z-30 shadow-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--brand-primary)] flex items-center justify-center text-white shadow-xs font-bold shrink-0">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 id="app-title" className="text-base font-bold tracking-tight ws-title leading-tight">
                ClipRush
              </h1>
              <span className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-[var(--brand-subtle)] text-[var(--brand-text)] border border-[var(--brand-border)]">
                AI Workstation
              </span>
            </div>
            <p className="text-xs ws-muted leading-tight mt-0.5">
              Long-Form to 9:16 Vertical Viral Clips Workstation
            </p>
          </div>
        </div>

        {/* Header Controls: Theme Switcher & Utility Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Theme Selector: Light vs Semi-dark */}
          <div
            id="theme-selector-group"
            className="flex items-center ws-well p-0.5 text-xs rounded"
            role="radiogroup"
            aria-label="Theme selector"
          >
            <button
              id="theme-btn-light"
              type="button"
              onClick={() => onSelectTheme('light')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-xs border border-[var(--border-default)]'
                  : 'ws-muted hover:text-[var(--text-primary)]'
              }`}
              title="Switch to Light theme"
              aria-checked={theme === 'light'}
              role="radio"
            >
              <Sun className="w-3 h-3 text-amber-500" />
              <span>Light</span>
            </button>

            <button
              id="theme-btn-semidark"
              type="button"
              onClick={() => onSelectTheme('semi-dark')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                theme === 'semi-dark'
                  ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                  : 'ws-muted hover:text-[var(--text-primary)]'
              }`}
              title="Switch to Semi-dark theme"
              aria-checked={theme === 'semi-dark'}
              role="radio"
            >
              <Moon className="w-3 h-3" />
              <span>Semi-dark</span>
            </button>
          </div>

          {/* System Information & Diagnostics Dialog Trigger */}
          <button
            id="btn-open-system-info"
            type="button"
            onClick={onOpenSystemInfo}
            className="ws-btn-secondary"
            title="View FFmpeg, Whisper model health, and local privacy guarantees"
          >
            <Cpu className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
            <span>System Info</span>
          </button>

          {/* Windows Desktop Packaging Modal Trigger */}
          <button
            id="btn-desktop-packaging"
            type="button"
            onClick={onOpenPackagingModal}
            className="hidden sm:inline-flex ws-btn-secondary"
            title="View Windows Desktop Installer and Packaging details"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
            <span>Windows Installer (.exe)</span>
          </button>

          {/* New Project Button */}
          {session?.video && (
            <button
              id="btn-new-project"
              type="button"
              onClick={onNewProject}
              className="ws-btn-secondary text-[var(--error-text)] hover:border-[var(--error-border)]"
              title="Start a new video project"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>New Project</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

import React from 'react';
import {
  Zap,
  Cpu,
  HelpCircle,
  RotateCcw,
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
    <header id="app-header" className="sticky top-0 z-30 transition-colors border-b border-[var(--border-default)] bg-[var(--surface-primary)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-[var(--brand-primary)] flex items-center justify-center text-white shadow-xs font-bold shrink-0">
            <Zap className="w-3.5 h-3.5 fill-white" />
          </div>
          <div className="min-w-0 flex items-baseline gap-2.5">
            <h1 id="app-title" className="text-sm sm:text-base font-bold tracking-tight text-[var(--text-primary)] leading-none">
              ClipRush
            </h1>
            <span className="hidden md:inline-block text-[11px] text-[var(--text-muted)] tracking-tight leading-none truncate">
              Long-Form to 9:16 Vertical Viral Clips Workstation
            </span>
          </div>
        </div>

        {/* Header Controls: Workspace Action + Secondary Utilities + Theme */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* New Project (Workspace-level action when a video project is active) */}
          {session?.video && (
            <button
              id="btn-new-project"
              type="button"
              onClick={onNewProject}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border-default)] transition-colors active:scale-[0.98] cursor-pointer"
              title="Start a new video project (resets current progress)"
            >
              <RotateCcw className="w-3 h-3 text-[var(--text-muted)]" />
              <span>New Project</span>
            </button>
          )}

          {session?.video && (
            <div className="h-3.5 w-px bg-[var(--border-subtle)] mx-0.5 hidden sm:block" />
          )}

          {/* Secondary Utilities Group */}
          <div className="flex items-center gap-1">
            {/* System Info / Diagnostics */}
            <button
              id="btn-open-system-info"
              type="button"
              onClick={onOpenSystemInfo}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-normal rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              title="System Diagnostics & Privacy Guarantees"
            >
              <Cpu className="w-3 h-3 text-[var(--text-muted)]" />
              <span className="hidden lg:inline">Diagnostics</span>
            </button>

            {/* Windows Desktop Packaging Modal Trigger */}
            <button
              id="btn-desktop-packaging"
              type="button"
              onClick={onOpenPackagingModal}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-normal rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              title="Windows Installer (.exe) Architecture"
            >
              <HelpCircle className="w-3 h-3 text-[var(--text-muted)]" />
              <span className="hidden lg:inline">Packaging</span>
            </button>
          </div>

          <div className="h-3.5 w-px bg-[var(--border-subtle)] mx-0.5" />

          {/* Compact Theme Segmented Control */}
          <div
            id="theme-selector-group"
            className="inline-flex items-center p-0.5 rounded bg-[var(--surface-subtle)] border border-[var(--border-subtle)]"
            role="radiogroup"
            aria-label="Theme selector"
          >
            <button
              id="theme-btn-light"
              type="button"
              onClick={() => onSelectTheme('light')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-xs border border-[var(--border-default)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="Light theme"
              aria-checked={theme === 'light'}
              role="radio"
            >
              <Sun className="w-2.5 h-2.5 text-amber-500" />
              <span className="hidden sm:inline text-[10px]">Light</span>
            </button>

            <button
              id="theme-btn-semidark"
              type="button"
              onClick={() => onSelectTheme('semi-dark')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                theme === 'semi-dark'
                  ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title="Semi-dark theme"
              aria-checked={theme === 'semi-dark'}
              role="radio"
            >
              <Moon className="w-2.5 h-2.5" />
              <span className="hidden sm:inline text-[10px]">Dark</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

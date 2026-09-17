import React from 'react';
import {
  FileVideo,
  Mic,
  Sparkles,
  Scissors,
  Check,
} from 'lucide-react';
import { AppStep, ProjectSession } from '../types';

interface StepIndicatorProps {
  currentStep: AppStep;
  session: ProjectSession | null;
  onSelectStep: (step: AppStep) => void;
}

interface StepItem {
  key: AppStep;
  number: number;
  label: string;
  sublabel: string;
  icon: React.ElementType;
}

// 4-Stage Rush Creative Workstation Pipeline
const STEPS: StepItem[] = [
  {
    key: 'video',
    number: 1,
    label: 'VIDEO',
    sublabel: 'Source & Output',
    icon: FileVideo,
  },
  {
    key: 'transcription',
    number: 2,
    label: 'TRANSCRIPTION',
    sublabel: 'Speech & Subtitles',
    icon: Mic,
  },
  {
    key: 'viral_json',
    number: 3,
    label: 'AI HIGHLIGHTS',
    sublabel: 'Curate Moments',
    icon: Sparkles,
  },
  {
    key: 'clip_generation',
    number: 4,
    label: 'CLIP GENERATION',
    sublabel: 'Render Vertical 9:16',
    icon: Scissors,
  },
];

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  session,
  onSelectStep,
}) => {
  const getStepStatus = (stepKey: AppStep): 'completed' | 'active' | 'enabled' | 'disabled' => {
    if (stepKey === currentStep) return 'active';

    if (stepKey === 'video') {
      return session?.video ? 'completed' : 'active';
    }
    if (stepKey === 'transcription') {
      if (session?.masterTranscript) return 'completed';
      if (session?.video) return 'enabled';
      return 'disabled';
    }
    if (stepKey === 'viral_json') {
      if (session?.clipJobs && session.clipJobs.length > 0) return 'completed';
      if (session?.masterTranscript) return 'enabled';
      return 'disabled';
    }
    if (stepKey === 'clip_generation') {
      const allDone =
        session?.clipJobs &&
        session.clipJobs.length > 0 &&
        session.clipJobs.every((j) => j.status === 'completed' || j.status === 'failed');
      if (allDone) return 'completed';
      if (session?.clipJobs && session.clipJobs.length > 0) return 'enabled';
      return 'disabled';
    }

    return 'disabled';
  };

  return (
    <nav
      id="workflow-step-indicator"
      aria-label="Workflow Steps"
      className="border-b border-[var(--border-default)] bg-[var(--surface-primary)] px-4 sm:px-6 lg:px-8 py-2 transition-colors select-none"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-1 sm:gap-2">
        {STEPS.map((step, idx) => {
          const status = getStepStatus(step.key);
          const isClickable = status !== 'disabled';
          const isCompleted = status === 'completed';
          const isActive = status === 'active';

          return (
            <React.Fragment key={step.key}>
              <button
                id={`step-button-${step.key}`}
                onClick={() => isClickable && onSelectStep(step.key)}
                disabled={!isClickable}
                aria-current={isActive ? 'step' : undefined}
                className={`relative group flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded transition-all duration-150 text-left whitespace-nowrap ${
                  isActive
                    ? 'bg-[var(--brand-subtle)] border border-[var(--brand-border)] shadow-xs'
                    : isCompleted || status === 'enabled'
                    ? 'hover:bg-[var(--surface-hover)] border border-transparent cursor-pointer active:scale-[0.98]'
                    : 'opacity-40 cursor-not-allowed border border-transparent'
                }`}
              >
                {/* Step Indicator Badge: Checkmark if completed, Step number otherwise */}
                <div
                  className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${
                    isActive
                      ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                      : isCompleted
                      ? 'bg-[var(--success-subtle)] text-[var(--success-text)] border border-[var(--success-border)]'
                      : status === 'enabled'
                      ? 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-default)]'
                      : 'bg-transparent text-[var(--text-muted)] border border-[var(--border-subtle)]'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-3 h-3 stroke-[2.5]" />
                  ) : (
                    <span>{step.number}</span>
                  )}
                </div>

                {/* Primary Stage Label & Secondary Sublabel */}
                <div className="flex flex-col min-w-0">
                  <span
                    className={`text-[11px] tracking-wider font-bold leading-tight uppercase transition-colors ${
                      isActive
                        ? 'text-[var(--brand-text)]'
                        : isCompleted
                        ? 'text-[var(--text-primary)]'
                        : status === 'enabled'
                        ? 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] tracking-tight leading-none mt-0.5 hidden lg:inline-block">
                    {step.sublabel}
                  </span>
                </div>

                {/* Active Underline Indicator */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 bg-[var(--brand-primary)] rounded-full"
                    aria-hidden="true"
                  />
                )}
              </button>

              {/* Connecting Rush Workflow Track */}
              {idx < STEPS.length - 1 && (
                <div
                  className="flex-1 hidden sm:flex items-center px-1 sm:px-2 min-w-3 max-w-16"
                  aria-hidden="true"
                >
                  <div
                    className={`h-0.5 w-full rounded-full transition-colors duration-200 ${
                      isCompleted
                        ? 'bg-[var(--brand-primary)] opacity-40'
                        : 'bg-[var(--border-default)] opacity-60'
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};


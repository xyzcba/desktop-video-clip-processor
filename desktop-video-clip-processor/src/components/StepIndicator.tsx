import React from 'react';
import {
  FileVideo,
  Mic,
  Sparkles,
  Scissors,
  CheckCircle2,
  ChevronRight,
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

// Exactly 5-Stage Primary Workflow
const STEPS: StepItem[] = [
  {
    key: 'video',
    number: 1,
    label: 'Video & Output Setup',
    sublabel: 'Source & Destination',
    icon: FileVideo,
  },
  {
    key: 'transcription',
    number: 2,
    label: 'Transcription',
    sublabel: 'Speech Subtitles',
    icon: Mic,
  },
  {
    key: 'viral_json',
    number: 3,
    label: 'LLM / Viral Clip JSON',
    sublabel: 'Prompt & Highlights',
    icon: Sparkles,
  },
  {
    key: 'clip_generation',
    number: 4,
    label: 'Clip Generation',
    sublabel: '9:16 Vertical Video',
    icon: Scissors,
  },
  {
    key: 'results',
    number: 5,
    label: 'Results',
    sublabel: 'Player & Details',
    icon: CheckCircle2,
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
      const hasCompletedClips = session?.clipJobs?.some((j) => j.status === 'completed');
      if (hasCompletedClips) return 'completed';
      if (session?.clipJobs && session.clipJobs.length > 0) return 'enabled';
      return 'disabled';
    }
    if (stepKey === 'results') {
      const hasCompletedClips = session?.clipJobs?.some((j) => j.status === 'completed');
      if (hasCompletedClips) return 'enabled';
      return 'disabled';
    }

    return 'disabled';
  };

  return (
    <nav id="workflow-step-indicator" aria-label="Workflow Steps" className="py-2.5 px-4 sm:px-6 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between overflow-x-auto gap-2 no-scrollbar">
        {STEPS.map((step, idx) => {
          const status = getStepStatus(step.key);
          const Icon = step.icon;
          const isClickable = status !== 'disabled';

          return (
            <React.Fragment key={step.key}>
              <button
                id={`step-button-${step.key}`}
                onClick={() => isClickable && onSelectStep(step.key)}
                disabled={!isClickable}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded text-left transition whitespace-nowrap ${
                  status === 'active'
                    ? 'bg-[var(--brand-subtle)] border border-[var(--brand-border)] shadow-xs'
                    : status === 'completed' || status === 'enabled'
                    ? 'hover:bg-[var(--surface-hover)] border border-transparent text-[var(--text-secondary)]'
                    : 'opacity-40 cursor-not-allowed border border-transparent text-[var(--text-muted)]'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold shrink-0 transition ${
                    status === 'active'
                      ? 'bg-[var(--brand-primary)] text-white'
                      : status === 'completed'
                      ? 'bg-[var(--success-solid)] text-white'
                      : status === 'enabled'
                      ? 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-default)]'
                      : 'bg-[var(--surface-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold leading-tight flex items-center gap-1.5">
                    <span className={status === 'active' ? 'text-[var(--brand-text)] font-bold' : 'ws-title'}>
                      {step.number}. {step.label}
                    </span>
                    {status === 'completed' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--success-solid)] shrink-0"></span>
                    )}
                  </div>
                  <div className="text-[10px] ws-muted leading-tight mt-0.5">
                    {step.sublabel}
                  </div>
                </div>
              </button>

              {idx < STEPS.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-[var(--border-strong)] shrink-0 hidden md:block" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};

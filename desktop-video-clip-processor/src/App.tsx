import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Header } from './components/Header';
import { StepIndicator } from './components/StepIndicator';
import { Step1Video } from './components/Step1Video';
import { Step2AudioWhisper } from './components/Step2AudioWhisper';
import { Step4ViralJson } from './components/Step4ViralJson';
import { Step5ClipGeneration } from './components/Step5ClipGeneration';
import { Step6Results } from './components/Step6Results';
import { DesktopPackagingModal } from './components/DesktopPackagingModal';
import { SystemInfoModal } from './components/SystemInfoModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppStep, ProjectSession, AppTheme, CaptionConfig } from './types';
import { FramingConfig } from './framing/framingTypes';

// Helper to normalize session responses that might be wrapped in { session: ... }
function normalizeSession(data: any): ProjectSession | null {
  if (!data) return null;
  if (data.session && typeof data.session === 'object') {
    return data.session as ProjectSession;
  }
  return data as ProjectSession;
}

export default function App() {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [currentStep, setCurrentStep] = useState<AppStep>('video');
  const [isPackagingModalOpen, setIsPackagingModalOpen] = useState(false);
  const [isSystemInfoOpen, setIsSystemInfoOpen] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Persistent theme preference: White / Light or Semi-dark (default: semi-dark)
  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem('desktop_video_theme');
      if (saved === 'light' || saved === 'semi-dark') return saved;
    } catch {}
    return 'semi-dark';
  });

  const handleSelectTheme = (newTheme: AppTheme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem('desktop_video_theme', newTheme);
    } catch {}
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const [systemStatus, setSystemStatus] = useState<{
    ffmpeg: boolean;
    ffprobe: boolean;
    whisperEngine: string;
    localProcessingOnly: boolean;
    nodeVersion?: string;
    platform?: string;
  } | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch system diagnostics on boot and auto-initialize session if null
  useEffect(() => {
    let isMounted = true;
    fetch('/api/system/status')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isMounted) setSystemStatus(data);
      })
      .catch((err) => {
        console.warn('System status check:', err?.message || err);
      });

    // Auto-create session if none exists so outputDir is available in Stage 1
    fetch('/api/session/create', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          const s = normalizeSession(data);
          if (s) setSession((prev) => prev || s);
        }
      })
      .catch((err) => console.warn('Initial session creation:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  // Polling for active background processes (transcription or clip rendering)
  useEffect(() => {
    if (!session?.sessionId) return;

    const shouldPoll = session.isTranscribing || session.isGeneratingClips;

    if (shouldPoll) {
      pollingRef.current = setInterval(() => {
        (async () => {
          try {
            const res = await fetch(`/api/session/${session.sessionId}`);
            if (res.ok) {
              const raw = await res.json().catch(() => null);
              if (raw) {
                const updated = normalizeSession(raw);
                if (updated) {
                  setSession(updated);
                }
              }
            }
          } catch (err) {
            console.warn('Session polling error:', err);
          }
        })().catch(() => {});
      }, 1500);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [session?.sessionId, session?.isTranscribing, session?.isGeneratingClips, currentStep]);

  // Step 1: Video loaded callback
  const handleVideoLoaded = (newSession: ProjectSession) => {
    setSession(newSession);
    setCurrentStep('video');
  };

  // Step 1 -> Step 2: Start transcription
  const handleStartTranscription = async (_ignoredDuration?: number) => {
    if (!session?.sessionId) return;
    setApiError(null);

    try {
      const res = await fetch('/api/transcribe/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || `Failed to start transcription (Server HTTP ${res.status})`;
        setApiError(msg);
        return;
      }

      const raw = await res.json();
      const updated = normalizeSession(raw);
      if (updated) {
        setSession(updated);
        setCurrentStep('transcription');
      } else {
        setApiError('Received invalid session payload from local server.');
      }
    } catch (err: any) {
      console.error('Error starting transcription:', err);
      setApiError(err.message || 'Network error communicating with local media engine.');
    }
  };

  // Update recommended clip duration
  const handleUpdateRecommendedDuration = async (durationSec: number) => {
    if (!session?.sessionId) return;
    try {
      const res = await fetch('/api/session/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          recommendedClipDurationSec: durationSec,
          maxClipDurationSec: durationSec,
        }),
      });
      if (res.ok) {
        const raw = await res.json();
        const updated = normalizeSession(raw);
        if (updated) setSession(updated);
      }
    } catch (err) {
      console.error('Error updating recommended duration:', err);
    }
  };

  // Stage 2: Retry failed transcription
  const handleRetryTranscription = async () => {
    if (!session?.sessionId) return;
    setApiError(null);

    try {
      const res = await fetch('/api/transcribe/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setApiError(errData.error || `Failed to retry transcription (HTTP ${res.status})`);
        return;
      }

      const raw = await res.json();
      const updated = normalizeSession(raw);
      if (updated) {
        setSession(updated);
      }
    } catch (err: any) {
      console.error('Failed to retry transcription:', err);
      setApiError(err.message || 'Network error during transcription retry.');
    }
  };

  // Stage 2: Cancel transcription
  const handleCancelTranscription = async () => {
    if (!session?.sessionId) return;
    setApiError(null);

    try {
      const res = await fetch('/api/transcribe/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setApiError(errData.error || `Failed to cancel transcription (HTTP ${res.status})`);
        return;
      }

      const raw = await res.json();
      const updated = normalizeSession(raw);
      if (updated) {
        setSession(updated);
      }
    } catch (err: any) {
      console.error('Error cancelling transcription:', err);
      setApiError(err.message || 'Network error during cancellation.');
    }
  };

  // Stage 2 -> Stage 3: Proceed to LLM / Viral JSON Analysis
  const handleProceedToViralJson = () => {
    setCurrentStep('viral_json');
  };

  // Step 4 -> Step 5: Apply JSON and Start Clip Generation
  const handleApplyClipsJson = async (
    rawJson: string,
    maxDurationSec: number,
    newCaptionConfig?: CaptionConfig,
    newFramingConfig?: FramingConfig
  ) => {
    if (!session?.sessionId) return;
    setApiError(null);

    try {
      if (newCaptionConfig) {
        await fetch('/api/caption/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            captionConfig: newCaptionConfig,
          }),
        });
      }

      if (newFramingConfig) {
        await fetch('/api/framing/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            framingConfig: newFramingConfig,
          }),
        });
      }

      // 1. Submit and validate JSON
      const res = await fetch('/api/clips/validate-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          rawJson,
          maxDurationSec,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setApiError(errData.error || `Failed to validate clips JSON (HTTP ${res.status})`);
        return;
      }

      const rawValidated = await res.json();
      const validatedSession = normalizeSession(rawValidated);
      if (validatedSession) {
        setSession(validatedSession);
      }

      // 2. Trigger background clip generation
      const genRes = await fetch('/api/clips/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      if (!genRes.ok) {
        const errData = await genRes.json().catch(() => ({}));
        setApiError(errData.error || `Failed to start clip rendering (HTTP ${genRes.status})`);
        return;
      }

      const rawGen = await genRes.json();
      const genSession = normalizeSession(rawGen);
      if (genSession) {
        setSession(genSession);
        setCurrentStep('clip_generation');
      }
    } catch (err: any) {
      console.error('Failed to start clip generation:', err);
      setApiError(err.message || 'Error communicating with clip generation service.');
    }
  };

  // Step 5: Retry failed clip
  const handleRetryClip = async (clipId: string | number) => {
    if (!session?.sessionId) return;
    setApiError(null);

    try {
      const res = await fetch('/api/clips/retry-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          clipId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setApiError(errData.error || `Failed to retry clip (HTTP ${res.status})`);
        return;
      }

      const raw = await res.json();
      const updated = normalizeSession(raw);
      if (updated) {
        setSession(updated);
      }
    } catch (err: any) {
      console.error('Error retrying clip:', err);
      setApiError(err.message || 'Error communicating with clip retry service.');
    }
  };

  // Step 5: Cancel clip generation
  const handleCancelClipGeneration = async () => {
    if (!session?.sessionId) return;
    setApiError(null);

    try {
      const res = await fetch('/api/clips/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setApiError(errData.error || `Failed to cancel clip generation (HTTP ${res.status})`);
        return;
      }

      const raw = await res.json();
      const updated = normalizeSession(raw);
      if (updated) {
        setSession(updated);
      }
    } catch (err: any) {
      console.error('Error cancelling clip generation:', err);
      setApiError(err.message || 'Error cancelling clip generation.');
    }
  };

  // Stage 3 & 4: Caption and framing configuration
  const handleUpdateCaptionConfig = async (config: CaptionConfig) => {
    if (!session?.sessionId) return;
    try {
      const res = await fetch('/api/caption/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          captionConfig: config,
        }),
      });
      if (res.ok) {
        const raw = await res.json();
        const updated = normalizeSession(raw);
        if (updated) setSession(updated);
      }
    } catch (err) {
      console.error('Failed to update caption configuration:', err);
    }
  };

  const handleUpdateFramingConfig = async (config: FramingConfig) => {
    if (!session?.sessionId) return;
    try {
      const res = await fetch('/api/framing/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          framingConfig: config,
        }),
      });
      if (res.ok) {
        const raw = await res.json();
        const updated = normalizeSession(raw);
        if (updated) setSession(updated);
      }
    } catch (err) {
      console.error('Failed to update framing configuration:', err);
    }
  };

  // Step 5 -> Step 6: Proceed to Results
  const handleProceedToResults = () => {
    setCurrentStep('results');
  };

  // Step 6: Update output directory
  const handleUpdateOutputDir = async (newDir: string) => {
    if (!session?.sessionId) return;
    setApiError(null);

    try {
      const res = await fetch('/api/session/output-dir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          outputDir: newDir,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setApiError(errData.error || `Failed to update output directory (HTTP ${res.status})`);
        return;
      }

      const raw = await res.json();
      const updated = normalizeSession(raw);
      if (updated) {
        setSession(updated);
      }
    } catch (err: any) {
      console.error('Error updating output directory:', err);
      setApiError(err.message || 'Error updating output directory.');
    }
  };

  // Step 6: Clean temporary files
  const handleCleanTempFiles = async (): Promise<number> => {
    if (!session?.sessionId) return 0;
    setApiError(null);

    try {
      const res = await fetch('/api/session/cleanup-temp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      if (!res.ok) {
        throw new Error('Failed to clean temporary working files');
      }

      const data = await res.json();
      return data.bytesCleaned || 0;
    } catch (err: any) {
      setApiError(err.message || 'Failed to clean temporary files');
      return 0;
    }
  };

  // Reset / New Project
  const handleNewProject = () => {
    if (window.confirm('Are you sure you want to start a new project? Current project progress will be reset.')) {
      setSession(null);
      setApiError(null);
      setCurrentStep('video');
    }
  };

  return (
    <div
      id="desktop-workstation-root"
      data-theme={theme}
      className="min-h-screen flex flex-col font-sans selection:bg-indigo-600 selection:text-white transition-colors"
      style={{ backgroundColor: 'var(--ws-bg)', color: 'var(--ws-text)' }}
    >
      {/* Top Application Header */}
      <Header
        session={session}
        theme={theme}
        onSelectTheme={handleSelectTheme}
        onOpenSystemInfo={() => setIsSystemInfoOpen(true)}
        onOpenPackagingModal={() => setIsPackagingModalOpen(true)}
        onNewProject={handleNewProject}
      />

      {/* Workflow Navigation Bar */}
      <StepIndicator
        currentStep={currentStep}
        session={session}
        onSelectStep={(step) => setCurrentStep(step)}
      />

      {/* Main Workspace Stage */}
      <main id="workspace-stage" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-4">
        {/* Visible API / Process Error Banner */}
        {apiError && (
          <div
            id="api-error-banner"
            className="ws-alert-error p-3.5 flex items-start justify-between gap-4 shadow-xs animate-in fade-in"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-[var(--error-solid)] shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-semibold">Action Failed</div>
                <div className="mt-0.5 font-mono">{apiError}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setApiError(null)}
              className="ws-btn-secondary p-1"
              title="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Component Stage with Error Boundary */}
        <ErrorBoundary
          fallbackTitle="Workflow Step Error"
          onReset={() => setCurrentStep('video')}
        >
          {currentStep === 'video' && (
            <Step1Video
              session={session}
              onVideoLoaded={handleVideoLoaded}
              onStartTranscription={handleStartTranscription}
              onUpdateOutputDir={handleUpdateOutputDir}
            />
          )}

          {currentStep === 'transcription' && session && (
            <Step2AudioWhisper
              session={session}
              onRetryTranscription={() => handleRetryTranscription()}
              onCancelTranscription={handleCancelTranscription}
              onProceedToViralJson={handleProceedToViralJson}
            />
          )}

          {currentStep === 'viral_json' && session && (
            <Step4ViralJson
              session={session}
              onApplyClipsJson={handleApplyClipsJson}
              onUpdateCaptionConfig={handleUpdateCaptionConfig}
              onUpdateFramingConfig={handleUpdateFramingConfig}
            />
          )}

          {currentStep === 'clip_generation' && session && (
            <Step5ClipGeneration
              session={session}
              onRetryClip={handleRetryClip}
              onCancelGeneration={handleCancelClipGeneration}
              onProceedToResults={handleProceedToResults}
              onUpdateCaptionConfig={handleUpdateCaptionConfig}
            />
          )}

          {currentStep === 'results' && session && (
            <Step6Results
              session={session}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Desktop Packaging Information Modal */}
      <DesktopPackagingModal
        isOpen={isPackagingModalOpen}
        onClose={() => setIsPackagingModalOpen(false)}
      />

      {/* System Information & Diagnostics Modal */}
      <SystemInfoModal
        isOpen={isSystemInfoOpen}
        onClose={() => setIsSystemInfoOpen(false)}
        systemStatus={systemStatus}
      />

      {/* Footer Info */}
      <footer id="app-footer" className="border-t border-[var(--border-default)] ws-panel text-xs py-3 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="ws-muted">
            Desktop Video Clip Processor • Local Media Engine • 100% On-Device Processing
          </div>
          <div className="text-[11px] font-mono ws-muted">
            Node {systemStatus?.nodeVersion || 'v22'} • {systemStatus?.platform === 'win32' ? 'Windows' : 'Linux'} x64
          </div>
        </div>
      </footer>
    </div>
  );
}

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home, Copy, Check, Terminal } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleCopyDiagnostic = () => {
    const { error, errorInfo } = this.state;
    const diagnosticText = [
      `Error: ${error?.name || 'Error'}: ${error?.message || 'Unknown error'}`,
      `Time: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
      `User Agent: ${navigator.userAgent}`,
      `Stack Trace:`,
      error?.stack || 'No stack trace available',
      `Component Stack:`,
      errorInfo?.componentStack || 'No component stack available',
    ].join('\n\n');

    navigator.clipboard.writeText(diagnosticText);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2500);
  };

  public render() {
    if (this.state.hasError) {
      const { error, errorInfo, copied } = this.state;
      const title = this.props.fallbackTitle || 'Application Runtime Error';

      return (
        <div
          id="error-boundary-container"
          className="min-h-[400px] w-full p-6 flex items-center justify-center bg-slate-950 text-slate-100 font-sans"
        >
          <div className="max-w-2xl w-full bg-slate-900 border border-rose-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-950 border border-rose-700/60 rounded-xl text-rose-400 shrink-0">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <span>{title}</span>
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  A component error occurred during rendering. The application state has been preserved to prevent a blank screen.
                </p>
              </div>
            </div>

            {/* Error Message Box */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-mono text-rose-300">
                  <Terminal className="w-3.5 h-3.5" />
                  {error?.name || 'Runtime Exception'}
                </span>
                <button
                  type="button"
                  onClick={this.handleCopyDiagnostic}
                  className="px-2.5 py-1 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied Details' : 'Copy Diagnostic'}</span>
                </button>
              </div>

              <div className="text-sm font-mono text-rose-200 break-words font-medium">
                {error?.message || 'An unexpected rendering error occurred.'}
              </div>

              {error?.stack && (
                <details className="mt-2 text-xs text-slate-400 cursor-pointer">
                  <summary className="hover:text-slate-200 select-none py-1">View Call Stack & Trace</summary>
                  <pre className="mt-2 p-3 rounded bg-slate-900 border border-slate-800 overflow-x-auto text-[11px] font-mono text-slate-400 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {error.stack}
                    {errorInfo?.componentStack && `\n\nComponent Hierarchy:${errorInfo.componentStack}`}
                  </pre>
                </details>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg hover:shadow-indigo-500/20 transition"
              >
                <Home className="w-4 h-4" />
                <span>Return to Workspace</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

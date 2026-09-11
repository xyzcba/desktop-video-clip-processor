import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Global error handlers to prevent silent unhandled errors in renderer
window.addEventListener('error', (event) => {
  if (event.error?.message?.includes('ResizeObserver') || event.message?.includes('ResizeObserver')) {
    // Non-fatal benign browser loop warning
    return;
  }
  console.warn('[Renderer Uncaught Error]:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  // Prevent browser from considering this an unhandled rejection
  event.preventDefault();
  const reason = event.reason;
  // Filter out benign browser rejections (unfocused clipboard, aborted fetch, autoplay)
  const isBenign =
    !reason ||
    reason.name === 'AbortError' ||
    reason.name === 'NotAllowedError' ||
    String(reason).includes('pause') ||
    String(reason).includes('interrupted') ||
    String(reason).includes('Document is not focused');

  if (!isBenign) {
    console.warn('[Handled Promise Rejection]:', reason);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="Workstation Fatal Error">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

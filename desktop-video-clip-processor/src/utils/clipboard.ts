/**
 * Safe clipboard helper that works reliably across:
 * - Modern browsers with permissions
 * - Sandboxed iframes (e.g., AI Studio preview)
 * - Electron renderers with or without document focus
 *
 * Never throws an unhandled rejection.
 */

export async function safeCopyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern navigator.clipboard API if available
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // In sandboxed iframes or unfocused windows, writeText throws a DOMException
      // Fall through to document.execCommand fallback
    }
  }

  // 2. Fallback using temporary textarea + document.execCommand('copy')
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.warn('Fallback clipboard copy failed:', err);
    return false;
  }
}

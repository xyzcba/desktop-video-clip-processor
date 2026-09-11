/**
 * Windows filename sanitizer and output path utilities
 */

const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

/**
 * Sanitizes a title string into a safe Windows file base name
 */
export function sanitizeWindowsFilename(title: string, maxLength: number = 80): string {
  if (!title || typeof title !== 'string') {
    return 'clip';
  }

  // 1. Remove Windows illegal characters: < > : " / \ | ? *
  // Also remove control characters 0-31
  let safe = title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim();

  // 2. Remove trailing periods or spaces (invalid on Windows NTFS)
  safe = safe.replace(/[. ]+$/, '');

  // 3. Prevent Windows reserved device names
  const upper = safe.toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(upper) || !safe) {
    safe = `clip_${safe || 'item'}`;
  }

  // 4. Truncate length to avoid Windows MAX_PATH issues
  if (safe.length > maxLength) {
    safe = safe.substring(0, maxLength).trim().replace(/[. ]+$/, '');
  }

  return safe || 'clip';
}

/**
 * Generates formatted clip filename: e.g. "01 - The Financial Mistake.mp4"
 */
export function generateClipFilename(index: number, title: string, ext: string = 'mp4'): string {
  const paddedIndex = String(index).padStart(2, '0');
  const safeTitle = sanitizeWindowsFilename(title);
  return `${paddedIndex} - ${safeTitle}.${ext.replace(/^\./, '')}`;
}

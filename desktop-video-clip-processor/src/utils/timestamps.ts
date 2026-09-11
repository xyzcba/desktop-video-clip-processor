/**
 * Timestamp parsing, formatting, and arithmetic utilities
 * High precision calculations avoiding floating-point drift
 */

export interface NormalizedTimestampResult {
  seconds: number;
  formatted: string;
  wasNormalized: boolean;
  warning?: string;
}

/**
 * Parses timestamp string (HH:MM:SS or MM:SS or raw seconds) into seconds.
 * Safely normalizes unambiguous overflows (e.g., "00:00:70" -> 70s / "00:01:10") with a warning.
 * Rejects ambiguous or unsafe values (negative values, NaN, corrupt text) with clear error messages.
 */
export function parseAndNormalizeTimestamp(ts: string | number): NormalizedTimestampResult {
  if (typeof ts === 'number') {
    if (isNaN(ts) || ts < 0) {
      throw new Error(`Invalid numeric timestamp: ${ts}. Timestamp cannot be negative or NaN.`);
    }
    const sec = Math.round(ts * 1000) / 1000;
    return {
      seconds: sec,
      formatted: formatSecondsToTimestamp(sec),
      wasNormalized: false,
    };
  }

  if (typeof ts !== 'string') {
    throw new Error(`Timestamp must be a string or number, received ${typeof ts}`);
  }

  const clean = ts.trim();
  if (!clean) {
    throw new Error('Timestamp cannot be empty. Expected "HH:MM:SS" or "MM:SS".');
  }

  // Check format: either HH:MM:SS or MM:SS (with optional .fraction)
  const parts = clean.split(':');
  if (parts.length === 2) {
    // MM:SS
    const minutes = parseInt(parts[0], 10);
    const seconds = parseFloat(parts[1]);
    if (isNaN(minutes) || isNaN(seconds) || minutes < 0 || seconds < 0) {
      throw new Error(`Invalid MM:SS timestamp format: "${ts}". Values must be non-negative numbers.`);
    }
    const totalMs = Math.round((minutes * 60 + seconds) * 1000);
    const totalSec = totalMs / 1000;
    const formatted = formatSecondsToTimestamp(totalSec);

    // If seconds >= 60, it can be safely and unambiguously normalized (e.g. 00:70 -> 00:01:10)
    if (seconds >= 60) {
      return {
        seconds: totalSec,
        formatted,
        wasNormalized: true,
        warning: `Timestamp "${ts}" contained seconds >= 60 and was safely normalized to "${formatted}" (${totalSec}s).`,
      };
    }

    return {
      seconds: totalSec,
      formatted,
      wasNormalized: false,
    };
  } else if (parts.length === 3) {
    // HH:MM:SS
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || hours < 0 || minutes < 0 || seconds < 0) {
      throw new Error(`Invalid HH:MM:SS timestamp format: "${ts}". Hours, minutes, and seconds must be non-negative numbers.`);
    }
    const totalMs = Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
    const totalSec = totalMs / 1000;
    const formatted = formatSecondsToTimestamp(totalSec);

    // If minutes >= 60 or seconds >= 60, safe unambiguous normalization:
    if (minutes >= 60 || seconds >= 60) {
      return {
        seconds: totalSec,
        formatted,
        wasNormalized: true,
        warning: `Timestamp "${ts}" overflowed standard bounds and was safely normalized to "${formatted}" (${totalSec}s).`,
      };
    }

    return {
      seconds: totalSec,
      formatted,
      wasNormalized: false,
    };
  } else {
    // Could be raw seconds? E.g. "70" or "75.5"
    const raw = parseFloat(clean);
    if (!isNaN(raw) && raw >= 0 && /^[0-9]+(\.[0-9]+)?$/.test(clean)) {
      const totalSec = Math.round(raw * 1000) / 1000;
      const formatted = formatSecondsToTimestamp(totalSec);
      return {
        seconds: totalSec,
        formatted,
        wasNormalized: true,
        warning: `Raw seconds timestamp "${ts}" was converted to standard format "${formatted}".`,
      };
    }
    throw new Error(`Unrecognized timestamp format: "${ts}". Expected "HH:MM:SS" (e.g. "00:01:30") or "MM:SS" (e.g. "01:30").`);
  }
}

/**
 * Parses timestamp string (HH:MM:SS or MM:SS or raw seconds) into seconds (with millisecond precision)
 * @throws Error if timestamp is invalid
 */
export function parseTimestampToSeconds(ts: string | number): number {
  return parseAndNormalizeTimestamp(ts).seconds;
}

/**
 * Formats seconds into HH:MM:SS (or HH:MM:SS.mmm if includeMs=true)
 */
export function formatSecondsToTimestamp(totalSec: number, includeMs: boolean = false): string {
  if (isNaN(totalSec) || totalSec < 0) {
    return '00:00:00';
  }

  const totalMs = Math.round(totalSec * 1000);
  const totalSecondsInt = Math.floor(totalMs / 1000);
  const ms = totalMs % 1000;

  const hours = Math.floor(totalSecondsInt / 3600);
  const minutes = Math.floor((totalSecondsInt % 3600) / 60);
  const seconds = totalSecondsInt % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (includeMs && ms > 0) {
    const mmm = String(ms).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${mmm}`;
  }

  return `${hh}:${mm}:${ss}`;
}

/**
 * Formats duration into human readable form (e.g. "2h 15m 30s" or "22m 37s" or "45s")
 */
export function formatDurationHuman(totalSec: number): string {
  if (isNaN(totalSec) || totalSec < 0) return '0s';
  const sec = Math.round(totalSec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

/**
 * Format bytes to human readable size
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

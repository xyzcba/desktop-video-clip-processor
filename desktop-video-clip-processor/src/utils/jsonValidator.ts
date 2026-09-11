/**
 * Robust JSON Validator for LLM viral clip responses
 */

import { ValidationResult, ValidationError, ViralClipItem } from '../types';
import { parseAndNormalizeTimestamp, formatSecondsToTimestamp } from './timestamps';

export function validateViralClipsJson(
  rawInput: string,
  videoDurationSec?: number,
  recommendedClipDurationSec: number = 60
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const normalizedClips: (ViralClipItem & { startSec: number; endSec: number; durationSec: number })[] = [];

  if (!rawInput || !rawInput.trim()) {
    errors.push({
      message: 'JSON input is empty. Please paste the JSON returned by your LLM.',
      severity: 'error',
    });
    return { isValid: false, clips: [], errors, warnings };
  }

  // 1. Clean markdown code blocks if the LLM added ```json or ```
  let cleaned = rawInput.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // 2. Parse JSON safely
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    errors.push({
      message: `Malformed JSON syntax: ${err.message}. Check for missing quotes, trailing commas, or brackets.`,
      severity: 'error',
    });
    return { isValid: false, clips: [], errors, warnings };
  }

  // 3. Validate root structure
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push({
      message: 'Root JSON element must be an object with a "clips" array property (e.g. { "clips": [...] }).',
      severity: 'error',
    });
    return { isValid: false, clips: [], errors, warnings };
  }

  if (!Array.isArray(parsed.clips)) {
    errors.push({
      field: 'clips',
      message: 'Missing or invalid "clips" array in JSON. Expected: { "clips": [ ... ] }',
      severity: 'error',
    });
    return { isValid: false, clips: [], errors, warnings };
  }

  if (parsed.clips.length === 0) {
    warnings.push({
      field: 'clips',
      message: 'The "clips" array is empty. No clips found to process.',
      severity: 'warning',
    });
  }

  // 4. Validate each clip
  const seenIds = new Set<string>();

  parsed.clips.forEach((clip: any, index: number) => {
    const clipIndexLabel = `Clip #${index + 1}`;
    const rawId = clip?.id ?? (index + 1);

    if (!clip || typeof clip !== 'object') {
      errors.push({
        clipId: rawId,
        message: `${clipIndexLabel}: Clip entry is not a valid object.`,
        severity: 'error',
      });
      return;
    }

    // ID check
    const idStr = String(rawId).trim();
    if (!idStr) {
      errors.push({
        clipId: rawId,
        field: 'id',
        message: `${clipIndexLabel}: Missing required "id" field.`,
        severity: 'error',
      });
    } else if (seenIds.has(idStr)) {
      warnings.push({
        clipId: rawId,
        field: 'id',
        message: `${clipIndexLabel}: Duplicate clip ID "${idStr}".`,
        severity: 'warning',
      });
    } else {
      seenIds.add(idStr);
    }

    // Title check
    if (!clip.title || typeof clip.title !== 'string' || !clip.title.trim()) {
      errors.push({
        clipId: rawId,
        field: 'title',
        message: `${clipIndexLabel}: Missing or empty "title" field.`,
        severity: 'error',
      });
    }

    // Description check
    if (clip.description !== undefined && typeof clip.description !== 'string') {
      warnings.push({
        clipId: rawId,
        field: 'description',
        message: `${clipIndexLabel}: "description" should be a text string.`,
        severity: 'warning',
      });
    }

    // Start timestamp check
    let startSec = 0;
    let hasValidStart = false;
    if (!clip.start && clip.start !== 0) {
      errors.push({
        clipId: rawId,
        field: 'start',
        message: `${clipIndexLabel}: Missing required "start" timestamp. Expected "HH:MM:SS" or "MM:SS".`,
        severity: 'error',
      });
    } else {
      try {
        const startNorm = parseAndNormalizeTimestamp(clip.start);
        startSec = startNorm.seconds;
        hasValidStart = true;
        if (startNorm.wasNormalized) {
          warnings.push({
            clipId: rawId,
            field: 'start',
            message: `${clipIndexLabel}: Start timestamp "${clip.start}" was safely normalized to "${startNorm.formatted}".`,
            severity: 'warning',
          });
        }
      } catch (err: any) {
        errors.push({
          clipId: rawId,
          field: 'start',
          message: `${clipIndexLabel}: Invalid "start" timestamp "${clip.start}". ${err.message}`,
          severity: 'error',
        });
      }
    }

    // End timestamp check
    let endSec = 0;
    let hasValidEnd = false;
    if (!clip.end && clip.end !== 0) {
      errors.push({
        clipId: rawId,
        field: 'end',
        message: `${clipIndexLabel}: Missing required "end" timestamp. Expected "HH:MM:SS" or "MM:SS".`,
        severity: 'error',
      });
    } else {
      try {
        const endNorm = parseAndNormalizeTimestamp(clip.end);
        endSec = endNorm.seconds;
        hasValidEnd = true;
        if (endNorm.wasNormalized) {
          warnings.push({
            clipId: rawId,
            field: 'end',
            message: `${clipIndexLabel}: End timestamp "${clip.end}" was safely normalized to "${endNorm.formatted}".`,
            severity: 'warning',
          });
        }
      } catch (err: any) {
        errors.push({
          clipId: rawId,
          field: 'end',
          message: `${clipIndexLabel}: Invalid "end" timestamp "${clip.end}". ${err.message}`,
          severity: 'error',
        });
      }
    }

    // Relational timestamp checks
    if (hasValidStart && hasValidEnd) {
      if (startSec < 0) {
        errors.push({
          clipId: rawId,
          field: 'start',
          message: `${clipIndexLabel}: Start timestamp (${formatSecondsToTimestamp(startSec)}) cannot be negative.`,
          severity: 'error',
        });
      }

      if (endSec <= startSec) {
        errors.push({
          clipId: rawId,
          field: 'end',
          message: `${clipIndexLabel}: End timestamp (${formatSecondsToTimestamp(endSec)}) occurs before or at start timestamp (${formatSecondsToTimestamp(startSec)}). Please ensure end > start.`,
          severity: 'error',
        });
      }

      if (videoDurationSec && videoDurationSec > 0) {
        if (startSec >= videoDurationSec) {
          errors.push({
            clipId: rawId,
            field: 'start',
            message: `${clipIndexLabel}: Start timestamp (${formatSecondsToTimestamp(startSec)}) is at or beyond video duration (${formatSecondsToTimestamp(videoDurationSec)}).`,
            severity: 'error',
          });
        }
        if (endSec > videoDurationSec) {
          errors.push({
            clipId: rawId,
            field: 'end',
            message: `${clipIndexLabel}: End timestamp (${formatSecondsToTimestamp(endSec)}) exceeds video duration (${formatSecondsToTimestamp(videoDurationSec)}).`,
            severity: 'error',
          });
        }
      }

      const durationSec = Math.round((endSec - startSec) * 1000) / 1000;

      if (durationSec < 5) {
        warnings.push({
          clipId: rawId,
          field: 'duration',
          message: `${clipIndexLabel}: Clip duration is very short (${durationSec}s). Most platforms recommend at least 10–15s.`,
          severity: 'warning',
        });
      }

      // Recommended clip duration is a guideline/recommendation, NOT an unconditional error
      if (durationSec > recommendedClipDurationSec) {
        warnings.push({
          clipId: rawId,
          field: 'duration',
          message: `${clipIndexLabel}: Clip duration (${durationSec}s) exceeds the recommended target of ${recommendedClipDurationSec}s. (Allowed for narrative completeness)`,
          severity: 'warning',
        });
      }

      // Hashtags check
      let hashtags: string[] = [];
      if (Array.isArray(clip.hashtags)) {
        hashtags = clip.hashtags.map((h: any) => String(h).trim()).filter(Boolean);
      } else if (clip.hashtags) {
        warnings.push({
          clipId: rawId,
          field: 'hashtags',
          message: `${clipIndexLabel}: "hashtags" should be an array of strings.`,
          severity: 'warning',
        });
      }

      // Keywords check
      let keywords: string[] = [];
      if (Array.isArray(clip.keywords)) {
        keywords = clip.keywords.map((k: any) => String(k).trim()).filter(Boolean);
      } else if (clip.keywords) {
        warnings.push({
          clipId: rawId,
          field: 'keywords',
          message: `${clipIndexLabel}: "keywords" should be an array of strings.`,
          severity: 'warning',
        });
      }

      normalizedClips.push({
        id: rawId,
        title: (clip.title || `Clip ${rawId}`).trim(),
        description: (clip.description || '').trim(),
        start: formatSecondsToTimestamp(startSec),
        end: formatSecondsToTimestamp(endSec),
        hashtags,
        keywords,
        startSec,
        endSec,
        durationSec,
      });
    }
  });

  const isValid = errors.length === 0 && normalizedClips.length > 0;

  return {
    isValid,
    clips: normalizedClips,
    errors,
    warnings,
  };
}

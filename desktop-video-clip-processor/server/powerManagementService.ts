/**
 * Sleep Prevention Manager for Desktop Video Processor
 *
 * Uses Electron's built-in `powerSaveBlocker('prevent-app-suspension')` to prevent
 * the host system (e.g. Windows) from entering sleep/suspend during active local
 * Whisper transcription.
 *
 * Key guarantees:
 * - Uses 'prevent-app-suspension' exclusively: does NOT prevent display sleep ('prevent-display-sleep')
 * - Does NOT modify Windows power plan settings
 * - Starts when an actual transcription job begins
 * - Keeps blocker active for the entire transcription lifecycle
 * - Releases blocker when transcription completes, is cancelled, or fails
 * - Automatically cleans up when Electron window/app closes or process exits
 * - Idempotent, safe ref-counting / session tracking prevents duplicate blockers or premature releases
 * - Safe no-op in headless/browser/dev-server environments where Electron is not available
 */

type PowerSaveBlockerApi = {
  start: (type: 'prevent-app-suspension' | 'prevent-display-sleep') => number;
  stop: (id: number) => boolean;
  isStarted: (id: number) => boolean;
};

// Singleton state
let cachedPowerSaveBlocker: PowerSaveBlockerApi | null | undefined = undefined;
let activeBlockerId: number | null = null;

// Track active leases: leaseToken -> sessionId
const activeLeases = new Map<string, string>();
// Map sessionId -> currently active leaseToken (most recent transcription for that session)
const sessionActiveLease = new Map<string, string>();

let nextTokenSequence = 1;

/**
 * Lazily resolves Electron's powerSaveBlocker API if running inside an Electron runtime.
 * Works seamlessly whether called from the in-process server inside electron-main or directly.
 */
export function getPowerSaveBlocker(): PowerSaveBlockerApi | null {
  if (cachedPowerSaveBlocker !== undefined) {
    return cachedPowerSaveBlocker;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.powerSaveBlocker) {
      cachedPowerSaveBlocker = electron.powerSaveBlocker;
      return cachedPowerSaveBlocker;
    }
  } catch {
    // Not running inside Electron main process or Electron module not accessible
  }

  cachedPowerSaveBlocker = null;
  return null;
}

/**
 * Allows explicit registration of the Electron powerSaveBlocker instance from electron-main.cjs.
 * This guarantees 100% reliable integration across all packaging and bundling configurations.
 */
export function registerPowerSaveBlocker(psb: PowerSaveBlockerApi | null): void {
  cachedPowerSaveBlocker = psb;
}

/**
 * Starts sleep prevention for an active transcription job.
 * Returns a unique lease token string identifying this exact transcription generation.
 *
 * If a blocker is already active (e.g. from another session or previous job), it registers
 * the new lease and keeps the single powerSaveBlocker active without creating redundant OS blockers.
 * Any previous active lease for this session is superseded, meaning stale async completions from
 * older cancelled jobs cannot release this new job's blocker.
 */
export function acquireTranscriptionSleepBlocker(sessionId: string): string {
  const leaseToken = `${sessionId}_tx_${Date.now()}_${nextTokenSequence++}`;

  // Supersede any previous lease registered for this session
  const oldLeaseForSession = sessionActiveLease.get(sessionId);
  if (oldLeaseForSession && oldLeaseForSession !== leaseToken) {
    activeLeases.delete(oldLeaseForSession);
  }

  sessionActiveLease.set(sessionId, leaseToken);
  activeLeases.set(leaseToken, sessionId);

  if (activeBlockerId !== null) {
    const psb = getPowerSaveBlocker();
    if (psb && psb.isStarted(activeBlockerId)) {
      // Blocker is already actively held by OS
      return leaseToken;
    }
    // Stale blocker ID, clear it and restart
    activeBlockerId = null;
  }

  const psb = getPowerSaveBlocker();
  if (!psb) {
    // Running in web/non-Electron environment (e.g. browser dev preview)
    return leaseToken;
  }

  try {
    // Strictly 'prevent-app-suspension' to allow display to turn off normally while keeping CPU alive
    activeBlockerId = psb.start('prevent-app-suspension');
    console.log(
      `[PowerManagement] Started sleep blocker (id: ${activeBlockerId}, type: 'prevent-app-suspension') for session ${sessionId} (token: ${leaseToken})`
    );
  } catch (err: any) {
    console.warn('[PowerManagement] Failed to start powerSaveBlocker:', err?.message || err);
    activeBlockerId = null;
  }

  return leaseToken;
}

/**
 * Releases sleep prevention for a transcription job using its specific lease token or sessionId.
 *
 * Generation Safety Guarantee:
 * - If called with a specific lease token: Verifies the token is still active. If an older cancelled
 *   transcription finishes late after a newer transcription started on the same sessionId, its stale
 *   token is already deleted/superseded and this becomes a harmless no-op.
 * - If called with a plain sessionId (e.g. during explicit cancellation): Looks up the active lease
 *   for that session and revokes it promptly.
 *
 * When no active leases remain across all sessions, the underlying OS powerSaveBlocker is stopped.
 */
export function releaseTranscriptionSleepBlocker(tokenOrSessionId: string): void {
  let tokenToRelease: string | undefined;

  if (activeLeases.has(tokenOrSessionId)) {
    // Called with exact lease token
    tokenToRelease = tokenOrSessionId;
    const sessionForToken = activeLeases.get(tokenToRelease);
    activeLeases.delete(tokenToRelease);

    // If this token was the session's active lease, remove the session mapping
    if (sessionForToken && sessionActiveLease.get(sessionForToken) === tokenToRelease) {
      sessionActiveLease.delete(sessionForToken);
    }
  } else if (sessionActiveLease.has(tokenOrSessionId)) {
    // Called with sessionId (e.g. cancelTranscription)
    tokenToRelease = sessionActiveLease.get(tokenOrSessionId);
    sessionActiveLease.delete(tokenOrSessionId);
    if (tokenToRelease) {
      activeLeases.delete(tokenToRelease);
    }
  } else {
    // Stale lease token or already cleaned up session - harmless no-op!
    return;
  }

  // If other sessions/leases are still actively transcribing, keep the OS blocker running
  if (activeLeases.size > 0) {
    return;
  }

  if (activeBlockerId === null) {
    return;
  }

  const psb = getPowerSaveBlocker();
  const idToStop = activeBlockerId;
  activeBlockerId = null;

  if (psb) {
    try {
      if (psb.isStarted(idToStop)) {
        psb.stop(idToStop);
        console.log(`[PowerManagement] Stopped sleep blocker (id: ${idToStop}). Normal sleep restored.`);
      }
    } catch (err: any) {
      console.warn(`[PowerManagement] Error stopping powerSaveBlocker ${idToStop}:`, err?.message || err);
    }
  }
}

/**
 * Force-releases all active sleep blockers regardless of session state.
 * Specifically used on window closing, app quit, or process exit.
 */
export function releaseAllSleepBlockers(): void {
  activeLeases.clear();
  sessionActiveLease.clear();

  if (activeBlockerId === null) {
    return;
  }

  const psb = getPowerSaveBlocker();
  const idToStop = activeBlockerId;
  activeBlockerId = null;

  if (psb) {
    try {
      if (psb.isStarted(idToStop)) {
        psb.stop(idToStop);
        console.log(`[PowerManagement] Force stopped sleep blocker (id: ${idToStop}) on application shutdown.`);
      }
    } catch (err: any) {
      console.warn(`[PowerManagement] Error force stopping powerSaveBlocker ${idToStop}:`, err?.message || err);
    }
  }
}

/**
 * Queries current sleep blocker status for diagnostics/status reporting.
 */
export function isSleepBlockerActive(): boolean {
  if (activeBlockerId === null) return false;
  const psb = getPowerSaveBlocker();
  if (!psb) return false;
  return psb.isStarted(activeBlockerId);
}

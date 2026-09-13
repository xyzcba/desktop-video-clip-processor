import { WordTimestamp } from '../../src/types';
import { FaceTrack } from './trackingTypes';

const HYSTERESIS_SWITCH_DELAY_SEC = 1.5; // Must speak continuously for >= 1.5s to trigger camera switch
const PAUSE_HOLD_SEC = 2.0; // Hold camera on current speaker during pauses up to 2 seconds

export interface TargetSpeakerTrajectoryPoint {
  timestamp: number;
  trackId: number;
  faceCenter: { x: number; y: number }; // normalized 0..1
  faceSize: { width: number; height: number }; // normalized 0..1
}

/**
 * Checks if speech is active at a given timestamp based on Whisper word timestamps
 */
function isSpeechActiveAt(timestamp: number, words: WordTimestamp[]): boolean {
  if (!words || words.length === 0) return true; // Default to speech active if no words provided
  return words.some((w) => timestamp >= w.start - 0.25 && timestamp <= w.end + 0.35);
}

/**
 * Determines which face track is the active speaker at each sampled timestamp
 */
export function computeSpeakerTrajectory(
  tracks: FaceTrack[],
  clipDurationSec: number,
  clipRelativeWords: WordTimestamp[] = []
): TargetSpeakerTrajectoryPoint[] {
  if (tracks.length === 0) return [];

  // Sort tracks by prominence: duration + average size + centrality
  tracks.sort((a, b) => {
    const durA = a.lastSeenTimestamp - a.firstTimestamp;
    const durB = b.lastSeenTimestamp - b.firstTimestamp;
    const sizeA = a.averageSize.width * a.averageSize.height;
    const sizeB = b.averageSize.width * b.averageSize.height;
    return durB * 2 + sizeB - (durA * 2 + sizeA);
  });

  const trajectory: TargetSpeakerTrajectoryPoint[] = [];
  const sampleStep = 0.5; // 2 FPS
  const totalSteps = Math.ceil(clipDurationSec / sampleStep);

  let currentSpeakerTrackId: number = tracks[0].id;
  let currentCandidateTrackId: number | null = null;
  let candidateSpeakingStartTime: number = 0;
  let lastSpeechDetectedTime: number = 0;

  for (let i = 0; i <= totalSteps; i++) {
    const t = Math.round(i * sampleStep * 1000) / 1000;
    const speechActive = isSpeechActiveAt(t, clipRelativeWords);
    if (speechActive) {
      lastSpeechDetectedTime = t;
    }

    // Find all tracks alive at time t
    const aliveTracks = tracks.filter(
      (tr) => t >= tr.firstTimestamp - 0.2 && t <= tr.lastSeenTimestamp + 1.2
    );

    if (aliveTracks.length === 0) {
      // If no tracks alive right at this moment, hold last known position from currentSpeakerTrack
      const fallbackTrack = tracks.find((tr) => tr.id === currentSpeakerTrackId) || tracks[0];
      trajectory.push({
        timestamp: t,
        trackId: fallbackTrack.id,
        faceCenter: { ...fallbackTrack.smoothedCenter },
        faceSize: { ...fallbackTrack.averageSize },
      });
      continue;
    }

    if (aliveTracks.length === 1) {
      // Only 1 face in frame: lock onto this face
      const singleTrack = aliveTracks[0];
      currentSpeakerTrackId = singleTrack.id;
      currentCandidateTrackId = null;

      // Find closest point in this track to t
      const pt = getClosestPoint(singleTrack, t);
      trajectory.push({
        timestamp: t,
        trackId: singleTrack.id,
        faceCenter: pt ? { x: (pt.box.x1 + pt.box.x2) / 2, y: (pt.box.y1 + pt.box.y2) / 2 } : singleTrack.smoothedCenter,
        faceSize: pt ? { width: pt.box.x2 - pt.box.x1, height: pt.box.y2 - pt.box.y1 } : singleTrack.averageSize,
      });
      continue;
    }

    // Multiple faces present! Score each alive face
    let bestFaceId = currentSpeakerTrackId;
    let maxEvidenceScore = -1;

    for (const track of aliveTracks) {
      const pt = getClosestPoint(track, t);
      const mouthMotion = pt ? pt.mouthMotion : 0;
      const faceArea = track.averageSize.width * track.averageSize.height;

      // Distance from horizontal center (0.5)
      const centerDist = Math.abs(track.smoothedCenter.x - 0.5);
      const centralityScore = 1.0 - Math.min(1.0, centerDist * 2);

      // Total evidence combines mouth motion during speech + prominence + centrality
      let evidenceScore = mouthMotion * (speechActive ? 2.5 : 1.0) + faceArea * 30 + centralityScore * 2;

      // Give slight bias to current speaker to prevent jitter
      if (track.id === currentSpeakerTrackId) {
        evidenceScore += 2.0;
      }

      if (evidenceScore > maxEvidenceScore) {
        maxEvidenceScore = evidenceScore;
        bestFaceId = track.id;
      }
    }

    // Hysteresis State Machine
    if (bestFaceId === currentSpeakerTrackId) {
      // Current speaker continues
      currentCandidateTrackId = null;
    } else {
      // Another face has higher speaking score
      if (currentCandidateTrackId === bestFaceId) {
        // Candidate has been leading for candidateDuration
        const candidateDuration = t - candidateSpeakingStartTime;
        if (candidateDuration >= HYSTERESIS_SWITCH_DELAY_SEC) {
          // Switch camera target to the new speaker!
          currentSpeakerTrackId = bestFaceId;
          currentCandidateTrackId = null;
        }
      } else {
        // New candidate starts speaking evidence timer
        currentCandidateTrackId = bestFaceId;
        candidateSpeakingStartTime = t;
      }
    }

    // Check pause hold: if speech paused briefly, hold current speaker
    const currentTrack = aliveTracks.find((tr) => tr.id === currentSpeakerTrackId) || aliveTracks[0];
    const pt = getClosestPoint(currentTrack, t);

    trajectory.push({
      timestamp: t,
      trackId: currentTrack.id,
      faceCenter: pt ? { x: (pt.box.x1 + pt.box.x2) / 2, y: (pt.box.y1 + pt.box.y2) / 2 } : currentTrack.smoothedCenter,
      faceSize: pt ? { width: pt.box.x2 - pt.box.x1, height: pt.box.y2 - pt.box.y1 } : currentTrack.averageSize,
    });
  }

  return trajectory;
}

function getClosestPoint(track: FaceTrack, timestamp: number) {
  if (track.points.length === 0) return null;
  let best = track.points[0];
  let minDiff = Math.abs(best.timestamp - timestamp);
  for (let i = 1; i < track.points.length; i++) {
    const diff = Math.abs(track.points[i].timestamp - timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      best = track.points[i];
    }
  }
  return best;
}

/**
 * Speaker trajectory computation specifically tuned for Dynamic Face Tracking.
 * - Balances short interruptions (stays on current speaker for < 1.1s interruptions)
 * - Transitions on established speaker changes (>= 1.1s sustained speaking)
 * - Suppresses rapid ping-pong switching with a 1.8s post-switch stabilization window
 * - Natural pause hold (1.6s) to keep visual focus during brief speech pauses
 * - Smooth fallback to last known positions during transient face loss
 */
export function computeDynamicSpeakerTrajectory(
  tracks: FaceTrack[],
  clipDurationSec: number,
  clipRelativeWords: WordTimestamp[] = []
): TargetSpeakerTrajectoryPoint[] {
  if (tracks.length === 0) return [];

  // Sort tracks by prominence: duration + average size + centrality
  const sortedTracks = [...tracks].sort((a, b) => {
    const durA = a.lastSeenTimestamp - a.firstTimestamp;
    const durB = b.lastSeenTimestamp - b.firstTimestamp;
    const sizeA = a.averageSize.width * a.averageSize.height;
    const sizeB = b.averageSize.width * b.averageSize.height;
    return durB * 2 + sizeB - (durA * 2 + sizeA);
  });

  const trajectory: TargetSpeakerTrajectoryPoint[] = [];
  const sampleStep = 0.5; // 2 FPS
  const totalSteps = Math.ceil(clipDurationSec / sampleStep);

  const DYNAMIC_SWITCH_DELAY_SEC = 1.1; // Must speak continuously for >= 1.1s to establish switch
  const STABILIZATION_WINDOW_SEC = 1.8; // Prevent rapid oscillation right after a switch
  const DYNAMIC_PAUSE_HOLD_SEC = 1.6; // Hold current speaker through pauses up to 1.6s

  let currentSpeakerTrackId: number = sortedTracks[0].id;
  let currentCandidateTrackId: number | null = null;
  let candidateSpeakingStartTime: number = 0;
  let lastSwitchTimestamp: number = -10.0;
  let lastSpeechDetectedTime: number = 0;

  for (let i = 0; i <= totalSteps; i++) {
    const t = Math.round(i * sampleStep * 1000) / 1000;
    const speechActive = isSpeechActiveAt(t, clipRelativeWords);
    if (speechActive) {
      lastSpeechDetectedTime = t;
    }

    // Find all tracks alive at time t (with grace window for occlusion)
    const aliveTracks = sortedTracks.filter(
      (tr) => t >= tr.firstTimestamp - 0.25 && t <= tr.lastSeenTimestamp + 1.5
    );

    if (aliveTracks.length === 0) {
      // Hold last known position from currentSpeakerTrack or fallback
      const fallbackTrack = sortedTracks.find((tr) => tr.id === currentSpeakerTrackId) || sortedTracks[0];
      const lastPoint = trajectory.length > 0 ? trajectory[trajectory.length - 1] : null;
      trajectory.push({
        timestamp: t,
        trackId: fallbackTrack.id,
        faceCenter: lastPoint ? { ...lastPoint.faceCenter } : { ...fallbackTrack.smoothedCenter },
        faceSize: lastPoint ? { ...lastPoint.faceSize } : { ...fallbackTrack.averageSize },
      });
      continue;
    }

    if (aliveTracks.length === 1) {
      // Only 1 face in frame: lock onto this face
      const singleTrack = aliveTracks[0];
      currentSpeakerTrackId = singleTrack.id;
      currentCandidateTrackId = null;

      const pt = getClosestPoint(singleTrack, t);
      trajectory.push({
        timestamp: t,
        trackId: singleTrack.id,
        faceCenter: pt ? { x: (pt.box.x1 + pt.box.x2) / 2, y: (pt.box.y1 + pt.box.y2) / 2 } : singleTrack.smoothedCenter,
        faceSize: pt ? { width: pt.box.x2 - pt.box.x1, height: pt.box.y2 - pt.box.y1 } : singleTrack.averageSize,
      });
      continue;
    }

    // Multiple faces present: evaluate speaking evidence
    let bestFaceId = currentSpeakerTrackId;
    let maxEvidenceScore = -1;

    for (const track of aliveTracks) {
      const pt = getClosestPoint(track, t);
      const mouthMotion = pt ? pt.mouthMotion : 0;
      const faceArea = track.averageSize.width * track.averageSize.height;

      // Distance from horizontal center (0.5)
      const centerDist = Math.abs(track.smoothedCenter.x - 0.5);
      const centralityScore = 1.0 - Math.min(1.0, centerDist * 1.8);

      let evidenceScore = mouthMotion * (speechActive ? 2.8 : 1.0) + faceArea * 32 + centralityScore * 2;

      // Generous affinity to current speaker to prevent jitter and maintain focus
      if (track.id === currentSpeakerTrackId) {
        evidenceScore += 2.5;
        // If speech is in a brief pause, continue holding current speaker
        if (!speechActive && t - lastSpeechDetectedTime <= DYNAMIC_PAUSE_HOLD_SEC) {
          evidenceScore += 1.5;
        }
      }

      if (evidenceScore > maxEvidenceScore) {
        maxEvidenceScore = evidenceScore;
        bestFaceId = track.id;
      }
    }

    // Hysteresis State Machine with rapid-oscillation protection
    const timeSinceLastSwitch = t - lastSwitchTimestamp;
    const requiredSwitchDelay =
      timeSinceLastSwitch < STABILIZATION_WINDOW_SEC
        ? DYNAMIC_SWITCH_DELAY_SEC + 0.5 // Higher bar if we switched recently (prevents A->B->A->B)
        : DYNAMIC_SWITCH_DELAY_SEC;

    if (bestFaceId === currentSpeakerTrackId) {
      currentCandidateTrackId = null;
    } else {
      if (currentCandidateTrackId === bestFaceId) {
        const candidateDuration = t - candidateSpeakingStartTime;
        if (candidateDuration >= requiredSwitchDelay) {
          // Established speaker switch
          currentSpeakerTrackId = bestFaceId;
          currentCandidateTrackId = null;
          lastSwitchTimestamp = t;
        }
      } else {
        currentCandidateTrackId = bestFaceId;
        candidateSpeakingStartTime = t;
      }
    }

    const currentTrack = aliveTracks.find((tr) => tr.id === currentSpeakerTrackId) || aliveTracks[0];
    const pt = getClosestPoint(currentTrack, t);

    trajectory.push({
      timestamp: t,
      trackId: currentTrack.id,
      faceCenter: pt ? { x: (pt.box.x1 + pt.box.x2) / 2, y: (pt.box.y1 + pt.box.y2) / 2 } : currentTrack.smoothedCenter,
      faceSize: pt ? { width: pt.box.x2 - pt.box.x1, height: pt.box.y2 - pt.box.y1 } : currentTrack.averageSize,
    });
  }

  return trajectory;
}

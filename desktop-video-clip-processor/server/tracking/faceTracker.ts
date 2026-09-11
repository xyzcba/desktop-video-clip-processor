import { FaceBoundingBox, SampledFrameDetection, FaceTrack, FaceTrackPoint } from './trackingTypes';

const MAX_MISSED_SECONDS = 1.5; // Grace period for occlusions / turned heads
const IOU_MATCH_THRESHOLD = 0.20;
const PROXIMITY_MATCH_THRESHOLD = 0.25; // Max normalized distance between box centers to associate

function getBoxCenter(b: FaceBoundingBox): { x: number; y: number } {
  return {
    x: (b.x1 + b.x2) / 2,
    y: (b.y1 + b.y2) / 2,
  };
}

function computeBoxIoU(b1: FaceBoundingBox, b2: FaceBoundingBox): number {
  const ix1 = Math.max(b1.x1, b2.x1);
  const iy1 = Math.max(b1.y1, b2.y1);
  const ix2 = Math.min(b1.x2, b2.x2);
  const iy2 = Math.min(b1.y2, b2.y2);

  const interW = Math.max(0, ix2 - ix1);
  const interH = Math.max(0, iy2 - iy1);
  const interArea = interW * interH;

  const area1 = (b1.x2 - b1.x1) * (b1.y2 - b1.y1);
  const area2 = (b2.x2 - b2.x1) * (b2.y2 - b2.y1);
  const unionArea = area1 + area2 - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Builds temporal FaceTrack objects from sampled frame detections
 */
export function buildFaceTracks(detections: SampledFrameDetection[]): FaceTrack[] {
  const activeTracks: FaceTrack[] = [];
  const completedTracks: FaceTrack[] = [];
  let nextTrackId = 1;

  for (const frame of detections) {
    const matchedTrackIndices = new Set<number>();
    const matchedBoxIndices = new Set<number>();

    // Try matching each detected face to an active track
    for (let bIdx = 0; bIdx < frame.faces.length; bIdx++) {
      const box = frame.faces[bIdx];
      const boxCenter = getBoxCenter(box);
      const mouthMotion = frame.mouthMotionScores[bIdx] || 0;

      let bestTrackIdx = -1;
      let bestMatchScore = -1;

      for (let tIdx = 0; tIdx < activeTracks.length; tIdx++) {
        if (matchedTrackIndices.has(tIdx)) continue;
        const track = activeTracks[tIdx];

        // Check if track has exceeded grace period
        if (frame.timestamp - track.lastSeenTimestamp > MAX_MISSED_SECONDS) {
          continue;
        }

        const lastPoint = track.points[track.points.length - 1];
        const iou = computeBoxIoU(box, lastPoint.box);
        const dist = Math.hypot(boxCenter.x - track.smoothedCenter.x, boxCenter.y - track.smoothedCenter.y);

        // Weighted score preferring higher IoU and closer spatial proximity
        if (iou >= IOU_MATCH_THRESHOLD || dist <= PROXIMITY_MATCH_THRESHOLD) {
          const matchScore = iou * 2.0 + (1.0 - Math.min(1.0, dist / PROXIMITY_MATCH_THRESHOLD));
          if (matchScore > bestMatchScore) {
            bestMatchScore = matchScore;
            bestTrackIdx = tIdx;
          }
        }
      }

      if (bestTrackIdx !== -1) {
        matchedTrackIndices.add(bestTrackIdx);
        matchedBoxIndices.add(bIdx);

        const track = activeTracks[bestTrackIdx];
        track.lastSeenTimestamp = frame.timestamp;
        track.points.push({
          timestamp: frame.timestamp,
          box,
          mouthMotion,
        });

        // Update smoothed center with EMA
        const alpha = 0.35;
        track.smoothedCenter.x = track.smoothedCenter.x * (1 - alpha) + boxCenter.x * alpha;
        track.smoothedCenter.y = track.smoothedCenter.y * (1 - alpha) + boxCenter.y * alpha;

        // Update average dimensions
        const bw = box.x2 - box.x1;
        const bh = box.y2 - box.y1;
        track.averageSize.width = track.averageSize.width * 0.8 + bw * 0.2;
        track.averageSize.height = track.averageSize.height * 0.8 + bh * 0.2;
      }
    }

    // Create new tracks for unmatched boxes
    for (let bIdx = 0; bIdx < frame.faces.length; bIdx++) {
      if (matchedBoxIndices.has(bIdx)) continue;

      const box = frame.faces[bIdx];
      const boxCenter = getBoxCenter(box);
      const mouthMotion = frame.mouthMotionScores[bIdx] || 0;

      activeTracks.push({
        id: nextTrackId++,
        firstTimestamp: frame.timestamp,
        lastSeenTimestamp: frame.timestamp,
        points: [
          {
            timestamp: frame.timestamp,
            box,
            mouthMotion,
          },
        ],
        smoothedCenter: { ...boxCenter },
        averageSize: { width: box.x2 - box.x1, height: box.y2 - box.y1 },
        speakingScore: 0,
        lastSpokeTimestamp: -1,
      });
    }

    // Move stale tracks to completed
    for (let i = activeTracks.length - 1; i >= 0; i--) {
      if (frame.timestamp - activeTracks[i].lastSeenTimestamp > MAX_MISSED_SECONDS) {
        completedTracks.push(activeTracks.splice(i, 1)[0]);
      }
    }
  }

  // Combine remaining active tracks with completed
  const allTracks = [...completedTracks, ...activeTracks];

  // Discard transient single-frame noise tracks
  const validTracks = allTracks.filter(
    (t) => t.points.length >= 2 || (t.lastSeenTimestamp - t.firstTimestamp >= 0.4)
  );

  return validTracks;
}

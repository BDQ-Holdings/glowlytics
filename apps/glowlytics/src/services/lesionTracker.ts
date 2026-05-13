/**
 * Temporal smoothing and tracking for on-device lesion detection.
 *
 * Maintains a sliding window of recent detections and only surfaces
 * "stable" lesions that appear consistently across multiple frames.
 * Assigns persistent tracking IDs via IoU matching so the same lesion
 * keeps the same visual identity across frames.
 *
 * This eliminates:
 * - Flickering (lesion appears/disappears between frames)
 * - Identity jumps (same lesion gets different key each render)
 */
import type { DetectedLesion, LesionClass } from '../types';

/** A tracked lesion with a persistent ID. */
export interface TrackedLesion extends DetectedLesion {
  trackId: string;
  /** Number of frames this lesion has been tracked */
  age: number;
  /** Smoothed confidence (EMA across frames) */
  smoothedConfidence: number;
}

interface TrackedEntry {
  lesion: TrackedLesion;
  /** Frames since last seen (0 = current frame) */
  missedFrames: number;
}

const IOU_MATCH_THRESHOLD = 0.25;
const STABILITY_THRESHOLD = 2; // Must appear in ≥2 of last WINDOW_SIZE frames
const WINDOW_SIZE = 3;
const MAX_MISSED_FRAMES = 2; // Keep tracking for 2 frames after disappearing (fade-out)
const CONFIDENCE_EMA_ALPHA = 0.4; // Smoothing factor for confidence

let nextTrackId = 1;

function generateTrackId(): string {
  return `lesion_${nextTrackId++}`;
}

function computeIoU(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;

  const ax2 = ax + aw, ay2 = ay + ah;
  const bx2 = bx + bw, by2 = by + bh;

  const ix1 = Math.max(ax, bx), iy1 = Math.max(ay, by);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);

  const areaA = aw * ah;
  const areaB = bw * bh;
  return inter / (areaA + areaB - inter + 1e-6);
}

export class LesionTracker {
  private tracked: TrackedEntry[] = [];
  private history: DetectedLesion[][] = [];

  /**
   * Update tracker with new detections from the latest frame.
   * Returns stable, tracked lesions with persistent IDs.
   */
  update(newDetections: DetectedLesion[]): TrackedLesion[] {
    // Push to history for stability check
    this.history.push(newDetections);
    if (this.history.length > WINDOW_SIZE) this.history.shift();

    // Mark all existing tracks as missed this frame
    for (const entry of this.tracked) {
      entry.missedFrames++;
    }

    // Match new detections to existing tracks via IoU
    const matched = new Set<number>(); // indices into this.tracked that were matched

    for (const detection of newDetections) {
      let bestMatchIdx = -1;
      let bestIoU = 0;

      for (let i = 0; i < this.tracked.length; i++) {
        if (matched.has(i)) continue;
        if (this.tracked[i].lesion.class !== detection.class) continue;

        const iou = computeIoU(this.tracked[i].lesion.bbox, detection.bbox);
        if (iou > bestIoU && iou >= IOU_MATCH_THRESHOLD) {
          bestIoU = iou;
          bestMatchIdx = i;
        }
      }

      if (bestMatchIdx >= 0) {
        // Update existing track
        const entry = this.tracked[bestMatchIdx];
        matched.add(bestMatchIdx);
        entry.missedFrames = 0;
        entry.lesion.age++;
        entry.lesion.bbox = detection.bbox;
        entry.lesion.zone = detection.zone;
        entry.lesion.smoothedConfidence =
          CONFIDENCE_EMA_ALPHA * detection.confidence +
          (1 - CONFIDENCE_EMA_ALPHA) * entry.lesion.smoothedConfidence;
        entry.lesion.confidence = entry.lesion.smoothedConfidence;
      } else {
        // New track
        const tracked: TrackedLesion = {
          ...detection,
          trackId: generateTrackId(),
          age: 1,
          smoothedConfidence: detection.confidence,
        };
        this.tracked.push({ lesion: tracked, missedFrames: 0 });
      }
    }

    // Remove tracks that have been missed too long
    this.tracked = this.tracked.filter((entry) => entry.missedFrames <= MAX_MISSED_FRAMES);

    // Only return stable detections (appeared in ≥ STABILITY_THRESHOLD of recent frames)
    return this.tracked
      .filter((entry) => {
        // Count how many of the last WINDOW_SIZE frames contain a detection
        // matching this track (same class, IoU > threshold)
        let appearances = 0;
        for (const frame of this.history) {
          const found = frame.some(
            (d) =>
              d.class === entry.lesion.class &&
              computeIoU(d.bbox, entry.lesion.bbox) >= IOU_MATCH_THRESHOLD,
          );
          if (found) appearances++;
        }
        return appearances >= STABILITY_THRESHOLD || entry.lesion.age >= STABILITY_THRESHOLD;
      })
      .map((entry) => ({ ...entry.lesion }));
  }

  /** Reset all tracking state. */
  reset(): void {
    this.tracked = [];
    this.history = [];
  }
}

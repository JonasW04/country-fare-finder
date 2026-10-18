import type { Point } from "./map-geometry";

export interface LabelCandidate {
  id: string;
  p: Point;
  text: string;
}

export interface PlacedLabel {
  id: string;
  side: "left" | "right";
}

// Rough metrics for 12px UI text; close enough to keep two labels from printing over each other.
const CHAR_W = 6.6;
const LINE_H = 14;
const GAP = 7;

type Rect = [number, number, number, number];

const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/**
 * Greedy placement in priority order: each label goes right of its dot, or left when that runs off
 * the frame or into a placed label; a label that fits neither way is dropped.
 */
export function placeLabels(candidates: LabelCandidate[], max: number, width: number): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const taken: Rect[] = [];
  for (const c of candidates) {
    if (placed.length >= max) break;
    const w = c.text.length * CHAR_W;
    const y0 = c.p[1] - LINE_H / 2;
    const right: Rect = [c.p[0] + GAP, y0, c.p[0] + GAP + w, y0 + LINE_H];
    const left: Rect = [c.p[0] - GAP - w, y0, c.p[0] - GAP, y0 + LINE_H];
    const fits = (r: Rect) => r[0] >= 0 && r[2] <= width && !taken.some((t) => overlaps(t, r));
    const side = fits(right) ? "right" : fits(left) ? "left" : null;
    if (!side) continue;
    taken.push(side === "right" ? right : left);
    placed.push({ id: c.id, side });
  }
  return placed;
}

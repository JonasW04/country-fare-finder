"use client";

import { useId } from "react";
import { curvePath, edgePoint, insideFrame, screenBearing, type Point } from "../lib/map-geometry";

interface Props {
  flyIn: Point;
  flyOut: Point;
  /** Where the origin is drawn, possibly far outside the frame. */
  origin: Point;
  width: number;
  height: number;
}

const EDGE = 10;
const BOW = 0.15;

/**
 * The way in (accent) from the origin to the fly-in city and the way home from the fly-out city.
 * An origin outside the frame is replaced by the point where the line towards it leaves the frame.
 */
export function TripLines({ flyIn, flyOut, origin, width, height }: Props) {
  // useId may contain characters that url(#…) references do not accept.
  const ids = `trip${useId().replace(/[^\w-]/g, "")}`;
  const inside = insideFrame(origin, width, height, EDGE);
  const start = inside ? origin : edgePoint(flyIn, screenBearing(flyIn, origin), width, height, EDGE);
  const end = inside ? origin : edgePoint(flyOut, screenBearing(flyOut, origin), width, height, EDGE);
  return (
    <g fill="none" strokeWidth={2} strokeLinecap="round" pointerEvents="none">
      <defs>
        {/* refX past the tip stops the arrowhead short of the city dot instead of hiding under it. */}
        <marker id={`${ids}in`} viewBox="0 0 10 10" refX="15" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--color-accent)" />
        </marker>
        <marker id={`${ids}out`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--color-home)" />
        </marker>
      </defs>
      <path d={curvePath(start, flyIn, BOW)} stroke="var(--color-accent)" markerEnd={`url(#${ids}in)`} pathLength={400} className="trip-arrow" />
      <path d={curvePath(flyOut, end, BOW)} stroke="var(--color-home)" markerEnd={`url(#${ids}out)`} pathLength={400} className="trip-arrow" />
    </g>
  );
}

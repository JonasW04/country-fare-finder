"use client";

import { useReducedMotion } from "./use-reduced-motion";

const COLORS = ["#FF6B3D", "#2BD4A4", "#FFC94D", "#0B1B2B"];
const BITS = 28;

// Fixed trajectories rather than random ones: render stays pure and every burst looks the same.
const bits = Array.from({ length: BITS }, (_, i) => {
  const angle = (i / BITS) * Math.PI * 2;
  const reach = 80 + ((i * 37) % 60);
  return {
    color: COLORS[i % COLORS.length],
    dx: `${Math.round(Math.cos(angle) * reach)}px`,
    dy: `${Math.round(Math.sin(angle) * reach - 40)}px`,
    spin: `${(i * 97) % 540}deg`,
    delay: `${(i % 5) * 30}ms`,
  };
});

/** A one-off burst over a great deal. Gone entirely with reduced motion. */
export function Confetti() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-8 z-10">
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti-bit absolute block h-2.5 w-1.5 rounded-sm"
          style={{ background: b.color, animationDelay: b.delay, ["--dx" as string]: b.dx, ["--dy" as string]: b.dy, ["--spin" as string]: b.spin }}
        />
      ))}
    </span>
  );
}

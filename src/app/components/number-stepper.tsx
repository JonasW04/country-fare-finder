"use client";

import { useState } from "react";
import { controlBox } from "./control-styles";

interface Props {
  id?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  describedBy?: string;
}

const button = "grid h-full w-8 shrink-0 place-items-center text-lg text-subtle hover:text-text disabled:opacity-40 disabled:hover:text-subtle";

/** − value +, with a typeable number in the middle; no native spinners, which clip in a 44px box. */
export function NumberStepper({ id, label, value, min, max, onChange, describedBy }: Props) {
  // What the traveller is typing, kept apart from the value so clearing the box to retype works.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className={`${controlBox} flex w-24 items-stretch overflow-hidden`}>
      <button type="button" className={button} aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
        −
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={describedBy ? true : undefined}
        value={draft ?? String(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          setDraft(digits);
          if (digits) onChange(clamp(Number(digits)));
        }}
        onBlur={() => setDraft(null)}
        className="w-full min-w-0 bg-transparent text-center tabular-nums"
      />
      <button type="button" className={button} aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
        +
      </button>
    </div>
  );
}

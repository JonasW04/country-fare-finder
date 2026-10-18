"use client";

import { useEffect, useId, useRef, useState } from "react";
import { flagEmoji } from "../lib/flags";
import type { CountryOption } from "../lib/types";

interface Props {
  countries: CountryOption[];
  value: string;
  onChange: (code: string) => void;
  triggerClassName: string;
}

/** A flag-tile grid in a popover; the panel spans the whole search card so it fits a phone screen. */
export function CountryPicker({ countries, value, onChange, triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const current = countries.find((c) => c.code === value);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("[aria-pressed=true], button")?.focus();
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Destination country: ${current?.name ?? "choose"}`}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        <span aria-hidden>{flagEmoji(value)}</span> {current?.name ?? "a country"}
        <span aria-hidden className="ml-1 text-sm opacity-70">▾</span>
      </button>
      <div
        ref={panel}
        id={panelId}
        role="dialog"
        aria-label="Choose a destination country"
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
            trigger.current?.focus();
          }
        }}
        className="absolute inset-x-0 top-full z-30 mt-2 rounded-3xl border border-line bg-surface p-4 text-fg shadow-2xl"
      >
        <p className="mb-3 font-display text-lg font-bold">Where to?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {countries.map((c) => (
            <button
              key={c.code}
              type="button"
              aria-pressed={c.code === value}
              onClick={() => choose(c.code)}
              className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors hover:border-sunset ${
                c.code === value ? "border-sunset bg-sunset/10" : "border-line"
              }`}
            >
              <span aria-hidden className="text-3xl leading-none">
                {flagEmoji(c.code)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{c.name}</span>
                <span className="block text-sm text-muted">{c.airports.length} airports</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

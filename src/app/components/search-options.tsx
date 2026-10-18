"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CABINS, CURRENCIES, type SearchForm } from "../lib/search-form";
import { controlBox, textControl } from "./control-styles";
import { NumberStepper } from "./number-stepper";

interface Props {
  id: string;
  form: SearchForm;
  update: (patch: Partial<SearchForm>) => void;
  describedBy?: string;
}

const label = "mb-1 block text-xs text-subtle";

// Economy goes unsaid so the closed button stays short enough for the one-row bar.
function summary(form: SearchForm): string {
  const cabin = form.cabin === "ECONOMY" ? null : (CABINS.find((c) => c.value === form.cabin)?.label ?? form.cabin);
  return [`${form.adults} ${form.adults === 1 ? "adult" : "adults"}`, cabin, form.currency].filter(Boolean).join(" · ");
}

/** The less-used settings, behind one button so the bar stays a single row on desktop. */
export function SearchOptions({ id, form, update, describedBy }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[data-first]")?.focus();
    const close = (e: MouseEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        id={id}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        className={`${controlBox} flex w-full items-center justify-between gap-2 px-3 text-left whitespace-nowrap`}
      >
        <span className="truncate">{summary(form)}</span>
        <span aria-hidden className="text-xs text-subtle">
          ▾
        </span>
      </button>
      <div
        id={panelId}
        role="dialog"
        aria-label="Search options"
        hidden={!open}
        className="absolute right-0 top-full z-30 mt-1 grid w-72 max-w-[calc(100vw-2rem)] gap-3 rounded-lg border border-rule bg-card p-4 shadow-sm"
      >
        <label className={label}>
          Also fly from
          <input
            data-first
            value={form.secondOrigin}
            maxLength={3}
            placeholder="Airport code, e.g. LTN"
            onChange={(e) => update({ secondOrigin: e.target.value.toUpperCase() })}
            className={`${textControl} mt-1`}
          />
        </label>
        <label className={label}>
          Cabin
          <select value={form.cabin} onChange={(e) => update({ cabin: e.target.value })} className={`${textControl} mt-1`}>
            {CABINS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className={label}>Adults</span>
          <NumberStepper label="Adults" value={form.adults} min={1} max={9} onChange={(adults) => update({ adults })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Currency
            <select value={form.currency} onChange={(e) => update({ currency: e.target.value })} className={`${textControl} mt-1`}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Show up to
            <select value={form.limit} onChange={(e) => update({ limit: Number(e.target.value) })} className={`${textControl} mt-1`}>
              {[5, 10, 20, 30, 50].map((n) => (
                <option key={n} value={n}>
                  {n} trips
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

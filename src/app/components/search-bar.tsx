"use client";

import type { ReactNode } from "react";
import { DATE_PRESETS, localToday } from "../lib/date-presets";
import { errorsByField, type ErrorField } from "../lib/field-errors";
import type { OriginSuggestion } from "../lib/origin-input";
import type { SearchForm } from "../lib/search-form";
import type { CountryOption } from "../lib/types";
import { textControl } from "./control-styles";
import { CountryCombobox } from "./country-combobox";
import { NumberStepper } from "./number-stepper";
import { OriginCombobox } from "./origin-combobox";
import { SearchOptions } from "./search-options";

interface Props {
  form: SearchForm;
  update: (patch: Partial<SearchForm>) => void;
  originText: string;
  onOriginText: (text: string) => void;
  originItems: OriginSuggestion[];
  countries: CountryOption[];
  errors: string[];
  busy: boolean;
  onSubmit: () => void;
  onSurprise: () => void;
}

// The API accepts 1 to 30 nights (src/lib/search-request.ts).
const MAX_NIGHTS = 30;

const errorId = (field: ErrorField) => `${field}-error`;

function Field({ label, htmlFor, messages, field, children }: { label: string; htmlFor?: string; messages?: string[]; field: ErrorField; children: ReactNode }) {
  const labelClass = "mb-1 block text-xs text-subtle";
  return (
    <div className="min-w-0" role={htmlFor ? undefined : "group"} aria-labelledby={htmlFor ? undefined : `${field}-label`}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
      ) : (
        <span id={`${field}-label`} className={labelClass}>
          {label}
        </span>
      )}
      {children}
      {messages ? (
        <div id={errorId(field)} role="alert" className="mt-1 space-y-0.5 text-xs text-accent-text">
          {messages.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SearchBar(props: Props) {
  const { form, update, busy } = props;
  const byField = errorsByField(props.errors);
  const describe = (field: ErrorField) => (byField[field] ? errorId(field) : undefined);
  const textButton = "h-8 rounded-lg px-2 text-sm text-subtle hover:bg-bg hover:text-text disabled:opacity-50";

  return (
    <form
      noValidate
      className="rounded-lg border border-rule bg-card p-3 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      {/* Stacked on phones, two rows on tablets, one row from 1280px. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto_auto] xl:gap-2">
        <Field label="From" htmlFor="origin" field="origin" messages={byField.origin}>
          <OriginCombobox id="origin" text={props.originText} onText={props.onOriginText} items={props.originItems} describedBy={describe("origin")} />
        </Field>
        <Field label="To" htmlFor="country" field="country" messages={byField.country}>
          <CountryCombobox id="country" countries={props.countries} value={form.country} onChange={(country) => update({ country })} describedBy={describe("country")} />
        </Field>
        <Field label="Leave between" field="dates" messages={byField.dates}>
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Earliest departure"
              aria-describedby={describe("dates")}
              value={form.earliest}
              onChange={(e) => update({ earliest: e.target.value })}
              className={`${textControl} min-w-0 flex-1 tabular-nums md:w-36 md:flex-none`}
            />
            <span aria-hidden className="text-subtle">
              –
            </span>
            <input
              type="date"
              aria-label="Latest departure"
              aria-describedby={describe("dates")}
              value={form.latest}
              min={form.earliest}
              onChange={(e) => update({ latest: e.target.value })}
              className={`${textControl} min-w-0 flex-1 tabular-nums md:w-36 md:flex-none`}
            />
          </div>
        </Field>
        <Field label="Nights" field="nights" messages={byField.nights}>
          <div className="flex items-center gap-2">
            <NumberStepper label="Fewest nights" value={form.minNights} min={1} max={form.maxNights} onChange={(minNights) => update({ minNights })} describedBy={describe("nights")} />
            <span aria-hidden className="text-subtle">
              –
            </span>
            <NumberStepper label="Most nights" value={form.maxNights} min={form.minNights} max={MAX_NIGHTS} onChange={(maxNights) => update({ maxNights })} describedBy={describe("nights")} />
          </div>
        </Field>
        <Field label="Options" htmlFor="options" field="options" messages={byField.options}>
          <SearchOptions id="options" form={form} update={update} describedBy={describe("options")} />
        </Field>
        <div className="flex flex-col">
          <span aria-hidden className="mb-1 hidden text-xs md:block">
            &nbsp;
          </span>
          <button type="submit" disabled={busy} className="h-11 rounded-lg bg-accent px-5 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {busy ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {byField.general ? (
        <div role="alert" className="mt-2 space-y-0.5 text-xs text-accent-text">
          {byField.general.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Shortcuts">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={textButton}
            onClick={() => {
              const w = p.window(localToday());
              update({ earliest: w.earliest, latest: w.latest, ...(w.nights ? { minNights: w.nights.min, maxNights: w.nights.max } : {}) });
            }}
          >
            {p.label}
          </button>
        ))}
        <button type="button" className={textButton} disabled={busy} onClick={props.onSurprise}>
          Random country
        </button>
      </div>
    </form>
  );
}

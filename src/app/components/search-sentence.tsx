"use client";

import { DATE_PRESETS, localToday } from "../lib/date-presets";
import { CABINS, CURRENCIES, type SearchForm } from "../lib/search-form";
import type { CountryOption } from "../lib/types";
import { CountryPicker } from "./country-picker";
import { OriginCombobox } from "./origin-combobox";

interface Props {
  form: SearchForm;
  update: (patch: Partial<SearchForm>) => void;
  originText: string;
  onOriginText: (text: string) => void;
  countries: CountryOption[];
  errors: string[];
  busy: boolean;
  onSubmit: () => void;
  onSurprise: () => void;
}

// Inline "pill" fields that sit inside the sentence; 44px tall for touch.
const pill =
  "min-h-11 rounded-xl border-2 border-white/25 bg-white/10 px-3 py-1 font-semibold text-paper placeholder:text-paper/50 hover:border-sunset-soft";
const optionField = "mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-fg";

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const btn = "grid size-11 place-items-center rounded-xl border border-line text-xl font-bold disabled:opacity-40";
  return (
    <div>
      <span className="text-sm font-semibold text-muted">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" className={btn} aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <output aria-live="polite" className="w-8 text-center font-mono text-lg font-semibold">
          {value}
        </output>
        <button type="button" className={btn} aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

export function SearchSentence(props: Props) {
  const { form, update, countries, errors, busy } = props;
  const nights = (key: "minNights" | "maxNights") => (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={30}
      aria-label={key === "minNights" ? "Fewest nights" : "Most nights"}
      value={form[key]}
      onChange={(e) => update({ [key]: Number(e.target.value) })}
      className={`${pill} w-16 text-center font-mono`}
    />
  );

  return (
    <form
      className="relative"
      aria-describedby={errors.length ? "search-errors" : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      <div className="font-display text-2xl leading-[2.4] font-medium text-paper sm:text-3xl sm:leading-[2.2]">
        <label htmlFor="origin">Fly from</label>{" "}
        <OriginCombobox id="origin" label="Flying from (city or airport code)" text={props.originText} onText={props.onOriginText} className={`${pill} w-48 font-mono sm:w-56`} />{" "}
        to{" "}
        <CountryPicker countries={countries} value={form.country} onChange={(country) => update({ country })} triggerClassName={`${pill} inline-flex items-center gap-2`} />{" "}
        <span className="whitespace-nowrap">
          between{" "}
          <input type="date" aria-label="Earliest departure" value={form.earliest} onChange={(e) => update({ earliest: e.target.value })} className={`${pill} font-mono text-lg`} />
        </span>{" "}
        <span className="whitespace-nowrap">
          and{" "}
          <input type="date" aria-label="Latest departure" value={form.latest} min={form.earliest} onChange={(e) => update({ latest: e.target.value })} className={`${pill} font-mono text-lg`} />
        </span>{" "}
        <span className="whitespace-nowrap">
          for {nights("minNights")}–{nights("maxNights")} nights
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Date shortcuts">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              const w = p.window(localToday());
              update({ earliest: w.earliest, latest: w.latest, ...(w.nights ? { minNights: w.nights.min, maxNights: w.nights.max } : {}) });
            }}
            className="min-h-11 rounded-full border border-white/25 px-4 text-sm font-semibold text-paper/90 hover:border-mint hover:text-mint"
          >
            {p.label}
          </button>
        ))}
      </div>

      {errors.length > 0 ? (
        <ul id="search-errors" role="alert" className="mt-4 rounded-2xl border-2 border-sunset bg-sunset/15 px-4 py-3 text-paper">
          {errors.map((e) => (
            <li key={e}>⚠︎ {e.charAt(0).toUpperCase() + e.slice(1)}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="min-h-14 rounded-2xl bg-sunset px-8 font-display text-xl font-bold text-ink shadow-[0_8px_0_0_#b23a10] transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:opacity-70"
        >
          {busy ? "Searching…" : "Find my cities"}
        </button>
        <button type="button" onClick={props.onSurprise} disabled={busy} className="min-h-14 rounded-2xl border-2 border-white/30 px-5 font-semibold text-paper hover:border-mint hover:text-mint disabled:opacity-70">
          🎲 Surprise me
        </button>
      </div>

      <details className="group mt-6 rounded-2xl bg-surface text-fg">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-2xl px-4 font-semibold">
          More options
          <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-semibold text-muted">
            Also fly from
            <input
              value={form.secondOrigin}
              maxLength={3}
              placeholder="e.g. TRF"
              onChange={(e) => update({ secondOrigin: e.target.value.toUpperCase() })}
              className={`${optionField} font-mono uppercase`}
            />
          </label>
          <label className="text-sm font-semibold text-muted">
            Cabin
            <select value={form.cabin} onChange={(e) => update({ cabin: e.target.value })} className={optionField}>
              {CABINS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <Stepper label="Adults" value={form.adults} min={1} max={9} onChange={(adults) => update({ adults })} />
          <label className="text-sm font-semibold text-muted">
            Currency
            <select value={form.currency} onChange={(e) => update({ currency: e.target.value })} className={optionField}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-muted">
            Show up to
            <select value={form.limit} onChange={(e) => update({ limit: Number(e.target.value) })} className={optionField}>
              {[5, 10, 20, 30, 50].map((n) => (
                <option key={n} value={n}>
                  {n} trips
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
    </form>
  );
}

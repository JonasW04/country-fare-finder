"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { SearchResponse } from "@/lib/server/search";
import { localToday, surpriseWindow } from "../lib/date-presets";
import { originCodeFromInput } from "../lib/origin-input";
import { defaultForm, formFromParams, linkHasSearch, paramsFromForm, type SearchForm } from "../lib/search-form";
import type { CountryOption } from "../lib/types";
import { ResultsView } from "./results-view";
import { SearchLoading } from "./search-loading";
import { SearchSentence } from "./search-sentence";
import { parseStoredOrigin, rememberOrigin, useStoredOriginRaw } from "./stored-origin";
import { labelForCode, useAirportSuggestions } from "./use-airport-suggestions";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; form: SearchForm }
  | { kind: "done"; form: SearchForm; response: SearchResponse }
  | { kind: "failed"; form: SearchForm };

interface Props {
  countries: CountryOption[];
  initialParams: Record<string, string>;
  today: string;
}

function errorList(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const errors = (body as { errors?: unknown }).errors;
  return Array.isArray(errors) && errors.every((e) => typeof e === "string") ? errors : null;
}

type Outcome =
  | { kind: "invalid"; errors: string[] }
  | { kind: "failed" }
  | { kind: "aborted" }
  | { kind: "done"; response: SearchResponse };

async function requestSearch(form: SearchForm, signal: AbortSignal): Promise<Outcome> {
  try {
    const res = await fetch(`/api/search?${paramsFromForm(form)}`, { signal });
    const body: unknown = await res.json().catch(() => null);
    const apiErrors = errorList(body);
    if (res.status === 400 && apiErrors) return { kind: "invalid", errors: apiErrors };
    if (!res.ok || apiErrors || body === null) return { kind: "failed" };
    return { kind: "done", response: body as SearchResponse };
  } catch {
    return signal.aborted ? { kind: "aborted" } : { kind: "failed" };
  }
}

export function FareFinder({ countries, initialParams, today }: Props) {
  const fallbackCountry = countries.find((c) => c.code === "IT")?.code ?? countries[0]?.code ?? "";
  const linked = linkHasSearch(initialParams);
  const [form, setForm] = useState(() => formFromParams(initialParams, defaultForm(today, fallbackCountry)));
  // null until the traveller types: the remembered origin shows until then.
  const [typedOrigin, setTypedOrigin] = useState<string | null>(linked ? (initialParams.origin ?? "") : null);
  const [status, setStatus] = useState<Status>(() => (linked ? { kind: "loading", form } : { kind: "idle" }));
  const [errors, setErrors] = useState<string[]>([]);
  const inFlight = useRef<AbortController | null>(null);
  const results = useRef<HTMLDivElement>(null);

  const stored = parseStoredOrigin(useStoredOriginRaw());
  const originText = typedOrigin ?? stored?.label ?? "";
  const originItems = useAirportSuggestions(originText);

  // A link carries only the code; show "London Stansted · STN" unless the traveller has typed since.
  function showLabelFor(code: string) {
    void labelForCode(code).then((label) => setTypedOrigin((text) => (text === code ? label : text)));
  }
  const showLinkedLabel = useEffectEvent(showLabelFor);
  useEffect(() => {
    if (linked && initialParams.origin) showLinkedLabel(initialParams.origin.trim().toUpperCase());
  }, [linked, initialParams.origin]);

  function apply(next: SearchForm, outcome: Outcome) {
    if (outcome.kind === "invalid") {
      setErrors(outcome.errors);
      setStatus({ kind: "idle" });
    } else if (outcome.kind === "failed") setStatus({ kind: "failed", form: next });
    else if (outcome.kind === "done") setStatus({ kind: "done", form: next, response: outcome.response });
  }

  function fetchResults(next: SearchForm) {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    void requestSearch(next, controller.signal).then((outcome) => apply(next, outcome));
  }

  // A shared link runs its search on arrival; the loading state was set by the initial render.
  const applyLinked = useEffectEvent((outcome: Outcome) => apply(form, outcome));
  const linkedForm = useRef(form);
  useEffect(() => {
    if (!linked) return;
    const controller = new AbortController();
    void requestSearch(linkedForm.current, controller.signal).then(applyLinked);
    return () => controller.abort();
  }, [linked]);

  function start(next: SearchForm) {
    if (!next.origin) {
      setErrors(["Tell us where you're flying from: a city, or an airport code like OSL."]);
      document.getElementById("origin")?.focus();
      return;
    }
    setErrors([]);
    setForm(next);
    setStatus({ kind: "loading", form: next });
    rememberOrigin({ iata: next.origin, label: originText.includes("·") ? originText : next.origin });
    window.history.pushState(null, "", `?${paramsFromForm(next)}`);
    results.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    void fetchResults(next);
  }

  const current = { ...form, origin: originCodeFromInput(originText, originItems) };

  // Back and Forward restore the search the address names, without pushing a new history entry.
  const restore = useEffectEvent(() => {
    const params = Object.fromEntries(new URLSearchParams(window.location.search));
    if (!linkHasSearch(params)) {
      inFlight.current?.abort();
      setStatus({ kind: "idle" });
      return;
    }
    const next = formFromParams(params, defaultForm(today, fallbackCountry));
    setErrors([]);
    setForm(next);
    setTypedOrigin(next.origin);
    showLabelFor(next.origin);
    setStatus({ kind: "loading", form: next });
    fetchResults(next);
  });
  useEffect(() => {
    const onPop = () => restore();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function surprise() {
    const others = countries.filter((c) => c.code !== form.country);
    const pick = others[Math.floor(Math.random() * others.length)] ?? countries[0];
    if (!pick) return;
    const w = surpriseWindow(localToday(), Math.random);
    start({ ...current, country: pick.code, earliest: w.earliest, latest: w.latest });
  }

  const busy = status.kind === "loading";
  const country = (code: string) => countries.find((c) => c.code === code);
  const loadingCountry = status.kind === "loading" ? country(status.form.country) : undefined;

  return (
    <>
      <header className="on-ink relative overflow-visible bg-ink text-paper">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-24 -top-24 size-96 rounded-full bg-sunset/25 blur-3xl" />
          <svg className="absolute bottom-0 left-0 h-40 w-full opacity-30" viewBox="0 0 800 160" preserveAspectRatio="none">
            <path d="M0 150 Q 400 -40 800 120" fill="none" stroke="#2BD4A4" strokeWidth="2" strokeDasharray="6 10" />
          </svg>
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-8 sm:pt-12">
          <p className="font-mono text-sm tracking-[0.3em] text-mint uppercase">Country Fare Finder</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl leading-tight font-extrabold sm:text-6xl">
            You pick the country.
            <br />
            <span className="text-sunset">We find the cities.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-paper/80">
            We price every airport in the country and rank the cheapest ways in and out, including flying into one city and home from another.
          </p>
          <div className="mt-8">
            <SearchSentence
              form={form}
              update={(patch) => setForm((f) => ({ ...f, ...patch }))}
              originText={originText}
              onOriginText={setTypedOrigin}
              originItems={originItems}
              countries={countries}
              errors={errors}
              busy={busy}
              onSubmit={() => start(current)}
              onSurprise={surprise}
            />
          </div>
        </div>
      </header>

      <main ref={results} className="mx-auto max-w-6xl scroll-mt-4 px-4 pb-16 sm:px-8">
        {status.kind === "loading" && loadingCountry ? <SearchLoading form={status.form} country={loadingCountry} /> : null}
        {status.kind === "failed" ? (
          <div role="alert" className="mx-auto mt-12 max-w-xl rounded-3xl bg-surface p-8 text-center">
            <p className="font-display text-2xl font-bold">The fare search hit turbulence.</p>
            <p className="mt-2 text-muted">The flight data source did not answer in time. It usually works on a second try.</p>
            <button type="button" onClick={() => start(status.form)} className="mt-6 min-h-12 rounded-2xl bg-sunset px-6 font-bold text-ink">
              Try again
            </button>
          </div>
        ) : null}
        {status.kind === "done" ? (
          <ResultsView
            response={status.response}
            country={country(status.form.country)}
            countries={countries}
            originLabel={originText}
            onWiden={(patch) => start({ ...status.form, ...patch })}
          />
        ) : null}
        {status.kind === "idle" ? (
          <p className="mx-auto mt-12 max-w-xl text-center text-muted">
            Tip: open-jaw trips (into one city, home from another) are often cheaper than a round trip, and you see twice as much.
          </p>
        ) : null}
      </main>
    </>
  );
}

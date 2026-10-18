"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Combination } from "@/lib/ranking";
import type { SearchResponse } from "@/lib/server/search";
import { localToday, surpriseWindow } from "../lib/date-presets";
import { MISSING_ORIGIN } from "../lib/field-errors";
import { originCodeFromInput } from "../lib/origin-input";
import { defaultForm, formFromParams, linkHasSearch, paramsFromForm, type SearchForm } from "../lib/search-form";
import type { CountryOption } from "../lib/types";
import { ResultsLayout } from "./results-layout";
import { SearchBar } from "./search-bar";
import { SearchLoading } from "./search-loading";
import { parseStoredOrigin, rememberOrigin, useStoredOriginRaw } from "./stored-origin";
import { TopBar } from "./top-bar";
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
  // Shared by the map and the list: the trip card under the pointer, and the city dot clicked.
  const [focusedTrip, setFocusedTrip] = useState<Combination | null>(null);
  const [selectedMetro, setSelectedMetro] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const results = useRef<HTMLElement>(null);

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

  // A new search starts with nothing highlighted: the old trip and city may not be in the new results.
  function beginLoading(next: SearchForm) {
    setFocusedTrip(null);
    setSelectedMetro(null);
    setStatus({ kind: "loading", form: next });
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
      setErrors([MISSING_ORIGIN]);
      document.getElementById("origin")?.focus();
      return;
    }
    setErrors([]);
    setForm(next);
    beginLoading(next);
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
    beginLoading(next);
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
      <TopBar />
      <div className="mx-auto max-w-[1200px] px-4 pt-4">
        <SearchBar
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

      <main ref={results} className="mx-auto max-w-[1200px] scroll-mt-[72px] px-4 pt-4 pb-16">
        {status.kind === "loading" && loadingCountry ? <SearchLoading form={status.form} country={loadingCountry} /> : null}
        {status.kind === "failed" ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p>The flight data source did not answer in time; a second try usually works.</p>
            <button type="button" onClick={() => start(status.form)} className="h-9 rounded-lg border border-rule bg-card px-3 font-medium hover:border-subtle">
              Try again
            </button>
          </div>
        ) : null}
        {status.kind === "done" ? (
          <ResultsLayout
            response={status.response}
            countries={countries}
            country={country(status.form.country)}
            originLabel={originText}
            focusedTrip={focusedTrip}
            onFocusTrip={setFocusedTrip}
            selectedMetro={selectedMetro}
            onSelectMetro={setSelectedMetro}
            onWiden={(patch) => start({ ...status.form, ...patch })}
          />
        ) : null}
        {status.kind === "idle" ? (
          <p className="text-subtle">Pick a country and dates, then search. Open-jaw trips, into one city and home from another, are often cheaper.</p>
        ) : null}
      </main>
    </>
  );
}

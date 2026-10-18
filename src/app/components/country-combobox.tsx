"use client";

import { useId, useState } from "react";
import { matchCountries } from "../lib/country-search";
import { flagEmoji } from "../lib/flags";
import type { CountryOption } from "../lib/types";
import { listPanel, optionRow, textControl } from "./control-styles";

interface Props {
  id: string;
  countries: CountryOption[];
  value: string;
  onChange: (code: string) => void;
  describedBy?: string;
}

/** ARIA 1.2 type-ahead combobox over every supported country; closed, it shows the chosen one. */
export function CountryCombobox({ id, countries, value, onChange, describedBy }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  // null while the traveller is not typing, so the box shows the selected country's name.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const current = countries.find((c) => c.code === value);
  const items = matchCountries(countries, query ?? "");
  const expanded = open && items.length > 0;

  function highlight(i: number) {
    setActive(i);
    document.getElementById(`${listId}-${i}`)?.scrollIntoView({ block: "nearest" });
  }

  function pick(c: CountryOption) {
    onChange(c.code);
    setQuery(null);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && items.length > 0) {
      e.preventDefault();
      setOpen(true);
      highlight((active + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length > 0) {
      e.preventDefault();
      setOpen(true);
      highlight(active <= 0 ? items.length - 1 : active - 1);
    } else if (e.key === "Enter" && expanded) {
      const chosen = items[active] ?? items[0];
      if (chosen) {
        // Enter picks a country instead of submitting the search.
        e.preventDefault();
        pick(chosen);
      }
    } else if (e.key === "Escape" && expanded) {
      e.preventDefault();
      setOpen(false);
      setQuery(null);
    }
  }

  return (
    <div className="relative">
      {query === null && current ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[15px]">
          {flagEmoji(current.code)}
        </span>
      ) : null}
      <input
        id={id}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={describedBy ? true : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Country"
        value={query ?? current?.name ?? ""}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={(e) => {
          e.target.select();
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setQuery(null);
        }}
        onKeyDown={onKeyDown}
        className={`${textControl} ${query === null && current ? "pl-9" : ""}`}
      />
      <ul id={listId} role="listbox" aria-label="Countries" hidden={!expanded} className={listPanel}>
        {items.map((c, i) => (
          <li
            key={c.code}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active || (active < 0 && c.code === value)}
            // mousedown fires before the input's blur, which would otherwise close the list first.
            onMouseDown={(e) => {
              e.preventDefault();
              pick(c);
            }}
            className={optionRow(i === active)}
          >
            <span aria-hidden>{flagEmoji(c.code)}</span>
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <span className="text-xs text-subtle tabular-nums">
              {c.airports.length} {c.airports.length === 1 ? "airport" : "airports"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

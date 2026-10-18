"use client";

import { useId, useState } from "react";
import { flagEmoji } from "../lib/flags";
import { originLabel, type OriginSuggestion } from "../lib/origin-input";

interface Props {
  id: string;
  text: string;
  onText: (text: string) => void;
  /** Suggestions for the current text, fetched by the parent (see useAirportSuggestions). */
  items: OriginSuggestion[];
  label: string;
  className?: string;
}

/**
 * ARIA 1.2 combobox over the airport suggestions. While GET /api/airports is missing or failing the
 * list just stays empty and a typed three-letter code is accepted as the origin.
 */
export function OriginCombobox({ id, text, onText, items, label, className = "" }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const expanded = open && items.length > 0;

  function pick(s: OriginSuggestion) {
    onText(originLabel(s));
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && items.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && expanded) {
      // With nothing highlighted, Enter takes the first match: typing "oslo" then Enter means Oslo.
      const chosen = items[active] ?? items[0];
      if (chosen) {
        // Enter picks an airport instead of submitting the search.
        e.preventDefault();
        pick(chosen);
      }
    } else if (e.key === "Escape" && expanded) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <span className="relative inline-block">
      <input
        id={id}
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="City or code"
        value={text}
        onChange={(e) => {
          onText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={className}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Matching airports"
        hidden={!expanded}
        className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-surface py-2 text-left text-fg shadow-2xl"
      >
        {items.map((s, i) => (
          <li
            key={s.iata}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            // mousedown fires before the input's blur, which would otherwise close the list first.
            onMouseDown={(e) => {
              e.preventDefault();
              pick(s);
            }}
            className={`flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-base ${i === active ? "bg-sunset/15" : ""}`}
          >
            <span aria-hidden>{flagEmoji(s.country)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{s.city}</span>
              <span className="block truncate text-sm text-muted">{s.name}</span>
            </span>
            <span className="font-mono text-sm font-semibold">{s.iata}</span>
          </li>
        ))}
      </ul>
    </span>
  );
}

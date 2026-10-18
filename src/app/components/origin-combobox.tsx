"use client";

import { useId, useState } from "react";
import { flagEmoji } from "../lib/flags";
import { originLabel, type OriginSuggestion } from "../lib/origin-input";
import { listPanel, optionRow, textControl } from "./control-styles";

interface Props {
  id: string;
  text: string;
  onText: (text: string) => void;
  /** Suggestions for the current text, fetched by the parent (see useAirportSuggestions). */
  items: OriginSuggestion[];
  /** Id of the message under the control, when there is one. */
  describedBy?: string;
}

/**
 * ARIA 1.2 combobox over the airport suggestions. While GET /api/airports is missing or failing the
 * list just stays empty and a typed three-letter code is accepted as the origin.
 */
export function OriginCombobox({ id, text, onText, items, describedBy }: Props) {
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
    <div className="relative">
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
        placeholder="City or airport code"
        value={text}
        onChange={(e) => {
          onText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={textControl}
      />
      <ul id={listId} role="listbox" aria-label="Matching airports" hidden={!expanded} className={listPanel}>
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
            className={optionRow(i === active)}
          >
            <span aria-hidden>{flagEmoji(s.country)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.city}</span>
              <span className="block truncate text-xs text-subtle">{s.name}</span>
            </span>
            <span className="text-xs font-semibold text-subtle">{s.iata}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

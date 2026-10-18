// Shared look for the search bar controls, so every box is the same 44px height and 15px text.
export const controlBox = "h-11 rounded-lg border border-rule bg-card text-[15px] text-text hover:border-subtle";

export const textControl = `${controlBox} w-full px-3 placeholder:text-subtle`;

/** The listbox under a combobox: a plain card, one thin border, a light shadow to lift it off the page. */
export const listPanel = "absolute left-0 top-full z-30 mt-1 max-h-80 w-full min-w-72 overflow-y-auto rounded-lg border border-rule bg-card py-1 text-text shadow-sm";

export const optionRow = (active: boolean) =>
  `flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm ${active ? "bg-bg" : ""}`;

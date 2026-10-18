import { supportedCountries } from "@/lib/airports";

const input = "mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

export function SearchForm({ values }: { values: Record<string, string> }) {
  const v = (key: string, fallback = "") => values[key] ?? fallback;
  return (
    <form method="get" action="/" className="grid grid-cols-2 gap-4 rounded-lg bg-white p-4 shadow-sm md:grid-cols-4">
      <Field label="Origin airport (IATA)">
        <input name="origin" required maxLength={3} defaultValue={v("origin", "LHR")} className={`${input} uppercase`} />
      </Field>
      <Field label="Second origin (optional)">
        <input name="secondOrigin" maxLength={3} defaultValue={v("secondOrigin")} className={`${input} uppercase`} />
      </Field>
      <Field label="Destination country">
        <select name="country" defaultValue={v("country", "IT")} className={input}>
          {Object.entries(supportedCountries()).map(([code, name]) => (
            <option key={code} value={code}>
              {name} ({code})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Cabin">
        <select name="cabin" defaultValue={v("cabin", "ECONOMY")} className={input}>
          {["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Earliest outbound">
        <input type="date" name="earliest" required defaultValue={v("earliest")} className={input} />
      </Field>
      <Field label="Latest outbound">
        <input type="date" name="latest" required defaultValue={v("latest")} className={input} />
      </Field>
      <Field label="Min nights">
        <input type="number" name="minNights" min={1} max={30} defaultValue={v("minNights", "5")} className={input} />
      </Field>
      <Field label="Max nights">
        <input type="number" name="maxNights" min={1} max={30} defaultValue={v("maxNights", "10")} className={input} />
      </Field>
      <Field label="Adults">
        <input type="number" name="adults" min={1} max={9} defaultValue={v("adults", "1")} className={input} />
      </Field>
      <Field label="Currency">
        <input name="currency" maxLength={3} defaultValue={v("currency", "EUR")} className={`${input} uppercase`} />
      </Field>
      <Field label="Results">
        <input type="number" name="limit" min={1} max={50} defaultValue={v("limit", "10")} className={input} />
      </Field>
      <div className="flex items-end">
        <button type="submit" className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          Find fares
        </button>
      </div>
    </form>
  );
}

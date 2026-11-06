"use client";

import { BANDS, BOROUGHS, type Band, type Borough } from "@/lib/types";
import type { Filters } from "@/lib/filters";

const BAND_RANGE: Record<Band, string> = { Elementary: "Pre-K–5", Middle: "6–8", High: "9–12" };

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  idPrefix: string;
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Borough + grade band tile grids (design system 8) and the optional name search. */
export default function FilterControls({ filters, onChange, idPrefix }: Props) {
  return (
    <div className="filters">
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-q`}>Search by school or network</label>
        <input
          id={`${idPrefix}-q`}
          className="search-input"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="e.g. KIPP, Success Academy"
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
        />
      </div>

      <fieldset className="field">
        <legend className="field-label">Borough</legend>
        <div className="tile-grid">
          {BOROUGHS.map((b: Borough) => {
            const on = filters.boroughs.includes(b);
            return (
              <button
                key={b}
                type="button"
                className={`tile${on ? " active" : ""}`}
                aria-pressed={on}
                onClick={() => onChange({ ...filters, boroughs: toggle(filters.boroughs, b) })}
              >
                {b === "Bronx" ? "The Bronx" : b}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">Grade level</legend>
        <div className="tile-grid">
          {BANDS.map((b) => {
            const on = filters.bands.includes(b);
            return (
              <button
                key={b}
                type="button"
                className={`tile${on ? " active" : ""}`}
                aria-pressed={on}
                onClick={() => onChange({ ...filters, bands: toggle(filters.bands, b) })}
              >
                <span className={`swatch swatch-${b.toLowerCase()}`} aria-hidden="true" />
                <span className="tile-text">
                  {b}
                  <span className="tile-sub">{BAND_RANGE[b]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

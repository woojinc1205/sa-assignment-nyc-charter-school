import { BANDS, BOROUGHS, type Band, type Borough, type CampusProps } from "./types";

export type View = "map" | "list";

export interface Filters {
  boroughs: Borough[];
  bands: Band[];
  q: string;
}

export interface UrlState extends Filters {
  view: View;
  campus: string | null;
}

export const EMPTY_FILTERS: Filters = { boroughs: [], bands: [], q: "" };

const BORO_SLUG: Record<Borough, string> = {
  Bronx: "bronx", Brooklyn: "brooklyn", Manhattan: "manhattan", Queens: "queens", "Staten Island": "staten-island",
};
const BAND_SLUG: Record<Band, string> = { Elementary: "elementary", Middle: "middle", High: "high" };

function fromSlugs<T extends string>(raw: string | null, all: readonly T[], slug: Record<T, string>): T[] {
  if (!raw) return [];
  const wanted = new Set(raw.split(",").map((s) => s.trim().toLowerCase()));
  return all.filter((v) => wanted.has(slug[v]));
}

/** Filter state lives in the URL so a filtered view can be shared (PRD 6.3). */
export function readUrl(search: string): UrlState {
  const p = new URLSearchParams(search);
  return {
    boroughs: fromSlugs(p.get("borough"), BOROUGHS, BORO_SLUG),
    bands: fromSlugs(p.get("grade"), BANDS, BAND_SLUG),
    q: p.get("q") ?? "",
    view: p.get("view") === "list" ? "list" : "map",
    campus: p.get("school"),
  };
}

export function writeUrl(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.boroughs.length) p.set("borough", s.boroughs.map((b) => BORO_SLUG[b]).join(","));
  if (s.bands.length) p.set("grade", s.bands.map((b) => BAND_SLUG[b]).join(","));
  if (s.q.trim()) p.set("q", s.q.trim());
  if (s.view === "list") p.set("view", "list");
  if (s.campus) p.set("school", s.campus);
  const qs = p.toString().replace(/%2C/g, ",");
  return qs ? `?${qs}` : "";
}

/**
 * A campus matches if its borough is selected (or none are) and any grade it
 * serves falls in a selected band (or none are): a K–8 campus appears under
 * both Elementary and Middle (PRD 6.3, decision D2).
 */
export function matches(p: CampusProps, f: Filters): boolean {
  if (f.boroughs.length && !f.boroughs.includes(p.borough)) return false;
  if (f.bands.length && !p.grade_bands.some((b) => f.bands.includes(b))) return false;
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = `${p.name} ${p.campus_name ?? ""} ${p.network ?? ""}`.toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

export function activeCount(f: Filters): number {
  return f.boroughs.length + f.bands.length + (f.q.trim() ? 1 : 0);
}

/** Great-circle distance in miles. */
export function milesBetween(a: [number, number], b: [number, number]): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

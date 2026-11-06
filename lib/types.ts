// Shared record schema (PRD 5.2). Used by the data pipeline and the app.

export const BOROUGHS = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"] as const;
export type Borough = (typeof BOROUGHS)[number];

export const BANDS = ["Elementary", "Middle", "High"] as const;
export type Band = (typeof BANDS)[number];
export type MarkerBand = Band | "Multi" | "Unknown";

export type Source = "json" | "kml" | "json+kml";

export type Flag =
  | "maybe_closed"
  | "geocoded"
  | "geocode_low_confidence"
  | "grades_unknown"
  | "borough_corrected"
  | "near_shoreline"
  | "borough_mismatch";

export interface CampusProps {
  campus_id: string;
  school_id: string;
  name: string;
  campus_name?: string;
  network?: string;
  address: string;
  borough: Borough;
  csd?: string;
  lat: number;
  lng: number;
  grade_min?: number;
  grade_max?: number;
  grades: number[];
  grade_bands: Band[];
  /** Planned final grade span from source A (detail view only). */
  grades_final?: number[];
  neighborhood?: string;
  principal?: string;
  phone?: string;
  opened?: string;
  source: Source;
  data_as_of: string;
  coord_source: "json" | "geocoded";
  is_success_academy: boolean;
  marker_band: MarkerBand;
  flags: Flag[];
  former_school_id?: string;
}

export interface SchoolsMeta {
  /** ISO timestamp of the build or refresh that produced this data. */
  generated: string;
  /** NYC Open Data school list. `as_of` is the fiscal year (e.g. "2020" = school year 2019–20). */
  source_a: { name: string; as_of: string; fetched: string };
  /** Charter campus KML. `as_of` is an ISO date taken from the KML's own folder name. */
  source_b: { name: string; as_of: string };
  campuses: number;
  schools: number;
  /** Set when this data came from the in-app refresh instead of the published build. */
  refreshed?: { at: string; json: "published" | "live"; kml: "published" | "repo" };
}

export interface SchoolsCollection {
  type: "FeatureCollection";
  metadata: SchoolsMeta;
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: CampusProps;
  }>;
}

export function gradeLabel(g: number): string {
  return g === -1 ? "Pre-K" : g === 0 ? "K" : String(g);
}

/** Compact grade list: [-1,0,1,2,3,4] -> "Pre-K, K, 1–4". */
export function formatGrades(grades: number[]): string {
  const out: string[] = [];
  const nums = grades.filter((g) => g >= 1);
  for (const g of grades.filter((g) => g < 1)) out.push(gradeLabel(g));
  let i = 0;
  while (i < nums.length) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j > i ? `${nums[i]}–${nums[j]}` : String(nums[i]));
    i = j + 1;
  }
  return out.join(", ");
}

/** Short span for cards: [-1..4] -> "Pre-K–4". */
export function gradeSpan(p: Pick<CampusProps, "grade_min" | "grade_max">): string {
  if (p.grade_min === undefined || p.grade_max === undefined) return "Grades unknown";
  if (p.grade_min === p.grade_max) return gradeLabel(p.grade_min);
  return `${gradeLabel(p.grade_min)}–${gradeLabel(p.grade_max)}`;
}

/** Fiscal year "2020" -> school year "2019–20". */
export function schoolYear(fiscalYear: string): string {
  const y = parseInt(fiscalYear.slice(0, 4), 10);
  return Number.isFinite(y) ? `${y - 1}–${String(y).slice(2)}` : fiscalYear;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2025-09-18" -> "18 September 2025"; "2026-11-06T…" works too. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}` : iso;
}

/** "2025-09-18" -> "Sep 2025". */
export function formatMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[parseInt(m[2], 10) - 1].slice(0, 3)} ${m[1]}` : iso;
}

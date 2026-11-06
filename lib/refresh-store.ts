// Where an in-app refresh is kept: this browser's localStorage. Kept separate from refresh.ts so the
// app can read it on load without pulling in the merge pipeline.
import type { ReportRow } from "./pipeline/build.ts";
import type { GeoCache } from "./pipeline/geocode.ts";
import type { SchoolsCollection } from "./types";

const STORAGE_KEY = "ncsm:refresh:v1";

export interface SourceASnapshot {
  fetched: string;
  rows: unknown;
}

export interface Stored {
  /** `metadata.generated` of the published build this refresh started from. */
  basedOn: string;
  collection: SchoolsCollection;
  report: ReportRow[];
  /** Present once source A has been refreshed live. */
  a?: SourceASnapshot;
  /** Present once the KML has been refreshed. */
  kml?: string;
  /** Geocoder answers looked up in this browser, on top of the published cache. */
  geocode: GeoCache;
}

export function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

/** Returns false if the browser refused (private mode, storage full). */
export function writeStored(s: Stored): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function clearRefreshed(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

/**
 * The refreshed data saved in this browser, if it was made from the current published build.
 * When the site is rebuilt, the published data supersedes an older refresh, so it is dropped.
 */
export function loadRefreshed(published: SchoolsCollection): { collection: SchoolsCollection; report: ReportRow[] } | null {
  const s = readStored();
  if (!s) return null;
  if (s.basedOn !== published.metadata.generated) {
    clearRefreshed();
    return null;
  }
  return { collection: s.collection, report: s.report };
}

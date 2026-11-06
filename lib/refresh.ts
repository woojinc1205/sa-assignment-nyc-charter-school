// In-app data refresh (client only). Re-reads NYC Open Data live and the repo's KML, then runs the same
// merge as `npm run data` in the browser. The result is kept in this browser's localStorage.
import { Boroughs } from "./pipeline/boroughs.ts";
import { buildSchools, diffCollections, type ReportRow } from "./pipeline/build.ts";
import { BOUNDARIES_URL, GEOCODE_CACHE_FILE, KML_FILE, SOURCE_A_FILE, SOURCE_A_URL, type Progress } from "./pipeline/config.ts";
import { Geocoder, type GeoCache, type GetJson } from "./pipeline/geocode.ts";
import { readStored, writeStored, type SourceASnapshot } from "./refresh-store.ts";
import type { SchoolsCollection } from "./types";

export type SourceKey = "json" | "kml";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** The campus KML. Defaults to the copy the site serves from the repo; set NEXT_PUBLIC_KML_URL to point elsewhere. */
const KML_URL = process.env.NEXT_PUBLIC_KML_URL || `${BASE}/${KML_FILE}`;

export class RefreshError extends Error {}

export interface RefreshResult {
  collection: SchoolsCollection;
  report: ReportRow[];
  diff: ReturnType<typeof diffCollections>;
  /** False if the browser refused to store it (private mode, full storage); it still shows for this visit. */
  persisted: boolean;
  newAddresses: number;
}

// ------------------------------------------------------------------ network

const getJson: GetJson = async (url, params) => {
  const u = new URL(url, window.location.href); // same-origin paths are relative
  for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, String(v));
  const res = await fetch(u, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-cache" }); // always revalidate: the point is the latest file
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Run one stage; a failure becomes a RefreshError with a message fit to show. `plain` appends the cause as a sentence. */
async function step<T>(message: string, fn: () => Promise<T>, plain = false): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RefreshError) throw e;
    throw new RefreshError(plain ? `${message} ${(e as Error).message}` : `${message} (${(e as Error).message})`);
  }
}

let boundariesCache: Boroughs | null = null;

// ------------------------------------------------------------------ refresh

export interface RefreshOptions {
  sources: SourceKey[];
  /** The published build the app loaded. */
  published: SchoolsCollection;
  /** What is on screen now. */
  current: SchoolsCollection;
  onProgress: (p: Progress) => void;
}

export async function refreshData({ sources, published, current, onProgress }: RefreshOptions): Promise<RefreshResult> {
  const now = new Date().toISOString();
  const stored = readStored();
  const prior = stored && stored.basedOn === published.metadata.generated ? stored : null;
  let a = prior?.a;
  let kml = prior?.kml;

  if (sources.includes("json")) {
    onProgress({ step: "Getting the latest school list from NYC Open Data" });
    a = await step("Couldn't reach NYC Open Data. Check your connection and try again.", async () => ({ fetched: now, rows: await getJson(SOURCE_A_URL) }));
  } else if (!a) {
    a = await step("Couldn't load the saved school list.", async () => (await getJson(`${BASE}/${SOURCE_A_FILE}`)) as SourceASnapshot);
  }

  if (sources.includes("kml")) {
    onProgress({ step: "Getting the latest campus KML from the repo" });
    kml = await step("Couldn't load the campus KML from the repo.", () => fetchText(KML_URL));
  } else if (!kml) {
    kml = await step("Couldn't load the saved campus KML.", () => fetchText(`${BASE}/${KML_FILE}`));
  }

  onProgress({ step: "Loading saved address lookups" });
  const publishedCache = await step("Couldn't load saved address lookups.", async () => (await getJson(`${BASE}/${GEOCODE_CACHE_FILE}`)) as GeoCache);
  const geocoder = new Geocoder({ ...publishedCache, ...prior?.geocode }, getJson);

  if (!boundariesCache) {
    onProgress({ step: "Loading borough boundaries" });
    boundariesCache = await step("Couldn't load NYC borough boundaries to check the pins.", async () =>
      new Boroughs((await getJson(BOUNDARIES_URL)) as never));
  }

  const built = await step("The new data wasn't used.", () =>
    buildSchools({ aRows: a!.rows, aFetched: a!.fetched, kmlText: kml!, geocoder, boroughs: boundariesCache!, now, onProgress }), true);

  // A bad file should never wipe the map: keep the current data if the result is far smaller.
  const before = current.metadata.campuses;
  if (built.collection.metadata.campuses < before * 0.5) {
    throw new RefreshError(
      `The refreshed data has only ${built.collection.metadata.campuses} campuses (it had ${before}). Keeping what you have.`);
  }

  // Which inputs came from a refresh (now or earlier) rather than the published build
  const jsonLive = sources.includes("json") || !!prior?.a;
  const kmlRepo = sources.includes("kml") || !!prior?.kml;
  const collection: SchoolsCollection = {
    ...built.collection,
    metadata: {
      ...built.collection.metadata,
      refreshed: { at: now, json: jsonLive ? "live" : "published", kml: kmlRepo ? "repo" : "published" },
    },
  };
  const newEntries = geocoder.newEntries();
  const persisted = writeStored({
    basedOn: published.metadata.generated,
    collection,
    report: built.report,
    a: jsonLive ? a : undefined,
    kml: kmlRepo ? kml : undefined,
    geocode: { ...prior?.geocode, ...newEntries },
  });

  return {
    collection,
    report: built.report,
    diff: diffCollections(current, collection),
    persisted,
    newAddresses: Object.keys(newEntries).length,
  };
}

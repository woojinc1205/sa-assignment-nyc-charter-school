/**
 * Build-time data pipeline for the NYC Charter School Map (PRD section 5).
 * The merge logic lives in lib/pipeline/ and is shared with the in-app refresh;
 * this script only reads and writes files.
 *
 * Inputs (all in public/data/ so the site can serve them to the in-app refresh)
 *   NYC_Charter_School_Campuses.kml  Source B, the campus list. Replace this file to update the campuses.
 *   source-a.json                    Source A, a snapshot of NYC Open Data { fetched, rows }.
 *   geocode-cache.json               Raw geocoder answers, so reruns make no network calls.
 *
 * Outputs
 *   public/data/schools.geojson      One feature per campus, loaded by the app
 *   data/merge-report.csv            Matched / KML-only / JSON-only / geocode and validation notes
 *
 * Usage (Node >= 22.18 runs TypeScript directly)
 *   npm run data           rebuild from the files above
 *   npm run data:refresh   fetch a fresh snapshot of source A first
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { Boroughs } from "../lib/pipeline/boroughs.ts";
import { buildSchools, reportToCsv } from "../lib/pipeline/build.ts";
import { BOUNDARIES_URL, GEOCODE_CACHE_FILE, KML_FILE, SOURCE_A_FILE, SOURCE_A_URL } from "../lib/pipeline/config.ts";
import { Geocoder, type GeoCache, type GetJson } from "../lib/pipeline/geocode.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const KML_PATH = join(PUBLIC, KML_FILE);
const SOURCE_A_PATH = join(PUBLIC, SOURCE_A_FILE);
const CACHE_PATH = join(PUBLIC, GEOCODE_CACHE_FILE);
const OUT_PATH = join(PUBLIC, "data", "schools.geojson");
const REPORT_PATH = join(ROOT, "data", "merge-report.csv");
const BOUNDARIES_PATH = join(ROOT, "data", "raw", "borough-boundaries.geojson"); // downloaded once, not committed

const log = (...a: unknown[]) => console.error(...a);

const getJson: GetJson = async (url, params) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, String(v));
  const res = await fetch(u, { headers: { "User-Agent": "nyc-charter-school-map-build/1.0", Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${u}`);
  return res.json();
};

async function main() {
  const refresh = process.argv.includes("--refresh");

  // Source A: a snapshot of NYC Open Data
  if (refresh || !existsSync(SOURCE_A_PATH)) {
    log("Fetching source A from NYC Open Data ...");
    const rows = await getJson(SOURCE_A_URL);
    writeFileSync(SOURCE_A_PATH, JSON.stringify({ fetched: new Date().toISOString(), rows }));
  }
  const a = JSON.parse(readFileSync(SOURCE_A_PATH, "utf8")) as { fetched: string; rows: unknown };

  // Source B: the KML in the repo
  const kmlText = readFileSync(KML_PATH, "utf8");

  if (!existsSync(BOUNDARIES_PATH)) {
    log("Fetching borough boundaries ...");
    mkdirSync(dirname(BOUNDARIES_PATH), { recursive: true });
    writeFileSync(BOUNDARIES_PATH, JSON.stringify(await getJson(BOUNDARIES_URL)));
  }
  const boroughs = new Boroughs(JSON.parse(readFileSync(BOUNDARIES_PATH, "utf8")) as FeatureCollection<Polygon | MultiPolygon>);

  const cache: GeoCache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) : {};
  const geocoder = new Geocoder(cache, getJson, (m) => log("  " + m));

  const { collection, report } = await buildSchools({
    aRows: a.rows,
    aFetched: a.fetched,
    kmlText,
    geocoder,
    boroughs,
    now: new Date().toISOString(),
    onProgress: (p) => p.total === undefined && log(p.step + " ..."),
  });

  const sorted = Object.fromEntries(Object.entries(geocoder.all()).sort(([x], [y]) => x.localeCompare(y)));
  writeFileSync(CACHE_PATH, JSON.stringify(sorted, null, 1) + "\n");
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(collection));
  writeFileSync(REPORT_PATH, reportToCsv(report));

  const count = <T,>(xs: T[]) => xs.reduce<Record<string, number>>((m, x) => ((m[String(x)] = (m[String(x)] ?? 0) + 1), m), {});
  const f = collection.features.map((x) => x.properties);
  log(`\nWrote ${collection.metadata.campuses} campuses (${collection.metadata.schools} schools) -> ${relative(ROOT, OUT_PATH)}`);
  log("Report:", count(report.map((r) => r.category)));
  log("Sources:", count(f.map((p) => p.source)));
  log("Marker bands:", count(f.map((p) => p.marker_band)));
  log("Success Academy campuses:", f.filter((p) => p.is_success_academy).length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

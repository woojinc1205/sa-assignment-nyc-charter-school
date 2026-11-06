/**
 * Build-time data pipeline for the NYC Charter School Map (PRD section 5).
 *
 * Inputs
 *   A  NYC Open Data 2019-20 school locations (wg9x-4ke6), charter rows only.
 *      Fetched from the Socrata API and kept as a dated snapshot in data/raw/.
 *   B  data/raw/NYC_Charter_School_Campuses.kml (Google My Maps export, 18 Sep 2025).
 *
 * Outputs
 *   public/data/schools.geojson  one feature per campus, loaded by the app
 *   data/merge-report.csv        matched / kml_only / json_only / geocode + validation issues
 *   data/geocode-cache.json      raw geocoder answers, so reruns make no network calls
 *
 * Usage (Node >= 22.18 runs TypeScript directly)
 *   npm run data             use the newest snapshot of A if one exists
 *   npm run data:refresh     fetch a fresh snapshot of A first
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Band, Borough, CampusProps, Flag, SchoolsCollection, SchoolsMeta } from "../lib/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "data", "raw");
const KML_PATH = join(RAW, "NYC_Charter_School_Campuses.kml");
const BOUNDARIES_PATH = join(RAW, "borough-boundaries.geojson");
const CACHE_PATH = join(ROOT, "data", "geocode-cache.json");
const REPORT_PATH = join(ROOT, "data", "merge-report.csv");
const OUT_PATH = join(ROOT, "public", "data", "schools.geojson");

const SOURCE_A_URL =
  "https://data.cityofnewyork.us/resource/wg9x-4ke6.json?$where=managed_by_name='Charter'&$limit=5000";
const BOUNDARIES_URL = "https://data.cityofnewyork.us/resource/gthc-hcne.geojson";
const GEOSEARCH_URL = "https://geosearch.planninglabs.nyc/v2/search";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "nyc-charter-school-map-build/1.0";

const KML_AS_OF = "2025-09-18";
const JSON_AS_OF = "2020";

const BORO_BY_LETTER: Record<string, Borough> = {
  M: "Manhattan", X: "Bronx", K: "Brooklyn", Q: "Queens", R: "Staten Island",
};
const BORO_BY_CD_DIGIT: Record<string, Borough> = {
  "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island",
};

// Network is parsed from the school name. First match wins; null = independent.
const NETWORKS: Array<[RegExp, string | null]> = [
  [/^success academy/, "Success Academy"],
  [/^achievement first/, "Achievement First"],
  [/^kipp\b/, "KIPP"],
  [/^uncommon\b/, "Uncommon Schools"],
  [/^democracy prep/, "Democracy Prep"],
  [/^icahn charter/, "Icahn Charter Schools"],
  [/^harlem village academ/, "Harlem Village Academies"],
  [/^brooklyn prospect/, "Brooklyn Prospect"],
  [/^zeta\b/, "Zeta Charter Schools"],
  [/^brilla\b/, "Brilla Public Charter Schools"],
  [/\bascend\b/, "Ascend Public Charter Schools"],
  [/^dream\b/, "DREAM"],
  [/^explore\b/, "Explore Schools"],
  [/^(girls|boys) prep|^(girls|boys) preparatory/, "Public Prep"],
  [/^hebrew language academy/, "Hebrew Public"],
  [/^harlem children'?s zone|^promise academy/, "Harlem Children's Zone"],
  [/^great oaks/, "Great Oaks"],
  [/^new visions/, "New Visions"],
  [/^international leadership/, "International Leadership"],
];

const A_FIELDS = [
  "system_code", "location_code", "location_name", "location_category_description", "grades_text",
  "grades_final_text", "status_descriptions", "open_date", "primary_address_line_1", "latitude",
  "longitude", "community_district", "nta_name", "principal_name", "principal_phone_number",
  "geographical_district_code",
] as const;
type ARow = Record<(typeof A_FIELDS)[number], string> & { borough: Borough | ""; grades: number[] };

interface BRow {
  campus_name: string;
  campus_id: string;
  school_id: string;
  borough: Borough;
  csd: string;
  address: string;
  grades: number[];
}

interface ReportRow {
  category: string;
  school_id: string;
  campus_id: string;
  name: string;
  detail: string;
}

// ------------------------------------------------------------------ helpers

const log = (...a: unknown[]) => console.error(...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function httpJson<T>(url: string, params?: Record<string, string | number>): Promise<T> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, String(v));
  const res = await fetch(u, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${u}`);
  return (await res.json()) as T;
}

/** Socrata sends blanks as the string "NULL" (or omits the key). */
function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s.toUpperCase() === "NULL" ? "" : s;
}

const SMALL_WORDS = new Set(["of", "the", "for", "and", "at", "in", "a", "an", "on", "to"]);

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      if (i && SMALL_WORDS.has(w)) return w;
      if (/^\d+(st|nd|rd|th)$/.test(w)) return w;
      return w.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("-");
    })
    .join(" ");
}

const SUFFIXES: Record<string, string> = {
  avenue: "ave", av: "ave", street: "st", road: "rd", boulevard: "blvd", place: "pl",
  parkway: "pkwy", drive: "dr", lane: "ln", court: "ct", terrace: "ter", square: "sq",
  highway: "hwy", expressway: "expy", turnpike: "tpke", plaza: "plz",
  east: "e", west: "w", north: "n", south: "s",
};

/** "215 Heyward Street" and "215 HEYWARD ST" normalize to the same string. */
function normStreet(s: string): string {
  return s
    .split(",")[0]
    .toLowerCase()
    .replace(/[.#]/g, " ")
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIXES[w] ?? w)
    .join(" ");
}

function houseNumber(s: string): string {
  return /^\s*(\d+(?:-\d+)?)/.exec(s)?.[1] ?? "";
}

function parseGrade(tok: string): number | null {
  const t = tok.trim().toUpperCase().replace(/\s/g, "");
  if (["PK", "PRE-K", "PREK"].includes(t)) return -1;
  if (["K", "0K", "KG"].includes(t)) return 0;
  if (/^\d+$/.test(t) && +t >= 1 && +t <= 12) return +t;
  return null; // SE (special education), blanks and anything else are ignored
}

function parseGrades(text: string): number[] {
  const set = new Set<number>();
  for (const t of text.split(",")) {
    const g = parseGrade(t);
    if (g !== null) set.add(g);
  }
  return [...set].sort((a, b) => a - b);
}

function bandsFor(grades: number[]): Band[] {
  const bands: Band[] = [];
  if (grades.some((g) => g <= 5)) bands.push("Elementary");
  if (grades.some((g) => g >= 6 && g <= 8)) bands.push("Middle");
  if (grades.some((g) => g >= 9)) bands.push("High");
  return bands;
}

function networkFor(name: string): string | undefined {
  const n = name.toLowerCase().trim();
  for (const [re, net] of NETWORKS) if (re.test(n)) return net ?? undefined;
  return undefined;
}

function csd2(v: string): string {
  const m = /(\d+)/.exec(v ?? "");
  return m ? String(parseInt(m[1], 10)).padStart(2, "0") : "";
}

/** Normalized Levenshtein similarity, 0..1 (stands in for rapidfuzz's ratio). */
function similarity(a: string, b: string): number {
  const n = (s: string) =>
    s.toLowerCase().replace(/\bcharter school\b|\bcharter\b|\bschool\b|\bthe\b|[^a-z0-9 ]/g, " ")
      .split(/\s+/).filter(Boolean).join(" ");
  const x = n(a), y = n(b);
  if (!x.length && !y.length) return 1;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ------------------------------------------------------------------ boroughs

class Boroughs {
  private shapes: Array<{ name: Borough; feature: Feature<Polygon | MultiPolygon> }> = [];

  static async load(path: string): Promise<Boroughs> {
    if (!existsSync(path)) {
      log("Fetching borough boundaries ...");
      writeFileSync(path, JSON.stringify(await httpJson(BOUNDARIES_URL)));
    }
    const b = new Boroughs();
    const fc = JSON.parse(readFileSync(path, "utf8")) as FeatureCollection<Polygon | MultiPolygon>;
    for (const f of fc.features) b.shapes.push({ name: f.properties!.boroname as Borough, feature: f });
    return b;
  }

  which(lng: number, lat: number): Borough | null {
    for (const s of this.shapes) if (booleanPointInPolygon([lng, lat], s.feature)) return s.name;
    return null;
  }

  /** Rough distance (m) to the borough's outline, for points just off the shoreline (piers, landfill). */
  distanceTo(lng: number, lat: number, borough: Borough): number {
    const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
    let best = Infinity;
    const s = this.shapes.find((x) => x.name === borough);
    if (!s) return best;
    const g = s.feature.geometry;
    const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
    for (const poly of polys) {
      for (const p of poly[0]) best = Math.min(best, Math.hypot((p[0] - lng) * kx, (p[1] - lat) * 110_540));
    }
    return best;
  }
}

// ------------------------------------------------------------------ geocoding

interface Hit {
  lat: number;
  lng: number;
  label: string;
  postalcode: string;
  borough: string;
}
interface GeoResult extends Hit {
  provider: "geosearch" | "nominatim";
  query: string;
  low_confidence: boolean;
}

/**
 * GeoSearch reports confidence 0.8 even for exact hits, so a match is judged by
 * whether its house number and its ZIP (or borough) agree with the input.
 */
function judge(query: string, hit: Hit, borough: Borough): boolean {
  const hn = houseNumber(query);
  const hnOk = hn !== "" && houseNumber(hit.label) === hn;
  const zq = /\b(\d{5})\s*$/.exec(query)?.[1];
  const zipOk = !!zq && zq === hit.postalcode;
  return hnOk && (zipOk || hit.borough === borough);
}

const DIRECTIONS: Record<string, string> = { E: "East", W: "West", N: "North", S: "South" };

/** Query variants tried in order until one gives a confident match. */
function variants(address: string, borough: Borough): string[] {
  const out = [address];
  const spelled = address.replace(/^(\s*[\d-]+\s+)([EWNS])\.?\s/i, (_, n, d) => `${n}${DIRECTIONS[d.toUpperCase()]} `);
  if (spelled !== address) out.push(spelled);
  // Ranges like "1166-1182 River Avenue": retry with the first number. Queens
  // hyphenated numbers ("36-49 11th Street") are real numbers, so leave them.
  const range = /^\s*(\d+)-(\d+)\s+(.*)$/.exec(spelled);
  if (range && borough !== "Queens") out.push(`${range[1]} ${range[3]}`);
  // A wrong ZIP can pull the match to another block; try without it.
  for (const v of [...out]) {
    const noZip = v.replace(/,?\s*NY\s+\d{5}\s*$/, `, ${borough}, NY`).replace(/, (\w[\w ]*), \1, NY$/, ", $1, NY");
    if (noZip !== v) out.push(noZip);
  }
  return [...new Set(out)];
}

class Geocoder {
  private cache: Record<string, Hit | null>;
  private dirty = 0;
  private path: string;

  constructor(path: string) {
    this.path = path;
    this.cache = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  }

  save() {
    const sorted = Object.fromEntries(Object.entries(this.cache).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(this.path, JSON.stringify(sorted, null, 1) + "\n");
  }

  async geocode(address: string, borough: Borough): Promise<GeoResult | null> {
    let fallback: GeoResult | null = null;
    for (const q of variants(address, borough)) {
      const hit = await this.lookup("geosearch", q);
      if (!hit) continue;
      const r: GeoResult = { ...hit, provider: "geosearch", query: q, low_confidence: !judge(q, hit, borough) };
      if (!r.low_confidence) return r;
      fallback ??= r;
    }
    const n = await this.lookup("nominatim", address);
    if (n) {
      const r: GeoResult = { ...n, provider: "nominatim", query: address, low_confidence: !judge(address, n, borough) };
      if (!r.low_confidence) return r;
      fallback ??= r;
    }
    return fallback;
  }

  private async lookup(provider: "geosearch" | "nominatim", q: string): Promise<Hit | null> {
    const key = `${provider}|${q}`;
    if (key in this.cache) return this.cache[key];
    let hit: Hit | null = null;
    try {
      if (provider === "geosearch") {
        type R = { features: Array<{ geometry: { coordinates: [number, number] }; properties: Record<string, string> }> };
        const d = await httpJson<R>(GEOSEARCH_URL, { text: q, size: 1 });
        const f = d.features?.[0];
        if (f) {
          hit = {
            lng: +f.geometry.coordinates[0].toFixed(6), lat: +f.geometry.coordinates[1].toFixed(6),
            label: f.properties.label ?? "", postalcode: f.properties.postalcode ?? "", borough: f.properties.borough ?? "",
          };
        }
      } else {
        await sleep(1100); // Nominatim usage policy: max 1 request per second
        type R = Array<{ lat: string; lon: string; address?: Record<string, string> }>;
        const d = await httpJson<R>(NOMINATIM_URL, { q, format: "json", limit: 1, countrycodes: "us", addressdetails: 1 });
        if (d[0]) {
          const ad = d[0].address ?? {};
          hit = {
            lat: +(+d[0].lat).toFixed(6), lng: +(+d[0].lon).toFixed(6),
            label: `${ad.house_number ?? ""} ${ad.road ?? ""}`.trim(), postalcode: ad.postcode ?? "", borough: ad.suburb ?? "",
          };
        }
      }
    } catch (e) {
      log(`  ${provider} error for "${q}":`, (e as Error).message);
      return null; // don't cache transient failures
    }
    this.cache[key] = hit;
    if (++this.dirty % 25 === 0) this.save();
    return hit;
  }
}

// ------------------------------------------------------------------ ingest

async function loadSourceA(refresh: boolean): Promise<{ rows: Record<string, unknown>[]; snapshot: string }> {
  let snaps = readdirSync(RAW).filter((f) => /^source-a-.*\.json$/.test(f)).sort();
  if (refresh || !snaps.length) {
    log("Fetching source A ...");
    const rows = await httpJson<Record<string, unknown>[]>(SOURCE_A_URL);
    const name = `source-a-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(join(RAW, name), JSON.stringify(rows, null, 1) + "\n");
    snaps = [name];
  }
  const snapshot = snaps[snaps.length - 1];
  return { rows: JSON.parse(readFileSync(join(RAW, snapshot), "utf8")), snapshot };
}

function loadSourceB(): BRow[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", isArray: (n) => ["Placemark", "Data"].includes(n) });
  const kml = parser.parse(readFileSync(KML_PATH, "utf8"));
  type Placemark = { name: string; ExtendedData: { Data: Array<{ "@name": string; value: string | number }> } };
  const placemarks: Placemark[] = kml.kml.Document.Folder.Placemark;
  return placemarks.map((pm) => {
    const d: Record<string, string> = {};
    for (const x of pm.ExtendedData.Data) d[x["@name"]] = String(x.value ?? "").trim();
    const campusId = d["DBN+Building Code"];
    return {
      campus_name: String(pm.name).trim(),
      campus_id: campusId,
      school_id: campusId.split("-")[0],
      borough: d["Borough"] as Borough,
      csd: csd2(d["CSD"]),
      address: d["Full Address"],
      grades: parseGrades(d["Grades Served at this Campus"]),
    };
  });
}

// ------------------------------------------------------------------ pipeline

async function main() {
  const refresh = process.argv.includes("--refresh");
  const report: ReportRow[] = [];
  const note = (category: string, school_id = "", campus_id = "", name = "", detail = "") =>
    report.push({ category, school_id, campus_id, name, detail });

  // 1. Ingest
  const { rows: aRaw, snapshot } = await loadSourceA(refresh);
  const bRows = loadSourceB();
  log(`A: ${aRaw.length} rows (${snapshot})   B: ${bRows.length} placemarks`);

  // 2. Clean A: fill missing keys, NULL -> "", dedupe on system_code, keep Open only
  const seenA = new Set<string>();
  const aByDbn = new Map<string, ARow>();
  for (const raw of aRaw) {
    const r = Object.fromEntries(A_FIELDS.map((k) => [k, clean(raw[k])])) as unknown as ARow;
    const dbn = r.system_code;
    if (seenA.has(dbn)) {
      note("a_duplicate_dropped", dbn, "", r.location_name, "exact duplicate system_code");
      continue;
    }
    seenA.add(dbn);
    if (r.status_descriptions !== "Open") {
      note("a_closed_dropped", dbn, "", r.location_name, `status=${r.status_descriptions}`);
      continue;
    }
    r.borough = BORO_BY_LETTER[r.location_code.charAt(0)] ?? BORO_BY_CD_DIGIT[r.community_district.charAt(0)] ?? "";
    r.grades = parseGrades(r.grades_text);
    aByDbn.set(dbn, r);
  }
  log(`A open, deduped: ${aByDbn.size}`);

  // 4. Join on DBN
  const bDbns = new Set(bRows.map((b) => b.school_id));
  const jsonOnly = new Set([...aByDbn.keys()].filter((d) => !bDbns.has(d)));
  const kmlOnly = new Set([...bDbns].filter((d) => !aByDbn.has(d)));

  // Fallback: fuzzy name check, KML-only vs JSON-only in the same borough (catches DBN changes)
  const alias = new Map<string, string>(); // KML DBN -> JSON DBN
  const firstB = new Map<string, BRow>();
  for (const b of bRows) if (!firstB.has(b.school_id)) firstB.set(b.school_id, b);
  for (const kd of [...kmlOnly].sort()) {
    const b = firstB.get(kd)!;
    let best: [number, string | null] = [0, null];
    for (const jd of jsonOnly) {
      const a = aByDbn.get(jd)!;
      if (a.borough !== b.borough || [...alias.values()].includes(jd)) continue;
      const s = similarity(b.campus_name, a.location_name);
      if (s > best[0]) best = [s, jd];
    }
    if (best[0] >= 0.9 && best[1]) {
      alias.set(kd, best[1]);
      note("fuzzy_dbn_change", kd, "", b.campus_name,
        `matched JSON ${best[1]} '${aByDbn.get(best[1])!.location_name}' score=${best[0].toFixed(2)}`);
    }
  }
  for (const [kd, jd] of alias) {
    jsonOnly.delete(jd);
    kmlOnly.delete(kd);
  }

  const geo = new Geocoder(CACHE_PATH);
  const boros = await Boroughs.load(BOUNDARIES_PATH);
  type Draft = Omit<CampusProps, "grades" | "grade_bands" | "grade_min" | "grade_max" | "marker_band" | "is_success_academy" | "lat" | "lng"> & {
    lat: number | null; lng: number | null; _grades: number[];
  };
  const drafts: Draft[] = [];

  const fromA = (a: ARow | undefined) =>
    a
      ? {
          neighborhood: a.nta_name || undefined,
          principal: a.principal_name ? titleCase(a.principal_name) : undefined,
          phone: a.principal_phone_number || undefined,
          opened: a.open_date ? a.open_date.slice(0, 4) : undefined,
          grades_final: parseGrades(a.grades_final_text),
        }
      : {};
  const displayName = (s: string) => (s === s.toUpperCase() ? titleCase(s) : s);
  // A truncates location_name at 50 characters; prefer B's full name when that happened.
  const A_NAME_LIMIT = 50;
  /** Title-case an all-caps street line and fix "215Th"-style ordinals. */
  const tidyAddress = (addr: string) => {
    const [street, ...rest] = addr.split(",");
    const st = street === street.toUpperCase() ? titleCase(street) : street;
    return [st.replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n, o) => n + o.toLowerCase()), ...rest].join(",");
  };

  async function geocodeInto(address: string, borough: Borough, flags: Flag[], ids: [string, string, string]) {
    const g = await geo.geocode(address, borough);
    if (!g) {
      note("geocode_failed", ...ids, address);
      return { lat: null, lng: null };
    }
    flags.push("geocoded");
    if (g.low_confidence) {
      flags.push("geocode_low_confidence");
      note("geocode_low_confidence", ...ids, `${address} -> ${g.label} (${g.provider})`);
    }
    return { lat: g.lat, lng: g.lng };
  }

  // 5-6. Coordinates + merge: KML campuses
  for (const b of bRows) {
    const dbn = b.school_id;
    const a = aByDbn.get(dbn) ?? aByDbn.get(alias.get(dbn) ?? "");
    const flags: Flag[] = [];
    let coords: { lat: number | null; lng: number | null };
    let coordSource: "json" | "geocoded";
    if (a && a.latitude && normStreet(b.address) === normStreet(a.primary_address_line_1)) {
      coords = { lat: +(+a.latitude).toFixed(6), lng: +(+a.longitude).toFixed(6) };
      coordSource = "json";
    } else {
      coords = await geocodeInto(b.address, b.borough, flags, [dbn, b.campus_id, b.campus_name]);
      coordSource = "geocoded";
    }

    // Name: A if matched, else B. Generic B names ("Success Academy") get the street added.
    const aName = a && a.location_name.length < A_NAME_LIMIT ? a.location_name : "";
    let name = displayName(aName || b.campus_name);
    let campusName = displayName(b.campus_name);
    const net = networkFor(b.campus_name);
    if (net && b.campus_name.toLowerCase() === net.toLowerCase()) {
      campusName = `${b.campus_name} — ${tidyAddress(b.address).split(",")[0]}`;
      if (!a) name = campusName;
    }
    const grades = b.grades.length ? b.grades : a?.grades ?? [];
    if (!grades.length) flags.push("grades_unknown");
    drafts.push({
      campus_id: b.campus_id,
      school_id: dbn,
      name,
      campus_name: campusName.toLowerCase() !== name.toLowerCase() ? campusName : undefined,
      network: networkFor(name) ?? net,
      address: tidyAddress(b.address),
      borough: b.borough,
      csd: b.csd || (a ? csd2(a.geographical_district_code) : ""),
      ...coords,
      source: a ? "json+kml" : "kml",
      data_as_of: KML_AS_OF,
      coord_source: coordSource,
      flags,
      former_school_id: alias.get(dbn),
      ...fromA(a),
      _grades: grades,
    });
    if (a) note("matched", dbn, b.campus_id, name);
    else note("kml_only", dbn, b.campus_id, name, "not in 2019-20 feed; likely opened since");
  }

  // JSON-only schools: keep, flagged maybe_closed (decision D1)
  for (const dbn of [...jsonOnly].sort()) {
    const a = aByDbn.get(dbn)!;
    const borough = a.borough as Borough;
    const street = titleCase(a.primary_address_line_1);
    const address = street ? `${street}, ${borough}, NY` : `${borough}, NY`;
    const name = displayName(a.location_name);
    const flags: Flag[] = ["maybe_closed"];
    let coords: { lat: number | null; lng: number | null };
    let coordSource: "json" | "geocoded" = "json";
    if (a.latitude) coords = { lat: +(+a.latitude).toFixed(6), lng: +(+a.longitude).toFixed(6) };
    else {
      coords = await geocodeInto(address, borough, flags, [dbn, `${dbn}-A`, name]);
      coordSource = "geocoded";
    }
    if (!a.grades.length) flags.push("grades_unknown");
    drafts.push({
      campus_id: `${dbn}-A`,
      school_id: dbn,
      name,
      network: networkFor(name),
      address,
      borough,
      csd: csd2(a.geographical_district_code),
      ...coords,
      source: "json",
      data_as_of: JSON_AS_OF,
      coord_source: coordSource,
      flags,
      ...fromA(a),
      _grades: a.grades,
    });
    note("json_only", dbn, `${dbn}-A`, name, "missing from Sep 2025 KML; shown as 'May have closed'");
  }
  geo.save();

  // 7. Validate
  const features: SchoolsCollection["features"] = [];
  const seen = new Set<string>();
  for (const d of drafts) {
    const ids = [d.school_id, d.campus_id, d.name] as const;
    if (seen.has(d.campus_id)) {
      note("duplicate_campus_id_dropped", ...ids);
      continue;
    }
    seen.add(d.campus_id);
    if (d.lat === null || d.lng === null) {
      note("dropped_no_coordinates", ...ids);
      continue;
    }
    const actual = boros.which(d.lng, d.lat);
    if (actual && actual !== d.borough && !d.flags.includes("geocode_low_confidence")) {
      // The geocoder matched house number + ZIP, so the point is right and the stated
      // borough is wrong (B's Borough often follows the DBN letter, not the building).
      note("borough_corrected", ...ids, `stated ${d.borough}, point and ZIP in ${actual}`);
      d.address = d.address.replace(`, ${d.borough},`, `, ${actual},`);
      d.borough = actual;
      d.flags.push("borough_corrected");
    } else if (actual !== d.borough) {
      const dist = boros.distanceTo(d.lng, d.lat, d.borough);
      if (actual === null && dist < 300) {
        note("near_shoreline", ...ids, `${dist.toFixed(0)} m outside the shoreline polygon`);
        d.flags.push("near_shoreline");
      } else {
        note("borough_mismatch", ...ids, `stated ${d.borough}, point in ${actual ?? "no borough"}`);
        d.flags.push("borough_mismatch");
      }
    }
    if (!d.name || !d.borough) note("missing_field", ...ids, !d.name ? "name" : "borough");

    const { _grades: grades, lat, lng, ...rest } = d;
    const bands = bandsFor(grades);
    const props: CampusProps = {
      ...rest,
      lat, lng,
      grades,
      grade_min: grades.length ? grades[0] : undefined,
      grade_max: grades.length ? grades[grades.length - 1] : undefined,
      grade_bands: bands,
      marker_band: bands.length === 1 ? bands[0] : bands.length ? "Multi" : "Unknown",
      is_success_academy: rest.network === "Success Academy",
    };
    // Drop empty optionals to keep the file small
    for (const k of Object.keys(props) as (keyof CampusProps)[]) {
      const v = props[k];
      if (v === undefined || v === "" || (Array.isArray(v) && !v.length && k !== "flags" && k !== "grades" && k !== "grade_bands")) {
        delete props[k];
      }
    }
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: props });
  }
  features.sort((x, y) =>
    x.properties.name.localeCompare(y.properties.name) || x.properties.campus_id.localeCompare(y.properties.campus_id));

  // 8. Export
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const metadata: SchoolsMeta = {
    generated: new Date().toISOString().slice(0, 10),
    source_a: { name: "NYC Open Data 2019–20 School Locations (wg9x-4ke6)", snapshot, as_of: JSON_AS_OF },
    source_b: { name: "NYC Charter School Campuses (Google My Maps export)", as_of: KML_AS_OF },
    campuses: features.length,
    schools: new Set(features.map((f) => f.properties.school_id)).size,
  };
  const out: SchoolsCollection = { type: "FeatureCollection", metadata, features };
  writeFileSync(OUT_PATH, JSON.stringify(out));

  report.sort((x, y) =>
    x.category.localeCompare(y.category) || x.school_id.localeCompare(y.school_id) || x.campus_id.localeCompare(y.campus_id));
  const cols: (keyof ReportRow)[] = ["category", "school_id", "campus_id", "name", "detail"];
  writeFileSync(REPORT_PATH, [cols.join(","), ...report.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n");

  const count = <T,>(xs: T[]) => xs.reduce<Record<string, number>>((m, x) => ((m[String(x)] = (m[String(x)] ?? 0) + 1), m), {});
  log(`\nWrote ${metadata.campuses} campuses (${metadata.schools} schools) -> ${relative(ROOT, OUT_PATH)}`);
  log("Report:", count(report.map((r) => r.category)));
  log("Sources:", count(features.map((f) => f.properties.source)));
  log("Marker bands:", count(features.map((f) => f.properties.marker_band)));
  log("Success Academy campuses:", features.filter((f) => f.properties.is_success_academy).length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

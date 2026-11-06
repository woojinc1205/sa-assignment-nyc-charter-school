import type { Borough, CampusProps, Flag, SchoolsCollection } from "../types.ts";
import { SOURCE_A_NAME, SOURCE_B_NAME, type Progress } from "./config.ts";
import type { Boroughs } from "./boroughs.ts";
import type { Geocoder } from "./geocode.ts";
import {
  bandsFor, csd2, displayName, networkFor, normStreet, parseGrades, similarity, tidyAddress, titleCase,
} from "./normalize.ts";
import { parseKml, parseSourceA, type ARow, type Note } from "./sources.ts";

export type ReportRow = Note;

export interface BuildInput {
  /** Raw JSON rows from NYC Open Data. */
  aRows: unknown;
  /** ISO timestamp of when `aRows` was fetched. */
  aFetched: string;
  /** Text of the campus KML. */
  kmlText: string;
  geocoder: Geocoder;
  boroughs: Boroughs;
  /** ISO timestamp stamped into the output. */
  now: string;
  onProgress?: (p: Progress) => void;
}

export interface BuildOutput {
  collection: SchoolsCollection;
  report: ReportRow[];
}

type Draft = Omit<CampusProps, "grades" | "grade_bands" | "grade_min" | "grade_max" | "marker_band" | "is_success_academy" | "lat" | "lng"> & {
  lat: number | null;
  lng: number | null;
  _grades: number[];
};

/** A truncates location_name at 50 characters; prefer B's full name when that happened. */
const A_NAME_LIMIT = 50;

/**
 * Merge NYC Open Data (A) and the campus KML (B) into one feature per campus (PRD 5.1 steps 2-7).
 * Pure apart from the geocoder's network calls, so the CLI and the in-app refresh share it.
 */
export async function buildSchools(input: BuildInput): Promise<BuildOutput> {
  const { geocoder: geo, boroughs: boros, onProgress } = input;
  const report: ReportRow[] = [];
  const note = (category: string, school_id = "", campus_id = "", name = "", detail = "") =>
    report.push({ category, school_id, campus_id, name, detail });

  onProgress?.({ step: "Reading the school list and campus KML" });
  const a = parseSourceA(input.aRows);
  const b = parseKml(input.kmlText);
  report.push(...a.notes, ...b.notes);
  const aByDbn = a.byDbn;
  const bRows = b.rows;
  const kmlAsOf = b.asOf || input.now.slice(0, 10);
  const jsonAsOf = a.asOf || "2020";

  // Join on DBN (exact match)
  const bDbns = new Set(bRows.map((r) => r.school_id));
  const jsonOnly = new Set([...aByDbn.keys()].filter((d) => !bDbns.has(d)));
  const kmlOnly = new Set([...bDbns].filter((d) => !aByDbn.has(d)));

  // Fallback: fuzzy name check, KML-only vs JSON-only in the same borough (catches DBN changes)
  const alias = new Map<string, string>(); // KML DBN -> JSON DBN
  const firstB = new Map<string, (typeof bRows)[number]>();
  for (const r of bRows) if (!firstB.has(r.school_id)) firstB.set(r.school_id, r);
  for (const kd of [...kmlOnly].sort()) {
    const r = firstB.get(kd)!;
    let best: [number, string | null] = [0, null];
    for (const jd of jsonOnly) {
      const row = aByDbn.get(jd)!;
      if (row.borough !== r.borough || [...alias.values()].includes(jd)) continue;
      const s = similarity(r.campus_name, row.location_name);
      if (s > best[0]) best = [s, jd];
    }
    if (best[0] >= 0.9 && best[1]) {
      alias.set(kd, best[1]);
      note("fuzzy_dbn_change", kd, "", r.campus_name,
        `matched JSON ${best[1]} '${aByDbn.get(best[1])!.location_name}' score=${best[0].toFixed(2)}`);
    }
  }
  for (const [kd, jd] of alias) {
    jsonOnly.delete(jd);
    kmlOnly.delete(kd);
  }

  const aFor = (dbn: string): ARow | undefined => aByDbn.get(dbn) ?? aByDbn.get(alias.get(dbn) ?? "");
  const reusesA = (r: (typeof bRows)[number], row: ARow | undefined) =>
    !!row && !!row.latitude && normStreet(r.address) === normStreet(row.primary_address_line_1);
  const jsonOnlyAddress = (row: ARow) => {
    const street = titleCase(row.primary_address_line_1);
    return street ? `${street}, ${row.borough}, NY` : `${row.borough}, NY`;
  };

  // Look up every address we can't take from A up front, in parallel; the merge below then hits the cache.
  const needs: Array<{ address: string; borough: Borough }> = [];
  for (const r of bRows) if (!reusesA(r, aFor(r.school_id))) needs.push({ address: r.address, borough: r.borough });
  for (const dbn of jsonOnly) {
    const row = aByDbn.get(dbn)!;
    if (!row.latitude) needs.push({ address: jsonOnlyAddress(row), borough: row.borough as Borough });
  }
  const fresh = needs.filter((n, i) => needs.findIndex((m) => m.address === n.address) === i);
  await geo.prefetch(fresh, 4, onProgress);

  onProgress?.({ step: "Merging the two lists" });
  const fromA = (row: ARow | undefined) =>
    row
      ? {
          neighborhood: row.nta_name || undefined,
          principal: row.principal_name ? titleCase(row.principal_name) : undefined,
          phone: row.principal_phone_number || undefined,
          opened: row.open_date ? row.open_date.slice(0, 4) : undefined,
          grades_final: parseGrades(row.grades_final_text),
        }
      : {};

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

  const drafts: Draft[] = [];

  // KML campuses (coordinates: reuse A's when the address matches, else geocode)
  for (const r of bRows) {
    const dbn = r.school_id;
    const row = aFor(dbn);
    const flags: Flag[] = [];
    let coords: { lat: number | null; lng: number | null };
    let coordSource: "json" | "geocoded";
    if (reusesA(r, row)) {
      coords = { lat: +(+row!.latitude).toFixed(6), lng: +(+row!.longitude).toFixed(6) };
      coordSource = "json";
    } else {
      coords = await geocodeInto(r.address, r.borough, flags, [dbn, r.campus_id, r.campus_name]);
      coordSource = "geocoded";
    }

    // Name: A if matched, else B. Generic B names ("Success Academy") get the street added.
    const aName = row && row.location_name.length < A_NAME_LIMIT ? row.location_name : "";
    let name = displayName(aName || r.campus_name);
    let campusName = displayName(r.campus_name);
    const net = networkFor(r.campus_name);
    if (net && r.campus_name.toLowerCase() === net.toLowerCase()) {
      campusName = `${r.campus_name} — ${tidyAddress(r.address).split(",")[0]}`;
      if (!row) name = campusName;
    }
    const grades = r.grades.length ? r.grades : row?.grades ?? [];
    if (!grades.length) flags.push("grades_unknown");
    drafts.push({
      campus_id: r.campus_id,
      school_id: dbn,
      name,
      campus_name: campusName.toLowerCase() !== name.toLowerCase() ? campusName : undefined,
      network: networkFor(name) ?? net,
      address: tidyAddress(r.address),
      borough: r.borough,
      csd: r.csd || (row ? csd2(row.geographical_district_code) : ""),
      ...coords,
      source: row ? "json+kml" : "kml",
      data_as_of: kmlAsOf,
      coord_source: coordSource,
      flags,
      former_school_id: alias.get(dbn),
      ...fromA(row),
      _grades: grades,
    });
    if (row) note("matched", dbn, r.campus_id, name);
    else note("kml_only", dbn, r.campus_id, name, "not in the Open Data school list; likely opened since");
  }

  // JSON-only schools: keep, flagged maybe_closed (decision D1)
  for (const dbn of [...jsonOnly].sort()) {
    const row = aByDbn.get(dbn)!;
    const borough = row.borough as Borough;
    const address = jsonOnlyAddress(row);
    const name = displayName(row.location_name);
    const flags: Flag[] = ["maybe_closed"];
    let coords: { lat: number | null; lng: number | null };
    let coordSource: "json" | "geocoded" = "json";
    if (row.latitude) coords = { lat: +(+row.latitude).toFixed(6), lng: +(+row.longitude).toFixed(6) };
    else {
      coords = await geocodeInto(address, borough, flags, [dbn, `${dbn}-A`, name]);
      coordSource = "geocoded";
    }
    if (!row.grades.length) flags.push("grades_unknown");
    drafts.push({
      campus_id: `${dbn}-A`,
      school_id: dbn,
      name,
      network: networkFor(name),
      address,
      borough,
      csd: csd2(row.geographical_district_code),
      ...coords,
      source: "json",
      data_as_of: jsonAsOf,
      coord_source: coordSource,
      flags,
      ...fromA(row),
      _grades: row.grades,
    });
    note("json_only", dbn, `${dbn}-A`, name, "missing from the campus KML; shown as 'May have closed'");
  }

  // Validate (PRD 5.1 step 7)
  onProgress?.({ step: "Checking every pin is in its borough" });
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

  report.sort((x, y) =>
    x.category.localeCompare(y.category) || x.school_id.localeCompare(y.school_id) || x.campus_id.localeCompare(y.campus_id));

  return {
    report,
    collection: {
      type: "FeatureCollection",
      metadata: {
        generated: input.now,
        source_a: { name: SOURCE_A_NAME, as_of: jsonAsOf, fetched: input.aFetched },
        source_b: { name: SOURCE_B_NAME, as_of: kmlAsOf },
        campuses: features.length,
        schools: new Set(features.map((f) => f.properties.school_id)).size,
      },
      features,
    },
  };
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function reportToCsv(report: ReportRow[]): string {
  const cols: (keyof ReportRow)[] = ["category", "school_id", "campus_id", "name", "detail"];
  return [cols.join(","), ...report.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
}

/** Compare two builds by campus id. */
export function diffCollections(before: SchoolsCollection, after: SchoolsCollection) {
  const a = new Map(before.features.map((f) => [f.properties.campus_id, f.properties]));
  const b = new Map(after.features.map((f) => [f.properties.campus_id, f.properties]));
  const added = [...b.keys()].filter((id) => !a.has(id)).map((id) => b.get(id)!);
  const removed = [...a.keys()].filter((id) => !b.has(id)).map((id) => a.get(id)!);
  let changed = 0;
  for (const [id, p] of b) {
    const q = a.get(id);
    if (q && JSON.stringify(q) !== JSON.stringify(p)) changed++;
  }
  return { added, removed, changed };
}

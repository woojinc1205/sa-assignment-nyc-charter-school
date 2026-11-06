import { XMLParser } from "fast-xml-parser";
import type { Borough } from "../types.ts";
import { BORO_BY_CD_DIGIT, BORO_BY_LETTER, clean, csd2, parseGrades } from "./normalize.ts";

// ---------------------------------------------------------------- Source A (NYC Open Data JSON)

export const A_FIELDS = [
  "system_code", "location_code", "location_name", "location_category_description", "grades_text",
  "grades_final_text", "status_descriptions", "open_date", "primary_address_line_1", "latitude",
  "longitude", "community_district", "nta_name", "principal_name", "principal_phone_number",
  "geographical_district_code", "fiscal_year",
] as const;

export interface ARow extends Record<(typeof A_FIELDS)[number], string> {
  borough: Borough | "";
  grades: number[];
}

export interface Note {
  category: string;
  school_id: string;
  campus_id: string;
  name: string;
  detail: string;
}

export interface ParsedA {
  /** Open schools, deduped on system_code, keyed by DBN. */
  byDbn: Map<string, ARow>;
  /** Fiscal year of the feed, e.g. "2020". */
  asOf: string;
  notes: Note[];
}

/** Clean source A: fill missing keys, "NULL" -> "", dedupe on system_code, keep Open only (PRD 5.1 step 2). */
export function parseSourceA(raw: unknown): ParsedA {
  if (!Array.isArray(raw) || !raw.length || typeof raw[0] !== "object" || !("system_code" in (raw[0] as object))) {
    throw new Error("The NYC Open Data response doesn't look like the school list (no system_code column).");
  }
  const notes: Note[] = [];
  const seen = new Set<string>();
  const byDbn = new Map<string, ARow>();
  let asOf = 0;
  for (const rawRow of raw as Record<string, unknown>[]) {
    const r = Object.fromEntries(A_FIELDS.map((k) => [k, clean(rawRow[k])])) as unknown as ARow;
    const dbn = r.system_code;
    asOf = Math.max(asOf, parseInt(r.fiscal_year, 10) || 0);
    if (seen.has(dbn)) {
      notes.push({ category: "a_duplicate_dropped", school_id: dbn, campus_id: "", name: r.location_name, detail: "exact duplicate system_code" });
      continue;
    }
    seen.add(dbn);
    if (r.status_descriptions !== "Open") {
      notes.push({ category: "a_closed_dropped", school_id: dbn, campus_id: "", name: r.location_name, detail: `status=${r.status_descriptions}` });
      continue;
    }
    r.borough = BORO_BY_LETTER[r.location_code.charAt(0)] ?? BORO_BY_CD_DIGIT[r.community_district.charAt(0)] ?? "";
    r.grades = parseGrades(r.grades_text);
    byDbn.set(dbn, r);
  }
  return { byDbn, asOf: asOf ? String(asOf) : "", notes };
}

// ---------------------------------------------------------------- Source B (campus KML)

export interface BRow {
  campus_name: string;
  campus_id: string;
  school_id: string;
  borough: Borough;
  csd: string;
  address: string;
  grades: number[];
}

export interface ParsedB {
  rows: BRow[];
  /** ISO date from the KML's folder name ("Charter Campuses 09.18.25 …" -> 2025-09-18), or "" if absent. */
  asOf: string;
  notes: Note[];
}

type XmlNode = Record<string, unknown>;
interface Placemark {
  name?: unknown;
  ExtendedData?: { Data?: Array<{ "@name": string; value?: string | number }> };
}

/** Collect every <Placemark> and the first dated <name> in the document, wherever they are nested. */
function walk(node: unknown, out: { placemarks: Placemark[]; names: string[] }): void {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const o = node as XmlNode;
  for (const [k, v] of Object.entries(o)) {
    if (k === "Placemark") out.placemarks.push(...(Array.isArray(v) ? v : [v]) as Placemark[]);
    else if (k === "name" && typeof v === "string") out.names.push(v);
    else walk(v, out);
  }
}

export function parseKmlDate(names: string[]): string {
  for (const n of names) {
    const m = /\b(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/.exec(n);
    if (m) {
      const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${yy}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
  }
  return "";
}

const BOROUGH_NAMES = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"];

/** Parse the campus KML (PRD 4.2). Throws if the text isn't a campus KML. */
export function parseKml(text: string): ParsedB {
  const parser = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false, isArray: (n) => n === "Placemark" || n === "Data",
  });
  let doc: unknown;
  try {
    doc = parser.parse(text);
  } catch {
    throw new Error("The KML couldn't be read as XML.");
  }
  const found = { placemarks: [] as Placemark[], names: [] as string[] };
  walk(doc, found);
  if (!found.placemarks.length) throw new Error("The KML has no campuses (no <Placemark> entries).");

  const notes: Note[] = [];
  const rows: BRow[] = [];
  for (const pm of found.placemarks) {
    const d: Record<string, string> = {};
    for (const x of pm.ExtendedData?.Data ?? []) d[x["@name"]] = String(x.value ?? "").trim();
    const campusId = d["DBN+Building Code"] ?? "";
    const name = String(pm.name ?? "").trim();
    if (!campusId || !d["Full Address"] || !BOROUGH_NAMES.includes(d["Borough"] ?? "")) {
      notes.push({ category: "kml_row_skipped", school_id: campusId.split("-")[0], campus_id: campusId, name,
        detail: "missing DBN+Building Code, Borough or Full Address" });
      continue;
    }
    rows.push({
      campus_name: name,
      campus_id: campusId,
      school_id: campusId.split("-")[0],
      borough: d["Borough"] as Borough,
      csd: csd2(d["CSD"] ?? ""),
      address: d["Full Address"],
      grades: parseGrades(d["Grades Served at this Campus"] ?? ""),
    });
  }
  if (!rows.length) throw new Error("None of the KML entries have the campus fields (DBN+Building Code, Borough, Full Address).");
  return { rows, asOf: parseKmlDate(found.names), notes };
}

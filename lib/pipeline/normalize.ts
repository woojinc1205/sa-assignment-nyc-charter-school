import type { Band, Borough } from "../types.ts";

export const BORO_BY_LETTER: Record<string, Borough> = {
  M: "Manhattan", X: "Bronx", K: "Brooklyn", Q: "Queens", R: "Staten Island",
};
export const BORO_BY_CD_DIGIT: Record<string, Borough> = {
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

/** Socrata sends blanks as the string "NULL" (or omits the key). */
export function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s.toUpperCase() === "NULL" ? "" : s;
}

const SMALL_WORDS = new Set(["of", "the", "for", "and", "at", "in", "a", "an", "on", "to"]);

export function titleCase(s: string): string {
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

export const displayName = (s: string) => (s === s.toUpperCase() ? titleCase(s) : s);

/** Title-case an all-caps street line and fix "215Th"-style ordinals. */
export function tidyAddress(addr: string): string {
  const [street, ...rest] = addr.split(",");
  const st = street === street.toUpperCase() ? titleCase(street) : street;
  return [st.replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n: string, o: string) => n + o.toLowerCase()), ...rest].join(",");
}

const SUFFIXES: Record<string, string> = {
  avenue: "ave", av: "ave", street: "st", road: "rd", boulevard: "blvd", place: "pl",
  parkway: "pkwy", drive: "dr", lane: "ln", court: "ct", terrace: "ter", square: "sq",
  highway: "hwy", expressway: "expy", turnpike: "tpke", plaza: "plz",
  east: "e", west: "w", north: "n", south: "s",
};

/** "215 Heyward Street" and "215 HEYWARD ST" normalize to the same string. */
export function normStreet(s: string): string {
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

export function houseNumber(s: string): string {
  return /^\s*(\d+(?:-\d+)?)/.exec(s)?.[1] ?? "";
}

function parseGrade(tok: string): number | null {
  const t = tok.trim().toUpperCase().replace(/\s/g, "");
  if (["PK", "PRE-K", "PREK"].includes(t)) return -1;
  if (["K", "0K", "KG"].includes(t)) return 0;
  if (/^\d+$/.test(t) && +t >= 1 && +t <= 12) return +t;
  return null; // SE (special education), blanks and anything else are ignored
}

export function parseGrades(text: string): number[] {
  const set = new Set<number>();
  for (const t of text.split(",")) {
    const g = parseGrade(t);
    if (g !== null) set.add(g);
  }
  return [...set].sort((a, b) => a - b);
}

export function bandsFor(grades: number[]): Band[] {
  const bands: Band[] = [];
  if (grades.some((g) => g <= 5)) bands.push("Elementary");
  if (grades.some((g) => g >= 6 && g <= 8)) bands.push("Middle");
  if (grades.some((g) => g >= 9)) bands.push("High");
  return bands;
}

export function networkFor(name: string): string | undefined {
  const n = name.toLowerCase().trim();
  for (const [re, net] of NETWORKS) if (re.test(n)) return net ?? undefined;
  return undefined;
}

export function csd2(v: string): string {
  const m = /(\d+)/.exec(v ?? "");
  return m ? String(parseInt(m[1], 10)).padStart(2, "0") : "";
}

/** Normalized Levenshtein similarity, 0..1. */
export function similarity(a: string, b: string): number {
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

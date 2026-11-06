import type { Borough } from "../types.ts";
import { GEOSEARCH_URL, NOMINATIM_URL, type Progress } from "./config.ts";
import { houseNumber } from "./normalize.ts";

export interface Hit {
  lat: number;
  lng: number;
  label: string;
  postalcode: string;
  borough: string;
}
export interface GeoResult extends Hit {
  provider: "geosearch" | "nominatim";
  query: string;
  low_confidence: boolean;
}
export type GetJson = (url: string, params?: Record<string, string | number>) => Promise<unknown>;
export type GeoCache = Record<string, Hit | null>;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  const spelled = address.replace(/^(\s*[\d-]+\s+)([EWNS])\.?\s/i, (_, n: string, d: string) => `${n}${DIRECTIONS[d.toUpperCase()]} `);
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

/**
 * NYC Planning Labs GeoSearch first, Nominatim as the fallback. Every raw answer is
 * cached by "provider|query", so a rerun (or a refresh) only looks up new addresses.
 */
export class Geocoder {
  private cache: GeoCache;
  private added: GeoCache = {};
  private nominatimTurn: Promise<void> = Promise.resolve();
  private getJson: GetJson;
  private warn: (msg: string) => void;

  constructor(cache: GeoCache, getJson: GetJson, warn: (msg: string) => void = () => {}) {
    this.cache = { ...cache };
    this.getJson = getJson;
    this.warn = warn;
  }

  /** The whole cache, including anything added since construction. */
  all(): GeoCache {
    return { ...this.cache };
  }

  /** Only the entries looked up since construction. */
  newEntries(): GeoCache {
    return { ...this.added };
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

  /** Warm the cache for many addresses at once so the merge loop afterwards makes no requests. */
  async prefetch(items: Array<{ address: string; borough: Borough }>, concurrency: number, onProgress?: (p: Progress) => void) {
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < items.length) {
        const it = items[next++];
        await this.geocode(it.address, it.borough);
        onProgress?.({ step: "Finding new addresses on the map", done: ++done, total: items.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  }

  private async lookup(provider: "geosearch" | "nominatim", q: string): Promise<Hit | null> {
    const key = `${provider}|${q}`;
    if (key in this.cache) return this.cache[key];
    let hit: Hit | null = null;
    try {
      if (provider === "geosearch") {
        type R = { features?: Array<{ geometry: { coordinates: [number, number] }; properties: Record<string, string> }> };
        const d = (await this.getJson(GEOSEARCH_URL, { text: q, size: 1 })) as R;
        const f = d.features?.[0];
        if (f) {
          hit = {
            lng: +f.geometry.coordinates[0].toFixed(6), lat: +f.geometry.coordinates[1].toFixed(6),
            label: f.properties.label ?? "", postalcode: f.properties.postalcode ?? "", borough: f.properties.borough ?? "",
          };
        }
      } else {
        // Nominatim usage policy: at most one request per second, across all workers.
        const prev = this.nominatimTurn;
        this.nominatimTurn = prev.then(() => sleep(1100));
        await prev;
        type R = Array<{ lat: string; lon: string; address?: Record<string, string> }>;
        const d = (await this.getJson(NOMINATIM_URL, { q, format: "json", limit: 1, countrycodes: "us", addressdetails: 1 })) as R;
        if (d[0]) {
          const ad = d[0].address ?? {};
          hit = {
            lat: +(+d[0].lat).toFixed(6), lng: +(+d[0].lon).toFixed(6),
            label: `${ad.house_number ?? ""} ${ad.road ?? ""}`.trim(), postalcode: ad.postcode ?? "", borough: ad.suburb ?? "",
          };
        }
      }
    } catch (e) {
      this.warn(`${provider} error for "${q}": ${(e as Error).message}`);
      return null; // don't cache transient failures
    }
    this.cache[key] = hit;
    this.added[key] = hit;
    return hit;
  }
}

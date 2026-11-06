// Sources and constants shared by the build script and the in-app refresh.

/** NYC Open Data 2019–20 school locations, charter rows only (PRD 4.1). */
export const SOURCE_A_URL =
  "https://data.cityofnewyork.us/resource/wg9x-4ke6.json?$where=managed_by_name='Charter'&$limit=5000";
/** NYC borough boundaries, used to check that every point is inside its borough. */
export const BOUNDARIES_URL = "https://data.cityofnewyork.us/resource/gthc-hcne.geojson";
export const GEOSEARCH_URL = "https://geosearch.planninglabs.nyc/v2/search";
export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** Where the site serves the repo's own copies of the inputs (relative to the site root). */
export const KML_FILE = "data/NYC_Charter_School_Campuses.kml";
export const SOURCE_A_FILE = "data/source-a.json";
export const GEOCODE_CACHE_FILE = "data/geocode-cache.json";

export const SOURCE_A_NAME = "NYC Open Data school locations (wg9x-4ke6)";
export const SOURCE_B_NAME = "NYC Charter School Campuses (KML)";

export interface Progress {
  step: string;
  done?: number;
  total?: number;
}

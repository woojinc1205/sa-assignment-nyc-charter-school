# NYC Charter School Map

A mobile-first web map of New York City charter schools, built as an assignment for Success Academy.
It plots **436 campuses (298 schools)** across the five boroughs, with a Map view and a List view,
borough and grade-level filters, and a detail view for every school.

Built with **Next.js (App Router) + TypeScript** and **MapLibre GL JS**, with a TypeScript data pipeline.
It is a static site: no backend, no tracking, and no API keys.

## Reference documents

These files are in the repo for reference. The app doesn't read the two Markdown files; the pipeline reads the KML.

| File | What it is |
|---|---|
| [`docs/nyc-charter-school-map-PRD.md`](docs/nyc-charter-school-map-PRD.md) | The product requirements document (v0.6). Defines scope, data method, filters, layout and acceptance criteria. |
| [`docs/success-academy-design-system.md`](docs/success-academy-design-system.md) | The Success Academy design system. Its section 10 tokens are the base stylesheet in [`styles/tokens.css`](styles/tokens.css). |
| [`data/raw/NYC_Charter_School_Campuses.kml`](data/raw/NYC_Charter_School_Campuses.kml) | Source B: the 18 Sep 2025 "NYC Charter School Campuses" export (423 campuses, no coordinates). |

## Run it

Requires Node 22.18 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. To build the static site into `out/`:

```bash
npm run build
```

`out/` can be hosted anywhere static. For a GitHub Pages project site, build with the repo name as the base path:

```bash
NEXT_PUBLIC_BASE_PATH=/sa-assignment-nyc-charter-school npm run build
```

## Where the data comes from

The app loads one prebuilt file, [`public/data/schools.geojson`](public/data/schools.geojson) (about 37 KB gzipped).
It makes no calls to NYC Open Data, the geocoder or the KML at runtime. The only live requests are the
[OpenFreeMap](https://openfreemap.org) basemap tiles and the Inter font.

The file is built from two sources (PRD section 4):

| | Source | Role |
|---|---|---|
| A | [NYC Open Data 2019–20 school locations](https://data.cityofnewyork.us/resource/wg9x-4ke6.json) (`wg9x-4ke6`), charter rows only | Primary: identity, principal, phone, neighborhood, year opened |
| B | `NYC_Charter_School_Campuses.kml` (Sep 2025) | Supplement: campuses, campus-level grades, full addresses |

### Rebuild the data

```bash
npm run data           # reuse the saved snapshot of source A
npm run data:refresh   # fetch a fresh snapshot of source A first
```

The pipeline is [`scripts/build-data.ts`](scripts/build-data.ts) (Node runs it directly). It does this:

1. **Cleans A.** Drops 5 exact duplicates and 18 closed schools, and turns `"NULL"` strings into blanks.
   That leaves 260 open schools.
2. **Joins A and B on DBN** (exact match). Result: 380 campuses in both, 43 only in the KML (opened after 2019–20),
   and 13 only in A. A fuzzy name check (score ≥ 0.9, same borough) looks for DBN changes; it found none.
3. **Sets coordinates.** If a campus address matches A's address for the same DBN, A's coordinates are used (213 campuses).
   Otherwise the address is geocoded with [NYC Planning Labs GeoSearch](https://geosearch.planninglabs.nyc), with Nominatim as a fallback (223 campuses).
   Every answer is cached in [`data/geocode-cache.json`](data/geocode-cache.json), so reruns are offline.
4. **Normalizes grades.** Pre-K is −1 and K is 0. `SE` (special education) is ignored. Grades are tagged
   Elementary (Pre-K–5), Middle (6–8) and High (9–12). A campus that spans bands is **Multi**.
5. **Validates.** Every point is checked against the NYC borough boundaries. Eight campuses had the wrong borough in the
   source (for example, a Harlem address listed as Bronx). Their address and ZIP place them in the right borough, so the
   borough is corrected and flagged `borough_corrected`.
6. **Exports** `schools.geojson` (one feature per campus, schema in [`lib/types.ts`](lib/types.ts)) and
   [`data/merge-report.csv`](data/merge-report.csv), which lists every matched, KML-only, JSON-only, dropped and corrected record.

### Caveats

- **Source A is from 2019–20.** The 13 schools in A but missing from the Sep 2025 KML are still shown, as hollow pins
  labelled "May have closed". They may have closed, merged or changed DBN.
- **The map plots campuses, not schools.** A school with three buildings has three pins. Counts read "298 schools at 436 campuses".
- **Principal and phone come from A only**, so KML-only schools show fewer details. Neither source has a website field.
- **Licensing.** Confirm both sources may be reused in a public demo (PRD section 12). Source B is a reverse-engineered export of a Google My Maps layer.

## Using the map

- **Pins** are coloured by grade band: Elementary orange, Middle blue, High green, Multi-band navy.
  **Success Academy** campuses are stars in their band colour. A legend on the map explains this.
- **Filters** are borough and grade-band tiles plus an optional name or network search. They apply to both views.
  A campus matches a band if any grade it serves falls in that band, so a K–8 campus shows under both Elementary and Middle.
- **The URL holds the state** (`?borough=brooklyn&grade=high&view=list&school=…`), so a filtered view can be shared.
- **Detail view** is a bottom sheet on mobile (swipe up for full height) and a side panel on desktop. It shows
  every field that has a value, other campuses of the same school, tap-to-call, and "Get directions".
- **Location** is optional. "Locate me" and "Nearest" ask for the browser's location and use it only on the device.

## Project layout

```
app/                 Next.js App Router (layout, page, global styles)
components/          SchoolFinder (state + layout), MapView (MapLibre), ListView, DetailPanel, FilterControls, Legend
lib/                 Shared types and filter/URL logic
styles/tokens.css    Success Academy design tokens (design system section 10)
scripts/             build-data.ts (pipeline), copy-maplibre-worker.ts
data/raw/            Source snapshots: the KML and the dated Open Data JSON
data/                merge-report.csv, geocode-cache.json
public/data/         schools.geojson, the file the app loads
docs/                PRD and design system (reference only)
```

## Design notes

- All UI uses the design-system tokens: square corners, no shadows or gradients, one type family.
  Inter stands in for the licensed Akkurat LL font.
- Primary orange buttons use **black text**. White on `#F7941E` is about 2.1:1, which fails WCAG AA even for large text.
  The design system lists black text as the AA option.
- Colour is never the only signal: every band has a text label, and Success Academy is a star shape.
- The List view is the accessible alternative to the map.

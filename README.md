# NYC Charter School Map

A mobile-first web map of New York City charter schools, built as an assignment for Success Academy.
It plots **436 campuses (298 schools)** across the five boroughs, with a Map view and a List view,
borough and grade-level filters, and a detail view for every school.

Built with **Next.js (App Router) + TypeScript** and **MapLibre GL JS**, with a TypeScript data pipeline.
It is a static site: no backend, no tracking, and no API keys.

## Reference documents

These files are in the repo for reference. The app doesn't read the two Markdown files. The KML is a live input (see below).

| File | What it is |
|---|---|
| [`docs/nyc-charter-school-map-PRD.md`](docs/nyc-charter-school-map-PRD.md) | The product requirements document (v0.6). Defines scope, data method, filters, layout and acceptance criteria. |
| [`docs/success-academy-design-system.md`](docs/success-academy-design-system.md) | The Success Academy design system. Its section 10 tokens are the base stylesheet in [`styles/tokens.css`](styles/tokens.css). |
| [`public/data/NYC_Charter_School_Campuses.kml`](public/data/NYC_Charter_School_Campuses.kml) | Source B: the 18 Sep 2025 "NYC Charter School Campuses" export (423 campuses, no coordinates). The data pipeline reads it and the in-app refresh re-fetches it. |

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

`out/` can be hosted anywhere static.

### Deploy to GitHub Pages

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds the site and publishes it on every push to `main`,
or on demand from the Actions tab (**Deploy to GitHub Pages → Run workflow**). The site goes live at
`https://<owner>.github.io/sa-assignment-nyc-charter-school/`.

One-time setup:

1. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Merge the work into `main`. To deploy from another branch first, add it under **Settings → Environments →
   github-pages → Deployment branches**, then run the workflow from that branch.

To build the same way by hand, set the repo name as the base path:

```bash
NEXT_PUBLIC_BASE_PATH=/sa-assignment-nyc-charter-school npm run build
```

## Where the data comes from

The app loads one prebuilt file, [`public/data/schools.geojson`](public/data/schools.geojson) (about 37 KB gzipped).
On a normal visit it makes no calls to NYC Open Data, the geocoder or the KML. The only live requests are the
[OpenFreeMap](https://openfreemap.org) basemap tiles and the Inter font. They happen only when someone uses
**Data & updates** (see below).

The file is built from two sources (PRD section 4):

| | Source | Role |
|---|---|---|
| A | [NYC Open Data 2019–20 school locations](https://data.cityofnewyork.us/resource/wg9x-4ke6.json) (`wg9x-4ke6`), charter rows only | Primary: identity, principal, phone, neighborhood, year opened |
| B | `NYC_Charter_School_Campuses.kml` (Sep 2025) | Supplement: campuses, campus-level grades, full addresses |

### Rebuild the data

```bash
npm run data           # rebuild from the files in public/data/
npm run data:refresh   # fetch a fresh snapshot of NYC Open Data first
```

The inputs all live in `public/data/`, so the site can serve them to the in-app refresh:

| File | What it is |
|---|---|
| `NYC_Charter_School_Campuses.kml` | Source B, the campus list. **To update the campuses, replace this file** and rebuild. |
| `source-a.json` | Source A, a snapshot of the Open Data feed with its fetch date. `npm run data:refresh` rewrites it. |
| `geocode-cache.json` | Every geocoder answer, so rebuilds and refreshes only look up new addresses. |

The pipeline is [`scripts/build-data.ts`](scripts/build-data.ts) (Node runs it directly). The merge itself is in
[`lib/pipeline/`](lib/pipeline), shared with the in-app refresh. It does this:

1. **Cleans A.** Drops 5 exact duplicates and 18 closed schools, and turns `"NULL"` strings into blanks.
   That leaves 260 open schools.
2. **Joins A and B on DBN** (exact match). Result: 380 campuses in both, 43 only in the KML (opened after 2019–20),
   and 13 only in A. A fuzzy name check (score ≥ 0.9, same borough) looks for DBN changes; it found none.
3. **Sets coordinates.** If a campus address matches A's address for the same DBN, A's coordinates are used (213 campuses).
   Otherwise the address is geocoded with [NYC Planning Labs GeoSearch](https://geosearch.planninglabs.nyc), with Nominatim as a fallback (223 campuses).
4. **Normalizes grades.** Pre-K is −1 and K is 0. `SE` (special education) is ignored. Grades are tagged
   Elementary (Pre-K–5), Middle (6–8) and High (9–12). A campus that spans bands is **Multi**.
5. **Validates.** Every point is checked against the NYC borough boundaries. Eight campuses had the wrong borough in the source
   (for example, a Harlem address listed as Bronx). Their address and ZIP place them in the right borough, so the
   borough is corrected and flagged `borough_corrected`.
6. **Exports** `schools.geojson` (one feature per campus, schema in [`lib/types.ts`](lib/types.ts)) and
   [`data/merge-report.csv`](data/merge-report.csv), which lists every matched, KML-only, JSON-only, dropped and corrected record.

### Refresh the data from the app

**Data & updates** (top right) lets anyone pull the latest of either source without a rebuild:

- **Refresh from NYC Open Data** fetches the school list live from the Open Data API.
- **Refresh campus KML** re-fetches the KML from the repo (the site's own `data/NYC_Charter_School_Campuses.kml`),
  so a new or edited KML is picked up as soon as it is deployed, or straight away under `npm run dev`.
- **Refresh both** does both.

The refresh runs the same merge as `npm run data`, in the browser. Only new addresses are geocoded; the rest come from the
saved lookups. It then shows what changed (campuses added, removed or changed), and a result with far fewer
campuses than before is refused, so a bad file can't empty the map. A failed refresh leaves the current data untouched.

- **It is saved in this browser only.** A refresh doesn't change the published site for anyone else. When the site is
  rebuilt, the new published data replaces an older refresh. **Reset to published data** undoes it.
- **To publish the new data for everyone**, run `npm run data:refresh`, commit the changed files in `public/data/`,
  or use **Download schools.geojson** in the panel.
- To read the KML from somewhere other than the repo copy (for example a raw GitHub URL), set `NEXT_PUBLIC_KML_URL`
  at build time. The host must allow cross-origin requests.

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
components/          SchoolFinder (state + layout), MapView (MapLibre), ListView, DetailPanel, FilterControls, Legend, DataPanel
lib/                 Shared types, filter/URL logic, in-app refresh
lib/pipeline/        The merge pipeline, shared by the build script and the in-app refresh
styles/tokens.css    Success Academy design tokens (design system section 10)
scripts/             build-data.ts (pipeline), copy-maplibre-worker.ts
data/                merge-report.csv from the last build
public/data/         schools.geojson (what the app loads) plus the pipeline's inputs: the KML, source-a.json, geocode-cache.json
docs/                PRD and design system (reference only)
```

## Design notes

- All UI uses the design-system tokens: square corners, no shadows or gradients, one type family.
  Inter stands in for the licensed Akkurat LL font.
- Primary orange buttons use **black text**. White on `#F7941E` is about 2.1:1, which fails WCAG AA even for large text.
  The design system lists black text as the AA option.
- Colour is never the only signal: every band has a text label, and Success Academy is a star shape.
- The List view is the accessible alternative to the map.

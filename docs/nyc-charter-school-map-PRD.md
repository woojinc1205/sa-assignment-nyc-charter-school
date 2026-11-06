# PRD: NYC Charter School Map

| Field | Value |
|---|---|
| Owner | Wooj (ThinkerMaker Studio) |
| Requested by | Success Academy (interview assignment) |
| Status | Draft v0.6 (Success Academy design system applied) |
| Date | 5 Nov 2026 |
| Source | Voice memo, 5 Nov 2026 (5:26); JSON feed; KML file (`NYC_Charter_School_Campuses.kml`, supplied with this PRD) |
| Design system | `success-academy-design-system.md` (project doc) — all UI follows it; see 6.6 |

---

## 1. Summary

Build a mobile-first web map of every charter school across New York City's five boroughs. Use MapLibre GL JS as the mapping engine. Merge two data feeds: a JSON feed (primary) and a KML file (supplement). Offer a **Map view** and a **List view**, filters for **borough** and **grade level**, and a tap-to-open **detail view** for each school.

## 2. Problem & goal

**Problem.** No single source is both complete and current. The structured JSON feed is dated (2019–20). The most recent public map (KML, published 18 Sep 2025) is newer but less structured.

**Goal.** One easy-to-use map that:
- Shows all NYC charter schools in one place.
- Lets a user narrow results by borough and grade level in a few taps.
- Works first on a phone.

### Success criteria
- All 423 KML campuses (285 schools) appear on the map.
- Every open JSON school appears on the map, or is listed in the merge report with a reason.
- A user can filter to a borough + grade band and open a school's details in **≤ 3 taps**.
- Usable at a 375px viewport; Lighthouse mobile performance ≥ 85, accessibility ≥ 90.

## 3. Users

| User | Need |
|---|---|
| Parent / guardian | Find charter schools near home that serve their child's grade. |
| Success Academy staff | See the citywide charter landscape by borough and grade. |
| Interview reviewer | Judge product thinking, data handling and build quality. |

### User stories
1. As a user, I see all NYC charter schools plotted on a map.
2. As a user, I switch between a Map view and a List view.
3. As a user, I filter by one or more of the five boroughs.
4. As a user, I filter by grade level.
5. As a user, I tap a school to see its details.
6. As a mobile user, every control is reachable with one thumb.

## 4. Data sources

| # | Source | Format | Currency | Role |
|---|---|---|---|---|
| A | NYC Open Data — 2019–20 school locations (dataset `wg9x-4ke6`), filtered to charter schools. Found via the NYC Charter School Center Data Hub. | JSON (Socrata API) | `fiscal_year` = 2020 | **Primary** (structured fields) |
| B | "NYC Charter School Campuses" — Google My Maps export from the NY charter school map. **File supplied with this PRD** (`NYC_Charter_School_Campuses.kml`) | KML (XML) | Folder name: *Charter Campuses 09.18.25* | **Supplement** (newer schools, campus-level grades and addresses) |

### 4.1 Source A — endpoint and fields

**Endpoint**
```
https://data.cityofnewyork.us/resource/wg9x-4ke6.json?$where=managed_by_name='Charter'&$limit=5000
```

The feed has 41 fields. These are the ones the app uses:

| Feed field | Example | Maps to |
|---|---|---|
| `system_code` | `84K037` | `school_id` (the DBN — join key to B) |
| `location_code` | `K037` | Borough (first letter, see below) |
| `location_name` | Beginning with Children Charter School II | `name` |
| `location_category_description` | K-8 | Fallback for grade band |
| `grades_text` | `0K,01,02,…,08` | Grades for JSON-only schools (decision D7) |
| `grades_final_text` | `0K,01,…,12` | Planned final grade span (detail view only) |
| `status_descriptions` | Open / Closed | Filter: keep `Open` only |
| `open_date` | 2012-07-01 | `opened` (optional) |
| `primary_address_line_1` | 215 HEYWARD STREET | Address check against B |
| `latitude`, `longitude` | 40.703996, −73.953304 | `lat`, `lng` (when the address matches B) |
| `community_district` | 301 | Borough fallback (first digit) |
| `nta_name` | Williamsburg | `neighborhood` |
| `principal_name`, `principal_phone_number` | — | `principal`, `phone` |
| `geographical_district_code` | 14 | `csd` fallback |

**Borough codes.** A has no borough name field.
- `location_code` first letter: `M` Manhattan, `X` Bronx, `K` Brooklyn, `Q` Queens, `R` Staten Island.
- Fallback: first digit of `community_district`: 1 Manhattan, 2 Bronx, 3 Brooklyn, 4 Queens, 5 Staten Island.

**What a first read of A showed:**
- Some records are **exact duplicates** (e.g. `84K744`, `84K756`). Dedupe on `system_code`.
- Some records are **`Closed`**. Drop them, or keep them only in the merge report.
- Grade values include tokens beyond `PK`, `0K` and `01`–`12`, such as `SE` (special education). Ignore `SE` when working out the grade range.
- `grades_text` and `grades_final_text` often differ: a K–8 school may list K–12 as its final span.
- No ZIP or city field. The address is the street line only.
- Blank fields come through as the string `"NULL"`. Treat them as empty.
- The fetch tool truncated the response, so I couldn't confirm the total record count. Count it during the pipeline build.

### 4.2 Source B — file and fields

**How it was obtained.** The Google Map embedded on the site was reverse-engineered (via Grok) into a KML export of the underlying My Maps layer.

**Profile** (file `NYC_Charter_School_Campuses.kml`):

| Metric | Value |
|---|---|
| Placemarks (campuses) | **423** |
| Distinct schools (DBN) | **285** — some schools run several campuses |
| Distinct addresses | 389 — some buildings hold several schools |
| Placemarks with coordinates | **0** — every campus must be geocoded |
| By borough | Bronx 148 · Brooklyn 136 · Manhattan 78 · Queens 50 · Staten Island 11 |

Each placemark has a `<name>`, an `<address>` and these `ExtendedData` fields (present on all 423):

| KML field | Example | Maps to |
|---|---|---|
| `<name>` | Zeta Bronx Tremont Park Elementary School | `campus_name` |
| `DBN+Building Code` | `84X632-XCHM` | `campus_id`; text before `-` is the DBN (`school_id`) |
| `Borough` | Bronx | `borough` (already clean) |
| `CSD` | CSD 12 | `csd` (normalize `CSD 9` → `09`) |
| `Full Address` | 1910 Arthur Avenue, Bronx, NY 10457 | `address` (includes ZIP) |
| `Grades Served at this Campus` | Pre-K,K,1,2,3,4 | Campus grades (tokens: `Pre-K`, `K`, `1`–`12`) |

Pin colour (`styleUrl`) encodes borough only, so it can be ignored.

### Known data issues
- **A is stale.** Schools opened, closed, merged or moved since 2020 are wrong or missing.
- **B has no coordinates.** All 423 campuses need geocoding (5.1, step 5).
- **The two sources count different things.** A has one row per school; B has one row per campus. The map plots **campuses**, so a school with three buildings shows three pins.
- **B has no phone or principal.** Those come from A only, so KML-only schools will show fewer details. Neither source has a website field.
- **A few B names are generic** (e.g. a placemark named just "Success Academy"). Use A's name, or the network plus the address, when this happens.
- **Licensing/terms.** Confirm both sources may be reused in a public demo.

## 5. Data method

Run as a build-time TypeScript script in the Next.js project. Output one clean `schools.geojson` the app loads. No live scraping in the browser.

### 5.1 Pipeline
1. **Ingest.** Fetch A from the endpoint in 4.1 and save a dated snapshot. Parse B's placemarks into rows using the fields in 4.2.
2. **Clean A.** Dedupe on `system_code`; drop `Closed`; convert `"NULL"` to empty; derive borough from `location_code`.
3. **Normalize.**
   - Grades (both sources): map to integers (Pre-K/`PK` = −1, K/`0K` = 0, `1`–`12`), drop `SE`, then tag bands.
   - Addresses: title-case A's street line; standardize suffixes ("Avenue"/"Ave") so A and B can be compared.
   - CSD: two-digit string.
4. **Join on DBN.** Split B's `DBN+Building Code` at `-`, then join that DBN to A's `system_code`. This is an exact match — no fuzzy matching is needed. Every row falls into one of these groups:
   - **Matched:** the DBN is in both. A gives the identity and contact fields; B adds campus rows, campus grades and full addresses.
   - **KML-only:** the DBN is only in B. The school opened after 2019–20; add it from B.
   - **JSON-only:** the DBN is only in A. The school may have closed or changed its DBN. Keep it on the map, flagged `maybe_closed` (decision D1).
   - Fallback: for KML-only rows, run a fuzzy name check against JSON-only rows (score ≥ 0.9, same borough) to catch DBN changes.
5. **Set coordinates for each campus.**
   - If the campus address matches A's `primary_address_line_1` for the same DBN, use A's `latitude`/`longitude`.
   - Otherwise geocode B's `Full Address` — NYC Planning Labs GeoSearch (free, no API key, NYC-specific) first, then NYC Geoclient or Nominatim as fallback.
   - Cache every result in `geocode-cache.json`. Flag any campus that fails or returns a low-confidence match.
6. **Merge fields** (JSON is the base record; KML enhances it):

   | Field | Source rule |
   |---|---|
   | `school_id`, `principal`, `phone`, `neighborhood`, `opened` | A |
   | `name` | A if matched; else B `<name>` |
   | `campus_id`, `campus_name`, `address`, `csd` | B |
   | `borough` | B; else derived from A |
   | Grades | B campus grades (2025); else A `grades_text` (D7) |

7. **Validate.** Every point inside the NYC borough boundary file and inside its stated borough. Every record has name, borough, coordinates and at least one grade. No duplicate `campus_id`.
8. **Export.** `schools.geojson` (one feature per campus) plus `merge-report.csv` (matched, KML-only, JSON-only, geocode failures, borough mismatches).

### 5.2 Record schema (output — one feature per campus)

| Field | Type | Notes |
|---|---|---|
| `campus_id` | string | B `DBN+Building Code` (e.g. `84X632-XCHM`); for JSON-only schools, `system_code` + `-A` |
| `school_id` | string | DBN (e.g. `84X632`). Groups a school's campuses |
| `name` | string | School display name |
| `campus_name` | string? | B placemark name, when it differs from `name` |
| `network` | string? | e.g. Success Academy, KIPP, Uncommon — parsed from the name |
| `address` | string | Full address with ZIP |
| `borough` | enum | One of five boroughs |
| `csd` | string | Community school district, e.g. `12` |
| `lat`, `lng` | number | WGS84 |
| `grade_min`, `grade_max` | int | Pre-K = −1, K = 0 |
| `grades` | int[] | Full list, for display |
| `grade_bands` | string[] | `Elementary`, `Middle`, `High` |
| `neighborhood` | string? | A `nta_name` |
| `principal`, `phone` | string? | A only |
| `source` | enum | `json`, `kml`, `json+kml` |
| `data_as_of` | date | 2020 for JSON-only, 2025-09-18 for KML-sourced |
| `is_success_academy` | bool | `true` when `network` = Success Academy (decision D4) |
| `marker_band` | enum | `Elementary`, `Middle`, `High` or `Multi` — drives pin colour (decision D3) |
| `flags` | string[] | e.g. `maybe_closed`, `geocoded`, `geocode_low_confidence`, `grades_unknown` |

## 6. Functional requirements

### 6.1 Map view (default)
- MapLibre GL JS map centred on NYC, fitted to all five boroughs.
- One marker per campus; **cluster** markers at low zoom, split on zoom.
- **Marker colour by grade band** (decision D3), using the design system's map legend: Elementary `--sa-orange` `#F7941E`, Middle `--sa-blue` `#005E9E`, High `--sa-green` `#2ABB7F`, and **Multi-band** (spans two or more bands, e.g. K–8, 6–12) `--sa-navy` `#192C4B` — the colour the design system uses for K–12. A legend explains the colours.
- **Success Academy campuses show a star marker** in the same band colour, with a 2px white outline so it reads on any basemap (decision D4). The legend includes the star.
- **"May have closed" campuses** (JSON-only) show a hollow pin: white fill, 2px `--sa-grey` `#ACACAC` ring (decision D1).
- **Clusters:** solid `--sa-blue` circles with a white bold count (contrast ≈ 6.7:1, passes AA).
- "Locate me" button (browser geolocation; optional, permission-gated).
- Tap a marker → detail view (6.4).

### 6.2 List view
- Scrollable cards: name, network, borough, grades, address.
- Success Academy cards show a ★ next to the name.
- "May have closed" cards show a badge (`--sa-bg-grey` background, `--sa-grey-text` text) reading "May have closed — last listed 2019–20".
- Sorted A–Z by default; sort by distance when location is shared.
- Tap a card → detail view; "Show on map" jumps to the pin.
- Result count shown ("285 schools at 423 campuses").
- Campuses of the same school can be grouped under one card, with each campus listed.

### 6.3 Filters
- **Borough:** multi-select chips for all five boroughs.
- **Grade level:** multi-select grade bands (decision D2) — Elementary (Pre-K–5), Middle (6–8), High (9–12). No combination options such as K–8. A campus matches if any grade it serves falls in a selected band, so a K–8 campus appears under both Elementary and Middle.
- Optional: text search by school name or network.
- Filters apply to **both** views and persist when switching views.
- "Clear all" resets. Filter state lives in the URL so a filtered view can be shared.
- Empty state: "No schools match these filters" plus a reset button.

### 6.4 School detail
- Mobile: bottom sheet (half height, swipe to full). Desktop: side panel.
- Opened by tapping a marker (or a list card). This is where users see a school's **full metadata** (decision D9).
- Shows every field that has a value; empty fields are hidden:
  - Name, campus name, network (★ for Success Academy).
  - Full address, borough, CSD, neighborhood.
  - Grades served at this campus, as a list (e.g. Pre-K, K, 1–4), and grade band.
  - Other campuses of the same school, each linking to its pin.
  - Principal and phone (phone is tap-to-call).
  - Year opened.
  - IDs: DBN and campus code.
  - "Get directions" (opens the device's map app).
  - Data source and "data as of" date.
  - For `maybe_closed` campuses: a notice that the school is missing from the September 2025 list and may have closed.

### 6.5 Layout
- **Mobile (< 768px):** full-screen map; Map/List toggle at the bottom; filters behind a "Filters" button opening a sheet.
- **Desktop (≥ 768px):** list + filters in a left panel, map on the right, both visible.

### 6.6 Visual design (Success Academy design system)

Source: project doc `success-academy-design-system.md`. Use its CSS tokens (section 10 of that doc) as the app's base stylesheet. Don't hard-code hex values.

**Principles that apply here**
- **Orange = action.** The primary action on each screen (e.g. "Apply filters", "Get directions") is the orange button. Only one orange action per block.
- **Square and flat.** `--radius: 0` on buttons, chips, cards, sheets and inputs. No gradients and no drop shadows. The only exceptions are round map pins and clusters.
- **Hierarchy through size and weight**, not extra colours.

**Type**
- One family: `--sa-font`. Akkurat LL is licensed; unless Success Academy provides it, use **Inter** (Google Fonts) as the stand-in.
- App title: H2 style (40px/700 desktop, 28px on mobile), Title Case — e.g. "Find a Charter School Near You".
- School name in the detail view: 18px/700 (`--fs-h5`). Metadata: 14px `--sa-grey-text`. Body: 16px, line height 1.56.
- Optional eyebrow above the title ("NYC CHARTER SCHOOLS"), 16px/600 uppercase, with the 12×12px orange square.

**Components**

| Element | Design-system pattern |
|---|---|
| Borough filter | The design system's borough tile grid: 2-column grid of square tiles, ~4px gaps, 16px/600 labels. Off: white with a 1px `--sa-border` border. **On: `--sa-blue` fill, white text** (the theme's `.btn.active` rule) |
| Grade band filter | Same tile style as boroughs. Each tile shows its band's pin colour as a 12×12px square, echoing the eyebrow marker |
| Map / List toggle | Two square segments; active segment `--sa-blue` with white text |
| Primary buttons | `.btn-primary`: `--sa-orange`, white 600 text, hover `--sa-orange-hover` |
| Secondary buttons ("Clear all", "Show on map") | `.btn-secondary` (`--sa-blue`) or a blue text link |
| List card / desktop popup | White, square, 1px `--sa-border`; name 18px/700; meta 14px `--sa-grey-text`; orange "View details" text link |
| Bottom sheet (mobile detail) | White, square top corners, `rgba(0,0,0,.5)` scrim behind it at full height |
| Section/panel backgrounds | White for content; `--sa-bg-grey` for the filter panel on desktop |
| Focus state | 2px solid `--sa-orange` border plus the `0 0 0 3px #fff` ring |
| Motion | `--dur-fast` (.25s) for hovers, toggles and sheet open/close. No scroll-reveal animations inside the app |
| Basemap | Muted, greyscale style (OpenFreeMap **Positron**) so pins carry the colour |

**Accessibility within the brand**
- White text on orange is ≈ 2.1:1 and fails AA for normal text. On orange buttons, use **bold text ≥ 18.66px** (AA large-text rule), or black text.
- Colour never carries meaning alone: every band tile and legend entry has a text label, and the Success Academy star is a distinct shape.
- White on `--sa-blue` passes AA, so active filters and clusters use blue.

**Copy voice.** Direct, upbeat, parent-facing. Short sentences. Verb-first, sentence-case buttons ("See schools", "Get directions", "Clear all").

**Design-system tension, resolved.** The design system suggests making Success Academy pins orange and every other network neutral. That conflicts with D3 (colour by grade band). D3 and D4 win: colour shows the grade band, and the star marks Success Academy.

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Mobile-first | Designed at 375px first; touch targets ≥ 44px. Layout switches at the design system's primary breakpoint, 768px. |
| Brand | Follows the Success Academy design system (6.6). |
| Performance | First load < 3 s on 4G; GeoJSON gzipped < 300 KB; clustering via the map's built-in GeoJSON source. |
| Accessibility | WCAG 2.1 AA; List view is the accessible alternative to the map; keyboard navigation; colour is never the only signal. |
| Browsers | Latest two versions of Safari iOS, Chrome Android, Chrome, Edge, Firefox. |
| Hosting | Static site (GitHub Pages, Netlify or Vercel). No backend required. |
| Privacy | No tracking. Geolocation used only on device and only on request. |

## 8. Technical approach

| Layer | Choice |
|---|---|
| Map engine | **MapLibre GL JS** v6 (open source) — see 8.1 |
| Basemap tiles | **OpenFreeMap** — free vector tiles, no API key (decision D8) |
| Frontend | Vanilla JS or a light framework (e.g. Vite + React/Svelte) |
| Data build | Script: parse JSON + KML → merge → `schools.geojson` |
| KML parsing | `fast-xml-parser` in TypeScript, inside the Next.js project (the file is flat and regular) |
| Join | Exact DBN join; a TypeScript name-similarity check only for the fallback |
| Geocoding | NYC Planning Labs GeoSearch; fallback NYC Geoclient / Nominatim |
| Borough check | NYC borough boundaries GeoJSON + `@turf/boolean-point-in-polygon` |

### 8.1 MapLibre GL JS implementation

Docs: https://maplibre.org/maplibre-gl-js/docs/

**Install.** npm package `maplibre-gl` (v6.x at time of writing). v6 is ES-modules only. Import `maplibre-gl.mjs` and include `maplibre-gl.css`.

| Need | MapLibre feature | Docs example |
|---|---|---|
| Initial view of all five boroughs | `map.fitBounds()` on the NYC bounding box | [Fit to a bounding box](https://maplibre.org/maplibre-gl-js/docs/examples/fit-a-map-to-a-bounding-box/) |
| Campus pins + clusters | `geojson` source with `cluster: true`; separate `circle` layers for clusters, cluster counts and single pins | [Create and style clusters](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/) |
| Band colours + star (D3, D4) | `circle` layer with a `match` expression on `marker_band` → design-system hex values (6.1). A separate `symbol` layer with a star icon (`map.addImage`), filtered to `is_success_academy == true` and drawn on top | [Create and style clusters](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/) |
| Tap a pin → details | Layer `click` event → open the app's bottom sheet (use a `Popup` on desktop only) | [Popup on click](https://maplibre.org/maplibre-gl-js/docs/examples/display-a-popup-on-click/) |
| "Locate me" | `GeolocateControl` | [Locate the user](https://maplibre.org/maplibre-gl-js/docs/examples/locate-the-user/) |
| Zoom buttons | `NavigationControl` | [Navigation controls](https://maplibre.org/maplibre-gl-js/docs/examples/display-map-navigation-controls/) |
| Filter pins | See the note below | [Filter by toggling a list](https://maplibre.org/maplibre-gl-js/docs/examples/filter-symbols-by-toggling-a-list/) |
| Basemap | OpenFreeMap **Positron** style (`https://tiles.openfreemap.org/styles/positron`) — muted, per the design system; no key needed. Keep the attribution control on | [Display a map](https://maplibre.org/maplibre-gl-js/docs/examples/display-a-map/) |

**Filtering with clusters.** A layer filter (`setFilter`) hides pins but leaves cluster counts unchanged, so the counts would be wrong. Instead:
1. Keep the full GeoJSON in memory.
2. On every filter change, filter the features in JavaScript.
3. Call `source.setData(filtered)`. MapLibre re-clusters, and the counts match the List view.

At about 423 features this is instant. The same filtered array drives the List view, so both views always show the same results.

**Controls.** Restyle MapLibre's built-in controls to match the design system: square buttons, no shadow, 1px `--sa-border`.

**Mobile.** Turn off map rotation (`dragRotate: false`, `touchZoomRotate.disableRotation()`). Make pin hit areas at least 44px.

```
JSON (A) ─┐
          ├─> normalize ─> DBN join ─> coordinates (reuse / geocode) ─> merge ─> validate ─> schools.geojson ─> MapLibre app
KML  (B) ─┘                                                                                └─> merge-report.csv
```

## 9. Out of scope (v1)
- Admissions, lottery dates or application flows.
- Test scores and performance data.
- District (non-charter) public schools.
- User accounts or saved favourites.
- Live sync with source sites.

## 10. Milestones

| # | Milestone | Output |
|---|---|---|
| 1 | Data pipeline | `schools.geojson` + merge report; conflicts reviewed |
| 2 | Map view | MapLibre map, clusters, markers, detail sheet |
| 3 | List view + filters | Both views, shared filter state, URL params |
| 4 | Mobile polish + a11y + brand | Responsive layout, Lighthouse checks, design-system review against 6.6 |
| 5 | Ship | Hosted URL, README with data method and caveats |

## 11. Acceptance criteria
- [ ] Map loads on iPhone Safari and Android Chrome with all schools plotted.
- [ ] School count on the map equals the count in `schools.geojson`.
- [ ] All 423 KML campuses plotted; every open JSON school plotted or explained in the merge report.
- [ ] Every campus geocoded; failures listed in the merge report.
- [ ] Borough filter and grade filter work alone and together, in both views.
- [ ] Switching views keeps filters.
- [ ] Tapping any marker or card opens the correct school's details.
- [ ] Each school shows its data source and "data as of" date.
- [ ] No school plots outside the five boroughs.
- [ ] Pins are coloured by grade band, with Multi-band as a fourth colour, and a legend.
- [ ] Every Success Academy campus shows a star, on the map and in the list.
- [ ] Every JSON-only campus shows the "May have closed" style and badge.
- [ ] UI uses the design-system tokens only: square corners, no shadows, Inter/Akkurat type, orange primary actions, blue active states.
- [ ] All text meets WCAG AA contrast, including on orange buttons.

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| JSON is 5+ years old | Closed schools shown | Mark JSON-only campuses "May have closed" (D1); spot-check against the NYSED charter list |
| KML has no coordinates | Pins missing or misplaced | Reuse JSON coordinates where addresses match; geocode the rest; check each point falls inside its stated borough |
| Campus vs school counts confused | Misleading totals | Show "X schools at Y campuses"; group by `school_id` in List view |
| Reverse-engineered Google Map data | Terms-of-use exposure | Confirm reuse rights; cite sources in the app |
| Co-located schools (same building) | Overlapping markers | Cluster/spiderfy at high zoom; list all schools at that address |

## 13. Decisions

| # | Question | Decision |
|---|---|---|
| D1 | JSON-only schools missing from the 2025 KML | Show them, marked **"May have closed"** (muted pin and badge). |
| D2 | Grade filter options | **Grade bands only:** Elementary (Pre-K–5), Middle (6–8), High (9–12). |
| D3 | Marker colour | **By grade band**, using design-system colours: Elementary orange, Middle blue, High green, Multi-band navy. |
| D4 | Highlight Success Academy | **Yes, with a star** marker on the map and ★ in the list. |
| D5 | Pin granularity | **One pin per campus** (423 KML campuses, plus JSON-only schools). |
| D6 | A and B disagree on grades | **B wins** (September 2025, campus-level). Already the rule in 5.1, step 6. |
| D7 | Grades for JSON-only schools | Use `grades_text`. |
| D8 | Basemap | No API-key constraints. Use **OpenFreeMap**, which needs no key. |
| D9 | Detail view | Tapping a marker opens the **full metadata** for the school (6.4). |
| D10 | Source B location | The KML file is supplied with this PRD; no URL needed. |

Pre-K is counted under Elementary, and campuses spanning bands get their own colour. These two details are my assumptions within D2 and D3; change them if needed. OpenFreeMap is my pick for D8.

## 14. Open questions
None. All questions are resolved in section 13.

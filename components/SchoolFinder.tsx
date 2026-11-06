"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CampusProps, SchoolsCollection } from "@/lib/types";
import {
  EMPTY_FILTERS, activeCount, matches, readUrl, writeUrl, type Filters, type View,
} from "@/lib/filters";
import type { FocusRequest } from "./MapView";
import { clearRefreshed, loadRefreshed } from "@/lib/refresh-store";
import type { RefreshResult } from "@/lib/refresh";
import type { ReportRow } from "@/lib/pipeline/build";
import DataPanel from "./DataPanel";
import FilterControls from "./FilterControls";
import ListView, { countLabel } from "./ListView";
import DetailPanel from "./DetailPanel";
import Legend from "./Legend";

// MapLibre needs the browser, so the map is client-only and loads after first paint.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="map-canvas map-loading">Loading map…</div>,
});

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DESKTOP_QUERY = "(min-width: 768px)";

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

export default function SchoolFinder() {
  // `published` is the build the site shipped with; `all` is what's shown (it differs after an in-app refresh).
  const [published, setPublished] = useState<SchoolsCollection | null>(null);
  const [all, setAll] = useState<SchoolsCollection | null>(null);
  const [report, setReport] = useState<ReportRow[] | null>(null);
  const [dataOpen, setDataOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [view, setView] = useState<View>("map");
  const [selected, setSelected] = useState<string[]>([]);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [sortByDistance, setSortByDistance] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const isDesktop = useIsDesktop();

  // Load data + restore state from the URL
  useEffect(() => {
    const s = readUrl(window.location.search);
    setFilters({ boroughs: s.boroughs, bands: s.bands, q: s.q });
    setView(s.view);
    if (s.campus) setSelected([s.campus]);
    setHydrated(true);
    fetch(`${BASE}/data/schools.geojson`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SchoolsCollection>;
      })
      .then((pub) => {
        const saved = loadRefreshed(pub); // an earlier in-app refresh made from this same build
        setPublished(pub);
        setAll(saved?.collection ?? pub);
        setReport(saved?.report ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Keep the URL in sync so a filtered view can be shared
  useEffect(() => {
    if (!hydrated) return;
    const qs = writeUrl({ ...filters, view, campus: selected.length === 1 ? selected[0] : null });
    window.history.replaceState(null, "", `${window.location.pathname}${qs}`);
  }, [filters, view, selected, hydrated]);

  const byId = useMemo(() => {
    const m = new Map<string, CampusProps>();
    for (const f of all?.features ?? []) m.set(f.properties.campus_id, f.properties);
    return m;
  }, [all]);

  // One filtered array drives both views, so they always agree (PRD 8.1)
  const filtered = useMemo<SchoolsCollection | null>(() => {
    if (!all) return null;
    return { ...all, features: all.features.filter((f) => matches(f.properties, filters)) };
  }, [all, filters]);
  const campuses = useMemo(() => filtered?.features.map((f) => f.properties) ?? [], [filtered]);
  const schoolCount = useMemo(() => new Set(campuses.map((c) => c.school_id)).size, [campuses]);

  const selectedCampuses = selected.map((id) => byId.get(id)).filter((c): c is CampusProps => !!c);
  const siblings = selectedCampuses.length === 1
    ? (all?.features ?? []).map((f) => f.properties)
        .filter((c) => c.school_id === selectedCampuses[0].school_id && c.campus_id !== selectedCampuses[0].campus_id)
    : [];

  const onRefreshed = useCallback((r: RefreshResult) => {
    setAll(r.collection);
    setReport(r.report);
    const ids = new Set(r.collection.features.map((f) => f.properties.campus_id));
    setSelected((sel) => sel.filter((id) => ids.has(id))); // drop a selection that no longer exists
  }, []);
  const onReset = useCallback(() => {
    clearRefreshed();
    setAll(published);
    setReport(null);
    setSelected([]);
  }, [published]);

  const clearAll = useCallback(() => setFilters(EMPTY_FILTERS), []);
  const closeDetail = useCallback(() => setSelected([]), []);
  const open = useCallback((id: string) => setSelected([id]), []);
  const showOnMap = useCallback((id: string) => {
    setView("map");
    setSelected([id]);
    setFocus({ campusId: id, nonce: Date.now() });
  }, []);

  const requestDistanceSort = (on: boolean) => {
    if (!on) return setSortByDistance(false);
    if (userLocation) return setSortByDistance(true);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation([pos.coords.longitude, pos.coords.latitude]);
        setSortByDistance(true);
      },
      () => setSortByDistance(false),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const nActive = activeCount(filters);
  const showDetail = selectedCampuses.length > 0;

  const list = all ? (
    <ListView
      campuses={campuses}
      meta={all.metadata}
      userLocation={userLocation}
      sortByDistance={sortByDistance}
      onSortByDistance={requestDistanceSort}
      onOpen={open}
      onShowOnMap={showOnMap}
      onClear={clearAll}
      hasFilters={nActive > 0}
    />
  ) : null;

  return (
    <div className={`app view-${view}${showDetail ? " has-detail" : ""}`}>
      <header className="app-header">
        <div className="app-heading">
          <p className="eyebrow">NYC Charter Schools</p>
          <h1 className="app-title">Find a Charter School Near You</h1>
        </div>
        {all && (
          <button
            type="button"
            className="text-link secondary data-link"
            aria-haspopup="dialog"
            aria-label={`Data and updates${all.metadata.refreshed ? " (refreshed)" : ""}`}
            onClick={() => setDataOpen(true)}
          >
            <span className="data-full" aria-hidden="true">Data &amp; updates{all.metadata.refreshed ? " · refreshed" : ""}</span>
            <span className="data-short" aria-hidden="true">Data{all.metadata.refreshed && <span className="refreshed-mark" />}</span>
          </button>
        )}
      </header>

      <div className="layout">
        {isDesktop && (
          <aside className="panel" aria-label="Filters and results">
            {showDetail && all ? (
              <DetailPanel campuses={selectedCampuses} meta={all.metadata} siblings={siblings} isDesktop onClose={closeDetail}
                onPick={open} onShowOnMap={showOnMap} />
            ) : (
              <>
                <div className="panel-filters">
                  <FilterControls filters={filters} onChange={setFilters} idPrefix="desk" />
                  {nActive > 0 && (
                    <button type="button" className="text-link secondary clear" onClick={clearAll}>Clear all</button>
                  )}
                </div>
                {all && list}
              </>
            )}
          </aside>
        )}

        <main className="map-wrap">
          {error && <p className="load-error" role="alert">Couldn’t load schools ({error}). Refresh to try again.</p>}
          {filtered && (
            <MapView
              data={filtered}
              selectedId={selected.length === 1 ? selected[0] : null}
              focus={focus}
              visible={isDesktop || view === "map"}
              isDesktop={isDesktop}
              onSelect={setSelected}
              onLocate={(loc) => setUserLocation(loc)}
            />
          )}
          {filtered && <Legend />}
          {filtered && campuses.length === 0 && (
            <div className="map-empty" role="status">
              <p className="empty-title">No schools match these filters</p>
              <button type="button" className="btn btn-primary" onClick={clearAll}>Clear all</button>
            </div>
          )}
          {!isDesktop && view === "list" && all && <div className="mobile-list">{list}</div>}
        </main>
      </div>

      {!isDesktop && (
        <nav className="bottom-bar" aria-label="View and filters">
          <button type="button" className="btn btn-secondary filters-btn" onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog">
            Filters{nActive > 0 ? ` (${nActive})` : ""}
          </button>
          <div className="toggle" role="group" aria-label="View">
            <button type="button" className={`seg${view === "map" ? " active" : ""}`} aria-pressed={view === "map"}
              onClick={() => setView("map")}>Map</button>
            <button type="button" className={`seg${view === "list" ? " active" : ""}`} aria-pressed={view === "list"}
              onClick={() => setView("list")}>List</button>
          </div>
        </nav>
      )}

      {!isDesktop && filtersOpen && (
        <>
          <div className="scrim" onClick={() => setFiltersOpen(false)} aria-hidden="true" />
          <div className="sheet full filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filters-title">
            <div className="sheet-head">
              <h2 id="filters-title" className="sheet-title">Filters</h2>
              <button type="button" className="sheet-close" aria-label="Close filters" onClick={() => setFiltersOpen(false)}>×</button>
            </div>
            <div className="sheet-body">
              <FilterControls filters={filters} onChange={setFilters} idPrefix="mob" />
            </div>
            <div className="sheet-foot">
              <button type="button" className="text-link secondary" onClick={clearAll} disabled={nActive === 0}>Clear all</button>
              <button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
                See {countLabel(schoolCount, campuses.length).replace(/ at .*/, "")}
              </button>
            </div>
          </div>
        </>
      )}

      {dataOpen && all && published && (
        <DataPanel
          data={all}
          published={published}
          report={report}
          isDesktop={isDesktop}
          onClose={() => setDataOpen(false)}
          onRefreshed={onRefreshed}
          onReset={onReset}
        />
      )}

      {!isDesktop && showDetail && all && (
        <DetailPanel campuses={selectedCampuses} meta={all.metadata} siblings={siblings} isDesktop={false} onClose={closeDetail}
          onPick={open} onShowOnMap={showOnMap} />
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import {
  AttributionControl,
  GeolocateControl,
  LngLatBounds,
  Map as MlMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MarkerBand, SchoolsCollection } from "@/lib/types";
import { gradeSpan } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
// NYC bounding box: all five boroughs (PRD 6.1)
const NYC_BOUNDS: [[number, number], [number, number]] = [[-74.2591, 40.4774], [-73.7004, 40.9176]];
const SOURCE = "campuses";

export interface FocusRequest {
  campusId: string;
  nonce: number;
}

interface Props {
  data: SchoolsCollection;
  selectedId: string | null;
  focus: FocusRequest | null;
  visible: boolean;
  isDesktop: boolean;
  onSelect: (campusIds: string[]) => void;
  onLocate: (lngLat: [number, number] | null) => void;
}

/** Read a design-system token so map paint never hard-codes a hex value (PRD 6.6). */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const BAND_TOKEN: Record<Exclude<MarkerBand, "Unknown">, string> = {
  Elementary: "--sa-orange",
  Middle: "--sa-blue",
  High: "--sa-green",
  Multi: "--sa-navy",
};

/** Five-point star with a 2px white outline, drawn at 2x for sharp edges (decision D4). */
function starImage(fill: string, stroke: string, strokeWidth: number) {
  const ratio = 2;
  const size = 30 * ratio;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const cx = size / 2, cy = size / 2 + ratio, outer = size / 2 - 3 * ratio, inner = outer * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = strokeWidth * 2 * ratio; // stroke is centred on the path; half shows outside
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  return { image: ctx.getImageData(0, 0, size, size), pixelRatio: ratio };
}

export default function MapView({ data, selectedId, focus, visible, isDesktop, onSelect, onLocate }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const dataRef = useRef(data);
  const onSelectRef = useRef(onSelect);
  const onLocateRef = useRef(onLocate);
  const desktopRef = useRef(isDesktop);
  dataRef.current = data;
  onSelectRef.current = onSelect;
  onLocateRef.current = onLocate;
  desktopRef.current = isDesktop;

  // Create the map once
  useEffect(() => {
    if (!container.current) return;
    setWorkerUrl(`${window.location.origin}${BASE}/maplibre/maplibre-gl-worker.mjs`);
    const map = new MlMap({
      container: container.current,
      style: STYLE_URL,
      bounds: NYC_BOUNDS,
      fitBoundsOptions: { padding: 16 },
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
      maxBounds: [[-74.8, 40.2], [-73.2, 41.2]],
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    const geolocate = new GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false });
    map.addControl(geolocate, "top-right");
    geolocate.on("geolocate", (e) => onLocateRef.current([e.coords.longitude, e.coords.latitude]));
    geolocate.on("error", () => onLocateRef.current(null));
    mapRef.current = map;

    const hover = new Popup({ closeButton: false, closeOnClick: false, offset: 14, className: "pin-popup", maxWidth: "280px" });

    map.on("load", () => {
      const band = (b: string) => token(BAND_TOKEN[b as keyof typeof BAND_TOKEN]);
      const white = token("--sa-white");
      const grey = token("--sa-grey");
      for (const b of Object.keys(BAND_TOKEN)) {
        const s = starImage(band(b), white, 2);
        map.addImage(`star-${b}`, s.image, { pixelRatio: s.pixelRatio });
      }
      const closed = starImage(white, grey, 2);
      map.addImage("star-closed", closed.image, { pixelRatio: closed.pixelRatio });

      map.addSource(SOURCE, {
        type: "geojson",
        data: dataRef.current as unknown as GeoJSON.FeatureCollection,
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 14,
        promoteId: "campus_id",
      });

      const isCluster = ["has", "point_count"] as const;
      const notCluster = ["!", ["has", "point_count"]] as const;
      const maybeClosed = ["in", "maybe_closed", ["get", "flags"]] as const;
      const isSA = ["==", ["get", "is_success_academy"], true] as const;

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: SOURCE,
        filter: isCluster as never,
        paint: {
          "circle-color": token("--sa-blue"),
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
          "circle-stroke-color": white,
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: SOURCE,
        filter: isCluster as never,
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 14,
          "text-allow-overlap": true,
        },
        paint: { "text-color": white },
      });
      // Invisible 22px-radius hit area so every pin is a 44px touch target (PRD 8.1)
      map.addLayer({
        id: "campus-hit",
        type: "circle",
        source: SOURCE,
        filter: notCluster as never,
        paint: { "circle-radius": 22, "circle-color": white, "circle-opacity": 0 },
      });
      map.addLayer({
        id: "campus-selected",
        type: "circle",
        source: SOURCE,
        filter: ["==", ["get", "campus_id"], ""],
        paint: {
          "circle-radius": 15,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": token("--sa-black"),
          "circle-stroke-width": 3,
        },
      });
      map.addLayer({
        id: "campus-pins",
        type: "circle",
        source: SOURCE,
        filter: ["all", notCluster, ["!", isSA]] as never,
        paint: {
          "circle-radius": 8,
          "circle-color": [
            "case",
            maybeClosed,
            white,
            ["match", ["get", "marker_band"],
              "Elementary", band("Elementary"),
              "Middle", band("Middle"),
              "High", band("High"),
              "Multi", band("Multi"),
              grey],
          ] as never,
          "circle-stroke-color": ["case", maybeClosed, grey, white] as never,
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "campus-stars",
        type: "symbol",
        source: SOURCE,
        filter: ["all", notCluster, isSA] as never,
        layout: {
          "icon-image": ["case", maybeClosed, "star-closed", ["concat", "star-", ["get", "marker_band"]]] as never,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
      readyRef.current = true;
      syncSelected(selectedIdRef.current);
    });

    map.on("click", "clusters", async (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
      if (!f) return;
      const src = map.getSource(SOURCE) as GeoJSONSource;
      const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
      map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.5 });
    });

    // Tap a pin -> details. Several schools in one building -> let the user pick.
    map.on("click", "campus-hit", (e: MapLayerMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ["campus-hit"] });
      const first = hits[0];
      if (!first) return;
      const [x, y] = (first.geometry as GeoJSON.Point).coordinates;
      const sameSpot = hits.filter((h) => {
        const [hx, hy] = (h.geometry as GeoJSON.Point).coordinates;
        return Math.abs(hx - x) < 1e-6 && Math.abs(hy - y) < 1e-6;
      });
      const ids = [...new Set(sameSpot.map((h) => String(h.properties.campus_id)))];
      hover.remove();
      onSelectRef.current(ids);
    });

    const setCursor = (c: string) => () => (map.getCanvas().style.cursor = c);
    for (const layer of ["clusters", "campus-hit"]) {
      map.on("mouseenter", layer, setCursor("pointer"));
      map.on("mouseleave", layer, setCursor(""));
    }
    // Desktop only: hover popup card (PRD 8.1 "use a Popup on desktop only")
    map.on("mousemove", "campus-hit", (e) => {
      if (!desktopRef.current) return;
      const hits = map.queryRenderedFeatures(e.point, { layers: ["campus-hit"] });
      const p = hits[0]?.properties;
      if (!p) return;
      const count = new Set(hits.map((h) => h.properties.campus_id)).size;
      const el = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = `${p.is_success_academy ? "★ " : ""}${p.name}`;
      const meta = document.createElement("span");
      meta.textContent = `${p.borough} · ${gradeSpan({ grade_min: p.grade_min, grade_max: p.grade_max })}`;
      el.append(name, meta);
      if (count > 1) {
        const more = document.createElement("span");
        more.textContent = `+${count - 1} more at this address`;
        el.append(more);
      }
      hover.setLngLat((hits[0].geometry as GeoJSON.Point).coordinates as [number, number]).setDOMContent(el).addTo(map);
    });
    map.on("mouseleave", "campus-hit", () => hover.remove());

    return () => {
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Filtered data -> setData, so clusters re-count and match the List view (PRD 8.1),
  // then zoom to the results so a filter never leaves the map looking at empty space.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(data as unknown as GeoJSON.FeatureCollection);
      if (!data.features.length) return;
      const b = new LngLatBounds();
      for (const f of data.features) b.extend(f.geometry.coordinates);
      map.fitBounds(b, { padding: 48, maxZoom: 15, duration: 600 });
    };
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [data]);


  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  function syncSelected(id: string | null) {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setFilter("campus-selected", ["all", ["!", ["has", "point_count"]], ["==", ["get", "campus_id"], id ?? ""]]);
  }
  useEffect(() => syncSelected(selectedId), [selectedId]);

  // The map is hidden behind the List view on mobile; resize when it shows again.
  useEffect(() => {
    if (visible) requestAnimationFrame(() => mapRef.current?.resize());
  }, [visible]);

  // "Show on map" / "Other campuses" jump to a pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const f = dataRef.current.features.find((x) => x.properties.campus_id === focus.campusId);
    if (!f) return;
    const go = () => {
      map.resize();
      map.flyTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 15.5), speed: 1.6 });
    };
    if (readyRef.current) requestAnimationFrame(go);
    else map.once("load", go);
  }, [focus]);

  return <div ref={container} className="map-canvas" role="region" aria-label="Map of charter school campuses" />;
}


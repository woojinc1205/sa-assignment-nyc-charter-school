import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Borough } from "../types.ts";

interface Shape {
  name: Borough;
  poly: Feature<Polygon>;
  bbox: [number, number, number, number];
}

/** Borough boundary lookup. A bounding-box check first keeps point-in-polygon fast on big shorelines. */
export class Boroughs {
  private shapes: Shape[] = [];

  constructor(fc: FeatureCollection<Polygon | MultiPolygon>) {
    for (const f of fc.features) {
      const name = f.properties?.boroname as Borough;
      const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
      for (const coords of polys) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of coords[0]) {
          x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
          y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
        }
        this.shapes.push({ name, bbox: [x0, y0, x1, y1],
          poly: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: coords } } });
      }
    }
  }

  which(lng: number, lat: number): Borough | null {
    for (const s of this.shapes) {
      const [x0, y0, x1, y1] = s.bbox;
      if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
      if (booleanPointInPolygon([lng, lat], s.poly)) return s.name;
    }
    return null;
  }

  /** Rough distance (m) to the borough's outline, for points just off the shoreline (piers, landfill). */
  distanceTo(lng: number, lat: number, borough: Borough): number {
    const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
    let best = Infinity;
    for (const s of this.shapes) {
      if (s.name !== borough) continue;
      for (const p of s.poly.geometry.coordinates[0]) best = Math.min(best, Math.hypot((p[0] - lng) * kx, (p[1] - lat) * 110_540));
    }
    return best;
  }
}

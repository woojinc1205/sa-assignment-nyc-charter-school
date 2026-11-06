"use client";

import { useMemo } from "react";
import type { CampusProps, SchoolsMeta } from "@/lib/types";
import { gradeSpan, schoolYear } from "@/lib/types";
import { milesBetween } from "@/lib/filters";

interface Props {
  campuses: CampusProps[];
  meta: SchoolsMeta;
  userLocation: [number, number] | null;
  sortByDistance: boolean;
  onSortByDistance: (on: boolean) => void;
  onOpen: (campusId: string) => void;
  onShowOnMap: (campusId: string) => void;
  onClear: () => void;
  hasFilters: boolean;
}

interface Group {
  school_id: string;
  campuses: CampusProps[];
  distance: number | null;
}

export function countLabel(schools: number, campuses: number): string {
  const s = `${schools} ${schools === 1 ? "school" : "schools"}`;
  return campuses === schools ? s : `${s} at ${campuses} campuses`;
}

/** List view: the accessible alternative to the map (PRD 6.2, 7). One card per school. */
export default function ListView(props: Props) {
  const { campuses, meta, userLocation, sortByDistance, onSortByDistance, onOpen, onShowOnMap, onClear, hasFilters } = props;

  const groups = useMemo<Group[]>(() => {
    const by = new Map<string, CampusProps[]>();
    for (const c of campuses) {
      const list = by.get(c.school_id) ?? [];
      list.push(c);
      by.set(c.school_id, list);
    }
    const dist = (c: CampusProps) => (userLocation ? milesBetween(userLocation, [c.lng, c.lat]) : null);
    const out: Group[] = [...by.entries()].map(([school_id, list]) => {
      const sorted = userLocation && sortByDistance
        ? [...list].sort((a, b) => dist(a)! - dist(b)!)
        : [...list].sort((a, b) => (a.campus_name ?? a.address).localeCompare(b.campus_name ?? b.address));
      return { school_id, campuses: sorted, distance: userLocation ? Math.min(...list.map((c) => dist(c)!)) : null };
    });
    if (userLocation && sortByDistance) out.sort((a, b) => a.distance! - b.distance!);
    else out.sort((a, b) => a.campuses[0].name.localeCompare(b.campuses[0].name));
    return out;
  }, [campuses, userLocation, sortByDistance]);

  return (
    <section className="list" aria-label="Schools">
      <div className="list-head">
        <p className="result-count" role="status" aria-live="polite">
          {countLabel(groups.length, campuses.length)}
        </p>
        <div className="sort" role="group" aria-label="Sort schools">
          <span className="sort-label">Sort</span>
          <button type="button" className={`seg${!sortByDistance ? " active" : ""}`} aria-pressed={!sortByDistance}
            onClick={() => onSortByDistance(false)}>A–Z</button>
          <button type="button" className={`seg${sortByDistance ? " active" : ""}`} aria-pressed={sortByDistance}
            onClick={() => onSortByDistance(true)}>Nearest</button>
        </div>
      </div>

      {groups.length === 0 && (
        <div className="empty">
          <p className="empty-title">No schools match these filters</p>
          {hasFilters && (
            <button type="button" className="btn btn-primary" onClick={onClear}>Clear all</button>
          )}
        </div>
      )}

      <ul className="cards">
        {groups.map((g) => {
          const lead = g.campuses[0];
          const many = g.campuses.length > 1;
          const closed = lead.flags.includes("maybe_closed");
          return (
            <li key={g.school_id} className="card">
              <h3 className="card-name">
                {lead.is_success_academy && <span className="sa-star" aria-label="Success Academy">★ </span>}
                {lead.name}
              </h3>
              <p className="meta">
                {[lead.network, lead.borough, gradeSpan(lead), g.distance !== null ? `${g.distance.toFixed(1)} mi` : null]
                  .filter(Boolean).join(" · ")}
              </p>
              {closed && <p className="badge">May have closed — last listed {schoolYear(meta.source_a.as_of)}</p>}
              {!many && <p className="meta">{lead.address}</p>}
              {many && (
                <ul className="campus-list" aria-label={`${g.campuses.length} campuses`}>
                  {g.campuses.map((c) => (
                    <li key={c.campus_id}>
                      <button type="button" className="campus-link" onClick={() => onOpen(c.campus_id)}>
                        <span className="campus-link-name">{c.campus_name ?? c.address.split(",")[0]}</span>
                        <span className="meta">{gradeSpan(c)} · {c.address}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="card-actions">
                {!many && (
                  <button type="button" className="text-link" onClick={() => onOpen(lead.campus_id)}>
                    View details<span className="sr-only"> for {lead.name}</span>
                  </button>
                )}
                <button type="button" className="text-link secondary" onClick={() => onShowOnMap(lead.campus_id)}>
                  Show on map<span className="sr-only"> for {lead.name}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CampusProps, SchoolsMeta } from "@/lib/types";
import { formatDate, formatGrades, formatMonth, gradeSpan, schoolYear } from "@/lib/types";

interface Props {
  /** One campus = details. Several = "schools at this address" picker. */
  campuses: CampusProps[];
  meta: SchoolsMeta;
  siblings: CampusProps[];
  isDesktop: boolean;
  onClose: () => void;
  onPick: (campusId: string) => void;
  onShowOnMap: (campusId: string) => void;
}

function sourceLabel(source: CampusProps["source"], meta: SchoolsMeta): string {
  const kml = `NYC Charter School Campuses map (${formatMonth(meta.source_b.as_of)})`;
  const json = `NYC Open Data school locations (${schoolYear(meta.source_a.as_of)})`;
  return source === "json+kml" ? `${kml} + ${json}` : source === "kml" ? kml : json;
}

/** Fiscal-year data ("2020") reads as a school year; KML data as a date. */
function asOf(p: CampusProps): string {
  return p.data_as_of.length === 4 ? `school year ${schoolYear(p.data_as_of)}` : formatDate(p.data_as_of);
}

function directionsUrl(p: CampusProps): string {
  const dest = `${p.lat},${p.lng}`;
  // Apple devices open Apple Maps; everything else gets Google Maps (opens the app if installed).
  if (typeof navigator !== "undefined" && /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)) {
    return `https://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(p.name)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** School detail (PRD 6.4). Mobile: bottom sheet, half height, swipe to full. Desktop: side panel. */
export default function DetailPanel({ campuses, meta, siblings, isDesktop, onClose, onPick, onShowOnMap }: Props) {
  const [full, setFull] = useState(false);
  const [dragY, setDragY] = useState(0);
  const start = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const key = campuses.map((c) => c.campus_id).join("|");

  useEffect(() => {
    heading.current?.focus();
    setFull(false);
  }, [key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (isDesktop) return;
    start.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current !== null) setDragY(e.clientY - start.current);
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    if (dragY < -60) setFull(true);
    else if (dragY > 80) (full ? setFull(false) : onClose());
    start.current = null;
    setDragY(0);
  };

  const picker = campuses.length > 1;
  const p = campuses[0];
  const closed = p.flags.includes("maybe_closed");
  const yr = schoolYear(meta.source_a.as_of);

  const body = picker ? (
    <>
      <h2 className="detail-name" tabIndex={-1} ref={heading}>{campuses.length} schools at this address</h2>
      <p className="meta">{p.address}</p>
      <ul className="campus-list">
        {campuses.map((c) => (
          <li key={c.campus_id}>
            <button type="button" className="campus-link" onClick={() => onPick(c.campus_id)}>
              <span className="campus-link-name">{c.is_success_academy ? "★ " : ""}{c.name}</span>
              <span className="meta">{[c.network, gradeSpan(c)].filter(Boolean).join(" · ")}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  ) : (
    <>
      <h2 className="detail-name" tabIndex={-1} ref={heading}>
        {p.is_success_academy && <span className="sa-star" aria-label="Success Academy">★ </span>}
        {p.name}
      </h2>
      {p.campus_name && <p className="detail-campus">{p.campus_name}</p>}
      {p.network && <p className="meta">{p.network}</p>}

      {closed && (
        <p className="notice" role="note">
          <strong>May have closed.</strong> This school is in the {yr} city list but missing from the {formatDate(meta.source_b.as_of)}
          charter campus list. Check with the school before you visit.
        </p>
      )}

      <div className="detail-actions">
        <a className="btn btn-primary" href={directionsUrl(p)} target="_blank" rel="noopener noreferrer">
          Get directions
        </a>
        {p.phone && (
          <a className="btn btn-secondary" href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>Call {p.phone}</a>
        )}
      </div>

      <dl className="detail-list">
        <Row label="Address">{p.address}</Row>
        <Row label="Borough">{p.borough}</Row>
        {p.neighborhood && <Row label="Neighborhood">{p.neighborhood}</Row>}
        {p.csd && <Row label="School district">CSD {p.csd}</Row>}
        <Row label="Grades at this campus">
          {p.grades.length ? formatGrades(p.grades) : "Not listed"}
          {p.grade_bands.length > 0 && <span className="meta block">{p.grade_bands.join(" · ")}</span>}
        </Row>
        {p.grades_final && p.grades_final.length > 0 && formatGrades(p.grades_final) !== formatGrades(p.grades) && (
          <Row label={`Planned grade span (${yr})`}>{formatGrades(p.grades_final)}</Row>
        )}
        {p.principal && <Row label={`Principal (${yr})`}>{p.principal}</Row>}
        {p.opened && <Row label="Opened">{p.opened}</Row>}
        <Row label="IDs">DBN {p.school_id} · Campus {p.campus_id}</Row>
      </dl>

      {siblings.length > 0 && (
        <div className="siblings">
          <h3 className="detail-sub">Other campuses of this school</h3>
          <ul className="campus-list">
            {siblings.map((c) => (
              <li key={c.campus_id}>
                <button type="button" className="campus-link" onClick={() => { onPick(c.campus_id); onShowOnMap(c.campus_id); }}>
                  <span className="campus-link-name">{c.campus_name ?? c.address.split(",")[0]}</span>
                  <span className="meta">{gradeSpan(c)} · {c.address}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="source">
        Source: {sourceLabel(p.source, meta)}. Data as of {asOf(p)}.
        {p.flags.includes("borough_corrected") && " Borough corrected from the source using the address's location."}
      </p>
    </>
  );

  if (isDesktop) {
    return (
      <aside className="detail-panel" aria-label="School details">
        <button type="button" className="text-link back" onClick={onClose}>← Back to results</button>
        {body}
      </aside>
    );
  }

  return (
    <>
      {full && <div className="scrim" onClick={() => setFull(false)} aria-hidden="true" />}
      <div
        className={`sheet${full ? " full" : ""}`}
        role="dialog"
        aria-modal={full}
        aria-label="School details"
        style={dragY ? { transform: `translateY(${Math.max(dragY, full ? 0 : -200)}px)`, transition: "none" } : undefined}
      >
        <div className="sheet-grip" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}>
          <button type="button" className="grip-bar" aria-label={full ? "Show less" : "Show more"} onClick={() => setFull(!full)} />
          <button type="button" className="sheet-close" aria-label="Close details" onClick={onClose}>×</button>
        </div>
        <div className="sheet-body">{body}</div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { downloadText } from "@/lib/download";
import type { ReportRow } from "@/lib/pipeline/build";
import type { Progress } from "@/lib/pipeline/config";
import type { RefreshResult, SourceKey } from "@/lib/refresh";
import { formatDate, schoolYear, type CampusProps, type SchoolsCollection } from "@/lib/types";

interface Props {
  /** What the app is showing now. */
  data: SchoolsCollection;
  /** The build the site shipped with. */
  published: SchoolsCollection;
  /** Merge report from the last in-app refresh (none for the published build). */
  report: ReportRow[] | null;
  isDesktop: boolean;
  onClose: () => void;
  onRefreshed: (r: RefreshResult) => void;
  onReset: () => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "running"; sources: SourceKey[]; progress: Progress }
  | { kind: "done"; sources: SourceKey[]; result: RefreshResult }
  | { kind: "error"; message: string };

const SOURCE_NAME: Record<SourceKey, string> = { json: "NYC Open Data", kml: "the campus KML" };

function names(list: CampusProps[]): string {
  const shown = list.slice(0, 5).map((c) => c.campus_name ?? c.name);
  return shown.join(", ") + (list.length > 5 ? `, and ${list.length - 5} more` : "");
}

/** "Data & updates": see where the data comes from and pull the latest of either source. */
export default function DataPanel({ data, published, report, isDesktop, onClose, onRefreshed, onReset }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const heading = useRef<HTMLHeadingElement>(null);
  const meta = data.metadata;
  const running = status.kind === "running";
  const kmlCampuses = data.features.filter((f) => f.properties.source !== "json").length;

  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(sources: SourceKey[]) {
    setStatus({ kind: "running", sources, progress: { step: "Starting" } });
    try {
      // Loaded on demand: the merge code and its XML parser aren't needed until someone refreshes.
      const { refreshData } = await import("@/lib/refresh");
      const result = await refreshData({
        sources,
        published,
        current: data,
        onProgress: (progress) => setStatus({ kind: "running", sources, progress }),
      });
      onRefreshed(result);
      setStatus({ kind: "done", sources, result });
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    }
  }

  const progress = status.kind === "running" ? status.progress : null;
  const pct = progress?.total ? Math.round(((progress.done ?? 0) / progress.total) * 100) : null;

  const body = (
    <>
      <h2 id="data-title" className="detail-name" tabIndex={-1} ref={heading}>Data &amp; updates</h2>
      <p className="meta">
        Schools come from two sources. Refresh either one to pull the latest and update the map.
      </p>

      <ul className="sources">
        <li className="source-card">
          <h3 className="source-name">NYC Open Data school list</h3>
          <p className="meta">
            School year {schoolYear(meta.source_a.as_of)} · fetched {formatDate(meta.source_a.fetched)}
            {meta.refreshed?.json === "live" && " · live"}
          </p>
          <p className="meta">Supplies the principal, phone and neighborhood.</p>
          <button type="button" className="btn btn-secondary" disabled={running} onClick={() => run(["json"])}>
            Refresh from NYC Open Data
          </button>
        </li>
        <li className="source-card">
          <h3 className="source-name">Charter campus KML</h3>
          <p className="meta">
            Dated {formatDate(meta.source_b.as_of)} · {kmlCampuses} campuses
            {meta.refreshed?.kml === "repo" && " · refreshed"}
          </p>
          <p className="meta">Supplies the campuses, their grades and addresses. Read from the repo.</p>
          <button type="button" className="btn btn-secondary" disabled={running} onClick={() => run(["kml"])}>
            Refresh campus KML
          </button>
        </li>
      </ul>

      <button type="button" className="btn btn-primary refresh-all" disabled={running} onClick={() => run(["json", "kml"])}>
        Refresh both
      </button>

      <div className="status" role="status" aria-live="polite">
        {status.kind === "running" && progress && (
          <>
            <p className="status-text">
              {progress.step}
              {progress.total ? ` (${progress.done} of ${progress.total})` : "…"}
            </p>
            <div className="bar" aria-hidden="true">
              <div className={`bar-fill${pct === null ? " indeterminate" : ""}`} style={pct === null ? undefined : { width: `${pct}%` }} />
            </div>
          </>
        )}
        {status.kind === "error" && (
          <p className="notice error" role="alert">
            <strong>Nothing changed.</strong> {status.message}
          </p>
        )}
        {status.kind === "done" && <Summary status={status} />}
      </div>

      <div className="data-actions">
        <button type="button" className="text-link secondary" onClick={() =>
          downloadText("schools.geojson", JSON.stringify(data), "application/geo+json")}>
          Download schools.geojson
        </button>
        {report && (
          <button type="button" className="text-link secondary" onClick={() =>
            import("@/lib/pipeline/build").then(({ reportToCsv }) => downloadText("merge-report.csv", reportToCsv(report), "text/csv"))}>
            Download merge report
          </button>
        )}
        {meta.refreshed && (
          <button type="button" className="text-link secondary" disabled={running} onClick={() => {
            onReset();
            setStatus({ kind: "idle" });
          }}>
            Reset to published data
          </button>
        )}
      </div>

      <p className="source">
        {meta.refreshed
          ? `Refreshed ${formatDate(meta.refreshed.at)}. This refresh is saved in this browser only. `
          : `Published ${formatDate(meta.generated)}. `}
        To update the data for everyone, run <code>npm run data:refresh</code> and commit the result.
      </p>
    </>
  );

  if (isDesktop) {
    return (
      <>
        <div className="scrim" onClick={onClose} aria-hidden="true" />
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="data-title">
          <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>×</button>
          <div className="modal-body">{body}</div>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="sheet full" role="dialog" aria-modal="true" aria-labelledby="data-title">
        <div className="sheet-head">
          <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="sheet-body">{body}</div>
      </div>
    </>
  );
}

function Summary({ status }: { status: Extract<Status, { kind: "done" }> }) {
  const { result, sources } = status;
  const { added, removed, changed } = result.diff;
  const same = added.length + removed.length + changed === 0;
  const m = result.collection.metadata;
  return (
    <div className="summary">
      <p className="status-text">
        <strong>{same ? "Up to date." : "Updated."}</strong>{" "}
        {same
          ? `Checked ${sources.map((s) => SOURCE_NAME[s]).join(" and ")}. Nothing changed.`
          : `${added.length} added, ${removed.length} removed, ${changed} changed.`}{" "}
        {m.schools} schools at {m.campuses} campuses.
      </p>
      {added.length > 0 && <p className="meta"><strong>Added:</strong> {names(added)}</p>}
      {removed.length > 0 && <p className="meta"><strong>Removed:</strong> {names(removed)}</p>}
      {result.newAddresses > 0 && (
        <p className="meta">Looked up {result.newAddresses} new address{result.newAddresses === 1 ? "" : "es"}.</p>
      )}
      {!result.persisted && (
        <p className="meta">This browser wouldn’t save the refresh, so it will reset when you leave.</p>
      )}
    </div>
  );
}

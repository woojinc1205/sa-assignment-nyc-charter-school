"use client";

import { useState } from "react";

/** Map legend (PRD 6.1). Every colour has a text label; the star is a distinct shape. */
export default function Legend() {
  const [open, setOpen] = useState(true);
  return (
    <div className={`legend${open ? "" : " collapsed"}`}>
      <button type="button" className="legend-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Legend <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ul className="legend-list">
          <li><span className="dot dot-elementary" aria-hidden="true" />Elementary (Pre-K–5)</li>
          <li><span className="dot dot-middle" aria-hidden="true" />Middle (6–8)</li>
          <li><span className="dot dot-high" aria-hidden="true" />High (9–12)</li>
          <li><span className="dot dot-multi" aria-hidden="true" />Multi-band (e.g. K–8)</li>
          <li><span className="star" aria-hidden="true">★</span>Success Academy</li>
          <li><span className="dot dot-closed" aria-hidden="true" />May have closed</li>
          <li><span className="dot dot-cluster" aria-hidden="true">3</span>Group of campuses</li>
        </ul>
      )}
    </div>
  );
}

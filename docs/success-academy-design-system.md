# Success Academy — Design System

> Reverse-engineered from the live site **successacademies.org** (computed styles + theme stylesheet `sapublic/main.min.css`), captured 5 Nov 2026.
> Purpose: reference for building on-brand UI (e.g. the NYC charter-school map) that feels native to Success Academy.

---

## 1. Brand Character

- **Bold, confident, optimistic.** Big heavy headlines, saturated orange, generous whitespace.
- **Structured.** Square corners everywhere. Flat color blocks. No gradients, almost no shadows.
- **Photo-led.** Hero sections use full-bleed photography of students with white type overlaid.
- **Two-color brand:** Orange carries action and energy. Blue carries trust and institution.

**Design principles**
1. Orange = action. Every primary CTA is orange.
2. Square, flat, solid. `border-radius: 0` is the default.
3. Hierarchy through size and weight, not color variety.
4. Color blocks (orange/blue panels) separate sections; content sits on white.

---

## 2. Color

### 2.1 Core brand

| Token | Hex | Usage |
|---|---|---|
| `--sa-orange` | `#F7941E` | Primary brand. CTAs, eyebrow marker, stat numbers, highlight panels, focus borders |
| `--sa-orange-hover` | `#F47521` | Hover / pressed state for orange buttons and submit inputs |
| `--sa-orange-deep` | `#EC8D1C` | Large orange headings on white (e.g. "Find a Success Academy…") |
| `--sa-blue` | `#005E9E` | Secondary brand. Announcement bar, form/quote blocks, blue panels, "Teach" CTA text |
| `--sa-blue-hover` | `#004676` | Hover for blue buttons |
| `--sa-navy` | `#192C4B` | Deepest accent (K-12 map pin, dark overlays) |
| `--sa-black` | `#000000` | Default body text and headings on white |
| `--sa-white` | `#FFFFFF` | Text on photos and color panels; base background |

### 2.2 Supporting

| Token | Hex | Usage |
|---|---|---|
| `--sa-light-blue` | `#00AEEF` | Accent text (`.text-light-blue`) |
| `--sa-green` | `#2ABB7F` | Accent text; High School map pin |
| `--sa-slate` | `#37465A` | Secondary text in map / title blocks |
| `--sa-grey-text` | `#636466` | Muted body text (`.text-grey-font`) |
| `--sa-grey` | `#ACACAC` | Disabled / tertiary text |
| `--sa-border` | `#CCCCCC` | Hairline borders, dividers |
| `--sa-bg-grey` | `#F2F2F2` | Light section background (`.bg-grey`) |
| `--sa-bg-pale-blue` | `#F9FAFF` | Subtle cool background (`.bg-pale-blue`) |
| `--sa-bg-cream` | `#FFF5EB` | Warm tint (orange at low strength) |
| `--sa-link-on-blue-hover` | `#D7EAF8` | Link hover on blue panels |
| `--sa-link-on-blue-visited` | `#A4C5DC` | Visited link on blue panels |
| `--sa-error` | `#ED1C24` | Error / required states |

### 2.3 Watermark tints

| Token | Value | Usage |
|---|---|---|
| `--sa-watermark-grey` | `rgba(240,240,240,.5)` | Giant background word on white sections |
| `--sa-watermark-white` | `rgba(255,255,255,.08)` | Giant background word on color panels |

### 2.4 Pairings (contrast)

| Foreground | Background | Use |
|---|---|---|
| White | Orange `#F7941E` | Buttons, panels. **Large/bold text only** — contrast ≈ 2.1:1 fails AA for body text |
| White | Blue `#005E9E` | Panels, bars. ≈ 6.7:1 — passes AA |
| Orange | White | Headlines, stat figures only (large) |
| Blue | White | Secondary button text, links |
| Black | White | Body copy |

> Accessibility note: the site uses white-on-orange for buttons at 14–18px / 600 weight. If you need strict WCAG AA, use bold ≥18.66px, or swap to `--sa-orange-hover` / black text.

---

## 3. Typography

### 3.1 Families

| Token | Stack | Notes |
|---|---|---|
| `--sa-font` | `"AkkuratLL", Arial, Helvetica, sans-serif` | The only brand face. Licensed (Lineto). Weights in use: 400, 400 italic, 600, 700 |
| Fallback alt | `"Inter", Arial, sans-serif` | Closest free substitute if Akkurat isn't licensed |

No serif. No display face. One family does everything.

### 3.2 Scale

| Role | Size | Weight | Line height | Transform | Color (typical) |
|---|---|---|---|---|---|
| Display / Hero H1 | 50px (3.125rem) | 700 | 1.15 (57.5px) | none | White on photo |
| H2 (section title) | 40px (2.5rem) | 700 | 1.25 (50px) | none | Black / White / Orange |
| H3 (quote, card title) | 28px (1.75rem) | 700 | 1.25 (35px) | none | White / Black |
| H4 / Stat number | 45px | 700 | normal | none | Orange |
| H4 (default) | 22px (1.375rem) | 700 | — | none | — |
| H5 | 18px (1.125rem) | 700 | — | none | — |
| Lead / tagline | 24px | 400 | 1.56 (37.4px) | none | White on hero |
| Body | 16px | 400 | 1.56 (24.96px) | none | Black |
| Footer column heading | 18px | 700 | 1.05 | none | Black |
| Eyebrow | 16px | 600 | 1.56 | UPPERCASE | White / Black |
| Button | 16–18px | 600 | normal | Sentence case (UPPERCASE in header) | — |
| Nav link | 12px | 600 | 1.16 | UPPERCASE | White |
| Small / legal | 14px (.88rem) | 400 | — | none | Grey |

**Heading margin:** H2 has `margin-bottom: 1.875rem` (30px).

### 3.3 Utility weights & tracking (from theme)

```
.text-thin    100   .text-normal-spacing  letter-spacing: .1em
.text-light   300   .text-wide            letter-spacing: .2em
.text-regular 400   .text-wider           letter-spacing: .4em
.text-bold    600
.text-black   700
```
Wide tracking is reserved for the logo lockup and occasional eyebrows.

---

## 4. Spacing

Rem-based scale. Class suffix = rem × 100 (`mt-200` = 2rem).

| Token | rem | px |
|---|---|---|
| `--space-25` | .25 | 4 |
| `--space-50` | .5 | 8 |
| `--space-75` | .75 | 12 |
| `--space-100` | 1 | 16 |
| `--space-150` | 1.5 | 24 |
| `--space-200` | 2 | 32 |
| `--space-250` | 2.5 | 40 |
| `--space-300` | 3 | 48 |
| `--space-500` | 5 | 80 |
| `--space-600` | 6 | 96 |
| `--space-625` | 6.25 | 100 |
| `--space-800` | 8 | 128 |

**Rhythm**
- Section vertical padding: **96px** desktop (`py-600`) → **48px** ≤768px (`md:py-300`).
- Container side padding: **100px** desktop (`px-625`) → **32px** mobile (`md:px-200`).
- Map / tool wrappers: **64px** padding.

---

## 5. Layout & Grid

- **Max container width:** 1600px, flex-based, centered.
- **Content column:** inner blocks cap at 835px (90%) for text-heavy sections; 535px for narrow forms.
- **Two-up split** is the dominant pattern: text block left, image/map right (or reversed).
- **Breakpoints** (all `max-width`, desktop-first):

| Token | Value |
|---|---|
| `--bp-xl` | 1500px |
| `--bp-lg` | 1200px |
| `--bp-md-lg` | 1024px |
| `--bp-md` | 990px |
| `--bp-tablet` | 768px (primary "md:" switch) |
| `--bp-sm` | 660px |
| `--bp-xs` | 480px |

---

## 6. Shape, Elevation, Motion

| Property | Value |
|---|---|
| Border radius | **0** (default everywhere). `50%` only for circular icon buttons / avatars |
| Borders | 1px `#CCCCCC` hairlines; **2px solid orange** for focused/active inputs; 2px white for outline buttons on color |
| Shadows | Essentially none. Only `0 0 0 3px #fff` focus ring, and map controls |
| Overlays | `rgba(0,0,0,.4)` on hero photos; `rgba(0,0,0,.5)` modal scrim |
| Transition — UI | `background-color .25s` / `all .25s ease-in-out` |
| Transition — reveal | `opacity .5s ease-out, transform 1s cubic-bezier(.25,.46,.45,.94)` (sections fade/slide in on scroll via `.animate`) |
| Watermark reveal | `.watermark::after` slides 200px in, 1s delay |

---

## 7. Components

### 7.1 Buttons

All buttons: square corners, no border, weight 600, `padding: .9rem 1.56rem` (≈14px 25px), `line-height: normal`, `display: inline-block`.

| Variant | Background | Text | Hover |
|---|---|---|---|
| **Primary** `.btn-orange` | `#F7941E` | `#FFF` | bg `#F47521` |
| **Secondary** `.btn-blue` | `#005E9E` | `#FFF` | bg `#004676` |
| **Inverse (on orange panel)** `.btn-white.text-orange` | `#FFF` | `#F7941E` | — |
| **Inverse (on blue panel)** `.btn-white.text-blue` | `#FFF` | `#005E9E` | — |
| **Outline on color** `.white-outline` | transparent | `#FFF`, 2px white border | — |
| **Header CTA** | `#F7941E` | `#FFF`, 14px, UPPERCASE, `12px 16px` | `#F47521` |

Focus: `outline: 1px solid #F47521` (primary).

**Labels:** short, verb-first, sentence case — *Apply Now, See Locations, Learn More, Teach, Subscribe, Donate Today.*

### 7.2 Eyebrow

Uppercase 16px/600 label above the hero headline, preceded by a **12×12px solid orange square**. On orange panels the square turns white; on blue panels it stays orange.

```css
.eyebrow::before { content:""; display:inline-block; width:12px; height:12px;
  background:#F7941E; margin-right:.5rem; }
```

### 7.3 Highlight panel

Section with a solid color block behind content, drawn via `::before` at **85% width** (offset, asymmetric) — or 100% on mobile.
- `.highlight-orange` → `#F7941E` block, white text
- `.highlight-blue` → `#005E9E` block, white text, links white → hover `#D7EAF8`

### 7.4 Watermark headline

Giant (13rem / 208px, weight 700) background word positioned behind section content, near-invisible tint (`rgba(240,240,240,.5)` on white). Slides in on scroll. Pure decoration.

### 7.5 Stat block

Big orange number (45px/700) centered over a short descriptor. Used in pairs ("100%", "99%"), followed by a college logo grid.

### 7.6 Announcement bar

Full-width blue `#005E9E` strip, white 16px text, inline orange **Apply Now** button, close (×) at right.

### 7.7 Header / Nav

- Logo: orange square block with white wide-tracked "SUCCESS ACADEMY" wordmark (SVG `SA-full.svg`).
- Nav links: 12px / 600 / UPPERCASE / white, overlaid on hero.
- Orange "Apply Now" button pinned right. Language selector + search in a top utility row.

### 7.8 Hero

Full-bleed student photo, dark overlay, left-aligned white stack: eyebrow → 50px headline → 24px tagline → button group (Primary + secondary) with 45px top gap.

### 7.9 Forms

- Inputs: white bg, black 16px text, `padding: 16px`, square, **2px solid orange** border on key inputs (e.g. ZIP search).
- Labels: 16px regular, white when on blue form block.
- Submit: full-width orange, white text, hover `#F47521`.
- Form block sits on `#005E9E` paired with a testimonial quote (`form-quote-block`).

### 7.10 Testimonial

H3-size (28px/700) quote in white on orange/blue panel; parent-story carousel (slick) with orange square arrows.

### 7.11 Footer

White background, 96px vertical padding. Multi-column links: 18px/700 column headings, 16px links. Social icons row. Address/legal in small grey.

---

## 8. Map Patterns (most relevant to the charter-school map)

The site's school finder is a **two-up layout**: left = title + intro + borough filter grid; right = Google Map.

**Borough filter:** 2-column grid of solid orange tiles (white 16px/600 text: *The Bronx, Harlem, Manhattan, Brooklyn, Queens*) plus an **"Enter Zip" input** with 2px orange border, same tile size. Square corners, ~4px gaps.

**Map pin legend** (teardrop pins, observed colors — approximate):

| School type | Color |
|---|---|
| K-12 | Navy `#192C4B` |
| Elementary | Orange `#F7941E` |
| Middle | Blue `#005E9E` / `#00AEEF` |
| High | Green `#2ABB7F` |
| Shared Building | Navy w/ outline |

**Recommended for a full NYC charter map**
- Success Academy schools → brand orange pins (hero category).
- Other charter networks → neutral or secondary palette (`#005E9E`, `#37465A`, `#ACACAC`) so SA stays dominant.
- Map basemap: muted/greyscale style so pins carry color.
- Tooltip/card: white, square, 1px `#CCCCCC` border, school name 18px/700, meta 14px `#636466`, orange "Learn More" text link.
- Active filter tile: switch to `#005E9E` (theme uses `.btn.active { background:#005E9E }`).

---

## 9. Voice & Copy

- Direct, upbeat, parent-facing. Short sentences.
- Headlines use Title Case: *"Find a Success Academy Charter School Near You"*, *"Free and Expansive Programming"*.
- Proof-driven: percentages, college logos, "20 Years of Helping Kids Reach New Heights".
- Core promise phrasing: *safe, structured, and beautiful learning environment*.

---

## 10. CSS Tokens (drop-in)

```css
:root {
  /* Brand */
  --sa-orange: #F7941E;
  --sa-orange-hover: #F47521;
  --sa-orange-deep: #EC8D1C;
  --sa-blue: #005E9E;
  --sa-blue-hover: #004676;
  --sa-navy: #192C4B;
  --sa-black: #000;
  --sa-white: #fff;

  /* Support */
  --sa-light-blue: #00AEEF;
  --sa-green: #2ABB7F;
  --sa-slate: #37465A;
  --sa-grey-text: #636466;
  --sa-grey: #ACACAC;
  --sa-border: #CCCCCC;
  --sa-bg-grey: #F2F2F2;
  --sa-bg-pale-blue: #F9FAFF;
  --sa-bg-cream: #FFF5EB;
  --sa-error: #ED1C24;

  /* Type */
  --sa-font: "AkkuratLL", "Inter", Arial, Helvetica, sans-serif;
  --fs-display: 3.125rem;  /* 50 */
  --fs-h2: 2.5rem;         /* 40 */
  --fs-stat: 2.8125rem;    /* 45 */
  --fs-h3: 1.75rem;        /* 28 */
  --fs-lead: 1.5rem;       /* 24 */
  --fs-h4: 1.375rem;       /* 22 */
  --fs-h5: 1.125rem;       /* 18 */
  --fs-body: 1rem;         /* 16 */
  --fs-small: .875rem;     /* 14 */
  --fs-nav: .75rem;        /* 12 */
  --lh-body: 1.56;
  --lh-heading: 1.25;
  --fw-regular: 400;
  --fw-semibold: 600;
  --fw-bold: 700;

  /* Space */
  --space-1: .25rem; --space-2: .5rem; --space-3: .75rem; --space-4: 1rem;
  --space-6: 1.5rem; --space-8: 2rem; --space-12: 3rem; --space-20: 5rem;
  --space-24: 6rem;
  --section-py: 6rem;        /* 3rem ≤768px */
  --container-px: 6.25rem;   /* 2rem ≤768px */
  --container-max: 1600px;

  /* Shape & motion */
  --radius: 0;
  --border-hairline: 1px solid var(--sa-border);
  --border-focus: 2px solid var(--sa-orange);
  --focus-ring: 0 0 0 3px #fff;
  --overlay-hero: rgba(0,0,0,.4);
  --ease-reveal: cubic-bezier(.25,.46,.45,.94);
  --dur-fast: .25s;
  --dur-reveal: .5s;
}

@media (max-width: 768px) {
  :root { --section-py: 3rem; --container-px: 2rem; }
}

.btn { font: 600 1rem/normal var(--sa-font); padding: .9rem 1.56rem;
  border: 0; border-radius: 0; cursor: pointer; transition: background-color var(--dur-fast); }
.btn-primary { background: var(--sa-orange); color: #fff; }
.btn-primary:hover { background: var(--sa-orange-hover); }
.btn-secondary { background: var(--sa-blue); color: #fff; }
.btn-secondary:hover { background: var(--sa-blue-hover); }
```

---

## 11. Do / Don't

| Do | Don't |
|---|---|
| Use orange for the single most important action | Use orange for decoration and CTAs at once on the same block |
| Keep corners square | Round buttons, cards or inputs |
| Use flat color panels to separate sections | Add gradients or drop shadows |
| Set headlines big and bold (700) | Mix multiple typefaces |
| Put white text on blue freely | Put small white body text on orange |
| Use real student/classroom photography | Use stock illustration or icons as hero imagery |

---

*Source notes: values are computed styles and stylesheet rules from the public homepage. Akkurat LL is a commercial font — license it or use Inter as a stand-in. Map pin colors are observed visually and should be verified against the live map before final use.*

# Centenary Networks — B-BBEE Scorecard Tool

A self-contained, responsive B-BBEE (Generic Scorecard) calculator built for Centenary
Networks, modelled on the navigation and layout captured in `references/` and scored
against the Amended Codes of Good Practice.

## Opening the tool

No install, no server, no build step required.

- Double-click **`index.html`** to open it in Chrome or Edge, or
- Right-click → *Open with* → your preferred browser.

All data is saved automatically to your browser's local storage on this device (nothing
is uploaded anywhere). Use **Your Scorecards → Reset to sample data** if you ever want to
clear everything and start over from the built-in sample.

## What's inside

- **Dashboard** — snapshot of your current level, scorecard, scenario planner, target
  scorecards and implementation planner.
- **Scorecards** — create EME, QSE or Generic scorecards (auto-suggested from revenue,
  with a one-click "use suggested size"); each one has its own workspace: General
  Information, Ownership, Management Control, Skills Development, Enterprise & Supplier
  Development, Socioeconomic Development, Y.E.S Participation, Scorecard Insights and EE
  Insights (all live-calculated as you type).
  - **EME** entities get a simplified ownership-only level lookup shown alongside the
    full scorecard for comparison.
  - **QSE** scorecards use the officially published QSE element weightings (25/20/25/30/5),
    proportionally scaled from the same detailed inputs as the Generic Scorecard.
  - **Ownership** supports a full shareholder register (name, race, gender, shareholding
    %, new entrant, designated group) with automatic flow-through calculation of voting
    rights and economic interest, plus a Net Value calculator (unencumbered value ÷ total
    asset value).
  - **Management Control** targets default to the National Economically Active Population
    split. Every row added under "Add Person" also generates its own logo-branded
    **Portfolio of Evidence PDF** — one consolidated file per person, replacing separate
    individual document submissions.
  - **Skills Development** is gated on confirming your WSP/ATR submission — no spend is
    recognised without it, matching the actual codes.
  - **Enterprise & Supplier Development** tracks each supplier's B-BBEE certificate expiry
    date; an expired certificate is automatically recognised at 0%.
  - **Socio-Economic Development** is gated on the beneficiary base being at least 75%
    Black South African.
  - **Priority Element Compliance** — Scorecard Insights shows the 40% sub-minimum check
    for Ownership (Net Value), Skills Development (expenditure) and each ESD sub-element,
    and automatically discounts your overall level by one if any sub-minimum is missed —
    exactly as the codes require.
  - **Verification & Audit Prep** — a readiness checklist flags missing data (revenue,
    roster, WSP/ATR, expired certificates, etc.), plus one-click, logo-branded **PDF,
    Excel, CSV and JSON** exports of the scorecard to hand to a verification agency.
- **Scenarios** — drag sliders to explore "what if" improvements per element.
- **Target Scorecards** — set goals per element and see the gap to your current score.
- **Implementation Plan** — action items with an owner, due date and status.

## Export & import

Every roster/register — Management Control's workforce, Ownership's shareholders, ESD's
suppliers, SED's beneficiaries, and Implementation Plan's tasks — has its own **Export
CSV** / **Import CSV** buttons right under its table, for bulk edits in a spreadsheet or
moving data between scorecards. Scorecard Insights separately offers a full, logo-branded
**PDF / Excel / CSV / JSON** report of the whole scorecard for a verification agency.

## Saving

Every field — including adding a row to any roster — auto-saves locally to this browser as
you type. Each scorecard screen also has an explicit **Save** bar underneath the tabs;
that's the button a real backend will sync on (see below). It's safe to ignore day-to-day
since your edits are never lost locally either way.

## Backend readiness

This is a frontend-only tool today, but it's built so a backend can be dropped in without
a rewrite: every read/write already goes through `js/api.js`, a documented API layer with
one function per resource (scorecards, implementation tasks, scenarios — everything else,
like a person on the roster, is just nested data on a scorecard, saved together with it).
Each function already has a working `fetch()` implementation ready to activate — flip one
flag once the endpoints exist. **See `BACKEND.md`** for the full contract: the database
tables to create, REST endpoints, request/response shapes, auth, and error format — that's
the file to hand the backend developer.

## Branding

The header and browser-tab favicon use the real Centenary Networks mark, cropped from the
company email signature and saved to `assets/centenary-logo.png` (header) and
`assets/centenary-favicon.png` (a square, white-padded version for the favicon). To swap
in an updated logo later, replace those two files with the same filenames — no code
changes needed.

## Important note

This tool gives an **indicative** B-BBEE score for internal planning, using standard
Amended Codes of Good Practice weightings and targets. It is not a substitute for a
certified rating — for an official B-BBEE certificate, engage a SANAS-accredited
verification agency.

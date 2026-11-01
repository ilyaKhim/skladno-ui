# Editable data blocks

## User workflow

The separate top insertion toolbar contains **Текст**, **Изображение**, **Таблица**,
**Графики**, and **Блоки**. **Графики** offers bar, line, and doughnut charts;
**Блоки** offers KPI / big number and comparison. These are type menus, not the
data editor itself.

All six data types open the same nonmodal, in-flow **Данные блока** region below
the still-visible canvas when added. Double-click an existing block, or select it
and choose **Изменить данные**, to reopen it. Enter headers and rows; valid local
drafts preview live on the canvas without changing the canonical document. Invalid
input remains editable in the grid, disables Apply, and falls back to the saved
slide/block on the canvas. The same dataset can switch between compatible views;
a chart requires numbers in every column after the first.

Choose **Применить** (accessible name **Применить данные**), Ctrl/Meta+Enter, or
Ctrl/Meta+S to commit a valid draft as one undo step. **Отмена**, X, or Escape closes
the region and discards only its local changes. Cell drafts are not autosaved,
persisted, or recoverable before Apply. The browser warns on page unload while the
region is open; that warning does not store the draft.

While editing data, the canvas, slide navigation, other editor actions, AI, and
export are inactive to keep Apply on the originating slide. The top/contextual
toolbars and desktop slide rail are muted; the mobile thumbnail rail hides and
mobile chat closes. A desktop-to-mobile breakpoint transition also suppresses the
chat sheet while the grid remains open, including an explicitly reopened desktop chat.
The grid and its controls scroll locally on narrow screens,
including horizontal cell scrolling, without widening the page. This region is not
a modal or a replacement for the right-side AI panel.

Blocks support canvas movement/resizing, keyboard arrows, duplication, deletion,
undo/redo, autosave, local recovery, and thumbnails once applied; these existing
canonical-document semantics are unchanged. They are added to the current
slide without deleting or rearranging its existing contents; check their placement.

Initial rows contain zero values, not AI-invented measurements. There are no Excel
formulas, merged cells, 3D charts, stacked bars, arbitrary chart styling, or automatic
imports from uploaded PPTX files in this iteration.

## Stored contract

`PresentationContent.Slide.dataBlocks` contains `DataBlock` records:

- `id`, unique across all custom objects in the deck;
- `type`: `table`, `bar`, `kpi`, `comparison`, `line`, or `doughnut`;
- percentage geometry: `x`, `y`, `width`, `height`;
- `headers`: 2–6 strings;
- `rows`: 1–12 rectangular rows, up to 160 characters per cell;
- `horizontal`: the bar orientation (retained when switching to a table).

The first column contains categories. Chart values are decimal-number strings,
not formatted percentages/currency or formulas; non-finite values and magnitudes
above 1e12 are rejected. At most 10 data blocks are supported per slide.

Type-specific meaning (no new document fields or database migration):

| Type | Dataset | Editable PowerPoint output |
| --- | --- | --- |
| `table` | 2–6 columns, text cells | Native table |
| `comparison` | Criteria in column 1; 2–5 alternatives | Native table, bold criteria |
| `kpi` | One label/value pair; label up to 80, value up to 40 characters, units allowed | Native text boxes |
| `bar` | Categories + 1–5 numeric series | Clustered bar/column chart + workbook |
| `line` | Categories + 1–5 numeric series, in row order | Native line chart + workbook |
| `doughnut` | Categories + exactly one non-negative numeric series, positive total | Native doughnut + workbook |

The line chart has a categorical axis, not an XY/date axis. A zero-only doughnut
is invalid: entering actual data is required before Apply. Changing a view never
silently discards rows or columns; incompatible data must be corrected explicitly.

The browser API uses `data_blocks` on slide snapshots. Records inside that array
have single-word property names, identical to the stored model. Older saved
documents without the property load with no data blocks. An older client's omitted
property preserves existing data; an explicit empty array deletes it. No database
migration is required because revisions already contain a JSON document.

## AI boundaries

Initial generation and the existing **whole-presentation chat** understand these
objects through the strict generation schema. The prompt requires actual source
data, forbids invented numeric series, and asks to preserve unmodified objects.
Whole-presentation chat retains its existing publication/quota semantics.

The editor's contextual AI panel still edits **text** proposals; it does not offer
per-cell or per-chart proposals. There is no new paid-call endpoint in this change.
E2E generation/chat use a loopback provider fixture, never the real OpenAI account.

## Export

`DataBlockRenderer` creates native PowerPoint text, tables, and charts.
Chart data is written into an embedded Excel workbook and cached in chart XML.
The `addChart` API takes EMUs, whereas text/table anchors use points; conversion
is explicit and covered by a geometry assertion.

PDF remains a visual copy. POI's stock graphical-frame renderer skips charts
without a fallback picture. `ChartDrawFactory` paints only GoDeck-created
charts (bar, line, doughnut) from their native series, at their existing z-order, without altering the
published PPTX. Browser/PDF share a fixed palette and zero-based numeric range;
PowerPoint performs its own native chart layout, so exact label typography is not
promised. Long category labels are shortened visually; full data remains stored.
Native chart options require `poi-ooxml-full`: it replaces the lite schema JAR,
not the POI API/version. The lite artifact lacks types for marker size and slice angle.

Template text now projects source top/center/bottom vertical alignment through the
read-only editor view (`vertical_align`), including the Opal TITLE's `bodyPr anchor="b"`.
Canvas and thumbnail rendering align the whole paragraph flow within the unchanged
source frame. Custom or legacy text without this projection defaults to top. This adds
no persistent document field or alignment control and leaves native PPTX alignment
untouched. It does not promise whole-slide pixel parity or automatic layout; inserted
blocks still require a placement check.

## Verification

Run `pnpm verify` locally. Relevant focused tests:

- `pnpm test:frontend` — validation, serialization, undo, supplied AI JSON;
- `pnpm backend:test -Dtest=DataBlockRendererTest,PresentationRequestFactoryTest,PresentationRequestGoldenTest`;
- `pnpm test:e2e editor-data-blocks.spec.ts` — Chromium/WebKit, real API/storage,
  save/reload, native PPTX, PDF, invalid input, older clients, mobile, and AI worker/chat.
- `pnpm test:e2e editor-expanded-blocks.spec.ts` — all four new types: manual
  insertion, cancellation, undo/redo, mobile; initial AI request and an actual user
  message through the studio's whole-deck chat form, changing 73 to 89, then
  verifying saved data, reopening, native PPTX, and PDF. The provider fixture also
  checks that the requested type is present in the outbound strict schema.
- `pnpm test:e2e editor-vertical-alignment.spec.ts` — source bottom alignment in
  canvas and thumbnail, inline editing, save/reload, mobile, and unchanged PPTX anchor.
- `pnpm test:e2e editor-data-panel.spec.ts` — top insertion menus, the shared in-flow
  region, local preview/Apply/cancellation, unload warning, and mobile grid scrolling;
  desktop-to-mobile resizing with reopened AI chat must leave the grid unobstructed,
  keep the value 91 local until Apply, and then save it. This scenario writes a
  per-browser `*-resize.png` capture when run.

Visual evidence for this data-panel extension is captured in
`frontend/.impeccable/review/data-panel/chromium-{desktop,mobile,mobile-grid,chart-menu}.png`.
These captures are not a claim that the full browser suite has passed; test completion
must be reported from the actual run.

The new browser scenarios use an isolated database schema and temporary files,
as do the existing E2E tests. They do not modify the user's presentations.

# Tables and grouped bar charts

## User workflow

The editor toolbar contains **Добавить таблицу** and **Добавить диаграмму**.
Enter headers and rows, then choose **Применить данные**. Cancel discards only the
local grid changes. Double-click an existing block, or select it and choose
**Изменить данные**, to reopen the grid. The same dataset can switch between a
table and a chart. A chart requires numbers in every column after the first.

Blocks support canvas movement/resizing, keyboard arrows, duplication, deletion,
undo/redo, autosave, local recovery, and thumbnails. They are added to the current
slide without deleting or rearranging its existing contents; check their placement.

Initial rows contain zero values, not AI-invented measurements. There are no Excel
formulas, merged cells, 3D charts, stacked bars, arbitrary chart styling, or automatic
imports from uploaded PPTX files in this iteration.

## Stored contract

`PresentationContent.Slide.dataBlocks` contains `DataBlock` records:

- `id`, unique across all custom objects in the deck;
- `type`: `table` or `bar`;
- percentage geometry: `x`, `y`, `width`, `height`;
- `headers`: 2–6 strings;
- `rows`: 1–12 rectangular rows, up to 160 characters per cell;
- `horizontal`: the bar orientation (retained when switching to a table).

The first column contains categories. Chart values are decimal-number strings,
not formatted percentages/currency or formulas; non-finite values and magnitudes
above 1e12 are rejected. At most 10 data blocks are supported per slide.

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

`DataBlockRenderer` creates native PowerPoint tables and grouped bar charts.
Chart data is written into an embedded Excel workbook and cached in chart XML.
The `addChart` API takes EMUs, whereas text/table anchors use points; conversion
is explicit and covered by a geometry assertion.

PDF remains a visual copy. POI's stock graphical-frame renderer skips charts
without a fallback picture. `ChartDrawFactory` paints only GoDeck-created bar
charts from their native series, at their existing z-order, without altering the
published PPTX. Browser/PDF share a fixed palette and zero-based numeric range;
PowerPoint performs its own native chart layout, so exact label typography is not
promised. Long category labels are shortened visually; full data remains stored.

## Verification

Run `pnpm verify` locally. Relevant focused tests:

- `pnpm test:frontend` — validation, serialization, undo, supplied AI JSON;
- `pnpm backend:test -Dtest=DataBlockRendererTest,PresentationRequestFactoryTest,PresentationRequestGoldenTest`;
- `pnpm test:e2e editor-data-blocks.spec.ts` — Chromium/WebKit, real API/storage,
  save/reload, native PPTX, PDF, invalid input, older clients, mobile, and AI worker/chat.

The new browser scenarios use an isolated database schema and temporary files,
as do the existing E2E tests. They do not modify the user's presentations.

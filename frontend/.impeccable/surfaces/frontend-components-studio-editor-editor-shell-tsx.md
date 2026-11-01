---
version: 1
slug: "frontend-components-studio-editor-editor-shell-tsx"
primary_target: "frontend/components/studio/editor/editor-shell.tsx"
related_targets: ["frontend/components/studio/editor/slide-canvas.tsx","frontend/components/studio/editor/editor-toolbar.tsx","frontend/components/studio/editor/data-block-editor.tsx","frontend/components/studio/editor/slide-rail.tsx"]
---

# Slide editor

Mode: Operate. Existing GoDeck surface; code-led extension with a user-pinned Pitch
interaction model. Preserve authentication, save conflict protection, AI proposal
review, draft recovery, template artwork, and export. No new marketing claims.

## Direction contract

THESIS: Work on the slide itself. Remove the inspector and competing right-side tabs;
selection exposes formatting without taking the user away from the canvas.

OWN-WORLD: Inherit GoDeck's blue actions, dark ink, locally hosted Inter, quiet neutral
workspace, white toolbar, and restrained borders. The presentation retains its own
template background and typography, independent of application chrome.

STORY: Choose a slide, double-click text, type in place, format the selected text box,
then see autosave confirmation. AI remains an optional, reviewable assistant.
Export offers editable PowerPoint or a visual PDF copy; hidden PDF slides are opt-in.
Reordering updates existing template folios immediately, without adding a number to an unnumbered cover.

FIRST VIEWPORT: A compact document toolbar spans the top, with a separate insertion
row below it: “Текст”, “Изображение”, “Таблица”, “Графики” (bar, line, doughnut),
and “Блоки” (KPI, comparison). Slide thumbnails occupy the
left rail; the large 16:9 slide owns the center; only AI chat occupies the collapsible
right column. A stable contextual formatting row sits above the canvas. Data editing
uses an in-flow bottom region below the still-visible canvas, not a popup or another
right-side inspector. Mobile keeps the slide and uses a chat sheet outside data
editing, with local tool-row/grid scrolling rather than page overflow.

FORM: User-pinned familiar presentation-editor composition, not a new visual world.
seed: none (user-pinned direction; no roll required).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Limits: formatting applies to the selected PowerPoint text box, not arbitrary rich-text
character ranges. Fonts must remain local/system fonts; never depend on Google Fonts.
PDF is a visual copy without selectable text. Its pages follow the selected visible/all-slide order.
Publishing and downloading remain separate: conversion retry must not publish an extra version.
Tables, grouped bars, KPI / big numbers, comparisons, category lines, and single-series
doughnuts share the existing rectangular dataset and geometry. “Таблица” inserts a
table; “Графики” and “Блоки” open their type menus in the separate top insertion row.
All six types open the same nonmodal bottom grid on insertion, double-click, or
“Изменить данные”. Valid local drafts preview live on the canvas without modifying
the canonical deck. Invalid inputs stay local and disable Apply; their preview falls
back to the saved slide/block rather than rendering invalid data. “Применить”,
Ctrl/Meta+Enter, or Ctrl/Meta+S commits a valid draft as one undo step. “Отмена”, X,
or Escape discards it. Incompatible view changes never silently discard data.

While the grid is open, the canvas, slide navigation, other editor actions, AI, and
export are inert to prevent applying a draft to another slide. The document/insertion
and contextual toolbars and desktop slide rail are muted. The mobile thumbnail rail
is hidden and mobile chat closes. Crossing from desktop to mobile while editing data
also suppresses the chat sheet, even if chat was explicitly reopened on desktop.
The grid remains an in-flow region, not a modal
dialog; its cells and controls scroll locally, including horizontal scroll on mobile,
without document overflow. Browser unload warns while this local draft is open, but
unapplied cell edits are not persisted or recoverable. Apply enters the unchanged
canonical autosave, undo, and recovery flow; do not describe the panel as autosaving.

Blocks move/resize on the canvas and appear in thumbnails. Insertion does not
rearrange existing content; overlap requires manual positioning, not automatic layout.
Use existing GoDeck controls without a new inspector or new design tokens.

Data limits: 12 rows, 6 columns, 160 characters per cell, and 10 blocks per slide.
KPI uses one row/two columns, with label/value limits of 80/40 characters and units allowed.
Comparisons use a criteria column plus 2–5 alternatives. Bars and lines support 1–5 numeric
series, including negative/zero values; only bars offer horizontal orientation. Lines
connect categories in row order, not an XY/date axis. Doughnuts require exactly two
columns, non-negative values, and a positive total.

Initial generation and whole-deck chat from `/studio/` understand data blocks; the editor's
right-side contextual AI remains text-only. PPTX retains native KPI text boxes,
table/comparison cells, and bar/line/doughnut charts with embedded workbooks. PDF paints
GoDeck charts as a visual copy. Browser/native KPI rendering preserves natural glyph
proportions when fitting resized blocks; table/comparison row heights are uniform.

When publication is confirmed but downloading fails, say the version is saved and the file
was not downloaded; an uncertain commit retains the existing publication-check safeguards.

Template text projects source top/center/bottom vertical alignment as read-only styling
for the entire paragraph flow on the canvas and in thumbnails, preserving source geometry.
This includes the Opal TITLE's bottom anchor (`bodyPr anchor="b"`); custom or legacy text
without the projection defaults to top. Alignment adds no formatting control or persistent
document field and does not modify native PPTX styling. It is not a whole-slide pixel-parity
or automatic-layout guarantee; inserted blocks still need a placement check.

Evidence: current `editor-toolbar.tsx`, `data-block-editor.tsx`, `editor-shell.tsx`,
and `slide-rail.tsx`; captured desktop, mobile, mobile-grid, and chart-menu views in
`frontend/.impeccable/review/data-panel/chromium-*.png`. The incumbent `DESIGN.md`,
`.impeccable/design.json`, and shared tokens remain unchanged; this is an Operate
extension of the existing blue/neutral, local-font system, not an identity replacement.

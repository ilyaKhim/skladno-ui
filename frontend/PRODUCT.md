# GoDeck

GoDeck is a Russian-language web application for creating AI-assisted presentations,
reviewing their structure, editing slides, and exporting editable PowerPoint files
or visual PDF copies for viewing and printing. PDF text is not selectable or searchable;
hidden slides are excluded unless explicitly included.
Source materials can be supplied as PDF, DOCX, and TXT. The application uses its own
predefined PowerPoint templates; arbitrary PowerPoint import is not promised by the editor.

The editor preserves source-template artwork and supports text, uploaded images, slide
ordering, visibility, undo/redo, draft autosave, recovery, and explicit publication.
AI suggestions must remain reviewable before application. Authentication stays server-side.
Template text retains its source top, center, or bottom vertical alignment in the canvas
and thumbnails, without changing source geometry. This is read-only template styling,
not a new formatting control; custom and legacy text defaults to top alignment.

Tables, grouped bars, KPI / big numbers, comparison matrices, category line charts,
and single-series doughnuts share an editable rectangular dataset. A nonmodal grid
opens in the workspace below the still-visible canvas for insertion, double-click,
or **Изменить данные**. Valid local changes preview on the canvas without changing
the saved document; invalid input stays in the grid and the canvas shows the saved
block instead. Applying valid data is one undo step; **Отмена**, X, or Escape
discards the local draft. Ctrl/Meta+Enter or Ctrl/Meta+S applies a valid draft.
Compatible view changes never silently discard data. Line points follow
row order, not an XY/date axis; doughnuts require non-negative values and a positive
total. KPI values may include units. Blocks retain canvas movement/resizing,
duplication, deletion, autosave, and recovery after Apply. Unapplied cell edits are
not autosaved or recoverable; leaving the page while the grid is open triggers the
browser's unload warning. While editing data, other editor actions, slide navigation,
AI, and export are inactive so the draft cannot apply to a different slide. Insertion
does not rearrange existing content; users must check and adjust placement. PPTX exports native KPI text boxes,
table/comparison cells, and charts with embedded workbooks; PDF remains visual.
Initial generation and whole-deck chat understand data blocks, but the editor's
right-side contextual AI remains text-only. Formulas, merged cells, automatic layout,
and arbitrary PPTX import are outside this iteration.

Existing template folios follow the current slide order from 1 in the editor and
exported files, preserving their styling; unnumbered covers remain unnumbered.
PDF numbers follow exported page order. Export publishes a version before downloading
that exact version; a failed PDF download can retry it without republishing unchanged work.

The personal workspace at `/studio/` opens recent presentations with a sidebar,
recognisable covers, and separate creation and template views, inspired by Pitch.
Search, status filters, and sorting apply to the latest 20 loaded projects, not a
global search API. Creation retains AI, PDF/DOCX/TXT materials, and supplied LLM
responses. Versions, whole-deck chat, and AI logs remain available in collapsed details.
Folders and teamspaces are outside this iteration.

The editor retains thumbnails on the left, a large directly editable slide, a compact
contextual formatting row, and AI chat as the only right-side panel. A separate top
insertion row contains **Текст**, **Изображение**, **Таблица**, **Графики**
(bar, line, doughnut), and **Блоки** (KPI, comparison), using the familiar Pitch-like
menu composition without changing GoDeck's identity. The bottom data grid scrolls
locally on narrow screens without widening the page. While it is open, the top and
contextual toolbars and desktop slide rail are muted; the mobile thumbnail rail is
hidden and mobile chat closes; a desktop-to-mobile resize cannot show the chat sheet
over an open data grid. Keep GoDeck branding, Russian copy, existing persistence
semantics, and editable PPTX export. The visible
private Pitch dashboard was inspected through a read-only window capture after full
access was enabled; its narrow captured panel does not establish exact desktop parity.
Do not copy Pitch assets or personal content, or claim pixel-perfect matching.

This records the user's current requirements and existing application behavior, not
an unconfirmed audience profile or a new global design preference.

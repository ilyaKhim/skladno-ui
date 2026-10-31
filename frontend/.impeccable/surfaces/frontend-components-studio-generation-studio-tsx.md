---
target: frontend/components/studio/generation-studio.tsx
related:
  - frontend/components/studio/studio-library.tsx
  - frontend/components/studio/studio-templates.tsx
  - frontend/components/studio/studio-navigation.tsx
  - frontend/components/studio/presentation-card.tsx
  - frontend/components/studio/presentation-cover.tsx
mode: Operate
---

# Personal workspace

User-confirmed scope: a Pitch-like personal dashboard with sidebar navigation,
presentation covers, and separate creation. No folders or teamspaces in this iteration.
The authenticated Pitch tab was initially inaccessible. After the user enabled full access,
its visible private dashboard was inspected through a read-only window capture: sidebar
search/navigation, creation actions, and covers with names below. The panel was narrow;
exact desktop pixel parity is not claimed. Do not copy Pitch assets or personal content.

## Direction contract

THESIS: Open your work first, not a generation form. A presentation's real first slide
is its recognisable entry point; AI and technical details no longer dominate the library.

OWN-WORLD: Keep GoDeck's local Inter/Manrope, ink text, blue actions, neutral workspace,
white surfaces, and existing control primitives. Template artwork remains template-owned.

STORY: Find a recent presentation, search/filter/sort the loaded results, open the editor,
or create with AI/materials/a supplied LLM answer. Versions, whole-deck chat and AI logs
remain available behind explicit details; no decorative or unsupported controls.

FIRST VIEWPORT: A compact left navigation on desktop, a light workspace with title and
new-presentation action, search and status filters, then a responsive three-column cover grid.
Mobile navigation becomes horizontal and cards stack without horizontal document overflow.

FORM: User-pinned presentation workspace; code-led within the incumbent visual system.
seed: no roll: user-pinned reference. No concept roll, concept comp, or catalog card applies
to this ordinary extension. Signature interaction: the same saved first slide appears in
the library and editor; navigation preserves unfinished creation fields in memory.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Constraints: preserve server authentication, polling, idempotent creation, document-job
recovery and explicit publication. Search covers the latest 20 loaded projects, not a
new global search API. Broken/missing previews must not prevent opening a project.

## Implemented scope and evidence

`/studio/` is the recent library; `?view=create` and `?view=templates` select the other
sections. The creation form stays mounted while sections change, preserving its fields
in memory only, not across reloads. Template selection opens creation with that template.
The desktop sidebar becomes horizontal navigation below the large breakpoint; the cover
grid uses one, two, then three columns. Cards use the incumbent white surfaces, neutral
borders, rounded corners, blue focus states, and muted supporting text, without introducing
a new global visual system.

Ready and draft cards lazily fetch their visible saved first slide and render it through
the editor's `SlideSurface`. Other states explicitly label template previews; unavailable
covers do not remove the editor link. Catalog previews use real first-slide background
artwork, not generated or borrowed dashboard imagery. Editor links remain native document
navigation so browser Back protection for unsaved work is preserved. Versions, whole-deck
chat, provider logs, downloads, and cancellation remain available in their applicable states.

Evidence checked: `generation-studio.tsx`, `studio-navigation.tsx`, `presentation-card.tsx`,
`presentation-cover.tsx`, `app/studio/page.tsx`, the loaded-list helper/client, global styles,
and the incumbent `DESIGN.md` / `.impeccable/design.json`. Rendered captures in
`.impeccable/review/studio/`: `desktop.png`, `mobile.png`, `details.png`, `creation.png`,
`creation-mobile.png`, `templates.png`, `empty-mobile.png`, and `error-mobile.png`.
These show the implemented workspace and its responsive/state handling, not exact Pitch parity.
The global design files remain unchanged: this is an extension of the existing system.

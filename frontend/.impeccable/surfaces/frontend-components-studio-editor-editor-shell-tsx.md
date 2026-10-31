---
version: 1
slug: "frontend-components-studio-editor-editor-shell-tsx"
primary_target: "frontend/components/studio/editor/editor-shell.tsx"
related_targets: ["frontend/components/studio/editor/slide-canvas.tsx","frontend/components/studio/editor/editor-toolbar.tsx"]
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

FIRST VIEWPORT: A compact document toolbar spans the top. Slide thumbnails occupy the
left rail; the large 16:9 slide owns the center; only AI chat occupies the collapsible
right column. A stable contextual formatting row sits above the canvas. Mobile keeps
the slide and uses a chat sheet, with tool-row scrolling rather than page overflow.

FORM: User-pinned familiar presentation-editor composition, not a new visual world.
seed: none (user-pinned direction; no roll required).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Limits: formatting applies to the selected PowerPoint text box, not arbitrary rich-text
character ranges. Fonts must remain local/system fonts; never depend on Google Fonts.

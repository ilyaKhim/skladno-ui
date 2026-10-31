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
formatting toolbar, and AI chat as the only right-side panel. Keep GoDeck branding,
Russian copy, existing persistence semantics, and editable PPTX export. The visible
private Pitch dashboard was inspected through a read-only window capture after full
access was enabled; its narrow captured panel does not establish exact desktop parity.
Do not copy Pitch assets or personal content, or claim pixel-perfect matching.

This records the user's current requirements and existing application behavior, not
an unconfirmed audience profile or a new global design preference.

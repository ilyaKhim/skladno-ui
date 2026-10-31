---
name: GoDeck
description: Observed GoDeck application colors, typography, and reusable interface primitives.
colors:
  background: "#f7f7f5"
  foreground: "#142033"
  card: "#ffffff"
  primary: "#335cc5"
  primary-hover: "#294da6"
  secondary: "#e6edf8"
  muted: "#eef0f2"
  muted-foreground: "#5b6675"
  accent: "#d7f36a"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "#d9dee7"
  navy: "#162d4e"
  navy-foreground: "#f5f7fb"
  tint-sage: "#e6eee3"
  tint-apricot: "#f6e8db"
typography:
  headline:
    fontFamily: "Manrope Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: "2rem"
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  2xl: "1.125rem"
  3xl: "1.375rem"
  full: "calc(infinity * 1px)"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "2.5": "0.625rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.card}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  button-destructive:
    textColor: "{colors.destructive}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0.25rem 0.625rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.5}"
  navigation-link:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.sm}"
  category-chip:
    rounded: "{rounded.full}"
    padding: "0.5rem 1rem"
---

# Design System: GoDeck

## Overview

This is a scan of the existing GoDeck interface, not a replacement identity. Blue primary actions, dark ink, light neutral surfaces, small lime markers, and locally hosted Inter and Manrope are established in the application source. No new brand metaphor or qualitative direction is specified here.

The shared system covers application chrome and reusable controls. Presentation artwork and slide typography remain template-owned. Editor composition and formatting limits are recorded in `.impeccable/surfaces/frontend-components-studio-editor-editor-shell-tsx.md`, not generalized into rules for every route.

Key characteristics:

- Blue actions and selection feedback over light neutral surfaces.
- Inter interface text with Manrope headings and wordmark.
- Bordered, rounded controls; white content surfaces; limited shadows.

## Colors

The frontmatter records distinct source colors; repeated semantic aliases share those values in `app/globals.css`.

### Primary

Blue (`primary`) identifies primary actions, focus, selection, and links. `primary-hover` is an existing darker action token; individual components determine whether it is used. The shared Button's default variant does not define a button hover fill; its anchor form uses primary at 80% opacity.

### Secondary

Soft blue (`secondary`) supports secondary controls and selected formatting controls. The existing `field` and `tint-blue` aliases use the same color. Lime (`accent`) is reserved by the global stylesheet for small markers, underlines, and diagram details. Sage and apricot tints surround product mockups, not ordinary fields.

### Neutral

`background` is the page/workspace canvas; `card` also supplies popovers and white foregrounds on primary actions. `foreground` supplies dark text; `muted-foreground` supplies secondary text. `muted` supplies control hover fills. `border` also supplies input borders. Navy and its light foreground form the existing dark marketing sections. Destructive red marks errors and destructive actions.

## Typography

Inter Variable is the body and control family. Manrope Variable is the display family, applied globally to first- through fourth-level headings and explicitly to the wordmark. Both are loaded from local font packages in `app/layout.tsx`; no external font request is needed.

The frontmatter captures the observed base body, button label, auth title, and example-section headline roles. The headline increases on medium screens; the landing hero has its own viewport-dependent sizing. These are component roles, not a new universal modular scale. Compact editor labels also use the existing small and extra-small text sizes. Slide fonts remain independent of application fonts.

## Layout

Public-page containers commonly center at a maximum width of 72rem, with side padding of 1.25rem increasing to 2rem at the medium breakpoint. Reused spacing follows the existing quarter-rem utility rhythm; compact controls also use half-step gaps and padding.

Responsive behavior is component-specific: the public header switches from a collapsible menu to desktop navigation at 1024px; gallery category chips become a vertical list at 768px. The editor uses a full-height workspace with its own rail, canvas, and chat adaptations. Preserve those local behaviors rather than forcing one page grid on every surface.

## Elevation & Depth

Borders and surface color carry most separation. Auth and presentation cards use the small utility shadow; template cards strengthen the shadow and move upward on hover. Popovers use a larger shadow. The named slide shadow is a two-layer cool shadow defined in `app/globals.css`; its exact value is captured in the sidecar. The public header gains a border and small shadow after scrolling.

State transitions are generally color, shadow, or transform transitions. The existing reduced-motion stylesheet shortens transitions and animations and disables smooth page scrolling; retain that accommodation.

## Shapes

The radius scale derives from the existing base radius. Standard buttons and inputs use `lg`; compact buttons use `md`; cards commonly use `2xl`; popovers use `xl`. Chips and status badges use fully rounded ends. Thin borders define fields, separators, cards, and floating surfaces. The editor may use smaller corners for slide thumbnails without changing this shared scale.

## Components

### Buttons

The shared Button exposes default, outline, secondary, ghost, destructive, and link variants, with default, extra-small, small, large, and icon sizes. The default height is captured above; the smallest size is 1.5rem and the large size is 2.25rem. Focus-visible uses a blue border and a three-pixel half-opacity ring. Disabled controls reduce opacity and reject pointer interaction. Non-popup buttons move down one pixel while pressed. Destructive and invalid states use their existing red treatments. Preserve each variant's actual hover behavior rather than applying a generic darkening rule.

### Chips

Mobile gallery category chips are fully rounded, uppercase, and semibold. On the navy section, inactive chips have a low-opacity light fill and border; the active category uses blue with white text. Focus uses an offset blue ring. These are gallery controls, not a universal status-badge style.

### Cards / Containers

Auth and presentation cards share white fill, a neutral border, generous rounded corners, small shadows, and base padding from the card token. Auth padding expands on small screens. Template cards additionally clip their preview, separate it from the title with a border, and provide hover/focus feedback because the whole card is a link.

### Inputs / Fields

The shared Input has a transparent fill, neutral border, compact height, and rounded corners. Text is one rem on small screens and the label size from the medium breakpoint. Placeholders use muted text. Focus-visible uses the same blue border and three-pixel ring as buttons. Disabled fields gain a muted fill and reduced opacity; invalid fields use destructive borders and rings. Larger auth fields are existing local overrides.

### Navigation

Desktop header links use muted interface text, darken on hover, and underline the active template route. Mobile links become padded rows with a minimum height of 2.75rem and a muted hover fill. The header supports menu dismissal and focus return. Keep visible focus and current-page semantics in both presentations.

## Do's and Don'ts

### Do:

- Do reuse the existing semantic colors, radius scale, local fonts, and component variants.
- Do retain keyboard focus, disabled, invalid, current-page, and reduced-motion states.
- Do keep presentation artwork and fonts independent of application chrome.
- Do consult the existing surface brief for editor-only composition and formatting constraints.

### Don't:

- Don't replace GoDeck branding or introduce a new identity through a component refinement.
- Don't turn the lime marker into a replacement primary-action color.
- Don't remove established state feedback when translating a component to another surface.

<!-- Evidence: app/globals.css; app/layout.tsx; components/ui/{button,input,popover}.tsx;
components/site-header.tsx; components/wordmark.tsx; components/examples.tsx;
components/auth/auth-card.tsx; components/templates/template-card.tsx;
components/studio/presentation-card.tsx; components/studio/editor/{editor-shell,editor-toolbar}.tsx;
reviewed desktop.png and mobile-chat.png in .impeccable/review/.
The sidecar contains documentation previews, not application behavior. -->

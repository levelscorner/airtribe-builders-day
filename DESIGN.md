---
name: Chotu Web Studio
description: A quiet cool-white studio for shaping a video through conversation.
colors:
  paper: "#f8f9fb"
  surface: "#fff"
  rail: "#eff1f5"
  ink: "#242932"
  muted: "#656c79"
  line: "#e2e5eb"
  accent: "#425c9b"
  accent-soft: "#eaf0fd"
  accent-hover: "#354d86"
  secondary: "#edf0f6"
  secondary-ink: "#3d4d6b"
  secondary-hover: "#e2e8f3"
  summary: "#eff2f8"
  canvas: "#f0f2f6"
  danger: "#a53b42"
typography:
  display:
    fontFamily: '"Instrument Serif", Georgia, serif'
    fontSize: "66px"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-1.6px"
  headline:
    fontFamily: '"Instrument Serif", Georgia, serif'
    fontSize: "39px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.6px"
  title:
    fontFamily: '"DM Sans", sans-serif'
    fontSize: "23px"
    fontWeight: 500
    letterSpacing: "-0.45px"
  body:
    fontFamily: '"DM Sans", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: '"DM Sans", sans-serif'
    fontSize: "10px"
    fontWeight: 500
    letterSpacing: "0.7px"
rounded:
  chip: "6px"
  control: "10px"
  choice: "11px"
  media: "12px"
  summary: "15px"
  configuration: "18px"
  composer: "24px"
  home-composer: "26px"
  round: "50%"
spacing:
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "18": "18px"
  "20": "20px"
  "24": "24px"
  "26": "26px"
  "34": "34px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "11px 17px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-ink}"
    rounded: "{rounded.control}"
    padding: "11px 17px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-text:
    textColor: "{colors.muted}"
    padding: "8px 0"
  composer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.composer}"
    padding: "16px 18px 12px"
  navigation-item:
    rounded: "{rounded.control}"
    padding: "8px 12px"
  selection-chip:
    backgroundColor: "{colors.accent-soft}"
    textColor: "#56647b"
    rounded: "{rounded.chip}"
    padding: "4px 9px"
  configuration:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.configuration}"
    padding: "25px 26px 22px"
  configuration-summary:
    backgroundColor: "{colors.summary}"
    rounded: "{rounded.summary}"
    padding: "22px 24px"
  frame-preview:
    rounded: "{rounded.media}"
---

# Design System: Chotu Web Studio

## Overview

**Creative North Star: "Quiet cool-white studio"**

Chotu's web studio gives an idea room to become a video. Cool white surfaces, graphite reading text, and desaturated blue actions keep attention on the creator's words and reviewable artifacts. The user chose the clarity of ChatGPT and Gemini as the web reference; this is an independent visual system from native mobile.

DM Sans carries the interface and conversation. Instrument Serif brings a human editorial note to the opening question and canvas introduction. Generous empty space, restrained borders, and modest surface changes keep the interface calm while imagery supplies the visual richness.

**Key Characteristics:**
- Cool white surfaces with graphite text and muted blue interactions.
- Spacious reading areas with compact supporting controls.
- Serif display moments surrounded by plain sans-serif UI.
- Flat conversation content, softly lifted composers, and clearly separated review surfaces.

This document records the current implementation in `apps/mobile/src/web/studio.css`, `fonts.css`, and `StudioWeb.tsx`, informed by `PRODUCT.md` and `.impeccable/web-surface.md`. It does not certify browser behavior, contrast conformance, or live generation. Media and credits currently shown in the preview are samples for testing the interface; the teammate-owned Higgsfield integration remains a separate acceptance step.

## Colors

The palette is cool and low-chroma; blue identifies interaction without coloring every surface.

### Primary
- **Muted Studio Blue** (`accent`): primary approvals, active controls, caret, focus outline, and the wordmark dot. Its deeper hover companion strengthens the same action.
- **Blue Mist** (`accent-soft`): selected context, hover fills, and compact configuration selections.

### Neutral
- **Cool Paper** (`paper`): the continuous workspace background.
- **White Surface** (`surface`): composers, configuration, choices, and input fields.
- **Quiet Rail** (`rail`): persistent navigation separation.
- **Graphite** (`ink`): primary copy and the compact send button.
- **Slate** (`muted`): secondary explanations, captions, and metadata.
- **Cool Divider** (`line`): fine boundaries between structural regions.
- **Secondary Surface / Secondary Ink** (`secondary`, `secondary-ink`): low-emphasis filled actions; the hover surface deepens slightly.
- **Plan Wash** (`summary`): the completed configuration summary.
- **Canvas Gray** (`canvas`): the visual review workspace and inspector.

The functional **Error Red** (`danger`) identifies errors. Preserve readable secondary text; the current source darkens muted labels rather than treating reduced opacity as the only hierarchy tool.

**The Quiet Accent Rule.** Use blue for actions, focus, selection, and a few display accents; keep continuous reading text graphite.

## Typography

**Display Font:** Instrument Serif, with Georgia and serif fallbacks. Local regular and italic faces use weight (400).

**Body Font:** DM Sans, with the browser sans-serif fallback. Local faces are available at weights (400, 500, 600, 700). This web font setup is independent of native mobile. The stylesheet does not bundle a dedicated Devanagari font; Hindi rendering relies on browser fallback and still needs visual verification.

### Hierarchy
- **Display:** the opening question uses the frontmatter display role; at widths up to (760px) it becomes (50px), then (48px) up to (450px). Italic emphasis remains weight (400).
- **Headline:** the canvas introduction uses the frontmatter headline role, with explicit responsive sizes (34px), (38px), and (35px) at its existing breakpoints.
- **Title:** the current configuration question uses the frontmatter title role and becomes (21px) up to (760px). Script headings are quieter at (19px), weight (500).
- **Body:** the conversation uses the frontmatter body family and size. Assistant prose and script narration open to line-height (1.85); the first submitted prompt is (21px) with line-height (1.6) on desktop.
- **Label:** scene metadata uses the frontmatter label role with uppercase text. Other supporting UI generally spans (11–13px), with sample and canvas metadata as small as (9–10px) in the current source.

**The Two Voices Rule.** Reserve Instrument Serif for display introductions; use DM Sans for decisions, conversation, labels, and controls.

## Layout

The application fills (100dvh). A compact left rail is (68px) wide, expanding to (260px). The desktop top bar is (78px) high. The home content caps at (760px); the conversation reading column caps at (720px), with a persistent composer below its independently scrolling history. Common gaps are (8px), (12px), (18px), and (24px); desktop conversation side padding is (34px).

The review canvas opens at the right to (59%) of the workspace, changing to (57%) from (1500px) upward and (55%) up to (1150px). These are explicit source values, not a universal grid. It has its own scroll region, three-column frame overview, and two-column character cards; the latter become one column at the intermediate desktop breakpoint.

At widths up to (760px), the canvas occupies the workspace and the conversation is hidden while it is open. A visible "Back to chat" control returns to the conversation. The rail narrows to (52px) and expands as an overlay. At widths up to (450px), the default rail disappears and mobile controls provide access to navigation and a new conversation. The completed plan stays a two-column description list with wrapping values.

Keep these web surface details in sync with `.impeccable/web-surface.md`; they describe this composition, not a required layout for every future product surface.

## Elevation & Depth

Depth comes chiefly from tonal layering: paper, white input surfaces, a quieter rail, and a gray review canvas. The composer has a diffuse resting shadow (`0 6px 28px rgba(41, 53, 80, 0.055)`) and a slightly stronger focus shadow (`0 5px 30px rgba(55, 78, 124, 0.1)`). The conversation composer instead has a fine border and no shadow. Configuration and summary surfaces remain flat.

Motion supports orientation. The submitted idea rises into place over (0.55s); the canvas fades over (0.4s) and translates over (0.6s), using the studio easing curve (`cubic-bezier(0.16, 1, 0.3, 1)`) for movement. Configuration content enters over (0.3s). The reduced-motion media query removes animations and transitions and restores automatic scrolling behavior.

**The Restrained Depth Rule.** Use tonal separation for reading and review surfaces; keep the diffuse lift concentrated on the composer.

## Shapes

Controls use gently rounded corners: (10px) for primary and secondary buttons, (11px) for choices, (12px) for media containers, (18px) for the active configuration box. The composer is softer at (24px), rising to (26px) on desktop home and reducing on narrow screens. Compact selection chips use (6px); send and icon controls are circular. Boundaries are thin and cool rather than heavy outlines.

Frame previews and the inspector use a portrait (9:16) viewport. Sample storyboard sprites use `background-size: 300% auto`; character sprites keep a (1:2) aspect ratio. Preserve image proportions as review surfaces resize. Current real frame images use `object-fit: cover`, so the viewport may crop their edges; these rules do not establish support for every generated output ratio.

## Components

### Buttons

Compact and direct. Primary actions use Studio Blue with white text, padding (11px 17px), weight (500), and minimum height (42px); narrow screens up to (450px) raise the minimum height to (44px). Secondary actions use the cool secondary fill and dark blue-gray text. Text actions use muted text and become blue on hover. The circular send control is graphite at rest and blue on hover.

The shared keyboard treatment is a (2px) blue outline offset by (4px). Disabled buttons reduce opacity to (0.45); the send button has an explicit pale disabled fill and readable gray icon instead. Retain accessible names for icon-only actions.

### Inputs / Fields

The composer is a white, borderless rounded surface with an auto-sized textarea, attachment row, and send action. Its focus treatment is applied to the container through `:focus-within`; the textarea suppresses its individual outline. The conversation version replaces lift with a fine border. Supporting profile inputs use a (46px) high white field, (10px) corners, and the shared focus outline. Reference attachments appear as bordered compact rows with thumbnails, truncation, and removal controls.

### Navigation

A compact rail uses circular icon controls and softly rounded recent-conversation rows. Rows have padding (8px 12px), minimum height (44px), and a pale hover/current fill. Expansion reveals names and recent conversations; narrow layouts use a scrim. Navigation stays visually quieter than the conversation.

### Configuration and Selection Chips

One bordered white box presents the active question. Its contents are replaced as the user answers; completed question-and-answer pairs do not accumulate in the visible transcript. Previous selections remain small blue-tinted chips inside the box. Choices have a fine border and shift to Blue Mist on hover; dimension choices include small proportion icons.

When configuration finishes, one persisted assistant summary presents the choices as a two-column description list in Plan Wash. Keep intermediate intake data available for recovery without recreating it as a stack of visible chat bubbles. The opening submitted prompt remains plain text at the top of the conversation.

### Script Review

The script is structured reading content, with a restrained heading, version selector, scene number and timing metadata, and spacious narration. Approval and request-change actions sit below it. Revision confirmation displays the note and estimated sample-credit cost before submission. Script approval precedes the visual review stage; current preview media remains explicitly labeled as sample content.

### Visual Canvas and Inspector

The canvas gives frames, characters, scenery, and later media a wider review area. Frame titles and captions sit below the images; index, expand, and approved indicators stay compact. The inspector enlarges one frame and exposes approval and revision controls.

The current implementation makes the closed canvas inert. Opening an inspector makes the underlying canvas overview inert, moves focus to "Back to canvas", and returns focus to the originating frame when the inspector closes. Escape closes the inspector first, then the canvas. The narrow canvas loops Tab among its visible controls. These are implemented behaviors awaiting browser verification, not a completed accessibility certification.

## Do's and Don'ts

### Do:
- **Do** use the web palette and local web font roles independently from the native mobile theme.
- **Do** keep submitted prompts plain and preserve one active configuration box followed by one completed plan summary.
- **Do** keep primary text graphite, secondary text readable, and interactive focus visibly blue.
- **Do** preserve sample sprite proportions, and label sample artwork and credits honestly.
- **Do** preserve reduced-motion behavior, keyboard access, and clear return controls when surfaces change.

### Don't:
- **Don't** introduce workflow tabs or a setup form into the prompt-first home.
- **Don't** accumulate configuration questions and answers as visible transcript bubbles.
- **Don't** use the serif display face for routine controls or reading text.
- **Don't** stretch sample sprites to fill a mismatched container.
- **Don't** describe sample previews as verified live Higgsfield output.

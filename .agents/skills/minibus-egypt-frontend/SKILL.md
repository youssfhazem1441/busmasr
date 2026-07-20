---
name: minibus-egypt-frontend
description: >
  Frontend skill for the MiniBus Egypt project. Documents the complete UI
  architecture, file structure, component patterns, design system tokens,
  localization approach, animation conventions, and every important
  implementation decision made in index.html, style.css, ui.js, and app.js.
  Read this skill before touching any frontend code in this project.
---

# MiniBus Egypt — Frontend Skill

## Overview

The frontend is a **single-page, mobile-first web app** built with pure
Vanilla HTML, CSS, and JavaScript — no frameworks, no build tools. It is
served by a zero-dependency Node.js `server.js` and loads its route database
from the static file `routes.json` at runtime via `fetch()`.

**Entry point:** `index.html`
**Styles:** `style.css`
**Search logic:** `app.js`
**UI controller:** `ui.js`

---

## File Responsibilities

### `index.html`
- Declares `lang="ar" dir="rtl"` on `<html>` (RTL by default).
- Loads Cairo (Arabic) and Outfit (English) from Google Fonts.
- Contains all semantic HTML sections: header, main (search panel), section (results), footer.
- Includes ad placeholder `<div>` elements (`top-ad`, `bottom-ad`) — leave them in place for future AdSense integration.
- Loads `app.js` before `ui.js` so search functions are available globally when the UI runs.

### `style.css`
Full design system — all tokens live in `:root`. Never use hardcoded color values in component styles; always use CSS variables.

### `app.js`
Contains **pure logic only** — no DOM manipulation. Exports three functions:
- `normalizeArabic(text)` — text normalization for search matching
- `convertArabicNumerals(str)` — Arabic-Indic digit → Western digit conversion
- `searchRoutes(routes, from, to)` — returns `{ direct: [...], transfers: [...] }`

The `module.exports` block is guarded with `typeof module !== 'undefined'` so it runs cleanly in both Node.js (for testing) and the browser (as a plain `<script>`).

### `ui.js`
Contains all DOM interaction, event wiring, rendering, and i18n. Never call DOM APIs from `app.js`. All rendering logic lives here.

---

## Design System (CSS Variables)

```css
--bg:          #f4f5f7;                     /* Page background */
--surface:     #ffffff;                     /* Main card & container background */
--surface-2:   #f4f5f7;                     /* Nested input background */
--surface-3:   #eaecef;                     /* Divider line & border background */

--text-1:      #111827;                     /* Primary text / titles */
--text-2:      #4b5563;                     /* Secondary text / summaries */
--text-3:      #9ca3af;                     /* Muted labels / borders */

--amber:       #f59e0b;                     /* Accent brand color */
--amber-light: #fef3c7;                     /* Soft highlight bg for direct matches */
--amber-dark:  #d97706;                     /* Dark contrast text for direct match labels */

--green:       #059669;                     /* Success color for destination timelines */
--green-light: #d1fae5;                     /* Soft bg for leg 2 labels */

--blue:        #2563eb;                     /* Accent color for transfer points */
--blue-light:  #dbeafe;                     /* Soft bg for transfer hub highlights */

--radius-sm:   8px;
--radius-md:   14px;
--radius-lg:   20px;
--radius-xl:   24px;
```

**Color semantics:**
- Amber = brand accent, route badges, origin stop highlight, Leg 1 details
- Green = destination stops, Leg 2 details
- Blue = transfer point hubs

---

## Typography

| Usage | Font | Weight |
|---|---|---|
| Arabic UI text | Cairo | 500-800 |
| English UI text | Outfit | 500-800 |
| Route badge numbers | Outfit (via `font-family: var(--font-en)`) | 800 |

When language is switched to English, the `<html>` element gets `lang="en" dir="ltr"`. CSS uses `html[lang="en"]` selectors to flip RTL-specific styles (timeline borders, padding, dot positions).

---

## Component Patterns

### Search Panel (`.search-panel`)
Clean card panel container. Contains:
- **From input** (`#from-input`) with clear button (`#clear-from`, `.clear-btn`)
- **Swap button container** (`.swap-btn-container`) positioned absolutely with `left: 0; right: 0; display: flex; justify-content: center;` to prevent RTL coordinate shifting bugs, with SVG icon (`.swap-icon`). Swap re-triggers search if both fields have values.
- **To input** (`#to-input`) with clear button (`#clear-to`)
- **Search button** (`#search-btn`, `.primary-btn`) centered elegantly on the panel.

### Autocomplete Dropdown (`.suggestions-list`)
- Triggers after 2+ characters in an input
- Uses `normalizeArabic()` to match user input against all unique stop names in `routes.json`
- Shows max 8 results
- Clicking a suggestion fills the input and updates the clear button visibility
- Closes on outside click, excluding the clear button itself

### Direct Route Card (`.route-card`)
Rendered by `createDirectRouteCard(match)`. Contains:
- **Header:** Route badge (`.route-badge`) + type label + stop count
- **Direction line:** `match.route.direction`
- **Company line:** `match.route.company`
- **Timeline toggle button** (`.timeline-toggle-btn`): accordion-style
- **Stops timeline** (`.stops-timeline`): generated by `generateTimelineHTML(showFull)`

**Timeline modes:**
- `showFull = false` (default): Shows only stops from origin to destination. Displays a summary count before and after (`timeline-summary-item`) telling the user how many stops are hidden.
- `showFull = true`: Shows all stops in the route. Origin = amber, destination = green, in-between = primary text, outside ride = muted.

Each timeline item uses a `.timeline-dot` `<div>` (not a `::before` pseudo-element) because pseudo-elements cannot be animated independently.

**Entry animation:** Each card animates from `opacity: 0, translateY(12px)` to visible on a 10ms setTimeout.

### Transfer Route Card (`.transfer-card`)
Rendered by `createTransferRouteCard(match)`. Contains:
- **Summary bar** (`.transfer-summary`): shows both route badges with arrow, and the transfer hub stop highlighted in blue (`.hub-name`)
- **Leg 1** (`.leg-card`): shows first route's badge, direction, start/transfer endpoint routing
- **Leg 2** (`.leg-card.leg-two`): shows second route's badge (green), direction, transfer/destination endpoint routing
- Each leg has a colored left/right bar (via `::before` pseudo-element) — amber for leg 1, green for leg 2

---

## Localization (i18n) System

All UI strings live in the `translations` object in `ui.js`:

```javascript
const translations = {
  ar: { title, tagline, fromLabel, fromPlaceholder, toLabel, toPlaceholder,
        searchBtn, directRoutes, transferRoutes, noResults, transferAt,
        stopsText, routeText, companyText, startText, endText,
        directMatch, indirectMatch, toggleStopsShow, toggleStopsHide,
        langBtnText, defaultEmpty, searchingText, stopsBetween,
        stopsBeforeLabel, stopsAfterLabel },
  en: { ... }
}
```

**Switching language:** The `lang-toggle` button swaps `currentLang` between `'ar'` and `'en'`, then calls `setupLanguage()` which:
1. Sets `html[lang]` and `html[dir]` attributes
2. Updates all visible text via `document.getElementById(...).textContent`
3. Preserves the search icon (`.btn-icon-svg`) when updating the search button text
4. Re-runs the search if results are currently visible (so all card text re-renders in the new language)

**Numeral display:** All numerals shown in the UI go through `formatNumeral(num, lang)`:
- `lang === 'ar'`: converts digits to Arabic-Indic (٠-٩)
- `lang === 'en'`: returns Western digits as-is

---

## Animation Conventions

| Element | Animation | How |
|---|---|---|
| Empty state icon | Pulsing scale | `@keyframes pulse` infinite, 2.5s |
| Spinner | Rotation | `@keyframes spin` 0.7s linear infinite |
| Result cards | Fade + slide up | JS inline style, 10ms delay setTimeout |
| Swap button | 180° icon rotate | CSS `.swap-btn.clicked .swap-icon`, removed after 400ms |
| Timeline expand | Opacity/translate fade | `.stops-timeline.transitioning` + 150ms setTimeout |
| Input focus | Color transitions | CSS `:focus-within` |

---

## Important Implementation Notes

### Do NOT use `::before` for timeline dots
The design uses `.timeline-dot` `<div>` elements (not CSS pseudo-elements) because:
- Pseudo-elements cannot have individually controlled `box-shadow` glow per state
- The dot position needs to be absolutely placed inside the flex item
- This makes RTL/LTR flipping via CSS selectors cleaner

### Swap button re-triggers search
When the user clicks swap, if both fields contain values the search runs immediately — this is intentional UX. Do not remove this behavior.

### Timeline "Focus Mode" (default collapsed)
The default state of the timeline is NOT fully collapsed (hidden). It shows only the stops the user will ride (from origin to destination). Stops before/after are summarized with counts. The "Show full timeline" button reveals all route stops. This was a deliberate UX decision: users care about their ride segment, not the full route.

### Clear button shows/hides dynamically
`updateClearButton(input, btn)` is called on every `input` event and on suggestion click. It shows the button when `input.value.trim().length > 0`, hides it otherwise. Don't break this flow.

### Language toggle after search
After toggling language, `performSearch()` is called again if results were visible. This re-renders all cards with translated strings. The `allRoutes` data and `routes.json` are Arabic throughout — only UI chrome is translated, not stop names.

### `parse-data.js` improvements (user-applied)
- `normalizeArabic` now has a fallback: if stripping prefixes leaves an empty array, it returns the original joined words instead of empty string.
- `guessCity` now calls `normalizeArabic()` on the combined text before matching, so spelling variations (أكتوبر vs اكتوبر) are handled correctly.

---

## File Structure Reference

```
MiniBus Egypt/
├── .agents/
│   └── skills/
│       ├── minibus-egypt/
│       │   └── SKILL.md           <- Project context skill
│       └── minibus-egypt-frontend/
│           └── SKILL.md           <- This file (frontend skill)
├── minibus-data.xml               <- Raw data (DO NOT MODIFY)
├── routes.json                    <- Generated: 431 routes
├── parse-data.js                  <- Node.js XML -> JSON parser
├── app.js                         <- Search logic (browser + Node)
├── ui.js                          <- DOM controller, rendering, i18n
├── index.html                     <- App entry point
├── style.css                      <- Full design system
├── server.js                      <- Lightweight local dev server
└── package.json                   <- npm deps (htmlparser2, html-entities)
```

---

## Running the App Locally

```bash
node parse-data.js   # Re-generate routes.json from XML (only needed if data changes)
npm start            # Starts http://localhost:8080/
```

---

## What NOT To Do

- Do NOT add TailwindCSS or any CSS framework
- Do NOT add a bundler (webpack, vite, parcel) — keep it zero-build
- Do NOT use `::before` for timeline dots
- Do NOT manipulate the DOM from `app.js`
- Do NOT hardcode colors — always use CSS variables
- Do NOT show fare/price in the UI (v1 decision)
- Do NOT modify `minibus-data.xml`
- Do NOT add map/GPS — no coordinates in the data

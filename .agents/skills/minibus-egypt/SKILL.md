---
name: minibus-egypt
description: >
  Context skill for the MiniBus Egypt project — a mobile-first web app that
  helps users in Egypt find the right minibus (مينى باص) route by entering
  their current location and destination. This skill contains everything an
  agent needs to understand the project, its data, goals, architecture,
  design decisions, and roadmap before writing any code.
---

# MiniBus Egypt — Project Skill

## What Is This Project?

**MiniBus Egypt (مينى باص مصر)** is a route-finder app for Egypt's informal minibus
transit system. Egypt's minibuses have fixed numbered routes (e.g., Route 80,
Route OC5, Route 309) but no official app, no public map, and no digital system.
Locals only know routes by memory. This app digitizes that knowledge and makes
it searchable for **both locals and newcomers**.

> The core user flow:
> 1. User opens the app on their phone (on the street)
> 2. Types where they are right now ("أنا في...")
> 3. Types where they want to go ("عايز أروح...")
> 4. App returns matching minibus route(s) with the route number, ordered stops, and estimated time

---

## Business Context

- **Type:** Startup idea (not just a hobby project)
- **Monetization:** Google AdSense / Arabic ad networks (ads-first model)
- **Future plans:** Premium features (saved favorites, no ads), partnerships with transport companies
- **Developer:** Solo developer (Youssf)
- **Future platform expansion:** React Native or Flutter mobile app after the web version is stable

---

## Data Source

### File: `minibus-data.xml`
- **Location:** `c:\Users\Youssf\Desktop\MiniBus Egypt\minibus-data.xml`
- **Size:** ~12MB, 91,726 lines
- **Format:** Blogger Atom XML feed from `56w6-mwa9lat.com` (a blog that documents Egyptian minibus routes)
- **Last updated:** October 2024

### Data Structure Per Route Entry
Each `<entry>` in the XML is a blog post representing one route. The HTML-encoded `<content>` field contains:

| Field | Location in Content | Example |
|---|---|---|
| Route title/number | `<title>` tag | `خط سير مينى باص OC5` |
| Direction (A->B) | `<h3>` tag | `الحصرى -> المدرسة اليابانية` |
| Ordered stops | `<div>` (dash-separated) | `6 اكتوبر - الحصرى - مسجد الحصري - الحى الثامن...` |
| Operating company | `<h4>` containing `الشركة` | `مواصلات مصر` |
| Ticket price | `<h4>` containing `سعر التذكرة` | `5 جنية` |
| Route compliance | `<div>` after compliance `<h4>` | `ملتزم بخط السير` |
| Category tag | `<category term='...'>` | `مواصلات مصر` |

### Important Data Notes
- Route numbers appear in **both Arabic-Indic numerals** and **Western numerals** — must normalize both
- Stops are separated by ` - ` (space-dash-space) in Arabic text
- Direction arrow in `<h3>` uses emoji or arrow text to indicate start -> end
- Some routes are from مواصلات مصر (Mwasalat Masr), others from smaller operators
- Coverage: **All of Egypt** — Cairo, Giza, Alexandria, and other governorates
- The data does NOT include GPS coordinates for stops — all matching is text-based
- Fare data exists but **should NOT be shown in v1 UI** (may be outdated, save for v2)

---

## Project Architecture

### Folder Structure
```
MiniBus Egypt/
├── minibus-data.xml          <- Raw data source (DO NOT modify)
├── .agents/
│   └── skills/
│       └── minibus-egypt/
│           └── SKILL.md      <- This file
├── parse-data.js             <- [BUILD FIRST] Node.js XML->JSON parser
├── routes.json               <- [GENERATED] Structured route database
├── index.html                <- Main web app (single page)
├── style.css                 <- Styling
└── app.js                    <- Search logic + UI behavior
```

### Tech Stack
- **Web app:** Vanilla HTML + CSS + JavaScript (no framework for v1)
- **Data pipeline:** Node.js script (`parse-data.js`) to parse XML -> JSON
- **Mobile future:** React Native or Flutter (after web v1 is stable)
- **No backend required for v1** — all data is static JSON loaded client-side

---

## Implementation Phases

### Phase 1 — Data Parser (`parse-data.js`)
Build a Node.js script that:
1. Reads and parses `minibus-data.xml` using a streaming XML parser
2. Decodes HTML entities inside `<content>` tags (double-encoded HTML)
3. For each `<entry>` with `kind#post` category:
   - Extracts the route number from `<title>`
   - Parses the `<content>` HTML to find direction (`<h3>`), stops (`<div>`), company (`<h4> الشركة`), price
   - Normalizes Arabic-Indic numerals to Western numerals in route IDs
   - Splits stop string by ` - ` into an ordered array
4. Outputs `routes.json` — an array of route objects

**Target JSON schema per route:**
```json
{
  "id": "OC5",
  "title": "خط سير مينى باص OC5",
  "direction": "الحصرى -> المدرسة اليابانية",
  "stops": [
    "6 اكتوبر",
    "الحصرى",
    "مسجد الحصري",
    "الحى الثامن",
    "الحى التاسع",
    "مساكن الاتحاد التعاوني",
    "مساكن ابو الوفا",
    "التوسعات الشمالية",
    "المدرسة اليابانية"
  ],
  "company": "مواصلات مصر",
  "price": "5 جنية",
  "city": "6 اكتوبر"
}
```

### Phase 2 — Search Logic (`app.js`)

**Core search algorithm:**
1. User enters `from` and `to` text
2. Normalize input (trim, remove diacritics/tashkeel if any)
3. For each route in `routes.json`:
   - Find all stops that **partially match** `from` -> collect their indices
   - Find all stops that **partially match** `to` -> collect their indices
   - A route is a **direct match** if any `from_index < to_index` exists
4. Rank results:
   - Direct matches first, ordered by fewest stops between from->to
   - Exact match ranked above partial match
5. If no direct routes found -> find **transfer suggestion**:
   - Find routes that pass through `from`, get their stop lists
   - Find routes that pass through `to`, get their stop lists
   - Look for any **shared stop** (transfer point) between the two groups
   - Present as: "Take route X to [shared stop], then take route Y"

**Numeral normalization:**
- When UI is in Arabic mode -> display Arabic-Indic numerals
- When UI is in English mode -> display Western numerals (309)
- Always store internally as Western numerals in `routes.json`

**Matching rules:**
- **Partial substring match** is the standard (typing "حلوان" matches "محطة حلوان")
- Case insensitive, diacritic-insensitive
- Search both `from` and `to` against the `stops` array of every route

### Phase 3 — UI Design (`index.html` + `style.css`)

**Design principles:**
- **Mobile-first** — designed for phone screens (people use it on the street)
- **RTL layout** — Arabic is primary language; `dir="rtl"` on root
- **Dark mode** — Egyptian night aesthetic, easier on eyes outdoors
- **Glassmorphism** cards for results
- **Warm amber/gold accent** — inspired by Egyptian colors (#F5A623, #D4813A)
- **Fast and lightweight** — no heavy frameworks; loads quickly on mobile data

**UI Sections:**
1. **Header** — App logo + name in Arabic and English + language toggle
2. **Search Panel:**
   - Input: "أنا في..." / "I'm at..." (with autocomplete from stop names)
   - Input: "عايز أروح..." / "I want to go to..." (with autocomplete)
   - Big search button
3. **Results Area:**
   - Route card: route number (large badge), company name, direction arrow
   - Visual stop timeline: all stops shown vertically with `from` and `to` highlighted in gold
   - Estimated stop count between from->to
   - Transfer suggestion card if no direct route found
4. **Ad placement zones** (for future monetization — reserve space in layout)
5. **No results** / loading states

**Autocomplete behavior:**
- Triggers after 2+ characters typed
- Shows top 8 matching stop names from the entire `routes.json` stop pool
- Clicking a suggestion fills the input
- Works in both Arabic and English mode

---

## Key Design Decisions (Already Made)

| Decision | Choice | Reason |
|---|---|---|
| Language | Arabic primary + English secondary (toggle) | Target both locals and newcomers |
| Route coverage | All of Egypt | Data covers all cities |
| Search type | Partial substring match | Users know area names, not exact stop names |
| Fare display | Hidden in v1 | Data may be outdated, avoid confusion |
| Numeral display | Matches UI language mode | UX consistency |
| Transfer support | Yes, but secondary | Show direct first, transfer only if no direct route |
| Location input | Free text with autocomplete | No GPS needed; stops have no coordinates in data |
| Platform | Mobile web now, native app later | Solo developer, fastest to market |
| Backend | None for v1 | Static JSON is sufficient; reduces hosting cost |

---

## Verification Checklist

After building each phase, verify:

### Parser (parse-data.js)
- [ ] `routes.json` is generated successfully
- [ ] Number of routes is greater than 200 (expect 300-800+)
- [ ] Route OC5 has correct stops in order
- [ ] Route numbers with Arabic numerals are normalized to Western

### Search Logic
- [ ] Partial match: typing "حلوان" matches stops containing "حلوان"
- [ ] Direction is respected: from must come before to in the stops array
- [ ] Transfer suggestion appears when no direct route exists

### UI
- [ ] App loads on a 375px wide mobile screen
- [ ] RTL layout is correct in Arabic mode
- [ ] Language toggle switches between Arabic and English
- [ ] Autocomplete appears after 2 characters
- [ ] Result cards show route number, stops timeline, direction

---

## What NOT To Do

- Do NOT show fare/ticket price in the UI (v1)
- Do NOT require a backend server for v1
- Do NOT use GPS/geolocation (no coordinate data available)
- Do NOT use TailwindCSS or heavy UI frameworks
- Do NOT modify `minibus-data.xml` directly
- Do NOT add map rendering (no stop coordinates in data)
- Do NOT build the mobile app yet — web first

---

## Future Roadmap (Post-v1)

- v2: Add fare display once data is verified/updated
- v2: Community-editable stop names / corrections
- v2: Save favorite routes
- v3: Live bus tracking (requires partnerships with operators)
- v3: React Native / Flutter mobile app
- Long-term: Premium subscription (no ads, offline mode, saved history)

// MiniBus Egypt - Frontend UI Controller

/* =====================================================================
 * CONTRIBUTION FORMS  (free — powered by Google Forms)
 * ---------------------------------------------------------------------
 * SETUP (one time, no cost):
 *   1. Go to https://forms.google.com and create TWO forms:
 *        • "Report / Correct route info"  (report)
 *        • "Suggest a bus we're missing"  (suggest)
 *   2. For each, click "Send" ▸ the 🔗 link icon ▸ copy the link.
 *      It looks like: https://docs.google.com/forms/d/e/XXXXXXXX/viewform
 *   3. Paste those links below.
 *   4. (Optional) To auto-fill the route on a report: in the report form add a
 *      short-answer question e.g. "Route", then click ⋮ ▸ "Get pre-filled link",
 *      fill a dummy value, copy link, and read the "entry.NUMBERS" id from it.
 *      Put that id in reportRouteEntry below.
 *   Responses collect automatically in each form's linked Google Sheet — open
 *   the form ▸ "Responses" ▸ the green Sheets icon. Works 24/7, even if this
 *   server is off. Leaving a url blank just shows a friendly "coming soon".
 * ===================================================================== */
const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdsag1BNvYn4UFxaPmR6nx3rfiWan3T55nWGE5Tk6_e6TawFQ/viewform';
const FORMS = {
  // Both buttons currently point at the same form. To use two separate forms,
  // just give `suggest.url` its own link.
  report:  { url: GOOGLE_FORM_URL, reportRouteEntry: '' },
  suggest: { url: GOOGLE_FORM_URL }
};

// Brand SVG icon set (inline, theme-colored via currentColor)
const ICONS = {
  // Left-pointing travel arrow (origin → destination in RTL reading order)
  dirArrow: '<svg class="dir-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H4"/><path d="M10 6l-6 6 6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="4"/></svg>',
  uTurn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 0 1 5 5v4"/></svg>'
};

// Renders a "A ⬅️ B" direction string with a crafted SVG arrow instead of the emoji.
function formatDirection(text) {
  if (!text) return '';
  const parts = text.split(/\s*[⬅➡→←↔]️?\s*/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const origin = parts[0];
    const dest = parts.slice(1).join(' ');
    return `<span class="dir-from">${origin}</span>${ICONS.dirArrow}<span class="dir-to">${dest}</span>`;
  }
  return text;
}

// Renders the rider's ACTUAL boarding → alighting stops. This is what a user
// scanning the card cares about first — not the bus line's official endpoints,
// which often run far past where they'll actually get on or off.
function renderTripHeadline(fromStop, toStop) {
  return `<span class="dir-from">${fromStop}</span>${ICONS.dirArrow}<span class="dir-to">${toStop}</span>`;
}

// UI Language State
let currentLang = 'ar'; // Default language

// Loaded database references
let allRoutes = [];
let uniqueStopsList = [];

// DOM Elements
const langToggle = document.getElementById('lang-toggle');
const fromInput = document.getElementById('from-input');
const toInput = document.getElementById('to-input');
const clearFromBtn = document.getElementById('clear-from');
const clearToBtn = document.getElementById('clear-to');
const fromSuggestions = document.getElementById('from-suggestions');
const toSuggestions = document.getElementById('to-suggestions');
const searchBtn = document.getElementById('search-btn');
const swapBtn = document.getElementById('swap-btn');
const loading = document.getElementById('loading');
const emptyState = document.getElementById('empty-state');
const emptyMessage = document.getElementById('empty-message');

const directRoutesSection = document.getElementById('direct-routes-section');
const directRoutesList = document.getElementById('direct-routes-list');
const directRoutesTitle = document.getElementById('direct-routes-title');

const transferRoutesSection = document.getElementById('transfer-routes-section');
const transferRoutesList = document.getElementById('transfer-routes-list');
const transferRoutesTitle = document.getElementById('transfer-routes-title');

// Contribution UI
const suggestBusBtn = document.getElementById('suggest-bus-btn');
const reportInfoBtn = document.getElementById('report-info-btn');
const formModal = document.getElementById('form-modal');
const formModalTitle = document.getElementById('form-modal-title');
const formModalBody = document.getElementById('form-modal-body');
const formModalClose = document.getElementById('form-modal-close');

// Localization Dictionary
const translations = {
  ar: {
    title: "ميني باص مصر",
    tagline: "ابحث عن خط سير الميني باص المناسب لك",
    fromLabel: "أنا في...",
    fromPlaceholder: "اكتب محطة البداية (مثلاً: الحصري)",
    toLabel: "عايز أروح...",
    toPlaceholder: "اكتب وجهتك (مثلاً: رمسيس)",
    searchBtn: "ابحث عن طريق",
    directRoutes: "خطوط مباشرة",
    transferRoutes: "خطوط غير مباشرة (تغيير باص)",
    noResults: "لم نجد خطوط مطابقة لرحلتك. جرب البحث عن أسماء مناطق عامة.",
    transferAt: "تغيير في محطة",
    stopsText: "محطات",
    routeText: "خط سير",
    companyText: "الشركة",
    directMatch: "مباشر",
    reverseNote: "اتجاه العودة",
    indirectMatch: "تغيير باص",
    toggleStopsShow: "عرض خط السير الكامل ▾",
    toggleStopsHide: "تركيز على رحلتي فقط ▴",
    langBtnText: "🇬🇧 English",
    defaultEmpty: "أدخل محطة البداية والنهاية لبدء البحث عن خطوط الميني باص المتوفرة.",
    searchingText: "جاري البحث...",
    stopsBetween: "عدد المحطات:",
    stopsBeforeLabel: "محطات قبل البداية",
    stopsAfterLabel: "محطات بعد النهاية",
    fareText: "التذكرة",
    farePlaceholder: "؟",
    fareHint: "تعرف سعر التذكرة؟ اضغط لإبلاغنا",
    suggestBusBtnText: "اقترح خط باص غير مدرج",
    reportInfoBtnText: "معلومة غير دقيقة؟ صحّحها لنا",
    modalReportTitle: "صحّح معلومة عن خط",
    modalSuggestTitle: "اقترح خط باص جديد",
    modalReportIntro: "لاحظت معلومة غير دقيقة (سعر، محطة، اتجاه)؟ ساعدنا نحسّنها.",
    modalSuggestIntro: "تعرف خط باص مش موجود عندنا؟ قوللنا عنه وهنضيفه.",
    modalComingSoon: "نموذج المساهمة هيكون متاح قريباً. شكراً لاهتمامك! 🙏",
    modalOpenNewTab: "افتح النموذج في صفحة جديدة ↗",
    lineLabel: "الخط:"
  },
  en: {
    title: "MiniBus Egypt",
    tagline: "Find the perfect minibus route for your journey",
    fromLabel: "I am at...",
    fromPlaceholder: "Type origin stop (e.g. Al-Hosary)",
    toLabel: "I want to go to...",
    toPlaceholder: "Type destination stop (e.g. Ramses)",
    searchBtn: "Find Route",
    directRoutes: "Direct Routes",
    transferRoutes: "Indirect Routes (Transfers)",
    noResults: "No routes found matching your journey. Try searching general areas.",
    transferAt: "Transfer at",
    stopsText: "stops",
    routeText: "Route",
    companyText: "Company",
    directMatch: "Direct",
    reverseNote: "Return direction",
    indirectMatch: "Transfer",
    toggleStopsShow: "Show full stops timeline ▾",
    toggleStopsHide: "Focus on my ride only ▴",
    langBtnText: "🇪🇬 عربي",
    defaultEmpty: "Enter your starting stop and destination to find minibus routes.",
    searchingText: "Searching...",
    stopsBetween: "Stops:",
    stopsBeforeLabel: "stops before start",
    stopsAfterLabel: "stops after end",
    fareText: "Fare",
    farePlaceholder: "?",
    fareHint: "Know the fare? Tap to tell us",
    suggestBusBtnText: "Suggest a bus we're missing",
    reportInfoBtnText: "Something wrong? Help us fix it",
    modalReportTitle: "Correct route info",
    modalSuggestTitle: "Suggest a new bus",
    modalReportIntro: "Spotted something off (fare, stop, direction)? Help us improve it.",
    modalSuggestIntro: "Know a bus route we don't list yet? Tell us and we'll add it.",
    modalComingSoon: "The contribution form will be available soon. Thanks for caring! 🙏",
    modalOpenNewTab: "Open the form in a new tab ↗",
    lineLabel: "Line:"
  }
};

// Initialize Application
async function init() {
  setupLanguage();
  setupEventListeners();

  try {
    // Load compiled routes database
    const response = await fetch('routes.json');
    allRoutes = await response.json();

    // Extract list of unique stop names to support autocomplete suggestions
    const stopsSet = new Set();
    allRoutes.forEach(route => {
      route.stops.forEach(stop => {
        if (stop && stop.trim().length > 1) {
          stopsSet.add(stop.trim());
        }
      });
    });
    uniqueStopsList = Array.from(stopsSet);
    console.log(`Loaded ${allRoutes.length} routes and ${uniqueStopsList.length} unique stops.`);
  } catch (error) {
    console.error('Failed to load routes database:', error);
  }
}

// Language and Translation Config
function setupLanguage() {
  const html = document.documentElement;
  html.setAttribute('lang', currentLang);
  html.setAttribute('dir', currentLang === 'ar' ? 'rtl' : 'ltr');

  const trans = translations[currentLang];

  // Set text contents
  document.getElementById('app-title').textContent = trans.title;
  document.getElementById('app-tagline').textContent = trans.tagline;
  document.getElementById('label-from').textContent = trans.fromLabel;
  document.getElementById('label-to').textContent = trans.toLabel;

  fromInput.setAttribute('placeholder', trans.fromPlaceholder);
  toInput.setAttribute('placeholder', trans.toPlaceholder);

  // Keep icon in button
  const btnTextEl = searchBtn.querySelector('.btn-text');
  if (btnTextEl) {
    btnTextEl.textContent = trans.searchBtn;
  } else {
    searchBtn.textContent = trans.searchBtn;
  }

  directRoutesTitle.textContent = trans.directRoutes;
  transferRoutesTitle.textContent = trans.transferRoutes;
  langToggle.textContent = trans.langBtnText;

  suggestBusBtn.innerHTML = ICONS.plus + `<span>${trans.suggestBusBtnText}</span>`;
  reportInfoBtn.innerHTML = ICONS.flag + `<span>${trans.reportInfoBtnText}</span>`;

  if (emptyState.classList.contains('active-search')) {
    emptyMessage.textContent = trans.noResults;
  } else {
    emptyMessage.textContent = trans.defaultEmpty;
  }
}

// Helper to toggle clear button visibility
function updateClearButton(input, btn) {
  if (input.value.trim().length > 0) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

// UI Event Listeners Setup
function setupEventListeners() {
  // Toggle Language Switcher
  langToggle.addEventListener('click', () => {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    setupLanguage();

    // Re-trigger search to update languages of results if visible
    if (!directRoutesSection.classList.contains('hidden') || !transferRoutesSection.classList.contains('hidden')) {
      performSearch();
    }
  });

  // Autocomplete bindings
  setupAutocomplete(fromInput, fromSuggestions, clearFromBtn);
  setupAutocomplete(toInput, toSuggestions, clearToBtn);

  // Clear inputs handlers
  clearFromBtn.addEventListener('click', () => {
    fromInput.value = '';
    clearFromBtn.classList.add('hidden');
    fromSuggestions.classList.add('hidden');
    fromInput.focus();
  });

  clearToBtn.addEventListener('click', () => {
    toInput.value = '';
    clearToBtn.classList.add('hidden');
    toSuggestions.classList.add('hidden');
    toInput.focus();
  });

  // Swap Inputs Button with Animation
  swapBtn.addEventListener('click', () => {
    swapBtn.classList.add('clicked');
    setTimeout(() => swapBtn.classList.remove('clicked'), 400);

    const tempValue = fromInput.value;
    fromInput.value = toInput.value;
    toInput.value = tempValue;

    updateClearButton(fromInput, clearFromBtn);
    updateClearButton(toInput, clearToBtn);

    // Re-trigger search if both inputs had values
    if (fromInput.value.trim() && toInput.value.trim()) {
      performSearch();
    }
  });

  // Contribution buttons
  suggestBusBtn.addEventListener('click', () => openFormModal('suggest'));
  reportInfoBtn.addEventListener('click', () => openFormModal('report'));
  formModalClose.addEventListener('click', closeFormModal);
  formModal.addEventListener('click', (e) => {
    if (e.target === formModal) closeFormModal(); // click on backdrop
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !formModal.classList.contains('hidden')) closeFormModal();
  });

  // Search Action
  searchBtn.addEventListener('click', performSearch);

  // Allow Enter key to trigger search
  [fromInput, toInput].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        performSearch();
        fromSuggestions.classList.add('hidden');
        toSuggestions.classList.add('hidden');
      }
    });
  });

  // Click outside suggestions dropdown to close it
  document.addEventListener('click', (e) => {
    if (!fromInput.contains(e.target) && !fromSuggestions.contains(e.target) && !clearFromBtn.contains(e.target)) {
      fromSuggestions.classList.add('hidden');
    }
    if (!toInput.contains(e.target) && !toSuggestions.contains(e.target) && !clearToBtn.contains(e.target)) {
      toSuggestions.classList.add('hidden');
    }
  });
}

// Autocomplete logic
function setupAutocomplete(inputElement, suggestionsElement, clearBtnElement) {
  inputElement.addEventListener('input', () => {
    updateClearButton(inputElement, clearBtnElement);

    const value = inputElement.value.trim();
    if (value.length < 2) {
      suggestionsElement.classList.add('hidden');
      return;
    }

    const normalizedQuery = normalizeArabic(value);

    // Find matching stops
    const matches = uniqueStopsList.filter(stop => {
      const normalizedStop = normalizeArabic(stop);
      return normalizedStop.includes(normalizedQuery);
    });

    if (matches.length === 0) {
      suggestionsElement.classList.add('hidden');
      return;
    }

    // Render suggestions
    suggestionsElement.innerHTML = '';
    matches.slice(0, 8).forEach(match => {
      const li = document.createElement('li');
      li.textContent = match;
      li.addEventListener('click', () => {
        inputElement.value = match;
        suggestionsElement.classList.add('hidden');
        updateClearButton(inputElement, clearBtnElement);
      });
      suggestionsElement.appendChild(li);
    });

    suggestionsElement.classList.remove('hidden');
  });

  // Re-open suggestions if input is clicked and has text
  inputElement.addEventListener('click', () => {
    if (inputElement.value.trim().length >= 2) {
      inputElement.dispatchEvent(new Event('input'));
    }
  });
}

// Perform Query Search
function performSearch() {
  const fromVal = fromInput.value.trim();
  const toVal = toInput.value.trim();

  if (!fromVal || !toVal) return;

  // Clear previous output views
  directRoutesList.innerHTML = '';
  transferRoutesList.innerHTML = '';
  directRoutesSection.classList.add('hidden');
  transferRoutesSection.classList.add('hidden');
  emptyState.classList.add('hidden');

  // Show spinner
  loading.classList.remove('hidden');

  // Simulate short delay for premium UX
  setTimeout(() => {
    const results = searchRoutes(allRoutes, fromVal, toVal);
    loading.classList.add('hidden');

    const hasDirect = results.direct && results.direct.length > 0;
    const hasTransfers = results.transfers && results.transfers.length > 0;

    if (!hasDirect && !hasTransfers) {
      emptyState.classList.add('active-search');
      emptyMessage.textContent = translations[currentLang].noResults;
      emptyState.classList.remove('hidden');
      return;
    }

    // Results were found: clear the "no results" state so the default empty
    // message shows correctly if the panel is displayed again (e.g. after a
    // language switch).
    emptyState.classList.remove('active-search');

    // Render Direct routes if matches found
    if (hasDirect) {
      results.direct.forEach(match => {
        directRoutesList.appendChild(createDirectRouteCard(match));
      });
      directRoutesSection.classList.remove('hidden');
    }

    // Render Transfer routes
    if (hasTransfers) {
      results.transfers.forEach(match => {
        transferRoutesList.appendChild(createTransferRouteCard(match));
      });
      transferRoutesSection.classList.remove('hidden');
    }
  }, 250);
}

// Format numeral helper based on language
function formatNumeral(num, lang) {
  if (lang === 'ar') {
    return num.toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  }
  return num;
}

// Create Direct Route HTML Card Component
function createDirectRouteCard(match) {
  const trans = translations[currentLang];
  const card = document.createElement('div');
  card.className = 'route-card';

  const numStopsDisplay = formatNumeral(match.stopsCount, currentLang);
  // Route numbers stay in plain Western digits in both languages, like the
  // bold number on a real minibus destination sign — not converted to
  // Arabic-Indic numerals like the rest of the app's text.
  const routeIdDisplay = match.route.id;

  // Visual timelines generator
  const generateTimelineHTML = (showFull) => {
    const stopsCountBefore = match.fromIndex;
    const stopsCountAfter = match.route.stops.length - 1 - match.toIndex;
    let html = '';

    // Render hidden stops count BEFORE start if not showing full
    if (!showFull && stopsCountBefore > 0) {
      const stopsBeforeLabel = currentLang === 'ar'
        ? `... ${formatNumeral(stopsCountBefore, 'ar')} ${trans.stopsBeforeLabel}`
        : `... ${stopsCountBefore} ${trans.stopsBeforeLabel}`;
      html += `<div class="timeline-summary-item before-ride"><span>${stopsBeforeLabel}</span></div>`;
    }

    match.route.stops.forEach((stop, idx) => {
      const isBefore = idx < match.fromIndex;
      const isAfter = idx > match.toIndex;

      // Skip elements outside if we are in collapsed focus mode
      if (!showFull && (isBefore || isAfter)) return;

      let itemClass = 'timeline-item';
      if (idx === match.fromIndex) itemClass += ' origin';
      else if (idx === match.toIndex) itemClass += ' destination';
      else if (idx > match.fromIndex && idx < match.toIndex) itemClass += ' in-between';
      else itemClass += ' outside-ride';

      html += `
        <div class="${itemClass}">
          <div class="timeline-dot"></div>
          <span class="stop-name">${stop}</span>
        </div>
      `;
    });

    // Render hidden stops count AFTER end if not showing full
    if (!showFull && stopsCountAfter > 0) {
      const stopsAfterLabel = currentLang === 'ar'
        ? `... ${formatNumeral(stopsCountAfter, 'ar')} ${trans.stopsAfterLabel}`
        : `... ${stopsCountAfter} ${trans.stopsAfterLabel}`;
      html += `<div class="timeline-summary-item after-ride"><span>${stopsAfterLabel}</span></div>`;
    }

    return html;
  };

  card.innerHTML = `
    <div class="card-header">
      <div class="route-badge-container">
        <span class="route-badge">${routeIdDisplay}</span>
        <span class="route-type-label">${trans.directMatch}</span>
        ${match.reversed ? `<span class="route-type-label reverse-note">${ICONS.uTurn} ${trans.reverseNote}</span>` : ''}
      </div>
      <div class="route-info-meta">
        <span class="stops-count-badge">${trans.stopsBetween} <strong>${numStopsDisplay}</strong></span>
      </div>
    </div>
    <div class="trip-headline">${renderTripHeadline(match.matchedFromStop, match.matchedToStop)}</div>
    <div class="line-subtitle"><span class="line-subtitle-label">${trans.lineLabel}</span> ${formatDirection(match.route.direction)}</div>
    <div class="card-company">${trans.companyText}: <strong>${match.route.company}</strong></div>
    <div class="card-fare">
      <button type="button" class="fare-pill fare-report" title="${trans.fareHint}">
        ${trans.fareText}: <strong>${trans.farePlaceholder}</strong>
      </button>
    </div>

    <button class="timeline-toggle-btn">${trans.toggleStopsShow}</button>
    <div class="stops-timeline collapsed">
      ${generateTimelineHTML(false)}
    </div>
  `;

  // Tapping the "؟" fare opens the correction form pre-filled with this route
  const fareBtn = card.querySelector('.fare-report');
  if (fareBtn) {
    fareBtn.addEventListener('click', () => openFormModal('report', match.route.id));
  }

  // Hook details accordion toggle with micro-animations
  const toggleBtn = card.querySelector('.timeline-toggle-btn');
  const timeline = card.querySelector('.stops-timeline');
  let isTimelineFull = false;

  toggleBtn.addEventListener('click', () => {
    isTimelineFull = !isTimelineFull;
    timeline.classList.add('transitioning');

    setTimeout(() => {
      timeline.innerHTML = generateTimelineHTML(isTimelineFull);
      if (isTimelineFull) {
        timeline.classList.remove('collapsed');
      } else {
        timeline.classList.add('collapsed');
      }
      toggleBtn.textContent = isTimelineFull ? trans.toggleStopsHide : trans.toggleStopsShow;
      timeline.classList.remove('transitioning');
    }, 150);
  });

  // Make card animate entry
  card.style.opacity = '0';
  card.style.transform = 'translateY(12px)';
  setTimeout(() => {
    card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
  }, 10);

  return card;
}

// Create Transfer Route HTML Card Component
function createTransferRouteCard(match) {
  const trans = translations[currentLang];
  const card = document.createElement('div');
  card.className = 'transfer-card';

  // Format numerals
  let totalStops = formatNumeral(match.totalStops, currentLang);
  let leg1Stops = formatNumeral(match.firstLegStops, currentLang);
  let leg2Stops = formatNumeral(match.secondLegStops, currentLang);

  // Route numbers stay in plain Western digits — see createDirectRouteCard.
  const id1 = match.firstLeg.id;
  const id2 = match.secondLeg.id;

  card.innerHTML = `
    <div class="transfer-summary">
      <span class="route-badge-container">
        <span class="route-badge">${id1}</span>
        <span class="arrow-between">${ICONS.dirArrow}</span>
        <span class="route-badge transfer-leg">${id2}</span>
      </span>
      <div class="transfer-hub">
        ${trans.transferAt} <strong class="hub-name">${match.transferStopName}</strong>
      </div>
    </div>

    <div class="legs-container">
      <div class="leg-card">
        <div class="leg-header">
          <div class="route-badge-container">
            <span class="route-badge small">${id1}</span>
            <span class="route-type-label">${trans.routeText} 1</span>
          </div>
          <span class="stops-count-badge">${leg1Stops} ${trans.stopsText}</span>
        </div>
        <div class="trip-headline leg-headline">${renderTripHeadline(match.matchedFromStop, match.transferStopName)}</div>
        <div class="line-subtitle"><span class="line-subtitle-label">${trans.lineLabel}</span> ${formatDirection(match.firstLeg.direction)}</div>
      </div>

      <div class="leg-card leg-two">
        <div class="leg-header">
          <div class="route-badge-container">
            <span class="route-badge transfer-leg small">${id2}</span>
            <span class="route-type-label second-label">${trans.routeText} 2</span>
          </div>
          <span class="stops-count-badge">${leg2Stops} ${trans.stopsText}</span>
        </div>
        <div class="trip-headline leg-headline">${renderTripHeadline(match.transferStopName, match.matchedToStop)}</div>
        <div class="line-subtitle"><span class="line-subtitle-label">${trans.lineLabel}</span> ${formatDirection(match.secondLeg.direction)}</div>
      </div>
    </div>
  `;

  // Make card animate entry
  card.style.opacity = '0';
  card.style.transform = 'translateY(12px)';
  setTimeout(() => {
    card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
  }, 30);

  return card;
}

// ─── Contribution form modal ─────────────────────────────
// Opens an in-app modal. If the matching Google Form URL is configured it is
// embedded; otherwise a friendly "coming soon" message is shown.
function openFormModal(kind, prefillRoute) {
  const trans = translations[currentLang];
  const cfg = FORMS[kind] || {};
  formModalTitle.textContent = kind === 'suggest' ? trans.modalSuggestTitle : trans.modalReportTitle;
  const intro = kind === 'suggest' ? trans.modalSuggestIntro : trans.modalReportIntro;

  if (cfg.url) {
    let url = cfg.url;
    // Optionally pre-fill the route field on a correction report
    if (kind === 'report' && prefillRoute && cfg.reportRouteEntry) {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}usp=pp_url&${cfg.reportRouteEntry}=${encodeURIComponent(prefillRoute)}`;
    }
    const embedUrl = url + (url.includes('?') ? '&' : '?') + 'embedded=true';
    formModalBody.innerHTML = `
      <p class="modal-intro">${intro}</p>
      <div class="form-frame-wrap">
        <iframe class="form-frame" src="${embedUrl}" title="form" loading="lazy"></iframe>
      </div>
      <a class="modal-newtab" href="${url}" target="_blank" rel="noopener">${trans.modalOpenNewTab}</a>
    `;
  } else {
    formModalBody.innerHTML = `
      <p class="modal-intro">${intro}</p>
      <div class="modal-comingsoon">${trans.modalComingSoon}</div>
    `;
  }

  formModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeFormModal() {
  formModal.classList.add('hidden');
  formModalBody.innerHTML = '';
  document.body.style.overflow = '';
}

// Start application
window.addEventListener('DOMContentLoaded', init);

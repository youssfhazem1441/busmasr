/**
 * MiniBus Egypt - Data Parser & Integrator
 * Parses Blogger XML (informal data) and Transport for Cairo GTFS (formal data)
 * into a single unified routes.json database.
 */

const fs = require('fs');
const path = require('path');
const htmlparser = require('htmlparser2');
const { decode } = require('html-entities');

// File paths
const XML_FILE = path.join(__dirname, 'minibus-data.xml');
const GTFS_DIR = path.join(__dirname, 'gtfs');
const OUTPUT_FILE = path.join(__dirname, 'routes.json');

// --- Helper Functions for Normalization ---

/**
 * Normalizes Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) to Western numerals (0123456789)
 */
function convertArabicNumerals(str) {
  if (!str) return '';
  return str.replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x0660);
}

/**
 * Normalizes Arabic text for index matching:
 * - Removes Tashkeel (diacritics)
 * - Unifies Alif forms
 * - Unifies Ya and Alef Layena
 * - Unifies Heh and Teh Marbuta
 * - Removes common stop prefixes (محطة, ميدان, موقف, شارع)
 */
function normalizeArabic(text) {
  if (!text) return '';
  let str = text.trim();

  // Convert Arabic-Indic numerals
  str = convertArabicNumerals(str);

  // 1. Remove Tashkeel (diacritics)
  const tashkeelRegex = /[\u064B-\u0652\u0653\u0654\u0655\u0670]/g;
  str = str.replace(tashkeelRegex, '');

  // 2. Unify Alif (أ، إ، آ -> ا)
  str = str.replace(/[أإآ]/g, 'ا');

  // 3. Unify Ya (ي -> ى)
  str = str.replace(/ي/g, 'ى');

  // 4. Unify Heh/Teh Marbuta (ة -> ه)
  str = str.replace(/ة/g, 'ه');

  // 5. Remove common stop prefixes to improve matching
  const prefixes = ['محطه', 'ميدان', 'موقف', 'شارع'];
  let words = str.split(/\s+/);
  let filteredWords = words.map(word => {
    // Normalize word temporary to check prefix
    let normalizedWord = word
      .replace(/[أإآ]/g, 'ا')
      .replace(/ي/g, 'ى')
      .replace(/ة/g, 'ه');
    if (prefixes.includes(normalizedWord)) {
      return '';
    }
    return word;
  }).filter(Boolean);

  // If stripping prefixes leaves nothing, fallback to original words
  if (filteredWords.length === 0) {
    return words.join(' ');
  }
  return filteredWords.join(' ');
}

/**
 * Extracts route number or ID from Blogger post title
 */
function extractRouteId(title) {
  if (!title) return '';
  const normalizedTitle = convertArabicNumerals(title);
  // Match route code like OC5, 309, etc. after keywords
  const match = normalizedTitle.match(/(?:باص|اتوبيس|أنتوبيس|خط سير|ميني)\s+([A-Za-z0-9]+)/i);
  if (match) {
    return match[1].trim();
  }
  // Fallback: get the last word of the title
  const words = normalizedTitle.split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    return words[words.length - 1];
  }
  return '';
}

/**
 * Classification heuristic to determine governorate/city when not explicitly stated
 */
function guessCity(categories, stops, title) {
  const categoryTerms = categories.map(c => c.term.toLowerCase());
  for (const term of categoryTerms) {
    if (term.includes('اكتوبر') || term.includes('أكتوبر') || term.includes('october')) return '6 أكتوبر';
    if (term.includes('اسكندرية') || term.includes('إسكندرية') || term.includes('alex')) return 'الإسكندرية';
    if (term.includes('قليوبية') || term.includes('شبرا الخيمة')) return 'القليوبية';
    if (term.includes('جيزة') || term.includes('giza')) return 'الجيزة';
    if (term.includes('قاهرة') || term.includes('cairo')) return 'القاهرة';
  }

  const allStopsText = stops.join(' ');
  const normalizedCombined = normalizeArabic((title + ' ' + allStopsText).toLowerCase());

  if (normalizedCombined.includes('اكتوبر') || normalizedCombined.includes('الحصرى') || normalizedCombined.includes('الشيخ زايد')) {
    return '6 أكتوبر / الجيزة';
  }
  if (normalizedCombined.includes('اسكندريه') || normalizedCombined.includes('الرمل') || normalizedCombined.includes('العصافره') || normalizedCombined.includes('سموحه')) {
    return 'الإسكندرية';
  }
  if (normalizedCombined.includes('بنها') || normalizedCombined.includes('قلىوب') || normalizedCombined.includes('شبرا الخىمه')) {
    return 'القليوبية';
  }
  if (normalizedCombined.includes('حلوان') || normalizedCombined.includes('جىزه') || normalizedCombined.includes('دقى') || normalizedCombined.includes('مهندسىن') || normalizedCombined.includes('فىصل') || normalizedCombined.includes('هرم')) {
    return 'الجيزة / القاهرة الكبرى';
  }

  return 'القاهرة الكبرى';
}

// --- XML Parsing Logic (Informal Blogger Feed) ---

/**
 * Removes bidirectional control characters (LRM/RLM and the isolate marks
 * U+2066–U+2069) that pollute some blog headings, e.g. "⁩ هضبة الهرم ⬅️ بشتيل ⁦".
 */
function stripBidi(text) {
  if (!text) return '';
  return text.replace(/[‎‏⁦-⁩]/g, '').trim();
}

/**
 * Cleans a raw ticket-price value ("12 جنية", "٥ ج", …) to a single tidy line.
 */
function cleanPrice(text) {
  if (!text) return '';
  return stripBidi(text).split(/\r?\n/)[0].trim().replace(/\s+/g, ' ');
}

/**
 * Returns true when an <h3>/heading string is actually a metadata label
 * (company, price, phone numbers, …) rather than a real "A ⬅️ B" direction.
 */
function looksLikeLabel(text) {
  if (!text) return true;
  if (/[:：]/.test(text)) return true;
  return /^(الشرك|سعر|ارقام|أرقام|التزام|مواعيد|محطات|ملاحظات)/.test(text.trim());
}

function parsePostHtml(html) {
  // Collect the text content of every block element in document order, then
  // interpret the sequence by CONTENT (not tag), so both post layouts work:
  // some posts keep the stops in a <div>, others in a bare <span>.
  //
  // We use a block stack: inline tags (span, b, i, font, br…) let their text
  // bubble up into the enclosing block, so a stops list broken up by inline
  // spans stays whole. Block tags (div, h3, h4, p, li…) are their own units.
  // Text inside <a> is skipped entirely — those are phone-number/link lists,
  // never stops, and would otherwise contaminate the enclosing block's text.
  const elements = [];
  const BLOCK = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'section', 'article', 'blockquote']);
  const stack = [];
  let skipDepth = 0; // >0 while inside one or more <a> tags

  const htmlParser = new htmlparser.Parser({
    onopentag(name) {
      if (name === 'a') skipDepth++;
      else if (BLOCK.has(name)) stack.push({ tag: name, buf: '' });
    },
    ontext(text) {
      if (skipDepth > 0) return;
      if (stack.length) stack[stack.length - 1].buf += text;
    },
    onclosetag(name) {
      if (name === 'a') {
        if (skipDepth > 0) skipDepth--;
      } else if (BLOCK.has(name)) {
        const b = stack.pop();
        if (b) {
          const text = stripBidi(b.buf);
          if (text) elements.push({ tag: b.tag, text });
        }
      }
    }
  });

  htmlParser.write(html);
  htmlParser.end();

  const hyphenItems = text => text.split('-').map(s => stripBidi(s)).filter(Boolean);

  // 1. Route stops = the longest hyphen-separated list that is NOT contaminated
  //    by label text (a colon marks a "الشركة : ..."-style wrapper, never stops).
  //    This also naturally skips the shorter "محطات مترو" nearby-metro list.
  let stops = [];
  for (const el of elements) {
    if (/[:：]/.test(el.text)) continue;
    if ((el.text.match(/-/g) || []).length < 3) continue;
    const candidate = hyphenItems(el.text);
    if (candidate.length > stops.length) stops = candidate;
  }

  const inlineAfterColon = text => {
    const idx = text.search(/[:：]/);
    return idx === -1 ? '' : text.slice(idx + 1).trim();
  };

  // 2. Company & price, found by scanning every element for their labels.
  //    Company only comes from the reliable inline "الشركة : X" form — guessing
  //    the next element misfires onto the following "التزام الخط" label. Price
  //    takes its inline value or the next element, but must contain a number.
  let company = 'غير معروف';
  let price = '';
  for (let i = 0; i < elements.length; i++) {
    const t = elements[i].text;
    // "ارقام الشركة ..." is the phone-numbers heading, NOT the operator name.
    if (/^(ارقام|أرقام)/.test(t)) continue;
    if (company === 'غير معروف' && /الشرك/.test(t) && /[:：]/.test(t)) {
      const v = stripBidi(inlineAfterColon(t));
      if (v && !/الشرك/.test(v)) company = v;
    }
    if (!price && /سعر/.test(t)) {
      let raw = inlineAfterColon(t);
      if (!raw) {
        const next = elements[i + 1];
        if (next && (next.text.match(/-/g) || []).length < 3) raw = next.text;
      }
      const v = cleanPrice(raw);
      if (v && /[0-9٠-٩]/.test(v) && !/سعر/.test(v)) price = v;
    }
  }

  // 3. Direction = first "A ⬅️ B" line (arrow, not a hyphen list, not a label).
  let direction = '';
  for (const el of elements) {
    const t = el.text;
    if (looksLikeLabel(t)) continue;
    if (/[⬅➡→←↔]/.test(t) && (t.match(/-/g) || []).length < 3) {
      direction = t;
      break;
    }
  }

  return { direction, stops, company, price };
}

function parseXMLData() {
  return new Promise((resolve, reject) => {
    console.log('Starting XML Parsing of minibus-data.xml...');
    const routes = [];
    let currentEntry = null;
    let currentTag = '';

    const xmlParser = new htmlparser.Parser({
      onopentag(name, attribs) {
        currentTag = name;
        if (name === 'entry') {
          currentEntry = {
            title: '',
            content: '',
            categories: []
          };
        } else if (name === 'category' && currentEntry) {
          if (attribs.term) {
            currentEntry.categories.push({
              term: attribs.term,
              scheme: attribs.scheme || ''
            });
          }
        }
      },
      ontext(text) {
        if (!currentEntry) return;
        if (currentTag === 'title') {
          currentEntry.title += text;
        } else if (currentTag === 'content') {
          currentEntry.content += text;
        }
      },
      onclosetag(name) {
        if (name === 'entry') {
          if (currentEntry) {
            const isPost = currentEntry.categories.some(cat =>
              cat.term.includes('kind#post') || cat.scheme.includes('kind#post')
            );
            if (isPost && currentEntry.title && currentEntry.content) {
              const title = currentEntry.title.trim();
              const decodedContent = decode(currentEntry.content);
              const { direction, stops, company, price } = parsePostHtml(decodedContent);

              if (stops.length > 0) {
                const id = extractRouteId(title);
                const city = guessCity(currentEntry.categories, stops, title);
                // If the post had no usable direction heading, build one from the
                // real endpoints of the route instead of falling back to the title.
                const derivedDirection = stops.length >= 2
                  ? `${stops[0]} ⬅️ ${stops[stops.length - 1]}`
                  : '';
                routes.push({
                  id: id,
                  title: title,
                  direction: direction || derivedDirection || title,
                  stops: stops,
                  normalizedStops: stops.map(s => normalizeArabic(s)),
                  company: company,
                  price: price,
                  city: city,
                  source: 'blogger'
                });
              }
            }
          }
          currentEntry = null;
        }
        currentTag = '';
      }
    }, { xmlMode: true });

    const readStream = fs.createReadStream(XML_FILE, { encoding: 'utf8' });
    readStream.on('data', chunk => {
      xmlParser.write(chunk);
    });
    readStream.on('end', () => {
      xmlParser.end();
      console.log(`XML Parsing finished. Extracted ${routes.length} routes.`);
      resolve(routes);
    });
    readStream.on('error', err => {
      reject(err);
    });
  });
}

// --- CSV Helper for GTFS ---

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map(val => val.replace(/^"|"$/g, '').trim());
}

function parseCSVFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] !== undefined ? values[index] : '';
    });
    rows.push(row);
  }
  return rows;
}

// --- GTFS Processing Logic (TfC-2017 Data) ---

function processGTFSData() {
  console.log('Checking for GTFS data source in ./gtfs...');
  if (!fs.existsSync(GTFS_DIR)) {
    console.log('GTFS directory not found. Skipping GTFS integration.');
    return [];
  }

  try {
    const routesFile = path.join(GTFS_DIR, 'routes.txt');
    const stopsFile = path.join(GTFS_DIR, 'stops.txt');
    const stopTimesFile = path.join(GTFS_DIR, 'stop_times.txt');
    const tripsFile = path.join(GTFS_DIR, 'trips.txt');

    console.log('Reading GTFS CSV files...');
    const gtfsRoutes = parseCSVFile(routesFile);
    const gtfsStops = parseCSVFile(stopsFile);
    const gtfsStopTimes = parseCSVFile(stopTimesFile);

    let gtfsTrips = [];
    if (fs.existsSync(tripsFile)) {
      gtfsTrips = parseCSVFile(tripsFile);
    }

    console.log('Parsing GTFS mappings...');

    const stopIdToName = {};
    gtfsStops.forEach(stop => {
      stopIdToName[stop.stop_id] = stop.stop_name;
    });

    const routeDetails = {};
    gtfsRoutes.forEach(route => {
      routeDetails[route.route_id] = {
        shortName: route.route_short_name || '',
        longName: route.route_long_name || '',
        id: route.route_id
      };
    });

    const tripToRoute = {};
    gtfsTrips.forEach(trip => {
      tripToRoute[trip.trip_id] = {
        routeId: trip.route_id,
        directionId: trip.direction_id || '0'
      };
    });

    const routeStopsMap = {};

    gtfsStopTimes.forEach(st => {
      const tripId = st.trip_id;
      const stopId = st.stop_id;
      const sequence = parseInt(st.stop_sequence, 10);

      let routeId = '';
      let directionId = '0';

      if (tripToRoute[tripId]) {
        routeId = tripToRoute[tripId].routeId;
        directionId = tripToRoute[tripId].directionId;
      } else {
        routeId = tripId.split('_')[0] || tripId;
      }

      if (!routeDetails[routeId]) {
        return;
      }

      if (!routeStopsMap[routeId]) {
        routeStopsMap[routeId] = {};
      }
      if (!routeStopsMap[routeId][directionId]) {
        routeStopsMap[routeId][directionId] = {};
      }
      if (!routeStopsMap[routeId][directionId][tripId]) {
        routeStopsMap[routeId][directionId][tripId] = [];
      }

      routeStopsMap[routeId][directionId][tripId].push({
        stopId,
        sequence
      });
    });

    const outputRoutes = [];

    Object.keys(routeStopsMap).forEach(routeId => {
      const directions = routeStopsMap[routeId];
      const routeInfo = routeDetails[routeId];

      Object.keys(directions).forEach(directionId => {
        const trips = directions[directionId];
        let longestTripId = '';
        let maxStops = -1;

        Object.keys(trips).forEach(tripId => {
          if (trips[tripId].length > maxStops) {
            maxStops = trips[tripId].length;
            longestTripId = tripId;
          }
        });

        if (longestTripId) {
          const tripStops = trips[longestTripId];
          tripStops.sort((a, b) => a.sequence - b.sequence);

          const stopNames = tripStops.map(ts => stopIdToName[ts.stopId] || `Stop ${ts.stopId}`);

          if (stopNames.length > 0) {
            const shortName = routeInfo.shortName || routeId;
            const longName = routeInfo.longName || `${stopNames[0]} ⬅️⁩ ${stopNames[stopNames.length - 1]}`;

            outputRoutes.push({
              id: `TFC-${routeId}-${directionId}`,
              title: `خط سير اتوبيس ${shortName}`,
              direction: longName,
              stops: stopNames,
              normalizedStops: stopNames.map(s => normalizeArabic(s)),
              company: 'هيئة النقل العام / Transport for Cairo',
              price: '',
              city: 'القاهرة الكبرى',
              source: 'TfC-2017'
            });
          }
        }
      });
    });

    console.log(`GTFS Processing finished. Extracted ${outputRoutes.length} routes.`);
    return outputRoutes;

  } catch (error) {
    console.error('Error processing GTFS data:', error);
    return [];
  }
}

// --- Main execution ---

async function run() {
  try {
    const xmlRoutes = await parseXMLData();
    const gtfsRoutes = processGTFSData();

    const routesMap = new Map();

    xmlRoutes.forEach(route => {
      const key = route.id ? `XML-${route.id}` : `XML-${route.title}`;
      routesMap.set(key, route);
    });

    gtfsRoutes.forEach(route => {
      const key = `GTFS-${route.id}`;
      routesMap.set(key, route);
    });

    // Merge custom routes if present
    const customFilePath = path.join(__dirname, 'custom-routes.json');
    if (fs.existsSync(customFilePath)) {
      try {
        const customData = fs.readFileSync(customFilePath, 'utf8');
        const customRoutes = JSON.parse(customData);
        console.log(`Found custom-routes.json. Loading ${customRoutes.length} custom routes...`);
        customRoutes.forEach(route => {
          // If stops exist but normalizedStops doesn't, normalize them
          if (route.stops && !route.normalizedStops) {
            route.normalizedStops = route.stops.map(s => normalizeArabic(s));
          }
          const key = route.id ? `CUSTOM-${route.id}` : `CUSTOM-${route.title}`;
          routesMap.set(key, route);
        });
      } catch (err) {
        console.error('Failed to parse custom-routes.json:', err);
      }
    }

    const finalRoutes = Array.from(routesMap.values());

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalRoutes, null, 2), 'utf8');
    console.log(`Successfully unified data! Saved ${finalRoutes.length} routes to ${OUTPUT_FILE}`);

  } catch (err) {
    console.error('Data pipeline error:', err);
  }
}

run();

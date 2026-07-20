/**
 * MiniBus Egypt - Core Frontend Application Logic
 * Contains Arabic text normalization, search matching, and directional transfer logic.
 */

/**
 * Normalizes Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) to Western numerals (0123456789)
 */
function convertArabicNumerals(str) {
  if (!str) return '';
  return str.replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x0660);
}

/**
 * Normalizes Arabic text for searching and indexing:
 * - Removes Tashkeel (diacritics)
 * - Unifies Alif (أ، إ، آ -> ا)
 * - Unifies Ya (ي -> ى)
 * - Unifies Heh/Teh Marbuta (ة -> ه)
 * - Removes common stop prefixes like "محطة" (station) or "ميدان" (square/plaza)
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
 * Flips a route's direction label around its arrow separator so a reverse
 * (return-trip) ride reads correctly, e.g. "الوراق ⬅️ الهرم" -> "الهرم ⬅️ الوراق".
 * If no recognizable arrow is present, the label is returned unchanged.
 */
function flipDirection(direction) {
  if (!direction) return direction;
  const arrowMatch = direction.match(/\s*(⬅️|➡️|⬅|➡|→|←|↔|<->|->|<-)\s*/);
  if (!arrowMatch) return direction;
  const arrow = arrowMatch[1];
  const parts = direction.split(arrowMatch[0]);
  if (parts.length !== 2) return direction;
  return `${parts[1].trim()} ${arrow} ${parts[0].trim()}`;
}

/**
 * Finds direct and transfer routes for a given From and To query.
 * 
 * @param {Array} routes - The loaded routes list from routes.json
 * @param {string} userInputFrom - The origin location name entered by the user
 * @param {string} userInputTo - The destination location name entered by the user
 * @returns {object} An object containing 'direct' matching routes and 'transfers' suggestions
 */
function searchRoutes(routes, userInputFrom, userInputTo) {
  const fromNormalized = normalizeArabic(userInputFrom);
  const toNormalized = normalizeArabic(userInputTo);

  if (!fromNormalized || !toNormalized) {
    return { direct: [], transfers: [] };
  }

  const directMatches = [];
  const fromRoutes = []; // Routes containing the "From" stop
  const toRoutes = [];   // Routes containing the "To" stop

  // Loop through all routes to look for direct matches and cache candidates for transfers
  routes.forEach(route => {
    const stopsNormalized = route.normalizedStops || route.stops.map(s => normalizeArabic(s));

    // Find indices matching the 'from' text (partial substring match)
    const fromIndices = [];
    stopsNormalized.forEach((stop, index) => {
      if (stop.includes(fromNormalized)) {
        fromIndices.push(index);
      }
    });

    // Find indices matching the 'to' text (partial substring match)
    const toIndices = [];
    stopsNormalized.forEach((stop, index) => {
      if (stop.includes(toNormalized)) {
        toIndices.push(index);
      }
    });

    // Determine if the route connects both stops. A minibus drives its line in
    // BOTH directions, so a route is a valid direct ride whether the stored stop
    // order is From→To (forward) or To→From (reverse / return trip). We pick the
    // closest connecting pair of stops and remember which way it runs.
    let shortestSpan = Infinity;
    let matchedFromIndex = -1;
    let matchedToIndex = -1;
    let isReversed = false;

    for (const fIdx of fromIndices) {
      for (const tIdx of toIndices) {
        if (fIdx === tIdx) continue; // same stop matched both queries; not a journey
        const span = Math.abs(tIdx - fIdx);
        if (span < shortestSpan) {
          shortestSpan = span;
          matchedFromIndex = fIdx;
          matchedToIndex = tIdx;
          isReversed = fIdx > tIdx; // stored order is To→From; rider takes the return trip
        }
      }
    }

    if (matchedFromIndex !== -1) {
      let displayRoute = route;
      let fromIndex = matchedFromIndex;
      let toIndex = matchedToIndex;

      // For a reverse ride, present the route flipped so the timeline reads
      // origin → destination and the "before/after" stop counts stay correct.
      if (isReversed) {
        const stopsRev = route.stops.slice().reverse();
        const normRev = (route.normalizedStops || route.stops.map(s => normalizeArabic(s))).slice().reverse();
        const lastIdx = route.stops.length - 1;
        displayRoute = Object.assign({}, route, {
          stops: stopsRev,
          normalizedStops: normRev,
          direction: flipDirection(route.direction)
        });
        fromIndex = lastIdx - matchedFromIndex;
        toIndex = lastIdx - matchedToIndex;
      }

      directMatches.push({
        route: displayRoute,
        fromIndex: fromIndex,
        toIndex: toIndex,
        stopsCount: shortestSpan,
        reversed: isReversed,
        matchedFromStop: displayRoute.stops[fromIndex],
        matchedToStop: displayRoute.stops[toIndex]
      });
    }

    // Cache candidate legs for transfer search
    if (fromIndices.length > 0) {
      fromRoutes.push({ route, matchedIndices: fromIndices });
    }
    if (toIndices.length > 0) {
      toRoutes.push({ route, matchedIndices: toIndices });
    }
  });

  // Sort direct matches: fewest stops first (shortest journey duration)
  directMatches.sort((a, b) => a.stopsCount - b.stopsCount);

  const transferMatches = [];

  // Transfer Search: Cross-reference routes passing through "From" and "To"
  fromRoutes.forEach(fromItem => {
    toRoutes.forEach(toItem => {
      // Must be two different routes
      if (fromItem.route.id === toItem.route.id) return;

      const fromStopsNormalized = fromItem.route.normalizedStops || fromItem.route.stops.map(s => normalizeArabic(s));
      const toStopsNormalized = toItem.route.normalizedStops || toItem.route.stops.map(s => normalizeArabic(s));

      // Find an intersection point
      // Leg 1: user rides from start Index to a transfer Index (transfer Index > start Index)
      // Leg 2: user rides from transfer Index to end Index (transfer Index < end Index)
      for (const fromStartIdx of fromItem.matchedIndices) {
        for (const toEndIdx of toItem.matchedIndices) {

          for (let i = fromStartIdx + 1; i < fromStopsNormalized.length; i++) {
            const potentialTransferStop = fromStopsNormalized[i];

            for (let j = 0; j < toEndIdx; j++) {
              const secondBusStop = toStopsNormalized[j];

              if (potentialTransferStop === secondBusStop) {
                transferMatches.push({
                  firstLeg: fromItem.route,
                  secondLeg: toItem.route,
                  transferStopName: fromItem.route.stops[i], // raw name for display
                  firstLegStops: i - fromStartIdx,
                  secondLegStops: toEndIdx - j,
                  totalStops: (i - fromStartIdx) + (toEndIdx - j),
                  matchedFromStop: fromItem.route.stops[fromStartIdx],
                  matchedToStop: toItem.route.stops[toEndIdx]
                });
                return; // Stop looking for transfers between these two specific routes once one is found
              }
            }
          }

        }
      }
    });
  });

  // Sort transfers by total stop count
  transferMatches.sort((a, b) => a.totalStops - b.totalStops);

  // Keep top 5 unique transfer suggestions
  const uniqueTransfers = [];
  const seenPairs = new Set();
  for (const match of transferMatches) {
    const pairId = `${match.firstLeg.id}-${match.secondLeg.id}`;
    if (!seenPairs.has(pairId)) {
      seenPairs.add(pairId);
      uniqueTransfers.push(match);
      if (uniqueTransfers.length >= 5) break;
    }
  }

  return {
    direct: directMatches,
    transfers: uniqueTransfers
  };
}

// Export for Node/CommonJS environment tests (or window if in browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeArabic,
    searchRoutes,
    convertArabicNumerals
  };
}

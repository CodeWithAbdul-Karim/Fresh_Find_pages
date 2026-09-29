/* =========================================================
   FreshFind — Market Details Page
   Part 5: marketdetails.js

   Vanilla JS, IIFE, ES5-style (matches market.js/navbar.js's own
   conventions — no arrow functions, no let/const). Reads ?id= from
   the URL, fetches data/marketdetails.json, finds the matching
   market, and renders it into the states/hooks already built by
   Parts 3–4 (loading / content / not-found; data-status,
   data-map-state, data-today, aria-pressed).

   No market's data is hardcoded anywhere in this file — every value
   rendered comes from marketdetails.json for whichever market the
   ?id= parameter resolves to.
   ========================================================= */

(function () {
  'use strict';

  /* ---------------------------------------------------------------------
   * Shared day constants — identical to market.js's, so this page's
   * schedule/status logic can never silently drift from the grid's.
   * ------------------------------------------------------------------- */

  var DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  var DAY_LABEL_FULL = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
    friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
  };
  // Date.getDay() order, Sunday-first — used to read "today" off the clock
  var DATE_DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  /* ---------------------------------------------------------------------
   * Time helpers — ported unchanged from market.js (Part 1's documented
   * "reference implementation" for this exact logic).
   * ------------------------------------------------------------------- */

  function parseTimeToMinutes(value) {
    var parts = value.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function formatTime(value) {
    var parts = value.split(':');
    var hour = parseInt(parts[0], 10);
    var minute = parts[1];
    var suffix = hour >= 12 ? 'PM' : 'AM';
    var displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return displayHour + ':' + minute + ' ' + suffix;
  }

  function minutesToLabel(mins) {
    var normalized = ((mins % 1440) + 1440) % 1440;
    var h = Math.floor(normalized / 60);
    var m = normalized % 60;
    var hh = (h < 10 ? '0' : '') + h;
    var mm = (m < 10 ? '0' : '') + m;
    return formatTime(hh + ':' + mm);
  }

  function isSameCalendarDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  /* ---------------------------------------------------------------------
   * Open/Closed status engine — ported unchanged from market.js.
   * Handles closed days (null schedule entries), and schedules that
   * cross midnight, exactly as the directory page already does.
   * ------------------------------------------------------------------- */

  function scheduleForDay(schedule, dayKey) {
    var day = schedule[dayKey];
    if (!day) return null;
    var open = parseTimeToMinutes(day.open);
    var close = parseTimeToMinutes(day.close);
    return { open: open, close: close, crosses: close <= open };
  }

  function findNextOpening(schedule, now) {
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var todayIdx = now.getDay();

    for (var offset = 0; offset <= 7; offset++) {
      var idx = (todayIdx + offset) % 7;
      var key = DATE_DAY_KEYS[idx];
      var sched = scheduleForDay(schedule, key);
      if (!sched) continue;

      // Today, only count sessions that haven't started yet.
      if (offset === 0 && sched.open <= nowMin) continue;

      var date = new Date(now);
      date.setDate(now.getDate() + offset);
      date.setHours(Math.floor(sched.open / 60), sched.open % 60, 0, 0);
      return { date: date, dayKey: key };
    }
    return null;
  }

  function computeStatus(market, now) {
    var todayIdx = now.getDay();
    var todayKey = DATE_DAY_KEYS[todayIdx];
    var yesterdayKey = DATE_DAY_KEYS[(todayIdx + 6) % 7];
    var nowMin = now.getHours() * 60 + now.getMinutes();

    // 1. Still open from a session that started yesterday and crosses midnight.
    var yesterday = scheduleForDay(market.schedule, yesterdayKey);
    if (yesterday && yesterday.crosses && nowMin < yesterday.close) {
      var closeDateY = new Date(now);
      closeDateY.setHours(Math.floor(yesterday.close / 60), yesterday.close % 60, 0, 0);
      return {
        open: true,
        closeDate: closeDateY,
        label: 'Open now · closes ' + minutesToLabel(yesterday.close)
      };
    }

    // 2. A session that started today.
    var today = scheduleForDay(market.schedule, todayKey);
    if (today) {
      if (!today.crosses && nowMin >= today.open && nowMin < today.close) {
        var closeDateT = new Date(now);
        closeDateT.setHours(Math.floor(today.close / 60), today.close % 60, 0, 0);
        return {
          open: true,
          closeDate: closeDateT,
          label: 'Open now · closes ' + minutesToLabel(today.close)
        };
      }
      if (today.crosses && nowMin >= today.open) {
        var closeDateTC = new Date(now);
        closeDateTC.setDate(now.getDate() + 1);
        closeDateTC.setHours(Math.floor(today.close / 60), today.close % 60, 0, 0);
        return {
          open: true,
          closeDate: closeDateTC,
          label: 'Open now · closes ' + minutesToLabel(today.close)
        };
      }
    }

    // 3. Closed — find the next opening.
    var next = findNextOpening(market.schedule, now);
    if (!next) {
      return { open: false, closeDate: null, label: 'Closed' };
    }

    var tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    var whenLabel;
    if (isSameCalendarDay(next.date, now)) {
      whenLabel = 'today';
    } else if (isSameCalendarDay(next.date, tomorrow)) {
      whenLabel = 'tomorrow';
    } else {
      whenLabel = DAY_LABEL_FULL[next.dayKey];
    }

    var openMin = next.date.getHours() * 60 + next.date.getMinutes();
    return {
      open: false,
      nextDate: next.date,
      label: 'Closed · opens ' + whenLabel + ', ' + minutesToLabel(openMin)
    };
  }

  // "Today's hours" is the schedule entry for today's day-of-week — what
  // the market's hours ARE today, independent of whether "now" happens
  // to fall inside them (that live open/closed judgment is computeStatus's
  // job, shown separately in the status pill).
  function todayHoursLabel(schedule, now) {
    var todayKey = DATE_DAY_KEYS[now.getDay()];
    var today = schedule[todayKey];
    if (!today) return 'Closed today';
    return formatTime(today.open) + ' – ' + formatTime(today.close);
  }

  /* ---------------------------------------------------------------------
   * Bookmarks — identical key/format/localStorage handling as market.js,
   * so a market bookmarked here shows bookmarked on the grid too (and
   * vice versa). Keyed by legacyId (e.g. "market-05"), per the id/legacyId
   * split decided in Part 3 — NOT the slug id this page's URL uses.
   * ------------------------------------------------------------------- */

  var BOOKMARK_KEY = 'freshfind:bookmarks';

  function loadBookmarks() {
    try {
      var raw = window.localStorage.getItem(BOOKMARK_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function saveBookmarks(ids) {
    try {
      window.localStorage.setItem(BOOKMARK_KEY, JSON.stringify(ids));
    } catch (err) {
      // Storage unavailable (private browsing, quota, etc.) — fail
      // silently, the toggle still works for the current page view.
    }
  }

  var bookmarkedIds = loadBookmarks();

  function isBookmarked(id) {
    return bookmarkedIds.indexOf(id) !== -1;
  }

  function toggleBookmark(id) {
    var index = bookmarkedIds.indexOf(id);
    if (index === -1) {
      bookmarkedIds.push(id);
    } else {
      bookmarkedIds.splice(index, 1);
    }
    saveBookmarks(bookmarkedIds);
    showBookmarkToast(isBookmarked(id));
    // Badge must reflect ALL saved items (markets + produce combined),
    // not just this page's in-memory array — read the full count from storage.
    if (window.FreshFindNavbar && window.FreshFindNavbar.setBookmarkCount) {
      try {
        var raw = window.localStorage.getItem(BOOKMARK_KEY);
        var all = raw ? JSON.parse(raw) : [];
        window.FreshFindNavbar.setBookmarkCount(Array.isArray(all) ? all.length : bookmarkedIds.length);
      } catch (e) {
        window.FreshFindNavbar.setBookmarkCount(bookmarkedIds.length);
      }
    }
  }

  var toastTimer = null;

  function showBookmarkToast(saved) {
    var toast = document.getElementById('ffBookmarkToast');
    if (!toast) return;
    toast.querySelector('.ff-bm-toast__icon').innerHTML = saved
      ? '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 3.5C5 3.22 5.22 3 5.5 3h9c.28 0 .5.22.5.5V17l-5-3-5 3V3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="currentColor" fill-opacity=".15"/></svg>'
      : '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 3.5C5 3.22 5.22 3 5.5 3h9c.28 0 .5.22.5.5V17l-5-3-5 3V3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="7" y1="7" x2="13" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="13" y1="7" x2="7" y2="13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    toast.querySelector('.ff-bm-toast__msg').textContent = saved ? 'Saved to bookmarks' : 'Removed from bookmarks';
    toast.classList.remove('ff-bm-toast--hide');
    toast.classList.add('ff-bm-toast--show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('ff-bm-toast--show');
      toast.classList.add('ff-bm-toast--hide');
    }, 2600);
  }

  /* ---------------------------------------------------------------------
   * URL parameter + data loading
   * ------------------------------------------------------------------- */

  function getMarketId() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    return id ? id.trim() : '';
  }

  function loadMarkets() {
    return fetch('data/marketdetails.json').then(function (response) {
      if (!response.ok) {
        throw new Error('Failed to load market details data');
      }
      return response.json();
    });
  }

  /* The produce guide — the same records the Produces page renders. Loaded
     separately from marketdetails.json so a failure here can't stop the
     page: renderProduce() falls back to the market's own produce list. */
  function loadProduces() {
    return fetch('data/produces.json').then(function (response) {
      if (!response.ok) {
        throw new Error('Failed to load produce data');
      }
      return response.json();
    });
  }

  function findMarket(markets, id) {
    for (var i = 0; i < markets.length; i++) {
      if (markets[i].id === id) {
        return markets[i];
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------------
   * Page-state elements — loading / content / not-found are mutually
   * exclusive, exactly as Part 3 built them.
   * ------------------------------------------------------------------- */

  var loadingEl = document.getElementById('marketLoadingStatus');
  var contentEl = document.getElementById('marketDetailContent');
  var notFoundEl = document.getElementById('marketNotFound');

  function showContent() {
    loadingEl.hidden = true;
    contentEl.hidden = false;
    notFoundEl.hidden = true;
  }

  function showNotFound() {
    loadingEl.hidden = true;
    contentEl.hidden = true;
    notFoundEl.hidden = false;
  }

  function showLoadError() {
    // Mirrors market.js's own fetch-failure handling on the directory
    // page: leave the existing status paragraph in place and swap its
    // text, rather than repurposing the "Market Not Found" state — a
    // data-load failure isn't the same problem as an invalid/missing id.
    loadingEl.hidden = false;
    loadingEl.textContent = "Market details couldn't be loaded right now. Please try again shortly.";
    contentEl.hidden = true;
    notFoundEl.hidden = true;
  }

  /* ---------------------------------------------------------------------
   * Header rendering
   * ------------------------------------------------------------------- */

  function renderHeader(market) {
    var image = document.getElementById('marketImage');
    // No .market-detail__fallback element exists in marketdetails.html —
    // deliberately, to avoid the orphaned-fallback bug already documented
    // against market.js/market.html (PROJECT_STATUS.md, Issues/blockers
    // #2). On a broken image, just hide it; the media block's own
    // background color (var(--bg)) shows through instead.
    image.onerror = function () {
      image.hidden = true;
    };
    image.hidden = false;
    image.src = market.image;
    image.alt = market.name + ' market stalls';

    document.getElementById('breadcrumbMarketName').textContent = market.name;
    document.getElementById('marketName').textContent = market.name;
    document.getElementById('marketArea').textContent = market.area;
    document.getElementById('marketDescription').textContent = market.description;
    if (document.getElementById('marketAddress')) document.getElementById('marketAddress').textContent = market.address;
    if (document.getElementById('marketLocationArea')) document.getElementById('marketLocationArea').textContent = market.area;

    // Short 1-2 line location sentence for the header, built only from
    // this market's own area/address fields — no invented location text,
    // and it changes automatically for whichever market the ?id= resolves to.
    document.getElementById('marketLocationSummary').textContent =
      'Located in ' + market.area + ', ' + market.name + ' sits at ' + market.address + '.';

    document.title = market.name + ' — FreshFind';
  }

  function renderBookmark(market) {
    var button = document.getElementById('marketBookmarkBtn');
    button.dataset.id = market.legacyId;
    button.setAttribute('aria-pressed', String(isBookmarked(market.legacyId)));
    button.addEventListener('click', function () {
      toggleBookmark(market.legacyId);
      button.setAttribute('aria-pressed', String(isBookmarked(market.legacyId)));
    });
  }

  /* ---------------------------------------------------------------------
   * Live open/closed status — recomputed on an interval, same 30s cadence
   * market.js already uses for the directory grid's status pills.
   * ------------------------------------------------------------------- */

  function updateOpenStatus(market) {
    var now = new Date();
    var status = computeStatus(market, now);

    var badge = document.getElementById('marketStatusBadge');
    badge.textContent = status.label;
    badge.dataset.status = status.open ? 'open' : 'closed';

    // The meta list's plain Open Now / Closed word, plus the same
    // data-status attribute the pill uses — marketdetails.css's Part 4
    // generic ".market-detail [data-status]" hook already colors this
    // the same way, with no extra CSS needed here.
    var statusLabel = document.getElementById('marketStatusLabel');
    statusLabel.textContent = status.open ? 'Open Now' : 'Closed';
    statusLabel.dataset.status = status.open ? 'open' : 'closed';

    document.getElementById('marketTodayHours').textContent = todayHoursLabel(market.schedule, now);
  }

  /* ---------------------------------------------------------------------
   * Weekly schedule
   * ------------------------------------------------------------------- */

  function renderSchedule(market, now) {
    var list = document.getElementById('marketScheduleList');
    list.innerHTML = '';

    var todayKey = DATE_DAY_KEYS[now.getDay()];
    var fragment = document.createDocumentFragment();

    DAY_ORDER.forEach(function (day) {
      var item = document.createElement('li');
      var hours = market.schedule[day];

      var dayName = document.createElement('span');
      dayName.className = 'day-name';
      dayName.textContent = DAY_LABEL_FULL[day];

      var dayHours = document.createElement('span');
      dayHours.textContent = hours ? formatTime(hours.open) + ' – ' + formatTime(hours.close) : 'Closed';

      item.appendChild(dayName);
      item.appendChild(dayHours);

      if (day === todayKey) {
        item.dataset.today = 'true';
      }

      fragment.appendChild(item);
    });

    list.appendChild(fragment);
  }

  /* ---------------------------------------------------------------------
   * Market produces — the produce this market actually sells.
   *
   * The cards come from data/produces.json, i.e. the same records the
   * Produces page renders, narrowed to this market through each produce's
   * own `marketIds` list. marketdetails.json's `produce` list is then used
   * to mark the items this market is known for ("Main produce"), and those
   * are listed first. Nothing is hardcoded per market — edit either JSON
   * and every market detail page follows.
   * ------------------------------------------------------------------- */

  var allProduces = [];

  // A single, generic produce/leaf glyph, used only as a stand-in when a
  // produce has no image (or its image fails to load) instead of leaving the
  // image frame empty. Uses currentColor, so it always matches the icon
  // container's CSS-defined color.
  var PRODUCE_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
    '<path d="M12 21c-4.5 0-7.5-3.2-7.5-7.9C4.5 8.1 8 4 12.8 3c-.4 2.3-.1 4-1.3 6.1 2-2.1 3.2-3 5.7-3.6.7 1.8 1.3 3.6 1.3 5.6 0 4.7-2 9.9-6.5 9.9Z"' +
    ' stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<path d="M12 21c0-4 .8-7.6 3-10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '</svg>';

  // marketdetails.json names this market's produce plainly ("Mangoes")
  // while the guide uses specific names ("Sindhri Mangoes"), so a guide item
  // counts as one of this market's main produce when its name contains one
  // of the market's own produce names — singularised, and long enough
  // (>3 letters) that a short word can't match something unrelated.
  function isMainProduce(market, produce) {
    var names = market.produce || [];
    var produceName = String(produce.name).toLowerCase();

    for (var i = 0; i < names.length; i++) {
      var term = String(names[i]).toLowerCase().replace(/s$/, '');
      if (term.length > 3 && produceName.indexOf(term) !== -1) {
        return true;
      }
    }

    return false;
  }

  // This market's main produce first, then the rest in the guide's order.
  function producesForMarket(market) {
    var main = [];
    var rest = [];

    allProduces.forEach(function (produce) {
      if ((produce.marketIds || []).indexOf(market.id) === -1) return;

      if (isMainProduce(market, produce)) {
        main.push(produce);
      } else {
        rest.push(produce);
      }
    });

    return { main: main, all: main.concat(rest) };
  }

  // Only used when the produce guide has nothing for this market (or could
  // not be loaded): the market's own produce list still gives real cards,
  // just without images, categories or seasons.
  function produceFallback(market) {
    return (market.produce || []).map(function (name) {
      return { name: name, category: '', season: null };
    });
  }

  function renderProduce(market) {
    renderProduceTypes(market);
    renderProduceCards(market);
  }

  function renderProduceTypes(market) {
    var typesList = document.getElementById('marketProduceTypes');
    if (!typesList) return;

    typesList.innerHTML = '';
    var fragment = document.createDocumentFragment();

    (market.produceTypes || []).forEach(function (type) {
      var chip = document.createElement('li');
      chip.textContent = type;
      fragment.appendChild(chip);
    });

    typesList.appendChild(fragment);
  }

  var PRODUCE_PER_PAGE = 6;
  var currentProducePage = 1;
  var cachedProduceCards = [];
  var cachedCurrentMonth = 1;

  function renderProduceCards(market) {
    var grid = document.getElementById('marketProduceGrid');
    var template = document.getElementById('marketProduceCardTemplate');
    var emptyEl = document.getElementById('marketProduceEmpty');
    var summaryEl = document.getElementById('marketProduceSummary');
    var pagerEl = document.getElementById('marketProducePager');

    if (!grid || !template) return;

    var fromGuide = producesForMarket(market);
    var cards = fromGuide.all.map(function (produce) {
      return { data: produce, main: fromGuide.main.indexOf(produce) !== -1 };
    });

    if (cards.length === 0) {
      cards = produceFallback(market).map(function (produce) {
        return { data: produce, main: true };
      });
    }

    if (cards.length === 0) {
      grid.innerHTML = '';
      grid.hidden = true;
      if (pagerEl) pagerEl.hidden = true;
      if (summaryEl) summaryEl.textContent = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    grid.hidden = false;
    if (emptyEl) emptyEl.hidden = true;

    // produces.json stores months 1-indexed (Date.getMonth() is 0-indexed).
    cachedCurrentMonth = new Date().getMonth() + 1;
    cachedProduceCards = cards;
    currentProducePage = 1;

    var mainCount = cards.reduce(function (count, c) {
      return count + (c.main ? 1 : 0);
    }, 0);

    if (summaryEl) {
      summaryEl.textContent = produceSummary(cards.length, mainCount);
    }

    renderProducePage();
    setupProducePagination();
  }

  function renderProducePage() {
    var grid = document.getElementById('marketProduceGrid');
    var template = document.getElementById('marketProduceCardTemplate');
    if (!grid || !template) return;

    grid.innerHTML = '';

    var start = (currentProducePage - 1) * PRODUCE_PER_PAGE;
    var end = start + PRODUCE_PER_PAGE;
    var pageCards = cachedProduceCards.slice(start, end);

    var fragment = document.createDocumentFragment();
    pageCards.forEach(function (card) {
      fragment.appendChild(buildProduceCard(card, template, cachedCurrentMonth));
    });
    grid.appendChild(fragment);

    updateProducePagerControls();
  }

  function setupProducePagination() {
    var pagerEl = document.getElementById('marketProducePager');
    var prevBtn = document.getElementById('producePrevBtn');
    var nextBtn = document.getElementById('produceNextBtn');

    if (!pagerEl) return;

    var totalPages = Math.ceil(cachedProduceCards.length / PRODUCE_PER_PAGE);

    if (totalPages <= 1) {
      pagerEl.hidden = true;
      return;
    }

    pagerEl.hidden = false;

    if (prevBtn && !prevBtn._hasListener) {
      prevBtn._hasListener = true;
      prevBtn.addEventListener('click', function () {
        if (currentProducePage > 1) {
          currentProducePage -= 1;
          renderProducePage();
        }
      });
    }

    if (nextBtn && !nextBtn._hasListener) {
      nextBtn._hasListener = true;
      nextBtn.addEventListener('click', function () {
        var pages = Math.ceil(cachedProduceCards.length / PRODUCE_PER_PAGE);
        if (currentProducePage < pages) {
          currentProducePage += 1;
          renderProducePage();
        }
      });
    }
  }

  function updateProducePagerControls() {
    var prevBtn = document.getElementById('producePrevBtn');
    var nextBtn = document.getElementById('produceNextBtn');
    var pagesContainer = document.getElementById('producePaginationPages');

    var totalPages = Math.ceil(cachedProduceCards.length / PRODUCE_PER_PAGE);

    if (prevBtn) {
      prevBtn.disabled = currentProducePage <= 1;
    }
    if (nextBtn) {
      nextBtn.disabled = currentProducePage >= totalPages;
    }

    if (!pagesContainer) return;
    pagesContainer.innerHTML = '';

    for (var i = 1; i <= totalPages; i++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'market-produce-pager__page' +
        (i === currentProducePage ? ' market-produce-pager__page--active' : '');
      btn.textContent = String(i);
      btn.setAttribute('aria-label', 'Go to produce page ' + i);
      if (i === currentProducePage) {
        btn.setAttribute('aria-current', 'page');
      }

      (function (pageNum) {
        btn.addEventListener('click', function () {
          if (currentProducePage !== pageNum) {
            currentProducePage = pageNum;
            renderProducePage();
          }
        });
      })(i);

      pagesContainer.appendChild(btn);
    }
  }

  function buildProduceCard(card, template, currentMonth) {
    var produce = card.data;
    var node = template.content.cloneNode(true);

    var image = node.querySelector('.market-produce-card__image');
    var icon = node.querySelector('.market-produce-card__icon');

    if (produce.image) {
      image.src = produce.image;
      image.alt = produce.name;
      // Same graceful degradation the produce cards use elsewhere: a broken
      // image hides itself and the leaf stand-in takes its place.
      image.onerror = function () {
        image.hidden = true;
        showProduceIcon(icon);
      };
    } else {
      image.hidden = true;
      showProduceIcon(icon);
    }

    node.querySelector('.market-produce-card__name').textContent = produce.name;

    var category = node.querySelector('.market-produce-card__category');
    if (produce.category) {
      category.textContent = produce.category;
    } else {
      category.hidden = true;
    }

    node.querySelector('.market-produce-card__badge').hidden = !card.main;

    var seasonLine = node.querySelector('.market-produce-card__season');
    var season = produce.season;

    if (season && season.label) {
      var inSeasonNow = (season.months || []).indexOf(currentMonth) !== -1;

      node.querySelector('.market-produce-card__season-text').textContent =
        inSeasonNow ? 'In season now' : season.label;

      // Highlight the seasons that are true right now, the same way the
      // Produces page marks what is in season this month.
      if (inSeasonNow) {
        seasonLine.classList.add('market-produce-card__season--now');
      }
    } else {
      seasonLine.hidden = true;
    }

    return node;
  }

  function showProduceIcon(icon) {
    if (!icon) return;
    icon.hidden = false;
    icon.innerHTML = PRODUCE_ICON_SVG;
  }

  function produceSummary(total, mainCount) {
    var label = total === 1 ? '1 produce item' : total + ' produce items';

    if (mainCount === 0) {
      return label + ' from the produce guide.';
    }

    return label + ' from the produce guide · ' + mainCount +
      (mainCount === 1
        ? ' is this market’s main produce.'
        : ' are this market’s main produce.');
  }

  /* ---------------------------------------------------------------------
   * Map — always corresponds to the market currently being viewed, never
   * one static map reused for every market:
   *   - real coordinates (if the data ever has them) render an embedded,
   *     per-market Google Maps iframe centered on that lat/lng;
   *   - today, every market's `coordinates` is still the documented
   *     { lat: null, lng: null } placeholder (no lat/lng exists anywhere
   *     in this project's data), so rather than inventing coordinates,
   *     the same embeddable Google Maps iframe is built from the market's
   *     real `address` field instead — this needs no API key and, unlike
   *     a plain "open in Google Maps" link, actually shows the map inline
   *     on the page, still fully driven by this market's own JSON data.
   * ------------------------------------------------------------------- */

  function renderMap(market) {
    var mapEl = document.getElementById('marketMap');
    var coords = market.coordinates || {};

    var query = null;
    if (typeof coords.lat === 'number' && typeof coords.lng === 'number') {
      query = coords.lat + ',' + coords.lng;
    } else if (market.address) {
      query = market.address;
    }

    if (!query) {
      // No coordinates AND no address on this market record — nothing
      // real to show a map for, so fall back to the placeholder rather
      // than embedding a blank/generic map.
      mapEl.dataset.mapState = 'unavailable';
      mapEl.innerHTML = '';
      var fallback = document.createElement('p');
      fallback.className = 'market-detail__map-placeholder';
      fallback.id = 'marketMapPlaceholder';
      fallback.textContent = "A map preview isn't available for this market yet.";
      mapEl.appendChild(fallback);
      return;
    }

    mapEl.dataset.mapState = 'ready';
    mapEl.innerHTML = '';

    var iframe = document.createElement('iframe');
    iframe.title = market.name + ' location map';
    iframe.width = '100%';
    iframe.height = '100%';
    iframe.style.border = '0';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.src = 'https://www.google.com/maps?q=' + encodeURIComponent(query) + '&output=embed';

    mapEl.appendChild(iframe);
  }

  /* ---------------------------------------------------------------------
   * Orchestration
   * ------------------------------------------------------------------- */

  var statusTimer = null;

  function renderMarket(market) {
    var now = new Date();

    renderHeader(market);
    renderBookmark(market);
    renderSchedule(market, now);
    renderProduce(market);
    renderMap(market);

    updateOpenStatus(market);
    if (statusTimer) {
      window.clearInterval(statusTimer);
    }
    statusTimer = window.setInterval(function () {
      updateOpenStatus(market);
    }, 30000);

    showContent();
  }

  function init() {
    var id = getMarketId();
    if (!id) {
      showNotFound();
      return;
    }

    // Both data files are loaded together: marketdetails.json drives the
    // page, produces.json drives the market-produces section. A failure in
    // the produce guide alone must not take the page down, so it resolves to
    // an empty list and the section falls back to this market's own produce.
    Promise.all([
      loadMarkets(),
      loadProduces().catch(function () { return []; })
    ])
      .then(function (results) {
        allProduces = results[1] || [];

        var market = findMarket(results[0], id);
        if (!market) {
          showNotFound();
          return;
        }
        renderMarket(market);
      })
      .catch(function () {
        showLoadError();
      });
  }

  init();
})();

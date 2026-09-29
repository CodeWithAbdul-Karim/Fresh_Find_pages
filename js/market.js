(function () {
  'use strict';

  /* ---------------------------------------------------------------------
   * Clock — browser local time, updates every second, no refresh needed
   * ------------------------------------------------------------------- */

  var clockEl = document.getElementById('clock');

  function updateClock() {
    if (!clockEl) return;
    var now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    clockEl.setAttribute('datetime', now.toISOString());
  }

  if (clockEl) {
    updateClock();
    setInterval(updateClock, 1000);
  }

  /* ---------------------------------------------------------------------
   * Shared day constants
   * ------------------------------------------------------------------- */

  // Display order, Monday-first (matches the schedule JSON keys)
  var DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  var DAY_LABEL = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
    friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
  };
  var DAY_LABEL_FULL = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
    friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
  };
  // Date.getDay() order, Sunday-first — used to read "today" off the clock
  var DATE_DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  /* ---------------------------------------------------------------------
   * Small time helpers
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
   * Open/Closed status engine
   *
   * Reads the market's weekly schedule plus the current browser day/time
   * and works out whether it is open right now, when it next closes, or
   * when it will next open. Schedules that cross midnight (e.g. an
   * evening market open 18:00 -> 01:00) are supported: a session that
   * started "yesterday" and hasn't closed yet still counts as open now.
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
      whenLabel = DAY_LABEL[next.dayKey];
    }

    var openMin = next.date.getHours() * 60 + next.date.getMinutes();
    return {
      open: false,
      nextDate: next.date,
      label: 'Closed · opens ' + whenLabel + ', ' + minutesToLabel(openMin)
    };
  }

  /* ---------------------------------------------------------------------
   * Display helpers reused from Part 2 (day/hour summaries for the card)
   * ------------------------------------------------------------------- */

  function openDayKeys(schedule) {
    return DAY_ORDER.filter(function (day) {
      return schedule[day] !== null;
    });
  }

  function summarizeDays(schedule) {
    var openDays = openDayKeys(schedule);
    if (openDays.length === 7) {
      return 'Daily';
    }
    if (openDays.length === 0) {
      return 'Closed this week';
    }

    var ranges = [];
    var rangeStart = openDays[0];
    var rangeEnd = openDays[0];

    for (var i = 1; i <= openDays.length; i++) {
      var currentIndex = DAY_ORDER.indexOf(openDays[i]);
      var previousIndex = DAY_ORDER.indexOf(rangeEnd);

      if (i < openDays.length && currentIndex === previousIndex + 1) {
        rangeEnd = openDays[i];
        continue;
      }

      ranges.push(rangeStart === rangeEnd ? DAY_LABEL[rangeStart] : DAY_LABEL[rangeStart] + '–' + DAY_LABEL[rangeEnd]);

      if (i < openDays.length) {
        rangeStart = openDays[i];
        rangeEnd = openDays[i];
      }
    }

    return ranges.join(', ');
  }

  function summarizeHours(schedule) {
    var openDays = openDayKeys(schedule);
    if (openDays.length === 0) {
      return '—';
    }

    var first = schedule[openDays[0]];
    var consistent = openDays.every(function (day) {
      return schedule[day].open === first.open && schedule[day].close === first.close;
    });

    if (consistent) {
      return formatTime(first.open) + ' – ' + formatTime(first.close);
    }

    return 'Hours vary by day';
  }

  /* ---------------------------------------------------------------------
   * Bookmarks — frontend-only, persisted in localStorage, keyed by id
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
      // Storage unavailable (private browsing, quota, etc.) — fail silently,
      // the toggle still works for the current page view.
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
    // Show bookmark toast
    showBookmarkToast(bookmarkedIds.indexOf(id) !== -1);
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

  /* ---------------------------------------------------------------------
   * Bookmark toast — bottom-left notification on save / unsave
   * ------------------------------------------------------------------- */

  var toastTimer = null;

  function showBookmarkToast(saved) {
    var toast = document.getElementById('ffBookmarkToast');
    if (!toast) return;
    // Update icon + message
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
   * App state
   * ------------------------------------------------------------------- */

  var allMarkets = [];
  var statusCache = {}; // id -> latest computed status, refreshed on an interval
  var cardRefs = {};    // id -> { statusEl, scheduleItems }

  var INITIAL_VISIBLE = 9999; // show all cards always
  var showingAll = true;

  var filterState = {
    search: '',
    area: 'all',
    day: 'all',
    produce: 'all',
    sort: 'az'
  };

  /* ---------------------------------------------------------------------
   * Geolocation — cached user position for proximity sort
   * ------------------------------------------------------------------- */

  var userLocation = null;      // { lat, lng } once resolved
  var geoRequested = false;     // true once we've called geolocation API
  var geoStatusEl  = null;      // inline status pill shown in toolbar

  /* Haversine distance in km between two lat/lng points */
  function haversineKm(lat1, lng1, lat2, lng2) {
    var R    = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function distanceFromUser(market) {
    if (!userLocation || market.lat == null || market.lng == null) return Infinity;
    return haversineKm(userLocation.lat, userLocation.lng, market.lat, market.lng);
  }

  function showGeoStatus(text, isError) {
    if (!geoStatusEl) {
      geoStatusEl = document.createElement('p');
      geoStatusEl.className = 'directory__geo-status';
      var toolbar = document.getElementById('directoryToolbar');
      if (toolbar) toolbar.parentNode.insertBefore(geoStatusEl, toolbar.nextSibling);
    }
    geoStatusEl.textContent = text;
    geoStatusEl.dataset.error = isError ? 'true' : 'false';
    geoStatusEl.hidden = false;
  }

  function hideGeoStatus() {
    if (geoStatusEl) geoStatusEl.hidden = true;
  }

  function requestGeolocation(onSuccess) {
    if (!navigator.geolocation) {
      showGeoStatus('Your browser does not support location. Showing A–Z order instead.', true);
      document.getElementById('sortBy').value = 'az';
      filterState.sort = 'az';
      render();
      return;
    }
    showGeoStatus('📍 Getting your location…', false);
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        hideGeoStatus();
        if (onSuccess) onSuccess();
      },
      function () {
        showGeoStatus('Location access denied. Showing A–Z order instead.', true);
        document.getElementById('sortBy').value = 'az';
        filterState.sort = 'az';
        // Reset custom dropdown label too
        var dd = document.querySelector('.ff-dropdown[data-for="sortBy"]');
        if (dd && dd._resetDropdown) dd._resetDropdown();
        render();
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  }

  /* ---------------------------------------------------------------------
   * Filtering + sorting
   * ------------------------------------------------------------------- */

  function matchesFilters(market) {
    if (filterState.area !== 'all' && market.area !== filterState.area) {
      return false;
    }

    if (filterState.day !== 'all' && market.schedule[filterState.day] === null) {
      return false;
    }

    if (filterState.produce !== 'all' && market.produceTypes.indexOf(filterState.produce) === -1) {
      return false;
    }

    var query = filterState.search.trim().toLowerCase();
    if (query) {
      var haystack = [
        market.name,
        market.area,
        market.address,
        market.description,
        market.produce.join(' ')
      ].join(' ').toLowerCase();

      if (haystack.indexOf(query) === -1) {
        return false;
      }
    }

    return true;
  }

  function sortMarkets(markets, now) {
    var sorted = markets.slice();

    if (filterState.sort === 'az') {
      sorted.sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
    } else if (filterState.sort === 'za') {
      sorted.sort(function (a, b) {
        return b.name.localeCompare(a.name);
      });
    } else if (filterState.sort === 'status') {
      sorted.sort(function (a, b) {
        var statusA = statusCache[a.id] || computeStatus(a, now);
        var statusB = statusCache[b.id] || computeStatus(b, now);

        if (statusA.open !== statusB.open) {
          return statusA.open ? -1 : 1;
        }

        if (statusA.open) {
          return statusA.closeDate - statusB.closeDate;
        }

        var nextA = statusA.nextDate ? statusA.nextDate.getTime() : Infinity;
        var nextB = statusB.nextDate ? statusB.nextDate.getTime() : Infinity;
        return nextA - nextB;
      });
    } else if (filterState.sort === 'proximity') {
      sorted.sort(function (a, b) {
        return distanceFromUser(a) - distanceFromUser(b);
      });
    }

    return sorted;
  }

  /* ---------------------------------------------------------------------
   * Rendering
   * ------------------------------------------------------------------- */

  function buildCard(market, now, template) {
    var card = template.content.cloneNode(true);
    var article = card.querySelector('.market-card');
    article.dataset.id = market.id;

    var image = card.querySelector('.market-card__image');
    image.src = market.image;
    image.alt = market.name + ' market stalls';
    image.addEventListener('error', function () {
      image.hidden = true;
    });

    card.querySelector('.market-card__name').textContent = market.name;
    card.querySelector('.market-card__area-text').textContent = market.area;
    card.querySelector('.market-card__description').textContent = market.description;
    card.querySelector('.market-card__days').textContent = summarizeDays(market.schedule);
    card.querySelector('.market-card__hours').textContent = summarizeHours(market.schedule);

    // Distance chip — visible only when proximity sort is active
    var distanceChip = card.querySelector('.market-card__distance');
    if (distanceChip) {
      if (filterState.sort === 'proximity' && userLocation) {
        var km = distanceFromUser(market);
        distanceChip.textContent = km === Infinity ? '' : (km < 1 ? '< 1 km away' : km.toFixed(1) + ' km away');
        distanceChip.hidden = km === Infinity;
      } else {
        distanceChip.hidden = true;
      }
    }

    // Navigates to the dedicated Market Details page instead of the old
    // in-card expand/collapse. Uses market.slug (already present in
    // market.json, previously unused) so the URL matches the id
    // marketdetails.json/marketdetails.js key their markets by.
    var detailsLink = card.querySelector('.market-card__details');
    detailsLink.href = 'marketdetails.html?id=' + encodeURIComponent(market.slug);

    var bookmarkButton = card.querySelector('.market-card__bookmark');
    bookmarkButton.dataset.id = market.id;
    bookmarkButton.setAttribute('aria-pressed', String(isBookmarked(market.id)));
    bookmarkButton.addEventListener('click', function () {
      toggleBookmark(market.id);
      bookmarkButton.setAttribute('aria-pressed', String(isBookmarked(market.id)));
    });

    var statusEl = card.querySelector('.market-card__status');
    var status = computeStatus(market, now);
    statusCache[market.id] = status;
    statusEl.textContent = status.label;
    statusEl.dataset.status = status.open ? 'open' : 'closed';

    cardRefs[market.id] = { statusEl: statusEl };

    return card;
  }

  function render() {
    var grid     = document.getElementById('marketGrid');
    var countEl  = document.getElementById('resultCount');
    var emptyEl  = document.getElementById('noResults');
    var moreWrap = document.getElementById('directoryMore');
    var moreBtn  = document.getElementById('showMoreBtn');
    var template = document.getElementById('marketCardTemplate');
    var now = new Date();

    cardRefs = {};

    var filtered = allMarkets.filter(matchesFilters);
    var sorted   = sortMarkets(filtered, now);

    // When filters change, reset to initial view
    var visible = showingAll ? sorted.length : Math.min(INITIAL_VISIBLE, sorted.length);
    var toRender = sorted.slice(0, visible);

    grid.innerHTML = '';
    var fragment = document.createDocumentFragment();
    toRender.forEach(function (market) {
      fragment.appendChild(buildCard(market, now, template));
    });
    grid.appendChild(fragment);

    // Count line
    var total = allMarkets.length;
    var shown = sorted.length;
    countEl.hidden = false;
    countEl.textContent = shown === total
      ? 'Showing all ' + total + ' markets'
      : 'Showing ' + shown + ' of ' + total + ' markets';

    // Show More button
    var needsMore = sorted.length > INITIAL_VISIBLE;
    moreWrap.hidden = !needsMore;
    if (needsMore) {
      var btnText = moreWrap.querySelector('.directory__more-btn-text');
      var btnSvg  = moreWrap.querySelector('svg');
      if (showingAll) {
        btnText.textContent = 'Show less';
        btnSvg.style.transform = 'rotate(180deg)';
      } else {
        btnText.textContent = 'Show ' + (sorted.length - INITIAL_VISIBLE) + ' more markets';
        btnSvg.style.transform = 'rotate(0deg)';
      }
    }

    if (shown === 0) {
      grid.hidden = true;
      emptyEl.hidden = false;
    } else {
      grid.hidden = false;
      emptyEl.hidden = true;
      observeCards();
    }
  }

  /* ---------------------------------------------------------------------
   * Live status refresh — recomputes each card's pill on an interval
   * without re-rendering the whole grid (keeps expanded/bookmarked state
   * intact).
   * ------------------------------------------------------------------- */

  function refreshStatuses() {
    if (!allMarkets.length) return;
    var now = new Date();

    allMarkets.forEach(function (market) {
      var refs = cardRefs[market.id];
      if (!refs) return; // not currently rendered (filtered out)

      var status = computeStatus(market, now);
      statusCache[market.id] = status;
      refs.statusEl.textContent = status.label;
      refs.statusEl.dataset.status = status.open ? 'open' : 'closed';
    });
  }

  setInterval(refreshStatuses, 30000);

  /* ---------------------------------------------------------------------
   * Custom dropdowns — themed replacements for native <select>
   *
   * Each .ff-dropdown[data-for="<id>"] wraps a hidden <select>.
   * Selecting an option:
   *   1. Updates the visible trigger label
   *   2. Marks the option selected (aria + class)
   *   3. Sets .is-active on the wrapper when value !== default ("all" / "az")
   *   4. Programmatically fires a "change" event on the real <select>
   *      so existing filter/sort listeners work untouched.
   * ------------------------------------------------------------------- */

  function initDropdowns() {
    var dropdowns = document.querySelectorAll('.ff-dropdown');

    dropdowns.forEach(function (dd) {
      var selectId  = dd.dataset.for;
      var nativeSel = document.getElementById(selectId);
      var trigger   = dd.querySelector('.ff-dropdown__trigger');
      var panel     = dd.querySelector('.ff-dropdown__panel');
      var options   = dd.querySelectorAll('.ff-dropdown__option');
      var labelEl   = dd.querySelector('.ff-dropdown__label');

      /* -- open / close -- */
      function openDropdown() {
        // Close every other open dropdown first
        document.querySelectorAll('.ff-dropdown.is-open').forEach(function (other) {
          if (other !== dd) closeDropdown(other);
        });
        dd.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        // Focus the currently selected option
        var sel = panel.querySelector('.ff-dropdown__option--selected');
        if (sel) sel.focus();
      }

      function closeDropdown(target) {
        target = target || dd;
        target.classList.remove('is-open');
        target.querySelector('.ff-dropdown__trigger')
              .setAttribute('aria-expanded', 'false');
      }

      trigger.addEventListener('click', function () {
        if (dd.classList.contains('is-open')) {
          closeDropdown();
        } else {
          openDropdown();
        }
      });

      /* -- option selection -- */
      options.forEach(function (opt) {
        // Make options focusable
        opt.setAttribute('tabindex', '-1');

        opt.addEventListener('click', function () {
          selectOption(opt.dataset.value, opt.textContent.trim());
          closeDropdown();
          trigger.focus();
        });

        opt.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectOption(opt.dataset.value, opt.textContent.trim());
            closeDropdown();
            trigger.focus();
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            var next = opt.nextElementSibling;
            if (next) next.focus();
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            var prev = opt.previousElementSibling;
            if (prev) prev.focus();
            else trigger.focus();
          }
          if (e.key === 'Escape') {
            closeDropdown();
            trigger.focus();
          }
        });
      });

      /* -- keyboard on trigger -- */
      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!dd.classList.contains('is-open')) openDropdown();
          else {
            var first = panel.querySelector('.ff-dropdown__option');
            if (first) first.focus();
          }
        }
        if (e.key === 'Escape') {
          closeDropdown();
        }
      });

      function selectOption(value, text) {
        // Update label
        labelEl.textContent = text;

        // Update option states
        options.forEach(function (o) {
          var isThis = o.dataset.value === value;
          o.classList.toggle('ff-dropdown__option--selected', isThis);
          o.setAttribute('aria-selected', String(isThis));
        });

        // Active tint when non-default value chosen
        var defaultVal = nativeSel.options[0].value;
        dd.classList.toggle('is-active', value !== defaultVal);

        // Sync hidden native select and fire change
        nativeSel.value = value;
        nativeSel.dispatchEvent(new Event('change', { bubbles: true }));
      }

      /* Expose a reset helper on the element itself */
      dd._resetDropdown = function () {
        var defaultOpt = options[0];
        selectOption(defaultOpt.dataset.value, defaultOpt.textContent.trim());
      };
    });

    /* -- close on outside click -- */
    document.addEventListener('click', function (e) {
      document.querySelectorAll('.ff-dropdown.is-open').forEach(function (dd) {
        if (!dd.contains(e.target)) {
          dd.classList.remove('is-open');
          dd.querySelector('.ff-dropdown__trigger')
            .setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  initDropdowns();

  /* ---------------------------------------------------------------------
   * Scroll reveal — IntersectionObserver fades elements in as they
   * enter the viewport. Cards are observed after each render() call.
   * ------------------------------------------------------------------- */

  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target); // fire once only
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  /* Observe static [data-reveal] elements immediately */
  document.querySelectorAll('[data-reveal]').forEach(function (el) {
    revealObserver.observe(el);
  });

  /* Called after render() to observe freshly injected cards */
  function observeCards() {
    var grid = document.getElementById('marketGrid');
    grid.querySelectorAll('.market-card').forEach(function (card) {
      if (!card.classList.contains('is-visible')) {
        revealObserver.observe(card);
      }
    });
  }

  /* ---------------------------------------------------------------------
   * Toolbar wiring — search, filters, sort, reset
   * ------------------------------------------------------------------- */

  var directoryInput = document.getElementById('directorySearch');
  var searchDebounceTimer = null;

  function setSearchValue(value, skipRender) {
    filterState.search = value;
    if (directoryInput.value !== value) directoryInput.value = value;
    if (!skipRender) render();
  }

  function debouncedSearch(value) {
    filterState.search = value;
    showingAll = false;
    if (directoryInput.value !== value) directoryInput.value = value;
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(render, 150);
  }

  directoryInput.addEventListener('input', function (event) {
    debouncedSearch(event.target.value);
  });

  document.getElementById('filterArea').addEventListener('change', function (event) {
    filterState.area = event.target.value;
    showingAll = false;
    render();
  });

  document.getElementById('filterDay').addEventListener('change', function (event) {
    filterState.day = event.target.value;
    showingAll = false;
    render();
  });

  document.getElementById('filterProduce').addEventListener('change', function (event) {
    filterState.produce = event.target.value;
    showingAll = false;
    render();
  });

  document.getElementById('sortBy').addEventListener('change', function (event) {
    filterState.sort = event.target.value;
    showingAll = false;

    if (filterState.sort === 'proximity') {
      if (userLocation) {
        // Already have location — sort immediately
        render();
      } else {
        // Request location first, then render on success
        requestGeolocation(function () {
          render();
        });
      }
    } else {
      hideGeoStatus();
      render();
    }
  });

  document.getElementById('resetFilters').addEventListener('click', function () {
    filterState = { search: '', area: 'all', day: 'all', produce: 'all', sort: 'az' };
    showingAll = false;
    directoryInput.value = '';
    document.getElementById('filterArea').value = 'all';
    document.getElementById('filterDay').value = 'all';
    document.getElementById('filterProduce').value = 'all';
    document.getElementById('sortBy').value = 'az';
    hideGeoStatus();
    // Reset custom dropdown UI
    document.querySelectorAll('.ff-dropdown').forEach(function (dd) {
      if (dd._resetDropdown) dd._resetDropdown();
    });
    render();
  });

  /* Show More / Show Less */
  var showMoreBtn = document.getElementById('showMoreBtn');
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', function () {
      showingAll = !showingAll;
      render();
      if (!showingAll) {
        var directory = document.getElementById('directory');
        directory.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  /* ---------------------------------------------------------------------
   * Hero search — applies the search and smoothly hands off to the
   * Directory, showing matching results there.
   * ------------------------------------------------------------------- */

  var directory = document.getElementById('directory');
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* CTA "Explore the directory" — smooth scroll without adding #directory
     to the URL (prevents the page from loading mid-scroll on next visit) */
  var exploreCta = document.getElementById('heroExploreCta');
  if (exploreCta) {
    exploreCta.addEventListener('click', function (event) {
      event.preventDefault();
      directory.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
      directory.focus({ preventScroll: true });
    });
  }

  /* ---------------------------------------------------------------------
   * Data loading
   * ------------------------------------------------------------------- */

  fetch('data/market.json')
    .then(function (response) {
      if (!response.ok) {
        throw new Error('Failed to load market data');
      }
      return response.json();
    })
    .then(function (markets) {
      allMarkets = markets;
      document.getElementById('directoryStatus').hidden = true;
      var toolbar = document.getElementById('directoryToolbar');
      toolbar.hidden = false;
      revealObserver.observe(toolbar);
      render();
    })
    .catch(function () {
      var status = document.getElementById('directoryStatus');
      status.textContent = 'Markets couldn\'t be loaded right now. Please try again shortly.';
    });
})();

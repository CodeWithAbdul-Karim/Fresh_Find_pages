/* =========================================================
   FreshFind — Bookmarks Page
   bookmarks.js  (Part 1 + Part 2 combined)

   Vanilla JS, IIFE, ES5-style. Consistent with every other
   JS file in the project — no arrow functions, no let/const.

   Responsibilities (Part 1 — unchanged architecture):
     1. Read freshfind:bookmarks from localStorage
     2. Resolve each ID as market or produce
     3. Render cards using existing market-card / produce-card styles
     4. Remove bookmarks with fade animation
     5. Sync navbar badge + summary counters
     6. Cross-tab storage event + visibility-change refresh

   Added in Part 2:
     7. Personal notes — sessionStorage key freshfind:bookmark-notes
     8. Note UI per card (Add / Edit / Save / Cancel + preview)
     9. Export to .txt (browser-side, no backend)
    10. Share via Web Share API or clipboard fallback
    11. Clear All with confirmation — clears only the two FF keys
    12. Actions bar visibility tied to total bookmark count
   ========================================================= */

(function () {
  'use strict';

  /* -------------------------------------------------------------------
   * Storage keys
   * ----------------------------------------------------------------- */

  var BOOKMARK_KEY = 'freshfind:bookmarks';
  var NOTES_KEY    = 'freshfind:bookmark-notes';

  /* -------------------------------------------------------------------
   * Day constants — same as market.js
   * ----------------------------------------------------------------- */

  var DAY_ORDER = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  var DAY_LABEL = {
    monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu',
    friday:'Fri', saturday:'Sat', sunday:'Sun'
  };
  var DATE_DAY_KEYS = [
    'sunday','monday','tuesday','wednesday','thursday','friday','saturday'
  ];

  /* -------------------------------------------------------------------
   * Bookmark storage helpers — identical to market.js / produces.js
   * ----------------------------------------------------------------- */

  function loadBookmarks() {
    try {
      var raw = window.localStorage.getItem(BOOKMARK_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveBookmarks(ids) {
    try { window.localStorage.setItem(BOOKMARK_KEY, JSON.stringify(ids)); }
    catch (e) { /* storage unavailable */ }
  }

  function removeBookmark(id) {
    var ids = loadBookmarks();
    var idx = ids.indexOf(id);
    if (idx !== -1) { ids.splice(idx, 1); saveBookmarks(ids); }
    // Also remove the associated note so no orphan data remains
    removeNote(id);
    return ids;
  }

  /* -------------------------------------------------------------------
   * Notes — sessionStorage only, keyed by item ID
   * ----------------------------------------------------------------- */

  function loadAllNotes() {
    try {
      var raw = window.sessionStorage.getItem(NOTES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveAllNotes(notes) {
    try { window.sessionStorage.setItem(NOTES_KEY, JSON.stringify(notes)); }
    catch (e) { /* storage unavailable */ }
  }

  function getNote(id) {
    return loadAllNotes()[id] || '';
  }

  function setNote(id, text) {
    var notes = loadAllNotes();
    var trimmed = text.trim();
    if (trimmed) {
      notes[id] = trimmed;
    } else {
      delete notes[id];
    }
    saveAllNotes(notes);
  }

  function removeNote(id) {
    var notes = loadAllNotes();
    delete notes[id];
    saveAllNotes(notes);
  }

  function clearAllNotes() {
    try { window.sessionStorage.removeItem(NOTES_KEY); }
    catch (e) { /* ignore */ }
  }

  /* -------------------------------------------------------------------
   * ID type detection
   * ----------------------------------------------------------------- */

  function isMarketId(id) {
    return typeof id === 'string' && /^market-\d+$/.test(id);
  }

  function isProduceId(id) {
    return typeof id === 'string' && /^produce-\d+$/.test(id);
  }

  /* -------------------------------------------------------------------
   * Time helpers — ported unchanged from market.js
   * ----------------------------------------------------------------- */

  function parseTimeToMinutes(v) {
    var p = v.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function formatTime(v) {
    var p = v.split(':');
    var h = parseInt(p[0], 10);
    var suffix = h >= 12 ? 'PM' : 'AM';
    var dh = h % 12 === 0 ? 12 : h % 12;
    return dh + ':' + p[1] + ' ' + suffix;
  }

  function minutesToLabel(mins) {
    var n = ((mins % 1440) + 1440) % 1440;
    var h = Math.floor(n / 60);
    var m = n % 60;
    return formatTime((h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m);
  }

  function isSameCalendarDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth()    === b.getMonth()    &&
           a.getDate()     === b.getDate();
  }

  /* -------------------------------------------------------------------
   * Status engine — ported unchanged from market.js
   * ----------------------------------------------------------------- */

  function scheduleForDay(schedule, dayKey) {
    var day = schedule[dayKey];
    if (!day) return null;
    var open  = parseTimeToMinutes(day.open);
    var close = parseTimeToMinutes(day.close);
    return { open: open, close: close, crosses: close <= open };
  }

  function findNextOpening(schedule, now) {
    var nowMin   = now.getHours() * 60 + now.getMinutes();
    var todayIdx = now.getDay();
    for (var offset = 0; offset <= 7; offset++) {
      var idx  = (todayIdx + offset) % 7;
      var key  = DATE_DAY_KEYS[idx];
      var sched = scheduleForDay(schedule, key);
      if (!sched) continue;
      if (offset === 0 && sched.open <= nowMin) continue;
      var date = new Date(now);
      date.setDate(now.getDate() + offset);
      date.setHours(Math.floor(sched.open / 60), sched.open % 60, 0, 0);
      return { date: date, dayKey: key };
    }
    return null;
  }

  function computeStatus(market, now) {
    var todayIdx    = now.getDay();
    var todayKey    = DATE_DAY_KEYS[todayIdx];
    var yesterdayKey = DATE_DAY_KEYS[(todayIdx + 6) % 7];
    var nowMin      = now.getHours() * 60 + now.getMinutes();

    var yesterday = scheduleForDay(market.schedule, yesterdayKey);
    if (yesterday && yesterday.crosses && nowMin < yesterday.close) {
      return { open: true, label: 'Open now \xB7 closes ' + minutesToLabel(yesterday.close) };
    }

    var today = scheduleForDay(market.schedule, todayKey);
    if (today) {
      if (!today.crosses && nowMin >= today.open && nowMin < today.close) {
        return { open: true, label: 'Open now \xB7 closes ' + minutesToLabel(today.close) };
      }
      if (today.crosses && nowMin >= today.open) {
        return { open: true, label: 'Open now \xB7 closes ' + minutesToLabel(today.close) };
      }
    }

    var next = findNextOpening(market.schedule, now);
    if (!next) return { open: false, label: 'Closed' };

    var tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    var whenLabel = isSameCalendarDay(next.date, now)      ? 'today'
                  : isSameCalendarDay(next.date, tomorrow) ? 'tomorrow'
                  : DAY_LABEL[next.dayKey];
    var openMin = next.date.getHours() * 60 + next.date.getMinutes();
    return { open: false, label: 'Closed \xB7 opens ' + whenLabel + ', ' + minutesToLabel(openMin) };
  }

  /* -------------------------------------------------------------------
   * Schedule display helpers — ported from market.js
   * ----------------------------------------------------------------- */

  function openDayKeys(schedule) {
    return DAY_ORDER.filter(function (d) { return schedule[d] !== null; });
  }

  function summarizeDays(schedule) {
    var openDays = openDayKeys(schedule);
    if (openDays.length === 7) return 'Daily';
    if (openDays.length === 0) return 'Closed this week';
    var ranges = [], rangeStart = openDays[0], rangeEnd = openDays[0];
    for (var i = 1; i <= openDays.length; i++) {
      var ci = DAY_ORDER.indexOf(openDays[i]);
      var pi = DAY_ORDER.indexOf(rangeEnd);
      if (i < openDays.length && ci === pi + 1) { rangeEnd = openDays[i]; continue; }
      ranges.push(rangeStart === rangeEnd
        ? DAY_LABEL[rangeStart]
        : DAY_LABEL[rangeStart] + '\u2013' + DAY_LABEL[rangeEnd]);
      if (i < openDays.length) { rangeStart = openDays[i]; rangeEnd = openDays[i]; }
    }
    return ranges.join(', ');
  }

  function summarizeHours(schedule) {
    var openDays = openDayKeys(schedule);
    if (openDays.length === 0) return '\u2014';
    var first = schedule[openDays[0]];
    var consistent = openDays.every(function (d) {
      return schedule[d].open === first.open && schedule[d].close === first.close;
    });
    return consistent
      ? formatTime(first.open) + ' \u2013 ' + formatTime(first.close)
      : 'Hours vary by day';
  }

  /* -------------------------------------------------------------------
   * App state — JSON loaded once and cached
   * ----------------------------------------------------------------- */

  var allMarkets  = [];
  var allProduces = [];

  /* -------------------------------------------------------------------
   * Navbar badge
   * ----------------------------------------------------------------- */

  function updateNavbarBadge(count) {
    if (window.FreshFindNavbar && window.FreshFindNavbar.setBookmarkCount) {
      window.FreshFindNavbar.setBookmarkCount(count);
    } else {
      var el  = document.getElementById('ffBookmarkCount');
      var btn = document.getElementById('ffBookmarkBtn');
      if (el)  el.textContent = String(count);
      if (btn) btn.setAttribute('aria-label', 'View saved items (' + count + ')');
    }
  }

  /* -------------------------------------------------------------------
   * Summary counters + actions bar
   * ----------------------------------------------------------------- */

  function updateSummary(marketIds, produceIds) {
    var total = marketIds.length + produceIds.length;
    document.getElementById('bmCountTotal').textContent   = String(total);
    document.getElementById('bmCountMarkets').textContent = String(marketIds.length);
    document.getElementById('bmCountProduce').textContent = String(produceIds.length);
    document.getElementById('bmMarketsBadge').textContent = String(marketIds.length);
    document.getElementById('bmProduceBadge').textContent = String(produceIds.length);
    updateNavbarBadge(total);

    // Show/hide the actions bar
    document.getElementById('bmActionsBar').hidden = total === 0;
  }

  /* -------------------------------------------------------------------
   * Section visibility
   * ----------------------------------------------------------------- */

  function syncSectionVisibility(marketIds, produceIds) {
    var total = marketIds.length + produceIds.length;
    document.getElementById('bmEmptyGlobal').hidden    = total > 0;
    document.getElementById('bmMarketsSection').hidden = marketIds.length === 0;
    document.getElementById('bmProduceSection').hidden = produceIds.length === 0;
  }

  /* -------------------------------------------------------------------
   * Note widget builder
   * Returns a DOM element to drop into .bm-note-slot.
   * ----------------------------------------------------------------- */

  function buildNoteWidget(id) {
    var slot = document.createElement('div');
    slot.className = 'bm-note-slot';

    var existingNote = getNote(id);

    // --- Preview line (shown when note exists, hidden when form is open) ---
    var preview = document.createElement('div');
    preview.className = 'bm-note-preview';
    preview.hidden = !existingNote;

    var previewIcon = document.createElement('span');
    previewIcon.className = 'bm-note-preview__icon';
    previewIcon.innerHTML =
      '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true">' +
      '<path d="M2 9.5l.7-2.3L8.5 1.4a.7.7 0 0 1 1 0l1.1 1.1a.7.7 0 0 1 0 1L4.3 9.3 2 9.5z"' +
      ' stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>' +
      '</svg>';

    var previewText = document.createElement('span');
    previewText.className = 'bm-note-preview__text';
    previewText.textContent = existingNote;

    // --- Delete note button (cross) ---
    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'bm-note-delete';
    deleteBtn.setAttribute('aria-label', 'Remove note');
    deleteBtn.innerHTML =
      '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true">' +
      '<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
      '</svg>';

    preview.appendChild(previewIcon);
    preview.appendChild(previewText);
    preview.appendChild(deleteBtn);

    // --- Trigger button (Add Note / Edit Note) ---
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'bm-note-trigger';
    trigger.innerHTML =
      '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true">' +
      '<path d="M2 9.5l.7-2.3L8.5 1.4a.7.7 0 0 1 1 0l1.1 1.1a.7.7 0 0 1 0 1L4.3 9.3 2 9.5z"' +
      ' stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>' +
      '</svg>';
    var triggerLabel = document.createElement('span');
    triggerLabel.textContent = existingNote ? 'Edit Note' : 'Add Note';
    trigger.appendChild(triggerLabel);
    trigger.setAttribute('aria-label', (existingNote ? 'Edit' : 'Add') + ' note for this item');

    // --- Edit form ---
    var form = document.createElement('div');
    form.className = 'bm-note-form';
    form.hidden = true;

    var textarea = document.createElement('textarea');
    textarea.className = 'bm-note-textarea';
    textarea.rows = 3;
    textarea.maxLength = 400;
    textarea.placeholder = 'Add a personal note… (max 400 characters)';
    textarea.value = existingNote;
    textarea.setAttribute('aria-label', 'Personal note');

    var formActions = document.createElement('div');
    formActions.className = 'bm-note-form-actions';

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'bm-note-save';
    saveBtn.textContent = 'Save Note';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'bm-note-cancel';
    cancelBtn.textContent = 'Cancel';

    formActions.appendChild(saveBtn);
    formActions.appendChild(cancelBtn);
    form.appendChild(textarea);
    form.appendChild(formActions);

    // --- Wire interactions ---

    function showEl(el) {
      el.hidden = false;
      el.classList.remove('bm-note--exit');
      el.classList.add('bm-note--enter');
    }

    function hideEl(el, cb) {
      el.classList.remove('bm-note--enter');
      el.classList.add('bm-note--exit');
      el.addEventListener('animationend', function handler() {
        el.removeEventListener('animationend', handler);
        el.hidden = true;
        el.classList.remove('bm-note--exit');
        if (cb) cb();
      }, { once: true });
    }

    function openForm() {
      textarea.value = getNote(id);
      hideEl(trigger, function () {
        showEl(form);
        textarea.focus();
      });
      if (!preview.hidden) hideEl(preview);
    }

    function closeForm() {
      var current = getNote(id);
      hideEl(form, function () {
        if (current) {
          previewText.textContent = current;
          showEl(preview);
        }
        triggerLabel.textContent = current ? 'Edit Note' : 'Add Note';
        trigger.setAttribute('aria-label', (current ? 'Edit' : 'Add') + ' note for this item');
        showEl(trigger);
      });
    }

    trigger.addEventListener('click', openForm);

    deleteBtn.addEventListener('click', function () {
      setNote(id, '');
      hideEl(preview, function () {
        triggerLabel.textContent = 'Add Note';
        trigger.setAttribute('aria-label', 'Add note for this item');
        showEl(trigger);
      });
    });

    saveBtn.addEventListener('click', function () {
      setNote(id, textarea.value);
      closeForm();
    });

    cancelBtn.addEventListener('click', closeForm);

    // Save on Ctrl/Cmd+Enter inside textarea
    textarea.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        setNote(id, textarea.value);
        closeForm();
      }
      if (event.key === 'Escape') {
        closeForm();
      }
    });

    slot.appendChild(preview);
    slot.appendChild(trigger);
    slot.appendChild(form);
    return slot;
  }

  /* -------------------------------------------------------------------
   * Market card rendering
   * ----------------------------------------------------------------- */

  function buildMarketCard(market, onRemove) {
    var template = document.getElementById('bmMarketCardTemplate');
    var node     = template.content.cloneNode(true);
    var article  = node.querySelector('.market-card');
    article.dataset.id = market.id;

    var image = node.querySelector('.market-card__image');
    image.src = market.image;
    image.alt = market.name + ' market stalls';
    image.onerror = function () { image.hidden = true; };

    var statusEl = node.querySelector('.market-card__status');
    var status   = computeStatus(market, new Date());
    statusEl.textContent       = status.label;
    statusEl.dataset.status    = status.open ? 'open' : 'closed';

    var removeBtn = node.querySelector('.bm-remove-btn');
    removeBtn.setAttribute('aria-label', 'Remove ' + market.name + ' from bookmarks');
    removeBtn.addEventListener('click', function () { onRemove(market.id, article); });

    node.querySelector('.market-card__name').textContent = market.name;
    node.querySelector('.market-card__area').textContent = market.area;

    // Note widget
    var noteSlot = node.querySelector('.bm-note-slot');
    if (noteSlot) {
      var widget = buildNoteWidget(market.id);
      while (widget.firstChild) {
        noteSlot.appendChild(widget.firstChild);
      }
    }

    node.querySelector('.market-card__details').href =
      'marketdetails.html?id=' + encodeURIComponent(market.slug);

    return node;
  }

  function renderMarketCards(marketIds) {
    var grid    = document.getElementById('bmMarketGrid');
    var emptyEl = document.getElementById('bmMarketsEmpty');
    grid.innerHTML = '';

    var matched = [];
    marketIds.forEach(function (id) {
      for (var i = 0; i < allMarkets.length; i++) {
        if (allMarkets[i].id === id) { matched.push(allMarkets[i]); return; }
      }
    });

    if (matched.length === 0) { emptyEl.hidden = false; return; }
    emptyEl.hidden = true;

    var frag = document.createDocumentFragment();
    matched.forEach(function (market) {
      frag.appendChild(buildMarketCard(market, handleMarketRemove));
    });
    grid.appendChild(frag);

    // Animate cards in as they scroll into view
    grid.querySelectorAll('.market-card').forEach(function (card) {
      revealObserver.observe(card);
    });
  }

  /* -------------------------------------------------------------------
   * Produce card rendering
   * ----------------------------------------------------------------- */

  function buildProduceCard(produce, onRemove) {
    var template = document.getElementById('bmProduceCardTemplate');
    var node     = template.content.cloneNode(true);
    var article  = node.querySelector('.produce-card');
    article.dataset.id = produce.id;

    var image = node.querySelector('.produce-card__image');
    image.src = produce.image;
    image.alt = produce.name;
    image.onerror = function () { image.hidden = true; };

    var removeBtn = node.querySelector('.bm-produce-remove-btn');
    removeBtn.setAttribute('aria-label', 'Remove ' + produce.name + ' from bookmarks');
    removeBtn.addEventListener('click', function () { onRemove(produce.id, article); });

    node.querySelector('.produce-card__name').textContent          = produce.name;
    node.querySelector('.produce-card__category-badge').textContent = produce.category;

    // Note widget
    var noteSlot = node.querySelector('.bm-note-slot');
    if (noteSlot) {
      var widget = buildNoteWidget(produce.id);
      while (widget.firstChild) {
        noteSlot.appendChild(widget.firstChild);
      }
    }

    node.querySelector('.produce-card__details').href = 'produces.html';

    return node;
  }

  function renderProduceCards(produceIds) {
    var grid    = document.getElementById('bmProduceGrid');
    var emptyEl = document.getElementById('bmProduceEmpty');
    grid.innerHTML = '';

    var matched = [];
    produceIds.forEach(function (id) {
      for (var i = 0; i < allProduces.length; i++) {
        if (allProduces[i].id === id) { matched.push(allProduces[i]); return; }
      }
    });

    if (matched.length === 0) { emptyEl.hidden = false; return; }
    emptyEl.hidden = true;

    var frag = document.createDocumentFragment();
    matched.forEach(function (produce) {
      frag.appendChild(buildProduceCard(produce, handleProduceRemove));
    });
    grid.appendChild(frag);

    // Animate cards in as they scroll into view
    grid.querySelectorAll('.produce-card').forEach(function (card) {
      revealObserver.observe(card);
    });
  }

  /* -------------------------------------------------------------------
   * Full render pass
   * ----------------------------------------------------------------- */

  function render() {
    var ids        = loadBookmarks();
    var marketIds  = ids.filter(isMarketId);
    var produceIds = ids.filter(isProduceId);

    updateSummary(marketIds, produceIds);
    syncSectionVisibility(marketIds, produceIds);
    renderMarketCards(marketIds);
    renderProduceCards(produceIds);
  }

  /* -------------------------------------------------------------------
   * Remove handlers
   * ----------------------------------------------------------------- */

  function animateRemove(cardEl, afterRemove) {
    cardEl.classList.add('bm-card--removing');
    cardEl.addEventListener('animationend', function () {
      afterRemove();
    }, { once: true });
  }

  function handleMarketRemove(id, cardEl) {
    animateRemove(cardEl, function () {
      removeBookmark(id);
      render();
    });
  }

  function handleProduceRemove(id, cardEl) {
    animateRemove(cardEl, function () {
      removeBookmark(id);
      render();
    });
  }

  /* -------------------------------------------------------------------
   * Toast helper
   * ----------------------------------------------------------------- */

  var toastTimer = null;

  function showToast(message) {
    var toast = document.getElementById('bmToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2800);
  }

  /* -------------------------------------------------------------------
   * Export to .txt
   * ----------------------------------------------------------------- */

  function buildExportText() {
    var ids        = loadBookmarks();
    var marketIds  = ids.filter(isMarketId);
    var produceIds = ids.filter(isProduceId);
    var notes      = loadAllNotes();
    var now        = new Date();

    var lines = [];

    lines.push('FreshFind — Saved Bookmarks');
    lines.push('Exported: ' + now.toLocaleString());
    lines.push('Total saved: ' + ids.length +
      ' (' + marketIds.length + ' markets, ' + produceIds.length + ' produce)');
    lines.push('');
    lines.push('================================================');

    if (marketIds.length > 0) {
      lines.push('');
      lines.push('SAVED MARKETS (' + marketIds.length + ')');
      lines.push('------------------------------------------------');
      marketIds.forEach(function (id) {
        var market = null;
        for (var i = 0; i < allMarkets.length; i++) {
          if (allMarkets[i].id === id) { market = allMarkets[i]; break; }
        }
        if (!market) { lines.push('  [Unknown market: ' + id + ']'); return; }
        var status = computeStatus(market, now);
        lines.push('');
        lines.push('  ' + market.name);
        lines.push('  Area: ' + market.area);
        lines.push('  Address: ' + market.address);
        lines.push('  Status: ' + status.label);
        lines.push('  Open days: ' + summarizeDays(market.schedule));
        lines.push('  Hours: ' + summarizeHours(market.schedule));
        lines.push('  Produce: ' + market.produceTypes.join(', '));
        if (notes[id]) {
          lines.push('  Note: ' + notes[id]);
        }
      });
    }

    if (produceIds.length > 0) {
      lines.push('');
      lines.push('SAVED PRODUCE (' + produceIds.length + ')');
      lines.push('------------------------------------------------');
      produceIds.forEach(function (id) {
        var produce = null;
        for (var i = 0; i < allProduces.length; i++) {
          if (allProduces[i].id === id) { produce = allProduces[i]; break; }
        }
        if (!produce) { lines.push('  [Unknown produce: ' + id + ']'); return; }
        lines.push('');
        lines.push('  ' + produce.name);
        lines.push('  Category: ' + produce.category);
        lines.push('  Season: ' + produce.season.label);
        lines.push('  Description: ' + produce.description);
        if (notes[id]) {
          lines.push('  Note: ' + notes[id]);
        }
      });
    }

    lines.push('');
    lines.push('================================================');
    lines.push('FreshFind — freshfind.app');
    return lines.join('\n');
  }

  function handleExport() {
    var text     = buildExportText();
    var blob     = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url      = URL.createObjectURL(blob);
    var filename = 'freshfind-bookmarks-' +
      new Date().toISOString().slice(0, 10) + '.txt';

    var a = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    window.setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    showToast('Exported as ' + filename);
  }

  /* -------------------------------------------------------------------
   * Share (Web Share API or clipboard fallback)
   * ----------------------------------------------------------------- */

  function buildShareText() {
    var ids        = loadBookmarks();
    var marketIds  = ids.filter(isMarketId);
    var produceIds = ids.filter(isProduceId);

    if (ids.length === 0) {
      return 'Check out FreshFind — discover Karachi\'s local markets and fresh produce!';
    }

    var parts = ['My FreshFind picks:'];

    if (marketIds.length > 0) {
      var marketNames = [];
      marketIds.forEach(function (id) {
        for (var i = 0; i < allMarkets.length; i++) {
          if (allMarkets[i].id === id) { marketNames.push(allMarkets[i].name); return; }
        }
      });
      if (marketNames.length) {
        parts.push('\nMarkets: ' + marketNames.join(', '));
      }
    }

    if (produceIds.length > 0) {
      var produceNames = [];
      produceIds.forEach(function (id) {
        for (var i = 0; i < allProduces.length; i++) {
          if (allProduces[i].id === id) { produceNames.push(allProduces[i].name); return; }
        }
      });
      if (produceNames.length) {
        parts.push('\nProduce: ' + produceNames.join(', '));
      }
    }

    parts.push('\nDiscover fresh markets near you at FreshFind.');
    return parts.join('');
  }

  function handleShare() {
    var text  = buildShareText();
    var title = 'My FreshFind Bookmarks';

    if (navigator.share) {
      navigator.share({ title: title, text: text })
        .then(function () { showToast('Shared successfully'); })
        .catch(function (err) {
          // User cancelled — not an error worth surfacing
          if (err && err.name !== 'AbortError') {
            fallbackCopy(text);
          }
        });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { showToast('Copied to clipboard'); })
        .catch(function ()  { showToast('Could not copy — try manually'); });
    } else {
      // Last-resort: execCommand (deprecated but still works in many browsers)
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity  = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      showToast(ok ? 'Copied to clipboard' : 'Could not copy — try manually');
    }
  }

  /* -------------------------------------------------------------------
   * Clear All
   * ----------------------------------------------------------------- */

  function handleClearAll() {
    var total = loadBookmarks().length;
    if (total === 0) return;

    var confirmed = window.confirm(
      'Remove all ' + total + ' saved item' + (total === 1 ? '' : 's') + '?\n\n' +
      'This will clear your bookmarks and any notes you added this session. ' +
      'This action cannot be undone.'
    );
    if (!confirmed) return;

    // Clear ONLY the two FreshFind keys — nothing else in storage is touched
    try { window.localStorage.removeItem(BOOKMARK_KEY); }  catch (e) { /* ignore */ }
    clearAllNotes();

    render();
    showToast('All bookmarks cleared');
  }

  /* -------------------------------------------------------------------
   * Cross-tab storage sync
   * ----------------------------------------------------------------- */

  window.addEventListener('storage', function (event) {
    if (event.key === BOOKMARK_KEY) {
      render();
    }
  });

  /* -------------------------------------------------------------------
   * Visibility change — refresh when user returns to this tab
   * ----------------------------------------------------------------- */

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      render();
    }
  });

  /* -------------------------------------------------------------------
   * Scroll reveal — IntersectionObserver, identical pattern to
   * market.js and produces.js. Observes all [data-reveal] elements
   * on this page (section headers) so they fade in as user scrolls.
   * ----------------------------------------------------------------- */

  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-reveal]').forEach(function (el) {
    revealObserver.observe(el);
  });

  /* -------------------------------------------------------------------
   * Actions bar button wiring
   * ----------------------------------------------------------------- */

  document.getElementById('bmExportBtn').addEventListener('click', handleExport);
  document.getElementById('bmShareBtn').addEventListener('click', handleShare);
  document.getElementById('bmClearAllBtn').addEventListener('click', handleClearAll);

  /* -------------------------------------------------------------------
   * Data loading — JSON fetched once, cached in allMarkets/allProduces
   * ----------------------------------------------------------------- */

  function showLoadError() {
    var globalEmpty = document.getElementById('bmEmptyGlobal');
    var heading     = globalEmpty.querySelector('h2');
    var para        = globalEmpty.querySelector('p');
    if (heading) heading.textContent = 'Could not load data';
    if (para)    para.textContent    =
      "FreshFind's market and produce data couldn't be loaded right now. " +
      "Please refresh the page or try again shortly.";
    globalEmpty.hidden = false;
  }

  function init() {
    Promise.all([
      fetch('data/market.json').then(function (r) {
        if (!r.ok) throw new Error('market.json failed');
        return r.json();
      }),
      fetch('data/produces.json').then(function (r) {
        if (!r.ok) throw new Error('produces.json failed');
        return r.json();
      })
    ]).then(function (results) {
      allMarkets  = results[0];
      allProduces = results[1];
      render();
    }).catch(function () {
      showLoadError();
    });
  }

  init();

})();

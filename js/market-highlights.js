/* =================================================================
   FreshFind — Market Page: Highlights Carousel (market-highlights.js)
   Builds the "Open right now" carousel (hl-card) and seasonal
   produce strip on market.html.
   ================================================================= */

(function () {
  'use strict';

  /* ── Guard: only run when the carousel elements exist ── */
  var track = document.getElementById('highlightsTrack');
  var dots  = document.getElementById('highlightsDots');
  if (!track || !dots) return;

  var prevBtn    = document.getElementById('highlightsPrev');
  var nextBtn    = document.getElementById('highlightsNext');
  var seasonList = document.getElementById('seasonalList');

  /* ------------------------------------------------------------------
   * Time helpers
   * ------------------------------------------------------------------ */

  var DATE_DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

  function parseMin(t) {
    var p = t.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function fmt12(t) {
    var p  = t.split(':');
    var h  = parseInt(p[0], 10);
    var sf = h >= 12 ? 'PM' : 'AM';
    var dh = h % 12 === 0 ? 12 : h % 12;
    return dh + ':' + p[1] + '\u202f' + sf;
  }

  function schedForDay(schedule, key) {
    var d = schedule[key];
    if (!d) return null;
    var o = parseMin(d.open), c = parseMin(d.close);
    return { open: o, close: c, crosses: c <= o };
  }

  function isOpenNow(market, now) {
    var todayKey = DATE_DAY_KEYS[now.getDay()];
    var yestKey  = DATE_DAY_KEYS[(now.getDay() + 6) % 7];
    var nowMin   = now.getHours() * 60 + now.getMinutes();

    var yest = schedForDay(market.schedule, yestKey);
    if (yest && yest.crosses && nowMin < yest.close) return true;

    var today = schedForDay(market.schedule, todayKey);
    if (!today) return false;
    if (!today.crosses && nowMin >= today.open && nowMin < today.close) return true;
    if (today.crosses && nowMin >= today.open) return true;
    return false;
  }

  function getCloseTime(market, now) {
    var todayKey = DATE_DAY_KEYS[now.getDay()];
    var yestKey  = DATE_DAY_KEYS[(now.getDay() + 6) % 7];
    var nowMin   = now.getHours() * 60 + now.getMinutes();

    var yest = schedForDay(market.schedule, yestKey);
    if (yest && yest.crosses && nowMin < yest.close) {
      return fmt12(market.schedule[yestKey].close);
    }
    var today = schedForDay(market.schedule, todayKey);
    if (today && market.schedule[todayKey]) {
      return fmt12(market.schedule[todayKey].close);
    }
    return null;
  }

  /* ------------------------------------------------------------------
   * Carousel state
   * ------------------------------------------------------------------ */

  var current   = 0;
  var total     = 0;
  var autoTimer = null;

  /* ------------------------------------------------------------------
   * Build one hl-card
   * ------------------------------------------------------------------ */

  function buildHlCard(market, now) {
    var ct = getCloseTime(market, now);

    var li = document.createElement('li');
    li.className = 'hl-card';
    li.setAttribute('role', 'listitem');

    var img = document.createElement('img');
    img.className = 'hl-card__img';
    img.src       = market.image;
    img.alt       = market.name;
    img.loading   = 'lazy';
    img.addEventListener('error', function () { img.hidden = true; });

    var overlay = document.createElement('div');
    overlay.className     = 'hl-card__overlay';
    overlay.setAttribute('aria-hidden', 'true');

    var badge = document.createElement('span');
    badge.className   = 'hl-card__badge';
    badge.textContent = ct ? 'Open \u00b7 closes ' + ct : 'Open now';

    var body = document.createElement('div');
    body.className = 'hl-card__body';

    var name = document.createElement('h3');
    name.className   = 'hl-card__name';
    name.textContent = market.name;

    var meta = document.createElement('p');
    meta.className   = 'hl-card__meta';
    meta.textContent = market.area + ' \u00b7 ' + market.produceTypes.slice(0, 2).join(', ');

    var link = document.createElement('a');
    link.className   = 'hl-card__link';
    link.href        = 'marketdetails.html?id=' + encodeURIComponent(market.slug);
    link.innerHTML   =
      'View details' +
      '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" style="width:11px;height:11px">' +
        '<path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';

    body.appendChild(name);
    body.appendChild(meta);
    body.appendChild(link);

    li.appendChild(img);
    li.appendChild(overlay);
    li.appendChild(badge);
    li.appendChild(body);

    return li;
  }

  /* ------------------------------------------------------------------
   * Fallback card (nothing open right now)
   * ------------------------------------------------------------------ */

  function buildFallbackCard() {
    var li = document.createElement('li');
    li.className = 'hl-card hl-card--fallback';
    li.innerHTML =
      '<p class="hl-card__fallback-icon">🌙</p>' +
      '<p class="hl-card__fallback-msg">No markets open right now</p>' +
      '<p class="hl-card__fallback-sub">Check back later — Karachi\'s markets open throughout the day. Browse the full directory below.</p>';
    return li;
  }

  /* ------------------------------------------------------------------
   * Navigation
   * ------------------------------------------------------------------ */

  function goTo(index) {
    if (!total) return;
    current = ((index % total) + total) % total;
    track.style.transform = 'translateX(-' + (current * 100) + '%)';

    var dotEls = dots.querySelectorAll('.hl-dot');
    dotEls.forEach(function (d, i) {
      var active = (i === current);
      d.classList.toggle('hl-dot--active', active);
      d.setAttribute('aria-selected', String(active));
    });
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function startAuto() {
    stopAuto();
    if (total > 1) autoTimer = setInterval(next, 4500);
  }

  function stopAuto() { clearInterval(autoTimer); }

  /* ------------------------------------------------------------------
   * Build dots
   * ------------------------------------------------------------------ */

  function buildDots(count) {
    dots.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'hl-dot' + (i === 0 ? ' hl-dot--active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(i === 0));
      btn.setAttribute('aria-label', 'Go to slide ' + (i + 1));
      (function (idx) {
        btn.addEventListener('click', function () {
          goTo(idx);
          stopAuto();
          startAuto();
        });
      })(i);
      dots.appendChild(btn);
    }
  }

  /* ------------------------------------------------------------------
   * Seasonal produce strip
   * ------------------------------------------------------------------ */

  function renderSeasonal(produces) {
    if (!seasonList || !produces || !produces.length) return;

    /* produces.json stores months 1-indexed (Date.getMonth() is 0-indexed) */
    var month    = new Date().getMonth() + 1;
    var seasonal = produces.filter(function (p) {
      if (!p.season || !Array.isArray(p.season.months)) return false;
      return p.season.months.indexOf(month) !== -1;
    }).slice(0, 10);

    if (!seasonal.length) {
      var parentSec = seasonList.closest('.highlights__seasonal');
      if (parentSec) parentSec.hidden = true;
      return;
    }

    /* Emoji map by category */
    var emojiMap = {
      'Fruits'               : '🍊',
      'Vegetables'           : '🥦',
      'Herbs'                : '🌿',
      'Leafy Greens'         : '🥬',
      'Roots & Tubers'       : '🥕',
      'Dairy'                : '🥛',
      'Eggs'                 : '🥚',
      'Organic / Farm Produce': '🌱'
    };

    seasonList.innerHTML = '';
    seasonal.forEach(function (p) {
      var li = document.createElement('li');
      li.className = 'hl-seasonal-item';

      var emoji = document.createElement('span');
      emoji.className   = 'hl-seasonal-item__emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = emojiMap[p.category] || '🛒';

      var name = document.createElement('span');
      name.className   = 'hl-seasonal-item__name';
      name.textContent = p.name;

      li.appendChild(emoji);
      li.appendChild(name);
      seasonList.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------
   * Fetch & render
   * ------------------------------------------------------------------ */

  fetch('data/market.json')
    .then(function (r) {
      if (!r.ok) throw new Error('fetch failed');
      return r.json();
    })
    .then(function (markets) {
      var now  = new Date();
      var open = markets.filter(function (m) { return isOpenNow(m, now); });

      track.innerHTML = '';

      if (open.length === 0) {
        /* Nothing open — show single fallback card */
        track.appendChild(buildFallbackCard());
        total = 1;
      } else {
        open.forEach(function (market) {
          track.appendChild(buildHlCard(market, now));
        });
        total = open.length;
      }

      buildDots(total);
      goTo(0);
      startAuto();

      /* Wire nav buttons */
      if (prevBtn) prevBtn.addEventListener('click', function () { prev(); stopAuto(); startAuto(); });
      if (nextBtn) nextBtn.addEventListener('click', function () { next(); stopAuto(); startAuto(); });

      /* Pause on hover / touch */
      track.parentElement.addEventListener('mouseenter', stopAuto);
      track.parentElement.addEventListener('mouseleave', startAuto);
    })
    .catch(function () {
      /* Hide highlights section cleanly on error */
      var section = document.getElementById('highlights');
      if (section) section.hidden = true;
    });

  /* Fetch produce for seasonal strip */
  fetch('data/produces.json')
    .then(function (r) { return r.json(); })
    .then(renderSeasonal)
    .catch(function () {
      /* No data — hide the whole strip rather than show an empty label */
      var strip = document.querySelector('.highlights__seasonal');
      if (strip) strip.hidden = true;
    });

}());

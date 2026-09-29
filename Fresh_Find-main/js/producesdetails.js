/* =========================================================
   FreshFind — Produce Details Page
   Part 6: producesdetails.js

   Vanilla JS, IIFE, ES5-style (matches produces.js /
   marketdetails.js / reviews.js conventions — no arrow
   functions, no let/const).

   Reads ?id= from the URL, fetches produces.json, market.json and
   reviews.json, and renders the dedicated produce page:

     · the overview   — image, two-tone title, category, description,
                        season and market count (#pdContent)
     · the price card — produces.json's price object, plus how many
                        markets currently stock it
     · Available Markets — every market.json entry whose slug appears
                        in the produce's marketIds, each with its live
                        open/closed status from that market's own
                        schedule, linking through to
                        marketdetails.html?id=…
     · Customer Reviews — the reviews in reviews.json that belong to
                        any of those markets, aggregated (summary,
                        5 → 1 breakdown, paginated cards)
     · Suggested produces — same category first, then items sharing
                        the most markets with this one

   No produce, market or review value is hardcoded here — everything is
   resolved from the JSON files for whichever ?id= the URL carries.
   ========================================================= */

(function () {
  'use strict';

  /* ---------------------------------------------------------------------
   * Configuration
   * ------------------------------------------------------------------- */

  var REVIEWS_PER_PAGE = 6;
  var SUGGESTED_COUNT = 4;
  var STAR_COUNT = 5;
  var STAR_PATH = 'M10 1.5l2.5 5 5.5 0.8-4 3.9 0.9 5.3-4.9-2.6-4.9 2.6 0.9-5.3-4-3.9 5.5-0.8z';

  /* ---------------------------------------------------------------------
   * Day + time helpers — identical to marketdetails.js (which itself ported
   * them from market.js), so a market's live status can never disagree
   * between the two pages.
   * ------------------------------------------------------------------- */

  var DAY_LABEL_FULL = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
    friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
  };
  // Date.getDay() order, Sunday-first — used to read "today" off the clock
  var DATE_DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

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
      return { open: true, label: 'Open now' };
    }

    // 2. A session that started today.
    var today = scheduleForDay(market.schedule, todayKey);
    if (today) {
      if (!today.crosses && nowMin >= today.open && nowMin < today.close) {
        return { open: true, label: 'Open now' };
      }
      if (today.crosses && nowMin >= today.open) {
        return { open: true, label: 'Open now' };
      }
    }

    // 3. Closed — say when it opens next, in the same words the market
    //    details page uses for its status pill.
    var next = findNextOpening(market.schedule, now);
    if (!next) {
      return { open: false, label: 'Closed' };
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
    return { open: false, label: 'Opens ' + whenLabel + ', ' + minutesToLabel(openMin) };
  }

  // What the market's hours ARE today, independent of whether "now" falls
  // inside them (that live judgment is computeStatus's job).
  function todayHoursLabel(schedule, now) {
    var todayKey = DATE_DAY_KEYS[now.getDay()];
    var today = schedule[todayKey];
    if (!today) return 'Closed today';
    return formatTime(today.open) + ' – ' + formatTime(today.close);
  }

  /* ---------------------------------------------------------------------
   * Page state
   * ------------------------------------------------------------------- */

  var allProduces = [];
  var allMarkets = [];
  var currentProduce = null;
  var currentMarkets = [];   // the market.json records stocking this produce
  var produceReviews = [];   // reviews aggregated across those markets
  var allReviews = [];       // every review in reviews.json
  var suggestedProduces = []; // the cards currently in the suggested grid
  var currentPage = 1;       // reviews page, 1-indexed
  var statusTimer = null;
  var reviewsLoadFailed = false; // true only if reviews.json could not be fetched

  /* ---------------------------------------------------------------------
   * DOM hooks — every one of these lives in producesdetails.html
   * ------------------------------------------------------------------- */

  var loadingEl = document.getElementById('pdLoading');
  var notFoundEl = document.getElementById('pdNotFound');
  var contentEl = document.getElementById('pdContent');

  var crumbName = document.getElementById('pdCrumbName');
  var titleAccent = document.getElementById('pdTitleAccent');
  var titleRest = document.getElementById('pdTitleRest');
  var imageEl = document.getElementById('pdImage');
  var categoryEl = document.getElementById('pdCategory');
  var descriptionEl = document.getElementById('pdDescription');
  var seasonEl = document.getElementById('pdSeason');
  var marketCountEl = document.getElementById('pdMarketCount');

  var priceEl = document.getElementById('pdPrice');
  var priceValueEl = document.getElementById('pdPriceValue');
  var priceUnitEl = document.getElementById('pdPriceUnit');
  var priceNoteEl = document.getElementById('pdPriceNote');

  var marketListEl = document.getElementById('pdMarketList');
  var marketsSubEl = document.getElementById('pdMarketsSub');
  var marketsEmptyEl = document.getElementById('pdMarketsEmpty');
  var marketItemTemplate = document.getElementById('produceMarketItemTemplate');

  var reviewsSubEl = document.getElementById('pdReviewsSub');
  var reviewsSummaryEl = document.getElementById('pdReviewsSummary');
  var overallRatingEl = document.getElementById('pdOverallRating');
  var summaryStarsEl = document.getElementById('pdSummaryStars');
  var reviewsCountEl = document.getElementById('pdReviewsCount');
  var reviewsBreakdownEl = document.getElementById('pdReviewsBreakdown');
  var reviewsListEl = document.getElementById('pdReviewsList');
  var reviewsEmptyEl = document.getElementById('pdReviewsEmpty');
  var reviewsFooterEl = document.getElementById('pdReviewsFooter');
  var reviewsPaginationEl = document.getElementById('pdReviewsPagination');
  var paginationPagesEl = document.getElementById('pdPaginationPages');
  var prevPageBtn = document.getElementById('pdPrevPageBtn');
  var nextPageBtn = document.getElementById('pdNextPageBtn');
  var reviewsStatusEl = document.getElementById('pdReviewsStatus');
  var reviewCardTemplate = document.getElementById('reviewCardTemplate');
  var ratingBarTemplate = document.getElementById('ratingBarTemplate');

  var suggestedGridEl = document.getElementById('pdSuggestedGrid');
  var suggestedEmptyEl = document.getElementById('pdSuggestedEmpty');
  var suggestCardTemplate = document.getElementById('pdSuggestCardTemplate');

  /* ---------------------------------------------------------------------
   * URL parameter + data loading
   * ------------------------------------------------------------------- */

  function getProduceId() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    return id ? id.trim() : '';
  }

  function fetchJson(url, errorMessage) {
    return fetch(url).then(function (response) {
      if (!response.ok) {
        throw new Error(errorMessage);
      }
      return response.json();
    });
  }

  function findProduceById(id) {
    var wanted = String(id).toLowerCase();
    for (var i = 0; i < allProduces.length; i++) {
      // Match the produce id first ("produce-001"), then the name as a
      // friendly fallback, so a hand-typed ?id=sindhri-mangoes still works.
      if (String(allProduces[i].id).toLowerCase() === wanted) {
        return allProduces[i];
      }
    }
    for (var j = 0; j < allProduces.length; j++) {
      var slug = String(allProduces[j].name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (slug === wanted) {
        return allProduces[j];
      }
    }
    return null;
  }

  function findMarketBySlug(slug) {
    for (var i = 0; i < allMarkets.length; i++) {
      if (allMarkets[i].slug === slug) {
        return allMarkets[i];
      }
    }
    return null;
  }

  // The market.json records this produce is stocked by, in the order
  // produces.json lists them (no market is ever invented).
  function marketsFor(produce) {
    var found = [];
    var ids = produce.marketIds || [];
    for (var i = 0; i < ids.length; i++) {
      var market = findMarketBySlug(ids[i]);
      if (market) found.push(market);
    }
    return found;
  }

  /* ---------------------------------------------------------------------
   * Price helpers — mirrors the wording produces.js uses on its cards
   * ------------------------------------------------------------------- */

  function priceText(price) {
    return (price && typeof price.amount === 'number')
      ? 'Rs ' + price.amount + ' / ' + price.unit
      : 'Ask at market';
  }

  function hasPrice(produce) {
    return !!(produce.price && typeof produce.price.amount === 'number');
  }

  /* ---------------------------------------------------------------------
   * Small shared renderers — avatars + stars, kept identical to reviews.js
   * so a review looks the same on both pages.
   * ------------------------------------------------------------------- */

  function initials(name) {
    var parts = String(name).trim().split(/\s+/);
    var first = parts[0] ? parts[0].charAt(0) : '';
    var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  function avatarGradient(name) {
    var gradients = [
      'linear-gradient(135deg, #2F6B4F 0%, #6F9F72 100%)',
      'linear-gradient(135deg, #3E7C59 0%, #8FBF8B 100%)',
      'linear-gradient(135deg, #4A7F6E 0%, #7FB69F 100%)',
      'linear-gradient(135deg, #38614C 0%, #74A579 100%)'
    ];
    return gradients[String(name).length % gradients.length];
  }

  // Ratings round to the nearest half star, so 4.4 reads as 4.5 stars.
  function buildStars(rating, gradientPrefix) {
    var rounded = Math.round(rating * 2) / 2;
    var full = Math.floor(rounded);
    var hasHalf = rounded - full === 0.5;
    var empty = STAR_COUNT - full - (hasHalf ? 1 : 0);
    var markup = '';
    var i;

    for (i = 0; i < full; i++) markup += starSvg('full', '');
    if (hasHalf) markup += starSvg('half', gradientPrefix + '-half-star');
    for (i = 0; i < empty; i++) markup += starSvg('empty', '');

    return markup;
  }

  function starSvg(kind, gradientId) {
    if (kind === 'half') {
      return '<svg class="star-icon star-icon--half" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
        '<defs><linearGradient id="' + gradientId + '">' +
        '<stop offset="50%" stop-color="currentColor"/>' +
        '<stop offset="50%" stop-color="transparent"/>' +
        '</linearGradient></defs>' +
        '<path d="' + STAR_PATH + '" fill="url(#' + gradientId + ')" ' +
        'stroke="currentColor" stroke-width="0.8"/></svg>';
    }

    if (kind === 'full') {
      return '<svg class="star-icon star-icon--filled" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
        '<path d="' + STAR_PATH + '" fill="currentColor" stroke="currentColor" stroke-width="0.8"/></svg>';
    }

    return '<svg class="star-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
      '<path d="' + STAR_PATH + '" stroke="currentColor" stroke-width="0.8" fill="transparent"/></svg>';
  }

  /* ---------------------------------------------------------------------
   * Overview — breadcrumb, image, two-tone title, category, description,
   * season and market count
   * ------------------------------------------------------------------- */

  function renderOverview(produce) {
    if (crumbName) crumbName.textContent = produce.name;

    // Two-tone title: the first word carries the accent colour (the same
    // lab() accent the catalogue heading uses), the rest stays ink.
    var words = String(produce.name).trim().split(/\s+/);
    var firstWord = words.shift() || '';
    var rest = words.join(' ');
    if (titleAccent) titleAccent.textContent = firstWord;
    if (titleRest) titleRest.textContent = rest ? ' ' + rest : '';

    if (imageEl) {
      imageEl.src = produce.image;
      imageEl.alt = produce.name;
      // A produce image that fails to load simply steps out of the way, the
      // same way produces.js handles it on the catalogue cards.
      imageEl.onerror = function () { imageEl.hidden = true; };
    }

    if (categoryEl) categoryEl.textContent = produce.category;
    if (descriptionEl) descriptionEl.textContent = produce.description;
    if (seasonEl) seasonEl.textContent = (produce.season && produce.season.label) || 'Year-round';

    if (marketCountEl) {
      var count = currentMarkets.length;
      marketCountEl.textContent = count === 0
        ? 'Not listed yet'
        : count + (count === 1 ? ' market' : ' markets') + ' in the guide';
    }
  }

  /* ---------------------------------------------------------------------
   * Price card — produces.json's own price object
   * ------------------------------------------------------------------- */

  function renderPrice(produce) {
    if (!priceEl) return;

    if (!hasPrice(produce)) {
      // No amount in the data yet — say so plainly rather than inventing one.
      priceEl.classList.add('pd-price--na');
      if (priceValueEl) priceValueEl.textContent = 'Ask at market';
      if (priceUnitEl) priceUnitEl.textContent = 'Price not listed in the guide yet';
      if (priceNoteEl) {
        priceNoteEl.textContent = 'This produce has no price in the guide yet — ask at the stall, or check the ' +
          'market pages below for what each one stocks.';
      }
      return;
    }

    priceEl.classList.remove('pd-price--na');
    if (priceValueEl) priceValueEl.textContent = 'Rs ' + produce.price.amount;
    if (priceUnitEl) priceUnitEl.textContent = 'per ' + produce.price.unit;

    if (priceNoteEl) {
      var count = currentMarkets.length;
      var where = count === 1
        ? 'the market listed below'
        : 'the ' + count + ' markets listed below';
      priceNoteEl.textContent = count === 0
        ? 'Typical going rate for this produce — stall prices can vary with quality and season.'
        : 'Typical going rate at ' + where + ' — stall prices can vary with quality and season.';
    }
  }

  /* ---------------------------------------------------------------------
   * Available Markets — one tile per market stocking this produce, each
   * with its live open/closed status
   * ------------------------------------------------------------------- */

  // { market, statusEl } pairs kept so the 30s refresh below can re-read the
  // clock without rebuilding every tile.
  var statusNodes = [];

  function renderMarkets() {
    var now = new Date();

    statusNodes = [];

    if (!marketListEl || !marketItemTemplate) return;

    marketListEl.innerHTML = '';
    marketListEl.hidden = currentMarkets.length === 0;

    if (marketsEmptyEl) marketsEmptyEl.hidden = currentMarkets.length > 0;

    if (marketsSubEl) {
      if (currentMarkets.length === 0) {
        marketsSubEl.textContent = 'Not stocked by any market in the guide yet.';
      } else {
        var openNow = 0;
        for (var i = 0; i < currentMarkets.length; i++) {
          if (computeStatus(currentMarkets[i], now).open) openNow++;
        }
        marketsSubEl.textContent = 'Stocked by ' + currentMarkets.length + ' of ' + allMarkets.length +
          ' markets in the guide — ' + openNow + ' open right now.';
      }
    }

    var fragment = document.createDocumentFragment();

    currentMarkets.forEach(function (market) {
      var item = marketItemTemplate.content.cloneNode(true);

      item.querySelector('.produce-detail__market-name').textContent = market.name;

      var statusEl = item.querySelector('.produce-detail__market-status');
      paintStatus(statusEl, market, now);
      statusNodes.push({ market: market, statusEl: statusEl });

      // Area + today's opening hours, straight from the market's schedule.
      item.querySelector('.produce-detail__market-hours').textContent =
        market.area + ' · Today ' + todayHoursLabel(market.schedule, now);

      var link = item.querySelector('.produce-detail__market-link');
      link.href = 'marketdetails.html?id=' + encodeURIComponent(market.slug);
      link.setAttribute('aria-label', 'View details for ' + market.name);

      fragment.appendChild(item);
    });

    marketListEl.appendChild(fragment);
  }

  function paintStatus(statusEl, market, now) {
    if (!statusEl) return;
    var status = computeStatus(market, now);
    statusEl.setAttribute('data-status', status.open ? 'open' : 'closed');
    statusEl.textContent = status.label;
    statusEl.setAttribute('aria-label', market.name + ' is ' + (status.open ? 'open now' : status.label.toLowerCase()));
  }

  // Keep the pills honest while the page stays open (same 30s cadence as
  // marketdetails.js).
  function startStatusTimer() {
    if (statusTimer) {
      window.clearInterval(statusTimer);
    }
    statusTimer = window.setInterval(function () {
      var now = new Date();
      for (var i = 0; i < statusNodes.length; i++) {
        paintStatus(statusNodes[i].statusEl, statusNodes[i].market, now);
      }
    }, 30000);
  }

  /* ---------------------------------------------------------------------
   * Customer Reviews — aggregated across every market stocking this produce
   * ------------------------------------------------------------------- */

  function collectReviews() {
    var wanted = {};

    currentMarkets.forEach(function (market) {
      wanted[String(market.slug).toLowerCase()] = true;
    });

    produceReviews = allReviews.filter(function (review) {
      return wanted[String(review.marketId).toLowerCase()] === true;
    });
  }

  function renderReviews() {
    currentPage = 1;

    if (reviewsSubEl) {
      reviewsSubEl.textContent = currentMarkets.length === 0
        ? 'What shoppers say about this produce at the markets that stock it.'
        : 'Aggregated from the reviews of the ' + currentMarkets.length +
          (currentMarkets.length === 1 ? ' market' : ' markets') + ' that stock this produce.';
    }

    if (produceReviews.length === 0) {
      showReviewsEmpty();
      return;
    }

    if (reviewsSummaryEl) reviewsSummaryEl.hidden = false;
    if (reviewsListEl) reviewsListEl.hidden = false;
    if (reviewsEmptyEl) reviewsEmptyEl.hidden = true;

    renderReviewSummary();
    renderReviewCards();
    renderReviewPagination();
  }

  function renderReviewSummary() {
    if (!reviewsSummaryEl || !reviewsBreakdownEl || !ratingBarTemplate) return;

    var average = averageRating(produceReviews);
    var counts = countByRating(produceReviews);

    if (overallRatingEl) overallRatingEl.textContent = average.toFixed(1);

    if (summaryStarsEl) {
      summaryStarsEl.innerHTML = buildStars(average, 'pd-summary');
      summaryStarsEl.setAttribute('aria-label', average.toFixed(1) + ' out of 5 stars');
    }

    if (reviewsCountEl) {
      reviewsCountEl.textContent = produceReviews.length === 1
        ? '1 review'
        : produceReviews.length + ' reviews';
    }

    reviewsBreakdownEl.innerHTML = '';

    for (var star = STAR_COUNT; star >= 1; star--) {
      var row = ratingBarTemplate.content.cloneNode(true);
      var bar = row.querySelector('.rating-bar');
      var count = counts[star];

      bar.querySelector('.rating-bar__label').textContent =
        star === 1 ? '1 star' : star + ' stars';

      // Bar length is this star's share of the aggregated reviews.
      bar.querySelector('.rating-bar__fill').style.width =
        ((count / produceReviews.length) * 100).toFixed(1) + '%';

      bar.querySelector('.rating-bar__count').textContent = count;
      bar.setAttribute('aria-label',
        star + ' star reviews: ' + count + ' of ' + produceReviews.length);

      reviewsBreakdownEl.appendChild(row);
    }
  }

  function averageRating(reviews) {
    var total = 0;
    for (var i = 0; i < reviews.length; i++) {
      total += reviews[i].rating;
    }
    return total / reviews.length;
  }

  function countByRating(reviews) {
    var counts = {};
    var star;
    for (star = 1; star <= STAR_COUNT; star++) counts[star] = 0;

    for (var i = 0; i < reviews.length; i++) {
      star = Math.round(reviews[i].rating);
      if (star < 1) star = 1;
      if (star > STAR_COUNT) star = STAR_COUNT;
      counts[star] += 1;
    }

    return counts;
  }

  /* ---------------------------------------------------------------------
   * Review cards — cloned from <template id="reviewCardTemplate">, one card
   * per review on the current page
   * ------------------------------------------------------------------- */

  function renderReviewCards() {
    if (!reviewsListEl || !reviewCardTemplate) return;

    reviewsListEl.innerHTML = '';

    var start = (currentPage - 1) * REVIEWS_PER_PAGE;
    var pageReviews = produceReviews.slice(start, start + REVIEWS_PER_PAGE);
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < pageReviews.length; i++) {
      fragment.appendChild(createReviewCard(pageReviews[i]));
    }

    reviewsListEl.appendChild(fragment);
  }

  function createReviewCard(review) {
    var card = reviewCardTemplate.content.cloneNode(true).querySelector('.review-card');

    // Avatar — the reviewer's initials over a colour derived from the name.
    var avatar = card.querySelector('.review-card__avatar');
    avatar.textContent = initials(review.author);
    avatar.style.background = avatarGradient(review.author);

    card.querySelector('.review-card__author').textContent = review.author;

    // Unverified reviewers simply don't get the badge.
    var verified = card.querySelector('.review-card__verified');
    if (!review.verified) verified.remove();

    var stars = card.querySelector('.review-card__stars');
    stars.innerHTML = buildStars(review.rating, 'pd-review-' + review.id);
    stars.setAttribute('aria-label', review.rating + ' out of 5 stars');

    card.querySelector('.review-card__date-text').textContent = review.date;
    card.querySelector('.review-card__text').textContent = review.text;

    var helpfulBtn = card.querySelector('.review-card__helpful');
    var helpfulCount = card.querySelector('.review-card__helpful-count');
    helpfulCount.textContent = review.helpful > 0 ? '(' + review.helpful + ')' : '';
    helpfulBtn.setAttribute('aria-pressed', 'false');
    helpfulBtn.setAttribute('aria-label', 'Mark the review by ' + review.author + ' as helpful');

    helpfulBtn.addEventListener('click', function () {
      toggleHelpful(review, helpfulBtn, helpfulCount);
    });

    return card;
  }

  // Helpful is a two-way toggle — pressing it again takes the vote back.
  function toggleHelpful(review, button, countEl) {
    var marked = button.getAttribute('aria-pressed') === 'true';

    review.helpful = marked ? Math.max(0, review.helpful - 1) : review.helpful + 1;

    button.setAttribute('aria-pressed', marked ? 'false' : 'true');
    button.classList.toggle('is-helpful', !marked);
    countEl.textContent = review.helpful > 0 ? '(' + review.helpful + ')' : '';
  }

  /* ---------------------------------------------------------------------
   * Reviews pagination + the "Page X of Y · N total reviews" line
   * ------------------------------------------------------------------- */

  function totalReviewPages() {
    return Math.max(1, Math.ceil(produceReviews.length / REVIEWS_PER_PAGE));
  }

  function renderReviewPagination() {
    var pages = totalReviewPages();

    if (reviewsFooterEl) reviewsFooterEl.hidden = produceReviews.length === 0;
    if (reviewsPaginationEl) reviewsPaginationEl.hidden = pages <= 1;

    if (paginationPagesEl) {
      paginationPagesEl.innerHTML = '';

      // At most three page buttons in view, like the market reviews section.
      var startPage = Math.max(1, Math.min(currentPage - 1, pages - 2));
      var endPage = Math.min(pages, startPage + 2);

      for (var i = startPage; i <= endPage; i++) {
        paginationPagesEl.appendChild(createReviewPageButton(i, pages));
      }
    }

    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === pages;

    if (reviewsStatusEl) {
      reviewsStatusEl.textContent = 'Page ' + currentPage + ' of ' + pages + '  ·  ' +
        produceReviews.length + (produceReviews.length === 1 ? ' total review' : ' total reviews');
    }
  }

  function createReviewPageButton(page, pages) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reviews-pagination__page';
    btn.textContent = page;
    btn.setAttribute('aria-label', 'Page ' + page + ' of ' + pages);

    if (page === currentPage) {
      btn.classList.add('reviews-pagination__page--active');
      btn.setAttribute('aria-current', 'page');
    }

    btn.addEventListener('click', function () {
      goToReviewPage(page);
    });

    return btn;
  }

  function goToReviewPage(page) {
    var pages = totalReviewPages();
    if (page < 1 || page > pages || page === currentPage) return;

    currentPage = page;
    renderReviewCards();
    renderReviewPagination();

    if (reviewsSummaryEl) {
      reviewsSummaryEl.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });
    }
  }

  /* ---------------------------------------------------------------------
   * Reviews empty + failure states — a produce whose markets have no
   * reviews yet is never shown a made-up rating.
   * ------------------------------------------------------------------- */

  function showReviewsEmpty(message) {
    if (reviewsSummaryEl) reviewsSummaryEl.hidden = true;
    if (reviewsListEl) {
      reviewsListEl.innerHTML = '';
      reviewsListEl.hidden = true;
    }
    if (reviewsFooterEl) reviewsFooterEl.hidden = true;

    if (reviewsEmptyEl) {
      reviewsEmptyEl.hidden = false;
      if (message) reviewsEmptyEl.textContent = message;
    }
  }

  /* ---------------------------------------------------------------------
   * Suggested produces — same category first, then the produces sharing the
   * most markets with this one, so the recommendations stay genuinely
   * related to what the shopper just opened.
   * ------------------------------------------------------------------- */

  function favouriteMarketScore(produce) {
    var score = 0;
    var ids = produce.marketIds || [];
    for (var i = 0; i < currentMarkets.length; i++) {
      if (ids.indexOf(currentMarkets[i].slug) !== -1) score++;
    }
    return score;
  }

  function pickSuggested(produce) {
    var candidates = [];

    for (var i = 0; i < allProduces.length; i++) {
      if (allProduces[i].id === produce.id) continue;
      candidates.push({
        produce: allProduces[i],
        sameCategory: allProduces[i].category === produce.category ? 1 : 0,
        sharedMarkets: favouriteMarketScore(allProduces[i]),
        order: i
      });
    }

    // Explicit ordering (category → shared markets → catalogue order) keeps
    // the result stable without relying on the engine's sort stability.
    candidates.sort(function (a, b) {
      if (a.sameCategory !== b.sameCategory) return b.sameCategory - a.sameCategory;
      if (a.sharedMarkets !== b.sharedMarkets) return b.sharedMarkets - a.sharedMarkets;
      return a.order - b.order;
    });

    var picked = [];
    for (var j = 0; j < candidates.length && picked.length < SUGGESTED_COUNT; j++) {
      picked.push(candidates[j].produce);
    }
    return picked;
  }

  function renderSuggested(produce) {
    if (!suggestedGridEl) return;

    suggestedProduces = pickSuggested(produce);
    suggestedGridEl.innerHTML = '';

    if (suggestedEmptyEl) suggestedEmptyEl.hidden = suggestedProduces.length > 0;
    suggestedGridEl.hidden = suggestedProduces.length === 0;

    if (!suggestCardTemplate || suggestedProduces.length === 0) return;

    var fragment = document.createDocumentFragment();

    suggestedProduces.forEach(function (item) {
      var card = suggestCardTemplate.content.cloneNode(true);

      var image = card.querySelector('.produce-card__image');
      image.src = item.image;
      image.alt = item.name;
      image.onerror = function () { image.hidden = true; };

      card.querySelector('.produce-card__name').textContent = item.name;
      card.querySelector('.produce-card__category-badge').textContent = item.category;
      card.querySelector('.produce-card__description').textContent = item.description;
      card.querySelector('.produce-card__season-text').textContent = (item.season && item.season.label) || 'Year-round';

      // Which markets stock it — same "max two names + N more" wording the
      // catalogue cards use.
      var names = [];
      (item.marketIds || []).forEach(function (slug) {
        var market = findMarketBySlug(slug);
        if (market) names.push(market.name);
      });

      var marketsEl = card.querySelector('.produce-card__available-markets');
      if (names.length === 0) {
        marketsEl.textContent = 'Not listed yet';
      } else if (names.length <= 2) {
        marketsEl.textContent = names.join(' • ');
      } else {
        marketsEl.textContent = names[0] + ' • ' + names[1] + ' +' + (names.length - 2) + ' more';
      }

      // The price tag is the card's CTA and opens that produce's own page.
      var priceLink = card.querySelector('.produce-card__price');
      priceLink.href = 'producesdetails.html?id=' + encodeURIComponent(item.id);
      priceLink.setAttribute('aria-label',
        item.name + ' — market price ' + priceText(item.price) + ', open details');
      priceLink.querySelector('.produce-card__price-value').innerHTML = hasPrice(item)
        ? 'Rs&nbsp;' + item.price.amount + '<span class="produce-card__price-unit">/' + item.price.unit + '</span>'
        : '<span class="produce-card__price-na">Ask at market</span>';

      // Whole card stays clickable too — anywhere except the price link.
      card.querySelector('.produce-card').addEventListener('click', function (event) {
        if (event.target.closest('a, button')) return;
        goToProduce(item.id);
      });

      fragment.appendChild(card);
    });

    suggestedGridEl.appendChild(fragment);
  }

  function goToProduce(produceId) {
    window.location.href = 'producesdetails.html?id=' + encodeURIComponent(produceId);
  }

  /* ---------------------------------------------------------------------
   * Page states — loading / content / not-found are mutually exclusive,
   * exactly as they are on the market details page.
   * ------------------------------------------------------------------- */

  function showContent() {
    if (loadingEl) loadingEl.hidden = true;
    if (contentEl) contentEl.hidden = false;
    if (notFoundEl) notFoundEl.hidden = true;
  }

  function showNotFound() {
    if (loadingEl) loadingEl.hidden = true;
    if (contentEl) contentEl.hidden = true;
    if (notFoundEl) notFoundEl.hidden = false;
  }

  function showLoadError() {
    // A data-load failure is not the same problem as an invalid ?id=, so the
    // loading line stays in place and simply reports the failure — the
    // "Produce Not Found" state is left for a genuinely unknown id.
    if (loadingEl) {
      loadingEl.hidden = false;
      loadingEl.textContent = "Produce details couldn't be loaded right now. Please try again shortly.";
    }
    if (contentEl) contentEl.hidden = true;
    if (notFoundEl) notFoundEl.hidden = true;
  }

  /* ---------------------------------------------------------------------
   * Rendering pipeline
   * ------------------------------------------------------------------- */

  function renderPage(produce) {
    currentMarkets = marketsFor(produce);
    collectReviews();

    renderOverview(produce);
    renderPrice(produce);
    renderMarkets();
    startStatusTimer();

    if (reviewsLoadFailed) {
      showReviewsEmpty('Reviews could not be loaded right now. Please refresh the page to try again.');
    } else {
      renderReviews();
    }

    renderSuggested(produce);

    document.title = produce.name + ' — FreshFind';
    showContent();
  }

  function bindControls() {
    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', function () {
        goToReviewPage(currentPage - 1);
      });
    }

    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', function () {
        goToReviewPage(currentPage + 1);
      });
    }
  }

  /* ---------------------------------------------------------------------
   * Boot — producesdetails.html loads this script at the end of <body>
   * ------------------------------------------------------------------- */

  function init() {
    var id = getProduceId();

    // No ?id= at all — there is no produce to show.
    if (!id) {
      showNotFound();
      return;
    }

    // The templates are clone sources for everything below; without them
    // there is nothing to render into.
    if (!contentEl || !marketItemTemplate || !reviewCardTemplate ||
      !ratingBarTemplate || !suggestCardTemplate) {
      showLoadError();
      return;
    }

    bindControls();

    Promise.all([
      fetchJson('data/produces.json', 'Failed to load produce data'),
      fetchJson('data/market.json', 'Failed to load market data'),
      // Reviews are additive: if reviews.json is unavailable the rest of the
      // page still renders, with the reviews section explaining itself.
      fetchJson('data/reviews.json', 'Failed to load reviews').catch(function () {
        reviewsLoadFailed = true;
        return { reviews: [] };
      })
    ])
      .then(function (results) {
        allProduces = results[0];
        allMarkets = results[1];
        allReviews = (results[2] && results[2].reviews) || [];

        var produce = findProduceById(id);
        if (!produce) {
          showNotFound();
          return;
        }

        renderPage(produce);
      })
      .catch(function (error) {
        if (window.console && window.console.error) {
          window.console.error('Error loading produce details:', error);
        }
        showLoadError();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }







})();

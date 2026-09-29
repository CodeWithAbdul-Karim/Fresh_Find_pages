/* =========================================================
   FreshFind — Market Details Page
   reviews.js — "Reviews about this market"

   Vanilla JS, IIFE, ES5-style (matches market.js /
   marketdetails.js — no arrow functions, no let/const).

   Reads ?id= from the URL, fetches data/reviews.json, keeps only
   the reviews whose marketId matches that market, and renders
   three things from them:
     · the rating summary — average, stars, total count and the
       5 → 1 star breakdown bars (#reviewsSummary)
     · one .review-card per review, cloned from
       <template id="reviewCardTemplate"> (#reviewsList)
     · pagination plus the "Page X of Y · N total reviews" line
       (#reviewsFooter)

   No market's rating is hardcoded anywhere: every figure shown
   belongs to whichever market the ?id= resolves to, and a market
   with no reviews yet gets the empty state instead of a made-up
   score.
   ========================================================= */

(function () {
  'use strict';

  // Configuration
  var REVIEWS_PER_PAGE = 4;
  var STAR_COUNT = 5;
  var STAR_PATH = 'M10 1.5l2.5 5 5.5 0.8-4 3.9 0.9 5.3-4.9-2.6-4.9 2.6 0.9-5.3-4-3.9 5.5-0.8z';

  var currentPage = 1;
  var allReviews = [];
  var currentMarketId = '';

  // DOM hooks — every one of these lives in marketdetails.html
  var reviewsSummary = document.getElementById('reviewsSummary');
  var overallRating = document.getElementById('overallRating');
  var summaryStars = document.getElementById('reviewsSummaryStars');
  var reviewsCount = document.getElementById('reviewsCount');
  var reviewsBreakdown = document.getElementById('reviewsBreakdown');
  var reviewsList = document.getElementById('reviewsList');
  var reviewsEmpty = document.getElementById('reviewsEmpty');
  var reviewsFooter = document.getElementById('reviewsFooter');
  var reviewsPagination = document.getElementById('reviewsPagination');
  var reviewsStatus = document.getElementById('reviewsStatus');
  var paginationPages = document.getElementById('paginationPages');
  var prevPageBtn = document.getElementById('prevPageBtn');
  var nextPageBtn = document.getElementById('nextPageBtn');
  var reviewCardTemplate = document.getElementById('reviewCardTemplate');
  var ratingBarTemplate = document.getElementById('ratingBarTemplate');
  var writeReviewBtn = document.getElementById('writeReviewBtn');

  /* ---------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------- */

  function init() {
    var params = new URLSearchParams(window.location.search);
    currentMarketId = (params.get('id') || '').trim();

    // Without an ?id=, marketdetails.js shows the not-found state, so
    // there is no market for reviews to belong to.
    if (!currentMarketId) {
      showEmptyState();
      return;
    }

    // Both templates are needed to render anything at all.
    if (!reviewsList || !reviewCardTemplate || !ratingBarTemplate) return;

    bindControls();
    loadReviews();
  }

  function bindControls() {
    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', function () {
        goToPage(currentPage - 1);
      });
    }

    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', function () {
        goToPage(currentPage + 1);
      });
    }

    if (writeReviewBtn) {
      writeReviewBtn.addEventListener('click', handleWriteReview);
    }
  }

  /* ---------------------------------------------------------------------
   * Data — only this market's own public reviews
   * ------------------------------------------------------------------- */

  function loadReviews() {
    fetch('data/reviews.json')
      .then(function (response) {
        if (!response.ok) throw new Error('reviews.json failed');
        return response.json();
      })
      .then(function (data) {
        var reviews = (data && data.reviews) || [];
        var marketId = currentMarketId.toLowerCase();

        allReviews = reviews.filter(function (review) {
          return String(review.marketId).toLowerCase() === marketId;
        });

        if (allReviews.length === 0) {
          showEmptyState();
          return;
        }

        renderSummary();
        renderReviews();
        renderPagination();
      })
      .catch(function (error) {
        console.error('Error loading reviews:', error);
        showErrorState();
      });
  }

  /* ---------------------------------------------------------------------
   * Rating summary — average, stars, count and breakdown bars
   * ------------------------------------------------------------------- */

  function renderSummary() {
    if (!reviewsSummary || !reviewsBreakdown) return;

    var average = averageRating(allReviews);
    var counts = countByRating(allReviews);

    if (overallRating) overallRating.textContent = average.toFixed(1);

    if (summaryStars) {
      summaryStars.innerHTML = buildStars(average, 'summary');
      summaryStars.setAttribute('aria-label', average.toFixed(1) + ' out of 5 stars');
    }

    if (reviewsCount) {
      reviewsCount.textContent = allReviews.length === 1
        ? '1 review'
        : allReviews.length + ' reviews';
    }

    reviewsBreakdown.innerHTML = '';

    for (var star = STAR_COUNT; star >= 1; star--) {
      var row = ratingBarTemplate.content.cloneNode(true);
      var bar = row.querySelector('.rating-bar');
      var count = counts[star];

      bar.querySelector('.rating-bar__label').textContent =
        star === 1 ? '1 star' : star + ' stars';

      // Bar length is this star's share of the market's total reviews.
      bar.querySelector('.rating-bar__fill').style.width =
        ((count / allReviews.length) * 100).toFixed(1) + '%';

      bar.querySelector('.rating-bar__count').textContent = count;
      bar.setAttribute('aria-label',
        star + ' star reviews: ' + count + ' of ' + allReviews.length);

      reviewsBreakdown.appendChild(row);
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
   * Stars — one shared renderer for the summary and every review card.
   * Ratings round to the nearest half star, so 4.4 reads as 4.5 stars.
   * ------------------------------------------------------------------- */

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
   * Review cards — cloned from <template id="reviewCardTemplate">, one
   * card per review on the current page.
   * ------------------------------------------------------------------- */

  function renderReviews() {
    if (!reviewsList || !reviewCardTemplate) return;

    reviewsList.innerHTML = '';

    var start = (currentPage - 1) * REVIEWS_PER_PAGE;
    var pageReviews = allReviews.slice(start, start + REVIEWS_PER_PAGE);

    for (var i = 0; i < pageReviews.length; i++) {
      reviewsList.appendChild(createReviewCard(pageReviews[i]));
    }
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
    stars.innerHTML = buildStars(review.rating, 'review-' + review.id);
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

  // Helpful is a two-way toggle — pressing it again takes the vote back.
  function toggleHelpful(review, button, countEl) {
    var marked = button.getAttribute('aria-pressed') === 'true';

    review.helpful = marked ? Math.max(0, review.helpful - 1) : review.helpful + 1;

    button.setAttribute('aria-pressed', marked ? 'false' : 'true');
    button.classList.toggle('is-helpful', !marked);
    countEl.textContent = review.helpful > 0 ? '(' + review.helpful + ')' : '';
  }

  function handleWriteReview() {
    // No write-review backend exists in this project yet, so this stays a
    // hook: the button is real, the submission form is still to come.
    window.alert('Write a review feature coming soon!');
  }

  /* ---------------------------------------------------------------------
   * Pagination + the "Page X of Y · N total reviews" line
   * ------------------------------------------------------------------- */

  function totalPages() {
    return Math.max(1, Math.ceil(allReviews.length / REVIEWS_PER_PAGE));
  }

  function renderPagination() {
    var pages = totalPages();

    // Nothing to page through at all.
    if (reviewsFooter) reviewsFooter.hidden = allReviews.length === 0;

    // Arrows and page numbers only make sense with more than one page.
    if (reviewsPagination) reviewsPagination.hidden = pages <= 1;

    if (paginationPages) {
      paginationPages.innerHTML = '';

      // At most three page buttons in view, like the design.
      var startPage = Math.max(1, Math.min(currentPage - 1, pages - 2));
      var endPage = Math.min(pages, startPage + 2);

      for (var i = startPage; i <= endPage; i++) {
        paginationPages.appendChild(createPageButton(i, pages));
      }
    }

    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === pages;

    if (reviewsStatus) {
      reviewsStatus.textContent = 'Page ' + currentPage + ' of ' + pages + '  ·  ' +
        allReviews.length + (allReviews.length === 1 ? ' total review' : ' total reviews');
    }
  }

  function createPageButton(page, pages) {
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
      goToPage(page);
    });

    return btn;
  }

  function goToPage(page) {
    var pages = totalPages();
    if (page < 1 || page > pages || page === currentPage) return;

    currentPage = page;
    renderReviews();
    renderPagination();

    if (reviewsSummary) {
      reviewsSummary.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ---------------------------------------------------------------------
   * Empty + error states — a market with no reviews is never shown a
   * rating, so the summary and footer are taken out of the flow instead.
   * ------------------------------------------------------------------- */

  function showEmptyState() {
    if (reviewsSummary) reviewsSummary.hidden = true;
    if (reviewsList) reviewsList.hidden = true;
    if (reviewsFooter) reviewsFooter.hidden = true;
    if (reviewsEmpty) reviewsEmpty.hidden = false;
  }

  function showErrorState() {
    if (reviewsSummary) reviewsSummary.hidden = true;
    if (reviewsFooter) reviewsFooter.hidden = true;

    if (reviewsList) {
      reviewsList.innerHTML = '';
      reviewsList.hidden = true;
    }

    if (reviewsEmpty) {
      reviewsEmpty.hidden = false;
      reviewsEmpty.textContent =
        'Reviews could not be loaded right now. Please refresh the page to try again.';
    }
  }

  /* ---------------------------------------------------------------------
   * Boot — marketdetails.html loads this script at the end of <body>.
   * ------------------------------------------------------------------- */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

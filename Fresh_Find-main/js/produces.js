/* =========================================================
   FreshFind — Produce Guide Page
   Part 4: produces.js

   Vanilla JS, IIFE, ES5-style (matches market.js/marketdetails.js
   conventions — no arrow functions, no let/const). Loads
   produces.json, renders the full 48-item catalogue with
   dynamic search + category filtering, numbered pagination
   (6 cards per page at every breakpoint), the current market
   price on each card, and navigation to the dedicated
   producesdetails.html page for the full produce view.

   No produce data is hardcoded anywhere — everything comes from
   produces.json and related market lookups from market.json.
   ========================================================= */

(function () {
  'use strict';

  /* ---------------------------------------------------------------------
   * Shared constants
   * ------------------------------------------------------------------- */

  var CATEGORIES = [
    'Fruits',
    'Vegetables',
    'Herbs',
    'Leafy Greens',
    'Roots & Tubers',
    'Dairy',
    'Eggs',
    'Organic / Farm Produce'
  ];

  /* ---------------------------------------------------------------------
   * Bookmark system — ported from market.js
   * Uses the same localStorage key so produce bookmarks integrate with
   * the existing market bookmark system if needed in future.
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
      // Storage unavailable — fail silently
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

  var allProduces = [];
  var allMarkets = [];

  var filterState = {
    search: '',
    category: 'all'
  };

  var PAGE_SIZE = 6;    // cards per catalogue page (fixed at every breakpoint)
  var currentPage = 1;  // current catalogue page (1-indexed)

  /* ---------------------------------------------------------------------
   * Data loading
   * ------------------------------------------------------------------- */

  function loadProduces() {
    return fetch('data/produces.json').then(function (response) {
      if (!response.ok) {
        throw new Error('Failed to load produce data');
      }
      return response.json();
    });
  }

  function loadMarkets() {
    return fetch('data/market.json').then(function (response) {
      if (!response.ok) {
        throw new Error('Failed to load market data');
      }
      return response.json();
    });
  }

  function findMarketById(id) {
    for (var i = 0; i < allMarkets.length; i++) {
      if (allMarkets[i].slug === id) {
        return allMarkets[i];
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------------
   * Filtering logic
   * ------------------------------------------------------------------- */

  function matchesFilter(produce) {
    // Category filter
    if (filterState.category !== 'all' && produce.category !== filterState.category) {
      return false;
    }

    // Search filter
    var query = filterState.search.trim().toLowerCase();
    if (query) {
      var haystack = [
        produce.name,
        produce.category,
        produce.description,
        produce.keywords ? produce.keywords.join(' ') : ''
      ].join(' ').toLowerCase();

      if (haystack.indexOf(query) === -1) {
        return false;
      }
    }

    return true;
  }

  /* ---------------------------------------------------------------------
   * Catalogue rendering
   * ------------------------------------------------------------------- */

  function renderCatalogue() {
    var grid = document.getElementById('produceGrid');
    var countEl = document.getElementById('produceResultCount');
    var emptyEl = document.getElementById('produceNoResults');
    var template = document.getElementById('produceCardTemplate');
    var pagination = document.getElementById('producePagination');
    var pagesWrap  = document.getElementById('producePagePages');
    var prevBtn    = document.getElementById('producePagePrev');
    var nextBtn    = document.getElementById('producePageNext');

    var filtered = allProduces.filter(matchesFilter);

    // Page window — clamp first so a shrinking filter never lands on an
    // empty page, then slice out the six cards for the current page.
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    var startIdx = (currentPage - 1) * PAGE_SIZE;
    var toShow = filtered.slice(startIdx, startIdx + PAGE_SIZE);

    grid.innerHTML = '';
    var fragment = document.createDocumentFragment();

    toShow.forEach(function (produce) {
      var card = template.content.cloneNode(true);

      // Image
      var image = card.querySelector('.produce-card__image');
      image.src = produce.image;
      image.alt = produce.name;
      image.onerror = function () { image.hidden = true; };

      // Name
      card.querySelector('.produce-card__name').textContent = produce.name;

      // Category badge (on image, like market status badge position)
      var catBadgeEl = card.querySelector('.produce-card__category-badge');
      if (catBadgeEl) catBadgeEl.textContent = produce.category;

      // Description
      card.querySelector('.produce-card__description').textContent = produce.description;

      // Season
      card.querySelector('.produce-card__season-text').textContent = produce.season.label;

      // Available at — resolve slugs to market names, show max 2 + "+N more"
      var marketNames = [];
      if (produce.marketIds && produce.marketIds.length > 0) {
        produce.marketIds.forEach(function (slug) {
          var market = findMarketById(slug);
          if (market) marketNames.push(market.name);
        });
      }
      var availableEl = card.querySelector('.produce-card__available-markets');
      if (marketNames.length === 0) {
        availableEl.textContent = 'Not listed yet';
      } else if (marketNames.length <= 2) {
        availableEl.textContent = marketNames.join(' • ');
      } else {
        availableEl.textContent = marketNames[0] + ' • ' + marketNames[1] + ' +' + (marketNames.length - 2) + ' more';
      }

      // Bookmark
      var bookmarkButton = card.querySelector('.produce-card__bookmark');
      bookmarkButton.setAttribute('aria-pressed', String(isBookmarked(produce.id)));
      bookmarkButton.setAttribute('aria-label', (isBookmarked(produce.id) ? 'Remove ' : 'Save ') + produce.name);
      bookmarkButton.addEventListener('click', function () {
        toggleBookmark(produce.id);
        var nowBookmarked = isBookmarked(produce.id);
        bookmarkButton.setAttribute('aria-pressed', String(nowBookmarked));
        bookmarkButton.setAttribute('aria-label', (nowBookmarked ? 'Remove ' : 'Save ') + produce.name);
      });

      // Market price — the card's CTA now IS the price, and the tag links
      // to the dedicated detail page instead of opening an inline panel.
      var priceLink = card.querySelector('.produce-card__price');
      priceLink.href = 'producesdetails.html?id=' + encodeURIComponent(produce.id);
      priceLink.setAttribute('aria-label',
        produce.name + ' — market price ' + priceText(produce.price) + ', open details');
      priceLink.querySelector('.produce-card__price-value').innerHTML = priceValueHtml(produce.price);

      // Whole card is clickable too — anywhere except the bookmark button
      // or the price tag itself, which handle their own clicks.
      card.querySelector('.produce-card').addEventListener('click', function (event) {
        if (event.target.closest('a, button')) return;
        goToProduce(produce.id);
      });

      fragment.appendChild(card);
    });

    grid.appendChild(fragment);

    // Count label
    var total = allProduces.length;
    var shown = filtered.length;
    countEl.hidden = false;
    var countText = shown === total
      ? 'Showing all ' + total + ' items'
      : 'Showing ' + shown + ' of ' + total + ' items';
    countEl.innerHTML = '<span class="produce-catalogue__count-inner">' + countText + '</span>';

    // Pagination — numbered pages whenever more than one page of results
    // exists (identical behaviour at every screen size).
    pagination.hidden = filtered.length === 0 || totalPages <= 1;

    if (!pagination.hidden) {
      renderPagination(pagesWrap, totalPages, currentPage);
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= totalPages;
    }

    if (shown === 0) {
      grid.hidden = true;
      emptyEl.hidden = false;
      pagination.hidden = true;
    } else {
      grid.hidden = false;
      emptyEl.hidden = true;
      observeProduceCards();
      // Fade-in new cards with stagger
      // Double rAF ensures the browser has painted opacity:0 before we
      // start the transition — without this the transition is skipped.
      var allCards = grid.querySelectorAll('.produce-card');
      allCards.forEach(function (card) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(12px)';
        card.style.transition = 'none';
      });
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          allCards.forEach(function (card, idx) {
            card.style.transition = 'opacity 0.35s ease ' + (idx * 40) + 'ms, transform 0.35s ease ' + (idx * 40) + 'ms';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          });
        });
      });
    }
  }

  /* ---------------------------------------------------------------------
   * Produce navigation — every card, price tag and season CTA opens the
   * dedicated producesdetails.html page (the old inline detail panel is
   * gone; it lives on as that page's own layout).
   * ------------------------------------------------------------------- */

  function goToProduce(produceId) {
    window.location.href = 'producesdetails.html?id=' + encodeURIComponent(produceId);
  }

  /* ---------------------------------------------------------------------
   * Market price helpers — each card shows produce.price from produces.json
   * ------------------------------------------------------------------- */

  function priceText(price) {
    return (price && typeof price.amount === 'number')
      ? 'Rs ' + price.amount + ' / ' + price.unit
      : 'Ask at market';
  }

  function priceValueHtml(price) {
    if (!price || typeof price.amount !== 'number') {
      return '<span class="produce-card__price-na">Ask at market</span>';
    }
    return 'Rs&nbsp;' + price.amount +
      '<span class="produce-card__price-unit">/' + price.unit + '</span>';
  }

  /* ---------------------------------------------------------------------
   * Pagination — numbered pages (windowed when there are many), identical
   * at every breakpoint. goToPage re-renders the grid and eases the page
   * back to the top of the catalogue so the new cards are in view.
   * ------------------------------------------------------------------- */

  function renderPagination(wrap, totalPages, active) {
    wrap.innerHTML = '';

    pageWindow(totalPages, active).forEach(function (entry) {
      if (entry === '…') {
        var gap = document.createElement('span');
        gap.className = 'produce-pagination__gap';
        gap.textContent = '…';
        gap.setAttribute('aria-hidden', 'true');
        wrap.appendChild(gap);
        return;
      }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'produce-pagination__page';
      btn.textContent = entry;
      btn.setAttribute('aria-label', 'Page ' + entry + ' of ' + totalPages);

      if (entry === active) {
        btn.classList.add('produce-pagination__page--active');
        btn.setAttribute('aria-current', 'page');
      }

      btn.addEventListener('click', function () {
        goToPage(entry);
      });

      wrap.appendChild(btn);
    });
  }

  // Which page numbers to show: all of them when there are seven or
  // fewer, otherwise first, last and a small window around the active
  // page with ellipses in between.
  function pageWindow(totalPages, active) {
    if (totalPages <= 7) {
      var all = [];
      for (var i = 1; i <= totalPages; i++) all.push(i);
      return all;
    }

    var pages = [1];
    var from = Math.max(2, active - 1);
    var to = Math.min(totalPages - 1, active + 1);

    if (from > 2) pages.push('…');
    for (var p = from; p <= to; p++) pages.push(p);
    if (to < totalPages - 1) pages.push('…');

    pages.push(totalPages);
    return pages;
  }

  function goToPage(page) {
    var filtered = allProduces.filter(matchesFilter);
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    var target = Math.min(Math.max(1, page), totalPages);

    if (target === currentPage) return;
    currentPage = target;
    renderCatalogue();

    // Bring the freshly rendered grid back into view below the sticky
    // navbar + ticker, without hiding its first row.
    var grid = document.getElementById('produceGrid');
    var navbarH = (parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--ff-height-top') || '76', 10))
      + (parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--ff-ticker-height') || '34', 10))
      + 24;
    var top = grid.getBoundingClientRect().top + window.pageYOffset - navbarH;
    window.scrollTo({
      top: top,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }

  /* ---------------------------------------------------------------------
   * What's in season
   * ------------------------------------------------------------------- */

  var MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function renderSeasonalHighlight() {
    var list = document.getElementById('produceSeasonList');
    var emptyEl = document.getElementById('produceSeasonEmpty');
    var countEl = document.getElementById('produceSeasonCount');
    var monthEl = document.getElementById('produceSeasonMonth');
    var template = document.getElementById('produceSeasonItemTemplate');
    var now = new Date();
    var currentMonth = now.getMonth() + 1; // JS months are 0-indexed

    // Inject current month name into the header
    if (monthEl) {
      monthEl.textContent = MONTH_NAMES[now.getMonth()];
    }

    // Filter produces that are in season this month
    var seasonal = allProduces.filter(function (produce) {
      return produce.season.months.indexOf(currentMonth) !== -1;
    });

    // Limit to a reasonable number for the highlight section
    var maxItems = 12;
    var featured = seasonal.slice(0, maxItems);

    // Update count badge
    if (countEl) {
      countEl.textContent = featured.length + ' fresh now';
    }

    if (featured.length === 0) {
      emptyEl.hidden = false;
      list.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    list.hidden = false;
    list.innerHTML = '';

    var fragment = document.createDocumentFragment();

    featured.forEach(function (produce) {
      var item = template.content.cloneNode(true);

      var image = item.querySelector('.produce-season__image');
      image.src = produce.image;
      image.alt = produce.name;
      image.onerror = function () {
        image.hidden = true;
      };

      item.querySelector('.produce-season__name').textContent = produce.name;
      item.querySelector('.produce-season__category').textContent = produce.category;
      item.querySelector('.produce-season__season-label').textContent = produce.season.label;

      // Description — reuse produce description for the season card body
      var seasonDesc = item.querySelector('.produce-season__description');
      if (seasonDesc) seasonDesc.textContent = produce.description;

      var ctaBtn = item.querySelector('.produce-season__cta');
      ctaBtn.dataset.id = produce.id;
      ctaBtn.addEventListener('click', function () {
        goToProduce(produce.id);
      });

      fragment.appendChild(item);
    });

    list.appendChild(fragment);
  }

  /* ---------------------------------------------------------------------
   * Hero panel — populate Fresh Today data
   * Runs after produces.json loads. Fills:
   *   #heroPanelMonth      — current month name
   *   #heroPanelSeasonCount — number of items in season this month
   *   #heroPanelCats       — category breakdown badges (category name + count)
   * ------------------------------------------------------------------- */

  function populateHeroPanel() {
    var now = new Date();
    var currentMonth = now.getMonth() + 1; // 1-indexed

    // Month label
    var monthEl = document.getElementById('heroPanelMonth');
    if (monthEl) {
      monthEl.textContent = MONTH_NAMES[now.getMonth()];
    }

    // Items in season this month
    var seasonal = allProduces.filter(function (p) {
      return p.season.months.indexOf(currentMonth) !== -1;
    });

    var countEl = document.getElementById('heroPanelSeasonCount');
    if (countEl) {
      countEl.textContent = seasonal.length;
    }

    // Category breakdown — count seasonal items per category
    var catMap = {};
    seasonal.forEach(function (p) {
      catMap[p.category] = (catMap[p.category] || 0) + 1;
    });

    // Category emoji map for visual interest
    var CAT_EMOJI = {
      'Fruits':                  '🍋',
      'Vegetables':              '🥦',
      'Herbs':                   '🌿',
      'Leafy Greens':            '🥬',
      'Roots & Tubers':          '🥕',
      'Dairy':                   '🥛',
      'Eggs':                    '🥚',
      'Organic / Farm Produce':  '🌱'
    };

    var catsEl = document.getElementById('heroPanelCats');
    if (!catsEl) return;

    catsEl.innerHTML = '';

    // Sort by count descending so the most in-season categories appear first
    var catEntries = Object.keys(catMap).sort(function (a, b) {
      return catMap[b] - catMap[a];
    });

    catEntries.forEach(function (cat, idx) {
      var badge = document.createElement('span');
      badge.className = 'produce-hero__cat-badge';
      badge.style.setProperty('--badge-delay', (idx * 0.06) + 's');

      var emoji = CAT_EMOJI[cat] || '🌾';
      badge.innerHTML =
        emoji + ' ' +
        '<span class="produce-hero__cat-badge-text">' + cat + '</span>' +
        '<span class="produce-hero__cat-badge-count">' + catMap[cat] + '</span>';

      catsEl.appendChild(badge);
    });

    // If nothing is in season this month, show a quiet fallback
    if (catEntries.length === 0) {
      var fallback = document.createElement('span');
      fallback.style.cssText = 'font-size:0.75rem;color:rgba(255,255,255,0.38);';
      fallback.textContent = 'Check back soon';
      catsEl.appendChild(fallback);
    }
  }

  /* ---------------------------------------------------------------------
   * Scroll reveal — IntersectionObserver fades elements in as they
   * enter the viewport. Identical pattern to market.js revealObserver.
   * Cards are observed after each renderCatalogue() call via
   * observeProduceCards(); static [data-reveal] elements are observed
   * immediately at script boot so section headers, toolbar, and count
   * pill all animate in as the user scrolls down.
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

  /* Called after renderCatalogue() to observe freshly injected cards */
  function observeProduceCards() {
    var grid = document.getElementById('produceGrid');
    grid.querySelectorAll('.produce-card').forEach(function (card) {
      if (!card.classList.contains('is-visible')) {
        revealObserver.observe(card);
      }
    });
  }

  /* ---------------------------------------------------------------------
   * Search and filter wiring
   * ------------------------------------------------------------------- */

  // heroInput is the hidden form input kept for JS compatibility.
  // It stays in sync with catalogueInput but the user never sees it.
  var heroInput = document.getElementById('produceSearch');
  var catalogueInput = document.getElementById('catalogueSearch');
  var searchDebounceTimer = null;

  function setSearchValue(value, skipRender) {
    filterState.search = value;
    if (heroInput && heroInput.value !== value) heroInput.value = value;
    if (catalogueInput.value !== value) catalogueInput.value = value;
    if (!skipRender) renderCatalogue();
  }

  function debouncedSearch(value) {
    filterState.search = value;
    if (heroInput && heroInput.value !== value) heroInput.value = value;
    if (catalogueInput.value !== value) catalogueInput.value = value;
    currentPage = 1; // any new search starts back on page 1
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(renderCatalogue, 150);
  }

  catalogueInput.addEventListener('input', function (event) {
    // Free-text typing resets category filter to "all"
    filterState.category = 'all';
    setActiveOption('all');
    debouncedSearch(event.target.value);
  });

  document.getElementById('categoryFilter').addEventListener('change', function (event) {
    filterState.category = event.target.value;
    renderCatalogue();
  });

  document.getElementById('resetProduceFilters').addEventListener('click', function () {
    filterState = { search: '', category: 'all' };
    currentPage = 1;
    if (heroInput) heroInput.value = '';
    catalogueInput.value = '';
    setActiveOption('all');
    closeCombobox();
    renderCatalogue();
  });

  document.getElementById('produceEmptyReset').addEventListener('click', function () {
    filterState = { search: '', category: 'all' };
    currentPage = 1;
    if (heroInput) heroInput.value = '';
    catalogueInput.value = '';
    setActiveOption('all');
    closeCombobox();
    renderCatalogue();
  });

  /* ---------------------------------------------------------------------
   * Combobox — dropdown toggle + option selection
   * ------------------------------------------------------------------- */

  var combobox      = document.getElementById('produceCombobox');
  var comboToggle   = document.getElementById('produceComboboxToggle');
  var comboDropdown = document.getElementById('produceCategoryDropdown');

  function openCombobox() {
    combobox.classList.add('is-open');
    catalogueInput.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        comboDropdown.classList.add('is-visible');
      });
    });
  }

  function closeCombobox() {
    comboDropdown.classList.remove('is-visible');
    combobox.classList.remove('is-open');
    catalogueInput.setAttribute('aria-expanded', 'false');
  }

  function setActiveOption(category) {
    document.querySelectorAll('.produce-combobox__option').forEach(function (opt) {
      var isActive = opt.dataset.category === category;
      opt.classList.toggle('produce-combobox__option--selected', isActive);
      opt.setAttribute('aria-selected', String(isActive));
    });
  }

  // Chevron toggles; input click opens
  comboToggle.addEventListener('click', function (e) {
    e.stopPropagation();
    if (combobox.classList.contains('is-open')) {
      closeCombobox();
    } else {
      openCombobox();
      catalogueInput.focus();
    }
  });

  catalogueInput.addEventListener('click', function (e) {
    e.stopPropagation();
    openCombobox();
  });

  // Option selection
  document.querySelectorAll('.produce-combobox__option').forEach(function (opt) {
    opt.addEventListener('click', function (e) {
      e.stopPropagation();
      var category = opt.dataset.category;
      var label    = opt.dataset.label;

      catalogueInput.value = label;
      if (heroInput) heroInput.value = '';

      filterState.category = category;
      filterState.search   = '';
      currentPage = 1;

      setActiveOption(category);
      closeCombobox();
      renderCatalogue();
    });
  });

  // Close on any outside click
  document.addEventListener('click', function () {
    closeCombobox();
  });

  // Escape closes
  catalogueInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeCombobox();
    }
  });

  /* ---------------------------------------------------------------------
   * Pagination controls — prev / next around the numbered page buttons
   * ------------------------------------------------------------------- */

  document.getElementById('producePagePrev').addEventListener('click', function () {
    goToPage(currentPage - 1);
  });

  document.getElementById('producePageNext').addEventListener('click', function () {
    goToPage(currentPage + 1);
  });

  /* ---------------------------------------------------------------------
   * Hero search form — kept for compatibility, form is hidden in new hero
   * ------------------------------------------------------------------- */

  var searchForm = document.getElementById('produceSearchForm');
  var catalogue = document.getElementById('produceCatalogue');
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (searchForm) {
    searchForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (heroInput) setSearchValue(heroInput.value, false);
      catalogue.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
      catalogue.focus();
    });
  }

  /* ---------------------------------------------------------------------
   * Initialization
   * ------------------------------------------------------------------- */

  function showLoadError() {
    var status = document.getElementById('produceCatalogueStatus');
    status.textContent = "Produce catalogue couldn't be loaded right now. Please try again shortly.";
  }

  /* ---------------------------------------------------------------------
   * URL Parameter Handling — Auto-select category from URL
   * ------------------------------------------------------------------- */
  function handleURLParameters() {
    var urlParams = new URLSearchParams(window.location.search);
    var categoryParam = urlParams.get('category');
    
    if (categoryParam) {
      // Set the category filter
      filterState.category = categoryParam;
      filterState.search = '';
      currentPage = 1;
      
      // Update the combobox to show the selected category
      catalogueInput.value = categoryParam;
      setActiveOption(categoryParam);
      
      // Auto-scroll to catalogue section after a brief delay to ensure rendering
      setTimeout(function() {
        var catalogue = document.getElementById('produceCatalogue');
        if (catalogue) {
          var navbarH = (parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue('--ff-height-top') || '76', 10))
            + (parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue('--ff-ticker-height') || '34', 10))
            + 24;
          var top = catalogue.getBoundingClientRect().top + window.pageYOffset - navbarH;
          window.scrollTo({
            top: top,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
          });
        }
      }, 300);
    }
  }

  function init() {
    Promise.all([loadProduces(), loadMarkets()])
      .then(function (results) {
        allProduces = results[0];
        allMarkets = results[1];

        document.getElementById('produceCatalogueStatus').hidden = true;
        var toolbar = document.getElementById('produceToolbar');
        toolbar.removeAttribute('hidden');
        toolbar.style.display = 'flex';

        populateHeroPanel();
        
        // Handle URL parameters before first render
        handleURLParameters();
        
        renderCatalogue();
        renderSeasonalHighlight();

        // Observe season section list after it is populated
        var seasonList = document.getElementById('produceSeasonList');
        if (seasonList && !seasonList.hidden) {
          revealObserver.observe(seasonList);
        }
      })
      .catch(function () {
        showLoadError();
      });
  }

  init();
})();

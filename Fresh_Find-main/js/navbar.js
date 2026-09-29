/* =========================================================
   FreshFind Navbar — Behavior
   Vanilla JS, zero dependencies. Handles:
     1. Scroll state (top / scrolled)
     2. Mobile menu open / close + hamburger animation
     3. Categories panel open / close (slide-in sidebar)
     4. Categories search / live filter
     5. Active nav-link tracking
     6. Header product search — submit handling
     7. Keyboard & accessibility (Escape, focus-trap)
   ========================================================= */

(function () {
  "use strict";

  /* ─── Element refs ──────────────────────────────────────── */
  var navbar         = document.getElementById("ffNavbar");
  var hamburgerBtn   = document.getElementById("ffHamburgerBtn");
  var mobileMenu     = document.getElementById("ffMobileMenu");

  // Categories panel
  var catBtn         = document.getElementById("ffCatBtn");         // desktop trigger
  var mobileCatBtn   = document.getElementById("ffMobileCatBtn");   // mobile trigger
  var catPanel       = document.getElementById("ffCatPanel");
  var catClose       = document.getElementById("ffCatClose");
  var catOverlay     = document.getElementById("ffCatOverlay");
  var catSearch      = document.getElementById("ffCatSearch");
  var catList        = document.getElementById("ffCatList");

  if (!navbar) return;

  /* =========================================================
     1. SCROLL STATE
     ========================================================= */
  var SCROLL_THRESHOLD = 24;
  var ticking = false;

  function updateScrollState() {
    var isScrolled = window.scrollY > SCROLL_THRESHOLD;
    navbar.setAttribute("data-ff-state", isScrolled ? "scrolled" : "top");
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(updateScrollState);
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  updateScrollState();

  /* =========================================================
     2. MOBILE MENU
     ========================================================= */
  var menuIsOpen = false;

  function openMobileMenu() {
    if (!mobileMenu || !hamburgerBtn) return;
    menuIsOpen = true;
    mobileMenu.hidden = false;
    void mobileMenu.offsetHeight; // force reflow for transition
    mobileMenu.classList.add("is-open");
    hamburgerBtn.setAttribute("aria-expanded", "true");
    hamburgerBtn.setAttribute("aria-label", "Close menu");
  }

  function closeMobileMenu(returnFocus) {
    if (!mobileMenu || !hamburgerBtn) return;
    menuIsOpen = false;
    mobileMenu.classList.remove("is-open");
    hamburgerBtn.setAttribute("aria-expanded", "false");
    hamburgerBtn.setAttribute("aria-label", "Open menu");

    // Hide after CSS transition ends
    var onEnd = function (e) {
      if (e.target === mobileMenu && e.propertyName === "max-height") {
        mobileMenu.hidden = true;
        mobileMenu.removeEventListener("transitionend", onEnd);
      }
    };
    mobileMenu.addEventListener("transitionend", onEnd);

    if (returnFocus && hamburgerBtn) hamburgerBtn.focus();
  }

  function toggleMobileMenu() {
    menuIsOpen ? closeMobileMenu(false) : openMobileMenu();
  }

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", toggleMobileMenu);
  }

  // Close menu when a nav link is tapped
  if (mobileMenu) {
    mobileMenu.querySelectorAll("[data-ff-nav-link]").forEach(function (link) {
      link.addEventListener("click", function () { closeMobileMenu(false); });
    });
  }

  // Close on resize back to desktop
  window.addEventListener("resize", function () {
    if (menuIsOpen && window.innerWidth > 900) closeMobileMenu(false);
  });

  /* =========================================================
     3. CATEGORIES PANEL — open / close
     ========================================================= */
  var panelIsOpen = false;

  /**
   * Open the categories sidebar panel.
   * @param {HTMLElement} [triggerEl] - the button that opened the panel
   *   (used to return focus on close).
   */
  function openCatPanel(triggerEl) {
    if (!catPanel || !catOverlay) return;
    panelIsOpen = true;

    // Remove hidden so the element is in the DOM before transition
    catPanel.hidden = false;
    catPanel.removeAttribute("aria-hidden");
    catOverlay.classList.add("is-visible");

    void catPanel.offsetHeight; // force reflow

    catPanel.classList.add("is-open");
    catOverlay.classList.add("is-active");

    // Update ARIA on both triggers
    if (catBtn)       catBtn.setAttribute("aria-expanded", "true");
    if (mobileCatBtn) mobileCatBtn.setAttribute("aria-expanded", "true");

    // Store which element triggered the open so we can return focus
    catPanel._triggerEl = triggerEl || null;

    // Shift focus into the panel (close button is first focusable)
    if (catClose) {
      setTimeout(function () { catClose.focus(); }, 50);
    }

    // Clear any previous search
    if (catSearch) {
      catSearch.value = "";
      filterCategories("");
    }
  }

  /**
   * Close the categories sidebar panel.
   * @param {boolean} [returnFocus=true]
   */
  function closeCatPanel(returnFocus) {
    if (!catPanel || !catOverlay || !panelIsOpen) return;
    panelIsOpen = false;

    catPanel.classList.remove("is-open");
    catOverlay.classList.remove("is-active");

    if (catBtn)       catBtn.setAttribute("aria-expanded", "false");
    if (mobileCatBtn) mobileCatBtn.setAttribute("aria-expanded", "false");

    // Return focus to the trigger button
    var shouldReturn = (returnFocus !== false);
    var trigger = catPanel._triggerEl;

    // Wait for slide-out transition, then hide
    var onEnd = function (e) {
      if (e.target === catPanel && e.propertyName === "transform") {
        catPanel.hidden = true;
        catPanel.setAttribute("aria-hidden", "true");
        catOverlay.classList.remove("is-visible");
        catPanel.removeEventListener("transitionend", onEnd);
        if (shouldReturn && trigger) trigger.focus();
      }
    };
    catPanel.addEventListener("transitionend", onEnd);

    // Fallback in case transitionend doesn't fire (reduced-motion, etc.)
    setTimeout(function () {
      if (catPanel.hidden) return; // already handled
      catPanel.hidden = true;
      catPanel.setAttribute("aria-hidden", "true");
      catOverlay.classList.remove("is-visible");
      if (shouldReturn && trigger) trigger.focus();
    }, 400);
  }

  function toggleCatPanel(triggerEl) {
    panelIsOpen ? closeCatPanel(true) : openCatPanel(triggerEl);
  }

  // Desktop trigger
  if (catBtn) {
    catBtn.addEventListener("click", function () {
      // Close mobile menu if it's open
      if (menuIsOpen) closeMobileMenu(false);
      toggleCatPanel(catBtn);
    });
  }

  // Mobile trigger (inside mobile menu)
  if (mobileCatBtn) {
    mobileCatBtn.addEventListener("click", function () {
      closeMobileMenu(false);
      openCatPanel(mobileCatBtn);
    });
  }

  // Close button inside panel
  if (catClose) {
    catClose.addEventListener("click", function () {
      closeCatPanel(true);
    });
  }

  // Click on overlay → close
  if (catOverlay) {
    catOverlay.addEventListener("click", function () {
      closeCatPanel(true);
    });
  }

  /* ─── Focus trap inside the panel ──────────────────────── */
  if (catPanel) {
    catPanel.addEventListener("keydown", function (e) {
      if (!panelIsOpen) return;

      // Escape closes the panel
      if (e.key === "Escape") {
        e.preventDefault();
        closeCatPanel(true);
        return;
      }

      // Tab / Shift+Tab trap focus within the panel
      if (e.key !== "Tab") return;

      var focusable = Array.from(
        catPanel.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(function (el) {
        return !el.closest('[hidden]') && el.offsetParent !== null;
      });

      if (focusable.length === 0) return;

      var first = focusable[0];
      var last  = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  // Global Escape listener (catches Escape even if focus is outside panel)
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (panelIsOpen) {
        closeCatPanel(true);
      } else if (menuIsOpen) {
        closeMobileMenu(true);
      }
    }
  });

  /* =========================================================
     4. CATEGORIES LIVE SEARCH / FILTER
     ========================================================= */

  /**
   * Filter .ff-cat-panel__item elements by matching their
   * data-cat-name attribute against the query string.
   * Shows a "no results" message when nothing matches.
   */
  function filterCategories(query) {
    if (!catList) return;

    var q = query.trim().toLowerCase();
    var items = catList.querySelectorAll(".ff-cat-panel__item");
    var visibleCount = 0;

    items.forEach(function (item) {
      var name = (item.getAttribute("data-cat-name") || "").toLowerCase();
      var match = (q === "" || name.indexOf(q) !== -1);
      item.style.display = match ? "" : "none";
      if (match) visibleCount++;
    });

    // Handle no-results message
    var noResultsEl = catList.querySelector(".ff-cat-panel__no-results");

    if (visibleCount === 0 && q !== "") {
      if (!noResultsEl) {
        noResultsEl = document.createElement("li");
        noResultsEl.className = "ff-cat-panel__no-results";
        noResultsEl.setAttribute("role", "status");
        catList.appendChild(noResultsEl);
      }
      noResultsEl.textContent = 'No categories found for "' + query.trim() + '"';
      noResultsEl.style.display = "";
    } else if (noResultsEl) {
      noResultsEl.style.display = "none";
    }
  }

  if (catSearch) {
    catSearch.addEventListener("input", function () {
      filterCategories(catSearch.value);
    });

    // Clear search on Escape (but don't close panel)
    catSearch.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && catSearch.value !== "") {
        e.stopPropagation(); // prevent the global handler from closing panel
        catSearch.value = "";
        filterCategories("");
      }
    });
  }

  /* =========================================================
     5. ACTIVE NAV LINK — Auto-detect based on current page
     ========================================================= */
  
  function getCurrentPage() {
    var path = window.location.pathname;
    var filename = path.substring(path.lastIndexOf('/') + 1) || 'market.html';
    return filename;
  }

  function setActiveByPage(pageType) {
    document.querySelectorAll("[data-ff-nav-link]").forEach(function (link) {
      var linkPage = link.getAttribute("data-page");
      var isMatch = linkPage === pageType;
      link.classList.toggle("is-active", isMatch);
      if (isMatch) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  // Auto-detect and set active link on page load
  function initActiveLink() {
    var currentPage = getCurrentPage();
    var activePageType = 'markets'; // default to markets since market.html is the home
    
    if (currentPage === 'produces.html' || currentPage === 'producesdetails.html') {
      activePageType = 'produces';
    } else if (currentPage === 'market.html' || currentPage === 'marketdetails.html' || currentPage === 'index.html' || currentPage === '') {
      activePageType = 'markets';
    } else if (currentPage === 'bookmarks.html') {
      activePageType = 'bookmarks';
    }
    
    setActiveByPage(activePageType);
  }

  // Initialize on page load
  initActiveLink();

  // Also update on click for manual navigation
  document.querySelectorAll("[data-ff-nav-link]").forEach(function (link) {
    link.addEventListener("click", function () { 
      var pageType = link.getAttribute("data-page");
      if (pageType) setActiveByPage(pageType);
    });
  });

  /* =========================================================
     6. BOOKMARK COUNT — Sync with localStorage
     ========================================================= */
  var BOOKMARK_KEY = 'freshfind:bookmarks';
  
  function loadBookmarkCount() {
    try {
      var raw = window.localStorage.getItem(BOOKMARK_KEY);
      var ids = raw ? JSON.parse(raw) : [];
      return ids.length;
    } catch (e) {
      return 0;
    }
  }
  
  function updateBookmarkBadge() {
    var count = loadBookmarkCount();
    var badge = document.getElementById('ffBookmarkCount');
    var btn = document.getElementById('ffBookmarkBtn');
    
    if (badge) {
      badge.textContent = String(count);
      badge.setAttribute('data-count', String(count));
      if (count === 0) {
        badge.style.display = 'none';
      } else {
        badge.style.display = 'flex';
      }
    }
    
    if (btn) {
      btn.setAttribute('aria-label', 'View saved items (' + count + ')');
    }
  }
  
  // Initialize bookmark count on page load
  updateBookmarkBadge();
  
  // Listen for storage changes (cross-tab sync)
  window.addEventListener('storage', function (e) {
    if (e.key === BOOKMARK_KEY) {
      updateBookmarkBadge();
    }
  });
  
  // Listen for custom bookmark events (same-tab updates)
  document.addEventListener('freshfind:bookmark-changed', function () {
    updateBookmarkBadge();
  });

  /* =========================================================
     7. HEADER PRODUCT SEARCH
     ========================================================= */
  var searchForm  = document.getElementById("ffSearchForm");
  var searchInput = document.getElementById("ffSearchInput");

  if (searchForm) {
    searchForm.addEventListener("submit", function (e) {
      // Demo build: there is no search route yet, so stop the default
      // GET reload and announce the query instead. Hook it up with:
      //   document.addEventListener("freshfind:search", function (ev) {
      //     location.href = "search.html?q=" + encodeURIComponent(ev.detail.query);
      //   });
      e.preventDefault();

      var query = searchInput ? searchInput.value.trim() : "";
      if (!query) {
        if (searchInput) searchInput.focus();
        return;
      }

      document.dispatchEvent(new CustomEvent("freshfind:search", {
        detail: { query: query }
      }));
    });
  }

  /* =========================================================
     8. PUBLIC API
     ========================================================= */
  window.FreshFindNavbar = {
    openCatPanel:     function () { openCatPanel(); },
    closeCatPanel:    function () { closeCatPanel(false); },
    openMobileMenu:   openMobileMenu,
    closeMobileMenu:  function () { closeMobileMenu(false); },
    setBookmarkCount: function (count) {
      var badge = document.getElementById('ffBookmarkCount');
      var btn = document.getElementById('ffBookmarkBtn');
      if (badge) {
        badge.textContent = String(count);
        badge.setAttribute('data-count', String(count));
        if (count === 0) {
          badge.style.display = 'none';
        } else {
          badge.style.display = 'flex';
        }
      }
      if (btn) {
        btn.setAttribute('aria-label', 'View saved items (' + count + ')');
      }
    },
    updateBookmarkBadge: updateBookmarkBadge
  };

})();

(function () {
  'use strict';

  /* ------------------------------------------------------------------
   * Simulated Visitor Counter
   *
   * Simulates a "visitors today" count using localStorage:
   *  - A base count is stored per calendar day.
   *  - On each page load the count increments by 1 (this visit).
   *  - Every 45 seconds a small random increment is added to simulate
   *    other visitors arriving, so the number feels live.
   *  - At midnight the count resets with a fresh random base.
   *
   * No server is contacted — purely frontend simulation.
   * ------------------------------------------------------------------ */

  var STORAGE_KEY   = 'freshfind:visitorCount';
  var TICK_INTERVAL = 45000; // ms between simulated background visits

  /* ------------------------------------------------------------------
   * Storage helpers
   * ------------------------------------------------------------------ */

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function loadData() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveData(data) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* quota or private mode — silent */ }
  }

  /* Random integer between min and max inclusive */
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /* ------------------------------------------------------------------
   * Init count
   * ------------------------------------------------------------------ */

  var today = todayKey();
  var data  = loadData();

  if (!data || data.date !== today) {
    // New day — start with a realistic-looking base (150–340)
    data = { date: today, count: randInt(150, 340) };
  }

  // Count this visit
  data.count += 1;
  saveData(data);

  var currentCount = data.count;

  /* ------------------------------------------------------------------
   * Display helpers
   * ------------------------------------------------------------------ */

  var displayEl    = document.getElementById('visitorCount');
  var pillEl       = document.getElementById('pillVisitorCount');

  function formatCount(n) {
    // Add comma separator for thousands: 1234 → 1,234
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* Animated count-up from `from` to `to` over ~600 ms */
  function animateTo(from, to) {
    var duration  = 600;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed  = timestamp - startTime;
      var progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      var eased    = 1 - Math.pow(1 - progress, 3);
      var value    = Math.round(from + (to - from) * eased);
      var formatted = formatCount(value);
      if (displayEl) displayEl.textContent = formatted;
      if (pillEl)    pillEl.textContent    = formatted;
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    }

    window.requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------
   * Reveal on scroll — count-up fires when the stat card enters viewport
   * ------------------------------------------------------------------ */

  function startCounter() {
    animateTo(Math.max(1, currentCount - randInt(15, 40)), currentCount);
  }

  if (displayEl) {
    displayEl.textContent = '…';
  }
  if (pillEl) {
    pillEl.textContent = '…';
  }

  // Use IntersectionObserver so animation triggers when visible
  var targetEl = displayEl || pillEl;
  if (targetEl) {
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            startCounter();
            observer.disconnect();
          }
        });
      }, { threshold: 0.5 });
      observer.observe(targetEl);
    } else {
      // Fallback — just set it immediately
      var formatted = formatCount(currentCount);
      if (displayEl) displayEl.textContent = formatted;
      if (pillEl)    pillEl.textContent    = formatted;
    }
  }

  /* ------------------------------------------------------------------
   * Periodic tick — simulates other visitors arriving every 45 s
   * ------------------------------------------------------------------ */

  window.setInterval(function () {
    var increment = randInt(1, 4);
    currentCount += increment;

    // Keep localStorage in sync
    var fresh = loadData();
    if (fresh && fresh.date === todayKey()) {
      fresh.count = currentCount;
      saveData(fresh);
    }

    // Animate from current display value to new value
    if (displayEl || pillEl) {
      animateTo(currentCount - increment, currentCount);
    }
  }, TICK_INTERVAL);

})();

(function () {
  'use strict';

  /* ------------------------------------------------------------------
   * FreshBot — rule-based floating chatbot
   * Data source: data/chatbot.json (pre-scripted, no live AI service)
   * ------------------------------------------------------------------ */

  var BOT_REPLY_DELAY  = 800;  // ms — simulate "typing" before reply appears
  var MAX_HISTORY      = 60;   // max message nodes kept in DOM

  /* ------------------------------------------------------------------
   * State
   * ------------------------------------------------------------------ */

  var faqs               = [];
  var quickReplies       = [];
  var greeting           = '';
  var fallbackText       = '';
  var isOpen             = false;
  var hasGreeted         = false;
  var isTyping           = false;
  var conversationStarted = false;  // true after first user message sent
  var suggestionsVisible  = true;   // tracks collapsed/expanded state

  /* ------------------------------------------------------------------
   * DOM refs
   * ------------------------------------------------------------------ */

  var launcherBtn, chatWindow, messagesEl, inputEl, sendBtn,
      quickRepliesEl, closeBtnEl, badgeEl, typingEl,
      suggestionsWrapEl, suggestionsToggleBtn;

  /* ------------------------------------------------------------------
   * Keyword matching engine
   * ------------------------------------------------------------------ */

  function findBestMatch(query) {
    var normalised = query.toLowerCase().trim();
    var best       = null;
    var bestScore  = 0;

    faqs.forEach(function (faq) {
      var score = 0;
      faq.keywords.forEach(function (kw) {
        if (normalised.indexOf(kw.toLowerCase()) !== -1) {
          score += 1;
        }
      });
      if (score > bestScore) {
        bestScore = score;
        best      = faq;
      }
    });

    return bestScore > 0 ? best : null;
  }

  /* ------------------------------------------------------------------
   * DOM helpers
   * ------------------------------------------------------------------ */

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function trimHistory() {
    var nodes  = messagesEl.querySelectorAll('.ff-msg');
    var excess = nodes.length - MAX_HISTORY;
    for (var i = 0; i < excess; i++) {
      nodes[i].parentNode.removeChild(nodes[i]);
    }
  }

  function buildBubble(text, role, link) {
    var wrap   = document.createElement('div');
    wrap.className = 'ff-msg ff-msg--' + role;

    var avatar = document.createElement('div');
    avatar.className = 'ff-msg__avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = role === 'bot' ? '🌿' : '👤';

    var bubble = document.createElement('div');
    bubble.className = 'ff-msg__bubble';
    bubble.textContent = text;

    if (role === 'bot' && link) {
      var a = document.createElement('a');
      a.className   = 'ff-msg__link';
      a.href        = link.href;
      a.textContent = '→ ' + link.label;
      bubble.appendChild(document.createElement('br'));
      bubble.appendChild(a);
    }

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    return wrap;
  }

  function showTyping() {
    if (isTyping) return;
    isTyping = true;

    typingEl = document.createElement('div');
    typingEl.className = 'ff-typing';
    typingEl.setAttribute('aria-label', 'FreshBot is typing');

    var avatar = document.createElement('div');
    avatar.className = 'ff-msg__avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '🌿';

    var bubble = document.createElement('div');
    bubble.className = 'ff-typing__bubble';
    for (var i = 0; i < 3; i++) {
      var dot = document.createElement('span');
      dot.className = 'ff-typing__dot';
      bubble.appendChild(dot);
    }

    typingEl.appendChild(avatar);
    typingEl.appendChild(bubble);
    messagesEl.appendChild(typingEl);
    scrollToBottom();
  }

  function hideTyping() {
    if (typingEl && typingEl.parentNode) {
      typingEl.parentNode.removeChild(typingEl);
    }
    typingEl = null;
    isTyping = false;
  }

  function appendMessage(text, role, link) {
    var bubble = buildBubble(text, role, link);
    messagesEl.appendChild(bubble);
    trimHistory();
    scrollToBottom();
    return bubble;
  }

  /* ------------------------------------------------------------------
   * Suggestions bar — collapsible after conversation starts
   * ------------------------------------------------------------------ */

  function setSuggestionsVisible(visible) {
    suggestionsVisible = visible;
    quickRepliesEl.hidden = !visible;

    // Rotate arrow: pointing up = expanded, down = collapsed
    suggestionsToggleBtn.setAttribute('aria-expanded', String(visible));
    suggestionsToggleBtn.setAttribute(
      'aria-label',
      visible ? 'Hide suggested questions' : 'Show suggested questions'
    );
    var arrow = suggestionsToggleBtn.querySelector('.ff-suggestions-arrow');
    if (arrow) {
      arrow.style.transform = visible ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  }

  function renderQuickReplies(items) {
    quickRepliesEl.innerHTML = '';
    items.forEach(function (label) {
      var btn = document.createElement('button');
      btn.type        = 'button';
      btn.className   = 'ff-quick-reply';
      btn.textContent = label;
      btn.addEventListener('click', function (e) {
        // Prevent this click from bubbling to the document listener
        e.stopPropagation();
        submitQuery(label);
      });
      quickRepliesEl.appendChild(btn);
    });

    // Show the suggestions bar (with toggle header)
    suggestionsWrapEl.hidden = false;

    // If conversation has started, auto-collapse and show toggle
    if (conversationStarted) {
      setSuggestionsVisible(false);
    } else {
      setSuggestionsVisible(true);
    }
  }

  function clearSuggestions() {
    quickRepliesEl.innerHTML = '';
    suggestionsWrapEl.hidden = true;
  }

  /* ------------------------------------------------------------------
   * Core reply logic
   * ------------------------------------------------------------------ */

  function submitQuery(query) {
    var trimmed = query.trim();
    if (!trimmed) return;

    // Mark conversation as started — suggestions collapse after this
    conversationStarted = true;

    appendMessage(trimmed, 'user');
    inputEl.value    = '';
    sendBtn.disabled = true;

    // Collapse (not remove) suggestions while bot is thinking
    clearSuggestions();
    showTyping();

    window.setTimeout(function () {
      hideTyping();

      var match = findBestMatch(trimmed);
      if (match) {
        appendMessage(match.answer, 'bot', match.link);
      } else {
        appendMessage(fallbackText, 'bot', null);
      }

      // Restore suggestions collapsed — user can expand with arrow
      renderQuickReplies(quickReplies.slice(0, 3));
      sendBtn.disabled = false;
      inputEl.focus();
    }, BOT_REPLY_DELAY);
  }

  /* ------------------------------------------------------------------
   * Open / close
   * ------------------------------------------------------------------ */

  function openChat() {
    isOpen = true;
    chatWindow.hidden = false;
    launcherBtn.setAttribute('aria-expanded', 'true');

    if (badgeEl) badgeEl.hidden = true;

    if (!hasGreeted) {
      hasGreeted = true;
      window.setTimeout(function () {
        appendMessage(greeting, 'bot', null);
        renderQuickReplies(quickReplies);
      }, 200);
    }

    window.setTimeout(function () { inputEl.focus(); }, 320);
  }

  function closeChat() {
    isOpen = false;
    chatWindow.hidden = true;
    launcherBtn.setAttribute('aria-expanded', 'false');
    launcherBtn.focus();
  }

  function toggleChat(e) {
    // Stop propagation so the document click-outside listener doesn't
    // immediately re-close the window we just opened
    e.stopPropagation();
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  /* ------------------------------------------------------------------
   * Event wiring
   * ------------------------------------------------------------------ */

  function wireEvents() {
    launcherBtn.addEventListener('click', toggleChat);
    closeBtnEl.addEventListener('click', function (e) {
      e.stopPropagation();
      closeChat();
    });

    // Send button
    sendBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      submitQuery(inputEl.value);
    });

    // Enter key to send
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitQuery(inputEl.value);
      }
    });

    // Enable/disable send button
    inputEl.addEventListener('input', function () {
      sendBtn.disabled = inputEl.value.trim() === '';
    });

    // Escape key to close
    chatWindow.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeChat();
    });

    // Suggestions toggle button
    suggestionsToggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setSuggestionsVisible(!suggestionsVisible);
    });

    // Stop ALL clicks inside the chat window from bubbling to document
    // This is the key fix — prevents send/input/any click from closing the chat
    chatWindow.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    // Close ONLY when clicking truly outside the widget
    document.addEventListener('click', function (e) {
      if (isOpen &&
          !chatWindow.contains(e.target) &&
          !launcherBtn.contains(e.target)) {
        closeChat();
      }
    });
  }

  /* ------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------ */

  function init() {
    launcherBtn          = document.getElementById('ffChatLauncher');
    chatWindow           = document.getElementById('ffChatWindow');
    messagesEl           = document.getElementById('ffChatMessages');
    inputEl              = document.getElementById('ffChatInput');
    sendBtn              = document.getElementById('ffChatSend');
    quickRepliesEl       = document.getElementById('ffQuickReplies');
    closeBtnEl           = document.getElementById('ffChatClose');
    badgeEl              = document.getElementById('ffChatBadge');
    suggestionsWrapEl    = document.getElementById('ffSuggestionsWrap');
    suggestionsToggleBtn = document.getElementById('ffSuggestionsToggle');

    if (!launcherBtn || !chatWindow) return;

    fetch('data/chatbot.json')
      .then(function (res) {
        if (!res.ok) throw new Error('chatbot.json not found');
        return res.json();
      })
      .then(function (data) {
        faqs         = data.faqs         || [];
        quickReplies = data.quickReplies || [];
        greeting     = data.greeting     || 'Hi! How can I help?';
        fallbackText = data.fallback     || "I'm not sure about that. Please try another question.";

        wireEvents();

        window.setTimeout(function () {
          if (!isOpen && badgeEl) badgeEl.hidden = false;
        }, 2000);
      })
      .catch(function () {
        if (launcherBtn) launcherBtn.hidden = true;
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

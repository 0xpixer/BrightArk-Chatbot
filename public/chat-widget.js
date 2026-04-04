(function () {
  'use strict';

  var PRIMARY = '#1a1a2e';
  var ACCENT = '#4a9eff';
  var WELCOME =
    "Hi! I'm the BrightArk Digital Expert. How can I help you today?";

  function getConfig() {
    var c = window.AI_CHAT_CONFIG;
    if (!c || typeof c.apiEndpoint !== 'string' || !c.apiEndpoint) {
      console.warn('[BrightArk Chat] window.AI_CHAT_CONFIG.apiEndpoint is missing');
      return null;
    }
    return c;
  }

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function injectStyles() {
    if (document.getElementById('brightark-chat-widget-styles')) return;
    var s = document.createElement('style');
    s.id = 'brightark-chat-widget-styles';
    s.textContent =
      '#brightark-chat-root{position:fixed;z-index:2147483646;font-family:system-ui,-apple-system,sans-serif;box-sizing:border-box}' +
      '#brightark-chat-root *,#brightark-chat-root *::before,#brightark-chat-root *::after{box-sizing:border-box}' +
      '#brightark-chat-bubble{width:56px;height:56px;border-radius:50%;background:' +
      PRIMARY +
      ';color:#fff;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);font-size:26px;display:flex;align-items:center;justify-content:center;position:fixed;right:20px;bottom:20px;transition:transform .15s ease}' +
      '#brightark-chat-bubble:hover{transform:scale(1.05)}' +
      '#brightark-chat-panel{position:fixed;right:20px;bottom:88px;width:340px;max-width:calc(100vw - 40px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);display:none;flex-direction:column;overflow:hidden;border:1px solid rgba(0,0,0,.06)}' +
      '#brightark-chat-panel.open{display:flex}' +
      '#brightark-chat-header{background:' +
      PRIMARY +
      ';color:#fff;padding:14px 16px;font-weight:600;font-size:16px;display:flex;align-items:center;justify-content:space-between}' +
      '#brightark-chat-close{background:transparent;border:none;color:#fff;cursor:pointer;font-size:22px;line-height:1;padding:0 4px;opacity:.85}' +
      '#brightark-chat-close:hover{opacity:1}' +
      '#brightark-chat-messages{flex:1;overflow-y:auto;padding:12px;background:#f6f7f9}' +
      '.brightark-msg{margin-bottom:10px;display:flex;flex-direction:column;max-width:85%}' +
      '.brightark-msg.user{align-self:flex-end}' +
      '.brightark-msg.bot{align-self:flex-start}' +
      '.brightark-msg-inner{padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.45;word-break:break-word}' +
      '.brightark-msg.user .brightark-msg-inner{background:' +
      PRIMARY +
      ';color:#fff;border-bottom-right-radius:4px}' +
      '.brightark-msg.bot .brightark-msg-inner{background:#fff;color:#222;border:1px solid #e5e7eb;border-bottom-left-radius:4px}' +
      '.brightark-thinking{font-style:italic;color:#666;font-size:13px;padding:8px 12px}' +
      '#brightark-chat-input-row{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e5e7eb;background:#fff}' +
      '#brightark-chat-input{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;font-size:14px;outline:none}' +
      '#brightark-chat-input:focus{border-color:' +
      ACCENT +
      ';box-shadow:0 0 0 2px rgba(74,158,255,.2)}' +
      '#brightark-chat-send{background:' +
      ACCENT +
      ';color:#fff;border:none;border-radius:8px;padding:0 16px;font-weight:600;cursor:pointer;font-size:14px}' +
      '#brightark-chat-send:disabled{opacity:.5;cursor:not-allowed}' +
      '@media (max-width:399px){#brightark-chat-panel{width:95vw;right:2.5vw;left:2.5vw;max-width:none;height:min(480px,70vh)}#brightark-chat-bubble{right:12px;bottom:12px}}';
    document.head.appendChild(s);
  }

  function init() {
    var config = getConfig();
    if (!config) return;

    injectStyles();

    var conversationHistory = [];
    var open = false;
    var welcomeShown = false;

    var root = el('div', null);
    root.id = 'brightark-chat-root';

    var bubble = el('button', null, '💬');
    bubble.id = 'brightark-chat-bubble';
    bubble.setAttribute('type', 'button');
    bubble.setAttribute('aria-label', 'Open chat');

    var panel = el('div', null);
    panel.id = 'brightark-chat-panel';

    var header = el('div', null);
    header.id = 'brightark-chat-header';
    var title = el('span', null, 'BrightArk Support');
    var closeBtn = el('button', null, '×');
    closeBtn.id = 'brightark-chat-close';
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'Close chat');
    header.appendChild(title);
    header.appendChild(closeBtn);

    var messages = el('div', null);
    messages.id = 'brightark-chat-messages';

    var inputRow = el('div', null);
    inputRow.id = 'brightark-chat-input-row';
    var input = el('input', null);
    input.id = 'brightark-chat-input';
    input.setAttribute('type', 'text');
    input.setAttribute('placeholder', 'Type a message…');
    input.setAttribute('autocomplete', 'off');
    var send = el('button', null, 'Send');
    send.id = 'brightark-chat-send';
    send.setAttribute('type', 'button');
    inputRow.appendChild(input);
    inputRow.appendChild(send);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(inputRow);
    root.appendChild(panel);
    root.appendChild(bubble);
    document.body.appendChild(root);

    function scrollToBottom() {
      messages.scrollTop = messages.scrollHeight;
    }

    function appendMessage(role, text) {
      var wrap = el('div', 'brightark-msg ' + (role === 'user' ? 'user' : 'bot'));
      var inner = el('div', 'brightark-msg-inner', text);
      wrap.appendChild(inner);
      messages.appendChild(wrap);
      scrollToBottom();
    }

    function showThinking(show) {
      var id = 'brightark-thinking-el';
      var existing = document.getElementById(id);
      if (!show) {
        if (existing) existing.remove();
        return;
      }
      if (existing) return;
      var t = el('div', 'brightark-thinking', '…');
      t.id = id;
      messages.appendChild(t);
      scrollToBottom();
    }

    function togglePanel() {
      open = !open;
      panel.classList.toggle('open', open);
      bubble.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && !welcomeShown) {
        welcomeShown = true;
        appendMessage('bot', WELCOME);
      }
      if (open) {
        setTimeout(function () {
          input.focus();
        }, 100);
      }
    }

    bubble.addEventListener('click', togglePanel);
    closeBtn.addEventListener('click', togglePanel);

    function sendMessage() {
      var text = input.value.trim();
      if (!text) return;

      input.value = '';
      appendMessage('user', text);
      showThinking(true);
      send.disabled = true;

      fetch(config.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: conversationHistory,
        }),
      })
        .then(function (r) {
          return r.json().then(function (data) {
            if (!r.ok) throw new Error(data.error || 'Request failed');
            return data;
          });
        })
        .then(function (data) {
          conversationHistory = Array.isArray(data.conversationHistory)
            ? data.conversationHistory
            : conversationHistory;
          var reply =
            typeof data.reply === 'string'
              ? data.reply
              : 'Sorry, I could not read the response.';
          appendMessage('bot', reply);
        })
        .catch(function () {
          appendMessage(
            'bot',
            'Sorry, something went wrong. Please try again shortly.',
          );
        })
        .finally(function () {
          showThinking(false);
          send.disabled = false;
          input.focus();
        });
    }

    send.addEventListener('click', sendMessage);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

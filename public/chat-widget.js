(function () {
  'use strict';

  var FALLBACK_WELCOME =
    "Hi! I'm the BrightArk Digital Expert Sarah. How can I help you today?";

  function getConfig() {
    var c = window.AI_CHAT_CONFIG;
    if (!c || typeof c.apiEndpoint !== 'string' || !c.apiEndpoint) {
      console.warn('[BrightArk Chat] window.AI_CHAT_CONFIG.apiEndpoint is missing');
      return null;
    }
    return c;
  }

  /** If apiEndpoint is the deployment root (path `/`), POST would hit static HTML with no CORS — use `/api/chat`. */
  function resolveChatApiUrl(endpoint) {
    var trimmed = endpoint.trim();
    try {
      var u = new URL(trimmed);
      var path = u.pathname.replace(/\/+$/, '') || '/';
      if (path === '/') {
        u.pathname = '/api/chat';
        return u.toString();
      }
      return trimmed;
    } catch (e) {
      return trimmed;
    }
  }

  function resolveWidgetConfigUrl(endpoint) {
    var chatUrl = resolveChatApiUrl(endpoint);
    try {
      var u = new URL(chatUrl);
      u.pathname = '/api/public/widget-config';
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (e) {
      return '';
    }
  }

  function applyThemeVars(node, cssVars) {
    if (!node || !cssVars || typeof cssVars !== 'object') return;
    for (var k in cssVars) {
      if (Object.prototype.hasOwnProperty.call(cssVars, k)) {
        node.style.setProperty(k, String(cssVars[k]));
      }
    }
  }

  function getConversationId() {
    var key = 'brightark_conversation_id';
    try {
      var id = sessionStorage.getItem(key);
      if (!id && typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID();
        sessionStorage.setItem(key, id);
      }
      return id || undefined;
    } catch (e) {
      return undefined;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;');
  }

  /** Only http(s) and simple mailto — blocks javascript:, data:, etc. */
  function sanitizeHref(href) {
    var h = String(href).trim();
    if (!h || /[\s"'<>]/.test(h)) return null;
    if (/^https?:\/\//i.test(h)) {
      try {
        var u = new URL(h);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        return u.href;
      } catch (e) {
        return null;
      }
    }
    if (/^mailto:/i.test(h)) {
      var path = h.slice(7).split('?')[0];
      if (!/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(path)) return null;
      return 'mailto:' + path;
    }
    return null;
  }

  function trimUrlTrailingPunct(url) {
    return url.replace(/[.,;:!?)]+$/g, '');
  }

  function linkAttrsForHref(safe) {
    if (/^mailto:/i.test(safe)) {
      return 'href="' + escapeAttr(safe) + '"';
    }
    return (
      'href="' +
      escapeAttr(safe) +
      '" target="_blank" rel="noopener noreferrer"'
    );
  }

  function linkifyBareUrlsOneLine(text) {
    var re = /https?:\/\/[^\s<]+/gi;
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      var raw = m[0];
      var trimmed = trimUrlTrailingPunct(raw);
      out += escapeHtml(text.slice(last, m.index));
      var safe = sanitizeHref(trimmed);
      if (safe) {
        out += '<a ' + linkAttrsForHref(safe) + '>' + escapeHtml(trimmed) + '</a>';
      } else {
        out += escapeHtml(raw);
      }
      last = m.index + raw.length;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  function linkifyBareUrlsInText(text) {
    return text.split(/\r?\n/).map(linkifyBareUrlsOneLine).join('<br>');
  }

  /** Bot-only: markdown [label](url) + bare URLs; all other HTML escaped. */
  function renderBotMessageHtml(raw) {
    if (raw == null || raw === '') return '';
    var s = String(raw);
    var mdRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/gi;
    var parts = [];
    var last = 0;
    var m;
    while ((m = mdRe.exec(s)) !== null) {
      if (m.index > last) {
        parts.push({ t: 'text', v: s.slice(last, m.index) });
      }
      parts.push({ t: 'md', label: m[1], url: m[2] });
      last = m.index + m[0].length;
    }
    if (last < s.length) {
      parts.push({ t: 'text', v: s.slice(last) });
    }
    if (parts.length === 0) {
      parts.push({ t: 'text', v: s });
    }
    return parts
      .map(function (p) {
        if (p.t === 'md') {
          var safe = sanitizeHref(p.url);
          if (!safe) {
            return escapeHtml('[' + p.label + '](' + p.url + ')');
          }
          return (
            '<a ' + linkAttrsForHref(safe) + '>' + escapeHtml(p.label) + '</a>'
          );
        }
        return linkifyBareUrlsInText(p.v);
      })
      .join('');
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
      '#brightark-chat-root{position:fixed;z-index:2147483646;font-family:var(--ba-font,system-ui,-apple-system,sans-serif);font-size:var(--ba-font-size,14px);box-sizing:border-box}' +
      '#brightark-chat-root *,#brightark-chat-root *::before,#brightark-chat-root *::after{box-sizing:border-box}' +
      '#brightark-chat-bubble{width:56px;height:56px;border-radius:35%;background:var(--ba-primary,#E06429);color:#fff;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);font-size:26px;display:flex;align-items:center;justify-content:center;position:fixed;right:20px;bottom:20px;transition:transform .15s ease}' +
      '#brightark-chat-bubble:hover{transform:scale(1.05)}' +
      '#brightark-chat-panel{position:fixed;right:20px;bottom:88px;width:340px;max-width:calc(100vw - 40px);height:480px;max-height:calc(100vh - 120px);background:var(--ba-panel-bg,#fff);border-radius:var(--ba-panel-radius,12px);box-shadow:var(--ba-panel-shadow,0 8px 32px rgba(0,0,0,.18));display:none;flex-direction:column;overflow:hidden;border:var(--ba-border-width,1px) solid rgba(0,0,0,.06)}' +
      '#brightark-chat-panel.open{display:flex}' +
      '#brightark-chat-header{background:var(--ba-header-bg,var(--ba-primary,#E06429));color:var(--ba-header-text,#fff);padding:14px 16px;font-weight:600;font-size:16px;display:flex;align-items:center;justify-content:space-between}' +
      '#brightark-chat-close{background:transparent;border:none;color:inherit;cursor:pointer;font-size:22px;line-height:1;padding:0 4px;opacity:.85}' +
      '#brightark-chat-close:hover{opacity:1}' +
      '#brightark-chat-messages{flex:1;overflow-y:auto;padding:12px;background:var(--ba-messages-bg,#f6f7f9)}' +
      '.brightark-msg{margin-bottom:10px;display:flex;flex-direction:column;max-width:85%}' +
      '.brightark-msg.user{align-self:flex-end}' +
      '.brightark-msg.bot{align-self:flex-start}' +
      '.brightark-msg-inner{padding:10px 12px;border-radius:var(--ba-bubble-radius,12px);font-size:var(--ba-font-size,14px);line-height:1.45;word-break:break-word;box-shadow:var(--ba-bubble-shadow,none)}' +
      '.brightark-msg.user .brightark-msg-inner{background:var(--ba-user-bg,var(--ba-primary,#E06429));color:var(--ba-user-text,#fff);border-bottom-right-radius:var(--ba-bubble-corner,4px)}' +
      '.brightark-msg.bot .brightark-msg-inner{background:var(--ba-bot-bg,#fff);color:var(--ba-bot-text,#222);border:var(--ba-border-width,1px) solid var(--ba-bot-border,#e5e7eb);border-bottom-left-radius:var(--ba-bubble-corner,4px)}' +
      '.brightark-msg.bot .brightark-msg-inner a{color:#2563eb;text-decoration:underline;word-break:break-all}' +
      '.brightark-msg.bot .brightark-msg-inner a:hover{color:#1d4ed8}' +
      '.brightark-thinking{max-width:85%;margin-bottom:10px;display:flex}' +
      '.brightark-thinking-bubble{background:var(--ba-bot-bg,#fff);border:var(--ba-border-width,1px) solid var(--ba-bot-border,#e5e7eb);border-radius:var(--ba-bubble-radius,12px);border-bottom-left-radius:var(--ba-bubble-corner,4px);padding:12px 16px;display:inline-flex}' +
      '.brightark-thinking-dots{display:flex;gap:6px;align-items:center;height:8px}' +
      '.brightark-thinking-dot{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:brightark-thinking-bounce 1.15s ease-in-out infinite both}' +
      '.brightark-thinking-dot:nth-child(2){animation-delay:.2s}' +
      '.brightark-thinking-dot:nth-child(3){animation-delay:.4s}' +
      '@keyframes brightark-thinking-bounce{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-5px);opacity:1}}' +
      '#brightark-chat-input-row{display:flex;gap:8px;padding:10px 12px;border-top:var(--ba-border-width,1px) solid var(--ba-bot-border,#e5e7eb);background:var(--ba-panel-bg,#fff)}' +
      '#brightark-chat-input{flex:1;border:var(--ba-border-width,1px) solid var(--ba-input-border,#d1d5db);border-radius:8px;padding:10px 12px;font-size:var(--ba-font-size,14px);outline:none}' +
      '#brightark-chat-input:focus{border-color:var(--ba-accent,#000);box-shadow:0 0 0 2px rgba(74,158,255,.2)}' +
      '#brightark-chat-send{background:var(--ba-accent,#000);color:#fff;border:none;border-radius:8px;padding:0 16px;font-weight:600;cursor:pointer;font-size:var(--ba-font-size,14px)}' +
      '#brightark-chat-send:disabled{opacity:.5;cursor:not-allowed}' +
      '@media (max-width:399px){#brightark-chat-panel{width:95vw;right:2.5vw;left:2.5vw;max-width:none;height:min(480px,70vh)}#brightark-chat-bubble{right:12px;bottom:12px}}';
    document.head.appendChild(s);
  }

  async function init() {
    var config = getConfig();
    if (!config) return;

    var apiUrl = resolveChatApiUrl(config.apiEndpoint);
    var cfgUrl = resolveWidgetConfigUrl(config.apiEndpoint);
    var welcomeText = FALLBACK_WELCOME;
    var remoteCssVars = null;

    if (cfgUrl) {
      try {
        var res = await fetch(cfgUrl);
        if (res.ok) {
          var remote = await res.json();
          if (remote && typeof remote.welcomeMessage === 'string' && remote.welcomeMessage.trim()) {
            welcomeText = remote.welcomeMessage.trim();
          }
          if (remote && remote.cssVars && typeof remote.cssVars === 'object') {
            remoteCssVars = remote.cssVars;
          }
        }
      } catch (e) {
        /* keep fallbacks */
      }
    }

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
    if (remoteCssVars) {
      applyThemeVars(root, remoteCssVars);
    }

    function scrollToBottom() {
      messages.scrollTop = messages.scrollHeight;
    }

    function appendMessage(role, text) {
      var wrap = el('div', 'brightark-msg ' + (role === 'user' ? 'user' : 'bot'));
      var inner = el('div', 'brightark-msg-inner', null);
      if (role === 'user') {
        inner.textContent = text;
      } else {
        inner.innerHTML = renderBotMessageHtml(text);
      }
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
      var t = el('div', 'brightark-thinking', null);
      t.id = id;
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      t.setAttribute('aria-label', 'Assistant is typing');
      var bubble = el('div', 'brightark-thinking-bubble', null);
      var dots = el('div', 'brightark-thinking-dots', null);
      for (var i = 0; i < 3; i++) {
        dots.appendChild(el('span', 'brightark-thinking-dot', null));
      }
      bubble.appendChild(dots);
      t.appendChild(bubble);
      messages.appendChild(t);
      scrollToBottom();
    }

    function togglePanel() {
      open = !open;
      panel.classList.toggle('open', open);
      bubble.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && !welcomeShown) {
        welcomeShown = true;
        appendMessage('bot', welcomeText);
      }
      if (open) {
        setTimeout(function () {
          input.focus();
        }, 100);
      }
    }

    bubble.addEventListener('click', togglePanel);
    closeBtn.addEventListener('click', togglePanel);

    function appendStreamingBotShell() {
      var wrap = el('div', 'brightark-msg bot');
      var inner = el('div', 'brightark-msg-inner', '');
      wrap.appendChild(inner);
      messages.appendChild(wrap);
      scrollToBottom();
      return inner;
    }

    function parseSseBuffer(buffer, onEvent) {
      var out = { rest: buffer, events: [] };
      var sep = '\n\n';
      var idx;
      while ((idx = buffer.indexOf(sep)) >= 0) {
        var block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + sep.length);
        if (block.indexOf('data:') === 0) {
          var jsonStr = block.replace(/^data:\s?/, '').trim();
          try {
            onEvent(JSON.parse(jsonStr));
          } catch (e) {
            /* ignore malformed chunk */
          }
        }
      }
      out.rest = buffer;
      return out;
    }

    function sendMessage() {
      var text = input.value.trim();
      if (!text) return;

      input.value = '';
      appendMessage('user', text);
      showThinking(true);
      send.disabled = true;

      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message: text,
          conversationHistory: conversationHistory,
          stream: true,
          timezone: (function () {
            try {
              return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
            } catch (e) {
              return undefined;
            }
          })(),
          conversationId: getConversationId(),
        }),
      })
        .then(function (r) {
          var ct = (r.headers.get('content-type') || '').toLowerCase();
          if (!r.ok) {
            return r.text().then(function (t) {
              var msg = 'Request failed';
              try {
                var j = JSON.parse(t);
                if (j && j.error) msg = String(j.error);
                else if (t) msg = t;
              } catch (e) {
                if (t) msg = t;
              }
              throw new Error(msg);
            });
          }
          if (ct.indexOf('text/event-stream') === -1) {
            return r.json().then(function (data) {
              return { legacyJson: data };
            });
          }
          if (!r.body || !r.body.getReader) {
            throw new Error('Streaming not supported in this browser.');
          }
          return readSseStream(r.body);
        })
        .then(function (result) {
          if (result && result.legacyJson) {
            var data = result.legacyJson;
            conversationHistory = Array.isArray(data.conversationHistory)
              ? data.conversationHistory
              : conversationHistory;
            var reply =
              typeof data.reply === 'string'
                ? data.reply
                : 'Sorry, I could not read the response.';
            appendMessage('bot', reply);
            return;
          }
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

      function readSseStream(body) {
        var reader = body.getReader();
        var dec = new TextDecoder();
        var buf = '';
        var botInner = null;
        var fullReply = '';

        return reader.read().then(function pump(chunk) {
          if (chunk.done) {
            if (!botInner && fullReply) {
              appendMessage('bot', fullReply);
            }
            return;
          }
          buf += dec.decode(chunk.value, { stream: true });
          var streamErr = null;
          var parsed = parseSseBuffer(buf, function (ev) {
            if (ev.type === 'delta' && typeof ev.text === 'string') {
              showThinking(false);
              if (!botInner) botInner = appendStreamingBotShell();
              fullReply += ev.text;
              botInner.innerHTML = renderBotMessageHtml(fullReply);
              scrollToBottom();
            } else if (ev.type === 'done') {
              showThinking(false);
              if (typeof ev.reply === 'string') fullReply = ev.reply;
              if (Array.isArray(ev.conversationHistory)) {
                conversationHistory = ev.conversationHistory;
              }
              if (botInner) botInner.innerHTML = renderBotMessageHtml(fullReply);
              else if (fullReply) appendMessage('bot', fullReply);
            } else if (ev.type === 'error') {
              streamErr = new Error(
                typeof ev.message === 'string'
                  ? ev.message
                  : 'Stream error',
              );
            }
          });
          if (streamErr) return Promise.reject(streamErr);
          buf = parsed.rest;
          return reader.read().then(pump);
        });
      }
    }

    send.addEventListener('click', sendMessage);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  function boot() {
    init().catch(function (err) {
      console.warn('[BrightArk Chat] init failed', err);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

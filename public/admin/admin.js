(function () {
  'use strict';

  var main = document.getElementById('main');
  var nav = document.getElementById('nav');

  var LLM_PRESETS = {
    openai: { label: 'OpenAI', baseUrl: '' },
    gemini: {
      label: 'Google Gemini (OpenAI-compatible)',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    },
    deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
    grok: { label: 'xAI Grok', baseUrl: 'https://api.x.ai/v1' },
    kimi: { label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1' },
    custom: { label: 'Custom', baseUrl: '' },
  };

  function api(path, opts) {
    opts = opts || {};
    opts.credentials = 'include';
    opts.headers = opts.headers || {};
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch('/api' + path, opts).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try {
          j = t ? JSON.parse(t) : null;
        } catch (e) {
          j = { _raw: t };
        }
        return { ok: r.ok, status: r.status, json: j };
      });
    });
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function setNav(active, authed) {
    if (!nav) return;
    if (!authed) {
      nav.classList.add('hidden');
      return;
    }
    nav.classList.remove('hidden');
    var links = [
      ['#/customize', 'Customize'],
      ['#/ai', 'AI & API'],
      ['#/prompts', 'Prompts'],
      ['#/dialogues', 'Dialogues'],
      ['#/account', 'Account'],
    ];
    nav.innerHTML =
      links
        .map(function (L) {
          var h = L[0];
          var lab = L[1];
          var cl = h === active ? ' class="active"' : '';
          return '<a href="' + h + '"' + cl + '>' + esc(lab) + '</a>';
        })
        .join('') +
      '<button type="button" id="nav-logout" style="margin-left:auto">Log out</button>';
    document.getElementById('nav-logout').onclick = function () {
      api('/admin?op=logout', { method: 'POST' }).then(function () {
        location.hash = '#/login';
        route();
      });
    };
  }

  function route() {
    var h = (location.hash || '#/login').replace(/^#\/?/, '');
    var parts = h.split('/');
    var page = parts[0] || 'login';
    api('/admin?op=me', { method: 'GET' }).then(function (me) {
      var authed = me.ok && me.json && me.json.user;
      if (page !== 'login' && page !== 'register' && !authed) {
        location.hash = '#/login';
        page = 'login';
      }
      if (authed && (page === 'login' || page === 'register')) {
        location.hash = '#/customize';
        page = 'customize';
      }
      setNav('#/' + page, authed);
      if (page === 'login') return renderLogin();
      if (page === 'register') return renderRegister();
      if (page === 'customize') return renderCustomize();
      if (page === 'ai') return renderAi();
      if (page === 'prompts') return renderPrompts();
      if (page === 'dialogues') return renderDialogues(parts[1]);
      if (page === 'account') return renderAccount();
      renderLogin();
    });
  }

  function renderLogin() {
    api('/admin?op=status', { method: 'GET' }).then(function (st) {
      var j = st.json || {};
      var configured = j.database === true;
      var connectedFail = configured && j.connected === false;
      var dbReady = st.ok && configured && !connectedFail;
      var hasUsers = j.hasUsers;
      var regLink =
        dbReady && !hasUsers
          ? '<p>No admin yet — <a href="#/register">create the first account</a>.</p>'
          : '';
      var errBanner = '';
      if (!st.ok) {
        errBanner =
          '<p class="msg err">Status check failed (HTTP ' +
          esc(st.status) +
          '). In Vercel → your project → <strong>Logs</strong>, find errors for <code>/api/admin?op=status</code>.</p>';
      } else if (!configured) {
        errBanner =
          '<p class="msg err">Database URL not visible to the server. In Vercel → Settings → Environment Variables: add <strong>DATABASE_URL</strong> for <strong>Production</strong> (or use the Vercel Postgres/Neon integration), then <strong>Redeploy</strong>. If you only see POSTGRES_PRISMA_URL, that is supported too — redeploy after connecting the DB.</p>';
      } else if (connectedFail) {
        errBanner =
          '<p class="msg err">' +
          esc(
            j.error ||
              'DATABASE_URL is set but the server could not reach the database. Run migrations against this DB, verify SSL (Neon: ?sslmode=require), then redeploy.',
          ) +
          '</p>';
      }
      main.innerHTML =
        '<div class="card"><h2>Sign in</h2><div id="login-msg"></div>' +
        regLink +
        '<form id="login-form">' +
        '<label>Email</label><input name="email" type="email" required autocomplete="username" />' +
        '<label>Password</label><input name="password" type="password" required autocomplete="current-password" />' +
        '<button class="btn" type="submit">Sign in</button></form>' +
        '<p style="margin-top:16px"><a class="btn secondary" href="/api/auth/google">Continue with Google</a></p>' +
        errBanner +
        '</div>';
      document.getElementById('login-form').onsubmit = function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        api('/admin?op=login', {
          method: 'POST',
          body: {
            email: fd.get('email'),
            password: fd.get('password'),
          },
        }).then(function (r) {
          var el = document.getElementById('login-msg');
          if (r.ok) {
            location.hash = '#/customize';
            route();
          } else {
            el.innerHTML =
              '<div class="msg err">' + esc((r.json && r.json.error) || 'Login failed') + '</div>';
          }
        });
      };
    });
  }

  function renderRegister() {
    main.innerHTML =
      '<div class="card"><h2>Create first admin</h2><div id="reg-msg"></div>' +
      '<form id="reg-form">' +
      '<label>Email</label><input name="email" type="email" required />' +
      '<label>Username (optional)</label><input name="username" type="text" />' +
      '<label>Password (min 8)</label><input name="password" type="password" required minlength="8" />' +
      '<button class="btn" type="submit">Register</button></form>' +
      '<p><a href="#/login">Back to sign in</a></p></div>';
    document.getElementById('reg-form').onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      api('/admin?op=register', {
        method: 'POST',
        body: {
          email: fd.get('email'),
          username: fd.get('username') || undefined,
          password: fd.get('password'),
        },
      }).then(function (r) {
        var el = document.getElementById('reg-msg');
        if (r.ok) {
          location.hash = '#/customize';
          route();
        } else {
          el.innerHTML =
            '<div class="msg err">' + esc((r.json && r.json.error) || 'Registration failed') + '</div>';
        }
      });
    };
  }

  function loadSettings(cb) {
    api('/admin?op=settings', { method: 'GET' }).then(function (r) {
      if (!r.ok) {
        main.innerHTML =
          '<div class="msg err">Could not load settings: ' +
          esc((r.json && r.json.error) || r.status) +
          '</div>';
        return;
      }
      cb(r.json.settings);
    });
  }

  function renderCustomize() {
    loadSettings(function (s) {
      var t = s.widgetTheme || {};
      main.innerHTML =
        '<div class="card"><h2>Widget appearance</h2><div id="cust-msg"></div>' +
        '<form id="cust-form">' +
        '<div class="row2">' +
        '<div><label>Primary</label><input name="primary" type="text" value="' +
        esc(t.primary) +
        '" /></div>' +
        '<div><label>Accent</label><input name="accent" type="text" value="' +
        esc(t.accent) +
        '" /></div></div>' +
        '<div class="row2">' +
        '<div><label>Launcher button color</label><input name="launcherBubbleBg" type="text" value="' +
        esc(t.launcherBubbleBg) +
        '" placeholder="defaults to Primary" /></div>' +
        '<div><label>Launcher opacity (%)</label><input name="launcherBubbleOpacityPct" type="number" min="0" max="100" step="1" value="' +
        esc(t.launcherBubbleOpacityPct != null ? String(t.launcherBubbleOpacityPct) : '') +
        '" placeholder="100 = solid" title="100 = solid color; lower = more transparent (color shows through)" /></div></div>' +
        '<p class="hint" style="margin:0 0 12px;font-size:13px;opacity:0.85">Use opacity below 100 for a tinted glass effect; the emoji stays fully visible.</p>' +
        '<div class="row2">' +
        '<div><label>Panel background</label><input name="panelBg" type="text" value="' +
        esc(t.panelBg) +
        '" /></div>' +
        '<div><label>Messages area background</label><input name="messagesBg" type="text" value="' +
        esc(t.messagesBg) +
        '" /></div></div>' +
        '<div class="row2">' +
        '<div><label>Bot bubble bg</label><input name="botBubbleBg" type="text" value="' +
        esc(t.botBubbleBg) +
        '" /></div>' +
        '<div><label>Bot bubble border</label><input name="botBubbleBorder" type="text" value="' +
        esc(t.botBubbleBorder) +
        '" /></div></div>' +
        '<div class="row2">' +
        '<div><label>Bot text</label><input name="botText" type="text" value="' +
        esc(t.botText) +
        '" /></div>' +
        '<div><label>User bubble bg</label><input name="userBubbleBg" type="text" value="' +
        esc(t.userBubbleBg) +
        '" /></div></div>' +
        '<div class="row2">' +
        '<div><label>User text</label><input name="userText" type="text" value="' +
        esc(t.userText) +
        '" /></div>' +
        '<div><label>Header bg</label><input name="headerBg" type="text" value="' +
        esc(t.headerBg) +
        '" /></div></div>' +
        '<label>Header text</label><input name="headerText" type="text" value="' +
        esc(t.headerText) +
        '" />' +
        '<label>Input border</label><input name="inputBorder" type="text" value="' +
        esc(t.inputBorder) +
        '" />' +
        '<label>Font family (CSS)</label><input name="fontFamily" type="text" value="' +
        esc(t.fontFamily) +
        '" />' +
        '<div class="row2">' +
        '<div><label>Font size (px)</label><input name="fontSizePx" type="number" step="1" value="' +
        esc(t.fontSizePx) +
        '" /></div>' +
        '<div><label>Bubble radius (px)</label><input name="bubbleRadiusPx" type="number" step="1" value="' +
        esc(t.bubbleRadiusPx) +
        '" /></div></div>' +
        '<div class="row2">' +
        '<div><label>Corner notch (px)</label><input name="bubbleRadiusCornerPx" type="number" step="1" value="' +
        esc(t.bubbleRadiusCornerPx) +
        '" /></div>' +
        '<div><label>Panel radius (px)</label><input name="panelRadiusPx" type="number" step="1" value="' +
        esc(t.panelRadiusPx) +
        '" /></div></div>' +
        '<div class="row2">' +
        '<div><label>Border width (px)</label><input name="borderWidthPx" type="number" step="1" value="' +
        esc(t.borderWidthPx) +
        '" /></div>' +
        '</div>' +
        '<label>Panel shadow (CSS)</label><input name="panelShadow" type="text" value="' +
        esc(t.panelShadow) +
        '" />' +
        '<label>Bubble shadow (CSS)</label><input name="bubbleShadow" type="text" value="' +
        esc(t.bubbleShadow) +
        '" />' +
        '<button class="btn" type="submit">Save appearance</button></form></div>';
      document.getElementById('cust-form').onsubmit = function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var theme = {};
        fd.forEach(function (v, k) {
          if (k === 'launcherBubbleOpacityPct') {
            var os = String(v).trim();
            theme[k] = os === "" ? undefined : Math.min(100, Math.max(0, Math.round(Number(os))));
          } else if (k === 'fontSizePx' || k === 'bubbleRadiusPx' || k === 'bubbleRadiusCornerPx' || k === 'panelRadiusPx' || k === 'borderWidthPx') {
            theme[k] = v ? Number(v) : undefined;
          } else if (v) theme[k] = String(v);
        });
        api('/admin?op=settings', {
          method: 'PATCH',
          body: { widgetTheme: theme },
        }).then(function (r) {
          var el = document.getElementById('cust-msg');
          el.innerHTML = r.ok
            ? '<div class="msg ok">Saved.</div>'
            : '<div class="msg err">' + esc((r.json && r.json.error) || 'Save failed') + '</div>';
        });
      };
    });
  }

  function renderAi() {
    loadSettings(function (s) {
      var presetOpts = Object.keys(LLM_PRESETS)
        .map(function (k) {
          return (
            '<option value="' +
            esc(k) +
            '"' +
            (s.llmProviderLabel === k ? ' selected' : '') +
            '>' +
            esc(LLM_PRESETS[k].label) +
            '</option>'
          );
        })
        .join('');
      main.innerHTML =
        '<div class="card"><h2>AI provider & models</h2><div id="ai-msg"></div>' +
        '<form id="ai-form">' +
        '<label>Preset</label><select name="preset" id="ai-preset">' +
        presetOpts +
        '</select>' +
        '<label>API base URL (empty = OpenAI default)</label><input name="llmBaseUrl" type="text" value="' +
        esc(s.llmBaseUrl || '') +
        '" placeholder="https://..." />' +
        '<p style="font-size:0.85rem;color:var(--muted)">Use an OpenAI-compatible endpoint. Store your key below (or rely on OPENAI_API_KEY in Vercel env).</p>' +
        '<label>New API key (leave blank to keep current)</label><input name="llmApiKey" type="password" autocomplete="off" placeholder="' +
        (s.llmApiKeySet ? '•••••••• (saved)' : 'sk-...') +
        '" />' +
        '<label><input type="checkbox" name="clearKey" value="1" /> Clear stored API key</label>' +
        '<label>Classification model</label><input name="llmClassificationModel" type="text" value="' +
        esc(s.llmClassificationModel) +
        '" />' +
        '<label>Agent model (promotional path)</label><input name="llmAgentModel" type="text" value="' +
        esc(s.llmAgentModel) +
        '" />' +
        '<label>Information agent model</label><input name="llmInformationModel" type="text" value="' +
        esc(s.llmInformationModel) +
        '" />' +
        '<button class="btn" type="submit">Save</button></form>' +
        '<p style="font-size:0.85rem;color:var(--muted);margin-top:16px">For non-OpenAI APIs, set <code>GUARDRAILS_OPENAI_API_KEY</code> and optional <code>GUARDRAIL_MODEL</code> (e.g. gpt-4o-mini) in Vercel so jailbreak checks still run on OpenAI.</p>' +
        '</div>';
      var presetEl = document.getElementById('ai-preset');
      var baseInput = document.querySelector('#ai-form input[name=llmBaseUrl]');
      presetEl.onchange = function () {
        var p = LLM_PRESETS[presetEl.value];
        if (p && p.baseUrl !== undefined && presetEl.value !== 'custom') {
          baseInput.value = p.baseUrl;
        }
      };
      document.getElementById('ai-form').onsubmit = function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var body = {
          llmProviderLabel: fd.get('preset'),
          llmBaseUrl: fd.get('llmBaseUrl') || null,
          llmClassificationModel: fd.get('llmClassificationModel'),
          llmAgentModel: fd.get('llmAgentModel'),
          llmInformationModel: fd.get('llmInformationModel'),
        };
        var key = fd.get('llmApiKey');
        if (key && String(key).trim()) body.llmApiKey = String(key).trim();
        if (fd.get('clearKey')) body.clearLlmApiKey = true;
        api('/admin?op=settings', { method: 'PATCH', body: body }).then(function (r) {
          var el = document.getElementById('ai-msg');
          el.innerHTML = r.ok
            ? '<div class="msg ok">Saved.</div>'
            : '<div class="msg err">' + esc((r.json && r.json.error) || 'Save failed') + '</div>';
        });
      };
    });
  }

  function renderPrompts() {
    loadSettings(function (s) {
      main.innerHTML =
        '<div class="card"><h2>Prompts & welcome</h2><div id="pr-msg"></div>' +
        '<form id="pr-form">' +
        '<label>Welcome message (widget)</label><textarea name="welcomeMessage">' +
        esc(s.welcomeMessage) +
        '</textarea>' +
        '<label>Classification instructions</label><textarea name="promptClassification" rows="8">' +
        esc(s.promptClassification) +
        '</textarea>' +
        '<label>Agent — intro (promotional path)</label><textarea name="promptAgentIntro" rows="4">' +
        esc(s.promptAgentIntro) +
        '</textarea>' +
        '<label>Agent — tone</label><textarea name="promptAgentTone" rows="3">' +
        esc(s.promptAgentTone) +
        '</textarea>' +
        '<label>Information agent (full system prompt)</label><textarea name="promptInformationAgent" rows="16">' +
        esc(s.promptInformationAgent) +
        '</textarea>' +
        '<label>Live chat widget rules (prepended to agent + information)</label><p class="hint" style="margin:0 0 8px;font-size:13px;opacity:0.85">Keeps replies short and conversational. If the database value is empty, the default from <code>lib/prompts/liveChatReplyRules.ts</code> is used. Delete all text and save to reset to that default.</p><textarea name="promptLiveChatRules" rows="8">' +
        esc(s.promptLiveChatRules) +
        '</textarea>' +
        '<label>Max reply tokens (agent + information only)</label><input name="shopperFacingMaxTokens" type="number" min="64" max="8192" step="1" value="' +
        esc(String(s.shopperFacingMaxTokens)) +
        '" />' +
        '<button class="btn" type="submit">Save prompts</button></form></div>';
      document.getElementById('pr-form').onsubmit = function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        api('/admin?op=settings', {
          method: 'PATCH',
          body: {
            welcomeMessage: fd.get('welcomeMessage'),
            promptClassification: fd.get('promptClassification'),
            promptAgentIntro: fd.get('promptAgentIntro'),
            promptAgentTone: fd.get('promptAgentTone'),
            promptInformationAgent: fd.get('promptInformationAgent'),
            promptLiveChatRules: fd.get('promptLiveChatRules'),
            shopperFacingMaxTokens: Number(fd.get('shopperFacingMaxTokens')),
          },
        }).then(function (r) {
          var el = document.getElementById('pr-msg');
          el.innerHTML = r.ok
            ? '<div class="msg ok">Saved.</div>'
            : '<div class="msg err">' + esc((r.json && r.json.error) || 'Save failed') + '</div>';
        });
      };
    });
  }

  function renderDialogues(id) {
    if (id) {
      api(
        '/admin?op=conversation-detail&id=' + encodeURIComponent(id),
        { method: 'GET' },
      ).then(function (r) {
        if (!r.ok) {
          main.innerHTML = '<div class="msg err">Not found</div>';
          return;
        }
        var c = r.json.conversation;
        var msgs = (c.messages || [])
          .map(function (m) {
            return (
              '<div class="msg-row ' +
              (m.role === 'user' ? 'user' : 'assistant') +
              '"><strong>' +
              esc(m.role) +
              '</strong> · ' +
              esc(m.createdAt) +
              '<pre style="margin:8px 0 0;white-space:pre-wrap;font:inherit">' +
              esc(m.content) +
              '</pre></div>'
            );
          })
          .join('');
        main.innerHTML =
          '<div class="card"><p><a href="#/dialogues">← All dialogues</a></p><h2>Conversation</h2><p class="muted">' +
          esc(c.id) +
          '</p>' +
          msgs +
          '</div>';
      });
      return;
    }
    api('/admin?op=conversations', { method: 'GET' }).then(function (r) {
      if (!r.ok) {
        main.innerHTML = '<div class="msg err">Could not load dialogues</div>';
        return;
      }
      var list = (r.json.conversations || [])
        .map(function (c) {
          return (
            '<li><a href="#/dialogues/' +
            encodeURIComponent(c.id) +
            '">' +
            esc(c.id.slice(0, 8)) +
            '…</a> <span class="bubble-preview">' +
            esc(c.updatedAt) +
            ' — ' +
            esc((c.lastMessage || '').slice(0, 80)) +
            '</span></li>'
          );
        })
        .join('');
      main.innerHTML =
        '<div class="card"><h2>Stored dialogues</h2><p style="color:var(--muted);font-size:0.9rem">Requires DATABASE_URL. The widget sends a per-browser conversation id.</p><ul class="conv-list">' +
        (list || '<li>No conversations yet.</li>') +
        '</ul></div>';
    });
  }

  function renderAccount() {
    api('/admin?op=me', { method: 'GET' }).then(function (r) {
      var u = r.json.user;
      main.innerHTML =
        '<div class="card"><h2>Account</h2><div id="acc-msg"></div>' +
        '<form id="acc-form">' +
        '<label>Email</label><input type="text" disabled value="' +
        esc(u.email) +
        '" />' +
        '<label>Username</label><input name="username" type="text" value="' +
        esc(u.username || '') +
        '" />' +
        '<h3 style="margin-top:20px">Change password</h3>' +
        '<label>Current password</label><input name="currentPassword" type="password" autocomplete="current-password" />' +
        '<label>New password</label><input name="password" type="password" autocomplete="new-password" minlength="8" />' +
        '<button class="btn" type="submit">Save</button></form></div>';
      document.getElementById('acc-form').onsubmit = function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var body = { username: fd.get('username') };
        var np = fd.get('password');
        if (np && String(np).length) {
          body.password = String(np);
          body.currentPassword = fd.get('currentPassword');
        }
        api('/admin?op=me', { method: 'PATCH', body: body }).then(function (res) {
          var el = document.getElementById('acc-msg');
          el.innerHTML = res.ok
            ? '<div class="msg ok">Saved.</div>'
            : '<div class="msg err">' + esc((res.json && res.json.error) || 'Failed') + '</div>';
        });
      };
    });
  }

  window.addEventListener('hashchange', route);
  route();
})();

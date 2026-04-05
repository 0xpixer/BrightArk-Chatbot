# BrightArk Chatbot

Production-oriented **Vercel serverless API** that runs an **OpenAI Agents** multi-agent workflow for BrightArk’s Shopify storefront, plus a **self-contained chat widget** you can load from your theme.

The API accepts a shopper message and optional `conversationHistory`, runs `runWorkflow` in `api/workflow/agent.ts` (classification → return / retention / information agents), and returns a plain-text `reply` with an updated history for the next request.

## Prerequisites

- Node.js 18+
- [OpenAI API key](https://platform.openai.com/api-keys)
- Vercel account (for deployment)
- Shopify theme access to edit `theme.liquid`

## Local development

```bash
npm install
npm run build
```

`npm run build` type-checks and compiles `api/` (including `api/workflow/`) with TypeScript.

Run the API locally with the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npx vercel dev
```

Set environment variables in `.env.local` (loaded by `vercel dev`):

| Variable              | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `OPENAI_API_KEY`      | Your OpenAI secret key                                     |
| `OPENAI_WORKFLOW_ID`  | Optional `wf_…` id for **trace metadata** only (see above) |
| `DATABASE_URL`        | Optional **Postgres** URL for admin portal, saved settings, and dialogue logs |
| `GUARDRAILS_OPENAI_API_KEY` | Optional; use a real **OpenAI** key when the chat LLM uses a non-OpenAI compatible API (jailbreak guardrails) |
| `GUARDRAIL_MODEL`     | Optional; model name for jailbreak guardrail (default `gpt-4o-mini` on OpenAI) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional; Google sign-in for admin |
| `ADMIN_PUBLIC_URL`    | Optional; canonical site URL for OAuth redirects (e.g. `https://your-app.vercel.app`) |

The chat endpoint is `http://localhost:3000/api/chat` (port may differ; follow the CLI output).

### Management portal (`/admin/`)

After you set **`DATABASE_URL`**, run migrations against that database:

```bash
npx prisma migrate deploy
```

Open **`https://YOUR-DEPLOYMENT/admin/`** (or `/admin/index.html`). Create the **first admin** when the DB has no users, then sign in. You can:

- **Customize** widget colors, radii, shadows, fonts (applied via `/api/public/widget-config` + CSS variables on the widget).
- **AI & API** — OpenAI-compatible base URL, API key, and per-agent model names (DeepSeek, Grok, Kimi, Gemini compat, etc.).
- **Prompts** — welcome message, classification text, Sarah intro/tone, full information-agent prompt.
- **Dialogues** — stored turns when the widget sends `conversationId` (auto-generated per browser session).

Chat still works **without** `DATABASE_URL` using `OPENAI_API_KEY` and built-in defaults; the portal and DB-backed settings are optional.

**Vercel:** The widget must call **`https://YOUR-PROJECT.vercel.app/api/chat`** (POST), not the site root `/`. The widget auto-fixes a root-only URL (e.g. `https://…vercel.app/`) to `/api/chat`. The deployment root `/` is static HTML and does not handle CORS for API calls.

### Note on dependencies

`@openai/agents` expects **Zod v4**. This repo pins `zod@^4`. The repo also includes `.npmrc` with `legacy-peer-deps=true` so `npm install` stays compatible with `@openai/guardrails`’s older peer declarations.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com), **Import** the project and select the repo.
3. Under **Settings → Environment Variables**, add:

| Variable               | Description                          | Example   |
| ---------------------- | ------------------------------------ | --------- |
| `OPENAI_API_KEY`       | OpenAI secret key                    | `sk-...`  |
| `OPENAI_WORKFLOW_ID`   | Optional; trace grouping (`wf_…`)   | `wf_…`    |

4. Deploy. Your API URL will look like `https://your-project.vercel.app/api/chat`.

### CORS

`/api/chat` sends `Access-Control-Allow-Origin: *`, allows `POST` and `OPTIONS`, `Content-Type`, and `Access-Control-Max-Age: 86400` for preflight caching. Tighten this in production if you need an origin allowlist.

## Shopify: widget installation

1. Copy `public/chat-widget.js` into your theme’s **`assets`** folder as `chat-widget.js`, **or** upload it under **Admin → Content → Files** and use the hosted file URL in the script `src` (see below).

2. In **Online Store → Themes → Edit code → `theme.liquid`**, paste the snippet **before** `</body>`.

<!-- Shopify theme.liquid snippet (paste before </body>):
<script>
  window.AI_CHAT_CONFIG = {
    apiEndpoint: "https://YOUR-VERCEL-URL.vercel.app/api/chat"
  };
</script>
<script src="{{ 'chat-widget.js' | asset_url }}" defer></script>
Upload chat-widget.js via Shopify Admin → Content → Files if you use a hosted URL; then point script src to that URL instead of asset_url.
-->

```html
<script>
  window.AI_CHAT_CONFIG = {
    apiEndpoint: "https://YOUR-VERCEL-URL.vercel.app/api/chat"
  };
</script>
<script src="{{ 'chat-widget.js' | asset_url }}" defer></script>
```

If the script lives in **Files** instead of theme assets, replace the last line with your full CDN URL, for example:

```html
<script src="https://cdn.shopify.com/s/files/1/.../chat-widget.js?v=..." defer></script>
```

3. Save. The widget reads `window.AI_CHAT_CONFIG.apiEndpoint` and keeps `conversationHistory` in memory for the page session (not `localStorage`).

## Agent Builder (“trained” workflow) vs this repo

**Why answers don’t match Agent Builder**

The chat API runs **`api/workflow/agent.ts`**: `@openai/agents` code (normally **pasted from** Agent Builder → **Code**). Your `wf_…` env var is **tracing only**, not a live link to the hosted workflow.  
Your **Agent Builder** canvas is a **different** artifact: a published workflow (`wf_…`) on OpenAI’s side. Putting a `wf_` id in **trace metadata only** does **not** pull in Builder prompts, tools, or training—you must **deploy the same logic** in one of the ways below.

### Option A — Use Builder-generated code (keeps `chat-widget.js` + `/api/chat`)

1. Open [Agent Builder](https://platform.openai.com/agent-builder), select your customer-service workflow.
2. Click **Code** (top) and copy or download the **Agents SDK** output.
3. Replace or merge into **`api/workflow/agent.ts`**, and keep an exported:

   `runWorkflow({ input_as_text, conversationHistory? })`

   returning something `api/chat.ts` already understands (`message`, `output_text`, or guardrail-style `safe_text`), or adjust `extractReply` in `api/chat.ts`.

4. `npm run build`, commit, redeploy Vercel.

Optional: set **`OPENAI_WORKFLOW_ID`** in Vercel to your real `wf_…` so traces group correctly (still does not load the workflow by itself).

### Option B — ChatKit (OpenAI runs the workflow)

Use [ChatKit](https://developers.openai.com/api/docs/guides/chatkit): your backend creates a **ChatKit session** with `workflow: { id: "wf_…" }` and the **ChatKit** UI talks to OpenAI. That matches the hosted Builder workflow but is a different integration than this project’s custom widget + `POST /api/chat`.

### Editing the placeholder agents only

If you stay on the **sample** agents in `api/workflow/agent.ts`, change the **`instructions`** (and `tools`) there—those strings are what the API actually uses today.

## Project layout

| Path                   | Role                                              |
| ---------------------- | ------------------------------------------------- |
| `api/chat.ts`              | Vercel function: POST `/api/chat`, CORS, workflow |
| `api/workflow/agent.ts`    | `runWorkflow`, `runWorkflowStreaming`, agents      |
| `api/public/widget-config.ts` | GET public theme + welcome (CORS `*`)        |
| `api/admin/*`          | Authenticated admin JSON API                       |
| `public/chat-widget.js`| Shopify-facing chat UI (no npm deps)               |
| `public/admin/`        | Admin SPA (static)                                 |
| `prisma/`              | Postgres schema & migrations                       |
| `vercel.json`          | Node build for the API route                      |

## API contract

**Request (POST, JSON):**

```json
{
  "message": "Where is my order?",
  "conversationHistory": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello!" }
  ],
  "stream": true,
  "timezone": "America/New_York",
  "conversationId": "optional-client-uuid-for-server-logs"
}
```

- Omit **`stream`** or set **`stream`: `false`** for a classic JSON response.
- Send header **`Accept: text/event-stream`** (the widget does both) to enable **SSE**.

**Response (JSON)** when `stream` is false:

```json
{
  "reply": "…",
  "conversationHistory": [ … ]
}
```

**Response (SSE)** when streaming: `Content-Type: text/event-stream`. Each event is one line `data: <json>\n\n`:

- `{ "type": "delta", "text": "…" }` — append `text` to the assistant message (token/chunk stream).
- `{ "type": "done", "reply": "…", "conversationHistory": [ … ] }` — final full reply and updated history.
- `{ "type": "error", "message": "…" }` — unrecoverable error.

The client should send back the full `conversationHistory` from the last `done` (or JSON response) on each turn.

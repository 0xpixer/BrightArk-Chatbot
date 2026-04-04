# BrightArk Chatbot

Production-oriented **Vercel serverless API** that runs an **OpenAI Agents** multi-agent workflow for BrightArk’s Shopify storefront, plus a **self-contained chat widget** you can load from your theme.

The API accepts a shopper message and optional `conversationHistory`, runs `runWorkflow` in `workflow/agent.ts` (classification → return / retention / information agents), and returns a plain-text `reply` with an updated history for the next request.

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

`npm run build` type-checks and compiles `workflow/` and `api/` with TypeScript.

Run the API locally with the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npx vercel dev
```

Set environment variables in `.env.local` (loaded by `vercel dev`):

| Variable         | Description                    |
| ---------------- | ------------------------------ |
| `OPENAI_API_KEY` | Your OpenAI secret key         |
| `SHOPIFY_DOMAIN` | Optional; see CORS note below |

The chat endpoint is `http://localhost:3000/api/chat` (port may differ; follow the CLI output).

**Vercel:** Call **`https://YOUR-PROJECT.vercel.app/api/chat`** (POST). The deployment root `/` only shows a short status page; a `404 NOT_FOUND` on `/` or a wrong path usually means you are not hitting `/api/chat`.

### Note on dependencies

`@openai/agents` expects **Zod v4**. This repo pins `zod@^4`. The repo also includes `.npmrc` with `legacy-peer-deps=true` so `npm install` stays compatible with `@openai/guardrails`’s older peer declarations.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com), **Import** the project and select the repo.
3. Under **Settings → Environment Variables**, add:

| Variable           | Description                                      | Example                |
| ------------------ | ------------------------------------------------ | ---------------------- |
| `OPENAI_API_KEY`   | OpenAI secret key                                | `sk-...`               |
| `SHOPIFY_DOMAIN`   | Store hostname used to tighten CORS (optional)   | `store.myshopify.com`  |

4. Deploy. Your API URL will look like `https://your-project.vercel.app/api/chat`.

### CORS

- If `SHOPIFY_DOMAIN` is **unset**, responses use `Access-Control-Allow-Origin: *` (simplest for testing).
- If set to `store.myshopify.com`, the API sends `Access-Control-Allow-Origin: https://store.myshopify.com`.
- If you use a **custom storefront domain**, set `SHOPIFY_DOMAIN` to that hostname (without path), or use `*` until you standardize on one origin.

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

## Updating assistant behavior

Edit the `instructions` strings (and optional `tools`) on the agents in `workflow/agent.ts`:

- **Classification Agent** — routing rules to return / retention / information.
- **Information Agent**, **Return Agent**, **Retention Agent** — tone and policies.

The workflow ID used for tracing metadata is:

`wf_69d06a9b8f708190a49d2fb0a96f45210dda58e7b54f5c6e`

After changes, run `npm run build`, commit, and redeploy on Vercel.

## Project layout

| Path                   | Role                                              |
| ---------------------- | ------------------------------------------------- |
| `api/chat.ts`          | Vercel function: POST `/api/chat`, CORS, workflow |
| `workflow/agent.ts`    | `runWorkflow`, agents, guardrails, tools          |
| `public/chat-widget.js`| Shopify-facing chat UI (no npm deps)               |
| `vercel.json`          | Node build for the API route                      |

## API contract

**Request (POST, JSON):**

```json
{
  "message": "Where is my order?",
  "conversationHistory": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello!" }
  ]
}
```

**Response (JSON):**

```json
{
  "reply": "…",
  "conversationHistory": [ … ]
}
```

The client should send back the full `conversationHistory` array on each turn so the workflow stays stateless between HTTP requests.

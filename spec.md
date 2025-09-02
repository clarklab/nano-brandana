# Project Spec — Drag-and-Drop Batch Image Editor (AI-powered)

## 1) Goal & Success Criteria

Build a simple web app that lets a user drag-and-drop dozens of high-quality photos, type/edit instructions in a chat-styled panel, and receive edited images in a results column. Edits are performed via **Vercel AI Gateway** routed to **Google’s Gemini 2.5 Flash Image** (aka “nano/nana banana”) image model. Code lives on **GitHub**, deploys to **Netlify**, and uses **Tailwind CSS**.

Success = smooth batch UX (dozens of images), clear progress per image, attractive “AI aesthetic” chat, and reliable processing via the Gateway with observability.

> **Docs to read (and point future agents at):**
>
> * Vercel AI Gateway: *Image Generation* (model string & examples) and *OpenAI-compatible API* (endpoints, attachments, streaming). ([Vercel][1])
> * Vercel AI Gateway: *Models & Providers* / Model Library (confirm exact model ID) and *Observability*. ([Vercel][2])
> * Google/Gemini: image generation & editing with “Gemini 2.5 Flash Image” (nicknamed Nano/Nana Banana). Use their format only for understanding capabilities; calls still go through the Gateway. ([Google AI for Developers][3])

---

## 2) Scope & Non-Goals

* **In scope:** (a) Text-guided edits on existing images (e.g., “remove background”, “warm up tones”), (b) prompt-based generation variants (optional toggle), (c) download all results (ZIP), (d) basic rate-limit handling & retries, (e) usage info (time/usage readouts), (f) persistent job state in browser (no DB).
* **Out of scope (v1):** Account system, team sharing, server-side storage, fine-grained job scheduling.

---

## 3) Architecture

* **Frontend:** Vite + React + Tailwind.
* **Server:** **Netlify Functions** (Node 20) as a thin proxy to Vercel AI Gateway. Functions:

  * `process-image` — receives one image + instruction; calls Gateway; returns edited image(s).
  * `batch` — accepts a list of files (multipart) and per-batch settings; fans out to `process-image` with client-side concurrency control (see §6).
* **AI layer:** **Vercel AI Gateway (OpenAI-compatible API)**; model ID **`google/gemini-2.5-flash-image-preview`** (confirm in model list; update if GA name changes). For image output, set modalities/response options per docs. ([Vercel][1])
* **Secrets:** `AI_GATEWAY_API_KEY` stored in Netlify env, not exposed to the client.
* **No database:** keep it stateless; the browser holds batch state.

---

## 4) Environment & Config

* **Netlify:**

  * `netlify.toml`

    * build: `npm run build`
    * functions node\_bundler: `esbuild`
    * node version: 20
  * ENV:

    * `AI_GATEWAY_API_KEY` (Vercel AI Gateway API key)
    * `AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1` (OpenAI-compatible base) ([Vercel][4])
    * `IMAGE_MODEL_ID=google/gemini-2.5-flash-image-preview` (or latest from Model Library). ([Vercel][1])
* **GitHub:** PR checks (lint/type), Netlify Git integration for auto-deploy.

---

## 5) UI/UX (Tailwind)

**Layout (3 columns on desktop, stacked on mobile):**

1. **Left: Input panel**

   * Drag-and-drop zone (supports 50+ images; show thumb grid with file size).
   * “Clear all” & “Add more”.
2. **Middle: Settings & Chat**

   * Chat thread: user messages (instructions), assistant status (“thinking”, step chips).
   * Global settings: model selector (pre-set to Gemini 2.5 Flash Image), size/output format, variation count, safety filter on/off (if available), seed (optional).
   * **Run Batch** button (disabled until at least 1 image + instruction).
   * “Model response timer” (per request and total), token/usage readout (when returned by Gateway). The Gateway returns `usage` & `providerMetadata` you can surface. ([Vercel][1])
3. **Right: Results gallery**

   * As each image completes, show a card: before/after toggle, thumbnail(s), status chip, elapsed time, **Download** (PNG/JPEG), “Download all (ZIP)”.

**Aesthetics:** “AI chrome” — soft gradient header, rounded-2xl cards, shimmer skeletons, animated typing dots, subtle glow on active cards.

---

## 6) Batch & Concurrency

* Client breaks the batch into **work items** (image + instruction + params).
* Use a **concurrency cap** (e.g., 3–5 parallel) with a queue (e.g., `p-limit`) to avoid rate spikes and function timeouts.
* Per item:

  1. Read file as ArrayBuffer → Base64 **data URI** (keep original MIME).
  2. POST to `/.netlify/functions/process-image` with:

     * `model`: from env or UI selector
     * `messages`: OpenAI-compatible `chat.completions` array, where content includes `type: 'text'` + `type: 'image_url'` pointing at the base64 data URI (per Gateway examples). ([Vercel][4])
     * (If generating from scratch) omit `image_url` and just include the prompt + modalities.
  3. Handle **streaming** (optional v1): If implemented, consume SSE and show incremental status; otherwise use non-streaming for simplicity. The Gateway exposes OpenAI-style streaming at `/v1/chat/completions`. ([Vercel][4])
* **Retries:** backoff on 429/5xx; show per-item retry count.
* **Limits:** Respect model/provider file size constraints; if too large, downscale client-side (createImageBitmap + canvas) with a “keep original” toggle for advanced users.

---

## 7) Gateway Request Shapes

**Editing an existing image (OpenAI-compatible `chat.completions`):**

* **Endpoint:** `POST https://ai-gateway.vercel.sh/v1/chat/completions`
* **Auth:** `Authorization: Bearer ${AI_GATEWAY_API_KEY}`
* **Body (essentials):**

```json
{
  "model": "google/gemini-2.5-flash-image-preview",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Warm the tones and remove the background." },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,....", "detail": "auto" } }
    ]
  }],
  "stream": false,
  "modalities": ["text","image"]    // if required per docs; see notes below
}
```

* **Response:** text in `choices[0].message.content` and **generated image(s)** as Base64 data URIs under `choices[0].message.images[].image_url.url`. (The Image Gen doc shows this separation and how to handle streamed file chunks / AI SDK `files` array.) ([Vercel][1])

**Notes:**

* When using **AI SDK** instead of raw fetch, set `providerOptions.google.responseModalities = ['TEXT','IMAGE']` and `model: 'google/gemini-2.5-flash-image-preview'` as shown in the Gateway’s Image Generation page. ([Vercel][1])
* Always confirm the latest **model ID** in the Model Library before shipping. If Google flips from `*-preview` to GA, update here. ([Vercel][2])

---

## 8) Netlify Functions (Server)

* `process-image.ts`

  * Validates size/MIME, instruction, and `IMAGE_MODEL_ID`.
  * Calls Gateway **OpenAI-compatible** endpoint with user text + base64 image attachment per “Image attachments” example. ([Vercel][4])
  * Returns JSON with the **base64 image(s)**, timing, and any `usage`/`providerMetadata` fields. ([Vercel][1])
* Security: never expose the Gateway key to the client; set strict CORS to your site origin.

---

## 9) Frontend Behavior

* **Dropzone:** previews + remove single/all.
* **Instruction composer:** multi-line, “Send” (Enter), quick presets (Remove BG / Upscale / Warmer / Desaturate).
* **Run Batch:** enqueues items, shows per-card progress (“queued → processing → done/failed”), elapsed time, retries.
* **Result Cards:** image viewer (before/after), size label, download buttons, “open in new tab”.
* **ZIP Download:** client-side (JSZip) to avoid server storage.
* **Accessibility:** keyboard focus order; announce status changes; alt text fallback from prompt.

---

## 10) Error Handling

* Display human-readable errors (rate limit, payload too large, provider error).
* Backoff strategy (e.g., 1s, 2s, 4s up to 3 tries).
* If the provider returns **usage** but no image, show partial info and keep the card for audit.
* Log minimal diagnostic info (no PII) to the console; users can export a “bug report JSON”.

---

## 11) Observability & Budgets

* In the Vercel AI Gateway dashboard, enable **Observability** and set usage budgets/alerts for the model route used by this app (helpful in public demos). Surface “cost/time” in UI when available from `usage` and provider metadata. ([Vercel][5])

---

## 12) Repository Layout

```
/ (repo root)
  /netlify/functions/
    process-image.ts
  /src/
    /components/ (Dropzone, Chat, ResultCard, ProgressBar, Timer)
    /lib/ (api client, concurrency utils, base64 helpers)
    App.tsx, main.tsx
  /public/
  index.html
  tailwind.config.js
  postcss.config.js
  netlify.toml
  package.json
  README.md
```

---

## 13) CI/CD

* **GitHub → Netlify**: On push to `main`, build & deploy.
* Preview deploys for PRs.
* Optional: add a simple **Playwright** smoke test (load page, drop sample image, assert 200 and a resulting card).

---

## 14) Security & Privacy

* All image data is processed transiently; nothing is stored server-side.
* Warn users about sensitive content; respect provider safety settings.
* Large files: process client-side resize when needed; inform the user of quality tradeoffs.

---

## 15) Deliverables

* Netlify URL + README with:

  * How to set `AI_GATEWAY_API_KEY` and `IMAGE_MODEL_ID`.
  * How to run locally (`netlify dev`).
  * Example cURL to test the function independently.
* Screenshots/GIF showing drag-drop → instructions → results.

---

## 16) Implementation Notes for the Next Agent

1. **Read these exact docs before coding:**

   * Vercel AI Gateway — *Image Generation* and *OpenAI-compatible API*. Confirm model string and response/streaming shapes, including how images are returned. ([Vercel][1])
   * Check the **Model Library** for the latest Gemini 2.5 Flash Image identifier (currently `google/gemini-2.5-flash-image-preview`). ([Vercel][2])
   * Review Google’s example for passing an image + prompt to “Gemini 2.5 Flash Image” (Nano/Nana Banana) to understand expected behavior, but **do not** call Gemini directly—always go through the Gateway. ([Google AI for Developers][3])
2. Implement the **Netlify Function** first (single-image edit). Verify with cURL using a small PNG.
3. Build the **frontend** with a small queue & concurrency limit, then scale to 50+ images.
4. Add **usage/time UI** from the response objects (`usage`, `providerMetadata`). ([Vercel][1])
5. Polish the **chat and “AI typing”** feel, add skeletons, and a “Download all” ZIP.
6. Finally, flip to **streaming** if time allows (SSE handler) for nicer progress. ([Vercel][4])

---

[1]: https://vercel.com/docs/ai-gateway/image-generation "Image Generation"
[2]: https://vercel.com/docs/ai-gateway/models-and-providers?utm_source=chatgpt.com "Models & Providers"
[3]: https://ai.google.dev/gemini-api/docs/image-generation?utm_source=chatgpt.com "Image generation with Gemini (aka Nano Banana) - Gemini API"
[4]: https://vercel.com/docs/ai-gateway/openai-compat "OpenAI-Compatible API"
[5]: https://vercel.com/docs/ai-gateway/observability "Observability"

# Agent Guide: Peel (formerly Nano Brandana)

**Last Updated:** December 26, 2025
**Status:** Production-ready batch image editor with auth & payment system
**Purpose:** Comprehensive guide for AI agents working on this codebase

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [What This App Does](#what-this-app-does)
3. [Current Implementation Status](#current-implementation-status)
4. [Architecture Deep Dive](#architecture-deep-dive)
5. [Key Files Reference](#key-files-reference)
6. [Development Workflows](#development-workflows)
7. [Testing Strategy](#testing-strategy)
8. [Common Tasks](#common-tasks)
9. [Troubleshooting](#troubleshooting)
10. [Future Feature Roadmap](#future-feature-roadmap)

---

## Quick Start

### For New Agents

1. **Read these files FIRST** (in order):
   - `README.md` - User-facing overview
   - `CLAUDE.md` - Project architecture & commands
   - `spec.md` - Original requirements & design decisions
   - This file (AGENT_GUIDE.md) - Implementation details

2. **Understand the tech stack:**
   - Frontend: React + TypeScript + Vite + Tailwind CSS
   - Backend: Netlify Functions (serverless Node.js)
   - AI: Vercel AI Gateway → Google Gemini 2.5 Flash Image
   - Auth: Supabase Auth (magic link)
   - Database: Supabase PostgreSQL
   - Payments: Polar (one-time token purchases)

3. **Key environment variables** (Netlify):
   ```bash
   # AI Processing
   AI_GATEWAY_API_KEY=<vercel-ai-gateway-key>
   AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
   IMAGE_MODEL_ID=google/gemini-3-pro-image

   # Supabase
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_KEY=<service-role-key>
   VITE_SUPABASE_URL=https://xxx.supabase.co (client-side)
   VITE_SUPABASE_ANON_KEY=<anon-key> (client-side)

   # Payments (Polar)
   POLAR_ACCESS_TOKEN=polar_at_xxx
   POLAR_WEBHOOK_SECRET=polar_whsec_xxx
   POLAR_STARTER_PRODUCT_ID=prod_xxx
   POLAR_PRO_PRODUCT_ID=prod_yyy
   POLAR_SERVER=production
   ```

4. **Development commands:**
   ```bash
   npm install              # Install dependencies
   netlify dev             # Start local dev server (includes functions)
   npm run build           # Production build
   npm test                # Run tests in watch mode
   npm run test:run        # Run tests once
   ```

---

## What This App Does

**Peel** is a drag-and-drop batch image editor that uses AI to transform images based on natural language instructions.

### User Flow

1. **Upload images** - Drag & drop up to 50+ images (or enter text prompts for generation)
2. **Add instructions** - Use preset buttons (REMOVE BG, ADD BRAND COLOR, etc.) or type custom instructions
3. **Process batch** - AI processes all images with dynamic concurrency control
4. **Download results** - Individual downloads or ZIP of all edited images

### Two Processing Modes

#### Batch Mode (Default)
- Each input (image or text prompt) processed separately
- Multiple work items = multiple API calls
- Example: 10 images → 10 separate processing jobs

#### Single Job Mode
- All inputs combined into one API call
- Multiple images sent together with combined instructions
- Useful for tasks requiring context across images
- Example: "Generate product shots from these 5 angles" → 1 API call

### Key Features

- **AI-Powered Editing** - Remove backgrounds, upscale, transform styles, duplicate with variations
- **Batch Processing** - Process dozens of images concurrently (3-5 parallel by default)
- **User-Editable Presets** - Customizable quick action buttons with template placeholders
- **Token-Based Billing** - Users start with 100k tokens, can purchase more via Polar
- **Job Logging** - Complete audit trail of all processing jobs
- **Dark Mode** - Toggle between light/dark themes
- **Mobile-Responsive** - 3-column desktop layout, tabbed mobile interface
- **Lightbox Gallery** - Full-screen image viewer with before/after comparison

---

## Current Implementation Status

### ✅ Fully Implemented

- [x] Core image processing pipeline (Vercel AI Gateway → Gemini)
- [x] Batch processing with concurrency control (p-limit)
- [x] User authentication (Supabase magic link)
- [x] Token accounting system (deduction, balance tracking)
- [x] Job logging (complete audit trail)
- [x] User-editable presets system
- [x] Payment integration (Polar - one-time purchases)
- [x] Dark mode theme
- [x] Mobile-responsive UI
- [x] Lightbox gallery
- [x] ZIP download
- [x] Retry logic with exponential backoff
- [x] Image resizing (client-side, max 2048px)
- [x] Before/after comparison
- [x] Sound effects (blip/click)

### ⚠️ Partial / In Progress

- [ ] Error handling UI improvements (current: basic alerts)
- [ ] Purchase history page (table exists, no UI)
- [ ] Admin analytics dashboard (data available, no UI)
- [ ] Usage analytics per user (logged but not visualized)

### 🔮 Not Implemented (See [Future Roadmap](#future-feature-roadmap))

- [ ] Webhook monitoring dashboard
- [ ] Preset sharing/marketplace
- [ ] Undo/redo functionality
- [ ] Image history/versioning
- [ ] Collaborative editing
- [ ] API key for programmatic access
- [ ] Batch templates (save common workflows)

---

## Architecture Deep Dive

### Frontend Architecture

```
src/
├── App.tsx                    # Main app component, orchestrates all state
├── main.tsx                   # Entry point, renders App + providers
├── components/
│   ├── InputPanel.tsx         # Left column: drag-drop, file list
│   ├── Chat.tsx               # Middle column: instructions, presets
│   ├── ResultCard.tsx         # Right column: individual result display
│   ├── ProgressBar.tsx        # Batch progress visualization
│   ├── Timer.tsx              # Elapsed time, token usage display
│   ├── Lightbox.tsx           # Full-screen image viewer
│   ├── PresetConfigModal.tsx  # Preset editor (full-screen modal)
│   ├── AuthModal.tsx          # Sign in/up modal (Supabase UI)
│   ├── AccountModal.tsx       # User account, job history, settings
│   ├── BuyTokensModal.tsx     # Token purchase flow
│   └── IntroModal.tsx         # First-time user welcome
├── contexts/
│   ├── AuthContext.tsx        # Supabase auth state, profile, job logs
│   └── ThemeContext.tsx       # Dark mode state
├── lib/
│   ├── api.ts                 # API client for Netlify Functions
│   ├── concurrency.ts         # Batch processor, work queue (p-limit)
│   ├── base64.ts              # Image encoding/decoding utilities
│   ├── supabase.ts            # Supabase client, types, DEFAULT_PRESETS
│   ├── pricing.ts             # Token package definitions
│   └── sounds.ts              # Sound effect management
└── hooks/
    └── useUserPresets.ts      # Hook for loading/editing presets
```

### Backend Architecture (Netlify Functions)

```
netlify/functions/
├── process-image.js        # Core image processing endpoint
│   - Verifies auth token
│   - Checks token balance
│   - Calls Vercel AI Gateway
│   - Deducts tokens
│   - Logs job
│   - Returns processed images
│
├── create-checkout.js      # Creates Polar checkout session
│   - Verifies auth
│   - Creates checkout with metadata (user_id, token amount)
│   - Returns checkout URL
│
└── payment-webhook.js      # Handles Polar webhooks
    - Verifies webhook signature
    - Extracts order data
    - Credits tokens to user
    - Logs purchase
```

### Database Schema (Supabase)

```sql
-- User profiles (created automatically on signup)
CREATE TABLE profiles (
  id UUID PRIMARY KEY,              -- Links to auth.users
  email TEXT,
  tokens_remaining INTEGER,         -- Current balance
  tokens_used INTEGER,              -- Lifetime usage
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);

-- Job execution logs (analytics & audit trail)
CREATE TABLE job_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  request_id TEXT,                  -- Unique per API call
  batch_id TEXT,                    -- Groups calls from same batch
  mode TEXT,                        -- 'batch' or 'singleJob'
  image_size TEXT,                  -- '1K', '2K', '4K'
  model TEXT,                       -- AI model ID
  images_submitted INTEGER,
  instruction_length INTEGER,
  total_input_bytes BIGINT,
  images_returned INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  elapsed_ms INTEGER,
  status TEXT,                      -- 'pending', 'success', 'error'
  error_code TEXT,
  error_message TEXT,
  tokens_charged INTEGER,
  token_balance_before INTEGER,
  token_balance_after INTEGER,
  created_at TIMESTAMPTZ
);

-- User-customizable presets
CREATE TABLE user_presets (
  id UUID PRIMARY KEY,
  user_id UUID,
  label VARCHAR(50),                -- Button text
  display_order INTEGER,
  preset_type VARCHAR(10),          -- 'direct' or 'ask'
  prompt TEXT,                      -- Instruction template
  ask_message TEXT,                 -- Follow-up question (for 'ask' type)
  display_text_template VARCHAR(200),
  response_confirmation TEXT,
  validation_type VARCHAR(20),      -- 'number', 'text', 'color', NULL
  validation_min INTEGER,
  validation_max INTEGER,
  validation_error_message TEXT,
  is_default BOOLEAN,
  is_hidden BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Token purchases (payment audit trail)
CREATE TABLE token_purchases (
  id UUID PRIMARY KEY,
  user_id UUID,
  amount_usd DECIMAL(10,2),
  tokens_purchased INTEGER,
  payment_provider TEXT,            -- 'polar'
  provider_transaction_id TEXT,     -- Polar order ID
  status TEXT,                      -- 'pending', 'completed', 'failed'
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Key RPC functions:
-- deduct_tokens(user_id, amount) - Atomic token deduction with row lock
-- add_tokens(user_id, amount) - Atomic token addition (for purchases)
-- log_job(...) - Insert job log entry (called by service_role)
```

### State Management Strategy

**No Redux/MobX** - React hooks + context only

- `AuthContext` - Global auth state, profile, job logs
- `ThemeContext` - Dark mode toggle
- `App.tsx` - Local state for:
  - `inputs` - Files/prompts to process
  - `instructions` - Global instructions
  - `workItems` - Current batch state (managed by batchProcessor)
  - `isProcessing` - Batch running flag
  - UI state (modals, lightbox, active tab)

**Why this works:**
- Simple data flow (top-down)
- No complex shared state
- Batch processor handles concurrency
- Database is source of truth for user data

---

## Key Files Reference

### Critical Read Before Modifying

| File | Purpose | Key Logic |
|------|---------|-----------|
| `App.tsx:99-239` | Batch processor creation | Dynamic concurrency, image encoding, retry logic |
| `App.tsx:289-371` | handleRunBatch | Auth gate, token check, work item generation |
| `process-image.js:60-421` | Main backend handler | Auth, token deduction, AI Gateway call, logging |
| `concurrency.ts` | Queue management | p-limit based batch processing |
| `useUserPresets.ts` | Preset template processing | `{{INPUT}}`, `{{ANGLES}}` placeholder substitution |

### Don't Touch Unless You Know What You're Doing

- `supabase-schema.sql` - Database schema (use migrations instead)
- `deduct_tokens` RPC - Atomic token logic (race condition prevention)
- `payment-webhook.js` - Signature verification (security critical)

### Safe to Modify

- UI components (all `.tsx` files in `components/`)
- `tailwind.config.js` - Styling tweaks
- `DEFAULT_PRESETS` in `supabase.ts` - Add new presets
- `pricing.ts` - Token package definitions

---

## Development Workflows

### Adding a New Preset (Default)

1. Edit `src/lib/supabase.ts` → `DEFAULT_PRESETS` array
2. Add new preset object:
   ```typescript
   {
     id: 'unique-id',
     label: 'Button Label',
     display_order: 7,
     preset_type: 'direct', // or 'ask'
     prompt: 'Your instruction here',
     // ... other fields
   }
   ```
3. Add tests in `src/hooks/useUserPresets.test.ts`
4. Run `npm run test:run`
5. Commit & deploy

### Adding a New Netlify Function

1. Create `netlify/functions/my-function.js`
2. Export handler:
   ```javascript
   exports.handler = async (event) => {
     // Your logic
     return {
       statusCode: 200,
       body: JSON.stringify({ result: 'data' })
     };
   };
   ```
3. Call from client:
   ```typescript
   const response = await fetch('/.netlify/functions/my-function', {
     method: 'POST',
     body: JSON.stringify({ data: 'value' })
   });
   ```
4. Test locally with `netlify dev`

### Database Migration Workflow

1. Create SQL file: `supabase/migrations/003_my_change.sql`
2. Write migration (include both UP and DOWN):
   ```sql
   -- Add new column
   ALTER TABLE profiles ADD COLUMN new_field TEXT;

   -- Rollback instructions (commented):
   -- ALTER TABLE profiles DROP COLUMN new_field;
   ```
3. Run in Supabase SQL Editor (or via Supabase CLI)
4. Update TypeScript types in `src/lib/supabase.ts`
5. Test thoroughly before production deployment

### Adding Environment Variables

1. Local development:
   ```bash
   netlify env:set VAR_NAME value
   ```
2. Production (Netlify dashboard):
   - Site configuration → Environment variables → Add variable
   - Set scopes: Production, Deploy previews, Branch deploys
3. Update `.env.example` (if it exists) with placeholder
4. Document in this guide

---

## Testing Strategy

### Current Test Coverage

- ✅ Preset template processing (`useUserPresets.test.ts`)
- ✅ Component rendering (basic)
- ❌ E2E flows (not implemented)
- ❌ Integration tests (not implemented)

### Running Tests

```bash
npm test              # Watch mode (development)
npm run test:run      # Single run (CI/CD)
```

### Testing Payment Flows

**Local webhook testing:**
1. Use Polar CLI or webhook proxy (e.g., ngrok)
2. Forward to `http://localhost:8888/.netlify/functions/payment-webhook`
3. Trigger test order in Polar dashboard
4. Verify tokens credited in Supabase

**Polar test mode:**
- Set `POLAR_SERVER=sandbox` for test environment
- Use Polar test payment methods
- Check Polar dashboard → Webhooks → Recent deliveries

### Testing AI Gateway

Use `test-vercel-gateway.js` script:
```bash
node test-vercel-gateway.js
```
This tests the Vercel AI Gateway connection without going through Netlify Functions.

---

## Common Tasks

### 1. Change Token Pricing

**Files to modify:**
- `src/lib/pricing.ts` - Update package definitions
- `docs/POLAR_SETUP.md` - Update documentation
- Polar dashboard - Update product prices

**Steps:**
1. Update `TOKEN_PACKAGES` in `pricing.ts`
2. Update corresponding products in Polar dashboard
3. Update `POLAR_STARTER_PRODUCT_ID` and `POLAR_PRO_PRODUCT_ID` env vars if needed
4. Redeploy

### 2. Add New Image Size Option

**Files to modify:**
- `App.tsx` - Add to `imageSize` type and UI
- `process-image.js` - Update validation (line 222)
- `Chat.tsx` - Add to image size selector

**Steps:**
1. Add `'8K'` to type: `'1K' | '2K' | '4K' | '8K'`
2. Update generation_config validation in backend
3. Test with Vercel AI Gateway (verify model supports size)
4. Update UI selector

### 3. Modify Concurrency Settings

**Location:** `App.tsx:18-32`

```typescript
const getConcurrencyLimit = (batchSize: number) => {
  if (batchSize >= 10) return 1; // Sequential for large batches
  if (batchSize >= 5) return 2;  // Low concurrency
  return 3;                       // Normal concurrency
};
```

**Why dynamic concurrency?**
- Large batches → sequential processing → reduces server load
- Small batches → parallel processing → faster results
- Prevents overwhelming Vercel AI Gateway rate limits

**Tuning guidance:**
- Increase limits for better throughput (risk: rate limit errors)
- Decrease limits for better stability (cost: slower processing)
- Current settings are conservative (optimized for reliability)

### 4. Add New Component

**Template:**
```typescript
// src/components/MyComponent.tsx
import React from 'react';

interface MyComponentProps {
  data: string;
  onAction: () => void;
}

export function MyComponent({ data, onAction }: MyComponentProps) {
  return (
    <div className="border-2 border-black dark:border-gray-600 p-4">
      <h3 className="font-bold font-sans">{data}</h3>
      <button
        onClick={onAction}
        className="border border-black dark:border-gray-600 px-3 py-1 hover:bg-neon transition-colors"
      >
        ACTION
      </button>
    </div>
  );
}
```

**Styling conventions:**
- Use Tailwind CSS utility classes
- Follow existing border/spacing patterns
- Support dark mode (`dark:` prefix)
- Monospace font by default (`font-mono`)
- Sans-serif for headings (`font-sans`)
- Uppercase text for buttons/labels
- Neon accent color: `bg-neon`, `border-neon`

---

## Troubleshooting

### Common Issues

#### 1. "Insufficient tokens" Error

**Symptoms:** User can't process images, sees 402 error

**Diagnosis:**
```sql
-- Check user's balance
SELECT tokens_remaining FROM profiles WHERE id = '<user-id>';
```

**Solutions:**
- User needs to purchase tokens (show BuyTokensModal)
- If bug: manually credit tokens:
  ```sql
  SELECT add_tokens('<user-id>', 100000);
  ```

#### 2. Webhook Not Receiving Events

**Symptoms:** User completes payment but tokens not credited

**Diagnosis:**
1. Check Polar dashboard → Webhooks → Recent deliveries
2. Check Netlify Functions logs for `payment-webhook`
3. Verify webhook secret matches

**Solutions:**
- Ensure webhook URL is correct: `https://your-site.netlify.app/.netlify/functions/payment-webhook`
- Verify `POLAR_WEBHOOK_SECRET` matches Polar dashboard
- Check signature verification isn't failing (line 30-50 in webhook handler)
- Manually trigger test webhook from Polar dashboard

#### 3. Images Not Processing

**Symptoms:** Batch starts but items stay in "processing" state

**Diagnosis:**
1. Check browser console for errors
2. Check Netlify Functions logs for `process-image`
3. Verify `AI_GATEWAY_API_KEY` is valid
4. Check Vercel AI Gateway dashboard for rate limits

**Solutions:**
- Invalid API key → Update `AI_GATEWAY_API_KEY`
- Rate limited → Wait or upgrade Vercel plan
- Network errors → Retry mechanism should handle (check retry count)
- Image too large → Client should resize (check MAX_IMAGE_DIMENSION)

#### 4. Dark Mode Not Persisting

**Symptoms:** Dark mode resets on page reload

**Diagnosis:**
- Check localStorage for `peel-theme` key
- Check ThemeContext initialization

**Solution:**
- Clear browser cache
- Check localStorage permissions
- Verify `ThemeContext.tsx` is loading preference correctly

#### 5. Preset Changes Not Saving

**Symptoms:** User edits preset but reverts on reload

**Diagnosis:**
- Check if user is authenticated (guests can't save)
- Check Supabase RLS policies
- Check browser network tab for failed requests

**Solutions:**
- User must be signed in to save presets
- Verify `user_presets` table RLS policies allow user updates
- Check `useUserPresets.ts` save logic

---

## Future Feature Roadmap

Based on codebase analysis, here are the **top 3 recommended features** to build next:

### 1. Batch Templates System ⭐⭐⭐

**Why:** Users repeatedly run the same workflows (e.g., "remove BG + add brand color + upscale"). Saving these as templates would dramatically improve UX.

**Implementation:**
- New table: `batch_templates` (user_id, name, instructions, presets, image_size)
- UI: "Save Current Batch as Template" button in Chat.tsx
- UI: Template selector dropdown (loads saved template into instructions)
- Complexity: Medium (2-3 days)
- Value: High (reduces repetitive work)

**Files to modify:**
- `src/lib/supabase.ts` - Add types, table schema
- `src/components/Chat.tsx` - Add template selector UI
- New: `src/hooks/useBatchTemplates.ts` - CRUD hooks
- New migration: `supabase/migrations/004_batch_templates.sql`

### 2. Usage Analytics Dashboard 📊

**Why:** All the data is already being logged (`job_logs` table), but users can't see trends. Adding visualizations would help users understand their usage patterns and optimize token spending.

**Implementation:**
- New tab in AccountModal: "Analytics"
- Charts:
  - Token usage over time (line chart)
  - Images processed per day (bar chart)
  - Average tokens per image (metric)
  - Most common instructions (top 5 list)
- Use existing `job_logs` data
- Complexity: Medium (3-4 days)
- Value: High (helps users optimize)

**Files to modify:**
- `src/components/AccountModal.tsx` - Add analytics tab
- New: `src/components/UsageChart.tsx` - Chart component
- `src/contexts/AuthContext.tsx` - Add analytics queries
- Consider: Lightweight charting library (e.g., recharts, visx)

### 3. Preset Marketplace 🛍️

**Why:** User-editable presets are powerful but require expertise. A marketplace where users can share presets would help novices get started and reward power users.

**Implementation:**
- New table: `public_presets` (user_id, preset_data, downloads, ratings)
- UI: "Browse Public Presets" button in PresetConfigModal
- UI: Preset gallery with search, filter by category, ratings
- Users can:
  - Publish their presets (opt-in)
  - Download/import others' presets
  - Rate/review presets
- Complexity: High (5-7 days)
- Value: Very High (community engagement, virality)

**Files to modify:**
- New migration: `supabase/migrations/005_public_presets.sql`
- `src/components/PresetConfigModal.tsx` - Add marketplace tab
- New: `src/components/PresetMarketplace.tsx` - Marketplace UI
- New: `src/hooks/usePublicPresets.ts` - Marketplace data hooks
- RLS policies: Public read, authenticated write (for publishing)

### Other Worthy Features (Lower Priority)

**4. Undo/Redo System**
- Local history of batch runs
- "Revert to Previous" button
- Complexity: Medium
- Value: Medium (nice-to-have)

**5. API Key for Programmatic Access**
- Generate user API keys
- REST API endpoints for batch processing
- Webhook callbacks when batch completes
- Complexity: High
- Value: High (enterprise/developer users)

**6. Collaborative Editing**
- Share batch with team members
- Real-time collaboration on instructions
- Shared token pool
- Complexity: Very High
- Value: Medium (niche use case)

**7. Image History/Versioning**
- Store past results in database (requires storage setup)
- "Reprocess with Different Settings"
- Compare results side-by-side
- Complexity: High (need storage solution like Supabase Storage)
- Value: Medium

**8. Advanced Error Recovery**
- Better error messages (not just alerts)
- Per-image retry button (currently batch-level)
- Partial batch download (download successful images even if some failed)
- Complexity: Medium
- Value: High (UX improvement)

**9. Preset Scheduling**
- "Process all uploaded images at 2am" (batch scheduling)
- Email notification when complete
- Requires background job runner
- Complexity: Very High
- Value: Low (limited use case)

**10. Mobile App (PWA)**
- Progressive Web App capabilities
- Offline support (queue for later processing)
- Push notifications
- Complexity: High
- Value: High (mobile users)

---

## Architecture Decision Records

### Why Netlify Functions instead of Express server?

**Decision:** Serverless functions via Netlify

**Reasoning:**
- No server management
- Auto-scaling
- Pay-per-use pricing
- Built-in CI/CD with Git integration
- Easy environment variable management

**Trade-offs:**
- Cold starts (mitigated by Netlify's edge network)
- No WebSocket support (not needed for this app)
- 10-second function timeout (sufficient for image processing)

### Why Supabase instead of Firebase?

**Decision:** Supabase for auth + database

**Reasoning:**
- PostgreSQL (better for relational data than Firestore)
- Built-in Row Level Security (RLS)
- SQL functions (atomic operations like `deduct_tokens`)
- Magic link auth out-of-the-box
- Better TypeScript support

**Trade-offs:**
- Smaller ecosystem than Firebase
- Fewer integrations
- Self-hosting more complex (but we use hosted version)

### Why Polar instead of Stripe?

**Decision:** Polar for payments (after evaluating both)

**Reasoning:**
- Simpler API for one-time purchases
- Developer-friendly
- Lower fees
- Built-in support for "credit pack" products

**Trade-offs:**
- Less mature than Stripe
- Fewer payment methods
- Smaller support community

**Note:** Architecture supports both providers - can switch later if needed.

### Why client-side batch processing instead of server-side queue?

**Decision:** Client-side queue with p-limit

**Reasoning:**
- Simpler architecture (no queue infrastructure)
- Real-time progress updates (WebSocket not needed)
- User controls concurrency
- No server-side state management

**Trade-offs:**
- User must keep browser tab open
- Can't process batches in background
- No retry on connection loss

**Future consideration:** Add optional background processing for large batches (complexity: high).

---

## Security Considerations

### Critical Security Measures in Place

1. **Row Level Security (RLS)** - All Supabase tables enforce user-level access
2. **Webhook Signature Verification** - Prevents payment spoofing (payment-webhook.js:30-50)
3. **Service Role Key Protection** - Never exposed to client (server-side only)
4. **Token Balance Validation** - Checked before processing (process-image.js:136-159)
5. **Atomic Token Operations** - Row-level locking prevents race conditions
6. **HTTPS Only** - Enforced by Netlify (webhooks require it)
7. **Content Security Policy** - Standard Netlify CSP headers

### Security Checklist for New Features

Before deploying code that handles:

- [ ] **User data** → Verify RLS policies are enabled
- [ ] **Payments** → Signature verification is mandatory
- [ ] **Token operations** → Use atomic RPC functions (not direct UPDATE)
- [ ] **File uploads** → Validate file size, type, content
- [ ] **External API calls** → Rate limit client-side requests
- [ ] **Sensitive env vars** → Never log, never expose to client

### Known Security Limitations

1. **No rate limiting on checkout creation** - User could spam checkout sessions
   - Mitigation: Netlify Functions have built-in concurrency limits
   - Future: Add Redis-based rate limiting

2. **No CAPTCHA on signup** - Bots could create accounts
   - Mitigation: Supabase email verification required
   - Future: Add Turnstile or reCAPTCHA

3. **No input sanitization on instructions** - XSS risk if we display user prompts later
   - Current: Instructions not rendered as HTML (safe)
   - Future: If adding prompt library, sanitize before storing

---

## Performance Optimization Notes

### Current Optimizations

1. **Dynamic concurrency** - Reduces server load for large batches
2. **Client-side image resizing** - Keeps uploads under 2MB
3. **Base64 caching** - `inputToBase64Map` prevents re-encoding
4. **Staggered requests** - Delays between API calls prevent bursts
5. **Lazy loading** - Lightbox images loaded on-demand
6. **Memoization** - `useMemo` for batch processor creation

### Performance Bottlenecks

1. **Large batch processing** - 50+ images takes 5-10 minutes
   - Future: Add server-side queue for background processing
   - Future: Email notification when batch completes

2. **ZIP generation** - Blocks UI thread for large batches
   - Future: Move to Web Worker

3. **Job logs query** - Fetches all logs on account modal open
   - Future: Add pagination, filter by date range

4. **Preset config modal** - Full-screen modal re-renders entire form
   - Future: Split into smaller components

### Monitoring Recommendations

- Add Sentry for error tracking
- Add PostHog or Mixpanel for analytics
- Monitor Vercel AI Gateway usage dashboard
- Set up Netlify Functions metrics
- Track Supabase database size (free tier: 500MB)

---

## Contributing Guidelines

### Code Style

- **TypeScript** - Strict mode enabled
- **ESLint** - Follow existing config (TODO: add .eslintrc)
- **Prettier** - Consistent formatting (TODO: add .prettierrc)
- **Naming conventions:**
  - Components: PascalCase (`MyComponent.tsx`)
  - Hooks: camelCase with `use` prefix (`useMyHook.ts`)
  - Functions: camelCase (`myFunction`)
  - Constants: UPPER_SNAKE_CASE (`MAX_IMAGE_SIZE`)
  - Files: Match export name

### Git Workflow

1. Branch naming: `feature/description`, `fix/description`
2. Commit messages: Conventional Commits format
   - `feat: add preset marketplace`
   - `fix: resolve dark mode persistence`
   - `docs: update agent guide`
3. Pull requests: Required for main branch
4. Deployment: Auto-deploy from main via Netlify

### Testing Requirements

- All new features require tests
- Bug fixes should include regression test
- Run `npm run test:run` before committing
- E2E tests (when implemented) must pass

---

## Conclusion

This guide provides a comprehensive overview of the Peel codebase. For specific implementation details, refer to the individual documentation files:

- **User Guide:** `README.md`
- **Project Overview:** `CLAUDE.md`
- **Original Spec:** `spec.md`
- **Preset System:** `docs/USER_PRESETS.md`
- **Payment Setup:** `docs/POLAR_SETUP.md`
- **Auth Research:** `SUPABASE_AUTH_RESEARCH.md`
- **Payment Research:** `docs/PAYMENT_INTEGRATION_FEASIBILITY.md`

**Questions or Issues?**
- Check existing documentation first
- Review closed GitHub issues (if applicable)
- Test changes in local environment (`netlify dev`)
- Use Supabase SQL Editor for database queries
- Check Netlify Functions logs for backend debugging

**Remember:**
- The app is production-ready but actively evolving
- Prioritize user experience over technical perfection
- Test payment flows thoroughly (security critical)
- Document all changes (especially database migrations)
- Keep this guide updated as architecture evolves

---

**Document Version:** 1.0
**Last Updated:** December 26, 2025
**Maintained By:** AI Agents working on Peel
**Status:** Living document - update as needed

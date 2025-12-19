# Supabase Auth Setup Guide

Simple step-by-step guide to set up user authentication and token tracking.

---

## Step 1: Create a Supabase Project

1. Go to **https://supabase.com**
2. Click **Start your project** (sign up if needed)
3. Click **New project**
4. Fill in:
   - **Name**: `nano-brandana` (or whatever you want)
   - **Database Password**: Generate a strong one, save it somewhere
   - **Region**: Pick one close to you
5. Click **Create new project**
6. Wait ~2 minutes for it to spin up

---

## Step 2: Get Your API Keys

1. In your Supabase project, click **Project Settings** (gear icon, bottom left)
2. Click **API** in the left menu
3. You'll see two important keys:

### Copy these keys:

| Key | Where to find it | What it's for |
|-----|------------------|---------------|
| **Project URL** | Top of the page | `https://xxxxx.supabase.co` |
| **anon public** | Under "Project API keys" | Safe to use in browser |
| **service_role** | Under "Project API keys" (click to reveal) | **SECRET** - server only! |

---

## Step 3: Run the Database Schema

1. In Supabase, click **SQL Editor** (left menu)
2. Click **New query**
3. Copy the ENTIRE contents of `supabase-schema.sql` from this repo
4. Paste it into the editor
5. Click **Run** (or press Cmd/Ctrl + Enter)
6. You should see "Success. No rows returned"

This creates:
- `profiles` table (stores user tokens)
- Auto-creates profile when users sign up with 100,000 tokens
- `deduct_tokens` function for safe token deduction

---

## Step 4: Enable Email Auth

1. Click **Authentication** (left menu)
2. Click **Providers**
3. Make sure **Email** is enabled
4. Click on **Email** to expand settings
5. Make sure these are ON:
   - **Enable Email provider**: ON
   - **Confirm email**: ON (this enables magic links)
6. Click **Save**

---

## Step 5: Set Environment Variables

### For Local Development (`.env` file)

Create a `.env` file in your project root:

```bash
# Frontend (Vite)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend (Netlify Functions)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### For Netlify (Production)

1. Go to your Netlify dashboard
2. Click on your site
3. Go to **Site configuration** → **Environment variables**
4. Add these 4 variables:

| Key | Value | Notes |
|-----|-------|-------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | Your project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | The "anon public" key |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Same URL (for backend) |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | The "service_role" key (**secret!**) |

5. **Disable secret scanning** (see Step 5b below)
6. Redeploy your site for changes to take effect

### Step 5b: Disable Secret Scanning

Netlify incorrectly flags these public keys as "exposed secrets". To fix:

1. Go to **Site configuration** → **Build & deploy** → **Post processing**
2. Find **"Secret scanning"** or **"Exposed secrets"**
3. Either disable it entirely, or add these to the allowlist:
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`

---

## Step 6: Test It!

1. Run locally: `netlify dev`
2. Open the app
3. You should see a **SIGN IN** button in the header
4. Click it, enter your email
5. Check your email for the magic link
6. Click the link - you're logged in!
7. You should see "100,000 tokens" in the header

---

## Troubleshooting

### "Check your email" but no email arrives

- Check spam folder
- Supabase free tier is limited to 3 emails/hour
- Wait a minute and try again

### "Authentication required" error

- Make sure you're logged in
- Try logging out and back in
- Check browser console for errors

### Tokens not deducting

- Check Netlify function logs for errors
- Make sure `SUPABASE_SERVICE_KEY` is set correctly
- Run the SQL schema again to ensure the `deduct_tokens` function exists

### "Invalid session" errors

- Sessions expire after 1 hour by default
- Log out and back in
- Clear localStorage and try again

---

## Quick Reference: All Environment Variables

```bash
# FRONTEND (public keys, safe to expose)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# BACKEND (keep secret!)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# EXISTING (already set up)
AI_GATEWAY_API_KEY=your-vercel-key
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
IMAGE_MODEL_ID=google/gemini-3-pro-image
```

---

## That's it!

Your app now has:
- Magic link authentication (no passwords)
- 100,000 free tokens per user
- Automatic token deduction per generation
- Token balance display in header

Users can sign up, get tokens, and use them for image generations!

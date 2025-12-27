# Authentication Configuration Checklist

Use this checklist to verify your Supabase project is configured correctly for persistent magic link authentication.

## ✅ Supabase Project Settings

### 1. Authentication Configuration

**Path:** Supabase Dashboard → Authentication → Configuration

#### Site URL
- [ ] **Site URL** is set to `https://nano.wims.vc`
- [ ] If testing locally, also add `http://localhost:8889` (Netlify dev default port)

**Why this matters:** This is the default redirect URL for auth callbacks. If not set correctly, auth will fail.

#### Redirect URLs (CRITICAL!)
- [ ] **Redirect URLs** section includes:
  - [ ] `https://nano.wims.vc` (production)
  - [ ] `https://nano.wims.vc/**` (with wildcard for all paths)
  - [ ] `http://localhost:8889` (local development)
  - [ ] `http://localhost:8889/**` (local with wildcard)

**Why this matters:** Supabase ONLY allows redirects to whitelisted URLs. If your domain isn't here, the magic link will fail silently or show an error.

**How to add:**
1. Go to Authentication → URL Configuration
2. Under "Redirect URLs", click "Add URL"
3. Add each URL above
4. Click Save

### 2. Email Auth Provider

**Path:** Supabase Dashboard → Authentication → Providers → Email

- [ ] **Enable Email provider** is ON
- [ ] **Confirm email** is ON (enables magic links)
- [ ] **Secure email change** is ON (recommended)
- [ ] **Email OTP expiration** is set (default 1 hour is fine)

### 3. Email Templates (Optional but Recommended)

**Path:** Supabase Dashboard → Authentication → Email Templates

- [ ] Review the **Magic Link** template
- [ ] Ensure `{{ .ConfirmationURL }}` is present in the template
- [ ] (Optional) Customize the email to match your brand

**Default template works fine, but you can improve UX by:**
- Making the link button more prominent
- Adding your brand colors/logo
- Clarifying what the link does

### 4. PKCE Settings

**Path:** Supabase Dashboard → Authentication → Configuration

- [ ] **PKCE** (Proof Key for Code Exchange) should be enabled
  - This is usually enabled by default for newer projects
  - Our code now explicitly uses PKCE flow (`flowType: 'pkce'`)

**If you can't find this setting:** It's likely enabled by default. The client-side configuration we added will handle it.

## ✅ Netlify Environment Variables

**Path:** Netlify Dashboard → Site configuration → Environment variables

Verify these 4 variables are set:

- [ ] `VITE_SUPABASE_URL` = `https://xxxxx.supabase.co`
- [ ] `VITE_SUPABASE_ANON_KEY` = `eyJhbGci...` (the "anon public" key)
- [ ] `SUPABASE_URL` = same as VITE_SUPABASE_URL
- [ ] `SUPABASE_SERVICE_KEY` = `eyJhbGci...` (the "service_role" key - KEEP SECRET)

**How to get these values:**
1. Supabase Dashboard → Settings → API
2. Copy "Project URL" for both URL variables
3. Copy "anon public" key for VITE_SUPABASE_ANON_KEY
4. Copy "service_role" key for SUPABASE_SERVICE_KEY (show secret first)

### Secret Scanning

- [ ] **Secret scanning** is disabled for `VITE_SUPABASE_*` vars
  - Path: Site configuration → Build & deploy → Post processing
  - Netlify incorrectly flags public anon keys as secrets
  - Either disable secret scanning or whitelist these specific vars

## ✅ Common Configuration Issues

### Issue: Magic link redirects to wrong URL

**Symptoms:**
- Click magic link → lands on wrong domain
- Click magic link → shows "Invalid link" error

**Fix:**
1. Check "Site URL" in Supabase is set to `https://nano.wims.vc`
2. Check "Redirect URLs" includes `https://nano.wims.vc/**` (with wildcard)
3. Clear browser cache and cookies
4. Request a new magic link

### Issue: Magic link works but session doesn't persist

**Symptoms:**
- Login works, but logged out on next visit
- Have to login again every time you close browser

**Fix:**
✅ **This should be fixed by our PKCE flow update!**
- We added `flowType: 'pkce'` to the Supabase client
- We added session recovery logic
- We improved error handling

If still not working after deploy:
1. Open browser console
2. Run `window.debugAuth()` to see auth state
3. Share the output with developer

### Issue: "Email rate limit exceeded"

**Symptoms:**
- "Too many requests" error when trying to login
- Magic link emails stop arriving

**Fix:**
- Supabase free tier limits: 3 emails per hour per user
- Wait 1 hour and try again
- Or: Upgrade to Pro plan for higher limits
- Or: Configure custom SMTP (Resend, SendGrid, etc.)

### Issue: Emails go to spam

**Symptoms:**
- Magic link emails arrive in spam folder
- Emails take a long time to arrive

**Fix:**
1. Add `noreply@mail.app.supabase.io` to contacts
2. Check spam folder and mark "Not spam"
3. (Recommended) Set up custom SMTP with your own domain
   - Path: Supabase Dashboard → Project Settings → Auth → SMTP Settings

## ✅ Testing Your Configuration

### Test 1: Magic Link Flow
1. Clear cookies and localStorage
2. Open your site
3. Click "SIGN IN"
4. Enter your email
5. Check email (including spam)
6. Click the magic link
7. Verify you're redirected back to your site AND logged in
8. Check browser console for any errors

### Test 2: Session Persistence
1. After logging in (from Test 1)
2. Run `window.debugAuth()` in browser console
3. You should see:
   - `Session exists: true`
   - Your user ID and email
   - Session expiration time (should be ~1 hour in future)
4. Close browser completely
5. Reopen and visit site
6. Run `window.debugAuth()` again
7. ✅ Session should still exist with same expiration

### Test 3: Token Refresh
1. After logging in
2. Wait 10-15 minutes
3. Interact with the app (upload an image, etc.)
4. Check browser console for `[onAuthStateChange] Token refreshed successfully`
5. ✅ Session should automatically refresh without you noticing

## 🔍 Debug Commands

Run these in browser console (after our latest fixes are deployed):

```javascript
// See full auth state
window.debugAuth()

// Check what's in localStorage
Object.keys(localStorage).filter(k => k.includes('peel') || k.includes('supabase') || k.includes('sb-'))

// Force clear corrupted auth (if needed)
Object.keys(localStorage).forEach(k => {
  if (k.includes('peel') || k.includes('supabase') || k.includes('sb-')) {
    localStorage.removeItem(k);
  }
});
```

## 📋 Quick Reference

### Where to find Supabase values:

| What you need | Where to find it |
|---------------|------------------|
| Project URL | Dashboard → Settings → API → Project URL |
| Anon Key | Dashboard → Settings → API → Project API keys → anon public |
| Service Key | Dashboard → Settings → API → Project API keys → service_role (click reveal) |
| Site URL | Dashboard → Authentication → URL Configuration → Site URL |
| Redirect URLs | Dashboard → Authentication → URL Configuration → Redirect URLs |

### Current Auth Implementation Details:

- **Storage:** localStorage (key: `peel-auth`)
- **Flow Type:** PKCE (Proof Key for Code Exchange)
- **Session Duration:** ~1 hour (auto-refreshes)
- **Auto-refresh:** Enabled
- **Magic link expiration:** 1 hour (Supabase default)
- **Session detection in URL:** Enabled

## 🆘 Still Having Issues?

If you've checked everything above and auth still doesn't persist:

1. Run `window.debugAuth()` and share the output
2. Check browser console for error messages (look for `[AuthProvider]`, `[getSession]`, `[onAuthStateChange]` logs)
3. Verify environment variables are actually set in Netlify (not just locally)
4. Try in an incognito window to rule out browser extension interference
5. Try a different browser to rule out browser-specific issues

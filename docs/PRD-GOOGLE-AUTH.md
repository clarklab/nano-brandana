# PRD: Add Google OAuth Sign-In

**Date:** January 10, 2026
**Author:** Claude
**Status:** Draft for Review

---

## Executive Summary

Add a "Sign in with Google" button to the existing login modal as an alternative to magic link authentication. Users experiencing slow or failing magic link emails can instantly sign in with their Google account instead.

---

## 1. Risks / Feasibility / Confidence Assessment

### Confidence Level: **HIGH (95%)**

This is a low-risk, high-confidence change for the following reasons:

#### Why This Will Work

| Factor | Assessment |
|--------|------------|
| **Supabase Support** | Google OAuth is a first-class, well-documented feature in Supabase Auth |
| **Existing Infrastructure** | Our `onAuthStateChange` listener already handles `SIGNED_IN` events regardless of auth method |
| **Profile Creation** | The `handle_new_user` database trigger fires for ANY new user, including OAuth users |
| **Session Handling** | Supabase uses the same `Session` and `User` objects for all auth methods |
| **Code Changes** | Only ~20-30 lines of code needed in `AuthModal.tsx` |

#### Technical Compatibility Verified

1. **Same PKCE flow**: Our Supabase client is configured with `flowType: 'pkce'` which Google OAuth also uses
2. **Same storage key**: Sessions stored under `peel-auth` key work identically for OAuth
3. **detectSessionInUrl: true**: Already configured to detect OAuth callback tokens in URL hash
4. **Callback handling**: `App.tsx` lines 103-141 already detect `#access_token` in URL - this works for Google OAuth callbacks too

#### Potential Risks (All Low)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Google Cloud Console misconfiguration | Low | Blocks feature | Follow official docs step-by-step |
| User email mismatch (same user, different emails) | Low | Creates duplicate account | Document that accounts are per-email |
| Google API rate limits | Very Low | Temporary auth failures | Standard - no mitigation needed |
| Third-party cookie deprecation (FedCM) | Medium | Future Chrome issue | Supabase handles this automatically |

#### What Could Go Wrong

1. **Redirect URI mismatch**: If the Google Cloud Console callback URL doesn't exactly match Supabase's callback URL, auth will fail. Fix: Copy exact URL from Supabase dashboard.
2. **OAuth consent screen not verified**: Google may show scary "unverified app" warning to users. Fix: Submit for verification or users click "Advanced" to proceed.
3. **Netlify preview deploys**: Each preview deploy has a different URL. Fix: Add wildcard redirect URL pattern in Supabase.

### Recommendation: **PROCEED**

This is one of the simplest possible auth changes. The entire feature can be implemented and tested in under an hour of development time.

---

## 2. Problem Statement

### Current State
- Users sign in via magic link (email with one-time link)
- Magic links are experiencing delivery issues (slow, failing, or going to spam)
- Users who can't receive magic links cannot access their accounts
- Auth logs show incomplete flows stuck at "callback_received" stage

### Desired State
- Users have two sign-in options: magic link OR Google
- Google sign-in is instant (no email delivery dependency)
- Same user experience after sign-in (tokens, presets, job history all work)

---

## 3. User Stories

1. **As a new user**, I want to sign up with my Google account so I can start using Peel immediately without waiting for an email.

2. **As an existing user** whose magic link isn't arriving, I want to sign in with Google so I can access my account.

3. **As a mobile user**, I want to tap "Sign in with Google" so I can authenticate without switching to my email app.

---

## 4. Technical Specification

### 4.1 Google Cloud Console Setup (One-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth client ID**
5. Configure:
   - **Application type**: Web application
   - **Name**: "Peel Image Editor"
   - **Authorized JavaScript origins**:
     - `https://your-production-domain.com`
     - `http://localhost:8888` (for local dev with Netlify)
   - **Authorized redirect URIs**:
     - `https://<your-project-ref>.supabase.co/auth/v1/callback`
6. Save the **Client ID** and **Client Secret**

### 4.2 Supabase Dashboard Setup (One-time)

1. Go to Supabase Dashboard > Authentication > Providers
2. Find **Google** and enable it
3. Enter the **Client ID** and **Client Secret** from Google Cloud Console
4. Copy the **Callback URL** shown (use this in Google Cloud Console)
5. Go to Authentication > URL Configuration
6. Add to **Redirect URLs**:
   - `https://your-production-domain.com`
   - `https://your-production-domain.com/*`
   - `http://localhost:8888` (for local dev)

### 4.3 Code Changes

#### File: `src/components/AuthModal.tsx`

Add Google sign-in function and button:

```typescript
// Add to imports (no new packages needed - supabase client already imported)

// Add new state
const [isGoogleLoading, setIsGoogleLoading] = useState(false);

// Add Google sign-in handler
const handleGoogleSignIn = async () => {
  setIsGoogleLoading(true);
  setFormError(null);

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      console.error('[AuthModal] Google sign-in error:', error);
      setFormError(error.message || 'Failed to sign in with Google');
      setIsGoogleLoading(false);
    }
    // Note: On success, user is redirected to Google, so no need to handle success state
  } catch (err) {
    console.error('[AuthModal] Unexpected Google error:', err);
    setFormError('Something went wrong. Please try again.');
    setIsGoogleLoading(false);
  }
};
```

Add button to the form section (before the email form):

```tsx
{/* Google Sign-In Button */}
<button
  type="button"
  onClick={handleGoogleSignIn}
  disabled={isGoogleLoading || isLoading}
  className="w-full py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
>
  {isGoogleLoading ? (
    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  ) : (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )}
  Continue with Google
</button>

{/* Divider */}
<div className="relative my-4">
  <div className="absolute inset-0 flex items-center">
    <div className="w-full border-t border-slate-200 dark:border-slate-600"></div>
  </div>
  <div className="relative flex justify-center text-sm">
    <span className="px-2 bg-white dark:bg-slate-800 text-slate-500">or</span>
  </div>
</div>
```

### 4.4 No Changes Required

These components need **no modifications**:

| Component | Why No Changes Needed |
|-----------|----------------------|
| `AuthContext.tsx` | `onAuthStateChange` already handles all auth events generically |
| `supabase.ts` | Client config already supports OAuth (detectSessionInUrl, PKCE) |
| `App.tsx` | Callback handling already detects `#access_token` from any provider |
| `auth-tracking.ts` | Can track Google auth same as magic link (optional enhancement) |
| Database schema | `handle_new_user` trigger works for all new users |

---

## 5. UI/UX Design

### Modal Layout (Updated)

```
┌──────────────────────────────────────┐
│  [X]                                 │
│                                      │
│  🍊 Create Peel account to continue  │
│  Get 25,000 free tokens...           │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  [G] Continue with Google    │    │  ← NEW: Primary action
│  └──────────────────────────────┘    │
│                                      │
│  ───────────── or ──────────────     │  ← NEW: Divider
│                                      │
│  Email address                       │
│  ┌──────────────────────────────┐    │
│  │ your@email.com               │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │    Send magic link           │    │
│  └──────────────────────────────┘    │
│                                      │
│  No password needed...               │
└──────────────────────────────────────┘
```

### Design Decisions

1. **Google button first**: Users with magic link issues will see the alternative immediately
2. **Standard Google branding**: Use official Google colors for trust and recognition
3. **"or" divider**: Clear visual separation between auth methods
4. **Both options always visible**: Don't hide magic link, some users prefer it

---

## 6. Testing Plan

### Manual Testing Checklist

- [ ] **New user via Google**: Creates account, gets 25,000 tokens
- [ ] **Existing user via Google**: Signs in, sees existing tokens/history
- [ ] **Google → Magic link**: User who signed up with Google can also use magic link (same email)
- [ ] **Magic link → Google**: User who signed up with magic link can also use Google (same email)
- [ ] **Cancel Google flow**: User closes Google popup, returns to modal gracefully
- [ ] **Error handling**: Invalid/expired OAuth shows user-friendly error
- [ ] **Mobile**: Google auth works on iOS/Android browsers
- [ ] **Dark mode**: Button looks correct in dark mode

### Edge Cases

- [ ] User denies Google permission → graceful error message
- [ ] User has multiple Google accounts → can pick which one
- [ ] Netlify preview deploys → test with preview URL in redirect list

---

## 7. Rollout Plan

### Phase 1: Development (Local)
1. Set up Google Cloud Console OAuth credentials (dev/localhost)
2. Configure Supabase Google provider (dev)
3. Implement AuthModal changes
4. Test locally with `netlify dev`

### Phase 2: Staging
1. Add production domain to Google Cloud Console
2. Update Supabase redirect URLs for production
3. Deploy to Netlify preview
4. Internal testing

### Phase 3: Production
1. Merge to main
2. Monitor auth logs for any issues
3. Optionally update modal copy to highlight Google option

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Google auth usage | >30% of sign-ins within 2 weeks |
| Auth completion rate | Increase from current baseline |
| Support requests about magic links | Decrease |
| Time from modal open to signed in | <10 seconds for Google path |

---

## 9. Future Enhancements (Out of Scope)

1. **Add more OAuth providers**: Apple, GitHub, Microsoft
2. **Account linking**: Let users connect multiple auth methods to one account
3. **Remember sign-in preference**: Default to user's last-used method
4. **Google One Tap**: Instant sign-in without clicking button

---

## 10. References

- [Supabase Google Auth Docs](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase signInWithOAuth API](https://supabase.com/docs/reference/javascript/auth-signinwithoauth)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Next.js Supabase Google Login Guide](https://engineering.teknasyon.com/next-js-with-supabase-google-login-step-by-step-guide-088ef06e0501)

---

## Appendix: Current Auth Flow Reference

### Files Involved
- `src/components/AuthModal.tsx` - Login UI (MODIFY)
- `src/contexts/AuthContext.tsx` - Session management (NO CHANGE)
- `src/lib/supabase.ts` - Supabase client (NO CHANGE)
- `src/App.tsx` - Callback URL handling (NO CHANGE)
- `src/lib/auth-tracking.ts` - Analytics (OPTIONAL)

### How OAuth Callback Works

1. User clicks "Continue with Google"
2. `signInWithOAuth({ provider: 'google' })` redirects to Google
3. User authenticates with Google
4. Google redirects to Supabase callback: `https://xxx.supabase.co/auth/v1/callback`
5. Supabase exchanges code for tokens
6. Supabase redirects to our app: `https://our-app.com/#access_token=xxx`
7. Our Supabase client (with `detectSessionInUrl: true`) parses the token
8. `onAuthStateChange` fires with `SIGNED_IN` event
9. `AuthContext` sets user/session state
10. If new user: database trigger creates profile with 25,000 tokens

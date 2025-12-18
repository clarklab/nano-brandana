# Supabase Auth + Usage Tracking Research for nano-brandana

> **Goal**: Simple magic link auth, track users & token usage, start with 100k free tokens, no payments.

## Executive Summary

Supabase is an **excellent fit** for this use case. Magic link auth is built-in, database is included, and there's a pre-built Auth UI component. This is genuinely simple - **~1 day of work**.

**The "login gate on first batch" flow is straightforward**: Check for session before `handleRunBatch`, show auth modal if not logged in.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Auth Modal  │    │   App.tsx    │    │ Token Display │  │
│  │ (Supabase UI)│    │  (gate here) │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                    │          │
│         └───────────────────┼────────────────────┘          │
│                             │                               │
│                    supabaseClient                           │
└─────────────────────────────┼───────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────┐
│              Netlify Function (process-image)                │
│                             │                               │
│   1. Verify user session    │                               │
│   2. Check token balance    │                               │
│   3. Process image          │                               │
│   4. Deduct tokens used     │                               │
│   5. Update last_login      │                               │
└─────────────────────────────┼───────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────┐
│                    Supabase                                  │
│  ┌──────────────┐    ┌──────────────┐                       │
│  │   Auth       │    │   Database   │                       │
│  │ (magic link) │    │  (profiles)  │                       │
│  └──────────────┘    └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Breakdown

### 1. Supabase Project Setup

**Effort: 1** | **Risk: 1**

Dashboard clicks only - no code:

1. Create project at [supabase.com](https://supabase.com)
2. Go to **Authentication → Providers → Email**
3. Enable "Email" provider
4. Enable "Confirm email" (for magic links)
5. Optionally customize email template
6. Copy your `Project URL` and `anon key` from Settings → API

**Keys needed:**
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...  # For server-side only
```

---

### 2. Database Schema (profiles table)

**Effort: 1** | **Risk: 1**

Run this SQL in Supabase SQL Editor:

```sql
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  tokens_remaining INTEGER DEFAULT 100000,  -- Start with 100k
  tokens_used INTEGER DEFAULT 0,
  last_login TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile (for last_login)
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Service role can do everything (for token deduction)
-- (No policy needed - service key bypasses RLS)

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, tokens_remaining, tokens_used)
  VALUES (NEW.id, NEW.email, 100000, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper function for atomic token deduction
CREATE OR REPLACE FUNCTION public.deduct_tokens(user_id UUID, amount INTEGER)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER) AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  -- Get current balance with row lock
  SELECT tokens_remaining INTO current_balance
  FROM public.profiles
  WHERE id = user_id
  FOR UPDATE;

  IF current_balance >= amount THEN
    UPDATE public.profiles
    SET tokens_remaining = tokens_remaining - amount,
        tokens_used = tokens_used + amount,
        last_login = NOW()
    WHERE id = user_id;

    RETURN QUERY SELECT TRUE, current_balance - amount;
  ELSE
    RETURN QUERY SELECT FALSE, current_balance;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### 3. Install Packages

**Effort: 1** | **Risk: 1**

```bash
npm install @supabase/supabase-js @supabase/auth-ui-react @supabase/auth-ui-shared
```

**Note on Auth UI**: The `@supabase/auth-ui-react` package is community-maintained (not actively maintained by Supabase team as of Feb 2024), but it still works well and saves significant UI work. Alternative: Build a simple email input form yourself (~20 lines).

---

### 4. Supabase Client Setup

**Effort: 1** | **Risk: 1**

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type for our profile
export interface Profile {
  id: string;
  email: string;
  tokens_remaining: number;
  tokens_used: number;
  last_login: string;
}
```

---

### 5. Auth Context Provider

**Effort: 2** | **Risk: 2**

Create `src/contexts/AuthContext.tsx`:

```typescript
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, Profile } from '../lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
```

---

### 6. Auth Modal Component

**Effort: 2** | **Risk: 1**

Create `src/components/AuthModal.tsx`:

```typescript
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white border-2 border-black p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">SIGN IN TO CONTINUE</h2>
          <button onClick={onClose} className="text-2xl leading-none">&times;</button>
        </div>

        <p className="text-sm mb-4">
          Sign in with your email to get <strong>100,000 free tokens</strong> for image generation.
        </p>

        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#CCFF00',
                  brandAccent: '#b8e600',
                }
              }
            },
            className: {
              button: 'font-mono',
              input: 'font-mono',
            }
          }}
          providers={[]}  // No social providers, just email
          view="magic_link"
          showLinks={false}
          redirectTo={window.location.origin}
        />

        <p className="text-xs text-center mt-4 text-gray-500">
          We'll send you a magic link - no password needed!
        </p>
      </div>
    </div>
  );
}
```

**Even simpler alternative** (no Auth UI package):

```typescript
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function AuthModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Check your email for the magic link!');
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white border-2 border-black p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-bold mb-4">SIGN IN</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full border-2 border-black p-2 mb-4 font-mono"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-neon border-2 border-black p-2 font-bold"
          >
            {loading ? 'SENDING...' : 'SEND MAGIC LINK'}
          </button>
        </form>
        {message && <p className="mt-4 text-sm text-center">{message}</p>}
      </div>
    </div>
  );
}
```

---

### 7. Integrate Auth Gate into App.tsx

**Effort: 2** | **Risk: 3**

Key changes to `App.tsx`:

```typescript
// Add imports
import { useAuth } from './contexts/AuthContext';
import { AuthModal } from './components/AuthModal';

function App() {
  // Add auth state
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Modify handleRunBatch to require auth
  const handleRunBatch = useCallback((imageSize: '1K' | '2K' | '4K' = '1K') => {
    // AUTH GATE: Check if user is logged in
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    // Check if user has enough tokens (rough estimate: ~1000 tokens per image)
    const estimatedTokens = inputs.length * 1500;
    if (profile && profile.tokens_remaining < estimatedTokens) {
      alert(`Not enough tokens! You have ${profile.tokens_remaining.toLocaleString()} tokens remaining.`);
      return;
    }

    // ... rest of existing handleRunBatch logic
  }, [inputs, instructions, batchProcessor, processingMode, user, profile]);

  // Add token display in header
  return (
    <div>
      <header>
        {/* Existing header content */}

        {/* Add user info / login button */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div className="text-xs">
                <div>{profile?.email}</div>
                <div className="text-neon font-bold">
                  {profile?.tokens_remaining?.toLocaleString() || 0} tokens
                </div>
              </div>
              <button onClick={signOut} className="text-xs border border-black px-2 py-1">
                LOGOUT
              </button>
            </>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="text-xs border border-black px-2 py-1 hover:bg-neon"
            >
              SIGN IN
            </button>
          )}
        </div>
      </header>

      {/* Add AuthModal */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}
```

---

### 8. Server-Side Token Verification & Deduction

**Effort: 3** | **Risk: 3**

Modify `netlify/functions/process-image.js`:

```javascript
const { createClient } = require('@supabase/supabase-js');

// Create server-side Supabase client with service key
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  // ... existing validation code ...

  // NEW: Get user from Authorization header
  const authHeader = event.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Authentication required' }),
    };
  }

  const token = authHeader.replace('Bearer ', '');

  // Verify the user's session
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid session' }),
    };
  }

  // Check token balance BEFORE processing
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tokens_remaining')
    .eq('id', user.id)
    .single();

  if (!profile || profile.tokens_remaining < 1000) {
    return {
      statusCode: 402,
      body: JSON.stringify({
        error: 'Insufficient tokens',
        tokens_remaining: profile?.tokens_remaining || 0
      }),
    };
  }

  // ... existing AI Gateway call ...

  // AFTER successful generation, deduct tokens
  const tokensUsed = result.usage?.total_tokens || 1500; // Fallback estimate

  const { data: deductResult } = await supabaseAdmin
    .rpc('deduct_tokens', {
      user_id: user.id,
      amount: tokensUsed
    });

  // Include new balance in response
  return {
    statusCode: 200,
    body: JSON.stringify({
      images: generatedImages,
      usage: result.usage,
      tokens_remaining: deductResult?.[0]?.new_balance,
      // ... rest of response
    }),
  };
};
```

---

### 9. Update API Client to Include Auth Token

**Effort: 2** | **Risk: 2**

Modify `src/lib/api.ts`:

```typescript
import { supabase } from './supabase';

export async function processImage(options: ProcessImageOptions) {
  // Get current session token
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch('/.netlify/functions/process-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Include auth token
      ...(session?.access_token && {
        'Authorization': `Bearer ${session.access_token}`
      }),
    },
    body: JSON.stringify(options),
  });

  // ... rest of existing code
}
```

---

### 10. Wrap App with AuthProvider

**Effort: 1** | **Risk: 1**

Update `src/main.tsx`:

```typescript
import { AuthProvider } from './contexts/AuthContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
```

---

## Summary: Effort & Risk Ratings

| Component | Effort (1-5) | Risk (1-5) | Notes |
|-----------|--------------|------------|-------|
| Supabase project setup | 1 | 1 | Just clicking in dashboard |
| Database schema (SQL) | 1 | 1 | Copy-paste SQL |
| Install packages | 1 | 1 | Just npm install |
| Supabase client setup | 1 | 1 | ~15 lines |
| Auth context provider | 2 | 2 | React context pattern |
| Auth modal component | 2 | 1 | Uses pre-built Auth UI |
| Auth gate in App.tsx | 2 | 3 | Modifies core component |
| Server-side auth verification | 3 | 3 | Adds complexity to API |
| API client auth headers | 2 | 2 | Modify existing fetch calls |
| Wrap app with provider | 1 | 1 | One line change |
| **TOTAL** | **16/50** | **16/50** | |

**Overall Assessment:**
- **Effort**: Low-Medium (~1 day of work)
- **Risk**: Low-Medium (mostly additive, auth gate is the riskiest)
- **Complexity**: Very manageable

---

## Environment Variables Needed

```bash
# Frontend (prefix with VITE_ for Vite)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# Backend (Netlify Functions)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...  # SECRET - server only!
```

---

## Does Supabase Offer a Modal/Library?

**Yes!** The `@supabase/auth-ui-react` package provides:

- Pre-built `<Auth>` component
- Magic link view built-in (`view="magic_link"`)
- Customizable themes (ThemeSupa, etc.)
- Works with your existing Supabase client

**Caveat**: The package is community-maintained (not actively maintained by Supabase team since Feb 2024), but it works and is widely used.

**Alternative**: The new Supabase UI Library (2025) at [supabase.com/ui](https://supabase.com/ui) has auth forms built on shadcn/ui, but requires more setup.

**Simplest option**: Roll your own 20-line email form (shown in section 6 alternative).

---

## The "Login Gate" Flow

```
User clicks "RUN BATCH/JOB"
         │
         ▼
    Is user logged in?
         │
    ┌────┴────┐
    │ NO      │ YES
    ▼         ▼
Show Auth   Check tokens
Modal       │
    │       │
    │   ┌───┴───┐
    │   │ < min │ >= min
    │   ▼       ▼
    │ Show     Continue
    │ "low     processing
    │ tokens"  │
    │ alert    │
    ▼          ▼
User signs   Process images
in via       │
magic link   │
    │        │
    ▼        ▼
Redirect    Deduct tokens
back to     server-side
app         │
    │        │
    ▼        ▼
Profile     Update balance
created     in UI
(100k       │
tokens)     Done!
```

---

## Important Considerations

### Email Rate Limits
Supabase's built-in email is rate-limited to **3 emails/hour** per project (on free tier). For production, consider:
- Upgrade to Pro plan
- Use custom SMTP (Resend, Postmark, SendGrid)

### Magic Link Gotchas
- Links expire after 1 hour (configurable)
- Some email clients pre-fetch links (security scanners), which can invalidate them
- Consider offering OTP code as fallback

### Token Deduction Timing
We deduct tokens **after** successful generation (not before). This means:
- Users won't be charged for failed generations
- There's a small window where balance could go negative if multiple requests race
- The `deduct_tokens` function handles this atomically

### Session Persistence
Supabase sessions are stored in localStorage by default. Users stay logged in across browser sessions until they sign out or token expires.

---

## What You Get

✅ Magic link auth (no passwords)
✅ 100k free tokens on signup
✅ Token balance displayed in header
✅ Token deduction per generation
✅ Last login tracking
✅ Protected API endpoints
✅ Pre-built auth UI modal
✅ Session persistence
✅ User profile storage

---

## What You Don't Get (Out of Scope)

❌ Payment integration (see POLAR_INTEGRATION_RESEARCH.md)
❌ Token purchase flow
❌ Admin dashboard
❌ Usage analytics beyond basic counts

---

## Recommended Implementation Order

1. **Supabase setup** (10 min)
   - Create project, enable email auth

2. **Database schema** (5 min)
   - Run SQL in dashboard

3. **Frontend auth** (2-3 hours)
   - Install packages
   - Create AuthContext
   - Create AuthModal
   - Add login button to header
   - Add auth gate to handleRunBatch

4. **Backend auth** (1-2 hours)
   - Add Supabase client to process-image
   - Verify session
   - Check/deduct tokens

5. **Testing** (1 hour)
   - Test signup flow
   - Test token deduction
   - Test edge cases (no tokens, expired session)

**Total: ~1 day**

---

## Sources

- [Supabase React Quickstart](https://supabase.com/docs/guides/auth/quickstarts/react)
- [Magic Link Authentication](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [signInWithOtp API Reference](https://supabase.com/docs/reference/javascript/auth-signinwithotp)
- [Auth UI Package](https://www.npmjs.com/package/@supabase/auth-ui-react)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [User Management / Triggers](https://supabase.com/docs/guides/auth/managing-user-data)
- [onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [Service Role Key Usage](https://supabase.com/docs/guides/troubleshooting/performing-administration-tasks-on-the-server-side-with-the-servicerole-secret-BYM4Fa)
- [Netlify + Supabase Integration](https://docs.netlify.com/extend/install-and-use/setup-guides/supabase-integration/)
- [Atomic Increment/Decrement](https://github.com/orgs/supabase/discussions/909)

# Quick Setup: Supabase Auth for nano.wims.vc

## 🎯 Your Exact Settings

### Supabase Dashboard → Authentication → URL Configuration

```
Site URL:
https://nano.wims.vc

Redirect URLs (click "Add URL" for each):
https://nano.wims.vc
https://nano.wims.vc/**
http://localhost:8889
http://localhost:8889/**
```

---

## ⚡ Quick Verification Checklist

### In Supabase Dashboard:

1. **Authentication → URL Configuration**
   - [ ] Site URL = `https://nano.wims.vc`
   - [ ] Redirect URLs include `https://nano.wims.vc/**`

2. **Authentication → Providers → Email**
   - [ ] Enable Email provider = ON
   - [ ] Confirm email = ON

3. **Settings → API**
   - [ ] Copy Project URL (starts with `https://`)
   - [ ] Copy anon public key (starts with `eyJ`)

### In Netlify Dashboard (nano.wims.vc site):

**Site configuration → Environment variables:**

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
```

- [ ] All 4 variables are set
- [ ] Values copied from Supabase → Settings → API
- [ ] Secret scanning disabled or whitelisted for VITE_* vars

---

## 🧪 Test After Deploy

1. Go to `https://nano.wims.vc`
2. Click SIGN IN
3. Enter your email
4. Check email for magic link
5. Click link → should redirect to `https://nano.wims.vc/#access_token=...`
6. Should be logged in automatically
7. Open console → run `window.debugAuth()`
8. Should show: `Session exists: true`
9. Close browser completely
10. Reopen → go to `https://nano.wims.vc`
11. Run `window.debugAuth()` again
12. ✅ Session should STILL exist (persistence working!)

---

## 🔍 Debug Command

After the fixes are deployed, open browser console on `https://nano.wims.vc`:

```javascript
window.debugAuth()
```

Should show:
```
🔍 Auth Debug Info
Session exists: true
User ID: <your-user-id>
User email: <your-email>
Session expires: <timestamp in future>
Auth localStorage keys: ['peel-auth-token']
Total storage size: <size> KB
✅ No issues detected
```

---

## 🚨 Common Issues

### "Invalid redirect URL" error after clicking magic link

**Cause:** `https://nano.wims.vc/**` not in Supabase Redirect URLs

**Fix:**
1. Supabase Dashboard → Authentication → URL Configuration
2. Under "Redirect URLs", click "Add URL"
3. Add: `https://nano.wims.vc/**` (note the `/**` wildcard!)
4. Click Save
5. Request new magic link

### Session doesn't persist after browser restart

**Cause:** PKCE flow not enabled or localStorage being cleared

**Fix:**
✅ Already fixed in code with `flowType: 'pkce'`
- Deploy the latest changes
- Test with `window.debugAuth()` to verify session exists after restart

### "Email rate limit exceeded"

**Cause:** Supabase free tier = 3 emails/hour

**Fix:**
- Wait 1 hour between login attempts
- Or upgrade to Supabase Pro
- Or configure custom SMTP

---

## 📞 Support

If issues persist after:
1. ✅ Verifying all settings above
2. ✅ Deploying latest code changes
3. ✅ Testing in incognito mode

Share the output of `window.debugAuth()` for diagnosis.

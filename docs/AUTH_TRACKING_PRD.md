# Magic Link Auth Tracking - Product Requirements Document

## Problem Statement

Users report magic email links failing, but we have no visibility into WHERE in the flow failures occur. Currently, we can only see successful authentications (users with tokens in the database). We cannot diagnose:

1. Did the magic link request reach Supabase?
2. Did the email get sent via Resend?
3. Did the email get delivered?
4. Did the user click the link?
5. Did the token validation fail?
6. Did the session creation fail?

## Goals

1. **Track every step** of the magic link authentication flow
2. **Enable quick diagnosis** without diving into multiple external dashboards
3. **Identify failure patterns** (timing, email domains, geographic regions, etc.)
4. **Minimal implementation** - ship quickly, iterate later

## Non-Goals (v1)

- Real-time alerting
- Automated retry mechanisms
- User-facing error recovery UI
- Integration with external monitoring tools (DataDog, etc.)

---

## Architecture

### Data Flow

```
User submits email
       ↓
[1] LOG: magic_link_requested (client → Supabase)
       ↓
Supabase Auth → Resend SMTP
       ↓
[2] LOG: email_sent (via Supabase auth.email_sent webhook - optional/future)
       ↓
User clicks link → Redirected to app
       ↓
[3] LOG: callback_received (client detects token in URL)
       ↓
Supabase validates token
       ↓
[4] LOG: auth_completed OR auth_failed (client → Supabase)
       ↓
Session created
       ↓
[5] LOG: session_established (client confirms working session)
```

### Database Schema

**Table: `auth_events`**

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| created_at | TIMESTAMP | When event occurred |
| event_type | TEXT | Event type (see below) |
| email_hash | TEXT | SHA-256 hash of email (for privacy) |
| email_domain | TEXT | Domain portion of email (for pattern analysis) |
| session_id | TEXT | Anonymous session ID to correlate events |
| user_agent | TEXT | Browser/device info |
| error_code | TEXT | Error code if applicable |
| error_message | TEXT | Error details |
| metadata | JSONB | Additional context (timing, etc.) |

**Event Types:**
- `magic_link_requested` - User submitted email for magic link
- `callback_received` - App detected auth callback in URL
- `callback_error` - Auth callback had error params
- `auth_completed` - Supabase session successfully established
- `auth_failed` - Supabase session failed to establish
- `session_timeout` - Session establishment timed out
- `token_refresh_failed` - Token refresh failed (for ongoing issues)

### Privacy Considerations

- **Email hashing**: Store SHA-256 hash, not plaintext emails
- **Email domain**: Store domain separately for pattern analysis (e.g., "all Gmail users failing")
- **Session ID**: Use anonymous ID, not Supabase user ID (for pre-auth events)
- **Retention**: Auto-delete events older than 30 days

---

## Implementation Plan

### Phase 1: Basic Tracking (This PR)

1. **Create `auth_events` table** with RLS disabled (service role only)
2. **Create Netlify function** `log-auth-event.js` to insert events
3. **Add client-side tracking**:
   - On magic link request → log `magic_link_requested`
   - On callback URL detected → log `callback_received` or `callback_error`
   - On session established → log `auth_completed`
   - On session timeout → log `session_timeout`
4. **SQL queries** for analysis (documented in this file)

### Phase 2: Dashboard (Future)

1. Simple React component showing:
   - Success rate by day
   - Failure breakdown by event type
   - Failure breakdown by email domain
   - Average time between request → completion
2. Admin-only access (check for specific user IDs or email domains)

### Phase 3: Alerting (Future)

1. Webhook to Slack on spike in failures
2. Daily digest email of auth health

---

## SQL Queries for Analysis

### Overall Success Rate (Last 24 Hours)

```sql
WITH requests AS (
  SELECT COUNT(*) as total
  FROM auth_events
  WHERE event_type = 'magic_link_requested'
    AND created_at > NOW() - INTERVAL '24 hours'
),
completions AS (
  SELECT COUNT(*) as total
  FROM auth_events
  WHERE event_type = 'auth_completed'
    AND created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  requests.total as requests,
  completions.total as completions,
  ROUND(completions.total::numeric / NULLIF(requests.total, 0) * 100, 2) as success_rate
FROM requests, completions;
```

### Failure Breakdown

```sql
SELECT
  event_type,
  error_code,
  error_message,
  COUNT(*) as count
FROM auth_events
WHERE event_type IN ('callback_error', 'auth_failed', 'session_timeout')
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY event_type, error_code, error_message
ORDER BY count DESC;
```

### Failures by Email Domain

```sql
SELECT
  email_domain,
  COUNT(*) as failures
FROM auth_events
WHERE event_type IN ('callback_error', 'auth_failed', 'session_timeout')
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY email_domain
ORDER BY failures DESC
LIMIT 20;
```

### Funnel Analysis (Last 7 Days)

```sql
SELECT
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) FILTER (WHERE event_type = 'magic_link_requested') as link_requests,
  COUNT(*) FILTER (WHERE event_type = 'callback_received') as callbacks,
  COUNT(*) FILTER (WHERE event_type = 'callback_error') as callback_errors,
  COUNT(*) FILTER (WHERE event_type = 'auth_completed') as completed,
  COUNT(*) FILTER (WHERE event_type = 'auth_failed') as failed,
  COUNT(*) FILTER (WHERE event_type = 'session_timeout') as timeouts
FROM auth_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;
```

### Time to Complete (Successful Flows)

```sql
WITH flows AS (
  SELECT
    session_id,
    MIN(created_at) FILTER (WHERE event_type = 'magic_link_requested') as requested_at,
    MIN(created_at) FILTER (WHERE event_type = 'auth_completed') as completed_at
  FROM auth_events
  WHERE session_id IS NOT NULL
    AND created_at > NOW() - INTERVAL '7 days'
  GROUP BY session_id
  HAVING MIN(created_at) FILTER (WHERE event_type = 'magic_link_requested') IS NOT NULL
     AND MIN(created_at) FILTER (WHERE event_type = 'auth_completed') IS NOT NULL
)
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - requested_at))) as median_seconds,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - requested_at))) as p90_seconds,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - requested_at))) as p99_seconds
FROM flows;
```

### Stuck Flows (Requested but Never Completed)

```sql
WITH requests AS (
  SELECT DISTINCT session_id, email_domain, created_at
  FROM auth_events
  WHERE event_type = 'magic_link_requested'
    AND created_at > NOW() - INTERVAL '24 hours'
),
completions AS (
  SELECT DISTINCT session_id
  FROM auth_events
  WHERE event_type = 'auth_completed'
    AND created_at > NOW() - INTERVAL '24 hours'
)
SELECT
  r.email_domain,
  COUNT(*) as stuck_count,
  MIN(r.created_at) as oldest
FROM requests r
LEFT JOIN completions c ON r.session_id = c.session_id
WHERE c.session_id IS NULL
GROUP BY r.email_domain
ORDER BY stuck_count DESC;
```

---

## Potential Root Causes to Investigate

Based on the tracking data, here are common issues:

### 1. Email Delivery Issues
**Symptom**: High `magic_link_requested`, low `callback_received`
**Causes**:
- Resend SMTP rate limits
- Supabase email queue delays
- Spam filtering (especially corporate email)
- Invalid email addresses

**Check**:
- Resend dashboard for delivery rates
- Supabase auth logs for email sends
- `email_domain` breakdown for patterns

### 2. Link Expiration
**Symptom**: `callback_error` with `otp_expired` error code
**Causes**:
- User waited too long to click (>1 hour)
- Email delayed in delivery

**Check**:
- Time between request and callback
- Increase OTP expiration in Supabase (max 1 week)

### 3. Redirect URL Issues
**Symptom**: User never returns to app after clicking link
**Causes**:
- Missing redirect URL in Supabase config
- User on different device than email opened
- Browser blocking redirect

**Check**:
- Supabase redirect URLs config
- User agent analysis

### 4. PKCE/Session Issues
**Symptom**: `callback_received` but `auth_failed`
**Causes**:
- PKCE verifier lost (different browser tab)
- localStorage cleared between request and callback
- Corrupted session state

**Check**:
- Error messages in `auth_failed` events
- Browser/device patterns

### 5. Supabase Rate Limits
**Symptom**: Spike in failures at specific times
**Causes**:
- Free tier: 3 emails/hour/user
- Paid tier: Check your plan limits

**Check**:
- Supabase dashboard rate limit metrics
- Time-based patterns in failures

---

## Success Metrics

After implementing tracking:

1. **Visibility**: Can identify failure type within 5 minutes
2. **Debugging**: Can correlate failed auth to specific session
3. **Patterns**: Can identify if failures are domain/device specific
4. **Baseline**: Know our actual success rate (target: >95%)

---

## Appendix: Quick Diagnosis Checklist

When a user reports magic link not working:

1. Get their email address (or have them check their email domain)
2. Get approximate time they tried
3. Run: `SELECT * FROM auth_events WHERE email_domain = 'gmail.com' AND created_at > NOW() - INTERVAL '1 hour' ORDER BY created_at DESC;`
4. Look for the flow:
   - If no `magic_link_requested` → Request never reached backend
   - If only `magic_link_requested` → Email not delivered or not clicked
   - If `callback_error` → Token issue (check error_code)
   - If `auth_failed` → Session establishment issue
5. Check Resend dashboard for delivery status
6. Check Supabase auth logs for that email

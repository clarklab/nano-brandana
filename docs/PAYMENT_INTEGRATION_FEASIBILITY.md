# Payment Integration Feasibility Analysis
## Polar vs Stripe for Token Purchases

**Date:** December 25, 2025
**Purpose:** Evaluate feasibility of adding one-time token purchase functionality
**Goal:** Simplest possible implementation - no subscriptions, just buy-as-needed tokens

---

## Executive Summary

**Recommendation:** Either platform is feasible, but **Stripe** is recommended for initial implementation due to better ecosystem maturity and documentation.

**Complexity:** ⭐⭐⭐ Medium (3-5 days of focused development)

**Key Insight:** Your existing Supabase architecture is **payment-ready** - you already have:
- ✅ Robust token accounting system (`profiles.tokens_remaining`, `profiles.tokens_used`)
- ✅ Atomic token operations (`deduct_tokens` RPC with row-level locking)
- ✅ Complete audit trail (`job_logs` table with before/after balances)
- ✅ Netlify Functions backend for serverless webhook handlers
- ✅ User authentication via Supabase Auth

**What's Missing:** Only the payment gateway integration (checkout flow + webhook handler to add tokens).

---

## Current State Analysis

### Token System Architecture (Already Built)

Your current implementation provides an excellent foundation:

1. **User Profiles** (`public.profiles`)
   - Each user has `tokens_remaining` (default: 100,000 on signup)
   - Tracks cumulative `tokens_used`
   - RLS policies ensure data security

2. **Atomic Token Deduction** (`deduct_tokens` function)
   - Uses PostgreSQL row-level locking to prevent race conditions
   - Gracefully handles insufficient balance
   - Returns new balance after deduction
   - Called from `process-image.js` (lines 345-367)

3. **Comprehensive Audit Trail** (`job_logs`)
   - Records every image processing request
   - Captures `token_balance_before` and `token_balance_after`
   - Tracks `tokens_charged` per job
   - Enables complete transaction history

4. **Client-Side Balance Display**
   - Real-time token balance in header (`AccountModal.tsx`)
   - Per-job token consumption in account history
   - Cost estimates before batch processing

### What You DON'T Have Yet

- ❌ Payment gateway integration (Stripe/Polar SDK)
- ❌ Token purchase products/pricing in payment provider
- ❌ Checkout flow (client-side redirect to payment page)
- ❌ Webhook handler to credit tokens after successful payment
- ❌ Purchase history table in database
- ❌ "Buy Tokens" UI in the app

---

## Platform Comparison: Polar vs Stripe

### Polar

**Overview:** [Modern open-source billing infrastructure](https://polar.sh/) designed for developers, launched recently as an alternative to traditional payment processors.

**Strengths:**
- ✅ Developer-first API design (clean, modern)
- ✅ Open-source core (can self-host if needed)
- ✅ Built-in support for one-time purchases and subscriptions
- ✅ Webhook system with `onOrderPaid` event
- ✅ Simpler fee structure (competitive with Stripe)
- ✅ Purpose-built for digital products (tokens, credits, licenses)

**Weaknesses:**
- ⚠️ Newer platform (less battle-tested than Stripe)
- ⚠️ Smaller ecosystem (fewer integrations, examples, Stack Overflow answers)
- ⚠️ Limited third-party tooling (some integrations still subscription-focused)
- ⚠️ Less mature fraud detection
- ⚠️ Smaller payment method support compared to Stripe

**Best For:**
- Teams comfortable with newer technology
- Projects that may eventually need subscription features
- Developers who value open-source philosophy

**References:**
- [Polar Integration Guide for Next.js](https://medium.com/@paudelronish/how-to-integrate-polar-payments-for-subscriptions-and-one-time-payments-in-next-js-fc79da765379)
- [Polar Webhook Documentation](https://polar.sh/docs/integrate/webhooks/endpoints)
- [Better Auth Polar Plugin](https://www.better-auth.com/docs/plugins/polar)

---

### Stripe

**Overview:** [Industry-standard payment infrastructure](https://stripe.com/payments/checkout) with 15+ years of maturity and global scale.

**Strengths:**
- ✅ Extremely well-documented with extensive examples
- ✅ Battle-tested at massive scale (used by Shopify, Amazon, Google, etc.)
- ✅ Excellent fraud protection (Radar included)
- ✅ Supports 135+ currencies, 40+ payment methods
- ✅ Rich ecosystem (libraries, tutorials, community support)
- ✅ [Official sample code](https://github.com/stripe-samples/checkout-one-time-payments) for one-time checkout
- ✅ Mature webhook system with automatic retry logic
- ✅ Comprehensive test mode with realistic test cards

**Weaknesses:**
- ⚠️ More complex API surface (because it supports everything)
- ⚠️ Higher pricing (2.9% + 30¢ per transaction vs Polar's competitive rates)
- ⚠️ Subscription-heavy documentation (requires filtering for one-time use cases)

**Best For:**
- Production SaaS applications requiring reliability
- Teams prioritizing mature tooling and support
- Projects needing global payment methods
- Businesses requiring detailed financial reporting

**References:**
- [Stripe Checkout Documentation](https://docs.stripe.com/payments/checkout)
- [One-Time Payment Samples](https://github.com/stripe-samples/checkout-one-time-payments)
- [How Checkout Works](https://docs.stripe.com/payments/checkout/how-checkout-works)

---

## Recommended Implementation: Simplest Flow

Regardless of which provider you choose, the implementation follows the same pattern:

### 1. Product Setup (in Payment Provider Dashboard)

Create token packages as products:
- **Starter Pack:** 50,000 tokens → $5
- **Pro Pack:** 200,000 tokens → $15
- **Enterprise Pack:** 1,000,000 tokens → $60

Each product has a price ID you'll reference in code.

### 2. Client-Side Checkout Flow

**Add "Buy Tokens" Button** (in `AccountModal.tsx` or new `PricingModal.tsx`)

User flow:
1. User clicks "Buy Tokens"
2. Selects a token package
3. Client calls new Netlify Function: `/.netlify/functions/create-checkout`
4. Function creates Stripe/Polar Checkout Session with:
   - Price ID
   - Success URL: `https://yourapp.com?payment=success`
   - Cancel URL: `https://yourapp.com?payment=cancelled`
   - User ID in metadata
5. Function returns checkout URL
6. Client redirects user to payment provider's hosted checkout page
7. User completes payment
8. Payment provider redirects back to your app

**Code Estimate:** ~50 lines in new component, ~30 lines in new Netlify Function

### 3. Webhook Handler (Server-Side Token Credit)

**Create New Netlify Function:** `/netlify/functions/payment-webhook.js`

This endpoint receives payment confirmation from the provider:

**Stripe:** Listen for `checkout.session.completed` event
**Polar:** Listen for `order.paid` event

Flow:
1. Verify webhook signature (critical for security!)
2. Extract user ID and token amount from metadata
3. Call new Supabase RPC function: `add_tokens(user_id, amount)`
4. Log purchase to new `token_purchases` table
5. Return 200 OK

**Code Estimate:** ~80 lines including signature verification and error handling

### 4. Database Changes

**New Supabase Function:** `add_tokens`
```sql
CREATE FUNCTION public.add_tokens(p_user_id UUID, p_tokens_to_add INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE public.profiles
  SET tokens_remaining = tokens_remaining + p_tokens_to_add
  WHERE id = p_user_id
  RETURNING tokens_remaining INTO v_new_balance;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**New Table:** `token_purchases`
```sql
CREATE TABLE public.token_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_usd DECIMAL(10,2) NOT NULL,
  tokens_purchased INTEGER NOT NULL,
  payment_provider TEXT NOT NULL, -- 'stripe' or 'polar'
  provider_transaction_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_token_purchases_user_id ON public.token_purchases(user_id);
CREATE INDEX idx_token_purchases_transaction_id ON public.token_purchases(provider_transaction_id);
```

**Code Estimate:** ~40 lines SQL

### 5. Environment Variables

Add to Netlify:
```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# OR Polar
POLAR_ACCESS_TOKEN=polar_...
POLAR_WEBHOOK_SECRET=polar_whsec_...
POLAR_STARTER_PRICE_ID=price_...
```

### 6. Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "stripe": "^17.5.0" // OR "@polar-sh/sdk": "^0.x.x"
  }
}
```

---

## Implementation Complexity Breakdown

| Task | Complexity | Time Estimate |
|------|-----------|---------------|
| Set up payment provider account | Low | 30 min |
| Create token products & pricing | Low | 15 min |
| Add "Buy Tokens" UI component | Low-Medium | 2 hours |
| Implement `create-checkout` function | Medium | 2 hours |
| Implement `payment-webhook` function | Medium-High | 3 hours |
| Add `add_tokens` RPC & database migration | Low | 1 hour |
| Create `token_purchases` table | Low | 30 min |
| Test checkout flow (test mode) | Medium | 2 hours |
| Test webhook delivery & token crediting | Medium | 2 hours |
| Handle edge cases (duplicate webhooks, etc.) | Medium | 2 hours |
| Production deployment & monitoring | Low-Medium | 1 hour |

**Total Estimated Time:** 16 hours (~2-3 focused workdays)

---

## Potential Challenges & Mitigations

### 1. Webhook Reliability

**Challenge:** Webhooks can be delivered multiple times (retries) or fail entirely.

**Mitigation:**
- Use `provider_transaction_id` as idempotency key (prevent double-crediting)
- Implement webhook signature verification (required for security)
- Add retry monitoring dashboard in provider's UI
- Log all webhook attempts to database for debugging

### 2. Race Conditions

**Challenge:** User might purchase tokens while simultaneously using them.

**Mitigation:**
- Your existing `deduct_tokens` function already handles this with row-level locking
- `add_tokens` should use similar atomic operation (`UPDATE ... RETURNING`)
- PostgreSQL guarantees these operations are serializable

### 3. Testing Payment Flows

**Challenge:** Can't easily test real money flows.

**Mitigation:**
- Both Stripe and Polar have excellent test modes
- Stripe test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 9995` (decline)
- Use ngrok or Netlify dev tunnels to test webhooks locally
- Polar/Stripe have webhook event resend buttons for debugging

### 4. Pricing & Tax Compliance

**Challenge:** Do you need to collect sales tax? VAT?

**Mitigation:**
- Stripe Tax (automated): Can handle this, but adds complexity
- Polar: Less mature tax handling
- **Recommendation:** Start with simple pricing (no tax), add later if needed
- Consult tax professional for compliance (varies by jurisdiction)

### 5. Refunds & Disputes

**Challenge:** Users may request refunds or dispute charges.

**Mitigation:**
- Implement refund policy in UI/terms
- For refunds, manually deduct tokens (or automate via webhook)
- Both providers have dispute management dashboards
- Consider adding `refunded` status to `token_purchases` table

---

## Security Considerations

### Critical Requirements

1. **Webhook Signature Verification** (mandatory!)
   - Prevents attackers from spoofing payment confirmations
   - Both Stripe and Polar provide signature verification libraries
   - Reject any webhook without valid signature

2. **HTTPS Only**
   - Netlify provides this automatically
   - Payment providers require HTTPS for webhooks

3. **Service Role Key Protection**
   - Supabase service_role key must only be in Netlify Functions (server-side)
   - Never expose in client code
   - Required for `add_tokens` RPC (bypasses RLS)

4. **Amount Validation**
   - Don't trust client-provided amounts
   - Fetch token amount from your database based on price_id
   - Validate against webhook payload

5. **Rate Limiting**
   - Consider rate-limiting checkout session creation (prevent abuse)
   - Netlify Functions have built-in concurrency limits

---

## Cost Analysis

### Payment Processing Fees

**Stripe:**
- 2.9% + $0.30 per successful card transaction
- Example: $10 purchase → $0.59 fee → You receive $9.41

**Polar:**
- Competitive rates (check current pricing at polar.sh/pricing)
- Typically similar to Stripe or slightly lower

### Infrastructure Costs

- **Netlify Functions:** Free tier covers 125k requests/month
- **Supabase:** Free tier covers 500MB database (purchases table is tiny)
- **Bandwidth:** Negligible (webhooks are small payloads)

**Total Additional Monthly Cost:** $0 for small-scale, scales with usage

---

## Recommendation: Start with Stripe

### Why Stripe for Initial Launch

1. **Proven Reliability:** 15+ years of uptime, handles billions in transactions
2. **Developer Experience:** Exceptional documentation, examples, and Stack Overflow support
3. **Testing Tools:** Best-in-class test mode with realistic scenarios
4. **Future-Proof:** If you later add subscriptions, analytics, or complex billing, Stripe scales effortlessly
5. **Community Support:** Massive ecosystem means faster debugging

### Migration Path to Polar (If Desired)

Your architecture can support both:
- Abstract payment provider behind a service layer
- Store `payment_provider` field in `token_purchases` table
- Could theoretically offer both payment methods to users

---

## Next Steps (If Approved)

### Phase 1: Foundation (Day 1)
1. Create Stripe account and enable test mode
2. Create token products in Stripe dashboard
3. Add Stripe npm package
4. Set up Netlify environment variables

### Phase 2: Checkout Flow (Day 1-2)
1. Create "Buy Tokens" UI component
2. Implement `create-checkout` Netlify Function
3. Test redirect flow in browser

### Phase 3: Webhook Handler (Day 2-3)
1. Create `add_tokens` Supabase RPC function
2. Create `token_purchases` table migration
3. Implement `payment-webhook` Netlify Function
4. Test webhook delivery using Stripe CLI

### Phase 4: Testing & Polish (Day 3)
1. End-to-end test with Stripe test cards
2. Verify token crediting works
3. Handle edge cases (duplicate webhooks, failures)
4. Add loading states and success messages to UI

### Phase 5: Production (Day 3-4)
1. Switch to Stripe live mode
2. Update environment variables in Netlify
3. Deploy to production
4. Monitor first real transactions

---

## Open Questions to Resolve

1. **Token Pricing Strategy:**
   - What price per 1,000 tokens?
   - Volume discounts?
   - Current cost: ~$0.134-$0.24 per image → ~1,500 tokens
   - Suggested: 10,000 tokens = $1 (allows ~7 images per dollar)

2. **Minimum Purchase:**
   - Should there be a minimum purchase amount? (Stripe charges $0.30 flat fee)
   - Suggestion: $5 minimum to avoid most revenue going to fees

3. **Expiration Policy:**
   - Do purchased tokens expire?
   - Recommendation: No expiration (simpler, better UX)

4. **Free Tier:**
   - Keep 100k tokens on signup?
   - Or reduce free tier once payments are available?

5. **Refund Policy:**
   - Allow refunds? Time limit?
   - How to handle partially-used tokens?

---

## Conclusion

**Feasibility Rating:** ⭐⭐⭐⭐⭐ Highly Feasible

Your codebase is well-architected for payment integration. The token accounting system is production-ready, and adding payment functionality is a straightforward extension.

**Recommended Path:**
1. Start with **Stripe** for reliability and developer experience
2. Implement **simplest flow** first (3 token packages, hosted checkout, webhook credit)
3. Launch MVP within 3-5 focused workdays
4. Iterate based on user feedback (add more packages, subscriptions, etc.)

The hardest part is already done (token accounting, audit trails, user auth). The payment integration is just the final piece to monetize your existing infrastructure.

---

## Additional Resources

### Stripe Resources
- [Stripe Checkout Documentation](https://docs.stripe.com/payments/checkout)
- [One-Time Payment Sample Code](https://github.com/stripe-samples/checkout-one-time-payments)
- [How Checkout Works](https://docs.stripe.com/payments/checkout/how-checkout-works)
- [Online Payments Guide](https://docs.stripe.com/payments/online-payments)

### Polar Resources
- [Polar Official Site](https://polar.sh/)
- [Polar Documentation](https://docs.polar.sh/introduction)
- [Integration Guide for Next.js](https://medium.com/@paudelronish/how-to-integrate-polar-payments-for-subscriptions-and-one-time-payments-in-next-js-fc79da765379)
- [Polar Webhook Setup](https://polar.sh/docs/integrate/webhooks/endpoints)

### Related Tools
- [Stripe CLI](https://stripe.com/docs/stripe-cli) - Test webhooks locally
- [ngrok](https://ngrok.com/) - Tunnel for local webhook testing
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) - Already using for dev mode

---

**Document Version:** 1.0
**Last Updated:** December 25, 2025
**Author:** Claude Code
**Status:** Ready for Review

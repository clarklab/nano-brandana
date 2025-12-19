# Polar.sh Integration Research for nano-brandana

> **Goal**: Add simple AI credit purchases without subscriptions, using minimal custom code/UI.

## Executive Summary

Polar.sh can work for your use case, but with **caveats**. Their usage-based billing (meters, credits) is designed for **subscription products**, not one-time purchases. However, there's a workaround using **one-time credit packs + meter credits benefit**.

**Bottom Line**: Achievable with medium effort. Not quite "1 minute integration" for your specific use case, but still much simpler than building from scratch.

---

## Integration Options Analyzed

### Option A: One-Time Credit Packs (RECOMMENDED)

**How it works:**
1. Create products like "100 AI Credits - $10", "500 Credits - $40"
2. Attach a **Meter Credits Benefit** that grants credits to the customer's meter on purchase
3. Use Polar's **Checkout Links** (no-code!) or Checkout API
4. Check customer's meter balance before allowing generations
5. Ingest usage events to deduct credits

**Pros:**
- No subscriptions (what you want!)
- Meter Credits Benefit = no-code credit granting
- Polar handles all payment UI, tax compliance, receipts
- Customer Portal is hosted by Polar (users can see their balance/orders)

**Cons:**
- You still need backend logic to check balance before processing
- Must ingest events to Polar API for each generation
- Customer identification requires either email lookup or session management

| Aspect | Effort (1-5) | Risk to Codebase (1-5) |
|--------|--------------|------------------------|
| Polar Dashboard Setup | 1 | 1 |
| Add "Buy Credits" button/link | 1 | 1 |
| Webhook handler for purchases | 2 | 2 |
| Balance checking before generation | 3 | 3 |
| Usage event ingestion | 2 | 2 |
| Customer identification | 3 | 3 |
| **Total** | **~12 points** | **Medium** |

---

### Option B: Subscription with Metered Billing

**How it works:**
- Monthly subscription that includes base credits
- Overage charges for extra usage
- Polar handles invoicing at end of billing period

**Pros:**
- Polar's "native" usage billing approach
- Automatic invoicing for overage

**Cons:**
- **Requires subscription** (you said no subscriptions)
- More complex for users (commitment)
- Overkill for simple credit purchases

| Aspect | Effort | Risk |
|--------|--------|------|
| N/A - Not recommended | N/A | N/A |

---

## Detailed Implementation Guide (Option A)

### Step 1: Polar Dashboard Setup

**Effort: 1** | **Risk: 1**

1. Create account at [polar.sh](https://polar.sh) (or [sandbox.polar.sh](https://sandbox.polar.sh) for testing)
2. Create an Organization
3. Create a **Meter** (e.g., "ai_generations" or "image_credits")
   - Aggregation: **Count** (or Sum if you want variable credit costs)
4. Create **Products** (one-time purchases):
   - "50 AI Credits" - $5.00
   - "200 AI Credits" - $15.00
   - "500 AI Credits" - $30.00
5. For each product, add a **Meter Credits Benefit**:
   - Select your meter
   - Set credit amount (50, 200, 500)
6. Create **Checkout Links** for each product (no-code!)

**Keys/Secrets needed:**
- `POLAR_ACCESS_TOKEN` - Organization Access Token from Settings → Developers
- `POLAR_WEBHOOK_SECRET` - From webhook endpoint configuration

---

### Step 2: Add "Buy Credits" UI

**Effort: 1** | **Risk: 1**

Simply link to Polar's Checkout Links. Example:

```tsx
// Minimal UI - just links to Polar's hosted checkout
const CREDIT_PACKS = [
  { name: "50 Credits", price: "$5", url: "https://polar.sh/your-org/checkout/xxx" },
  { name: "200 Credits", price: "$15", url: "https://polar.sh/your-org/checkout/yyy" },
  { name: "500 Credits", price: "$30", url: "https://polar.sh/your-org/checkout/zzz" },
];

function BuyCredits({ userEmail }: { userEmail: string }) {
  return (
    <div>
      {CREDIT_PACKS.map(pack => (
        <a
          key={pack.name}
          href={`${pack.url}?customer_email=${encodeURIComponent(userEmail)}`}
          target="_blank"
        >
          {pack.name} - {pack.price}
        </a>
      ))}
    </div>
  );
}
```

**Note**: Passing `customer_email` prefills the checkout form and links purchases to that customer.

---

### Step 3: Customer Identification

**Effort: 3** | **Risk: 3**

This is the trickiest part. Options:

#### Option 3A: Simple Email-Based (Recommended for MVP)

Ask user for email before first generation. Store in localStorage.
- **Pro**: Dead simple, no auth system needed
- **Con**: Users could theoretically use different emails (low risk for your use case)

```tsx
// Pseudocode
const [userEmail, setUserEmail] = useState(localStorage.getItem('userEmail'));

if (!userEmail) {
  return <EmailPrompt onSubmit={(email) => {
    localStorage.setItem('userEmail', email);
    setUserEmail(email);
  }} />;
}
```

#### Option 3B: Polar Customer Session (More Secure)

Use Polar's Customer Portal authentication:
1. User enters email
2. Polar sends magic link to verify
3. User gets a session token

**More complex but prevents email spoofing.**

#### Option 3C: Full Auth (BetterAuth + Polar Plugin)

Integrate [BetterAuth](https://www.better-auth.com/docs/plugins/polar) with Polar plugin.
- Creates Polar customer automatically on signup
- Session management built-in
- **Overkill for your stated needs**

---

### Step 4: Webhook Handler for Purchases

**Effort: 2** | **Risk: 2**

Create a Netlify Function to receive purchase webhooks:

```typescript
// netlify/functions/polar-webhook.ts
import { validateEvent } from "@polar-sh/sdk/webhooks";

export async function handler(event) {
  const payload = JSON.parse(event.body);

  // Validate webhook signature
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
  // Use validateEvent() from SDK

  if (payload.type === "order.created" || payload.type === "order.paid") {
    const customerEmail = payload.data.customer.email;
    const productId = payload.data.product.id;

    // The Meter Credits Benefit already granted credits in Polar!
    // You might want to store customer info locally for faster lookups
    console.log(`Credits purchased by ${customerEmail}`);
  }

  return { statusCode: 200, body: "OK" };
}
```

**Important**: The **Meter Credits Benefit** automatically grants credits in Polar. The webhook is mainly for logging/notifications.

---

### Step 5: Check Balance Before Generation

**Effort: 3** | **Risk: 3**

Before processing an image, check if user has credits:

```typescript
// netlify/functions/process-image.ts
import { Polar } from "@polar-sh/sdk";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
});

async function checkCredits(customerEmail: string): Promise<number> {
  // Find customer by email
  const customers = await polar.customers.list({
    email: customerEmail,
    organizationId: process.env.POLAR_ORG_ID,
  });

  if (!customers.result.items.length) {
    return 0; // No customer found, no credits
  }

  const customer = customers.result.items[0];

  // Get customer's meter balance
  const state = await polar.customers.getState({
    id: customer.id,
  });

  // Find your meter in the state
  const meter = state.meters.find(m => m.slug === "ai_generations");
  return meter?.balance ?? 0;
}

export async function handler(event) {
  const { userEmail, imageData, prompt } = JSON.parse(event.body);

  const credits = await checkCredits(userEmail);
  if (credits <= 0) {
    return {
      statusCode: 402,
      body: JSON.stringify({ error: "No credits remaining", credits: 0 }),
    };
  }

  // Process the image...
  // Then deduct credit (see Step 6)
}
```

---

### Step 6: Deduct Credits on Usage

**Effort: 2** | **Risk: 2**

After successful generation, ingest a usage event:

```typescript
import { Ingestion } from "@polar-sh/ingestion";

const ingestion = Ingestion({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
});

async function deductCredit(customerEmail: string) {
  await ingestion.ingest({
    name: "ai_generations", // Must match your meter name
    externalCustomerId: customerEmail, // or use Polar customer ID
    metadata: {
      action: "image_generation",
      timestamp: new Date().toISOString(),
    },
  });
}

// In your process-image handler, after successful generation:
await deductCredit(userEmail);
```

---

### Step 7: Display Credits to User

**Effort: 2** | **Risk: 1**

Show remaining credits in your UI:

```typescript
// netlify/functions/get-credits.ts
export async function handler(event) {
  const { email } = event.queryStringParameters;
  const credits = await checkCredits(email);
  return {
    statusCode: 200,
    body: JSON.stringify({ credits }),
  };
}
```

```tsx
// Frontend
function CreditDisplay({ email }) {
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    fetch(`/.netlify/functions/get-credits?email=${email}`)
      .then(r => r.json())
      .then(d => setCredits(d.credits));
  }, [email]);

  return <div>Credits: {credits ?? "..."}</div>;
}
```

---

## Required Environment Variables

```bash
# Netlify environment variables to set
POLAR_ACCESS_TOKEN=polar_oat_xxx          # Organization Access Token
POLAR_WEBHOOK_SECRET=whsec_xxx            # Webhook signing secret
POLAR_ORG_ID=org_xxx                      # Your organization ID
POLAR_METER_SLUG=ai_generations           # Your meter's slug
```

---

## NPM Packages Required

```bash
npm install @polar-sh/sdk @polar-sh/ingestion
```

---

## Testing Strategy

1. Use [sandbox.polar.sh](https://sandbox.polar.sh) for development
2. Create separate sandbox organization and products
3. Use Stripe test card: `4242 4242 4242 4242`
4. Set SDK to sandbox mode:
   ```typescript
   const polar = new Polar({
     accessToken: process.env.POLAR_ACCESS_TOKEN,
     server: "sandbox", // Switch to "production" for live
   });
   ```

---

## Summary: Effort & Risk Ratings

| Component | Effort (1-5) | Risk (1-5) | Notes |
|-----------|--------------|------------|-------|
| Polar Dashboard Setup | 1 | 1 | Just clicking in UI |
| "Buy Credits" Links | 1 | 1 | Just anchor tags |
| Customer Email Collection | 2 | 2 | Simple form + localStorage |
| Webhook Handler | 2 | 2 | New Netlify function |
| Balance Check API | 3 | 3 | Adds dependency on Polar API |
| Usage Ingestion | 2 | 2 | API call after generation |
| Credits Display UI | 2 | 1 | Simple fetch + display |
| **TOTAL** | **13/35** | **12/35** | |

**Overall Assessment:**
- **Effort**: Medium (~2-3 days of work)
- **Risk**: Low-Medium (mostly additive, doesn't break existing flow)
- **Complexity**: More than "6 lines of code" marketing, but reasonable

---

## Alternatives Considered

### Stripe + Custom Credits DB
- **More work**: Build your own credits table, purchase webhooks, balance tracking
- **Pro**: More control, no Polar dependency
- **Con**: 10x more code, handle tax yourself

### LemonSqueezy
- Similar to Polar, MoR model
- Less developer-focused, fewer usage billing features

### Paddle
- Enterprise-focused, higher minimums
- Overkill for this use case

---

## Conclusion

Polar.sh is a **good fit** for adding credit purchases to nano-brandana:

✅ Handles payments, tax, receipts
✅ Hosted checkout (minimal UI work)
✅ Meter Credits Benefit = no-code credit granting
✅ Customer Portal for users to see their orders
✅ Sandbox environment for safe testing

⚠️ Requires backend code for balance checking
⚠️ Need customer identification strategy (email at minimum)
⚠️ Not quite "1 minute" but still ~2-3 days vs weeks

**Recommended Next Steps:**
1. Create sandbox account and test the flow manually
2. Implement email collection in frontend
3. Add balance checking to `process-image` function
4. Add usage event ingestion after successful generation
5. Test thoroughly in sandbox before going live

---

## Sources

- [Polar Credits Documentation](https://docs.polar.sh/features/usage-based-billing/credits)
- [Checkout Links](https://docs.polar.sh/features/checkout/links)
- [Customer Portal](https://docs.polar.sh/features/customer-portal)
- [Customer State API](https://docs.polar.sh/integrate/customer-state)
- [Meter Credits Benefit Guide](https://polar.sh/docs/guides/grant-meter-credits-after-purchase)
- [Event Ingestion](https://polar.sh/docs/features/usage-based-billing/event-ingestion)
- [Sandbox Environment](https://docs.polar.sh/developers/sandbox)
- [TypeScript SDK](https://www.npmjs.com/package/@polar-sh/sdk)
- [Ingestion Package](https://www.npmjs.com/package/@polar-sh/ingestion)
- [Products Documentation](https://docs.polar.sh/features/products)
- [Webhook Events](https://polar.sh/docs/integrate/webhooks/events)
- [Better Auth Plugin](https://www.better-auth.com/docs/plugins/polar)

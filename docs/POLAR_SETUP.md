# Polar Payment Integration Setup Guide

This guide provides **step-by-step idiot-proof instructions** for setting up Polar payment integration to enable token purchases in Nano Brandana.

---

## Prerequisites

- [x] Netlify account with this project deployed
- [x] Supabase project already set up (you have this)
- [x] Access to your Netlify environment variables
- [ ] Polar account (we'll create this below)

---

## Part 1: Create Polar Account & Get API Keys

### Step 1: Sign Up for Polar

1. Go to **[https://polar.sh](https://polar.sh)**
2. Click **"Sign Up"** or **"Get Started"**
3. Sign up with your GitHub account (recommended) or email
4. Complete the onboarding flow

### Step 2: Create Your Organization

1. After signing in, you'll be prompted to create an organization
2. Enter your organization name (e.g., "Nano Brandana" or your company name)
3. Click **"Create Organization"**

### Step 3: Get Your Access Token (API Key)

1. In the Polar dashboard, click on your **profile icon** (top right)
2. Navigate to **Settings** → **API Tokens** (or **Personal Access Tokens**)
3. Click **"Create New Token"** or **"Generate Token"**
4. Give it a name: `nano-brandana-production`
5. Select scopes:
   - ✅ **products:read** (read product info)
   - ✅ **checkouts:write** (create checkout sessions)
   - ✅ **orders:read** (read order info for webhooks)
6. Click **"Create Token"**
7. **IMPORTANT:** Copy the token immediately! It looks like:
   ```
   polar_at_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
8. **Save this somewhere safe** (you won't be able to see it again)

### Step 4: Get Your Webhook Secret

1. In Polar dashboard, go to **Settings** → **Webhooks**
2. Click **"Add Endpoint"** or **"Create Webhook"**
3. Enter your webhook URL:
   ```
   https://YOUR-NETLIFY-SITE.netlify.app/.netlify/functions/payment-webhook
   ```

   **Replace `YOUR-NETLIFY-SITE` with your actual Netlify site name!**

   Example:
   ```
   https://nano-brandana.netlify.app/.netlify/functions/payment-webhook
   ```

4. Select events to send:
   - ✅ **order.created** (this is the main one we need)
   - You can select others if you want, but we only process `order.created`

5. Click **"Create Endpoint"** or **"Save"**

6. After creating, click on the webhook endpoint you just created

7. Find the **"Signing Secret"** or **"Webhook Secret"**
   - It looks like: `polar_whsec_xxxxxxxxxxxxxxxxxxxxxxxx`
   - Copy this secret

8. **Save this somewhere safe**

---

## Part 2: Create Token Products in Polar

You need to create two products in Polar representing your token packages.

### Step 5: Create "Starter Pack" Product

1. In Polar dashboard, go to **Products** → **Create Product**
2. Fill in the product details:
   - **Name:** `Starter Pack - 100K Tokens`
   - **Description:** `Process ~65 images with 100,000 tokens`
   - **Type:** Select **"One-time"** (NOT subscription)
3. Set the price:
   - **Amount:** `$5.00`
   - **Currency:** `USD`
4. Click **"Create Product"** or **"Save"**
5. After creating, click on the product to view details
6. **Copy the Product ID** - it looks like:
   ```
   prod_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
7. **Save this Product ID** - you'll need it for environment variables

### Step 6: Create "Pro Pack" Product

1. Click **"Create Product"** again
2. Fill in the product details:
   - **Name:** `Pro Pack - 1M Tokens`
   - **Description:** `Process ~650 images with 1,000,000 tokens`
   - **Type:** Select **"One-time"** (NOT subscription)
3. Set the price:
   - **Amount:** `$17.00`
   - **Currency:** `USD`
4. Click **"Create Product"** or **"Save"**
5. After creating, click on the product to view details
6. **Copy the Product ID** - it looks like:
   ```
   prod_yyyyyyyyyyyyyyyyyyyyyyyy
   ```
7. **Save this Product ID** - you'll need it for environment variables

---

## Part 3: Configure Netlify Environment Variables

Now you need to add the Polar credentials to your Netlify deployment.

### Step 7: Add Environment Variables to Netlify

1. Go to **[https://app.netlify.com](https://app.netlify.com)**
2. Select your **nano-brandana** site
3. Go to **Site configuration** → **Environment variables**
4. Click **"Add a variable"** or **"Add environment variable"**

Add the following variables one by one:

#### Variable 1: POLAR_ACCESS_TOKEN
- **Key:** `POLAR_ACCESS_TOKEN`
- **Value:** (paste the access token from Step 3)
  ```
  polar_at_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  ```
- **Scopes:** All scopes (production, deploy previews, branch deploys)
- Click **"Create variable"**

#### Variable 2: POLAR_WEBHOOK_SECRET
- **Key:** `POLAR_WEBHOOK_SECRET`
- **Value:** (paste the webhook secret from Step 4)
  ```
  polar_whsec_xxxxxxxxxxxxxxxxxxxxxxxx
  ```
- **Scopes:** All scopes
- Click **"Create variable"**

#### Variable 3: POLAR_STARTER_PRODUCT_ID
- **Key:** `POLAR_STARTER_PRODUCT_ID`
- **Value:** (paste the Starter Pack product ID from Step 5)
  ```
  prod_xxxxxxxxxxxxxxxxxxxxxxxx
  ```
- **Scopes:** All scopes
- Click **"Create variable"**

#### Variable 4: POLAR_PRO_PRODUCT_ID
- **Key:** `POLAR_PRO_PRODUCT_ID`
- **Value:** (paste the Pro Pack product ID from Step 6)
  ```
  prod_yyyyyyyyyyyyyyyyyyyyyyyy
  ```
- **Scopes:** All scopes
- Click **"Create variable"**

#### Variable 5: POLAR_SERVER (Optional)
- **Key:** `POLAR_SERVER`
- **Value:** `production`
- **Scopes:** All scopes
- Click **"Create variable"**

**Note:** If you want to test in Polar's sandbox mode first, set this to `sandbox` instead.

#### Variable 6: SUPABASE_SERVICE_ROLE_KEY (If Not Already Added)
- **Key:** `SUPABASE_SERVICE_ROLE_KEY`
- **Value:** (get this from your Supabase project settings)
  1. Go to your Supabase dashboard
  2. Select your project
  3. Go to **Settings** → **API**
  4. Copy the **service_role** key (NOT the anon key!)
- **Scopes:** All scopes
- **IMPORTANT:** This key bypasses Row Level Security - keep it secret!
- Click **"Create variable"**

---

## Part 4: Deploy Database Migration

You need to run the database migration to create the `token_purchases` table and `add_tokens` function.

### Step 8: Run Database Migration in Supabase

**Option A: Using Supabase CLI (Recommended)**

1. Install Supabase CLI if you haven't:
   ```bash
   npm install -g supabase
   ```

2. Link to your project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Run the migration:
   ```bash
   supabase db push
   ```

**Option B: Manual SQL Execution**

1. Go to your **Supabase Dashboard**
2. Select your project
3. Go to **SQL Editor** (in the left sidebar)
4. Click **"New Query"**
5. Open the file `/supabase/migrations/002_token_purchases.sql` from this repo
6. Copy the entire SQL content
7. Paste it into the SQL Editor
8. Click **"Run"** (or press Ctrl+Enter)
9. Verify there are no errors

---

## Part 5: Install Dependencies & Deploy

### Step 9: Install Polar SDK

1. In your local project directory, run:
   ```bash
   npm install
   ```

This will install the `@polar-sh/sdk` package that was added to `package.json`.

### Step 10: Deploy to Netlify

**Option A: Git Push (Recommended)**

1. Commit the changes:
   ```bash
   git add .
   git commit -m "Add Polar payment integration"
   git push
   ```

2. Netlify will automatically deploy your changes

**Option B: Manual Deploy**

1. In Netlify dashboard, go to **Deploys**
2. Click **"Trigger deploy"** → **"Deploy site"**

### Step 11: Wait for Deployment

1. Monitor the deploy logs in Netlify
2. Wait for the build to complete (usually 2-3 minutes)
3. Verify it says **"Published"** in green

---

## Part 6: Testing

### Step 12: Test in Production

1. Go to your deployed site (e.g., `https://nano-brandana.netlify.app`)
2. **Sign in** with your account
3. Click your **profile icon** or **account button**
4. You should see your token balance
5. Click the **"BUY TOKENS"** button
6. You should see two packages:
   - **Starter Pack** - 100K tokens for $5
   - **Pro Pack** - 1M tokens for $17
7. Click **"BUY NOW"** on one of them
8. You should be redirected to **Polar's checkout page**
9. Complete the test payment using Polar's test mode (if enabled) or a real payment

**For Test Payments:**
- If you set `POLAR_SERVER=sandbox`, use Polar's test payment methods
- If you set `POLAR_SERVER=production`, use real payment methods

### Step 13: Verify Token Credit

1. After completing payment, you'll be redirected back to your site
2. Check your **account** to verify tokens were added
3. Go to **Supabase** → **Table Editor** → **token_purchases**
4. You should see a new row with:
   - ✅ `status: 'completed'`
   - ✅ Your `user_id`
   - ✅ `tokens_purchased` matching the package
   - ✅ `provider_transaction_id` from Polar

### Step 14: Check Webhook Logs

1. Go to **Netlify** → **Functions** → **payment-webhook**
2. Check the function logs
3. You should see:
   ```
   Webhook signature verified
   Purchase record created
   Tokens added successfully
   ```

If you see errors, check the troubleshooting section below.

---

## Part 7: Going Live Checklist

### Before Accepting Real Payments:

- [ ] Verify `POLAR_SERVER=production` in Netlify env vars
- [ ] Test complete purchase flow end-to-end
- [ ] Verify tokens are credited correctly
- [ ] Check webhook is receiving events (Polar dashboard → Webhooks → View logs)
- [ ] Verify Supabase `token_purchases` table is recording purchases
- [ ] Test with small amount first ($5 starter pack)
- [ ] Add your bank account to Polar for payouts (Settings → Payouts)
- [ ] Review Polar's terms of service and fee structure
- [ ] Set up email notifications in Polar for failed payments

---

## Troubleshooting

### "Invalid webhook signature" Error

**Problem:** Webhook handler returns 403 error

**Solution:**
1. Verify `POLAR_WEBHOOK_SECRET` in Netlify matches the webhook secret in Polar dashboard
2. Check that webhook URL is correct: `https://YOUR-SITE.netlify.app/.netlify/functions/payment-webhook`
3. Make sure secret includes the `polar_whsec_` prefix

### Tokens Not Being Added After Payment

**Problem:** Payment succeeds but tokens don't appear in account

**Solution:**
1. Check Netlify function logs for `payment-webhook`
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly
3. Check Supabase `token_purchases` table for the transaction
4. Verify the database migration ran successfully (check if `add_tokens` function exists)
5. Check webhook is delivering to correct URL in Polar dashboard

### "Product ID not configured" Error

**Problem:** Clicking "BUY NOW" shows this error

**Solution:**
1. Verify `POLAR_STARTER_PRODUCT_ID` and `POLAR_PRO_PRODUCT_ID` are set in Netlify
2. Check product IDs match the products in Polar dashboard
3. Make sure products are **"One-time"** type, not subscriptions
4. Redeploy Netlify after adding env vars

### Checkout Redirects to 404 Page

**Problem:** After clicking "BUY NOW", user gets 404 error

**Solution:**
1. Check that products exist in Polar dashboard
2. Verify `POLAR_ACCESS_TOKEN` has correct scopes (`checkouts:write`)
3. Check Netlify function logs for `create-checkout`
4. Verify token is valid and not expired

### "Not authenticated" Error

**Problem:** User gets authentication error when trying to buy tokens

**Solution:**
1. User must be signed in to Supabase
2. Check browser console for auth errors
3. Verify Supabase session is active
4. Try signing out and back in

---

## Environment Variables Reference

Here's a complete list of all environment variables you need in Netlify:

| Variable Name | Where to Get It | Example Format |
|---------------|-----------------|----------------|
| `POLAR_ACCESS_TOKEN` | Polar → Settings → API Tokens | `polar_at_xxx...` |
| `POLAR_WEBHOOK_SECRET` | Polar → Settings → Webhooks → Endpoint | `polar_whsec_xxx...` |
| `POLAR_STARTER_PRODUCT_ID` | Polar → Products → Starter Pack | `prod_xxx...` |
| `POLAR_PRO_PRODUCT_ID` | Polar → Products → Pro Pack | `prod_yyy...` |
| `POLAR_SERVER` | Manual | `production` or `sandbox` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | `eyJhbG...` (long JWT) |
| `VITE_SUPABASE_URL` | Already set | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Already set | `eyJhbG...` (long JWT) |

---

## Security Notes

🔒 **NEVER commit these secrets to Git!**
- Secrets should only exist in Netlify environment variables
- Never put them in `.env` files that get committed
- Never share them in screenshots or support tickets

🔒 **Webhook signature verification is CRITICAL**
- The `payment-webhook` function validates signatures to prevent fraud
- Never remove or disable signature verification
- Attackers could otherwise fake payment confirmations and get free tokens

🔒 **Service role key is powerful**
- `SUPABASE_SERVICE_ROLE_KEY` bypasses all Row Level Security
- Only use in server-side functions (Netlify Functions)
- Never expose to client-side code

---

## What Happens in a Purchase Flow

For your understanding, here's the complete flow:

1. **User clicks "BUY TOKENS"**
   - `BuyTokensModal` component opens
   - Shows two packages

2. **User clicks "BUY NOW"**
   - Client calls `/.netlify/functions/create-checkout`
   - Function creates Polar checkout session with user metadata
   - Returns checkout URL

3. **User is redirected to Polar**
   - Enters payment information on Polar's secure hosted page
   - Completes payment

4. **Polar processes payment**
   - Charges the card
   - Creates an order in Polar

5. **Polar sends webhook**
   - POST request to `/.netlify/functions/payment-webhook`
   - Event type: `order.created`
   - Contains order ID, amount, metadata (user_id, tokens)

6. **Webhook handler processes payment**
   - Validates webhook signature (security)
   - Creates record in `token_purchases` table
   - Calls `add_tokens` RPC to credit user account
   - Returns success

7. **User is redirected back to your site**
   - URL includes `?payment=success` parameter
   - Token balance updates automatically on next page load

---

## Next Steps After Setup

Once payment integration is working:

1. **Monitor initial transactions** closely for any issues
2. **Set up Polar payout account** to receive funds
3. **Add terms of service** and refund policy to your site
4. **Consider adding more token packages** based on user demand
5. **Set up analytics** to track conversion rates
6. **Add purchase history page** for users to see their past purchases

---

## Support Resources

- **Polar Documentation:** [https://docs.polar.sh](https://docs.polar.sh)
- **Polar Discord:** [https://discord.gg/polar](https://discord.gg/polar)
- **Supabase Documentation:** [https://supabase.com/docs](https://supabase.com/docs)
- **Netlify Functions Docs:** [https://docs.netlify.com/functions/overview/](https://docs.netlify.com/functions/overview/)

---

**You're all set! 🎉**

If you followed all steps correctly, users should now be able to purchase tokens via Polar and have them instantly credited to their accounts.

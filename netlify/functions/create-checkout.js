/**
 * Netlify Function: create-checkout
 * Creates a Polar checkout session for token purchases
 *
 * Request body: { packageId: "starter" | "pro" | "power" }
 * Returns: { url: "https://polar.sh/checkout/..." }
 */

import { Polar } from '@polar-sh/sdk';
import { createClient } from '@supabase/supabase-js';

// Token packages configuration
const TOKEN_PACKAGES = {
  starter: {
    tokens: 25000,
    price_usd: 5.00,
    name: "Starter - 25K Tokens",
    description: "Process ~16 images (1-2K resolution)"
  },
  pro: {
    tokens: 250000,
    price_usd: 35.00,
    name: "Pro - 250K Tokens",
    description: "Process ~165 images (1-2K resolution)"
  },
  power: {
    tokens: 1000000,
    price_usd: 90.00,
    name: "Power - 1M Tokens",
    description: "Process ~650 images (1-2K resolution)"
  }
};

// Allowed origins for CORS (production + local dev)
const ALLOWED_ORIGINS = [
  process.env.URL, // Netlify deploy URL
  process.env.DEPLOY_PRIME_URL, // Netlify branch deploy URL
  'http://localhost:8889',
  'http://localhost:3000',
].filter(Boolean);

// Helper to get CORS origin (validate against allowed list)
function getCorsOrigin(requestOrigin) {
  if (!requestOrigin) return null;
  const isAllowed = ALLOWED_ORIGINS.some(allowed =>
    requestOrigin === allowed ||
    (allowed && requestOrigin.startsWith(allowed.replace(/\/$/, '')))
  );
  // Also allow *.netlify.app for preview deploys
  const isNetlifyPreview = /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(requestOrigin) ||
                           /^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(requestOrigin);
  return (isAllowed || isNetlifyPreview) ? requestOrigin : null;
}

export const handler = async (event, context) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsOrigin = getCorsOrigin(requestOrigin);

  // Common security headers for all responses
  const securityHeaders = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...(corsOrigin && {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
    }),
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: securityHeaders,
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: securityHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    const body = JSON.parse(event.body);
    const { packageId } = body;

    // Validate package ID
    if (!packageId || !TOKEN_PACKAGES[packageId]) {
      return {
        statusCode: 400,
        headers: securityHeaders,
        body: JSON.stringify({
          error: 'Invalid package ID',
          valid_packages: Object.keys(TOKEN_PACKAGES)
        })
      };
    }

    // Get package details
    const tokenPackage = TOKEN_PACKAGES[packageId];

    // Verify user authentication
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Missing or invalid authorization header' })
      };
    }

    const token = authHeader.replace('Bearer ', '');

    // Initialize Supabase client
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY
    );

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Invalid authentication token' })
      };
    }

    // Get user email
    const userEmail = user.email;

    // Initialize Polar SDK
    const polar = new Polar({
      accessToken: process.env.POLAR_ACCESS_TOKEN,
      server: process.env.POLAR_SERVER || 'production' // 'sandbox' or 'production'
    });

    // Determine which product ID to use based on package
    const productIdMap = {
      starter: process.env.POLAR_STARTER_PRODUCT_ID,
      pro: process.env.POLAR_PRO_PRODUCT_ID,
      power: process.env.POLAR_POWER_PRODUCT_ID
    };
    const productId = productIdMap[packageId];

    if (!productId) {
      console.error(`Missing product ID for package: ${packageId}`);
      return {
        statusCode: 500,
        headers: securityHeaders,
        body: JSON.stringify({
          error: 'Payment system configuration error'
        })
      };
    }

    // Get price amount based on package (in cents)
    const priceAmountMap = {
      starter: 500,   // $5.00
      pro: 3500,      // $35.00
      power: 9000     // $90.00
    };
    const priceAmount = priceAmountMap[packageId];

    // Create checkout session with inline pricing
    // Polar SDK requires product prices to be specified explicitly
    const checkout = await polar.checkouts.create({
      products: [productId],
      prices: {
        [productId]: [{
          amountType: 'fixed',
          priceAmount: priceAmount,
          priceCurrency: 'usd'
        }]
      },
      customerEmail: userEmail,
      successUrl: `${process.env.URL || 'http://localhost:8889'}?payment=success`,
      cancelUrl: `${process.env.URL || 'http://localhost:8889'}?payment=cancelled`,
      metadata: {
        user_id: user.id,
        package_id: packageId,
        tokens: tokenPackage.tokens.toString(),
        email: userEmail
      }
    });

    console.log('Checkout session created:', {
      checkout_id: checkout.id,
      user_id: user.id,
      package: packageId,
      tokens: tokenPackage.tokens
    });

    // Return checkout URL to client
    return {
      statusCode: 200,
      headers: securityHeaders,
      body: JSON.stringify({
        url: checkout.url,
        checkout_id: checkout.id,
        package: {
          id: packageId,
          tokens: tokenPackage.tokens,
          price: tokenPackage.price_usd,
          name: tokenPackage.name
        }
      })
    };

  } catch (error) {
    console.error('Error creating checkout session:', error);

    // Handle specific Polar API errors
    if (error.statusCode) {
      return {
        statusCode: error.statusCode,
        headers: securityHeaders,
        body: JSON.stringify({
          error: 'Payment provider error'
        })
      };
    }

    // Generic error
    return {
      statusCode: 500,
      headers: securityHeaders,
      body: JSON.stringify({
        error: 'Internal server error'
      })
    };
  }
};

/**
 * Netlify Function: create-checkout
 * Creates a Polar checkout session for token purchases
 *
 * Request body: { packageId: "starter" | "pro" }
 * Returns: { url: "https://polar.sh/checkout/..." }
 */

import { Polar } from '@polar-sh/sdk';
import { createClient } from '@supabase/supabase-js';

// Token packages configuration
const TOKEN_PACKAGES = {
  starter: {
    tokens: 100000,
    price_usd: 5.00,
    name: "Starter Pack - 100K Tokens",
    description: "Process ~65 images (1-2K resolution)"
  },
  pro: {
    tokens: 1000000,
    price_usd: 17.00,
    name: "Pro Pack - 1M Tokens",
    description: "Process ~650 images (1-2K resolution)"
  }
};

export const handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
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
    const productId = packageId === 'starter'
      ? process.env.POLAR_STARTER_PRODUCT_ID
      : process.env.POLAR_PRO_PRODUCT_ID;

    if (!productId) {
      console.error(`Missing product ID for package: ${packageId}`);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Payment system configuration error',
          details: 'Product ID not configured'
        })
      };
    }

    // Get price amount based on package
    const priceAmount = packageId === 'starter' ? 500 : 1700; // in cents: $5.00 or $17.00

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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
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
        body: JSON.stringify({
          error: 'Payment provider error',
          message: error.message
        })
      };
    }

    // Generic error
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to create checkout session'
      })
    };
  }
};

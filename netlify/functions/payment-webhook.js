/**
 * Netlify Function: payment-webhook
 * Handles Polar webhook events for payment confirmations
 *
 * Listens for: order.created events
 * Action: Credits tokens to user account after successful payment
 *
 * Security: Validates webhook signature to prevent spoofing
 */

import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { createClient } from '@supabase/supabase-js';

export const handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  console.log('Webhook received:', {
    headers: Object.keys(event.headers),
    bodyLength: event.body?.length
  });

  try {
    // Validate webhook signature
    // This prevents attackers from spoofing payment confirmations
    let polarEvent;
    try {
      polarEvent = validateEvent(
        event.body,
        event.headers,
        process.env.POLAR_WEBHOOK_SECRET
      );
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        console.error('Webhook signature verification failed:', error.message);
        return {
          statusCode: 403,
          body: JSON.stringify({ error: 'Invalid webhook signature' })
        };
      }
      throw error;
    }

    console.log('Webhook signature verified:', {
      event_type: polarEvent.type,
      event_id: polarEvent.id
    });

    // Only process order.created events (successful payments)
    if (polarEvent.type !== 'order.created') {
      console.log('Ignoring non-order event:', polarEvent.type);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Event ignored (not order.created)' })
      };
    }

    // Extract order data
    const order = polarEvent.data;
    const orderId = order.id;

    // Extract metadata (user_id, tokens, etc.)
    const metadata = order.metadata || {};
    const userId = metadata.user_id;
    const tokensPurchased = parseInt(metadata.tokens, 10);
    const packageId = metadata.package_id;

    // Validate required fields
    if (!userId) {
      console.error('Missing user_id in order metadata:', metadata);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing user_id in order metadata' })
      };
    }

    if (!tokensPurchased || tokensPurchased <= 0) {
      console.error('Invalid tokens amount in metadata:', metadata);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid tokens amount in metadata' })
      };
    }

    // Initialize Supabase with service role (bypasses RLS)
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check for duplicate processing (idempotency)
    // Use provider_transaction_id as unique constraint
    const { data: existingPurchase } = await supabase
      .from('token_purchases')
      .select('id, status')
      .eq('provider_transaction_id', orderId)
      .single();

    if (existingPurchase) {
      console.log('Duplicate webhook detected, order already processed:', {
        purchase_id: existingPurchase.id,
        status: existingPurchase.status
      });
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Order already processed',
          purchase_id: existingPurchase.id
        })
      };
    }

    // Create purchase record
    const { data: purchase, error: insertError } = await supabase
      .from('token_purchases')
      .insert({
        user_id: userId,
        amount_usd: (order.amount / 100).toFixed(2), // Polar amounts are in cents
        tokens_purchased: tokensPurchased,
        payment_provider: 'polar',
        provider_transaction_id: orderId,
        status: 'pending',
        metadata: {
          package_id: packageId,
          order_id: orderId,
          customer_email: metadata.email,
          polar_event_id: polarEvent.id
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create purchase record:', insertError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Database error',
          details: insertError.message
        })
      };
    }

    console.log('Purchase record created:', {
      purchase_id: purchase.id,
      user_id: userId,
      tokens: tokensPurchased
    });

    // Add tokens to user account
    const { data: result, error: rpcError } = await supabase
      .rpc('add_tokens', {
        p_user_id: userId,
        p_tokens_to_add: tokensPurchased,
        p_purchase_id: purchase.id
      });

    if (rpcError) {
      console.error('Failed to add tokens:', rpcError);

      // Mark purchase as failed
      await supabase
        .from('token_purchases')
        .update({ status: 'failed' })
        .eq('id', purchase.id);

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to add tokens',
          details: rpcError.message
        })
      };
    }

    if (!result.success) {
      console.error('add_tokens RPC returned failure:', result);

      // Mark purchase as failed
      await supabase
        .from('token_purchases')
        .update({ status: 'failed' })
        .eq('id', purchase.id);

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Token addition failed',
          details: result.error || 'Unknown error'
        })
      };
    }

    console.log('Tokens added successfully:', {
      purchase_id: purchase.id,
      user_id: userId,
      tokens_added: result.tokens_added,
      new_balance: result.new_balance
    });

    // Return success
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        purchase_id: purchase.id,
        tokens_added: result.tokens_added,
        new_balance: result.new_balance
      })
    };

  } catch (error) {
    console.error('Webhook processing error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Webhook processing failed'
      })
    };
  }
};

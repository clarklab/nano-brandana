-- Migration: Token Purchases and Payment Integration
-- Description: Adds token_purchases table and add_tokens RPC function for Polar payment integration

-- Create token_purchases table to track all token purchase transactions
CREATE TABLE IF NOT EXISTS public.token_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Payment details
  amount_usd DECIMAL(10,2) NOT NULL,
  tokens_purchased INTEGER NOT NULL,
  payment_provider TEXT NOT NULL DEFAULT 'polar', -- 'polar' or 'stripe' for future flexibility
  provider_transaction_id TEXT NOT NULL UNIQUE, -- Polar order ID or Stripe payment intent ID

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  -- Optional metadata for debugging
  metadata JSONB
);

-- Create indexes for fast lookups
CREATE INDEX idx_token_purchases_user_id ON public.token_purchases(user_id);
CREATE INDEX idx_token_purchases_transaction_id ON public.token_purchases(provider_transaction_id);
CREATE INDEX idx_token_purchases_status ON public.token_purchases(status);
CREATE INDEX idx_token_purchases_created_at ON public.token_purchases(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.token_purchases ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own purchase history
CREATE POLICY "Users can view own purchases"
  ON public.token_purchases
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Service role can insert purchases (webhook handler)
CREATE POLICY "Service role can insert purchases"
  ON public.token_purchases
  FOR INSERT
  WITH CHECK (true);

-- RLS Policy: Service role can update purchases (for status changes)
CREATE POLICY "Service role can update purchases"
  ON public.token_purchases
  FOR UPDATE
  USING (true);

-- Function to add tokens to user account after successful payment
-- This function is called by the payment webhook handler
CREATE OR REPLACE FUNCTION public.add_tokens(
  p_user_id UUID,
  p_tokens_to_add INTEGER,
  p_purchase_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to bypass RLS
AS $$
DECLARE
  v_new_balance INTEGER;
  v_old_balance INTEGER;
BEGIN
  -- Input validation
  IF p_tokens_to_add <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'tokens_to_add must be positive'
    );
  END IF;

  -- Lock the user's profile row to prevent race conditions
  -- Add tokens atomically
  UPDATE public.profiles
  SET tokens_remaining = tokens_remaining + p_tokens_to_add
  WHERE id = p_user_id
  RETURNING tokens_remaining, tokens_remaining - p_tokens_to_add
  INTO v_new_balance, v_old_balance;

  -- Check if user exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'user not found'
    );
  END IF;

  -- Update purchase status if purchase_id provided
  IF p_purchase_id IS NOT NULL THEN
    UPDATE public.token_purchases
    SET
      status = 'completed',
      completed_at = now()
    WHERE id = p_purchase_id;
  END IF;

  -- Return success with balance info
  RETURN jsonb_build_object(
    'success', true,
    'tokens_added', p_tokens_to_add,
    'old_balance', v_old_balance,
    'new_balance', v_new_balance
  );
END;
$$;

-- Grant execute permission to authenticated users (will be called via service role)
GRANT EXECUTE ON FUNCTION public.add_tokens TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_tokens TO service_role;

-- Add comment for documentation
COMMENT ON TABLE public.token_purchases IS 'Tracks all token purchase transactions from payment providers (Polar, Stripe)';
COMMENT ON FUNCTION public.add_tokens IS 'Atomically adds tokens to user account after successful payment. Called by payment webhook handler.';

-- ============================================
-- SUPABASE SCHEMA FOR NANO-BRANDANA
-- Run this in your Supabase SQL Editor
-- ============================================

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  tokens_remaining INTEGER DEFAULT 25000,  -- Start with 25k tokens
  tokens_used INTEGER DEFAULT 0,
  last_login TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  hourly_rate NUMERIC(10, 2) DEFAULT NULL  -- User's hourly rate for "money saved" calculations
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, tokens_remaining, tokens_used)
  VALUES (NEW.id, NEW.email, 25000, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper function for atomic token deduction
-- This prevents race conditions when multiple requests happen at once
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
    -- Still deduct what we can, don't fail
    UPDATE public.profiles
    SET tokens_remaining = 0,
        tokens_used = tokens_used + current_balance,
        last_login = NOW()
    WHERE id = user_id;

    RETURN QUERY SELECT FALSE, 0;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.deduct_tokens TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_tokens TO service_role;

-- ============================================
-- JOB LOGS TABLE
-- Tracks each processing request for analytics and user history
-- ============================================

CREATE TABLE public.job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  batch_id TEXT,  -- Groups multiple logs from a single batch run
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Job configuration
  mode TEXT NOT NULL CHECK (mode IN ('batch', 'singleJob')),
  image_size TEXT CHECK (image_size IN ('1K', '2K', '4K')),
  model TEXT,

  -- Input metrics (no content stored)
  images_submitted INTEGER NOT NULL DEFAULT 0,
  instruction_length INTEGER,
  total_input_bytes BIGINT,

  -- Output metrics
  images_returned INTEGER DEFAULT 0,

  -- Token usage
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,

  -- Timing
  elapsed_ms INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'error')),
  error_code TEXT,
  error_message TEXT,

  -- Billing
  tokens_charged INTEGER,
  token_balance_before INTEGER,
  token_balance_after INTEGER
);

-- Indexes for common queries
CREATE INDEX idx_job_logs_user_id ON public.job_logs(user_id);
CREATE INDEX idx_job_logs_created_at ON public.job_logs(created_at DESC);
CREATE INDEX idx_job_logs_user_created ON public.job_logs(user_id, created_at DESC);
CREATE INDEX idx_job_logs_status ON public.job_logs(status) WHERE status != 'success';
CREATE INDEX idx_job_logs_request_id ON public.job_logs(request_id);
CREATE INDEX idx_job_logs_batch_id ON public.job_logs(batch_id);

-- Enable RLS
ALTER TABLE public.job_logs ENABLE ROW LEVEL SECURITY;

-- Users can only view their own job logs
CREATE POLICY "Users can view own job logs" ON public.job_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Helper function for inserting job logs (called by service_role)
CREATE OR REPLACE FUNCTION public.log_job(
  p_user_id UUID,
  p_request_id TEXT,
  p_mode TEXT,
  p_image_size TEXT,
  p_model TEXT,
  p_images_submitted INTEGER,
  p_instruction_length INTEGER,
  p_total_input_bytes BIGINT,
  p_images_returned INTEGER,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER,
  p_total_tokens INTEGER,
  p_elapsed_ms INTEGER,
  p_status TEXT,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_tokens_charged INTEGER DEFAULT NULL,
  p_token_balance_before INTEGER DEFAULT NULL,
  p_token_balance_after INTEGER DEFAULT NULL,
  p_batch_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.job_logs (
    user_id, request_id, batch_id, mode, image_size, model,
    images_submitted, instruction_length, total_input_bytes,
    images_returned, prompt_tokens, completion_tokens, total_tokens,
    elapsed_ms, status, error_code, error_message,
    tokens_charged, token_balance_before, token_balance_after
  ) VALUES (
    p_user_id, p_request_id, p_batch_id, p_mode, p_image_size, p_model,
    p_images_submitted, p_instruction_length, p_total_input_bytes,
    p_images_returned, p_prompt_tokens, p_completion_tokens, p_total_tokens,
    p_elapsed_ms, p_status, p_error_code, p_error_message,
    p_tokens_charged, p_token_balance_before, p_token_balance_after
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.log_job TO service_role;

-- ============================================
-- SUPABASE SCHEMA FOR NANO-BRANDANA
-- Run this in your Supabase SQL Editor
-- ============================================

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  tokens_remaining INTEGER DEFAULT 100000,  -- Start with 100k tokens
  tokens_used INTEGER DEFAULT 0,
  last_login TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  VALUES (NEW.id, NEW.email, 100000, 0);
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

-- Add hourly_rate column to profiles table
-- Used to calculate "money saved" metrics based on user's hourly rate

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10, 2) DEFAULT NULL;

COMMENT ON COLUMN public.profiles.hourly_rate IS 'User hourly rate (USD) for calculating money saved metrics';

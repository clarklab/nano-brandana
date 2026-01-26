-- ============================================
-- Fix job_logs mode constraint to allow 'resize'
-- This was blocking resize job logging
-- ============================================

-- Drop the existing constraint
ALTER TABLE public.job_logs DROP CONSTRAINT IF EXISTS job_logs_mode_check;

-- Add new constraint that includes 'resize'
ALTER TABLE public.job_logs ADD CONSTRAINT job_logs_mode_check
  CHECK (mode IN ('batch', 'singleJob', 'resize'));

-- Add comment explaining the modes
COMMENT ON COLUMN public.job_logs.mode IS 'Job type: batch (multiple images), singleJob (single image), resize (local resize - free)';

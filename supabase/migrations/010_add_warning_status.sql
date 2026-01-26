-- ============================================
-- Add 'warning' status to job_logs
-- For cases where API succeeded but no images returned
-- ============================================

-- Drop the existing constraint
ALTER TABLE public.job_logs DROP CONSTRAINT IF EXISTS job_logs_status_check;

-- Add new constraint that includes 'warning'
ALTER TABLE public.job_logs ADD CONSTRAINT job_logs_status_check
  CHECK (status IN ('pending', 'success', 'error', 'warning'));

-- Add comment explaining the statuses
COMMENT ON COLUMN public.job_logs.status IS 'Job status: pending (in progress), success (completed with images), warning (API ok but no images), error (failed)';

-- Async Job Queue: pending_jobs table
-- Stores jobs for background processing to avoid Edge Function timeouts

CREATE TABLE pending_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  request_id TEXT UNIQUE NOT NULL,
  batch_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'timeout')),

  -- Input (what to process)
  instruction TEXT NOT NULL,
  images JSONB,              -- Base64 images array
  reference_images JSONB,    -- Reference images from presets
  model TEXT,
  image_size TEXT,
  aspect_ratio TEXT,
  mode TEXT DEFAULT 'batch',

  -- Output (results)
  result_images JSONB,       -- Generated images (base64 data URIs)
  result_content TEXT,       -- Text content from AI
  usage JSONB,               -- Token usage stats

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error info
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

-- Index for fetching user's jobs by status
CREATE INDEX idx_pending_jobs_user_status ON pending_jobs(user_id, status);

-- Index for background worker to find pending jobs
CREATE INDEX idx_pending_jobs_pending ON pending_jobs(status, created_at)
  WHERE status = 'pending';

-- Index for cleanup of old completed jobs
CREATE INDEX idx_pending_jobs_completed_at ON pending_jobs(completed_at)
  WHERE status IN ('completed', 'failed');

-- Enable Row Level Security
ALTER TABLE pending_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own jobs
CREATE POLICY "Users can view own jobs" ON pending_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own jobs (via edge function with service role)
-- Note: Edge functions use service role key which bypasses RLS
-- This policy allows authenticated users to see their jobs

-- Service role can do everything (for background worker)
-- No explicit policy needed - service role bypasses RLS

COMMENT ON TABLE pending_jobs IS 'Async job queue for image processing. Jobs are enqueued instantly and processed by background functions.';
COMMENT ON COLUMN pending_jobs.status IS 'pending=queued, processing=being worked on, completed=done with results, failed=error, timeout=took too long';
COMMENT ON COLUMN pending_jobs.images IS 'Array of base64 data URI strings for input images';
COMMENT ON COLUMN pending_jobs.result_images IS 'Array of base64 data URI strings for generated images';

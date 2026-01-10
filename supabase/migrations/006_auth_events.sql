-- Migration: Create auth_events table for tracking magic link authentication flow
-- Purpose: Diagnose where magic link failures occur in the auth flow

-- Create the auth_events table
CREATE TABLE IF NOT EXISTS auth_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Event identification
  event_type TEXT NOT NULL CHECK (event_type IN (
    'magic_link_requested',
    'callback_received',
    'callback_error',
    'auth_completed',
    'auth_failed',
    'session_timeout',
    'token_refresh_failed'
  )),

  -- Privacy-conscious user identification
  email_hash TEXT,                    -- SHA-256 hash of email (not plaintext)
  email_domain TEXT,                  -- Domain for pattern analysis (e.g., "gmail.com")
  session_id TEXT,                    -- Anonymous session ID to correlate events

  -- Context
  user_agent TEXT,                    -- Browser/device info

  -- Error details (for failure events)
  error_code TEXT,
  error_message TEXT,

  -- Additional context
  metadata JSONB DEFAULT '{}'::jsonb  -- Timing, referrer, etc.
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_auth_events_created_at ON auth_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_event_type ON auth_events(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_events_session_id ON auth_events(session_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_email_domain ON auth_events(email_domain);
CREATE INDEX IF NOT EXISTS idx_auth_events_error_code ON auth_events(error_code) WHERE error_code IS NOT NULL;

-- Composite index for time-based queries with event type
CREATE INDEX IF NOT EXISTS idx_auth_events_type_time ON auth_events(event_type, created_at DESC);

-- Enable Row Level Security (but we'll only use service role to write)
ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;

-- No RLS policies - this table is write-only via service role
-- Reads happen via admin queries or a future admin dashboard

-- Auto-delete old events (30 day retention)
-- This requires pg_cron extension or a scheduled function
-- For now, we'll create a function that can be called periodically

CREATE OR REPLACE FUNCTION cleanup_old_auth_events()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM auth_events
  WHERE created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION cleanup_old_auth_events() TO service_role;

-- Comments for documentation
COMMENT ON TABLE auth_events IS 'Tracks magic link authentication flow for debugging failures. 30-day retention.';
COMMENT ON COLUMN auth_events.event_type IS 'Type of auth event: magic_link_requested, callback_received, callback_error, auth_completed, auth_failed, session_timeout, token_refresh_failed';
COMMENT ON COLUMN auth_events.email_hash IS 'SHA-256 hash of email address for privacy-conscious correlation';
COMMENT ON COLUMN auth_events.email_domain IS 'Email domain (e.g., gmail.com) for pattern analysis';
COMMENT ON COLUMN auth_events.session_id IS 'Anonymous session ID to correlate events across the auth flow';

-- Add BYO (Bring Your Own) API key column to profiles
-- Users can provide their own Google Gemini API key to skip platform token charges

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS gemini_api_key TEXT DEFAULT NULL;

-- Add comment explaining this column
COMMENT ON COLUMN profiles.gemini_api_key IS 'User-provided Google Gemini API key for BYO key feature. When set, user can route generations through their own key without token deduction.';

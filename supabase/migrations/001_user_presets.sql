-- Migration: Create user_presets table for storing custom task presets
-- Created: 2025-01-XX
-- Description: Allows users to customize their preset tasks (REMOVE BG, ADD BRAND COLOR, etc.)

-- Create the user_presets table
CREATE TABLE IF NOT EXISTS user_presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Preset metadata
  label VARCHAR(50) NOT NULL,           -- Display label (e.g., "Remove BG")
  display_order INTEGER NOT NULL,       -- Order in which presets appear (0-indexed)

  -- Preset behavior type
  -- 'direct': Immediately applies the prompt (e.g., "Remove BG")
  -- 'ask': Shows a follow-up question first (e.g., "Add Brand Color" asks for color)
  preset_type VARCHAR(10) NOT NULL CHECK (preset_type IN ('direct', 'ask')),

  -- The actual instruction/prompt for direct presets
  -- For 'ask' presets, this is the template with {{INPUT}} placeholder
  prompt TEXT NOT NULL,

  -- For 'ask' type presets:
  ask_message TEXT,                     -- The question to ask the user
  display_text_template VARCHAR(200),   -- Template for display (e.g., "Add brand color {{INPUT}}")
  response_confirmation TEXT,           -- Confirmation message after user responds

  -- Validation for 'ask' type
  validation_type VARCHAR(20),          -- 'number', 'text', 'color', or NULL
  validation_min INTEGER,               -- For number validation
  validation_max INTEGER,               -- For number validation
  validation_error_message TEXT,        -- Custom error message for validation failure

  -- Metadata
  is_default BOOLEAN DEFAULT FALSE,     -- Whether this is a system default (cannot be deleted, only customized)
  is_hidden BOOLEAN DEFAULT FALSE,      -- Soft delete / hide preset
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique ordering per user
  CONSTRAINT unique_user_order UNIQUE (user_id, display_order),
  -- Ensure unique label per user
  CONSTRAINT unique_user_label UNIQUE (user_id, label)
);

-- Create index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_user_presets_user_id ON user_presets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_presets_order ON user_presets(user_id, display_order);

-- Enable Row Level Security
ALTER TABLE user_presets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own presets
CREATE POLICY "Users can view own presets" ON user_presets
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own presets
CREATE POLICY "Users can insert own presets" ON user_presets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own presets
CREATE POLICY "Users can update own presets" ON user_presets
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own presets
CREATE POLICY "Users can delete own presets" ON user_presets
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_user_presets_updated_at
  BEFORE UPDATE ON user_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comment for documentation
COMMENT ON TABLE user_presets IS 'Stores user-customizable task presets for the image editor. Each user has their own set of presets.';
COMMENT ON COLUMN user_presets.preset_type IS 'direct = applies prompt immediately, ask = shows follow-up question first';
COMMENT ON COLUMN user_presets.prompt IS 'For direct: the full prompt. For ask: template with {{INPUT}} placeholder';
COMMENT ON COLUMN user_presets.ask_message IS 'The question to show the user for ask-type presets';

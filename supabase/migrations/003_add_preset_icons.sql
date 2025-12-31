-- Migration: Add icon column to user_presets table
-- Created: 2025-01-XX
-- Description: Adds Material Symbols icon support to preset buttons

-- Add the icon column
ALTER TABLE user_presets
ADD COLUMN IF NOT EXISTS icon VARCHAR(50) DEFAULT NULL;

-- Update existing default presets with their icons
-- (These match the DEFAULT_PRESETS in src/lib/supabase.ts)
UPDATE user_presets SET icon = 'hide_image' WHERE label = 'Remove BG' AND icon IS NULL;
UPDATE user_presets SET icon = 'palette' WHERE label = 'Add Brand Color' AND icon IS NULL;
UPDATE user_presets SET icon = 'content_copy' WHERE label = 'Duplicate' AND icon IS NULL;
UPDATE user_presets SET icon = 'zoom_in' WHERE label = 'Upscale' AND icon IS NULL;
UPDATE user_presets SET icon = 'auto_awesome' WHERE label = 'Transform' AND icon IS NULL;
UPDATE user_presets SET icon = 'filter_b_and_w' WHERE label = 'Desaturate' AND icon IS NULL;

-- Comment for documentation
COMMENT ON COLUMN user_presets.icon IS 'Material Symbols Outlined icon name (e.g., palette, zoom_in, auto_awesome)';

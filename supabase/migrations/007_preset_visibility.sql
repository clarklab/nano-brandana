-- Add show_in_main_view column to user_presets table
-- This controls whether a preset is shown in the main task view
-- Users can hide presets they don't use frequently while keeping them available in the editor

ALTER TABLE user_presets
ADD COLUMN show_in_main_view BOOLEAN DEFAULT true NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN user_presets.show_in_main_view IS 'Whether this preset is shown in the main task view. Hidden presets are still accessible in the preset editor.';

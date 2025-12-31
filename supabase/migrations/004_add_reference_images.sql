-- Migration: Add reference images support to user_presets
-- Created: 2025-01-31
-- Description: Adds storage bucket and columns for preset reference images (max 3 per preset)

-- Create storage bucket for preset reference images
INSERT INTO storage.buckets (id, name, public)
VALUES ('preset-reference-images', 'preset-reference-images', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on the bucket
CREATE POLICY "Users can view own preset images"
ON storage.objects FOR SELECT
USING (bucket_id = 'preset-reference-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own preset images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'preset-reference-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own preset images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'preset-reference-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own preset images"
ON storage.objects FOR DELETE
USING (bucket_id = 'preset-reference-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add reference image URL columns to user_presets table
ALTER TABLE user_presets
ADD COLUMN IF NOT EXISTS ref_image_1_url TEXT,
ADD COLUMN IF NOT EXISTS ref_image_2_url TEXT,
ADD COLUMN IF NOT EXISTS ref_image_3_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN user_presets.ref_image_1_url IS 'URL to first reference image in Supabase Storage (max 1MB)';
COMMENT ON COLUMN user_presets.ref_image_2_url IS 'URL to second reference image in Supabase Storage (max 1MB)';
COMMENT ON COLUMN user_presets.ref_image_3_url IS 'URL to third reference image in Supabase Storage (max 1MB)';

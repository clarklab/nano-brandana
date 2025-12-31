-- Migration: Make preset-reference-images bucket public
-- Created: 2025-01-31
-- Description: Updates the bucket to be public so getPublicUrl() works correctly

-- Update the bucket to be public
UPDATE storage.buckets
SET public = true
WHERE id = 'preset-reference-images';

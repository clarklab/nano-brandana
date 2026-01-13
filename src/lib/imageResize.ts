/**
 * Local image resizing for resize-only jobs (no AI processing).
 * Handles quality scaling, aspect ratio cropping, and custom dimensions.
 */

import { fileToBase64 } from './base64';

// Quality tier to max dimension mapping
const QUALITY_DIMENSIONS: Record<'1K' | '2K' | '4K', number> = {
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
};

// Aspect ratio to numeric value mapping
const ASPECT_RATIOS: Record<string, number> = {
  '1:1': 1,
  '2:3': 2 / 3,
  '3:4': 3 / 4,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
  '3:2': 3 / 2,
  '4:3': 4 / 3,
  '5:4': 5 / 4,
  '16:9': 16 / 9,
  '21:9': 21 / 9,
};

export interface LocalResizeOptions {
  imageSize?: '1K' | '2K' | '4K';
  aspectRatio?: string | null;
  customWidth?: number;
  customHeight?: number;
}

export interface LocalResizeResult {
  base64: string;
  width: number;
  height: number;
}

/**
 * Resize an image locally using canvas.
 * Applies quality scaling, aspect ratio cropping, and custom dimensions.
 */
export async function resizeImageLocally(
  file: File,
  options: LocalResizeOptions
): Promise<LocalResizeResult> {
  const { imageSize = '1K', aspectRatio, customWidth, customHeight } = options;

  // Load the image
  const base64 = await fileToBase64(file);
  const img = await loadImage(base64);

  // Determine target dimensions
  let targetWidth: number;
  let targetHeight: number;

  if (customWidth && customHeight) {
    // Custom dimensions specified
    targetWidth = customWidth;
    targetHeight = customHeight;
  } else {
    // Calculate based on quality tier and aspect ratio
    const maxDim = QUALITY_DIMENSIONS[imageSize];

    if (aspectRatio && ASPECT_RATIOS[aspectRatio]) {
      const ratio = ASPECT_RATIOS[aspectRatio];
      if (ratio >= 1) {
        // Landscape or square
        targetWidth = maxDim;
        targetHeight = Math.round(maxDim / ratio);
      } else {
        // Portrait
        targetHeight = maxDim;
        targetWidth = Math.round(maxDim * ratio);
      }
    } else {
      // No aspect ratio - maintain original aspect ratio, scale to fit within maxDim
      const scale = Math.min(maxDim / img.width, maxDim / img.height);
      if (scale >= 1) {
        // Image is smaller than max dimension - don't upscale
        targetWidth = img.width;
        targetHeight = img.height;
      } else {
        targetWidth = Math.round(img.width * scale);
        targetHeight = Math.round(img.height * scale);
      }
    }
  }

  // Perform the resize
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // Calculate source crop region if aspect ratios differ
  const srcAspect = img.width / img.height;
  const targetAspect = targetWidth / targetHeight;

  let srcX = 0;
  let srcY = 0;
  let srcWidth = img.width;
  let srcHeight = img.height;

  if (Math.abs(srcAspect - targetAspect) > 0.01) {
    // Aspect ratios differ - need to crop
    if (srcAspect > targetAspect) {
      // Source is wider - crop sides
      srcWidth = img.height * targetAspect;
      srcX = (img.width - srcWidth) / 2;
    } else {
      // Source is taller - crop top/bottom
      srcHeight = img.width / targetAspect;
      srcY = (img.height - srcHeight) / 2;
    }
  }

  // Use high-quality rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw the image with cropping and scaling
  ctx.drawImage(
    img,
    srcX, srcY, srcWidth, srcHeight, // Source rectangle
    0, 0, targetWidth, targetHeight  // Destination rectangle
  );

  // Determine output format - preserve original format for best quality
  // JPEG for photos (smaller file size), PNG for graphics/transparency
  const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg';
  const outputFormat = isJpeg ? 'image/jpeg' : 'image/png';
  // Use maximum quality (1.0) since we're not constrained by API upload limits
  const outputBase64 = canvas.toDataURL(outputFormat, 1.0);

  return {
    base64: outputBase64,
    width: targetWidth,
    height: targetHeight,
  };
}

/**
 * Load an image from base64 data URL.
 */
function loadImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64;
  });
}

/**
 * Check if a job should be processed locally (resize-only).
 * Returns true if the job has output settings but no AI instructions/presets.
 */
export function isResizeOnlyJob(
  hasInstructions: boolean,
  hasPreset: boolean,
  options: LocalResizeOptions
): boolean {
  // If there are instructions or a preset, it's not resize-only
  if (hasInstructions || hasPreset) {
    return false;
  }

  // Check if any output settings are non-default
  const hasQualityChange = options.imageSize && options.imageSize !== '1K';
  const hasAspectRatio = !!options.aspectRatio;
  const hasCustomSize = !!(options.customWidth && options.customHeight);

  // It's resize-only if there are output settings but no AI instructions
  return hasQualityChange || hasAspectRatio || hasCustomSize;
}

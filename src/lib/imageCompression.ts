/**
 * Image compression utilities for reference images.
 * Compresses images to a maximum of 1MB while maintaining quality.
 */

const MAX_FILE_SIZE = 1024 * 1024; // 1MB in bytes
const INITIAL_QUALITY = 0.9;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.1;

export interface CompressionResult {
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
}

/**
 * Compress an image file to a maximum size of 1MB.
 * Uses canvas to resize and reduce quality iteratively until target size is met.
 *
 * @param file - The image file to compress
 * @param maxSizeBytes - Maximum size in bytes (default 1MB)
 * @returns Promise with compressed image data URL and metadata
 */
export async function compressImage(
  file: File,
  maxSizeBytes: number = MAX_FILE_SIZE
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read file'));

    reader.onload = (e) => {
      const img = new Image();

      img.onerror = () => reject(new Error('Failed to load image'));

      img.onload = async () => {
        try {
          const result = await compressImageElement(img, maxSizeBytes);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Compress an image from a data URL.
 *
 * @param dataUrl - The image data URL to compress
 * @param maxSizeBytes - Maximum size in bytes (default 1MB)
 * @returns Promise with compressed image data URL and metadata
 */
export async function compressImageFromDataUrl(
  dataUrl: string,
  maxSizeBytes: number = MAX_FILE_SIZE
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onerror = () => reject(new Error('Failed to load image'));

    img.onload = async () => {
      try {
        const result = await compressImageElement(img, maxSizeBytes);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };

    img.src = dataUrl;
  });
}

/**
 * Internal helper to compress an HTMLImageElement.
 */
async function compressImageElement(
  img: HTMLImageElement,
  maxSizeBytes: number
): Promise<CompressionResult> {
  let { width, height } = img;
  let quality = INITIAL_QUALITY;
  let dataUrl: string;
  let sizeBytes: number;

  // First, check if we need to resize based on dimensions
  // Start with original size, but cap at 2048px for reasonable compression
  const MAX_DIMENSION = 2048;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  // Try progressively reducing quality until we meet the size target
  let attempts = 0;
  const MAX_ATTEMPTS = 20;

  do {
    attempts++;

    // Create canvas and draw image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Use high-quality image rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    // Convert to data URL with current quality
    dataUrl = canvas.toDataURL('image/jpeg', quality);

    // Calculate size (base64 adds ~33% overhead, but dataUrl includes prefix)
    sizeBytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

    // If we're under the limit, we're done
    if (sizeBytes <= maxSizeBytes) {
      return { dataUrl, sizeBytes, width, height };
    }

    // If we've tried many times and quality is already low, try reducing dimensions
    if (quality <= MIN_QUALITY && sizeBytes > maxSizeBytes) {
      const reductionFactor = Math.sqrt(maxSizeBytes / sizeBytes);
      width = Math.max(100, Math.round(width * reductionFactor));
      height = Math.max(100, Math.round(height * reductionFactor));
      quality = INITIAL_QUALITY; // Reset quality when resizing
    } else {
      // Reduce quality for next attempt
      quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
    }

    // Safety check to prevent infinite loop
    if (attempts >= MAX_ATTEMPTS) {
      throw new Error(`Could not compress image to ${maxSizeBytes} bytes after ${MAX_ATTEMPTS} attempts`);
    }
  } while (sizeBytes > maxSizeBytes);

  // This should never be reached, but TypeScript needs it
  throw new Error('Compression failed unexpectedly');
}

/**
 * Get the size of a data URL in bytes.
 */
export function getDataUrlSize(dataUrl: string): number {
  // Remove the data URL prefix and calculate base64 size
  const base64 = dataUrl.split(',')[1] || '';
  return Math.round(base64.length * 0.75);
}

/**
 * Validate that a file is an image and under a reasonable size.
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'File must be an image' };
  }

  // Check file size (max 50MB uncompressed - we'll compress it down)
  const MAX_UNCOMPRESSED_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_UNCOMPRESSED_SIZE) {
    return { valid: false, error: 'Image file is too large (max 50MB)' };
  }

  return { valid: true };
}

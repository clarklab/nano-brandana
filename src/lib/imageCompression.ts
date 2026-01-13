/**
 * Image compression utilities for reference images and oversized uploads.
 * Compresses images to target sizes while maintaining quality.
 */

const MAX_FILE_SIZE = 1024 * 1024; // 1MB in bytes (for reference images)
const INITIAL_QUALITY = 0.9;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.1;

// Dimension steps for progressive resizing when quality alone isn't enough
// Start higher to preserve more resolution when possible
const DIMENSION_STEPS = [4096, 3072, 2048, 1536, 1024, 768];

export interface CompressionResult {
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export interface CompressToTargetOptions {
  maxSizeBytes: number;
  onProgress?: (progress: CompressProgress) => void;
}

export interface CompressProgress {
  phase: 'loading' | 'compressing' | 'complete' | 'failed';
  currentSizeBytes?: number;
  currentDimension?: number;
  currentQuality?: number;
  targetSizeBytes: number;
}

export interface CompressToTargetResult {
  success: boolean;
  file?: File;
  dataUrl?: string;
  finalSizeBytes?: number;
  finalWidth?: number;
  finalHeight?: number;
  originalSizeBytes: number;
  error?: string;
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

/**
 * Convert a data URL to a File object.
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

/**
 * Compress an image file to a target size (e.g., 3MB for upload limits).
 * Uses progressive quality reduction and dimension scaling.
 * Returns a File object suitable for adding to the upload queue.
 *
 * @param file - The image file to compress
 * @param options - Compression options including target size and progress callback
 * @returns Promise with compression result including the compressed File
 */
export async function compressToTargetSize(
  file: File,
  options: CompressToTargetOptions
): Promise<CompressToTargetResult> {
  const { maxSizeBytes, onProgress } = options;
  const originalSizeBytes = file.size;

  // Report loading phase
  onProgress?.({
    phase: 'loading',
    targetSizeBytes: maxSizeBytes,
  });

  // Check for HEIC/HEIF (not supported by canvas)
  if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
    return {
      success: false,
      originalSizeBytes,
      error: 'HEIC/HEIF format is not supported. Please convert to JPG or PNG first.',
    };
  }

  try {
    // Load the image
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image. The file may be corrupted or in an unsupported format.'));
      img.onload = () => resolve(img);
      img.src = dataUrl;
    });

    const originalWidth = img.width;
    const originalHeight = img.height;

    // Helper to compress at specific dimensions and quality
    const tryCompress = (width: number, height: number, quality: number): { dataUrl: string; size: number } => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      return { dataUrl, size: getDataUrlSize(dataUrl) };
    };

    // Strategy: Find the LARGEST dimensions and HIGHEST quality that fits under the limit
    // Start with original dimensions (capped at 2048) and work down only if needed

    // First, try with original dimensions (no cap) to see if it fits
    let bestWidth = originalWidth;
    let bestHeight = originalHeight;

    onProgress?.({
      phase: 'compressing',
      currentDimension: Math.max(bestWidth, bestHeight),
      currentQuality: INITIAL_QUALITY,
      targetSizeBytes: maxSizeBytes,
    });

    // Try at highest quality first
    let result = tryCompress(bestWidth, bestHeight, INITIAL_QUALITY);

    // If already under limit at max quality, we're done!
    if (result.size <= maxSizeBytes) {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const outputFilename = `${baseName}_compressed.jpg`;
      const compressedFile = dataUrlToFile(result.dataUrl, outputFilename);

      onProgress?.({
        phase: 'complete',
        currentSizeBytes: result.size,
        currentDimension: Math.max(bestWidth, bestHeight),
        currentQuality: INITIAL_QUALITY,
        targetSizeBytes: maxSizeBytes,
      });

      return {
        success: true,
        file: compressedFile,
        dataUrl: result.dataUrl,
        finalSizeBytes: result.size,
        finalWidth: bestWidth,
        finalHeight: bestHeight,
        originalSizeBytes,
      };
    }

    // If over limit, progressively reduce quality, then dimensions
    for (const maxDim of DIMENSION_STEPS) {
      // Calculate dimensions for this step
      let targetWidth = originalWidth;
      let targetHeight = originalHeight;

      if (originalWidth > maxDim || originalHeight > maxDim) {
        const ratio = Math.min(maxDim / originalWidth, maxDim / originalHeight);
        targetWidth = Math.round(originalWidth * ratio);
        targetHeight = Math.round(originalHeight * ratio);
      }

      // Try each quality level at this dimension
      for (let quality = INITIAL_QUALITY; quality >= MIN_QUALITY; quality -= QUALITY_STEP) {
        onProgress?.({
          phase: 'compressing',
          currentDimension: Math.max(targetWidth, targetHeight),
          currentQuality: quality,
          targetSizeBytes: maxSizeBytes,
        });

        result = tryCompress(targetWidth, targetHeight, quality);

        if (result.size <= maxSizeBytes) {
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          const outputFilename = `${baseName}_compressed.jpg`;
          const compressedFile = dataUrlToFile(result.dataUrl, outputFilename);

          onProgress?.({
            phase: 'complete',
            currentSizeBytes: result.size,
            currentDimension: Math.max(targetWidth, targetHeight),
            currentQuality: quality,
            targetSizeBytes: maxSizeBytes,
          });

          return {
            success: true,
            file: compressedFile,
            dataUrl: result.dataUrl,
            finalSizeBytes: result.size,
            finalWidth: targetWidth,
            finalHeight: targetHeight,
            originalSizeBytes,
          };
        }
      }
    }

    // If we get here, even minimum settings couldn't reach target
    onProgress?.({
      phase: 'failed',
      targetSizeBytes: maxSizeBytes,
    });

    return {
      success: false,
      originalSizeBytes,
      error: `Could not compress image below ${(maxSizeBytes / 1024 / 1024).toFixed(1)}MB. The image may be too complex. Try using an image editor to reduce its size.`,
    };
  } catch (err) {
    onProgress?.({
      phase: 'failed',
      targetSizeBytes: maxSizeBytes,
    });

    return {
      success: false,
      originalSizeBytes,
      error: err instanceof Error ? err.message : 'Failed to compress image',
    };
  }
}

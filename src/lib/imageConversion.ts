/**
 * Image format conversion utilities for the Download Modal.
 * Supports conversion to WEBP, PNG, and JPG formats with high quality output.
 */

export type OutputFormat = 'image/webp' | 'image/png' | 'image/jpeg';
export type FormatKey = 'WEBP' | 'PNG' | 'JPG';

export interface FormatSettings {
  format: OutputFormat;
  quality: number;
  extension: string;
}

export const FORMAT_SETTINGS: Record<FormatKey, FormatSettings> = {
  WEBP: { format: 'image/webp', quality: 0.8, extension: 'webp' },
  PNG: { format: 'image/png', quality: 1.0, extension: 'png' },
  JPG: { format: 'image/jpeg', quality: 1.0, extension: 'jpg' },
};

// Relative size estimates vs PNG baseline (rough approximations)
export const SIZE_ESTIMATES: Record<FormatKey, number> = {
  PNG: 1.0,
  WEBP: 0.5, // ~50% smaller than PNG (80% quality)
  JPG: 0.5, // ~50% smaller than PNG
};

/**
 * Convert a base64 image to a specific format.
 * Uses canvas for high-quality conversion.
 */
export async function convertBase64ToFormat(
  base64: string,
  format: OutputFormat,
  quality: number = 1.0
): Promise<{ blob: Blob; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Use high-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0);

      // Convert to blob with specified format and quality
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to convert image'));
            return;
          }
          resolve({
            blob,
            sizeBytes: blob.size,
          });
        },
        format,
        quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64;
  });
}

/**
 * Estimate the converted size of an image without actually converting it.
 * Uses rough multipliers based on typical compression ratios.
 */
export function estimateConvertedSize(base64: string, targetFormat: FormatKey): number {
  // Calculate current size from base64 (remove data URL prefix)
  const commaIndex = base64.indexOf(',');
  const base64Data = commaIndex >= 0 ? base64.substring(commaIndex + 1) : base64;
  const currentSize = Math.round(base64Data.length * 0.75);

  // Apply format multiplier
  return Math.round(currentSize * SIZE_ESTIMATES[targetFormat]);
}

/**
 * Get the actual size of a base64 image in bytes.
 */
export function getBase64Size(base64: string): number {
  const commaIndex = base64.indexOf(',');
  const base64Data = commaIndex >= 0 ? base64.substring(commaIndex + 1) : base64;
  return Math.round(base64Data.length * 0.75);
}

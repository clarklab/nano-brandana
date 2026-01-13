export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number
): Promise<string> {
  const img = new Image();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  return new Promise((resolve, reject) => {
    img.onload = () => {
      let { width, height } = img;
      
      // Calculate new dimensions
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw resized image
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to base64
      resolve(canvas.toDataURL(file.type, 0.9));
    };
    
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const byteString = atob(parts[1]);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  
  return new Blob([arrayBuffer], { type: mime });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function base64ToFile(base64: string, filename: string): File {
  const blob = base64ToBlob(base64);
  return new File([blob], filename, { type: blob.type });
}

/**
 * Resize a base64 image to exact dimensions.
 * Uses canvas to scale the image, with minimal cropping if aspect ratios differ.
 */
export async function resizeBase64ToExact(
  base64: string,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  const img = new Image();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  return new Promise((resolve, reject) => {
    img.onload = () => {
      const srcWidth = img.width;
      const srcHeight = img.height;

      // Calculate scale to cover the target area (may need cropping)
      const scale = Math.max(targetWidth / srcWidth, targetHeight / srcHeight);
      const scaledWidth = srcWidth * scale;
      const scaledHeight = srcHeight * scale;

      // Calculate crop offset to center the image
      const offsetX = (scaledWidth - targetWidth) / 2;
      const offsetY = (scaledHeight - targetHeight) / 2;

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // Draw scaled and cropped image
      ctx.drawImage(
        img,
        -offsetX / scale, // source x (in original image coords)
        -offsetY / scale, // source y
        targetWidth / scale, // source width
        targetHeight / scale, // source height
        0, // dest x
        0, // dest y
        targetWidth, // dest width
        targetHeight // dest height
      );

      // Get mime type from original base64
      const mimeMatch = base64.match(/data:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

      resolve(canvas.toDataURL(mimeType, 0.92));
    };

    img.onerror = () => reject(new Error('Failed to load image for resize'));
    img.src = base64;
  });
}

/**
 * Find the closest supported aspect ratio for given dimensions.
 */
export function findClosestRatio(width: number, height: number): string {
  const targetRatio = width / height;
  const ratios: Record<string, number> = {
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

  let closest = '1:1';
  let minDiff = Infinity;

  for (const [name, ratio] of Object.entries(ratios)) {
    const diff = Math.abs(ratio - targetRatio);
    if (diff < minDiff) {
      minDiff = diff;
      closest = name;
    }
  }

  return closest;
}

/**
 * Determine the optimal quality tier based on target dimensions.
 */
export function getQualityForSize(width: number, height: number): '1K' | '2K' | '4K' {
  const maxDim = Math.max(width, height);
  if (maxDim <= 1024) return '1K';
  if (maxDim <= 2048) return '2K';
  return '4K';
}
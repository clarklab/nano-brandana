// Pricing for Google Gemini models via Vercel AI Gateway
// Using actual Vercel dashboard pricing (as of January 2025)

const VERCEL_COST_PER_IMAGE_1K_2K = 0.134; // USD per 1K or 2K image
const VERCEL_COST_PER_IMAGE_4K = 0.24; // USD per 4K image

// ============================================
// HUMAN TIME ESTIMATES
// Estimated time (in minutes) a skilled human would take
// to manually perform equivalent image editing tasks
// ============================================

// Default time estimates for various image operations (minutes)
// These are rough estimates for a competent designer/editor
export const HUMAN_TIME_ESTIMATES = {
  // Basic operations
  BACKGROUND_REMOVAL: 15,      // Manual masking, refining edges
  COLOR_ADJUSTMENT: 8,         // Selecting elements, adjusting colors
  UPSCALING: 5,               // Finding right settings, quality check
  DESATURATION: 3,            // Simple adjustment layer

  // Complex operations
  STYLE_TRANSFER: 25,         // Manual recreation in different style
  IMAGE_DUPLICATION: 20,      // Creating variations manually
  COMPOSITE_EDITING: 30,      // Working with multiple images

  // Default for generic/unknown operations
  DEFAULT: 10,                // Average general editing task
} as const;

// Average human time per image (minutes) - used as a simple default
export const AVERAGE_HUMAN_TIME_PER_IMAGE = 10;

export function calculateTokenCost(
  _promptTokens: number,
  _completionTokens: number,
  _model: string,
  imageCount: number = 1,
  imageSize?: string
): number {
  // Use Vercel's pricing based on image resolution
  const costPerImage = imageSize === '4K'
    ? VERCEL_COST_PER_IMAGE_4K
    : VERCEL_COST_PER_IMAGE_1K_2K;

  return costPerImage * imageCount;
}

export function calculateTimeSaved(): number {
  // Random time saved between 5-15 minutes per image
  // Weighted slightly toward higher values since complex edits take longer
  const weights = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const weightedWeights = [1, 1, 2, 2, 3, 3, 3, 2, 2, 1, 1]; // Bell curve favoring 8-12 minutes
  
  let totalWeight = weightedWeights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < weights.length; i++) {
    random -= weightedWeights[i];
    if (random <= 0) {
      return weights[i];
    }
  }
  
  return 10; // fallback
}

export function formatTime(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export function formatUSD(amount: number): string {
  if (amount < 0.01) {
    return `$${(amount * 100).toFixed(2)}`;
  }
  return `$${amount.toFixed(2)}`;
}

/**
 * Calculate the money saved by using AI instead of manual editing
 * @param timeSavedMinutes - Time saved in minutes
 * @param hourlyRate - User's hourly rate (USD)
 * @returns Money saved in USD
 */
export function calculateMoneySaved(timeSavedMinutes: number, hourlyRate: number): number {
  const hoursSaved = timeSavedMinutes / 60;
  return hoursSaved * hourlyRate;
}

/**
 * Format money saved as a compact string
 * @param amount - Amount in USD
 * @returns Formatted string (e.g., "$8.33" or "$125")
 */
export function formatMoneySaved(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  if (amount >= 100) {
    return `$${Math.round(amount)}`;
  }
  if (amount >= 1) {
    return `$${amount.toFixed(2)}`;
  }
  // For sub-dollar amounts, show cents
  return `$${amount.toFixed(2)}`;
}
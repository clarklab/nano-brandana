import { supabase, isSupabaseConfigured } from './supabase';

export interface ProcessImageRequest {
  image?: string; // Optional - omit for text-only generation
  images?: string[]; // Multiple images for Single Job mode
  instruction: string;
  model?: string;
  stream?: boolean;
  imageSize?: '1K' | '2K' | '4K';
  mode?: 'batch' | 'singleJob'; // Processing mode
}

export interface ProcessImageResponse {
  images: string[];
  content?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  providerMetadata?: any;
  elapsed: number;
  model?: string;
  imageSize?: string;
  tokens_remaining?: number;
}

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export async function processImage(
  request: ProcessImageRequest
): Promise<ProcessImageResponse> {
  // Get auth token if Supabase is configured
  let authToken: string | undefined;
  if (isSupabaseConfigured) {
    const { data: { session } } = await supabase.auth.getSession();
    authToken = session?.access_token;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Include auth token if available
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch('/.netlify/functions/process-image', {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    
    // Handle specific error cases with user-friendly messages
    if (response.status === 403 && error.message) {
      throw new APIError(
        error.message,
        response.status,
        error.details
      );
    }
    
    throw new APIError(
      error.error || `HTTP ${response.status}`,
      response.status,
      error.details
    );
  }

  return response.json();
}

export function validateImageData(imageData: string): boolean {
  if (!imageData || typeof imageData !== 'string') {
    return false;
  }
  
  // Check if it's a valid data URL for an image
  if (!imageData.startsWith('data:image/')) {
    return false;
  }
  
  // Check if it has reasonable length (at least 100 characters for a tiny image)
  if (imageData.length < 100) {
    return false;
  }
  
  // Check if the base64 part looks valid
  const base64Part = imageData.split(',')[1];
  if (!base64Part || base64Part.length < 50) {
    return false;
  }
  
  // Try to decode a small portion to verify it's valid base64
  try {
    atob(base64Part.substring(0, 100));
    return true;
  } catch (e) {
    return false;
  }
}

function shouldRetry(error: any, attemptNumber: number): boolean {
  if (error instanceof APIError) {
    // Always retry rate limits
    if (error.status === 429) return true;
    
    // Retry server errors (500-599)
    if (error.status >= 500) return true;
    
    // Don't retry client errors (400-499, except 429)
    if (error.status >= 400 && error.status < 500) return false;
  }
  
  // For validation errors, be more selective
  if (error.message === 'Result validation failed') {
    // Only retry validation failures on first few attempts
    return attemptNumber < 2;
  }
  
  // Retry network errors and unknown errors
  return true;
}

function getRetryDelay(error: any, attemptNumber: number, initialDelay: number): number {
  let baseDelay = initialDelay;
  
  if (error instanceof APIError) {
    // Longer delays for server errors
    if (error.status >= 500) {
      baseDelay = Math.max(2000, initialDelay);
    }
    
    // Very long delays for rate limits
    if (error.status === 429) {
      baseDelay = Math.max(5000, initialDelay);
    }
  }
  
  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attemptNumber);
  const jitter = Math.random() * 1000; // Add up to 1s random delay
  return exponentialDelay + jitter;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  validator?: (result: T) => boolean
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn();
      
      // If validator is provided and result fails validation, treat as error
      if (validator && !validator(result)) {
        throw new Error('Result validation failed');
      }
      
      return result;
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${i + 1}/${maxRetries} failed:`, error instanceof Error ? error.message : error);
      
      // Check if we should retry this error
      if (!shouldRetry(error, i)) {
        console.log('Not retrying due to error type:', error);
        throw error;
      }
      
      // Wait before retrying
      if (i < maxRetries - 1) {
        const delay = getRetryDelay(error, i, initialDelay);
        console.log(`Waiting ${delay.toFixed(0)}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}
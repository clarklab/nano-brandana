import { supabase, isSupabaseConfigured } from './supabase';

// Edge Function v2 is now the default (no timeout on upstream waits)
// Disable via URL param: ?edge-v2=false (escape hatch for rollback)
function shouldUseEdgeV2(): boolean {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    // Only check for explicit disable
    if (urlParams.get('edge-v2') === 'false') {
      localStorage.setItem('use-edge-v2', 'false');
      return false;
    }
    // Check if explicitly disabled in localStorage
    if (localStorage.getItem('use-edge-v2') === 'false') {
      return false;
    }
  }
  // Default: use Edge v2
  return true;
}

export interface ProcessImageRequest {
  image?: string; // Optional - omit for text-only generation
  images?: string[]; // Multiple images for Single Job mode
  referenceImages?: string[]; // Reference images from presets (max 3)
  instruction: string;
  model?: string;
  stream?: boolean;
  imageSize?: '1K' | '2K' | '4K';
  aspectRatio?: string | null;
  mode?: 'batch' | 'singleJob'; // Processing mode
  batchId?: string; // Groups logs from a single batch run
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

// Strip raw JSON, gateway prefixes, and truncate long error messages
function cleanErrorMessage(msg: string): string {
  let cleaned = msg || 'Unknown error';

  // Strip common gateway prefixes
  cleaned = cleaned.replace(/^(AI Gateway error|Netlify AI Gateway error):\s*/i, '');

  // If the message looks like raw JSON, extract just the error message
  if (cleaned.includes('{')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed?.error?.message) cleaned = parsed.error.message;
      else if (typeof parsed?.error === 'string') cleaned = parsed.error;
    } catch {
      // Not valid JSON — strip any JSON fragments
      cleaned = cleaned.replace(/\{[\s\S]*\}/g, '').trim() || 'Request failed';
    }
  }

  // Truncate long messages
  if (cleaned.length > 120) cleaned = cleaned.substring(0, 120) + '...';

  return cleaned;
}

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: any
  ) {
    super(cleanErrorMessage(message));
    this.name = 'APIError';
  }
}

// Generate unique request ID for tracing across retries
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// === Auth Token Cache ===
// Cache the auth token to avoid repeated getSession() calls during polling

let cachedAuthToken: string | null = null;
let tokenExpiry: number = 0;

async function getCachedAuthToken(): Promise<string | undefined> {
  const now = Date.now();

  // Return cached token if still valid (5 minute cache)
  if (cachedAuthToken && tokenExpiry > now) {
    return cachedAuthToken;
  }

  // Refresh token
  if (isSupabaseConfigured) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      cachedAuthToken = session.access_token;
      tokenExpiry = now + 5 * 60 * 1000; // Cache for 5 minutes
      return cachedAuthToken;
    }
  }

  // No token available
  cachedAuthToken = null;
  tokenExpiry = 0;
  return undefined;
}

// === Async Job Queue API ===

export interface EnqueueJobRequest {
  image?: string;
  images?: string[];
  referenceImages?: string[];
  instruction: string;
  model?: string;
  imageSize?: '1K' | '2K' | '4K';
  aspectRatio?: string | null;
  mode?: 'batch' | 'singleJob';
  batchId?: string;
  requestId?: string;
}

export interface EnqueueJobResponse {
  jobId: string;
  requestId: string;
  status: 'pending';
  tokens_remaining: number;
}

export interface JobStatusResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout';
  elapsed: number;
  retryAfter: number;
  retryCount: number;
  // Present when completed
  images?: string[];
  content?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  // Present when failed/timeout
  error?: string;
  errorCode?: string;
}

export async function enqueueJob(
  request: EnqueueJobRequest
): Promise<EnqueueJobResponse> {
  // Get auth token if Supabase is configured
  let authToken: string | undefined;
  if (isSupabaseConfigured) {
    const { data: { session } } = await supabase.auth.getSession();
    authToken = session?.access_token;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch('/api/enqueue-job', {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new APIError(
      error.error || error.message || `HTTP ${response.status}`,
      response.status,
      error.details
    );
  }

  return response.json();
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  // Use cached auth token (avoids repeated getSession calls during polling)
  const authToken = await getCachedAuthToken();

  const headers: Record<string, string> = {};

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`/api/job-status?jobId=${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new APIError(
      error.error || `HTTP ${response.status}`,
      response.status,
      error.details
    );
  }

  return response.json();
}

// === Synchronous API (legacy) ===

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

  // Add requestId for server-side logging and tracing
  const requestWithId = {
    ...request,
    requestId: generateRequestId(),
  };

  // Edge v2 is default; v1 is fallback via ?edge-v2=false
  const useEdgeV2 = shouldUseEdgeV2();
  const endpoint = useEdgeV2
    ? '/api/process-image-v2'           // Edge Function (no timeout) - default
    : '/.netlify/functions/process-image'; // Legacy Node.js function

  if (!useEdgeV2) {
    console.log('[API] Using legacy v1 endpoint (edge-v2=false)');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestWithId),
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

/**
 * Log a local resize (free) job to the database.
 * This is a fire-and-forget operation - failures won't affect the user.
 */
export async function logResizeJob(params: {
  batchId?: string;
  imageSize?: '1K' | '2K' | '4K';
  imagesCount?: number;
  elapsedMs?: number;
  aspectRatio?: string | null;
  customWidth?: number;
  customHeight?: number;
}): Promise<void> {
  try {
    // Get auth token if available
    let authToken: string | undefined;
    if (isSupabaseConfigured) {
      const { data: { session } } = await supabase.auth.getSession();
      authToken = session?.access_token;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Fire and forget - don't await or throw errors
    fetch('/.netlify/functions/log-resize', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    }).catch((err) => {
      console.warn('Failed to log resize job:', err);
    });
  } catch (err) {
    console.warn('Failed to initiate resize job logging:', err);
  }
}
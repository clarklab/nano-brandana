export interface ProcessImageRequest {
  image: string;
  instruction: string;
  model?: string;
  stream?: boolean;
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
  const response = await fetch('/.netlify/functions/process-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (except rate limit)
      if (error instanceof APIError && error.status >= 400 && error.status < 500 && error.status !== 429) {
        throw error;
      }
      
      // Wait before retrying
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}
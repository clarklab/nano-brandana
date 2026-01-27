// Edge Function - Get job status for polling
// Path: /api/job-status (accepts ?jobId=xxx query param)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Context {
  geo?: { city?: string; country?: { code?: string } };
}

// CORS helper
function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  };

  if (origin) {
    const siteUrl = Deno.env.get('URL') || '';
    const isAllowed = origin.includes('netlify.app') ||
                      origin.includes('localhost') ||
                      origin.includes('peel.diy') ||  // Custom domain
                      origin === siteUrl ||
                      siteUrl.includes(origin.replace(/^https?:\/\//, ''));
    if (isAllowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    }
  }

  return headers;
}

export default async function handler(request: Request, _context: Context) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: corsHeaders }
    );
  }

  // Environment variables
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable' }),
      { status: 503, headers: corsHeaders }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // AUTH: Verify user authentication
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Authentication required' }),
      { status: 401, headers: corsHeaders }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  let userId: string;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: corsHeaders }
      );
    }
    userId = user.id;
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Authentication failed' }),
      { status: 401, headers: corsHeaders }
    );
  }

  // Get job ID from query params
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    return new Response(
      JSON.stringify({ error: 'Missing jobId parameter' }),
      { status: 400, headers: corsHeaders }
    );
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(jobId)) {
    return new Response(
      JSON.stringify({ error: 'Invalid jobId format' }),
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // Fetch job from pending_jobs (user can only see their own jobs via RLS)
    const { data: job, error: fetchError } = await supabase
      .from('pending_jobs')
      .select('id, status, result_images, result_content, usage, error_code, error_message, created_at, started_at, completed_at, retry_count')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Calculate elapsed time
    const createdAt = new Date(job.created_at).getTime();
    const now = Date.now();
    const elapsed = job.completed_at
      ? new Date(job.completed_at).getTime() - createdAt
      : now - createdAt;

    // Determine retry hint based on status
    let retryAfter = 3000; // Default 3s polling interval
    if (job.status === 'processing') {
      retryAfter = 2000; // Poll faster when actively processing
    } else if (job.status === 'completed' || job.status === 'failed' || job.status === 'timeout') {
      retryAfter = 0; // No need to poll anymore
    }

    const response: Record<string, unknown> = {
      jobId: job.id,
      status: job.status,
      elapsed,
      retryAfter,
      retryCount: job.retry_count || 0,
    };

    // Include results if completed
    if (job.status === 'completed') {
      response.images = job.result_images || [];
      response.content = job.result_content || '';
      response.usage = job.usage || null;
    }

    // Include error info if failed
    if (job.status === 'failed' || job.status === 'timeout') {
      response.error = job.error_message || 'Unknown error';
      response.errorCode = job.error_code || 'UNKNOWN';
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Job status error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: corsHeaders }
    );
  }
}

export const config = {
  path: '/api/job-status',
};

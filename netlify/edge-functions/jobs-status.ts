// Edge Function - Get status for multiple jobs in one request
// Path: /api/jobs-status (POST with jobIds array)

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
                      origin.includes('peel.diy') ||
                      origin === siteUrl ||
                      siteUrl.includes(origin.replace(/^https?:\/\//, ''));
    if (isAllowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
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

  if (request.method !== 'POST') {
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

  // Parse request body
  let jobIds: string[];
  try {
    const body = await request.json();
    jobIds = body.jobIds;
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'jobIds array required' }),
        { status: 400, headers: corsHeaders }
      );
    }
    // Limit to 50 jobs per request
    if (jobIds.length > 50) {
      jobIds = jobIds.slice(0, 50);
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // Fetch all jobs in one query
    console.log('Fetching jobs:', { userId, jobCount: jobIds.length });
    const { data: jobs, error: fetchError } = await supabase
      .from('pending_jobs')
      .select('id, status, result_images, result_content, usage, error_code, error_message, created_at, started_at, completed_at, retry_count')
      .eq('user_id', userId)
      .in('id', jobIds);

    if (fetchError) {
      console.error('Batch job fetch error:', {
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
      });
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch jobs',
          code: fetchError.code,
          details: fetchError.message,
        }),
        { status: 500, headers: corsHeaders }
      );
    }
    console.log('Fetched jobs:', { found: jobs?.length || 0 });

    const now = Date.now();
    const results: Record<string, unknown> = {};

    // Create a map for quick lookup
    const jobMap = new Map(jobs?.map(job => [job.id, job]) || []);

    for (const jobId of jobIds) {
      const job = jobMap.get(jobId);

      if (!job) {
        results[jobId] = { status: 'not_found', error: 'Job not found' };
        continue;
      }

      // Calculate elapsed time
      const createdAt = new Date(job.created_at).getTime();
      const elapsed = job.completed_at
        ? new Date(job.completed_at).getTime() - createdAt
        : now - createdAt;

      const jobResult: Record<string, unknown> = {
        status: job.status,
        elapsed,
        retryCount: job.retry_count || 0,
      };

      // Include results if completed
      if (job.status === 'completed') {
        jobResult.images = job.result_images || [];
        jobResult.content = job.result_content || '';
        jobResult.usage = job.usage || null;
      }

      // Include error info if failed
      if (job.status === 'failed' || job.status === 'timeout') {
        jobResult.error = job.error_message || 'Unknown error';
        jobResult.errorCode = job.error_code || 'UNKNOWN';
      }

      results[jobId] = jobResult;
    }

    return new Response(
      JSON.stringify({ jobs: results }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Batch job status error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: corsHeaders }
    );
  }
}

export const config = {
  path: '/api/jobs-status',
};

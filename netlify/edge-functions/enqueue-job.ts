// Edge Function - Enqueue job for async processing
// Returns immediately with job ID, job processed in background
// Path: /api/enqueue-job

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Context {
  geo?: { city?: string; country?: { code?: string } };
}

const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_INSTRUCTION_LENGTH = 10000;
const TOKENS_PER_JOB = 1500; // Estimated tokens to deduct upfront

// CORS helper
function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  };

  if (origin) {
    const isAllowed = origin.includes('netlify.app') ||
                      origin.includes('localhost') ||
                      origin === Deno.env.get('URL');
    if (isAllowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    }
  }

  return headers;
}

// Gateway detection helpers (same as process-image.ts)
function getGatewayType(model: string | undefined): string {
  if (model?.startsWith('byo/')) return 'byo';
  if (model?.startsWith('netlify/')) return 'netlify';
  if (model?.startsWith('direct/')) return 'direct';
  return 'vercel';
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
  const SITE_URL = Deno.env.get('URL') || Deno.env.get('DEPLOY_URL');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('SECURITY ERROR: Supabase not configured');
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
      JSON.stringify({ error: 'Authentication required. Please sign in.' }),
      { status: 401, headers: corsHeaders }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  let userId: string;
  let userProfile: { tokens_remaining: number; gemini_api_key?: string };

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session. Please sign in again.' }),
        { status: 401, headers: corsHeaders }
      );
    }

    userId = user.id;

    // Get user's token balance
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tokens_remaining, gemini_api_key')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { status: 500, headers: corsHeaders }
      );
    }

    userProfile = profile;
  } catch (err) {
    console.error('Auth verification failed:', err);
    return new Response(
      JSON.stringify({ error: 'Authentication failed' }),
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const body = await request.json();
    const {
      image,
      images,
      referenceImages,
      instruction,
      model,
      imageSize = '1K',
      aspectRatio = null,
      mode = 'batch',
      batchId,
      requestId,
    } = body;

    // Validate instruction
    if (!instruction) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: instruction' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (typeof instruction !== 'string' || instruction.length > MAX_INSTRUCTION_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Instruction must be max ${MAX_INSTRUCTION_LENGTH} characters` }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get all images
    const allImages: string[] = images || (image ? [image] : []);
    const refImages: string[] = referenceImages || [];

    // Validate image sizes
    for (let i = 0; i < allImages.length; i++) {
      const img = allImages[i];
      if (img.length * 0.75 > MAX_IMAGE_SIZE) {
        return new Response(
          JSON.stringify({ error: `Image ${i + 1} too large. Maximum: 4MB` }),
          { status: 400, headers: corsHeaders }
        );
      }
    }

    for (let i = 0; i < refImages.length; i++) {
      const img = refImages[i];
      if (img.length * 0.75 > MAX_IMAGE_SIZE) {
        return new Response(
          JSON.stringify({ error: `Reference image ${i + 1} too large. Maximum: 4MB` }),
          { status: 400, headers: corsHeaders }
        );
      }
    }

    const gatewayType = getGatewayType(model);
    const isByo = gatewayType === 'byo';

    // Check BYO key if needed
    if (isByo && !userProfile.gemini_api_key) {
      return new Response(
        JSON.stringify({ error: 'No API key configured. Add your key in settings.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Check token balance (skip for BYO)
    if (!isByo && userProfile.tokens_remaining < TOKENS_PER_JOB) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient tokens',
          tokens_remaining: userProfile.tokens_remaining,
          message: 'You have run out of tokens. Please contact support for more.'
        }),
        { status: 402, headers: corsHeaders }
      );
    }

    // Generate unique request ID
    const jobRequestId = requestId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Deduct tokens upfront (skip for BYO)
    let newTokenBalance = userProfile.tokens_remaining;
    if (!isByo) {
      try {
        const { data: updateResult } = await supabase.rpc('deduct_tokens', {
          user_id: userId,
          amount: TOKENS_PER_JOB
        });
        if (updateResult && updateResult[0]) {
          newTokenBalance = updateResult[0].new_balance;
        }
      } catch (err) {
        console.error('Token deduction failed:', err);
        return new Response(
          JSON.stringify({ error: 'Failed to process payment' }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Insert job into pending_jobs table
    const { data: job, error: insertError } = await supabase
      .from('pending_jobs')
      .insert({
        user_id: userId,
        request_id: jobRequestId,
        batch_id: batchId || null,
        status: 'pending',
        instruction,
        images: allImages.length > 0 ? allImages : null,
        reference_images: refImages.length > 0 ? refImages : null,
        model: model || null,
        image_size: imageSize,
        aspect_ratio: aspectRatio,
        mode,
      })
      .select('id')
      .single();

    if (insertError || !job) {
      console.error('Failed to insert job:', insertError);
      // Refund tokens on failure
      if (!isByo) {
        await supabase.rpc('deduct_tokens', {
          user_id: userId,
          amount: -TOKENS_PER_JOB // Negative = refund
        }).catch(console.error);
      }
      return new Response(
        JSON.stringify({ error: 'Failed to queue job' }),
        { status: 500, headers: corsHeaders }
      );
    }

    console.log('Job enqueued:', { jobId: job.id, requestId: jobRequestId, userId });

    // Trigger background function (fire-and-forget)
    // The background function will pick up pending jobs
    const backgroundUrl = `${SITE_URL}/.netlify/functions/process-job-background`;
    fetch(backgroundUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id }),
    }).catch(err => {
      console.error('Failed to trigger background function:', err);
      // Job will still be processed by polling/retry mechanism
    });

    // Return immediately with job ID
    return new Response(
      JSON.stringify({
        jobId: job.id,
        requestId: jobRequestId,
        status: 'pending',
        tokens_remaining: newTokenBalance,
      }),
      { status: 202, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Enqueue error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
}

export const config = {
  path: '/api/enqueue-job',
};

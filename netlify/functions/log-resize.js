/**
 * Lightweight endpoint to log local resize (free) jobs to the database.
 * These jobs are processed entirely client-side and don't use the AI API,
 * but we still want to track them in user job logs for visibility.
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Allowed origins for CORS (production + local dev)
const ALLOWED_ORIGINS = [
  process.env.URL,
  process.env.DEPLOY_PRIME_URL,
  'http://localhost:8889',
  'http://localhost:3000',
].filter(Boolean);

// Create Supabase admin client
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// Helper to get CORS origin
function getCorsOrigin(requestOrigin) {
  if (!requestOrigin) return null;
  const isAllowed = ALLOWED_ORIGINS.some(allowed =>
    requestOrigin === allowed ||
    (allowed && requestOrigin.startsWith(allowed.replace(/\/$/, '')))
  );
  const isNetlifyPreview = /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(requestOrigin) ||
                           /^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(requestOrigin);
  return (isAllowed || isNetlifyPreview) ? requestOrigin : null;
}

// Helper to extract user ID from JWT
async function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      console.error('Token validation error:', error);
      return null;
    }
    return user.id;
  } catch (err) {
    console.error('Token validation failed:', err);
    return null;
  }
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsOrigin = getCorsOrigin(requestOrigin);

  const headers = {
    'Content-Type': 'application/json',
    ...(corsOrigin && {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }),
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  if (!supabaseAdmin) {
    console.error('Supabase not configured');
    return {
      statusCode: 200, // Don't fail the request, just skip logging
      headers,
      body: JSON.stringify({ success: true, logged: false }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      batchId,
      imageSize,
      imagesCount,
      elapsedMs,
      aspectRatio,
      customWidth,
      customHeight,
    } = body;

    // Get user ID from auth token (optional - guests won't have this)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const userId = await getUserIdFromToken(authHeader);

    // Log the resize job
    const { error } = await supabaseAdmin.rpc('log_job', {
      p_user_id: userId,
      p_request_id: `resize-${Date.now()}`,
      p_mode: 'resize',
      p_image_size: imageSize || '1K',
      p_model: 'local-resize',
      p_images_submitted: imagesCount || 1,
      p_instruction_length: 0,
      p_total_input_bytes: 0,
      p_images_returned: imagesCount || 1,
      p_prompt_tokens: 0,
      p_completion_tokens: 0,
      p_total_tokens: 0,
      p_elapsed_ms: elapsedMs || 0,
      p_status: 'success',
      p_error_code: null,
      p_error_message: null,
      p_tokens_charged: 0,
      p_token_balance_before: null,
      p_token_balance_after: null,
      p_batch_id: batchId || null,
    });

    if (error) {
      console.error('Log resize job error:', error);
      // Don't fail - logging is best-effort
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, logged: !error }),
    };
  } catch (err) {
    console.error('Log resize handler error:', err);
    return {
      statusCode: 200, // Don't fail the request
      headers,
      body: JSON.stringify({ success: true, logged: false }),
    };
  }
};

/**
 * Netlify Function: get-admin-activities
 * Fetches unified activity log for admin dashboard
 *
 * Query parameters:
 *   timeRange: '1h' | '24h' | '7d' | '30d' | 'all' (default: '24h')
 *   activityType: 'all' | 'auth' | 'jobs' | 'purchases' (default: 'all')
 *   status: 'all' | 'success' | 'error' (default: 'all')
 *   userEmail: optional email filter (partial match on domain)
 *   limit: max results to return (default: 500, max: 1000)
 */

import { createClient } from '@supabase/supabase-js';

// Admin emails list
const ADMIN_EMAILS = ['clark@clarklab.net'];

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  process.env.URL,
  process.env.DEPLOY_PRIME_URL,
  'http://localhost:8889',
  'http://localhost:3000',
].filter(Boolean);

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

// Convert time range to timestamp
function getTimestampForRange(range) {
  const now = new Date();
  switch (range) {
    case '1h':
      return new Date(now - 60 * 60 * 1000).toISOString();
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    case 'all':
      return new Date(0).toISOString(); // Unix epoch
    default:
      return new Date(now - 24 * 60 * 60 * 1000).toISOString(); // Default 24h
  }
}

export const handler = async (event, context) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsOrigin = getCorsOrigin(requestOrigin);

  const securityHeaders = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...(corsOrigin && {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    }),
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: securityHeaders,
      body: '',
    };
  }

  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: securityHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Initialize Supabase
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return {
        statusCode: 500,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Extract JWT token from Authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Missing or invalid authorization header' })
      };
    }

    const token = authHeader.substring(7);

    // Create client with user's token to verify authentication
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // Verify user is authenticated and is an admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Check if user is admin
    if (!ADMIN_EMAILS.includes(user.email)) {
      return {
        statusCode: 403,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Forbidden: Admin access required' })
      };
    }

    // Parse query parameters
    const params = event.queryStringParameters || {};
    const timeRange = params.timeRange || '24h';
    const activityType = params.activityType || 'all';
    const statusFilter = params.status || 'all';
    const userEmail = params.userEmail || null;
    const limit = Math.min(parseInt(params.limit || '500', 10), 1000);

    const since = getTimestampForRange(timeRange);

    // Use service role client for admin queries (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch activities based on type filter
    const activities = [];

    // 1. Fetch auth events (if requested)
    if (activityType === 'all' || activityType === 'auth') {
      let authQuery = adminSupabase
        .from('auth_events')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (userEmail) {
        authQuery = authQuery.ilike('email_domain', `%${userEmail}%`);
      }

      const { data: authEvents, error: authError } = await authQuery;

      if (!authError && authEvents) {
        authEvents.forEach(event => {
          // Determine if this is a success or error
          const isError = event.event_type.includes('error') ||
                          event.event_type.includes('failed') ||
                          event.event_type.includes('timeout') ||
                          event.error_code !== null;
          const isSuccess = event.event_type === 'auth_completed';

          // Apply status filter
          if (statusFilter === 'all' ||
              (statusFilter === 'error' && isError) ||
              (statusFilter === 'success' && isSuccess)) {
            activities.push({
              id: event.id,
              timestamp: event.created_at,
              type: 'auth',
              subtype: event.event_type,
              email_domain: event.email_domain,
              session_id: event.session_id,
              status: isError ? 'error' : (isSuccess ? 'success' : 'pending'),
              error_code: event.error_code,
              error_message: event.error_message,
              metadata: event.metadata,
              user_agent: event.user_agent,
            });
          }
        });
      }
    }

    // 2. Fetch job logs (if requested)
    if (activityType === 'all' || activityType === 'jobs') {
      let jobQuery = adminSupabase
        .from('job_logs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Note: email filter disabled - no direct FK from job_logs to profiles
      // if (userEmail) {
      //   jobQuery = jobQuery.or(`profiles.email.ilike.%${userEmail}%,user_id.is.null`);
      // }

      if (statusFilter !== 'all') {
        jobQuery = jobQuery.eq('status', statusFilter);
      }

      const { data: jobLogs, error: jobError } = await jobQuery;

      if (jobError) {
        console.error('Job logs query error:', jobError.message, jobError.details, jobError.hint);
      }

      if (jobLogs) {
        console.log('Job logs fetched:', jobLogs.length);
        jobLogs.forEach(job => {
          activities.push({
            id: job.id,
            timestamp: job.created_at,
            type: 'job',
            subtype: job.mode,
            // email omitted - no FK join available
            user_id: job.user_id,
            batch_id: job.batch_id,
            status: job.status,
            images_submitted: job.images_submitted,
            images_returned: job.images_returned,
            image_size: job.image_size,
            model: job.model,
            total_tokens: job.total_tokens,
            tokens_charged: job.tokens_charged,
            elapsed_ms: job.elapsed_ms,
            error_code: job.error_code,
            error_message: job.error_message,
          });
        });
      }
    }

    // 3. Fetch token purchases (if requested)
    if (activityType === 'all' || activityType === 'purchases') {
      let purchaseQuery = adminSupabase
        .from('token_purchases')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Note: email filter disabled - no direct FK from token_purchases to profiles
      // if (userEmail) {
      //   purchaseQuery = purchaseQuery.or(`profiles.email.ilike.%${userEmail}%,user_id.is.null`);
      // }

      if (statusFilter !== 'all') {
        purchaseQuery = purchaseQuery.eq('status', statusFilter === 'success' ? 'completed' : statusFilter);
      }

      const { data: purchases, error: purchaseError } = await purchaseQuery;

      if (purchaseError) {
        console.error('Purchases query error:', purchaseError.message, purchaseError.details, purchaseError.hint);
      }

      if (purchases) {
        console.log('Purchases fetched:', purchases.length);
        purchases.forEach(purchase => {
          activities.push({
            id: purchase.id,
            timestamp: purchase.created_at,
            type: 'purchase',
            subtype: purchase.payment_provider,
            // email omitted - no FK join available
            user_id: purchase.user_id,
            status: purchase.status === 'completed' ? 'success' : purchase.status,
            amount_usd: purchase.amount_usd,
            tokens_purchased: purchase.tokens_purchased,
            provider_transaction_id: purchase.provider_transaction_id,
          });
        });
      }
    }

    // Sort all activities by timestamp (newest first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit to requested number
    const limitedActivities = activities.slice(0, limit);

    // Calculate summary stats
    const stats = {
      total: limitedActivities.length,
      auth: limitedActivities.filter(a => a.type === 'auth').length,
      jobs: limitedActivities.filter(a => a.type === 'job').length,
      purchases: limitedActivities.filter(a => a.type === 'purchase').length,
      success: limitedActivities.filter(a => a.status === 'success').length,
      error: limitedActivities.filter(a => a.status === 'error').length,
      warning: limitedActivities.filter(a => a.status === 'warning').length,
      pending: limitedActivities.filter(a => a.status === 'pending').length,
    };

    return {
      statusCode: 200,
      headers: securityHeaders,
      body: JSON.stringify({
        activities: limitedActivities,
        stats,
        filters: {
          timeRange,
          activityType,
          status: statusFilter,
          userEmail,
          limit,
        },
      })
    };

  } catch (error) {
    console.error('Error in get-admin-activities:', error);
    return {
      statusCode: 500,
      headers: securityHeaders,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

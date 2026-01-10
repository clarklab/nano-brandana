/**
 * Netlify Function: log-auth-event
 * Logs authentication flow events for debugging magic link failures
 *
 * Request body: {
 *   event_type: 'magic_link_requested' | 'callback_received' | 'callback_error' |
 *               'auth_completed' | 'auth_failed' | 'session_timeout' | 'token_refresh_failed',
 *   email?: string,           // Will be hashed before storage
 *   session_id: string,       // Anonymous session ID
 *   error_code?: string,
 *   error_message?: string,
 *   metadata?: object
 * }
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// Valid event types
const VALID_EVENT_TYPES = [
  'magic_link_requested',
  'callback_received',
  'callback_error',
  'auth_completed',
  'auth_failed',
  'session_timeout',
  'token_refresh_failed'
];

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

// Hash email for privacy
function hashEmail(email) {
  if (!email) return null;
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

// Extract domain from email
function getEmailDomain(email) {
  if (!email) return null;
  const parts = email.toLowerCase().trim().split('@');
  return parts.length === 2 ? parts[1] : null;
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
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: securityHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      event_type,
      email,
      session_id,
      error_code,
      error_message,
      metadata = {}
    } = body;

    // Validate event type
    if (!event_type || !VALID_EVENT_TYPES.includes(event_type)) {
      return {
        statusCode: 400,
        headers: securityHeaders,
        body: JSON.stringify({
          error: 'Invalid event_type',
          valid_types: VALID_EVENT_TYPES
        })
      };
    }

    // Validate session_id
    if (!session_id || typeof session_id !== 'string') {
      return {
        statusCode: 400,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'session_id is required' })
      };
    }

    // Initialize Supabase with service role (bypasses RLS)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return {
        statusCode: 500,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user agent from headers
    const userAgent = event.headers['user-agent'] || null;

    // Build the event record
    const authEvent = {
      event_type,
      email_hash: hashEmail(email),
      email_domain: getEmailDomain(email),
      session_id,
      user_agent: userAgent ? userAgent.substring(0, 500) : null, // Truncate long user agents
      error_code: error_code || null,
      error_message: error_message ? error_message.substring(0, 500) : null, // Truncate
      metadata: {
        ...metadata,
        referrer: event.headers.referer || event.headers.Referer || null,
        timestamp_client: metadata.timestamp || null,
      }
    };

    // Insert the event
    const { error: insertError } = await supabase
      .from('auth_events')
      .insert(authEvent);

    if (insertError) {
      console.error('Failed to log auth event:', insertError);
      // Don't fail the request - logging should be fire-and-forget
      // But return success so client doesn't retry unnecessarily
      return {
        statusCode: 200,
        headers: securityHeaders,
        body: JSON.stringify({ logged: false, reason: 'db_error' })
      };
    }

    console.log(`Auth event logged: ${event_type} for session ${session_id}`);

    return {
      statusCode: 200,
      headers: securityHeaders,
      body: JSON.stringify({ logged: true })
    };

  } catch (error) {
    console.error('Error in log-auth-event:', error);

    // Still return 200 - we don't want auth logging failures to break the auth flow
    return {
      statusCode: 200,
      headers: securityHeaders,
      body: JSON.stringify({ logged: false, reason: 'exception' })
    };
  }
};

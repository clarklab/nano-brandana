/**
 * Auth Flow Tracking
 *
 * Tracks each step of the magic link authentication flow for debugging.
 * Events are logged to the auth_events table via the log-auth-event Netlify function.
 *
 * Flow tracked:
 * 1. magic_link_requested - User submits email
 * 2. callback_received - App detects auth token in URL
 * 3. callback_error - Auth callback has error in URL
 * 4. auth_completed - Session successfully established
 * 5. auth_failed - Session failed to establish
 * 6. session_timeout - Session establishment timed out
 * 7. token_refresh_failed - Token refresh failed
 */

// Session ID storage key
const AUTH_SESSION_KEY = 'peel-auth-session-id';

// API endpoint
const LOG_ENDPOINT = '/.netlify/functions/log-auth-event';

// Event types
export type AuthEventType =
  | 'magic_link_requested'
  | 'callback_received'
  | 'callback_error'
  | 'auth_completed'
  | 'auth_failed'
  | 'session_timeout'
  | 'token_refresh_failed';

interface AuthEventPayload {
  event_type: AuthEventType;
  email?: string;
  session_id: string;
  error_code?: string;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Generate a random session ID for correlating auth events
 */
function generateSessionId(): string {
  // Use crypto API if available, fallback to Math.random
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create a session ID for tracking auth flow
 * Creates a new session ID on magic_link_requested, reuses for subsequent events
 */
export function getAuthSessionId(forceNew = false): string {
  if (!forceNew) {
    const existing = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (existing) return existing;
  }

  const newId = generateSessionId();
  sessionStorage.setItem(AUTH_SESSION_KEY, newId);
  return newId;
}

/**
 * Clear the auth session ID (call after successful auth or on sign out)
 */
export function clearAuthSessionId(): void {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

/**
 * Log an auth event to the backend
 * Fire-and-forget - doesn't block or throw
 */
export async function logAuthEvent(
  eventType: AuthEventType,
  options: {
    email?: string;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
    forceNewSession?: boolean;
  } = {}
): Promise<void> {
  const { email, errorCode, errorMessage, metadata = {}, forceNewSession = false } = options;

  // Get or create session ID
  const sessionId = getAuthSessionId(forceNewSession && eventType === 'magic_link_requested');

  const payload: AuthEventPayload = {
    event_type: eventType,
    session_id: sessionId,
    ...(email && { email }),
    ...(errorCode && { error_code: errorCode }),
    ...(errorMessage && { error_message: errorMessage }),
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    },
  };

  try {
    // Fire and forget - don't await or handle errors
    fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch((err) => {
      // Silently ignore network errors - don't break auth flow
      console.debug('[AuthTracking] Failed to log event:', eventType, err);
    });
  } catch (err) {
    // Silently ignore - auth tracking should never break auth
    console.debug('[AuthTracking] Error preparing event:', eventType, err);
  }
}

/**
 * Track magic link request
 * Call when user submits their email for a magic link
 */
export function trackMagicLinkRequested(email: string): void {
  logAuthEvent('magic_link_requested', {
    email,
    forceNewSession: true, // Start a new tracking session
  });
}

/**
 * Track callback received
 * Call when detecting auth callback parameters in URL
 */
export function trackCallbackReceived(): void {
  logAuthEvent('callback_received');
}

/**
 * Track callback error
 * Call when auth callback has error parameters
 */
export function trackCallbackError(errorCode: string, errorMessage?: string): void {
  logAuthEvent('callback_error', {
    errorCode,
    errorMessage,
  });
}

/**
 * Track successful authentication
 * Call when session is successfully established
 */
export function trackAuthCompleted(email?: string): void {
  logAuthEvent('auth_completed', { email });
  // Clear session ID after successful auth
  clearAuthSessionId();
}

/**
 * Track failed authentication
 * Call when session establishment fails
 */
export function trackAuthFailed(errorCode?: string, errorMessage?: string): void {
  logAuthEvent('auth_failed', {
    errorCode,
    errorMessage,
  });
}

/**
 * Track session timeout
 * Call when waiting for session times out
 */
export function trackSessionTimeout(): void {
  logAuthEvent('session_timeout');
}

/**
 * Track token refresh failure
 * Call when token refresh fails
 */
export function trackTokenRefreshFailed(errorCode?: string, errorMessage?: string): void {
  logAuthEvent('token_refresh_failed', {
    errorCode,
    errorMessage,
  });
}

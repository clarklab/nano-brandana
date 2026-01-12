const COOKIE_NAME = 'peel_logged_in';
const COOKIE_DOMAIN = '.peel.diy';

/**
 * Set a cookie on the parent domain (.peel.diy) to indicate logged-in state.
 * This allows the marketing site (peel.diy) to detect auth state from banana.peel.diy.
 */
export function setAuthCookie() {
  document.cookie = `${COOKIE_NAME}=1; domain=${COOKIE_DOMAIN}; path=/; max-age=31536000; secure; samesite=lax`;
}

/**
 * Clear the auth cookie when user logs out.
 */
export function clearAuthCookie() {
  document.cookie = `${COOKIE_NAME}=; domain=${COOKIE_DOMAIN}; path=/; max-age=0; secure; samesite=lax`;
}

/**
 * Auth debugging utilities
 * Use these to diagnose authentication issues
 */

import { supabase } from './supabase';

export interface AuthDebugInfo {
  hasSession: boolean;
  userId: string | null;
  userEmail: string | null;
  sessionExpiresAt: string | null;
  localStorageKeys: string[];
  storageSize: number;
}

/**
 * Get current auth debug information
 * Useful for diagnosing persistence issues
 */
export async function getAuthDebugInfo(): Promise<AuthDebugInfo> {
  const { data: { session } } = await supabase.auth.getSession();

  // Get all auth-related localStorage keys
  const authKeys: string[] = [];
  let totalSize = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('peel-auth') || key.startsWith('sb-') || key.includes('supabase'))) {
        authKeys.push(key);
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      }
    }
  } catch (err) {
    console.error('[getAuthDebugInfo] Error reading localStorage:', err);
  }

  return {
    hasSession: !!session,
    userId: session?.user?.id || null,
    userEmail: session?.user?.email || null,
    sessionExpiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
    localStorageKeys: authKeys,
    storageSize: totalSize,
  };
}

/**
 * Log auth debug info to console
 * Call this when diagnosing auth issues
 */
export async function logAuthDebugInfo(): Promise<void> {
  console.group('🔍 Auth Debug Info');

  const info = await getAuthDebugInfo();

  console.log('Session exists:', info.hasSession);
  console.log('User ID:', info.userId || 'none');
  console.log('User email:', info.userEmail || 'none');
  console.log('Session expires:', info.sessionExpiresAt || 'none');
  console.log('Auth localStorage keys:', info.localStorageKeys);
  console.log('Total storage size:', `${(info.storageSize / 1024).toFixed(2)} KB`);

  // Check for potential issues
  const warnings: string[] = [];

  if (!info.hasSession && info.localStorageKeys.length > 0) {
    warnings.push('⚠️  No session but localStorage has auth data (possibly corrupted)');
  }

  if (info.sessionExpiresAt) {
    const expiresAt = new Date(info.sessionExpiresAt);
    const now = new Date();
    if (expiresAt < now) {
      warnings.push('⚠️  Session has expired');
    } else {
      const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      console.log('Hours until expiry:', hoursUntilExpiry.toFixed(2));
    }
  }

  if (warnings.length > 0) {
    console.warn('Issues detected:');
    warnings.forEach(w => console.warn(w));
  } else {
    console.log('✅ No issues detected');
  }

  console.groupEnd();
}

/**
 * Add this to window for easy debugging in browser console
 * Usage: window.debugAuth()
 */
if (typeof window !== 'undefined') {
  (window as any).debugAuth = logAuthDebugInfo;
  console.log('💡 Auth debug available: run window.debugAuth() in console');
}

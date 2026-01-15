import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, Profile, JobLog, isSupabaseConfigured } from '../lib/supabase';
import { trackAuthCompleted, trackAuthFailed, trackSessionTimeout } from '../lib/auth-tracking';
import { setAuthCookie, clearAuthCookie } from '../lib/auth-cookie';

interface TokenAnimationState {
  from: number;
  to: number;
  isAnimating: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  jobLogs: JobLog[];
  loading: boolean;
  isConfigured: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshJobLogs: () => Promise<void>;
  updateTokenBalance: (newBalance: number) => void;
  updateHourlyRate: (rate: number | null) => Promise<boolean>;
  // Token animation support
  tokenAnimation: TokenAnimationState | null;
  triggerTokenAnimation: (from: number, to: number) => void;
  clearTokenAnimation: () => void;
  // BYO API key support
  hasOwnApiKey: boolean;
  updateGeminiApiKey: (key: string | null) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobLogs, setJobLogs] = useState<JobLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenAnimation, setTokenAnimation] = useState<TokenAnimationState | null>(null);

  // Debug logging for state changes
  console.log('[AuthProvider] Render - loading:', loading, 'user:', user?.email || 'null', 'session:', session ? 'exists' : 'null');

  // Helper to clear corrupted auth state
  const clearCorruptedAuthState = () => {
    console.log('[clearCorruptedAuthState] Clearing potentially corrupted auth data');
    try {
      // Clear all Supabase auth-related items from localStorage
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('peel-auth') || key.startsWith('sb-') || key.includes('supabase'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        console.log('[clearCorruptedAuthState] Removing:', key);
        localStorage.removeItem(key);
      });
    } catch (err) {
      console.error('[clearCorruptedAuthState] Error:', err);
    }
  };

  const fetchProfile = async (userId: string, userEmail?: string, retryCount = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second between retries

    console.log('[fetchProfile] Starting for user:', userId, retryCount > 0 ? `(retry ${retryCount}/${MAX_RETRIES})` : '');
    if (!isSupabaseConfigured) {
      console.log('[fetchProfile] Supabase not configured, skipping');
      return;
    }

    try {
      console.log('[fetchProfile] About to query Supabase...');

      // Add timeout protection - Supabase queries can hang on session restore
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Profile fetch timeout after 10s')), 10000);
      });

      const queryPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      console.log('[fetchProfile] Query created, awaiting...');
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any;
      console.log('[fetchProfile] Query returned, error:', error || 'none');

      if (error) {
        console.error('[fetchProfile] Error:', error);

        // Retry if we haven't exhausted retries (profile might not exist yet due to race condition)
        if (retryCount < MAX_RETRIES) {
          console.log(`[fetchProfile] Retrying in ${RETRY_DELAY}ms...`);
          setTimeout(() => fetchProfile(userId, userEmail, retryCount + 1), RETRY_DELAY);
          return;
        }

        // If profile doesn't exist but we have user info, create a minimal profile object
        // This can happen if the profile wasn't created yet or there's a DB issue
        if (userEmail) {
          console.log('[fetchProfile] Using fallback profile with user email after all retries');
          setProfile({
            id: userId,
            email: userEmail,
            tokens_remaining: 0,
            tokens_used: 0,
            last_login: new Date().toISOString(),
            created_at: new Date().toISOString(),
            hourly_rate: null,
          });
        }
        return;
      }

      console.log('[fetchProfile] Success, tokens_remaining:', data?.tokens_remaining);
      setProfile(data);
    } catch (err) {
      console.error('[fetchProfile] Catch error:', err);

      // Retry on timeout/error if we haven't exhausted retries
      if (retryCount < MAX_RETRIES) {
        console.log(`[fetchProfile] Retrying in ${RETRY_DELAY}ms after error...`);
        setTimeout(() => fetchProfile(userId, userEmail, retryCount + 1), RETRY_DELAY);
        return;
      }

      // On timeout or error, set fallback profile so UI isn't broken
      if (userEmail) {
        console.log('[fetchProfile] Setting fallback profile after error and all retries');
        setProfile({
          id: userId,
          email: userEmail,
          tokens_remaining: 0,
          tokens_used: 0,
          last_login: new Date().toISOString(),
          created_at: new Date().toISOString(),
          hourly_rate: null,
        });
      }
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id, user.email);
    }
  };

  const updateTokenBalance = (newBalance: number) => {
    if (profile && typeof newBalance === 'number') {
      setProfile(prev => prev ? {
        ...prev,
        tokens_remaining: newBalance,
        tokens_used: prev.tokens_used + (prev.tokens_remaining - newBalance)
      } : null);
    }
  };

  const triggerTokenAnimation = (from: number, to: number) => {
    if (from < to) {
      console.log('[triggerTokenAnimation] Starting animation from', from, 'to', to);
      setTokenAnimation({ from, to, isAnimating: true });
    }
  };

  const clearTokenAnimation = () => {
    console.log('[clearTokenAnimation] Clearing animation state');
    setTokenAnimation(null);
  };

  const updateHourlyRate = async (rate: number | null): Promise<boolean> => {
    if (!user || !isSupabaseConfigured) {
      console.log('[updateHourlyRate] No user or Supabase not configured');
      return false;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ hourly_rate: rate })
        .eq('id', user.id);

      if (error) {
        console.error('[updateHourlyRate] Error:', error);
        return false;
      }

      // Update local state
      setProfile(prev => prev ? { ...prev, hourly_rate: rate } : null);
      console.log('[updateHourlyRate] Success, new rate:', rate);
      return true;
    } catch (err) {
      console.error('[updateHourlyRate] Catch error:', err);
      return false;
    }
  };

  const updateGeminiApiKey = async (key: string | null): Promise<boolean> => {
    if (!user || !isSupabaseConfigured) {
      console.log('[updateGeminiApiKey] No user or Supabase not configured');
      return false;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ gemini_api_key: key })
        .eq('id', user.id);

      if (error) {
        console.error('[updateGeminiApiKey] Error:', error);
        return false;
      }

      // Update local state with masked key (never store real key in client state)
      setProfile(prev => prev ? { ...prev, gemini_api_key: key ? '****' : null } : null);
      console.log('[updateGeminiApiKey] Success, key:', key ? 'set' : 'removed');
      return true;
    } catch (err) {
      console.error('[updateGeminiApiKey] Catch error:', err);
      return false;
    }
  };

  const fetchJobLogs = async (userId: string) => {
    if (!isSupabaseConfigured) return;

    try {
      const { data, error } = await supabase
        .from('job_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[fetchJobLogs] Error:', error);
        return;
      }

      setJobLogs(data || []);
    } catch (err) {
      console.error('[fetchJobLogs] Catch error:', err);
    }
  };

  const refreshJobLogs = async () => {
    if (user) {
      await fetchJobLogs(user.id);
    }
  };

  useEffect(() => {
    console.log('[AuthProvider useEffect] Starting, isSupabaseConfigured:', isSupabaseConfigured);

    if (!isSupabaseConfigured) {
      console.log('[AuthProvider useEffect] Supabase not configured, setting loading=false');
      setLoading(false);
      return;
    }

    let isMounted = true;

    // Get initial session with timeout protection
    console.log('[AuthProvider useEffect] Calling getSession...');

    const getSessionWithTimeout = async () => {
      try {
        // Timeout after 5 seconds
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('getSession timeout after 5s')), 5000);
        });

        const sessionPromise = supabase.auth.getSession();
        console.log('[getSession] Promise created, racing with timeout...');

        const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);
        console.log('[getSession] Completed - session:', session ? 'found' : 'none', 'error:', error || 'none');

        if (!isMounted) {
          console.log('[getSession] Component unmounted, skipping state updates');
          return;
        }

        if (error) {
          console.error('[getSession] Error:', error);
          // Clear corrupted state on error
          clearCorruptedAuthState();
          setLoading(false);
          return;
        }

        console.log('[getSession] Setting session and user, then loading=false');
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          console.log('[getSession] User found, fetching profile for:', session.user.email);
          // Don't await - let it run in background
          fetchProfile(session.user.id, session.user.email);
        }
        setLoading(false);
        console.log('[getSession] Done, loading should now be false');
      } catch (error) {
        console.error('[getSession] Catch error (timeout or other):', error);
        if (isMounted) {
          // Track the session timeout
          if (error instanceof Error && error.message.includes('timeout')) {
            trackSessionTimeout();
          } else {
            trackAuthFailed('session_error', error instanceof Error ? error.message : 'Unknown error');
          }
          // Clear potentially corrupted auth data on timeout
          console.log('[getSession] Clearing auth state due to timeout/error');
          clearCorruptedAuthState();
          setLoading(false);
        }
      }
    };

    getSessionWithTimeout();

    // Listen for auth changes
    console.log('[AuthProvider useEffect] Setting up onAuthStateChange listener');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[onAuthStateChange] Event:', event, 'session:', session ? 'exists' : 'null', 'user:', session?.user?.email || 'null');

        if (!isMounted) {
          console.log('[onAuthStateChange] Component unmounted, skipping');
          return;
        }

        // Handle specific events
        if (event === 'SIGNED_IN') {
          console.log('[onAuthStateChange] User signed in successfully');
          // Track successful auth completion
          trackAuthCompleted(session?.user?.email);
          // Set cross-domain auth cookie for marketing site
          setAuthCookie();
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            fetchProfile(session.user.id, session.user.email);
            fetchJobLogs(session.user.id);
          }
          setLoading(false);
          return;
        } else if (event === 'TOKEN_REFRESHED') {
          console.log('[onAuthStateChange] Token refreshed successfully');
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          return;
        } else if (event === 'SIGNED_OUT') {
          console.log('[onAuthStateChange] User signed out, clearing state');
          clearCorruptedAuthState();
          // Clear cross-domain auth cookie
          clearAuthCookie();
          setSession(null);
          setUser(null);
          setProfile(null);
          setJobLogs([]);
          setLoading(false);
          return;
        } else if (event === 'USER_UPDATED') {
          console.log('[onAuthStateChange] User updated');
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            fetchProfile(session.user.id, session.user.email);
          }
          setLoading(false);
          return;
        }

        console.log('[onAuthStateChange] Updating session and user state');
        setSession(session);
        setUser(session?.user ?? null);

        // Also ensure loading is false when we get a valid auth event
        setLoading(false);

        if (session?.user) {
          console.log('[onAuthStateChange] Fetching profile for:', session.user.email);
          // Don't await - fire and forget to avoid blocking the callback
          fetchProfile(session.user.id, session.user.email);
        } else {
          console.log('[onAuthStateChange] No user, clearing profile');
          setProfile(null);
        }
      }
    );

    return () => {
      console.log('[AuthProvider useEffect] Cleanup - unsubscribing');
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    console.log('[signOut] Signing out user');
    try {
      await supabase.auth.signOut();
      // Explicitly clear auth state
      clearCorruptedAuthState();
      // Clear cross-domain auth cookie
      clearAuthCookie();
      setSession(null);
      setUser(null);
      setProfile(null);
      setJobLogs([]);
    } catch (error) {
      console.error('[signOut] Error during sign out:', error);
      // Force clear state even on error
      clearCorruptedAuthState();
      clearAuthCookie();
      setSession(null);
      setUser(null);
      setProfile(null);
      setJobLogs([]);
    }
  };

  return (
    <AuthContext.Provider value={{
      session,
      user,
      profile,
      jobLogs,
      loading,
      isConfigured: isSupabaseConfigured,
      signOut,
      refreshProfile,
      refreshJobLogs,
      updateTokenBalance,
      updateHourlyRate,
      tokenAnimation,
      triggerTokenAnimation,
      clearTokenAnimation,
      hasOwnApiKey: !!profile?.gemini_api_key,
      updateGeminiApiKey,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

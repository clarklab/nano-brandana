import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, Profile, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isConfigured: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateTokenBalance: (newBalance: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Debug logging for state changes
  console.log('[AuthProvider] Render - loading:', loading, 'user:', user?.email || 'null', 'session:', session ? 'exists' : 'null');

  const fetchProfile = async (userId: string, userEmail?: string) => {
    console.log('[fetchProfile] Starting for user:', userId);
    if (!isSupabaseConfigured) {
      console.log('[fetchProfile] Supabase not configured, skipping');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[fetchProfile] Error:', error);
        // If profile doesn't exist but we have user info, create a minimal profile object
        // This can happen if the profile wasn't created yet or there's a DB issue
        if (userEmail) {
          console.log('[fetchProfile] Using fallback profile with user email');
          setProfile({
            id: userId,
            email: userEmail,
            tokens_remaining: 0,
            tokens_used: 0,
            last_login: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        }
        return;
      }

      console.log('[fetchProfile] Success, tokens_remaining:', data?.tokens_remaining);
      setProfile(data);
    } catch (err) {
      console.error('[fetchProfile] Catch error:', err);
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

  useEffect(() => {
    console.log('[AuthProvider useEffect] Starting, isSupabaseConfigured:', isSupabaseConfigured);

    if (!isSupabaseConfigured) {
      console.log('[AuthProvider useEffect] Supabase not configured, setting loading=false');
      setLoading(false);
      return;
    }

    let isMounted = true;

    // Get initial session
    console.log('[AuthProvider useEffect] Calling getSession...');
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('[getSession] Completed - session:', session ? 'found' : 'none', 'error:', error || 'none');

      if (!isMounted) {
        console.log('[getSession] Component unmounted, skipping state updates');
        return;
      }

      if (error) {
        console.error('[getSession] Error:', error);
        supabase.auth.signOut();
        setLoading(false);
        return;
      }

      console.log('[getSession] Setting session and user, then loading=false');
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('[getSession] User found, fetching profile for:', session.user.email);
        fetchProfile(session.user.id, session.user.email);
      }
      setLoading(false);
      console.log('[getSession] Done, loading should now be false');
    }).catch((error) => {
      console.error('[getSession] Catch error:', error);
      if (isMounted) {
        supabase.auth.signOut();
        setLoading(false);
      }
    });

    // Listen for auth changes
    console.log('[AuthProvider useEffect] Setting up onAuthStateChange listener');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[onAuthStateChange] Event:', event, 'session:', session ? 'exists' : 'null', 'user:', session?.user?.email || 'null');

        if (!isMounted) {
          console.log('[onAuthStateChange] Component unmounted, skipping');
          return;
        }

        // Handle specific events
        if (event === 'TOKEN_REFRESHED') {
          console.log('[onAuthStateChange] Token refreshed successfully');
        } else if (event === 'SIGNED_OUT') {
          console.log('[onAuthStateChange] User signed out, clearing state');
          setSession(null);
          setUser(null);
          setProfile(null);
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
          await fetchProfile(session.user.id, session.user.email);
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
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      session,
      user,
      profile,
      loading,
      isConfigured: isSupabaseConfigured,
      signOut,
      refreshProfile,
      updateTokenBalance
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

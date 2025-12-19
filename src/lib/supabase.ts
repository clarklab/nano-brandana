import { createClient } from '@supabase/supabase-js';

// Using SB_ prefix to avoid Netlify's secret detection (these are public keys, not secrets)
const supabaseUrl = import.meta.env.VITE_SB_URL;
const supabaseAnonKey = import.meta.env.VITE_SB_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not configured. Auth will be disabled.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Check if Supabase is properly configured
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Type for our profile
export interface Profile {
  id: string;
  email: string;
  tokens_remaining: number;
  tokens_used: number;
  last_login: string;
  created_at: string;
}

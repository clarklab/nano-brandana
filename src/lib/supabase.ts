import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not configured. Auth will be disabled.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      storageKey: 'nano-brandana-auth',
      storage: window.localStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
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

// Type for job logs
export interface JobLog {
  id: string;
  user_id: string;
  request_id: string;
  created_at: string;
  mode: 'batch' | 'singleJob';
  image_size: '1K' | '2K' | '4K' | null;
  model: string | null;
  images_submitted: number;
  instruction_length: number | null;
  total_input_bytes: number | null;
  images_returned: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  elapsed_ms: number | null;
  status: 'pending' | 'success' | 'error';
  error_code: string | null;
  error_message: string | null;
  tokens_charged: number | null;
  token_balance_after: number | null;
}

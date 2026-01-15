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
      storageKey: 'peel-auth',
      storage: window.localStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce', // Use PKCE flow for better security and persistence
      debug: false,
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
  hourly_rate: number | null; // User's hourly rate for "money saved" calculations
  gemini_api_key?: string | null; // BYO key - user's own Google Gemini API key (masked on client)
}

// Default hourly rate for guests or users who haven't set one (USD)
export const DEFAULT_HOURLY_RATE = 100;

// Type for job logs
export interface JobLog {
  id: string;
  user_id: string;
  request_id: string;
  batch_id: string | null;
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
  token_balance_before: number | null;
  token_balance_after: number | null;
}

/**
 * User-customizable task preset.
 * Presets can be either 'direct' (immediately apply a prompt) or 'ask' (show a follow-up question).
 *
 * For 'ask' type presets:
 * - ask_message: The question shown to the user
 * - prompt: Template with {{INPUT}} placeholder for user's response
 * - display_text_template: Template for the instruction list (e.g., "Add brand color {{INPUT}}")
 * - validation_type: 'number' | 'text' | 'color' | null
 *
 * Reference images (up to 3):
 * - ref_image_1_url, ref_image_2_url, ref_image_3_url: URLs to reference images in Supabase Storage
 * - These images are sent along with the main image to the AI for context
 */
export interface UserPreset {
  id: string;
  user_id: string;
  label: string;
  icon: string | null;
  display_order: number;
  preset_type: 'direct' | 'ask';
  prompt: string;
  ask_message: string | null;
  display_text_template: string | null;
  response_confirmation: string | null;
  validation_type: 'number' | 'text' | 'color' | null;
  validation_min: number | null;
  validation_max: number | null;
  validation_error_message: string | null;
  is_default: boolean;
  is_hidden: boolean;
  show_in_main_view: boolean;
  ref_image_1_url: string | null;
  ref_image_2_url: string | null;
  ref_image_3_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Default presets that all users start with.
 * These match the original hardcoded QUICK_PRESETS but in the new configurable format.
 *
 * NOTE: When a user hasn't customized their presets, these defaults are used.
 * Users can modify, reorder, hide, or add new presets via the PresetConfigModal.
 */
export const DEFAULT_PRESETS: Omit<UserPreset, 'id' | 'user_id' | 'created_at' | 'updated_at'>[] = [
  {
    label: 'Remove BG',
    icon: 'hide_image',
    display_order: 0,
    preset_type: 'direct',
    prompt: 'Remove the background and make it transparent',
    ask_message: null,
    display_text_template: null,
    response_confirmation: null,
    validation_type: null,
    validation_min: null,
    validation_max: null,
    validation_error_message: null,
    is_default: true,
    is_hidden: false,
    show_in_main_view: true,
    ref_image_1_url: null,
    ref_image_2_url: null,
    ref_image_3_url: null,
  },
  {
    label: 'Add Brand Color',
    icon: 'palette',
    display_order: 1,
    preset_type: 'ask',
    prompt: 'Identify the most suitable clothing item, accessory, object, or surface in the image and change it to {{INPUT}} in a natural way that enhances the overall composition. Choose elements that would realistically be found in that color and avoid changing skin tones, faces, or core identifying features.',
    ask_message: 'What brand color would you like me to add? (e.g., "bright red", "navy blue", "forest green", "#FF5733")',
    display_text_template: 'Add brand color {{INPUT}}',
    response_confirmation: "Perfect! I'll add {{INPUT}} branding to your images by changing suitable objects to that color. Added to the instruction list.",
    validation_type: 'color',
    validation_min: null,
    validation_max: null,
    validation_error_message: null,
    is_default: true,
    is_hidden: false,
    show_in_main_view: true,
    ref_image_1_url: null,
    ref_image_2_url: null,
    ref_image_3_url: null,
  },
  {
    label: 'Duplicate',
    icon: 'content_copy',
    display_order: 2,
    preset_type: 'ask',
    prompt: 'Generate exactly {{INPUT}} variations of this scene from these angles: {{ANGLES}}. Keep the same subjects and scene. IMPORTANT: You must generate exactly {{INPUT}} images, no more, no less.',
    ask_message: 'How many more photos do you want me to create from each scene? (Enter a number between 1-10)',
    display_text_template: 'Make {{INPUT}} more photos from this scene',
    response_confirmation: "Great! I'll create {{INPUT}} additional realistic photo variations of each scene. Added to the instruction list.",
    validation_type: 'number',
    validation_min: 1,
    validation_max: 10,
    validation_error_message: 'Please enter a number between 1 and 10 for how many additional photos you want.',
    is_default: true,
    is_hidden: false,
    show_in_main_view: true,
    ref_image_1_url: null,
    ref_image_2_url: null,
    ref_image_3_url: null,
  },
  {
    label: 'Upscale',
    icon: 'zoom_in',
    display_order: 3,
    preset_type: 'direct',
    prompt: 'Upscale the image and enhance details while maintaining the original quality and composition',
    ask_message: null,
    display_text_template: null,
    response_confirmation: null,
    validation_type: null,
    validation_min: null,
    validation_max: null,
    validation_error_message: null,
    is_default: true,
    is_hidden: false,
    show_in_main_view: true,
    ref_image_1_url: null,
    ref_image_2_url: null,
    ref_image_3_url: null,
  },
  {
    label: 'Transform',
    icon: 'auto_awesome',
    display_order: 4,
    preset_type: 'ask',
    prompt: 'Transform this image into {{INPUT}} while maintaining the core composition, subjects, and scene. Apply the visual characteristics, textures, colors, and artistic techniques typical of {{INPUT}}. Ensure the transformation feels authentic to the chosen style while preserving all important elements and details from the original image.',
    ask_message: 'What style would you like me to transform your images to? (e.g., "claymation style", "comic book style", "watercolor painting", "vintage film photography", "oil painting")',
    display_text_template: 'Transform to {{INPUT}}',
    response_confirmation: "Excellent! I'll transform your images to {{INPUT}}. This will apply the visual style while keeping all your subjects and composition intact. Added to the instruction list.",
    validation_type: 'text',
    validation_min: null,
    validation_max: null,
    validation_error_message: null,
    is_default: true,
    is_hidden: false,
    show_in_main_view: true,
    ref_image_1_url: null,
    ref_image_2_url: null,
    ref_image_3_url: null,
  },
  {
    label: 'Desaturate',
    icon: 'filter_b_and_w',
    display_order: 5,
    preset_type: 'direct',
    prompt: 'Desaturate the image to make it more muted',
    ask_message: null,
    display_text_template: null,
    response_confirmation: null,
    validation_type: null,
    validation_min: null,
    validation_max: null,
    validation_error_message: null,
    is_default: true,
    is_hidden: false,
    show_in_main_view: true,
    ref_image_1_url: null,
    ref_image_2_url: null,
    ref_image_3_url: null,
  },
];

/**
 * Camera angles used for the Duplicate preset.
 * When a user requests N variations, the first N angles from this list are used.
 */
export const DUPLICATE_CAMERA_ANGLES = [
  'from the back view',
  'from a low angle looking up',
  'from a high angle looking down',
  'from the left side profile',
  'from the right side profile',
  'from a 45-degree angle',
  'from closer proximity portrait',
  'from further back with wider framing and lots of space',
];

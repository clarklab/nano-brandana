import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, UserPreset, DEFAULT_PRESETS, DUPLICATE_CAMERA_ANGLES, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Runtime preset type used by the Chat component.
 * This is a simplified version of UserPreset for easy consumption.
 */
export interface RuntimePreset {
  id: string;
  label: string;
  icon: string | null;
  displayOrder: number;
  presetType: 'direct' | 'ask';
  prompt: string;
  askMessage: string | null;
  displayTextTemplate: string | null;
  responseConfirmation: string | null;
  validationType: 'number' | 'text' | 'color' | null;
  validationMin: number | null;
  validationMax: number | null;
  validationErrorMessage: string | null;
  isDefault: boolean;
}

/**
 * Converts a database UserPreset to a RuntimePreset
 */
function toRuntimePreset(preset: UserPreset | Omit<UserPreset, 'id' | 'user_id' | 'created_at' | 'updated_at'>, index?: number): RuntimePreset {
  const id = 'id' in preset ? preset.id : `default-${index}`;
  return {
    id,
    label: preset.label,
    icon: preset.icon,
    displayOrder: preset.display_order,
    presetType: preset.preset_type,
    prompt: preset.prompt,
    askMessage: preset.ask_message,
    displayTextTemplate: preset.display_text_template,
    responseConfirmation: preset.response_confirmation,
    validationType: preset.validation_type,
    validationMin: preset.validation_min,
    validationMax: preset.validation_max,
    validationErrorMessage: preset.validation_error_message,
    isDefault: preset.is_default,
  };
}

/**
 * Processes the prompt template, replacing placeholders with user input.
 * Handles special cases like the Duplicate preset which needs {{ANGLES}}.
 */
export function processPromptTemplate(preset: RuntimePreset, userInput: string): string {
  let prompt = preset.prompt;

  // Replace {{INPUT}} with the user's input
  prompt = prompt.replace(/\{\{INPUT\}\}/g, userInput);

  // Special handling for Duplicate preset with {{ANGLES}}
  if (prompt.includes('{{ANGLES}}')) {
    const count = parseInt(userInput);
    if (!isNaN(count) && count > 0) {
      const selectedAngles = DUPLICATE_CAMERA_ANGLES.slice(0, Math.min(count, DUPLICATE_CAMERA_ANGLES.length));
      const angleList = selectedAngles.join(', ');
      const angleInstruction = count > DUPLICATE_CAMERA_ANGLES.length
        ? `${angleList}, and ${count - DUPLICATE_CAMERA_ANGLES.length} other creative angles`
        : angleList;
      prompt = prompt.replace(/\{\{ANGLES\}\}/g, angleInstruction);
    }
  }

  return prompt;
}

/**
 * Processes the display text template for the instruction list.
 */
export function processDisplayTextTemplate(preset: RuntimePreset, userInput: string): string {
  if (!preset.displayTextTemplate) {
    return preset.label;
  }
  return preset.displayTextTemplate.replace(/\{\{INPUT\}\}/g, userInput);
}

/**
 * Processes the confirmation message template.
 */
export function processConfirmationTemplate(preset: RuntimePreset, userInput: string): string {
  if (!preset.responseConfirmation) {
    return `Added to the instruction list.`;
  }
  return preset.responseConfirmation.replace(/\{\{INPUT\}\}/g, userInput);
}

/**
 * Validates user input based on the preset's validation rules.
 * Returns an error message if validation fails, or null if valid.
 */
export function validateInput(preset: RuntimePreset, userInput: string): string | null {
  if (!preset.validationType) {
    return null; // No validation required
  }

  const trimmedInput = userInput.trim();

  switch (preset.validationType) {
    case 'number': {
      const num = parseInt(trimmedInput);
      if (isNaN(num)) {
        return preset.validationErrorMessage || 'Please enter a valid number.';
      }
      if (preset.validationMin !== null && num < preset.validationMin) {
        return preset.validationErrorMessage || `Please enter a number at least ${preset.validationMin}.`;
      }
      if (preset.validationMax !== null && num > preset.validationMax) {
        return preset.validationErrorMessage || `Please enter a number at most ${preset.validationMax}.`;
      }
      return null;
    }
    case 'text':
      if (!trimmedInput) {
        return preset.validationErrorMessage || 'Please enter some text.';
      }
      return null;
    case 'color':
      if (!trimmedInput) {
        return preset.validationErrorMessage || 'Please enter a color.';
      }
      return null;
    default:
      return null;
  }
}

interface UseUserPresetsReturn {
  presets: RuntimePreset[];
  isLoading: boolean;
  error: string | null;
  savePreset: (preset: Partial<RuntimePreset> & { id?: string }) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  reorderPresets: (orderedIds: string[]) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  refreshPresets: () => Promise<void>;
}

/**
 * Hook for managing user presets.
 *
 * - For logged-in users: Loads/saves presets from Supabase
 * - For guests: Uses DEFAULT_PRESETS (read-only)
 *
 * Usage in Chat.tsx:
 * ```tsx
 * const { presets, savePreset, deletePreset, resetToDefaults } = useUserPresets();
 *
 * // To use a preset:
 * if (preset.presetType === 'direct') {
 *   onSendInstruction(preset.prompt);
 * } else {
 *   // Show the ask_message and wait for user input
 *   // Then use processPromptTemplate(preset, userInput)
 * }
 * ```
 */
export function useUserPresets(): UseUserPresetsReturn {
  const { user } = useAuth();
  const [dbPresets, setDbPresets] = useState<UserPreset[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build a map of default icons by label for fallback
  const defaultIconsByLabel = useMemo(() => {
    const map = new Map<string, string | null>();
    DEFAULT_PRESETS.forEach(p => {
      map.set(p.label.toLowerCase(), p.icon);
    });
    return map;
  }, []);

  // Convert to runtime presets, filtering hidden ones and sorting by display_order
  // Also fills in missing icons from defaults for backwards compatibility
  const presets = useMemo<RuntimePreset[]>(() => {
    if (dbPresets && dbPresets.length > 0) {
      return dbPresets
        .filter(p => !p.is_hidden)
        .sort((a, b) => a.display_order - b.display_order)
        .map(p => {
          const runtime = toRuntimePreset(p);
          // If icon is missing, try to get it from defaults by matching label
          if (!runtime.icon) {
            const defaultIcon = defaultIconsByLabel.get(p.label.toLowerCase());
            if (defaultIcon) {
              runtime.icon = defaultIcon;
            }
          }
          return runtime;
        });
    }
    // Fall back to defaults
    return DEFAULT_PRESETS.map((p, i) => toRuntimePreset(p, i));
  }, [dbPresets, defaultIconsByLabel]);

  // Fetch presets from database
  const fetchPresets = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setDbPresets(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('user_presets')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true });

      if (fetchError) {
        // Table might not exist yet - fall back to defaults
        console.warn('Could not fetch user presets:', fetchError.message);
        setDbPresets(null);
      } else {
        setDbPresets(data as UserPreset[]);
      }
    } catch (err) {
      console.error('Error fetching presets:', err);
      setError('Failed to load presets');
      setDbPresets(null);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // Save or update a preset
  const savePreset = useCallback(async (preset: Partial<RuntimePreset> & { id?: string }) => {
    if (!user || !isSupabaseConfigured) {
      throw new Error('Must be logged in to save presets');
    }

    const isNew = !preset.id || preset.id.startsWith('default-');

    // Convert runtime preset to database format
    const dbPreset: Partial<UserPreset> = {
      user_id: user.id,
      label: preset.label,
      icon: preset.icon ?? null,
      display_order: preset.displayOrder,
      preset_type: preset.presetType,
      prompt: preset.prompt,
      ask_message: preset.askMessage,
      display_text_template: preset.displayTextTemplate,
      response_confirmation: preset.responseConfirmation,
      validation_type: preset.validationType,
      validation_min: preset.validationMin,
      validation_max: preset.validationMax,
      validation_error_message: preset.validationErrorMessage,
      is_default: preset.isDefault ?? false,
      is_hidden: false,
    };

    if (isNew) {
      // If user has no presets yet, initialize with defaults first
      // This ensures adding a new preset doesn't replace all defaults
      if (!dbPresets || dbPresets.length === 0) {
        await initializeUserPresets(user.id);
      }

      // Insert new preset
      const { error: insertError } = await supabase
        .from('user_presets')
        .insert(dbPreset);

      if (insertError) throw insertError;
    } else {
      // Update existing preset
      const { error: updateError } = await supabase
        .from('user_presets')
        .update(dbPreset)
        .eq('id', preset.id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;
    }

    await fetchPresets();
  }, [user, fetchPresets]);

  // Delete a preset (soft delete by setting is_hidden = true)
  const deletePreset = useCallback(async (id: string) => {
    if (!user || !isSupabaseConfigured) {
      throw new Error('Must be logged in to delete presets');
    }

    // If it's a default preset ID (not in DB yet), we need to create it as hidden
    if (id.startsWith('default-')) {
      // First, ensure all defaults are in the DB for this user
      await initializeUserPresets(user.id);
      await fetchPresets();
      // Find the newly created preset by matching the index
      const defaultIndex = parseInt(id.replace('default-', ''));
      const defaultPreset = DEFAULT_PRESETS[defaultIndex];
      if (defaultPreset) {
        const { data } = await supabase
          .from('user_presets')
          .select('id')
          .eq('user_id', user.id)
          .eq('label', defaultPreset.label)
          .single();
        if (data) {
          id = data.id;
        }
      }
    }

    const { error: deleteError } = await supabase
      .from('user_presets')
      .update({ is_hidden: true })
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) throw deleteError;

    await fetchPresets();
  }, [user, fetchPresets]);

  // Reorder presets by updating display_order
  const reorderPresets = useCallback(async (orderedIds: string[]) => {
    if (!user || !isSupabaseConfigured) {
      throw new Error('Must be logged in to reorder presets');
    }

    // First ensure all presets are in the DB
    const hasDefaultIds = orderedIds.some(id => id.startsWith('default-'));
    if (hasDefaultIds) {
      await initializeUserPresets(user.id);
      await fetchPresets();
      // Need to re-map the IDs
      return;
    }

    // Update each preset's display_order
    const updates = orderedIds.map((id, index) =>
      supabase
        .from('user_presets')
        .update({ display_order: index })
        .eq('id', id)
        .eq('user_id', user.id)
    );

    await Promise.all(updates);
    await fetchPresets();
  }, [user, fetchPresets]);

  // Reset all presets to defaults
  const resetToDefaults = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      throw new Error('Must be logged in to reset presets');
    }

    // Delete all user's presets
    const { error: deleteError } = await supabase
      .from('user_presets')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) throw deleteError;

    // Re-initialize with defaults
    await initializeUserPresets(user.id);
    await fetchPresets();
  }, [user, fetchPresets]);

  return {
    presets,
    isLoading,
    error,
    savePreset,
    deletePreset,
    reorderPresets,
    resetToDefaults,
    refreshPresets: fetchPresets,
  };
}

/**
 * Initialize user presets with defaults if they don't have any.
 * Called when user first accesses preset configuration.
 */
async function initializeUserPresets(userId: string): Promise<void> {
  // Check if user already has presets
  const { data: existing } = await supabase
    .from('user_presets')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (existing && existing.length > 0) {
    return; // User already has presets
  }

  // Insert default presets for this user
  const defaultsWithUserId = DEFAULT_PRESETS.map(preset => ({
    ...preset,
    user_id: userId,
  }));

  const { error } = await supabase
    .from('user_presets')
    .insert(defaultsWithUserId);

  if (error) {
    console.error('Failed to initialize user presets:', error);
    throw error;
  }
}

export default useUserPresets;

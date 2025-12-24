# User-Editable Presets System

This document describes the user-editable preset task system in Nano Brandana.

## Overview

The preset system allows users to customize the quick action buttons (REMOVE BG, ADD BRAND COLOR, etc.) in the middle column of the application. Users can:

- Edit existing preset prompts and settings
- Add completely new custom presets
- Reorder presets
- Hide/delete presets
- Reset to defaults

## Architecture

### Database Schema

Presets are stored in the `user_presets` table in Supabase:

```sql
-- See: /supabase/migrations/001_user_presets.sql
CREATE TABLE user_presets (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  label VARCHAR(50),           -- Button label
  display_order INTEGER,       -- Order in UI
  preset_type VARCHAR(10),     -- 'direct' or 'ask'
  prompt TEXT,                 -- The instruction (with {{INPUT}} placeholder)
  ask_message TEXT,            -- Question for 'ask' type
  display_text_template VARCHAR(200),  -- Template for instruction list
  response_confirmation TEXT,  -- Confirmation message
  validation_type VARCHAR(20), -- 'number', 'text', 'color', or NULL
  validation_min INTEGER,
  validation_max INTEGER,
  validation_error_message TEXT,
  is_default BOOLEAN,          -- System default preset
  is_hidden BOOLEAN,           -- Soft delete
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Key Files

| File | Description |
|------|-------------|
| `src/lib/supabase.ts` | Type definitions (`UserPreset`), `DEFAULT_PRESETS`, `DUPLICATE_CAMERA_ANGLES` |
| `src/hooks/useUserPresets.ts` | Hook for loading/saving presets, helper functions |
| `src/components/PresetConfigModal.tsx` | Full-screen modal for editing presets |
| `src/components/Chat.tsx` | Uses presets, renders buttons and gear icon |
| `src/hooks/useUserPresets.test.ts` | Unit tests for preset functionality |
| `supabase/migrations/001_user_presets.sql` | Database migration |

## Preset Types

### Direct Presets
Immediately puts the prompt in the textarea for the user to review and submit.

Example: "Remove BG"
```typescript
{
  preset_type: 'direct',
  prompt: 'Remove the background and make it transparent'
}
```

### Ask Presets
Shows a follow-up question, then processes the user's response into the prompt.

Example: "Add Brand Color"
```typescript
{
  preset_type: 'ask',
  prompt: 'Change it to {{INPUT}} in a natural way...',
  ask_message: 'What brand color would you like?',
  display_text_template: 'Add brand color {{INPUT}}',
  validation_type: 'color'
}
```

## Template Placeholders

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{INPUT}}` | Replaced with user's response | "Change to {{INPUT}}" → "Change to red" |
| `{{ANGLES}}` | Replaced with camera angles list (Duplicate preset) | Auto-generates angle list based on count |

## Helper Functions

Located in `src/hooks/useUserPresets.ts`:

### `processPromptTemplate(preset, userInput)`
Replaces `{{INPUT}}` and `{{ANGLES}}` placeholders in the prompt.

### `processDisplayTextTemplate(preset, userInput)`
Generates the display text for the instruction list.

### `processConfirmationTemplate(preset, userInput)`
Generates the confirmation message shown after user responds.

### `validateInput(preset, userInput)`
Validates user input based on preset's validation rules. Returns error message or null.

## Default Presets

The system ships with 6 default presets (in `DEFAULT_PRESETS`):

1. **Remove BG** (direct) - Remove background, make transparent
2. **Add Brand Color** (ask, color validation) - Change objects to a color
3. **Duplicate** (ask, number 1-10) - Generate variations with camera angles
4. **Upscale** (direct) - Enhance image quality
5. **Transform** (ask, text) - Apply artistic styles
6. **Desaturate** (direct) - Make image more muted

## Flow for Ask-Type Presets

1. User clicks preset button (e.g., "ADD BRAND COLOR")
2. `handlePreset()` detects `preset_type === 'ask'`
3. Shows `ask_message` in chat: "What brand color would you like?"
4. Sets `waitingForPreset` state to the current preset
5. User types response (e.g., "navy blue")
6. `handleSend()` detects `waitingForPreset` is set
7. Validates input using `validateInput()`
8. If valid: processes prompt, sends instruction, shows confirmation
9. If invalid: shows error message, keeps waiting

## UI Components

### Preset Buttons
```tsx
{presets.map((preset) => (
  <button onClick={() => handlePreset(preset)}>
    {preset.label.toUpperCase()}
  </button>
))}
```

### Gear Icon (Opens Config Modal)
```tsx
<button onClick={() => setIsPresetConfigOpen(true)}>
  <GearIcon />
</button>
```

### PresetConfigModal
Full-screen modal with:
- List of all presets with edit/delete buttons
- "Add New" button
- "Reset to Defaults" button
- Form for editing individual presets

## Guest vs Authenticated Users

- **Guests**: Use `DEFAULT_PRESETS` (read-only, stored locally)
- **Authenticated**: Load from Supabase, can customize and save

## Testing

Run tests:
```bash
npm run test:run
```

Tests cover:
- Prompt template processing
- Display text template processing
- Confirmation message processing
- Input validation (number, text, color)
- Default presets structure
- Camera angles for Duplicate preset

## Migration Notes

To deploy the preset system:

1. Run the Supabase migration:
   ```sql
   -- Run contents of /supabase/migrations/001_user_presets.sql
   ```

2. Ensure Row Level Security policies are enabled

3. Deploy the frontend code

Existing users will automatically use `DEFAULT_PRESETS` until they customize.

## Extending the System

### Adding a New Default Preset

1. Add to `DEFAULT_PRESETS` array in `src/lib/supabase.ts`
2. Update `display_order` values if needed
3. Add tests in `src/hooks/useUserPresets.test.ts`

### Adding New Validation Types

1. Add type to `validation_type` in TypeScript interface
2. Update `validateInput()` function
3. Update PresetConfigModal validation options
4. Add tests

### Adding New Template Placeholders

1. Update `processPromptTemplate()` function
2. Document in modal help text
3. Add tests

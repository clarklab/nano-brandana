import { describe, it, expect } from 'vitest';
import {
  processPromptTemplate,
  processDisplayTextTemplate,
  processConfirmationTemplate,
  validateInput,
  RuntimePreset,
} from './useUserPresets';
import { DEFAULT_PRESETS, DUPLICATE_CAMERA_ANGLES } from '../lib/supabase';

/**
 * Unit tests for user preset functionality.
 *
 * These tests ensure that the preset system works correctly:
 * - Prompt templates are processed correctly with user input
 * - Validation rules work as expected
 * - Default presets match the original hardcoded behavior
 */

// Helper to create a mock RuntimePreset
function createMockPreset(overrides: Partial<RuntimePreset> = {}): RuntimePreset {
  return {
    id: 'test-1',
    label: 'Test Preset',
    displayOrder: 0,
    presetType: 'direct',
    prompt: 'Test prompt',
    askMessage: null,
    displayTextTemplate: null,
    responseConfirmation: null,
    validationType: null,
    validationMin: null,
    validationMax: null,
    validationErrorMessage: null,
    isDefault: false,
    ...overrides,
  };
}

describe('processPromptTemplate', () => {
  it('should replace {{INPUT}} with user input', () => {
    const preset = createMockPreset({
      prompt: 'Change the color to {{INPUT}}',
    });
    const result = processPromptTemplate(preset, 'red');
    expect(result).toBe('Change the color to red');
  });

  it('should replace multiple {{INPUT}} placeholders', () => {
    const preset = createMockPreset({
      prompt: 'Transform to {{INPUT}} style, making it look like {{INPUT}}',
    });
    const result = processPromptTemplate(preset, 'watercolor');
    expect(result).toBe('Transform to watercolor style, making it look like watercolor');
  });

  it('should handle prompts without placeholders', () => {
    const preset = createMockPreset({
      prompt: 'Remove the background',
    });
    const result = processPromptTemplate(preset, 'ignored');
    expect(result).toBe('Remove the background');
  });

  it('should process {{ANGLES}} placeholder for duplicate preset', () => {
    const preset = createMockPreset({
      prompt: 'Generate {{INPUT}} variations from: {{ANGLES}}',
    });
    const result = processPromptTemplate(preset, '3');

    // Should include first 3 camera angles
    expect(result).toContain(DUPLICATE_CAMERA_ANGLES[0]);
    expect(result).toContain(DUPLICATE_CAMERA_ANGLES[1]);
    expect(result).toContain(DUPLICATE_CAMERA_ANGLES[2]);
    expect(result).not.toContain(DUPLICATE_CAMERA_ANGLES[3]);
  });

  it('should add "other creative angles" when count exceeds available angles', () => {
    const preset = createMockPreset({
      prompt: 'Generate {{INPUT}} variations from: {{ANGLES}}',
    });
    const result = processPromptTemplate(preset, '10');

    // Should mention "other creative angles" for counts > 8
    expect(result).toContain('other creative angles');
  });
});

describe('processDisplayTextTemplate', () => {
  it('should replace {{INPUT}} in display text template', () => {
    const preset = createMockPreset({
      displayTextTemplate: 'Add brand color {{INPUT}}',
    });
    const result = processDisplayTextTemplate(preset, 'navy blue');
    expect(result).toBe('Add brand color navy blue');
  });

  it('should return label if no display text template', () => {
    const preset = createMockPreset({
      label: 'My Preset',
      displayTextTemplate: null,
    });
    const result = processDisplayTextTemplate(preset, 'anything');
    expect(result).toBe('My Preset');
  });
});

describe('processConfirmationTemplate', () => {
  it('should replace {{INPUT}} in confirmation template', () => {
    const preset = createMockPreset({
      responseConfirmation: "Perfect! I'll add {{INPUT}} to your images.",
    });
    const result = processConfirmationTemplate(preset, 'bright red');
    expect(result).toBe("Perfect! I'll add bright red to your images.");
  });

  it('should return default message if no confirmation template', () => {
    const preset = createMockPreset({
      responseConfirmation: null,
    });
    const result = processConfirmationTemplate(preset, 'anything');
    expect(result).toBe('Added to the instruction list.');
  });
});

describe('validateInput', () => {
  describe('number validation', () => {
    it('should pass for valid numbers within range', () => {
      const preset = createMockPreset({
        validationType: 'number',
        validationMin: 1,
        validationMax: 10,
      });
      expect(validateInput(preset, '5')).toBeNull();
    });

    it('should fail for non-numeric input', () => {
      const preset = createMockPreset({
        validationType: 'number',
        validationMin: 1,
        validationMax: 10,
        validationErrorMessage: 'Enter a number between 1 and 10',
      });
      expect(validateInput(preset, 'abc')).toBe('Enter a number between 1 and 10');
    });

    it('should fail for numbers below minimum', () => {
      const preset = createMockPreset({
        validationType: 'number',
        validationMin: 1,
        validationMax: 10,
        validationErrorMessage: 'Enter a number between 1 and 10',
      });
      expect(validateInput(preset, '0')).toBe('Enter a number between 1 and 10');
    });

    it('should fail for numbers above maximum', () => {
      const preset = createMockPreset({
        validationType: 'number',
        validationMin: 1,
        validationMax: 10,
        validationErrorMessage: 'Enter a number between 1 and 10',
      });
      expect(validateInput(preset, '15')).toBe('Enter a number between 1 and 10');
    });
  });

  describe('text validation', () => {
    it('should pass for non-empty text', () => {
      const preset = createMockPreset({
        validationType: 'text',
      });
      expect(validateInput(preset, 'some text')).toBeNull();
    });

    it('should fail for empty text', () => {
      const preset = createMockPreset({
        validationType: 'text',
      });
      expect(validateInput(preset, '')).not.toBeNull();
    });

    it('should fail for whitespace-only text', () => {
      const preset = createMockPreset({
        validationType: 'text',
      });
      expect(validateInput(preset, '   ')).not.toBeNull();
    });
  });

  describe('color validation', () => {
    it('should pass for non-empty color values', () => {
      const preset = createMockPreset({
        validationType: 'color',
      });
      expect(validateInput(preset, 'red')).toBeNull();
      expect(validateInput(preset, '#FF5733')).toBeNull();
      expect(validateInput(preset, 'navy blue')).toBeNull();
    });

    it('should fail for empty color values', () => {
      const preset = createMockPreset({
        validationType: 'color',
      });
      expect(validateInput(preset, '')).not.toBeNull();
    });
  });

  describe('no validation', () => {
    it('should pass for any input when no validation type', () => {
      const preset = createMockPreset({
        validationType: null,
      });
      expect(validateInput(preset, '')).toBeNull();
      expect(validateInput(preset, 'anything')).toBeNull();
    });
  });
});

describe('DEFAULT_PRESETS', () => {
  it('should have 6 default presets', () => {
    expect(DEFAULT_PRESETS).toHaveLength(6);
  });

  it('should include Remove BG preset', () => {
    const removeBg = DEFAULT_PRESETS.find(p => p.label === 'Remove BG');
    expect(removeBg).toBeDefined();
    expect(removeBg?.preset_type).toBe('direct');
    expect(removeBg?.prompt).toContain('background');
  });

  it('should include Add Brand Color preset with ask type', () => {
    const brandColor = DEFAULT_PRESETS.find(p => p.label === 'Add Brand Color');
    expect(brandColor).toBeDefined();
    expect(brandColor?.preset_type).toBe('ask');
    expect(brandColor?.ask_message).toContain('color');
    expect(brandColor?.prompt).toContain('{{INPUT}}');
    expect(brandColor?.validation_type).toBe('color');
  });

  it('should include Duplicate preset with number validation', () => {
    const duplicate = DEFAULT_PRESETS.find(p => p.label === 'Duplicate');
    expect(duplicate).toBeDefined();
    expect(duplicate?.preset_type).toBe('ask');
    expect(duplicate?.validation_type).toBe('number');
    expect(duplicate?.validation_min).toBe(1);
    expect(duplicate?.validation_max).toBe(10);
    expect(duplicate?.prompt).toContain('{{INPUT}}');
    expect(duplicate?.prompt).toContain('{{ANGLES}}');
  });

  it('should include Upscale preset', () => {
    const upscale = DEFAULT_PRESETS.find(p => p.label === 'Upscale');
    expect(upscale).toBeDefined();
    expect(upscale?.preset_type).toBe('direct');
    expect(upscale?.prompt).toContain('Upscale');
  });

  it('should include Transform preset with text validation', () => {
    const transform = DEFAULT_PRESETS.find(p => p.label === 'Transform');
    expect(transform).toBeDefined();
    expect(transform?.preset_type).toBe('ask');
    expect(transform?.ask_message).toContain('style');
    expect(transform?.validation_type).toBe('text');
    expect(transform?.prompt).toContain('{{INPUT}}');
  });

  it('should include Desaturate preset', () => {
    const desaturate = DEFAULT_PRESETS.find(p => p.label === 'Desaturate');
    expect(desaturate).toBeDefined();
    expect(desaturate?.preset_type).toBe('direct');
    expect(desaturate?.prompt).toContain('Desaturate');
  });

  it('should have correct display order for all presets', () => {
    DEFAULT_PRESETS.forEach((preset, index) => {
      expect(preset.display_order).toBe(index);
    });
  });

  it('should mark all default presets as is_default', () => {
    DEFAULT_PRESETS.forEach((preset) => {
      expect(preset.is_default).toBe(true);
    });
  });
});

describe('DUPLICATE_CAMERA_ANGLES', () => {
  it('should have 8 camera angles defined', () => {
    expect(DUPLICATE_CAMERA_ANGLES).toHaveLength(8);
  });

  it('should include various angle types', () => {
    const anglesStr = DUPLICATE_CAMERA_ANGLES.join(' ');
    expect(anglesStr).toContain('back');
    expect(anglesStr).toContain('low');
    expect(anglesStr).toContain('high');
    expect(anglesStr).toContain('left');
    expect(anglesStr).toContain('right');
    expect(anglesStr).toContain('45-degree');
    expect(anglesStr).toContain('portrait');
    expect(anglesStr).toContain('wider');
  });
});

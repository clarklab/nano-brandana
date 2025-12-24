import { useState, useEffect, useCallback } from 'react';
import { RuntimePreset } from '../hooks/useUserPresets';
import { useAuth } from '../contexts/AuthContext';
import { useSounds } from '../lib/sounds';
import { IconPicker } from './IconPicker';

interface PresetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: RuntimePreset[];
  onSavePreset: (preset: Partial<RuntimePreset> & { id?: string }) => Promise<void>;
  onDeletePreset: (id: string) => Promise<void>;
  onResetToDefaults: () => Promise<void>;
  isLoading: boolean;
}

interface EditingPreset {
  id?: string;
  label: string;
  icon: string | null;
  presetType: 'direct' | 'ask';
  prompt: string;
  askMessage: string;
  displayTextTemplate: string;
  responseConfirmation: string;
  validationType: 'number' | 'text' | 'color' | '';
  validationMin: string;
  validationMax: string;
  validationErrorMessage: string;
  displayOrder: number;
  isDefault: boolean;
}

const emptyPreset: EditingPreset = {
  label: '',
  icon: null,
  presetType: 'direct',
  prompt: '',
  askMessage: '',
  displayTextTemplate: '',
  responseConfirmation: '',
  validationType: '',
  validationMin: '',
  validationMax: '',
  validationErrorMessage: '',
  displayOrder: 0,
  isDefault: false,
};

function presetToEditing(preset: RuntimePreset): EditingPreset {
  return {
    id: preset.id,
    label: preset.label,
    icon: preset.icon,
    presetType: preset.presetType,
    prompt: preset.prompt,
    askMessage: preset.askMessage || '',
    displayTextTemplate: preset.displayTextTemplate || '',
    responseConfirmation: preset.responseConfirmation || '',
    validationType: preset.validationType || '',
    validationMin: preset.validationMin?.toString() || '',
    validationMax: preset.validationMax?.toString() || '',
    validationErrorMessage: preset.validationErrorMessage || '',
    displayOrder: preset.displayOrder,
    isDefault: preset.isDefault,
  };
}

export function PresetConfigModal({
  isOpen,
  onClose,
  presets,
  onSavePreset,
  onDeletePreset,
  onResetToDefaults,
  isLoading,
}: PresetConfigModalProps) {
  const { user } = useAuth();
  const { click: playClick, blip: playBlip } = useSounds();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [editingPreset, setEditingPreset] = useState<EditingPreset | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle open/close animations
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // Small delay to trigger CSS transition
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      // Wait for animation to complete before hiding
      const timer = setTimeout(() => {
        setIsVisible(false);
        setEditingPreset(null);
        setError(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    playClick();
    onClose();
  }, [onClose, playClick]);

  const handleEditPreset = useCallback((preset: RuntimePreset) => {
    playBlip();
    setEditingPreset(presetToEditing(preset));
    setError(null);
  }, [playBlip]);

  const handleAddNew = useCallback(() => {
    playBlip();
    setEditingPreset({
      ...emptyPreset,
      displayOrder: presets.length,
    });
    setError(null);
  }, [presets.length, playBlip]);

  const handleCancelEdit = useCallback(() => {
    playClick();
    setEditingPreset(null);
    setError(null);
  }, [playClick]);

  const handleSave = useCallback(async () => {
    if (!editingPreset) return;
    if (!user) {
      setError('You must be logged in to save presets');
      return;
    }

    // Validate
    if (!editingPreset.label.trim()) {
      setError('Label is required');
      return;
    }
    if (!editingPreset.prompt.trim()) {
      setError('Prompt is required');
      return;
    }
    if (editingPreset.presetType === 'ask' && !editingPreset.askMessage.trim()) {
      setError('Question is required for Ask-type presets');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSavePreset({
        id: editingPreset.id,
        label: editingPreset.label.trim(),
        icon: editingPreset.icon,
        presetType: editingPreset.presetType,
        prompt: editingPreset.prompt.trim(),
        askMessage: editingPreset.askMessage.trim() || null,
        displayTextTemplate: editingPreset.displayTextTemplate.trim() || null,
        responseConfirmation: editingPreset.responseConfirmation.trim() || null,
        validationType: editingPreset.validationType || null,
        validationMin: editingPreset.validationMin ? parseInt(editingPreset.validationMin) : null,
        validationMax: editingPreset.validationMax ? parseInt(editingPreset.validationMax) : null,
        validationErrorMessage: editingPreset.validationErrorMessage.trim() || null,
        displayOrder: editingPreset.displayOrder,
        isDefault: editingPreset.isDefault,
      });
      playBlip();
      setEditingPreset(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset');
    } finally {
      setIsSaving(false);
    }
  }, [editingPreset, user, onSavePreset, playBlip]);

  const handleDelete = useCallback(async (preset: RuntimePreset) => {
    if (!user) {
      setError('You must be logged in to delete presets');
      return;
    }

    if (!confirm(`Delete "${preset.label}"?`)) return;

    setIsSaving(true);
    setError(null);

    try {
      await onDeletePreset(preset.id);
      playClick();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset');
    } finally {
      setIsSaving(false);
    }
  }, [user, onDeletePreset, playClick]);

  const handleResetToDefaults = useCallback(async () => {
    if (!user) {
      setError('You must be logged in to reset presets');
      return;
    }

    if (!confirm('Reset all presets to defaults? This will delete any custom presets.')) return;

    setIsSaving(true);
    setError(null);

    try {
      await onResetToDefaults();
      playBlip();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset presets');
    } finally {
      setIsSaving(false);
    }
  }, [user, onResetToDefaults, playBlip]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
        isAnimating ? 'bg-black/60' : 'bg-black/0'
      }`}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className={`bg-white border-2 border-black w-full h-full md:w-[90vw] md:h-[90vh] md:max-w-4xl relative flex flex-col transition-all duration-300 transform ${
          isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-black">
          <div>
            <h2 className="text-lg font-bold">TASK PRESETS</h2>
            <p className="text-xs text-gray-500 mt-1">
              Customize the quick action buttons for your workflow
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-3xl leading-none hover:text-gray-600 transition-colors p-2"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!user ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">Sign in to customize your presets</p>
              <p className="text-xs text-gray-400">
                Your presets will be saved to your account and synced across devices.
              </p>
            </div>
          ) : editingPreset ? (
            /* Edit Form */
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold">
                  {editingPreset.id ? 'EDIT PRESET' : 'NEW PRESET'}
                </h3>
                <button
                  onClick={handleCancelEdit}
                  className="text-xs border border-black px-3 py-1 hover:bg-gray-100 transition-all"
                >
                  CANCEL
                </button>
              </div>

              {/* Label and Icon row */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 block mb-1">
                    BUTTON LABEL *
                  </label>
                  <input
                    type="text"
                    value={editingPreset.label}
                    onChange={(e) => setEditingPreset({ ...editingPreset, label: e.target.value })}
                    placeholder="e.g., Remove BG"
                    maxLength={50}
                    className="w-full px-3 py-2 border-2 border-black focus:border-neon focus:outline-none text-sm"
                  />
                </div>
                <div className="w-48">
                  <label className="text-xs font-bold text-gray-500 block mb-1">
                    ICON
                  </label>
                  <IconPicker
                    selectedIcon={editingPreset.icon}
                    onSelectIcon={(icon) => setEditingPreset({ ...editingPreset, icon })}
                  />
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">
                  PRESET TYPE
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="presetType"
                      checked={editingPreset.presetType === 'direct'}
                      onChange={() => setEditingPreset({ ...editingPreset, presetType: 'direct' })}
                      className="accent-black"
                    />
                    <span className="text-sm">
                      <strong>Direct</strong> - Applies prompt immediately
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="presetType"
                      checked={editingPreset.presetType === 'ask'}
                      onChange={() => setEditingPreset({ ...editingPreset, presetType: 'ask' })}
                      className="accent-black"
                    />
                    <span className="text-sm">
                      <strong>Ask</strong> - Shows follow-up question first
                    </span>
                  </label>
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">
                  PROMPT / INSTRUCTION *
                </label>
                <textarea
                  value={editingPreset.prompt}
                  onChange={(e) => setEditingPreset({ ...editingPreset, prompt: e.target.value })}
                  placeholder={
                    editingPreset.presetType === 'ask'
                      ? 'Use {{INPUT}} where user response should go. e.g., "Transform to {{INPUT}} style"'
                      : 'The instruction to send to the AI'
                  }
                  rows={4}
                  className="w-full px-3 py-2 border-2 border-black focus:border-neon focus:outline-none text-sm font-mono resize-none"
                />
                {editingPreset.presetType === 'ask' && (
                  <p className="text-xs text-gray-400 mt-1">
                    Use <code className="bg-gray-100 px-1">{'{{INPUT}}'}</code> as placeholder for user's response.
                    For duplicates, use <code className="bg-gray-100 px-1">{'{{ANGLES}}'}</code> for camera angles.
                  </p>
                )}
              </div>

              {/* Ask-type specific fields */}
              {editingPreset.presetType === 'ask' && (
                <>
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">
                      QUESTION TO ASK USER *
                    </label>
                    <textarea
                      value={editingPreset.askMessage}
                      onChange={(e) => setEditingPreset({ ...editingPreset, askMessage: e.target.value })}
                      placeholder='e.g., "What color would you like? (e.g., red, blue, #FF5733)"'
                      rows={2}
                      className="w-full px-3 py-2 border-2 border-black focus:border-neon focus:outline-none text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">
                      DISPLAY TEXT TEMPLATE
                    </label>
                    <input
                      type="text"
                      value={editingPreset.displayTextTemplate}
                      onChange={(e) => setEditingPreset({ ...editingPreset, displayTextTemplate: e.target.value })}
                      placeholder='e.g., "Add brand color {{INPUT}}"'
                      className="w-full px-3 py-2 border-2 border-black focus:border-neon focus:outline-none text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Shown in the instruction list. Uses <code className="bg-gray-100 px-1">{'{{INPUT}}'}</code> placeholder.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">
                      CONFIRMATION MESSAGE
                    </label>
                    <textarea
                      value={editingPreset.responseConfirmation}
                      onChange={(e) => setEditingPreset({ ...editingPreset, responseConfirmation: e.target.value })}
                      placeholder="e.g., Great! I'll add {{INPUT}} to your images."
                      rows={2}
                      className="w-full px-3 py-2 border-2 border-black focus:border-neon focus:outline-none text-sm resize-none"
                    />
                  </div>

                  {/* Validation */}
                  <div className="border border-gray-200 p-3 rounded space-y-3">
                    <label className="text-xs font-bold text-gray-500 block">
                      INPUT VALIDATION (Optional)
                    </label>
                    <div className="flex gap-4 flex-wrap">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="validationType"
                          checked={editingPreset.validationType === ''}
                          onChange={() => setEditingPreset({ ...editingPreset, validationType: '' })}
                          className="accent-black"
                        />
                        <span className="text-sm">None</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="validationType"
                          checked={editingPreset.validationType === 'text'}
                          onChange={() => setEditingPreset({ ...editingPreset, validationType: 'text' })}
                          className="accent-black"
                        />
                        <span className="text-sm">Text</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="validationType"
                          checked={editingPreset.validationType === 'number'}
                          onChange={() => setEditingPreset({ ...editingPreset, validationType: 'number' })}
                          className="accent-black"
                        />
                        <span className="text-sm">Number</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="validationType"
                          checked={editingPreset.validationType === 'color'}
                          onChange={() => setEditingPreset({ ...editingPreset, validationType: 'color' })}
                          className="accent-black"
                        />
                        <span className="text-sm">Color</span>
                      </label>
                    </div>

                    {editingPreset.validationType === 'number' && (
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 block mb-1">Min</label>
                          <input
                            type="number"
                            value={editingPreset.validationMin}
                            onChange={(e) => setEditingPreset({ ...editingPreset, validationMin: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 text-sm"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 block mb-1">Max</label>
                          <input
                            type="number"
                            value={editingPreset.validationMax}
                            onChange={(e) => setEditingPreset({ ...editingPreset, validationMax: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {editingPreset.validationType && (
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Custom Error Message</label>
                        <input
                          type="text"
                          value={editingPreset.validationErrorMessage}
                          onChange={(e) => setEditingPreset({ ...editingPreset, validationErrorMessage: e.target.value })}
                          placeholder="Shown when validation fails"
                          className="w-full px-2 py-1 border border-gray-300 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Error */}
              {error && (
                <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-2">
                  {error}
                </div>
              )}

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-2 border-2 border-black bg-neon font-bold text-sm hover:bg-neon/80 transition-all disabled:opacity-50"
              >
                {isSaving ? 'SAVING...' : 'SAVE PRESET'}
              </button>
            </div>
          ) : (
            /* Preset List */
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">
                  {presets.length} preset{presets.length !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleResetToDefaults}
                    disabled={isSaving || isLoading}
                    className="text-xs border border-gray-300 px-3 py-1 hover:bg-gray-100 transition-all disabled:opacity-50"
                  >
                    RESET TO DEFAULTS
                  </button>
                  <button
                    onClick={handleAddNew}
                    disabled={isSaving || isLoading}
                    className="text-xs border-2 border-black bg-neon px-3 py-1 font-bold hover:bg-neon/80 transition-all disabled:opacity-50"
                  >
                    + ADD NEW
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-2 mb-4">
                  {error}
                </div>
              )}

              {isLoading ? (
                <div className="text-center py-8 text-gray-500">Loading presets...</div>
              ) : (
                <div className="space-y-2">
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="border-2 border-black p-3 hover:border-neon transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {preset.icon && (
                              <span
                                className="material-symbols-outlined text-gray-600"
                                style={{ fontSize: '16px', width: '16px', height: '16px' }}
                              >
                                {preset.icon}
                              </span>
                            )}
                            <span className="font-bold text-sm">
                              {preset.label.toUpperCase()}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                preset.presetType === 'ask'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {preset.presetType === 'ask' ? 'ASK' : 'DIRECT'}
                            </span>
                            {preset.isDefault && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neon/20 text-gray-600">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 font-mono truncate">
                            {preset.prompt.length > 80
                              ? preset.prompt.substring(0, 80) + '...'
                              : preset.prompt}
                          </p>
                          {preset.presetType === 'ask' && preset.askMessage && (
                            <p className="text-xs text-blue-600 mt-1 truncate">
                              Q: {preset.askMessage}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleEditPreset(preset)}
                            disabled={isSaving}
                            className="p-1.5 border border-black hover:bg-neon transition-all disabled:opacity-50"
                            title="Edit"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                              <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.07 10.455a1.75 1.75 0 0 0-.433.727l-.807 2.858a.75.75 0 0 0 .916.916l2.858-.807a1.75 1.75 0 0 0 .727-.433l7.942-7.942a1.75 1.75 0 0 0 0-2.475L13.488 2.512Zm-1.415 1.06a.25.25 0 0 1 .354 0l.785.785a.25.25 0 0 1 0 .354L5.27 12.654l-1.345.38.38-1.345 7.768-7.768Z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(preset)}
                            disabled={isSaving}
                            className="p-1.5 border border-black hover:bg-red-100 hover:border-red-500 transition-all disabled:opacity-50"
                            title="Delete"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-black bg-gray-50 text-xs text-gray-500">
          <p>
            <strong>Tip:</strong> Use <code className="bg-gray-200 px-1">{'{{INPUT}}'}</code> in prompts to insert user responses.
            For duplicate presets, <code className="bg-gray-200 px-1">{'{{ANGLES}}'}</code> inserts camera angle variations.
          </p>
        </div>
      </div>
    </div>
  );
}

export default PresetConfigModal;

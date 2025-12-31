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
      className={`fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4 ${
        isAnimating ? 'animate-fade-in' : 'animate-fade-out'
      }`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className={`bg-white dark:bg-slate-800 w-full h-full md:w-[90vw] md:h-[85vh] md:max-w-4xl md:rounded-2xl shadow-elevated relative flex flex-col pb-[env(safe-area-inset-bottom)] ${
          isAnimating ? 'animate-slide-up' : 'animate-slide-down'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold font-display">Task Presets</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Customize the quick action buttons for your workflow
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" className="text-slate-500" fill="currentColor">
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {!user ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-slate-400">
                  <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-slate-600 dark:text-slate-300 font-medium mb-2">Sign in to customize your presets</p>
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Your presets will be saved to your account and synced across devices.
              </p>
            </div>
          ) : editingPreset ? (
            /* Edit Form */
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                  {editingPreset.id ? 'Edit Preset' : 'New Preset'}
                </h3>
                <button
                  onClick={handleCancelEdit}
                  className="btn-secondary text-sm py-1.5 px-3"
                >
                  Cancel
                </button>
              </div>

              {/* Label and Icon row */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1.5">
                    Button Label *
                  </label>
                  <input
                    type="text"
                    value={editingPreset.label}
                    onChange={(e) => setEditingPreset({ ...editingPreset, label: e.target.value })}
                    placeholder="e.g., Remove BG"
                    maxLength={50}
                    className="input py-2"
                  />
                </div>
                <div className="w-48">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1.5">
                    Icon
                  </label>
                  <IconPicker
                    selectedIcon={editingPreset.icon}
                    onSelectIcon={(icon) => setEditingPreset({ ...editingPreset, icon })}
                  />
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">
                  Preset Type
                </label>
                <div className="flex gap-3 flex-wrap">
                  <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-neon transition-colors flex-1 min-w-[200px]">
                    <input
                      type="radio"
                      name="presetType"
                      checked={editingPreset.presetType === 'direct'}
                      onChange={() => setEditingPreset({ ...editingPreset, presetType: 'direct' })}
                      className="accent-neon"
                    />
                    <div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Direct</span>
                      <p className="text-xs text-slate-400">Applies prompt immediately</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-neon transition-colors flex-1 min-w-[200px]">
                    <input
                      type="radio"
                      name="presetType"
                      checked={editingPreset.presetType === 'ask'}
                      onChange={() => setEditingPreset({ ...editingPreset, presetType: 'ask' })}
                      className="accent-neon"
                    />
                    <div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Ask</span>
                      <p className="text-xs text-slate-400">Shows follow-up question first</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1.5">
                  Prompt / Instruction *
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
                  className="input font-mono text-sm resize-none"
                />
                {editingPreset.presetType === 'ask' && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                    Use <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{'{{INPUT}}'}</code> as placeholder for user's response.
                    For duplicates, use <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{'{{ANGLES}}'}</code> for camera angles.
                  </p>
                )}
              </div>

              {/* Ask-type specific fields */}
              {editingPreset.presetType === 'ask' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1.5">
                      Question to Ask User *
                    </label>
                    <textarea
                      value={editingPreset.askMessage}
                      onChange={(e) => setEditingPreset({ ...editingPreset, askMessage: e.target.value })}
                      placeholder='e.g., "What color would you like? (e.g., red, blue, #FF5733)"'
                      rows={2}
                      className="input text-sm resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1.5">
                      Display Text Template
                    </label>
                    <input
                      type="text"
                      value={editingPreset.displayTextTemplate}
                      onChange={(e) => setEditingPreset({ ...editingPreset, displayTextTemplate: e.target.value })}
                      placeholder='e.g., "Add brand color {{INPUT}}"'
                      className="input py-2"
                    />
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                      Shown in the instruction list. Uses <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{'{{INPUT}}'}</code> placeholder.
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1.5">
                      Confirmation Message
                    </label>
                    <textarea
                      value={editingPreset.responseConfirmation}
                      onChange={(e) => setEditingPreset({ ...editingPreset, responseConfirmation: e.target.value })}
                      placeholder="e.g., Great! I'll add {{INPUT}} to your images."
                      rows={2}
                      className="input text-sm resize-none"
                    />
                  </div>

                  {/* Validation */}
                  <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-4 space-y-4">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                      Input Validation (Optional)
                    </label>
                    <div className="flex gap-3 flex-wrap">
                      <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-neon transition-colors">
                        <input
                          type="radio"
                          name="validationType"
                          checked={editingPreset.validationType === ''}
                          onChange={() => setEditingPreset({ ...editingPreset, validationType: '' })}
                          className="accent-neon"
                        />
                        <span className="text-sm">None</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-neon transition-colors">
                        <input
                          type="radio"
                          name="validationType"
                          checked={editingPreset.validationType === 'text'}
                          onChange={() => setEditingPreset({ ...editingPreset, validationType: 'text' })}
                          className="accent-neon"
                        />
                        <span className="text-sm">Text</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-neon transition-colors">
                        <input
                          type="radio"
                          name="validationType"
                          checked={editingPreset.validationType === 'number'}
                          onChange={() => setEditingPreset({ ...editingPreset, validationType: 'number' })}
                          className="accent-neon"
                        />
                        <span className="text-sm">Number</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-neon transition-colors">
                        <input
                          type="radio"
                          name="validationType"
                          checked={editingPreset.validationType === 'color'}
                          onChange={() => setEditingPreset({ ...editingPreset, validationType: 'color' })}
                          className="accent-neon"
                        />
                        <span className="text-sm">Color</span>
                      </label>
                    </div>

                    {editingPreset.validationType === 'number' && (
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Min</label>
                          <input
                            type="number"
                            value={editingPreset.validationMin}
                            onChange={(e) => setEditingPreset({ ...editingPreset, validationMin: e.target.value })}
                            className="input py-1.5 text-sm"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Max</label>
                          <input
                            type="number"
                            value={editingPreset.validationMax}
                            onChange={(e) => setEditingPreset({ ...editingPreset, validationMax: e.target.value })}
                            className="input py-1.5 text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {editingPreset.validationType && (
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Custom Error Message</label>
                        <input
                          type="text"
                          value={editingPreset.validationErrorMessage}
                          onChange={(e) => setEditingPreset({ ...editingPreset, validationErrorMessage: e.target.value })}
                          placeholder="Shown when validation fails"
                          className="input py-1.5 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Error */}
              {error && (
                <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                  {error}
                </div>
              )}

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary w-full"
              >
                {isSaving ? 'Saving...' : 'Save Preset'}
              </button>
            </div>
          ) : (
            /* Preset List */
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {presets.length} preset{presets.length !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleResetToDefaults}
                    disabled={isSaving || isLoading}
                    className="btn-secondary text-sm py-1.5 px-3"
                  >
                    Reset to Defaults
                  </button>
                  <button
                    onClick={handleAddNew}
                    disabled={isSaving || isLoading}
                    className="btn-primary text-sm py-1.5 px-3"
                  >
                    + Add New
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4">
                  {error}
                </div>
              )}

              {isLoading ? (
                <div className="text-center py-12 text-slate-400">
                  <div className="w-8 h-8 border-2 border-slate-200 border-t-neon rounded-full animate-spin mx-auto mb-3" />
                  Loading presets...
                </div>
              ) : (
                <div className="space-y-3">
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="card p-4 hover:shadow-elevated transition-all group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            {preset.icon && (
                              <span
                                className="material-symbols-outlined text-slate-500 dark:text-slate-400"
                                style={{ fontSize: '18px', width: '18px', height: '18px' }}
                              >
                                {preset.icon}
                              </span>
                            )}
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {preset.label}
                            </span>
                            <span
                              className={`badge ${
                                preset.presetType === 'ask'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                              }`}
                            >
                              {preset.presetType === 'ask' ? 'Ask' : 'Direct'}
                            </span>
                            {preset.isDefault && (
                              <span className="badge badge-neon">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                            {preset.prompt.length > 80
                              ? preset.prompt.substring(0, 80) + '...'
                              : preset.prompt}
                          </p>
                          {preset.presetType === 'ask' && preset.askMessage && (
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1.5 truncate">
                              Q: {preset.askMessage}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditPreset(preset)}
                            disabled={isSaving}
                            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-neon text-slate-600 dark:text-slate-300 hover:text-slate-900 transition-all disabled:opacity-50"
                            title="Edit"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                              <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.07 10.455a1.75 1.75 0 0 0-.433.727l-.807 2.858a.75.75 0 0 0 .916.916l2.858-.807a1.75 1.75 0 0 0 .727-.433l7.942-7.942a1.75 1.75 0 0 0 0-2.475L13.488 2.512Zm-1.415 1.06a.25.25 0 0 1 .354 0l.785.785a.25.25 0 0 1 0 .354L5.27 12.654l-1.345.38.38-1.345 7.768-7.768Z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(preset)}
                            disabled={isSaving}
                            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 transition-all disabled:opacity-50"
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
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 md:rounded-b-2xl">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">Tip:</span> Use <code className="bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">{'{{INPUT}}'}</code> in prompts to insert user responses.
            For duplicate presets, <code className="bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">{'{{ANGLES}}'}</code> inserts camera angle variations.
          </p>
        </div>
      </div>
    </div>
  );
}

export default PresetConfigModal;

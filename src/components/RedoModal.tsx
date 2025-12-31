import { useState, useEffect, useCallback } from 'react';
import { WorkItem, InputItem } from '../lib/concurrency';
import { useSounds } from '../lib/sounds';

interface RedoModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: WorkItem | null;
  originalImage: string;
  onSubmit: (itemId: string, instruction: string, mode: 'replace' | 'new') => void;
}

// Check if the input has an image (original image prompt)
function hasImageInput(input: InputItem): boolean {
  if (input.type === 'image') return true;
  if (input.type === 'composite') {
    return input.items.some(i => i.type === 'image');
  }
  return false;
}

// Get original text prompt if it exists
function getTextPrompt(input: InputItem): string | null {
  if (input.type === 'text') return input.prompt;
  if (input.type === 'composite') {
    const textItem = input.items.find(i => i.type === 'text');
    if (textItem && textItem.type === 'text') {
      return textItem.prompt;
    }
  }
  return null;
}

export function RedoModal({
  isOpen,
  onClose,
  item,
  originalImage,
  onSubmit,
}: RedoModalProps) {
  const { click: playClick, blip: playBlip } = useSounds();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [mode, setMode] = useState<'replace' | 'new'>('new');

  // Handle open/close animations and reset state
  useEffect(() => {
    if (isOpen && item) {
      setIsVisible(true);
      // Initialize form with item's current instruction
      setInstruction(item.instruction);
      // Get original prompt if text input
      const textPrompt = getTextPrompt(item.input);
      setOriginalPrompt(textPrompt || '');
      setMode('new');
      // Small delay to trigger CSS transition
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      // Wait for animation to complete before hiding
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, item]);

  const handleClose = useCallback(() => {
    playClick();
    onClose();
  }, [onClose, playClick]);

  const handleSubmit = useCallback(() => {
    if (!item) return;
    playBlip();

    // For text prompts, we need to combine the original prompt with instructions
    // For image prompts, we just use the instructions
    let finalInstruction = instruction;
    if (!hasImageInput(item.input) && originalPrompt) {
      // Text prompt: combine original prompt with any modifications
      finalInstruction = originalPrompt + (instruction ? `. ${instruction}` : '');
    }

    onSubmit(item.id, finalInstruction, mode);
    onClose();
  }, [item, instruction, originalPrompt, mode, onSubmit, onClose, playBlip]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isVisible || !item) return null;

  const isImagePrompt = hasImageInput(item.input);
  const generatedImage = item.result?.images?.[0];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4 ${
        isAnimating ? 'animate-fade-in' : 'animate-fade-out'
      }`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className={`bg-white dark:bg-slate-800 w-full h-full md:h-auto md:max-w-lg md:rounded-2xl shadow-elevated relative flex flex-col ${
          isAnimating ? 'animate-slide-up' : 'animate-slide-down'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold font-display">Redo Image</h2>
            {/* Preset pill - show if a preset was used */}
            {item.presetLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium rounded-full">
                {item.presetIcon && (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '12px', width: '12px', height: '12px' }}
                  >
                    {item.presetIcon}
                  </span>
                )}
                {item.presetLabel}
              </span>
            )}
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
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Image comparison section */}
          {isImagePrompt ? (
            // Image prompt: show original vs generated
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">
                COMPARISON
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Original</span>
                  <div className="aspect-square bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden">
                    {originalImage ? (
                      <img
                        src={originalImage}
                        alt="Original"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        No image
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Generated</span>
                  <div className="aspect-square bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden">
                    {generatedImage ? (
                      <img
                        src={generatedImage}
                        alt="Generated"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        No result
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Text prompt: show just generated
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">
                GENERATED IMAGE
              </label>
              <div className="aspect-video bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden max-w-xs mx-auto">
                {generatedImage ? (
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    No result
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Original prompt (for text prompts only) */}
          {!isImagePrompt && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">
                ORIGINAL PROMPT
              </label>
              <textarea
                value={originalPrompt}
                onChange={(e) => setOriginalPrompt(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-neon/50 focus:border-neon resize-none"
                placeholder="Enter text prompt..."
              />
            </div>
          )}

          {/* Instructions textarea */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">
              {isImagePrompt ? 'INSTRUCTIONS' : 'ADDITIONAL INSTRUCTIONS'}
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-neon/50 focus:border-neon resize-none"
              placeholder={isImagePrompt ? "Modify the instructions for this image..." : "Add any additional instructions..."}
            />
          </div>

          {/* Mode selection */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">
              OUTPUT MODE
            </label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                  className="accent-neon"
                />
                <div>
                  <span className="text-sm font-medium">New Image</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Create a new result card</p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  className="accent-neon"
                />
                <div>
                  <span className="text-sm font-medium">Replace</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Replace current result</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex gap-3 bg-slate-50/50 dark:bg-slate-900/30 md:rounded-b-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            onClick={handleClose}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex-1"
          >
            {mode === 'new' ? 'Create New' : 'Replace'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RedoModal;

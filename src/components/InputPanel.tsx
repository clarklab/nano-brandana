import React, { useCallback, useState, useEffect } from 'react';
import { BaseInputItem } from '../lib/concurrency';
import { formatFileSize } from '../lib/base64';
import { useSounds } from '../lib/sounds';

interface InputPanelProps {
  onFilesAdded: (files: File[]) => void;
  onPromptsAdded: (prompts: string[]) => void;
  inputs: BaseInputItem[];
  loadingInputIds?: Set<string>;
  onRemoveInput: (id: string) => void;
  onClearAll: () => void;
  processingMode: 'batch' | 'singleJob';
  onProcessingModeChange: (mode: 'batch' | 'singleJob') => void;
}

export const InputPanel: React.FC<InputPanelProps> = ({
  onFilesAdded,
  onPromptsAdded,
  inputs,
  loadingInputIds = new Set(),
  onRemoveInput,
  onClearAll,
  processingMode,
  onProcessingModeChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ file: File; name: string } | null>(null);
  const { toggle: playToggleSound, blip: playBlip } = useSounds();

  const handleCopyPrompt = useCallback(async (prompt: string, id: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPromptId(id);
      setTimeout(() => setCopiedPromptId(null), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type.startsWith('image/')
    );

    if (droppedFiles.length > 0) {
      onFilesAdded(droppedFiles);
    }
  }, [onFilesAdded]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      onFilesAdded(selectedFiles);
    }
  }, [onFilesAdded]);

  const handleAddPrompt = useCallback(() => {
    if (promptText.trim()) {
      onPromptsAdded([promptText.trim()]);
      setPromptText('');
      setShowPromptInput(false);
    }
  }, [promptText, onPromptsAdded]);

  // Handle paste events for clipboard images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Don't intercept paste if user is typing in a text input/textarea
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            // Create a file with a more descriptive name for pasted images
            const extension = item.type.split('/')[1] || 'png';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const namedFile = new File([file], `pasted-image-${timestamp}.${extension}`, {
              type: file.type,
            });
            imageFiles.push(namedFile);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        onFilesAdded(imageFiles);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onFilesAdded]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold font-display">Input</h2>
          {inputs.length > 0 && (
            <button
              onClick={() => {
                playBlip();
                onClearAll();
              }}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        {inputs.length > 1 && (
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  if (processingMode !== 'batch') {
                    playToggleSound();
                    onProcessingModeChange('batch');
                  }
                }}
                className={`px-2.5 py-1.5 text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5 h-7 ${
                  processingMode === 'batch'
                    ? 'bg-neon text-slate-900'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Run as batch
                <span className={`w-4 h-4 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                  processingMode === 'batch'
                    ? 'bg-slate-900/20 text-slate-900'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
                }`}>
                  {inputs.length}
                </span>
              </button>
              <button
                onClick={() => {
                  if (processingMode !== 'singleJob') {
                    playToggleSound();
                    onProcessingModeChange('singleJob');
                  }
                }}
                className={`px-2.5 py-1.5 text-xs font-medium transition-all duration-200 flex items-center justify-center h-7 ${
                  processingMode === 'singleJob'
                    ? 'bg-neon text-slate-900'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Combine images
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          flex-1 border-2 border-dashed transition-all duration-200 rounded-2xl min-h-0 overflow-hidden
          ${isDragging
            ? 'border-neon bg-neon/10 scale-[1.02]'
            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
          }
        `}
      >
        {inputs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <div className="w-16 h-16 mb-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" className="text-slate-400 dark:text-slate-500" fill="currentColor">
                <path d="M170-228q-38-45-61-99T80-440h82q6 43 22 82.5t42 73.5l-56 56ZM80-520q8-59 30-113t60-99l56 56q-26 34-42 73.5T162-520H80ZM438-82q-59-6-112.5-28.5T226-170l56-58q35 26 74 43t82 23v80ZM284-732l-58-58q47-37 101-59.5T440-878v80q-43 6-82.5 23T284-732ZM518-82v-80q44-6 83.5-22.5T676-228l58 58q-47 38-101.5 60T518-82Zm160-650q-35-26-75-43t-83-23v-80q59 6 113.5 28.5T734-790l-56 58Zm112 504-56-56q26-34 42-73.5t22-82.5h82q-8 59-30 113t-60 99Zm8-292q-6-43-22-82.5T734-676l56-56q38 45 61 99t29 113h-82ZM441-280v-247L337-423l-56-57 200-200 200 200-57 56-103-103v247h-80Z"/>
              </svg>
            </div>
            <p className="font-medium text-slate-700 dark:text-slate-200 mb-1">Drop or paste images</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">or browse to upload</p>
            <div className="flex gap-2 flex-wrap justify-center">
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <span className="btn-primary">
                  Upload Images
                </span>
              </label>
              <button
                onClick={() => {
                  playBlip();
                  setShowPromptInput(true);
                }}
                className="btn-secondary"
              >
                Make Image with Text
              </button>
            </div>
            <p className="text-xs mt-4 text-slate-400 dark:text-slate-500">JPG, PNG, WEBP or text prompts</p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-3">
            <div className="grid grid-cols-1 gap-2">
              {inputs.map((input) => (
                <div
                  key={input.id}
                  className="relative group bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
                >
                  {input.type === 'image' ? (
                    <div className="flex gap-3">
                      {loadingInputIds.has(input.id) ? (
                        <div className="w-14 h-14 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      ) : (
                        <img
                          src={URL.createObjectURL(input.file)}
                          alt={input.file.name}
                          className="w-14 h-14 object-cover rounded-lg cursor-pointer hover:ring-2 hover:ring-neon hover:ring-offset-2 dark:hover:ring-offset-slate-800 transition-all duration-200"
                          onClick={() => setPreviewImage({ file: input.file, name: input.file.name })}
                        />
                      )}
                      <div className="flex-1 min-w-0 pr-6">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{input.file.name}</p>
                        {loadingInputIds.has(input.id) ? (
                          <div className="w-16 h-3 mt-1 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                        ) : (
                          <p className="text-xs text-slate-400 dark:text-slate-500">{formatFileSize(input.file.size)}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex gap-3 pr-6">
                        <div className="w-14 h-14 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" className="text-slate-400" fill="currentColor">
                            <path d="M280-280h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">Text Prompt</p>
                          <p className="text-sm text-slate-700 dark:text-slate-200 line-clamp-2">{input.prompt}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPrompt(input.prompt, input.id);
                          }}
                          className="btn-ghost py-1 px-2 text-xs"
                          title="Copy prompt"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {copiedPromptId === input.id ? 'check' : 'content_copy'}
                          </span>
                          <span>Copy</span>
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      playBlip();
                      onRemoveInput(input.id);
                    }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-white dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor">
                      <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <label className="cursor-pointer block">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <div className="text-center py-2.5 border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-neon hover:text-amber-600 dark:hover:text-amber-400 hover:bg-neon/5 transition-all duration-200 rounded-xl">
                  <span className="text-sm font-medium">+ Upload Images</span>
                </div>
              </label>
              <button
                onClick={() => {
                  playBlip();
                  setShowPromptInput(true);
                }}
                className="w-full text-center py-2.5 border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-neon hover:text-amber-600 dark:hover:text-amber-400 hover:bg-neon/5 transition-all duration-200 rounded-xl"
              >
                <span className="text-sm font-medium">+ Make Image with Text</span>
              </button>
            </div>
          </div>
        )}
      </div>


      {/* Prompt Input Modal */}
      {showPromptInput && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-elevated max-w-md w-full p-5 animate-slide-up">
            <h3 className="text-lg font-semibold font-display mb-4">Add Text Prompt</h3>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Enter your text prompt for image generation..."
              className="input h-32 resize-none text-sm"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  playBlip();
                  handleAddPrompt();
                }}
                disabled={!promptText.trim()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Prompt
              </button>
              <button
                onClick={() => {
                  playBlip();
                  setShowPromptInput(false);
                  setPromptText('');
                }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-elevated max-w-2xl w-full p-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold font-display truncate pr-4">{previewImage.name}</h3>
              <button
                onClick={() => setPreviewImage(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-all duration-200 flex items-center justify-center flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor">
                  <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-center bg-slate-100 dark:bg-slate-900 rounded-xl overflow-hidden">
              <img
                src={URL.createObjectURL(previewImage.file)}
                alt={previewImage.name}
                className="max-w-full max-h-[60vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

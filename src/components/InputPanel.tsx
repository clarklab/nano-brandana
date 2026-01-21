import React, { useCallback, useState, useEffect } from 'react';
import { BaseInputItem } from '../lib/concurrency';
import { formatFileSize } from '../lib/base64';
import { useSounds } from '../lib/sounds';
import { FileSizeLimitModal, OversizedFile } from './FileSizeLimitModal';

// 4MB limit - Lambda is 6MB, base64 adds ~33% (4MB → ~5.3MB), leaves headroom for headers
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;

interface InputPanelProps {
  onFilesAdded: (files: File[]) => void;
  onPromptsAdded: (prompts: string[]) => void;
  inputs: BaseInputItem[];
  loadingInputIds?: Set<string>;
  onRemoveInput: (id: string) => void;
  onClearAll: () => void;
  processingMode: 'batch' | 'singleJob';
  onProcessingModeChange: (mode: 'batch' | 'singleJob') => void;
  onUpdateDisplayName?: (id: string, displayName: string) => void;
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
  onUpdateDisplayName,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [duplicatedFromId, setDuplicatedFromId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ file: File; name: string; id: string; displayName?: string } | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState('');
  const [showModeInfo, setShowModeInfo] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [oversizedFiles, setOversizedFiles] = useState<OversizedFile[]>([]);
  const [showSizeLimitModal, setShowSizeLimitModal] = useState(false);
  const { toggle: playToggleSound, blip: playBlip } = useSounds();

  // Helper to partition files by size
  const partitionFilesBySize = useCallback((files: File[]) => {
    const validFiles: File[] = [];
    const oversized: OversizedFile[] = [];

    for (const file of files) {
      if (file.size <= MAX_FILE_SIZE_BYTES) {
        validFiles.push(file);
      } else {
        oversized.push({ file, id: crypto.randomUUID() });
      }
    }

    return { validFiles, oversized };
  }, []);

  const handleCopyPrompt = useCallback(async (prompt: string, id: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPromptId(id);
      setTimeout(() => setCopiedPromptId(null), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  }, []);

  const handleDuplicatePrompt = useCallback((prompt: string, sourceId: string) => {
    setDuplicatedFromId(sourceId);
    onPromptsAdded([prompt]);
    setTimeout(() => setDuplicatedFromId(null), 400);
  }, [onPromptsAdded]);

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
      const { validFiles, oversized } = partitionFilesBySize(droppedFiles);

      // Add valid files immediately
      if (validFiles.length > 0) {
        onFilesAdded(validFiles);
      }

      // Show modal for oversized files
      if (oversized.length > 0) {
        setOversizedFiles(oversized);
        setShowSizeLimitModal(true);
      }
    }
  }, [onFilesAdded, partitionFilesBySize]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      const { validFiles, oversized } = partitionFilesBySize(selectedFiles);

      // Add valid files immediately
      if (validFiles.length > 0) {
        onFilesAdded(validFiles);
      }

      // Show modal for oversized files
      if (oversized.length > 0) {
        setOversizedFiles(oversized);
        setShowSizeLimitModal(true);
      }
    }
    // Reset the input so the same file can be selected again
    e.target.value = '';
  }, [onFilesAdded, partitionFilesBySize]);

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

        // Partition by size
        const validFiles: File[] = [];
        const oversized: OversizedFile[] = [];

        for (const file of imageFiles) {
          if (file.size <= MAX_FILE_SIZE_BYTES) {
            validFiles.push(file);
          } else {
            oversized.push({ file, id: crypto.randomUUID() });
          }
        }

        // Add valid files immediately
        if (validFiles.length > 0) {
          onFilesAdded(validFiles);
        }

        // Show modal for oversized files
        if (oversized.length > 0) {
          setOversizedFiles(oversized);
          setShowSizeLimitModal(true);
        }
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
                setShowClearConfirm(true);
              }}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        {inputs.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowModeInfo(true)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors flex items-center justify-center"
              title="What's the difference?"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>info</span>
            </button>
            <div className="relative flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
              {/* Sliding pill */}
              <div
                className={`absolute top-1 bottom-1 bg-neon rounded-lg shadow-sm transition-all duration-300 ease-out ${
                  processingMode === 'batch' ? 'left-1 right-[50%]' : 'left-[50%] right-1'
                }`}
              />
              {/* Batch button */}
              <button
                onClick={() => {
                  if (processingMode !== 'batch') {
                    playToggleSound();
                    onProcessingModeChange('batch');
                  }
                }}
                className={`relative z-10 flex-1 px-3 py-1.5 text-xs font-medium transition-colors duration-200 flex items-center justify-center gap-1.5 rounded-lg ${
                  processingMode === 'batch'
                    ? 'text-slate-900'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Batch
                <span className={`w-4 h-4 rounded-full text-[10px] font-semibold flex items-center justify-center transition-colors duration-200 ${
                  processingMode === 'batch'
                    ? 'bg-white text-slate-900'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}>
                  {inputs.length}
                </span>
              </button>
              {/* Combine button */}
              <button
                onClick={() => {
                  if (processingMode !== 'singleJob') {
                    playToggleSound();
                    onProcessingModeChange('singleJob');
                  }
                }}
                className={`relative z-10 flex-1 px-3 py-1.5 text-xs font-medium transition-colors duration-200 flex items-center justify-center rounded-lg ${
                  processingMode === 'singleJob'
                    ? 'text-slate-900'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Combine
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
              {inputs.map((input, index) => {
                // Check if this is a newly duplicated prompt (last prompt item when duplicatedFromId is set)
                const isNewDuplicate = duplicatedFromId && input.type === 'prompt' &&
                  index === inputs.length - 1;
                return (
                <div
                  key={input.id}
                  className={`relative group bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 ${isNewDuplicate ? 'animate-drop-in' : ''}`}
                  style={isNewDuplicate ? {
                    animation: 'dropIn 0.3s ease-out forwards',
                  } : undefined}
                >
                  {input.type === 'image' ? (
                    <div
                      className="flex gap-3 cursor-pointer"
                      onClick={() => {
                        setPreviewImage({
                          file: input.file,
                          name: input.file.name,
                          id: input.id,
                          displayName: input.displayName,
                        });
                        setEditingDisplayName(input.displayName || '');
                      }}
                    >
                      {loadingInputIds.has(input.id) ? (
                        <div className="w-14 h-14 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
                      ) : (
                        <img
                          src={URL.createObjectURL(input.file)}
                          alt={input.displayName || input.file.name}
                          className="w-14 h-14 object-cover rounded-lg hover:ring-2 hover:ring-neon hover:ring-offset-2 dark:hover:ring-offset-slate-800 transition-all duration-200"
                        />
                      )}
                      <div className="flex-1 min-w-0 pr-6">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{input.displayName || input.file.name}</p>
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
                      <div className="mt-2 flex justify-end gap-1">
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
                          <span>Copy Text</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playBlip();
                            handleDuplicatePrompt(input.prompt, input.id);
                          }}
                          className="btn-ghost py-1 px-2 text-xs"
                          title="Duplicate prompt"
                        >
                          <span className="material-symbols-outlined text-[14px]">control_point_duplicate</span>
                          <span>Duplicate</span>
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
              );
              })}
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
              <h3 className="text-lg font-semibold font-display truncate pr-4">{previewImage.displayName || previewImage.name}</h3>
              <button
                onClick={() => setPreviewImage(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-all duration-200 flex items-center justify-center flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor">
                  <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-center bg-slate-100 dark:bg-slate-900 rounded-xl overflow-hidden mb-4">
              <img
                src={URL.createObjectURL(previewImage.file)}
                alt={previewImage.displayName || previewImage.name}
                className="max-w-full max-h-[50vh] object-contain"
              />
            </div>
            {/* File name input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Display Name
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editingDisplayName}
                  onChange={(e) => setEditingDisplayName(e.target.value)}
                  placeholder={previewImage.name}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-neon focus:border-transparent"
                />
                <button
                  onClick={() => {
                    if (onUpdateDisplayName) {
                      onUpdateDisplayName(previewImage.id, editingDisplayName);
                    }
                    setPreviewImage(null);
                  }}
                  className="btn-primary px-4"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                This name will be shown in the input list and used for output files.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mode Info Modal */}
      {showModeInfo && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setShowModeInfo(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-elevated max-w-sm w-full p-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold font-display">Processing Modes</h3>
              <button
                onClick={() => setShowModeInfo(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-neon/20 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-amber-600" style={{ fontSize: '18px' }}>grid_view</span>
                </div>
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">Batch Mode</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Process each image separately. Returns one result image per input image.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-neon/20 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-amber-600" style={{ fontSize: '18px' }}>join</span>
                </div>
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">Combine Images into One</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Send all images together in one request. Returns a single combined result image.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <button
                onClick={() => setShowModeInfo(false)}
                className="w-full py-2.5 bg-neon hover:bg-amber-400 text-slate-900 font-semibold rounded-xl transition-colors"
              >
                I Understand
              </button>
              <a
                href="https://peel.diy/docs#batch-jobs"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2.5 text-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-colors text-sm"
              >
                Learn more in the Docs
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-elevated max-w-sm w-full p-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 dark:text-red-400" style={{ fontSize: '20px' }}>delete_sweep</span>
              </div>
              <h3 className="text-lg font-semibold font-display">Clear Everything?</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
              This will clear all your input images, chat instructions, and any results. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  playBlip();
                  onClearAll();
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors"
              >
                Yes, Clear All
              </button>
              <button
                onClick={() => {
                  playBlip();
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-2.5 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Size Limit Modal */}
      <FileSizeLimitModal
        isOpen={showSizeLimitModal}
        oversizedFiles={oversizedFiles}
        maxSizeBytes={MAX_FILE_SIZE_BYTES}
        onClose={() => {
          setShowSizeLimitModal(false);
          setOversizedFiles([]);
        }}
        onPickAnother={() => {
          setShowSizeLimitModal(false);
          setOversizedFiles([]);
        }}
        onResizeComplete={(files) => {
          onFilesAdded(files);
          setShowSizeLimitModal(false);
          setOversizedFiles([]);
        }}
      />
    </div>
  );
};

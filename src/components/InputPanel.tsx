import React, { useCallback, useState } from 'react';
import { BaseInputItem } from '../lib/concurrency';
import { formatFileSize } from '../lib/base64';
import { useSounds } from '../lib/sounds';

interface InputPanelProps {
  onFilesAdded: (files: File[]) => void;
  onPromptsAdded: (prompts: string[]) => void;
  inputs: BaseInputItem[];
  onRemoveInput: (id: string) => void;
  onClearAll: () => void;
  processingMode: 'batch' | 'singleJob';
  onProcessingModeChange: (mode: 'batch' | 'singleJob') => void;
}

export const InputPanel: React.FC<InputPanelProps> = ({
  onFilesAdded,
  onPromptsAdded,
  inputs,
  onRemoveInput,
  onClearAll,
  processingMode,
  onProcessingModeChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [promptText, setPromptText] = useState('');
  const { toggle: playToggleSound, blip: playBlip } = useSounds();

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">INPUT</h2>
          {inputs.length > 0 && (
            <button
              onClick={() => {
                playBlip();
                onClearAll();
              }}
              className="text-sm border border-black px-1 hover:bg-neon hover:border-neon transition-all"
            >
              CLEAR
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold">
            {processingMode === 'batch' ? `Batch Images (${inputs.length})` : 'Single Image'}
          </span>
          <button
            onClick={() => {
              playToggleSound();
              onProcessingModeChange(processingMode === 'batch' ? 'singleJob' : 'batch');
            }}
            className="relative w-9 h-5 border border-black rounded-full transition-colors duration-200"
            style={{ backgroundColor: processingMode === 'batch' ? '#00FF00' : 'white' }}
          >
            <span
              className={`absolute top-0.5 w-3.5 h-3.5 bg-black rounded-full transition-all duration-200 ease-out ${
                processingMode === 'batch' ? 'left-4.5' : 'left-0.5'
              }`}
              style={{
                transform: processingMode === 'batch' ? 'scale(1.1)' : 'scale(1)',
                transition: 'left 0.2s ease-out, transform 0.15s ease-out'
              }}
            />
          </button>
        </div>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          flex-1 border-2 transition-all rounded-xl min-h-0 overflow-hidden
          ${isDragging
            ? 'border-neon bg-neon/10'
            : 'border-black border-dashed opacity-50'
          }
        `}
      >
        {inputs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <div className="mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="#1f1f1f">
                <path d="M170-228q-38-45-61-99T80-440h82q6 43 22 82.5t42 73.5l-56 56ZM80-520q8-59 30-113t60-99l56 56q-26 34-42 73.5T162-520H80ZM438-82q-59-6-112.5-28.5T226-170l56-58q35 26 74 43t82 23v80ZM284-732l-58-58q47-37 101-59.5T440-878v80q-43 6-82.5 23T284-732ZM518-82v-80q44-6 83.5-22.5T676-228l58 58q-47 38-101.5 60T518-82Zm160-650q-35-26-75-43t-83-23v-80q59 6 113.5 28.5T734-790l-56 58Zm112 504-56-56q26-34 42-73.5t22-82.5h82q-8 59-30 113t-60 99Zm8-292q-6-43-22-82.5T734-676l56-56q38 45 61 99t29 113h-82ZM441-280v-247L337-423l-56-57 200-200 200 200-57 56-103-103v247h-80Z"/>
              </svg>
            </div>
            <p className="font-bold mb-2">DROP_IMAGES</p>
            <p className="text-sm mb-4">OR</p>
            <div className="flex gap-2 flex-wrap justify-center">
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <span className="border-2 border-black px-4 py-2 hover:bg-neon hover:border-neon transition-all font-bold inline-block">
                  BROWSE_IMAGES
                </span>
              </label>
              <button
                onClick={() => {
                  playBlip();
                  setShowPromptInput(true);
                }}
                className="border-2 border-black px-4 py-2 hover:bg-neon hover:border-neon transition-all font-bold"
              >
                ADD_TEXT_PROMPT
              </button>
            </div>
            <p className="text-xs mt-4 font-light">JPG/PNG/WEBP OR TEXT PROMPTS</p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-2">
            <div className="grid grid-cols-1 gap-2">
              {inputs.map((input) => (
                <div
                  key={input.id}
                  className="relative group border border-black p-2 hover:bg-neon/10 transition-colors"
                >
                  {input.type === 'image' ? (
                    <div className="flex gap-2">
                      <img
                        src={URL.createObjectURL(input.file)}
                        alt={input.file.name}
                        className="w-16 h-16 object-cover border border-black"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate font-bold">{input.file.name}</p>
                        <p className="text-xs font-light">{formatFileSize(input.file.size)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="w-16 h-16 border border-black bg-white flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="#1f1f1f">
                          <path d="M280-280h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold mb-1">TEXT PROMPT</p>
                        <p className="text-xs font-light line-clamp-2">{input.prompt}</p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      playBlip();
                      onRemoveInput(input.id);
                    }}
                    className="absolute top-1 right-1 w-6 h-6 border border-black bg-white hover:bg-neon transition-all text-xs font-bold"
                  >
                    ✕
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
                <div className="text-center py-2 border-2 border-dashed border-black opacity-50 hover:border-neon hover:bg-neon/10 hover:opacity-100 transition-all rounded-xl">
                  <span className="text-sm font-bold">+ ADD_MORE_IMAGES</span>
                </div>
              </label>
              <button
                onClick={() => {
                  playBlip();
                  setShowPromptInput(true);
                }}
                className="w-full text-center py-2 border-2 border-dashed border-black opacity-50 hover:border-neon hover:bg-neon/10 hover:opacity-100 transition-all rounded-xl"
              >
                <span className="text-sm font-bold">+ ADD_TEXT_PROMPT</span>
              </button>
            </div>
          </div>
        )}
      </div>


      {/* Prompt Input Modal */}
      {showPromptInput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-2 border-black max-w-md w-full p-4">
            <h3 className="text-lg font-bold mb-4">ADD TEXT PROMPT</h3>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Enter your text prompt for image generation..."
              className="w-full border border-black p-2 font-mono text-sm h-32 resize-none focus:outline-none focus:border-neon"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  playBlip();
                  handleAddPrompt();
                }}
                disabled={!promptText.trim()}
                className="flex-1 py-2 border border-black font-bold text-sm hover:bg-neon transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ADD
              </button>
              <button
                onClick={() => {
                  playBlip();
                  setShowPromptInput(false);
                  setPromptText('');
                }}
                className="flex-1 py-2 border border-black font-bold text-sm hover:bg-red-100 transition-all"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

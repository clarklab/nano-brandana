import React, { useState, useRef, useEffect, useCallback } from 'react';
import { InputItem } from '../lib/concurrency';
import { useSounds } from '../lib/sounds';
import { useUserPresets, RuntimePreset, processPromptTemplate, processDisplayTextTemplate, validateInput } from '../hooks/useUserPresets';
import { PresetConfigModal } from './PresetConfigModal';

interface ChatProps {
  onSendInstruction: (instruction: string, displayText?: string, referenceImageUrls?: string[], presetInfo?: { label: string; icon: string | null }) => void;
  isProcessing: boolean;
  currentModel: string;
  onModelChange: (model: string) => void;
  onRunBatch: (imageSize?: '1K' | '2K' | '4K') => void;
  canRunBatch: boolean;
  instructions: string[];
  onClearInstructions: () => void;
  onRemoveInstruction: (index: number) => void;
  inputs?: InputItem[];
  processingMode: 'batch' | 'singleJob';
}

interface TypingMessage {
  type: 'user' | 'assistant';
  text: string;
  isTyping?: boolean;
  displayText?: string;
  speed?: number; // typing speed in ms per character
}

const TypingText: React.FC<{ text: string; onComplete: () => void; speed?: number }> = ({ text, onComplete, speed = 8 }) => {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timer = setTimeout(() => {
        setDisplayText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timer);
    } else {
      onComplete();
    }
  }, [currentIndex, text, speed, onComplete]);

  return <>{displayText}</>;
};

// Preset tasks are now loaded from the useUserPresets hook
// and can be customized by users via the PresetConfigModal

export const Chat: React.FC<ChatProps> = ({
  onSendInstruction,
  isProcessing,
  currentModel,
  onModelChange,
  onRunBatch,
  canRunBatch,
  instructions = [],
  onClearInstructions,
  onRemoveInstruction,
  inputs = [],
  processingMode,
}) => {
  // Dynamic labels based on processing mode
  const runLabel = processingMode === 'batch' ? 'run the batch' : 'run the job';
  const [instruction, setInstruction] = useState('');
  const { blip: playBlip, bop: playBop, click: playClick } = useSounds();
  const [messages, setMessages] = useState<TypingMessage[]>([
    { type: 'assistant', text: 'Welcome to Peel, a batch image editor for brands. Upload your images first, then enter your instructions here...', isTyping: true }
  ]);

  // Preset management using the new hook
  const {
    presets,
    isLoading: presetsLoading,
    savePreset,
    deletePreset,
    reorderPresets,
    resetToDefaults,
  } = useUserPresets();

  // Currently waiting for user input for an "ask" type preset
  const [waitingForPreset, setWaitingForPreset] = useState<RuntimePreset | null>(null);

  // Track the currently selected preset for direct presets (to include reference images)
  const [currentPreset, setCurrentPreset] = useState<RuntimePreset | null>(null);

  // Preset config modal state
  const [isPresetConfigOpen, setIsPresetConfigOpen] = useState(false);

  // Track which instructions are expanded (by index)
  const [expandedInstructions, setExpandedInstructions] = useState<Set<number>>(new Set());

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = useCallback(() => {
    if (instruction.trim() && !isProcessing) {
      const userMessage = instruction.trim();
      setMessages(prev => [...prev, { type: 'user', text: userMessage }]);
      setInstruction('');

      if (waitingForPreset) {
        // Handle response to an "ask" type preset
        const preset = waitingForPreset;

        // Validate the input
        const validationError = validateInput(preset, userMessage);
        if (validationError) {
          setTimeout(() => {
            setMessages(prev => [...prev, {
              type: 'assistant',
              text: validationError,
              isTyping: true
            }]);
          }, 100);
          return;
        }

        // Process the prompt template with user input
        const processedPrompt = processPromptTemplate(preset, userMessage);
        const displayText = processDisplayTextTemplate(preset, userMessage);

        // Collect reference image URLs from the preset
        const referenceImageUrls = [
          preset.refImage1Url,
          preset.refImage2Url,
          preset.refImage3Url
        ].filter((url): url is string => url !== null);

        onSendInstruction(processedPrompt, displayText, referenceImageUrls.length > 0 ? referenceImageUrls : undefined, { label: preset.label, icon: preset.icon });
        setWaitingForPreset(null);

        // Short confirmation for presets
        setTimeout(() => {
          setMessages(prev => [...prev, {
            type: 'assistant',
            text: `Added "${preset.label}". [${runLabel}](#run-batch)?`,
            isTyping: true,
            speed: 4 // faster typing
          }]);
        }, 50);
      } else {
        // Normal instruction or direct preset
        const referenceImageUrls = currentPreset ? [
          currentPreset.refImage1Url,
          currentPreset.refImage2Url,
          currentPreset.refImage3Url
        ].filter((url): url is string => url !== null) : [];

        const presetInfo = currentPreset ? { label: currentPreset.label, icon: currentPreset.icon } : undefined;

        // Check if using a preset unchanged
        const isUnchangedPreset = currentPreset && userMessage === currentPreset.prompt;

        onSendInstruction(userMessage, undefined, referenceImageUrls.length > 0 ? referenceImageUrls : undefined, presetInfo);
        const presetLabel = currentPreset?.label;
        setCurrentPreset(null); // Clear current preset after use

        // Add assistant confirmation message
        setTimeout(() => {
          if (isUnchangedPreset && presetLabel) {
            // Short message for unchanged preset
            setMessages(prev => [...prev, {
              type: 'assistant',
              text: `Added "${presetLabel}". [${runLabel}](#run-batch)?`,
              isTyping: true,
              speed: 4 // faster typing
            }]);
          } else {
            // Custom instruction - slightly longer message
            setMessages(prev => [...prev, {
              type: 'assistant',
              text: `Added. [${runLabel}](#run-batch)?`,
              isTyping: true,
              speed: 4 // faster typing
            }]);
          }
        }, 50);
      }
    }
  }, [instruction, isProcessing, waitingForPreset, currentPreset, onSendInstruction, runLabel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();

      // If waiting for preset input (ask flow), send as chat
      if (waitingForPreset) {
        handleSend();
        return;
      }

      // If we have inputs and can run a job, start the job
      const isReady = canRunBatch || !!instruction.trim() || !!currentPreset;
      if (inputs.length > 0 && isReady && !isProcessing) {
        // Send instruction first if present
        if (instruction.trim()) {
          handleSend();
        }
        onRunBatch('1K');
        return;
      }

      // Otherwise send as chat
      handleSend();
    }
  };

  /**
   * Handle clicking a preset button.
   * For 'direct' presets: Puts the prompt in the textarea for user to review/edit.
   * For 'ask' presets: Shows a follow-up question and waits for user input.
   * Clicking the same preset again toggles it off.
   */
  const handlePreset = useCallback((preset: RuntimePreset) => {
    // Check if this preset is already active - if so, toggle it off
    const isCurrentlyActive = currentPreset?.id === preset.id || waitingForPreset?.id === preset.id;

    if (isCurrentlyActive) {
      // Toggle off - clear the active state
      setCurrentPreset(null);
      setWaitingForPreset(null);
      setInstruction(''); // Clear the textarea
      playClick();
      return;
    }

    // Activate the preset
    if (preset.presetType === 'ask' && preset.askMessage) {
      // Start the ask flow for this preset
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: preset.askMessage!,
        isTyping: true
      }]);
      setWaitingForPreset(preset);
      setCurrentPreset(null); // Clear any direct preset
      textareaRef.current?.focus();
    } else {
      // Direct preset - put the prompt in the textarea and remember the preset
      setInstruction(preset.prompt);
      setCurrentPreset(preset); // Remember this preset for reference images
      setWaitingForPreset(null); // Clear any ask preset
      textareaRef.current?.focus();
    }
    playClick();
  }, [currentPreset, waitingForPreset, playClick]);

  const handleMessageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A' && target.getAttribute('href') === '#run-batch') {
      e.preventDefault();
      if (canRunBatch) {
        onRunBatch();
      }
    }
  };

  const renderMessage = (text: string) => {
    // Convert markdown-style links to clickable elements
    const linkRegex = /\[([^\]]+)\]\(#run-batch\)/g;
    const parts = text.split(linkRegex);
    
    return parts.map((part, index) => {
      if (index % 2 === 1) { // This is link text
        return (
          <a
            key={index}
            href="#run-batch"
            onClick={(e) => {
              e.preventDefault();
              if (canRunBatch) {
                onRunBatch();
              }
            }}
            className={`underline font-bold ${
              canRunBatch
                ? 'text-black dark:text-gray-100 hover:bg-neon cursor-pointer'
                : 'text-gray-400 cursor-not-allowed'
            }`}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const handleTypingComplete = (messageIndex: number) => {
    setMessages(prev => prev.map((msg, idx) => 
      idx === messageIndex ? { ...msg, isTyping: false } : msg
    ));
  };

  // Get display name for model
  const getModelDisplayName = (model: string) => {
    if (model === 'google/gemini-3-pro-image') return 'Nano Banana Pro';
    return model;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold font-display">Tasks</h2>
          <select
            value={currentModel}
            onChange={(e) => {
              playBlip();
              onModelChange(e.target.value);
            }}
            className="bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-neon/30 cursor-pointer"
          >
            <option value="google/gemini-3-pro-image">
              {getModelDisplayName('google/gemini-3-pro-image')}
            </option>
          </select>
        </div>

        {instructions.length > 0 && (
          <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Instructions ({instructions.length})
              </span>
              <button
                onClick={() => {
                  playBlip();
                  onClearInstructions();
                  setExpandedInstructions(new Set());
                }}
                className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="text-sm text-slate-700 dark:text-slate-200 space-y-1">
              {instructions.map((instruction, index) => {
                const isExpanded = expandedInstructions.has(index);
                const isLong = instruction.length > 60;
                // Get a short label for the instruction (first 30 chars or preset name if available)
                const shortLabel = instruction.length > 30 ? instruction.substring(0, 30) + '...' : instruction;

                return (
                  <div key={index} className="flex items-start gap-2 group">
                    <span className="text-neon mt-0.5 flex-shrink-0">•</span>
                    <div className="flex-1 min-w-0">
                      <span className={isExpanded ? '' : 'line-clamp-1'}>
                        {instruction}
                      </span>
                    </div>
                    <div className="flex gap-0.5 flex-shrink-0">
                      {isLong && (
                        <button
                          onClick={() => {
                            playClick();
                            setExpandedInstructions(prev => {
                              const next = new Set(prev);
                              if (isExpanded) {
                                next.delete(index);
                              } else {
                                next.add(index);
                              }
                              return next;
                            });
                          }}
                          className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          >
                            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                      {/* Remove button */}
                      <button
                        onClick={() => {
                          playClick();
                          onRemoveInstruction(index);
                          // Update expanded state for indices after removed item
                          setExpandedInstructions(prev => {
                            const next = new Set<number>();
                            prev.forEach(i => {
                              if (i < index) next.add(i);
                              else if (i > index) next.add(i - 1);
                            });
                            return next;
                          });
                          // Add removal message
                          setMessages(prev => [...prev, {
                            type: 'assistant',
                            text: `Removed "${shortLabel}".`,
                            isTyping: true,
                            speed: 4
                          }]);
                        }}
                        className="p-0.5 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove instruction"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto mb-4">
        <div className="space-y-3 p-1">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
            >
              {message.type === 'assistant' && (
                <img
                  src="/peel.svg"
                  alt="Peel"
                  className="w-6 h-6 mr-2 mt-1 flex-shrink-0"
                />
              )}
              <div
                className={`max-w-[85%] px-3 py-2 text-sm rounded-2xl ${
                  message.type === 'user'
                    ? 'bg-slate-800 dark:bg-slate-700 text-white rounded-br-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-bl-md'
                }`}
                onClick={message.type === 'assistant' ? handleMessageClick : undefined}
              >
                {message.type === 'assistant' ? (
                  message.isTyping ? (
                    <TypingText
                      text={message.text}
                      onComplete={() => handleTypingComplete(index)}
                      speed={message.speed}
                    />
                  ) : (
                    renderMessage(message.text)
                  )
                ) : (
                  message.text
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="space-y-3">
        {/* Preset buttons - horizontal scrolling row */}
        <div className="flex items-center gap-2">
          {/* Scrollable presets container with fade mask */}
          <div className="relative flex-1 min-w-0">
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-2">
                {presets.filter(p => p.showInMainView).map((preset) => {
                  const isActive = currentPreset?.id === preset.id || waitingForPreset?.id === preset.id;
                  const hasReferenceImages = !!(preset.refImage1Url || preset.refImage2Url || preset.refImage3Url);

                  return (
                    <button
                      key={preset.id}
                      onClick={() => {
                        playClick();
                        handlePreset(preset);
                      }}
                      disabled={presetsLoading}
                      className={`px-4 py-2 text-sm border rounded-xl transition-all duration-200 font-medium flex items-center gap-2 disabled:opacity-50 whitespace-nowrap flex-shrink-0 ${
                        isActive
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-400 dark:border-yellow-600 text-yellow-900 dark:text-yellow-200 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-neon/10 hover:border-neon/50'
                      }`}
                    >
                      {preset.icon && (
                        <span
                          className={`material-symbols-outlined ${isActive ? 'text-yellow-600 dark:text-yellow-400' : 'text-slate-400'}`}
                          style={{ fontSize: '18px', width: '18px', height: '18px' }}
                        >
                          {preset.icon}
                        </span>
                      )}
                      {preset.label}
                      {hasReferenceImages && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-yellow-600 dark:bg-yellow-400' : 'bg-neon'}`} title="Has reference images" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Fade edge to indicate more content */}
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-slate-900 to-transparent pointer-events-none" />
          </div>
          {/* Settings button - matches preset pill styling */}
          <button
            onClick={() => {
              playBlip();
              setIsPresetConfigOpen(true);
            }}
            className="px-3 py-2 text-sm border rounded-xl transition-all duration-200 font-medium flex items-center gap-2 flex-shrink-0 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-neon/10 hover:border-neon/50 hover:text-slate-700 dark:hover:text-slate-200"
            title="Configure presets"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '18px', width: '18px', height: '18px' }}
            >
              settings
            </span>
          </button>
        </div>

        {/* Chat input with integrated Generate button */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={waitingForPreset ? (waitingForPreset.validationType === 'number' ? "Enter number..." : waitingForPreset.validationType === 'color' ? "Enter color..." : "Enter response...") : "Enter instruction..."}
              disabled={isProcessing}
              className="w-full resize-none h-24 p-3 pb-8 text-sm bg-transparent border-0 focus:ring-0 focus:outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
              rows={3}
            />
            {/* Send as chat button - subtle, right-aligned */}
            <button
              onClick={() => {
                playClick();
                handleSend();
              }}
              disabled={!instruction.trim() || isProcessing}
              className={`absolute bottom-2 right-3 text-xs font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 ${
                instruction.trim() && !isProcessing
                  ? 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <span>Send as chat</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M8 14a.75.75 0 0 1-.75-.75V4.56L4.03 7.78a.75.75 0 0 1-1.06-1.06l4.5-4.5a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.69A.75.75 0 0 1 8 14Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          {/* Generate button - integrated at bottom */}
          {inputs.length > 0 && (() => {
            // Button is ready if: has existing instructions, OR user typed something, OR preset is selected
            const isReady = canRunBatch || !!instruction.trim() || !!currentPreset;
            return (
              <button
                onClick={() => {
                  playBop();
                  // If there's instruction text, send it first
                  if (instruction.trim()) {
                    handleSend();
                  }
                  onRunBatch('1K');
                }}
                disabled={isProcessing || !isReady}
                className={`w-full py-3 font-semibold text-sm transition-all duration-200 border-t ${
                  isReady
                    ? 'bg-neon text-slate-900 hover:bg-amber-400 border-neon active:scale-[0.99]'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-center gap-3">
                  <span>{isProcessing ? 'Processing...' : (processingMode === 'singleJob' || inputs.length === 1) ? 'Make Single Image' : `Make ${inputs.length} Images`}</span>
                  {!isProcessing && (
                    <div className="flex bg-black/10 rounded-lg overflow-hidden text-xs">
                      <span className="px-2 py-1 bg-slate-900 text-white font-semibold">
                        SD
                      </span>
                      <span
                        onClick={(e) => { e.stopPropagation(); if (isReady) { playBop(); if (instruction.trim()) handleSend(); onRunBatch('2K'); } }}
                        className={`px-2 py-1 font-semibold ${
                          isReady ? 'hover:bg-slate-900/80 hover:text-white cursor-pointer' : ''
                        }`}
                      >
                        HD
                      </span>
                      <span
                        onClick={(e) => { e.stopPropagation(); if (isReady) { playBop(); if (instruction.trim()) handleSend(); onRunBatch('4K'); } }}
                        className={`px-2 py-1 font-semibold ${
                          isReady ? 'hover:bg-slate-900/80 hover:text-white cursor-pointer' : ''
                        }`}
                      >
                        4K
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })()}
        </div>
      </div>

      {/* Preset Configuration Modal */}
      <PresetConfigModal
        isOpen={isPresetConfigOpen}
        onClose={() => setIsPresetConfigOpen(false)}
        presets={presets}
        onSavePreset={savePreset}
        onDeletePreset={deletePreset}
        onReorderPresets={reorderPresets}
        onResetToDefaults={resetToDefaults}
        isLoading={presetsLoading}
      />
    </div>
  );
};
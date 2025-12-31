import React, { useState, useRef, useEffect, useCallback } from 'react';
import { InputItem } from '../lib/concurrency';
import { useSounds } from '../lib/sounds';
import { useUserPresets, RuntimePreset, processPromptTemplate, processDisplayTextTemplate, processConfirmationTemplate, validateInput } from '../hooks/useUserPresets';
import { PresetConfigModal } from './PresetConfigModal';

interface ChatProps {
  onSendInstruction: (instruction: string, displayText?: string, referenceImageUrls?: string[]) => void;
  isProcessing: boolean;
  currentModel: string;
  onModelChange: (model: string) => void;
  onRunBatch: (imageSize?: '1K' | '2K' | '4K') => void;
  canRunBatch: boolean;
  instructions: string[];
  onClearInstructions: () => void;
  inputs?: InputItem[];
  processingMode: 'batch' | 'singleJob';
}

interface TypingMessage {
  type: 'user' | 'assistant';
  text: string;
  isTyping?: boolean;
  displayText?: string;
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
    resetToDefaults,
  } = useUserPresets();

  // Currently waiting for user input for an "ask" type preset
  const [waitingForPreset, setWaitingForPreset] = useState<RuntimePreset | null>(null);

  // Track the currently selected preset for direct presets (to include reference images)
  const [currentPreset, setCurrentPreset] = useState<RuntimePreset | null>(null);

  // Preset config modal state
  const [isPresetConfigOpen, setIsPresetConfigOpen] = useState(false);

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
        const confirmation = processConfirmationTemplate(preset, userMessage);

        // Collect reference image URLs from the preset
        const referenceImageUrls = [
          preset.refImage1Url,
          preset.refImage2Url,
          preset.refImage3Url
        ].filter((url): url is string => url !== null);

        onSendInstruction(processedPrompt, displayText, referenceImageUrls.length > 0 ? referenceImageUrls : undefined);
        setWaitingForPreset(null);

        setTimeout(() => {
          setMessages(prev => [...prev, {
            type: 'assistant',
            text: `${confirmation} Ready to [${runLabel}](#run-batch) when you are! Need any other edits?`,
            isTyping: true
          }]);
        }, 100);
      } else {
        // Normal instruction or direct preset
        // If currentPreset is set, include reference images
        const referenceImageUrls = currentPreset ? [
          currentPreset.refImage1Url,
          currentPreset.refImage2Url,
          currentPreset.refImage3Url
        ].filter((url): url is string => url !== null) : [];

        onSendInstruction(userMessage, undefined, referenceImageUrls.length > 0 ? referenceImageUrls : undefined);
        setCurrentPreset(null); // Clear current preset after use

        // Add assistant confirmation message
        setTimeout(() => {
          const confirmations = ['Got it!', 'Will do!', 'Perfect!', 'On it!'];
          const randomConfirmation = confirmations[Math.floor(Math.random() * confirmations.length)];
          setMessages(prev => [...prev, {
            type: 'assistant',
            text: `${randomConfirmation} Added "${userMessage}" to the instruction list. Ready to [${runLabel}](#run-batch) when you are! Need any other edits?`,
            isTyping: true
          }]);
        }, 100);
      }
    }
  }, [instruction, isProcessing, waitingForPreset, currentPreset, onSendInstruction, runLabel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Handle clicking a preset button.
   * For 'direct' presets: Puts the prompt in the textarea for user to review/edit.
   * For 'ask' presets: Shows a follow-up question and waits for user input.
   */
  const handlePreset = useCallback((preset: RuntimePreset) => {
    if (preset.presetType === 'ask' && preset.askMessage) {
      // Start the ask flow for this preset
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: preset.askMessage!,
        isTyping: true
      }]);
      setWaitingForPreset(preset);
      textareaRef.current?.focus();
    } else {
      // Direct preset - put the prompt in the textarea and remember the preset
      setInstruction(preset.prompt);
      setCurrentPreset(preset); // Remember this preset for reference images
      textareaRef.current?.focus();
    }
  }, []);

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

        <div className="flex flex-wrap gap-2 mb-4">
          {presets.map((preset) => {
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
                className={`px-3 py-1.5 text-xs border rounded-xl transition-all duration-200 font-medium flex items-center gap-1.5 disabled:opacity-50 ${
                  isActive
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-400 dark:border-yellow-600 text-yellow-900 dark:text-yellow-200 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-neon/10 hover:border-neon/50'
                }`}
              >
                {preset.icon && (
                  <span
                    className={`material-symbols-outlined ${isActive ? 'text-yellow-600 dark:text-yellow-400' : 'text-slate-400'}`}
                    style={{ fontSize: '14px', width: '14px', height: '14px' }}
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
          {/* Gear icon to open preset configuration */}
          <button
            onClick={() => {
              playBlip();
              setIsPresetConfigOpen(true);
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200"
            title="Configure presets"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M6.955 1.45A.5.5 0 0 1 7.452 1h1.096a.5.5 0 0 1 .497.45l.17 1.699c.484.12.94.312 1.356.562l1.321-1.081a.5.5 0 0 1 .67.033l.774.775a.5.5 0 0 1 .034.67l-1.08 1.32c.25.417.44.873.561 1.357l1.699.17a.5.5 0 0 1 .45.497v1.096a.5.5 0 0 1-.45.497l-1.699.17c-.12.484-.312.94-.562 1.356l1.082 1.322a.5.5 0 0 1-.034.67l-.774.774a.5.5 0 0 1-.67.033l-1.322-1.08c-.416.25-.872.44-1.356.561l-.17 1.699a.5.5 0 0 1-.497.45H7.452a.5.5 0 0 1-.497-.45l-.17-1.699a4.973 4.973 0 0 1-1.356-.562L4.108 13.37a.5.5 0 0 1-.67-.033l-.774-.775a.5.5 0 0 1-.034-.67l1.08-1.32a4.971 4.971 0 0 1-.561-1.357l-1.699-.17A.5.5 0 0 1 1 8.548V7.452a.5.5 0 0 1 .45-.497l1.699-.17c.12-.484.312-.94.562-1.356L2.629 4.107a.5.5 0 0 1 .034-.67l.774-.774a.5.5 0 0 1 .67-.033L5.43 3.71a4.97 4.97 0 0 1 1.356-.561l.17-1.699ZM8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {instructions.length > 0 && (
          <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Instructions</span>
              <button
                onClick={() => {
                  playBlip();
                  onClearInstructions();
                }}
                className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="text-sm text-slate-700 dark:text-slate-200 space-y-1">
              {instructions.map((instruction, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-neon mt-0.5">•</span>
                  <span>{instruction}</span>
                </div>
              ))}
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
        {inputs.length > 0 && (
          <div className="relative">
            <button
              onClick={() => {
                playBop();
                onRunBatch('1K');
              }}
              disabled={isProcessing || !canRunBatch}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 relative ${
                canRunBatch
                  ? 'bg-neon text-slate-900 hover:bg-amber-400 shadow-soft hover:shadow-glow active:scale-[0.98]'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-center gap-3">
                <span>{isProcessing ? 'Processing...' : `Generate Images (${inputs.length})`}</span>
                {!isProcessing && (
                  <div className="flex bg-black/10 rounded-lg overflow-hidden text-xs">
                    <span
                      className="px-2 py-1 bg-slate-900 text-white font-semibold"
                    >
                      1K
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); if (canRunBatch) { playBop(); onRunBatch('2K'); } }}
                      className={`px-2 py-1 font-semibold ${
                        canRunBatch ? 'hover:bg-slate-900/80 hover:text-white cursor-pointer' : ''
                      }`}
                    >
                      2K
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); if (canRunBatch) { playBop(); onRunBatch('4K'); } }}
                      className={`px-2 py-1 font-semibold ${
                        canRunBatch ? 'hover:bg-slate-900/80 hover:text-white cursor-pointer' : ''
                      }`}
                    >
                      4K
                    </span>
                  </div>
                )}
              </div>
            </button>
          </div>
        )}

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={waitingForPreset ? (waitingForPreset.validationType === 'number' ? "Enter number..." : waitingForPreset.validationType === 'color' ? "Enter color..." : "Enter response...") : "Enter instruction..."}
            disabled={isProcessing}
            className="input resize-none h-20 pr-12 text-sm"
            rows={3}
          />
          <button
            onClick={() => {
              playClick();
              handleSend();
            }}
            disabled={!instruction.trim() || isProcessing}
            className={`absolute bottom-3 right-3 p-2 rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
              instruction.trim() && !isProcessing
                ? 'bg-neon text-slate-900 hover:bg-amber-400 shadow-soft'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M8 14a.75.75 0 0 1-.75-.75V4.56L4.03 7.78a.75.75 0 0 1-1.06-1.06l4.5-4.5a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.69A.75.75 0 0 1 8 14Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Preset Configuration Modal */}
      <PresetConfigModal
        isOpen={isPresetConfigOpen}
        onClose={() => setIsPresetConfigOpen(false)}
        presets={presets}
        onSavePreset={savePreset}
        onDeletePreset={deletePreset}
        onResetToDefaults={resetToDefaults}
        isLoading={presetsLoading}
      />
    </div>
  );
};
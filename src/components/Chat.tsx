import React, { useState, useRef, useEffect, useCallback } from 'react';
import { InputItem } from '../lib/concurrency';
import { useSounds } from '../lib/sounds';
import { useUserPresets, RuntimePreset, processPromptTemplate, processDisplayTextTemplate, processConfirmationTemplate, validateInput } from '../hooks/useUserPresets';
import { PresetConfigModal } from './PresetConfigModal';

interface ChatProps {
  onSendInstruction: (instruction: string, displayText?: string) => void;
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

        onSendInstruction(processedPrompt, displayText);
        setWaitingForPreset(null);

        setTimeout(() => {
          setMessages(prev => [...prev, {
            type: 'assistant',
            text: `${confirmation} Ready to [${runLabel}](#run-batch) when you are! Need any other edits?`,
            isTyping: true
          }]);
        }, 100);
      } else {
        // Normal instruction
        onSendInstruction(userMessage);

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
  }, [instruction, isProcessing, waitingForPreset, onSendInstruction, runLabel]);

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
      // Direct preset - put the prompt in the textarea
      setInstruction(preset.prompt);
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
          <h2 className="text-lg font-bold font-sans">Tasks</h2>
          <select
            value={currentModel}
            onChange={(e) => {
              playBlip();
              onModelChange(e.target.value);
            }}
            className="bg-transparent text-xs font-bold focus:outline-none cursor-pointer appearance-none pr-4 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOCIgaGVpZ2h0PSI1IiB2aWV3Qm94PSIwIDAgOCA1IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xIDFMNCA0TDcgMSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+')] bg-no-repeat bg-right"
          >
            <option value="google/gemini-3-pro-image">
              {getModelDisplayName('google/gemini-3-pro-image')}
            </option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                playClick();
                handlePreset(preset);
              }}
              disabled={presetsLoading}
              className="px-2 py-1 text-xs border border-black dark:border-gray-600 hover:bg-neon hover:border-neon transition-all font-bold disabled:opacity-50 flex items-center gap-1"
            >
              {preset.icon && (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '14px', width: '14px', height: '14px' }}
                >
                  {preset.icon}
                </span>
              )}
              {preset.label.toUpperCase()}
            </button>
          ))}
          {/* Gear icon to open preset configuration */}
          <button
            onClick={() => {
              playBlip();
              setIsPresetConfigOpen(true);
            }}
            className="px-2 py-1 text-xs border border-black dark:border-gray-600 hover:bg-neon hover:border-neon transition-all"
            title="Configure presets"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M6.955 1.45A.5.5 0 0 1 7.452 1h1.096a.5.5 0 0 1 .497.45l.17 1.699c.484.12.94.312 1.356.562l1.321-1.081a.5.5 0 0 1 .67.033l.774.775a.5.5 0 0 1 .034.67l-1.08 1.32c.25.417.44.873.561 1.357l1.699.17a.5.5 0 0 1 .45.497v1.096a.5.5 0 0 1-.45.497l-1.699.17c-.12.484-.312.94-.562 1.356l1.082 1.322a.5.5 0 0 1-.034.67l-.774.774a.5.5 0 0 1-.67.033l-1.322-1.08c-.416.25-.872.44-1.356.561l-.17 1.699a.5.5 0 0 1-.497.45H7.452a.5.5 0 0 1-.497-.45l-.17-1.699a4.973 4.973 0 0 1-1.356-.562L4.108 13.37a.5.5 0 0 1-.67-.033l-.774-.775a.5.5 0 0 1-.034-.67l1.08-1.32a4.971 4.971 0 0 1-.561-1.357l-1.699-.17A.5.5 0 0 1 1 8.548V7.452a.5.5 0 0 1 .45-.497l1.699-.17c.12-.484.312-.94.562-1.356L2.629 4.107a.5.5 0 0 1 .034-.67l.774-.774a.5.5 0 0 1 .67-.033L5.43 3.71a4.97 4.97 0 0 1 1.356-.561l.17-1.699ZM8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {instructions.length > 0 && (
          <div className="mb-4 p-2 border-2 border-black dark:border-gray-600">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold">INSTRUCTIONS:</span>
              <button
                onClick={() => {
                  playBlip();
                  onClearInstructions();
                }}
                className="text-xs border border-black dark:border-gray-600 px-1 hover:bg-neon hover:border-neon transition-all"
              >
                CLEAR
              </button>
            </div>
            <div className="text-xs font-light space-y-1">
              {instructions.map((instruction, index) => (
                <div key={index}>- {instruction}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 p-2 overflow-y-auto mb-4">
        <div className="space-y-2">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.type === 'assistant' && (
                <img
                  src="/peel.svg"
                  alt="Peel"
                  className="w-6 h-6 mr-2 mt-1 flex-shrink-0"
                />
              )}
              <div
                className={`max-w-[80%] p-2 text-xs ${
                  message.type === 'user'
                    ? 'border border-black dark:border-gray-600 bg-black text-white font-bold'
                    : 'bg-neon/10 dark:bg-neon/20 text-black dark:text-gray-100 font-light'
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

      <div className="space-y-2">
        {inputs.length > 0 && (
          <div className="relative">
            <button
              onClick={() => {
                playBop();
                onRunBatch('1K');
              }}
              disabled={isProcessing || !canRunBatch}
              className={`w-full py-2 border-2 font-bold text-sm transition-all relative ${
                canRunBatch
                  ? 'border-neon bg-neon text-black hover:bg-white dark:hover:bg-gray-800 hover:text-black dark:hover:text-gray-100'
                  : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-center gap-3">
                <span>{isProcessing ? 'PROCESSING...' : `MAKE_IMAGES [${inputs.length}]`}</span>
                {!isProcessing && (
                  <div className="flex border border-black/20 rounded overflow-hidden text-xs">
                    <span
                      className="px-2 py-0.5 bg-black text-white font-bold"
                    >
                      1K
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); if (canRunBatch) { playBop(); onRunBatch('2K'); } }}
                      className={`px-2 py-0.5 border-l border-black/20 font-bold ${
                        canRunBatch ? 'hover:bg-black hover:text-white cursor-pointer' : ''
                      }`}
                    >
                      2K
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); if (canRunBatch) { playBop(); onRunBatch('4K'); } }}
                      className={`px-2 py-0.5 border-l border-black/20 font-bold ${
                        canRunBatch ? 'hover:bg-black hover:text-white cursor-pointer' : ''
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
        
        <div className="relative leading-none">
          <textarea
            ref={textareaRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={waitingForPreset ? (waitingForPreset.validationType === 'number' ? "ENTER_NUMBER..." : waitingForPreset.validationType === 'color' ? "ENTER_COLOR..." : "ENTER_RESPONSE...") : "ENTER_INSTRUCTION..."}
            disabled={isProcessing}
            className="w-full px-2 py-2 border-2 border-black dark:border-gray-600 bg-white dark:bg-gray-900 resize-none focus:border-neon focus:outline-none disabled:opacity-50 text-xs font-mono h-20"
            rows={3}
          />
          <button
            onClick={() => {
              playClick();
              handleSend();
            }}
            disabled={!instruction.trim() || isProcessing}
            className={`absolute bottom-3 right-2 p-1 border border-black dark:border-gray-600 hover:bg-neon disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
              instruction.trim() && !isProcessing
                ? 'bg-black text-white'
                : 'bg-white dark:bg-gray-800 text-black dark:text-gray-100'
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
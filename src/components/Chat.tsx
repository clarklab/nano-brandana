import React, { useState, useRef, useEffect } from 'react';

interface ChatProps {
  onSendInstruction: (instruction: string, displayText?: string) => void;
  isProcessing: boolean;
  currentModel: string;
  onModelChange: (model: string) => void;
  onRunBatch: () => void;
  canRunBatch: boolean;
  instructions: string[];
  onClearInstructions: () => void;
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

const QUICK_PRESETS = [
  { label: 'Remove BG', value: 'Remove the background and make it transparent' },
  { label: 'Add Brand Color', value: '__ASK_BRAND_COLOR__' },
  { label: 'Upscale', value: 'Upscale the image and enhance details' },
  { label: 'Desaturate', value: 'Desaturate the image to make it more muted' },
];

export const Chat: React.FC<ChatProps> = ({
  onSendInstruction,
  isProcessing,
  currentModel,
  onModelChange,
  onRunBatch,
  canRunBatch,
  instructions = [],
  onClearInstructions,
}) => {
  const [instruction, setInstruction] = useState('');
  const [messages, setMessages] = useState<TypingMessage[]>([
    { type: 'assistant', text: 'Welcome to Nano Brandana, a batch image editor for brands. Upload your images first, then enter your instructions here...', isTyping: true }
  ]);
  const [waitingForBrandColor, setWaitingForBrandColor] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (instruction.trim() && !isProcessing) {
      const userMessage = instruction.trim();
      setMessages(prev => [...prev, { type: 'user', text: userMessage }]);
      setInstruction('');
      
      if (waitingForBrandColor) {
        // Handle brand color response
        const brandColorInstruction = `Identify the most suitable clothing item, accessory, object, or surface in the image and change it to ${userMessage} in a natural way that enhances the overall composition. Choose elements that would realistically be found in that color and avoid changing skin tones, faces, or core identifying features.`;
        const displayText = `Add brand color ${userMessage}`;
        onSendInstruction(brandColorInstruction, displayText);
        setWaitingForBrandColor(false);
        
        setTimeout(() => {
          setMessages(prev => [...prev, { 
            type: 'assistant', 
            text: `Perfect! I'll add ${userMessage} branding to your images by changing suitable objects to that color. Added to the instruction list. Ready to [run the batch](#run-batch) when you are! Need any other edits?`,
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
            text: `${randomConfirmation} Added "${userMessage}" to the instruction list. Ready to [run the batch](#run-batch) when you are! Need any other edits?`,
            isTyping: true
          }]);
        }, 100);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePreset = (preset: string) => {
    if (preset === '__ASK_BRAND_COLOR__') {
      // Start brand color flow
      setMessages(prev => [...prev, { 
        type: 'assistant', 
        text: 'What brand color would you like me to add? (e.g., "bright red", "navy blue", "forest green", "#FF5733")',
        isTyping: true
      }]);
      setWaitingForBrandColor(true);
      textareaRef.current?.focus();
    } else {
      setInstruction(preset);
      textareaRef.current?.focus();
    }
  };

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
                ? 'text-black hover:bg-neon cursor-pointer' 
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

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-bold mb-4">TASKS</h2>

        <div className="flex flex-wrap gap-2 mb-4">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePreset(preset.value)}
              className="px-2 py-1 text-xs border border-black hover:bg-neon hover:border-neon transition-all font-bold"
            >
              {preset.label.toUpperCase()}
            </button>
          ))}
        </div>

        {instructions.length > 0 && (
          <div className="mb-4 p-2 border-2 border-black">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold">INSTRUCTIONS:</span>
              <button
                onClick={onClearInstructions}
                className="text-xs border border-black px-1 hover:bg-neon hover:border-neon transition-all"
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
                  src="/brandana.webp" 
                  alt="Brandana" 
                  className="w-6 h-6 mr-2 mt-1 flex-shrink-0" 
                />
              )}
              <div
                className={`max-w-[80%] p-2 text-xs ${
                  message.type === 'user'
                    ? 'border border-black bg-black text-white font-bold'
                    : 'bg-neon/10 text-black font-light'
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

      <div className="relative leading-none">
        <textarea
          ref={textareaRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={waitingForBrandColor ? "ENTER_COLOR..." : "ENTER_INSTRUCTION..."}
          disabled={isProcessing}
          className="w-full px-2 py-2 border-2 border-black resize-none focus:border-neon focus:outline-none disabled:opacity-50 text-xs font-mono h-20"
          rows={3}
        />
        <button
          onClick={handleSend}
          disabled={!instruction.trim() || isProcessing}
          className={`absolute bottom-3 right-2 p-1 border border-black hover:bg-neon disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
            instruction.trim() && !isProcessing
              ? 'bg-black text-white'
              : 'bg-white text-black'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8 14a.75.75 0 0 1-.75-.75V4.56L4.03 7.78a.75.75 0 0 1-1.06-1.06l4.5-4.5a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.69A.75.75 0 0 1 8 14Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
};
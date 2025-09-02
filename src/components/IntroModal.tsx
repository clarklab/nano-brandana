import React from 'react';

interface IntroModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IntroModal: React.FC<IntroModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleClose = () => {
    localStorage.setItem('nano-brandana-intro-seen', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-neon z-50 flex items-center justify-center p-4">
      <div className="bg-white border-2 border-black max-w-6xl w-full max-h-[90vh] overflow-y-auto relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 border border-black bg-white hover:bg-neon transition-all text-lg font-bold z-10"
        >
          ✕
        </button>
        
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-full">
          {/* Left Column - Intro (first on mobile) */}
          <div className="p-8 flex flex-col justify-center border-r-0 md:border-r border-black order-1 md:order-1">
            <div className="flex items-center gap-4 mb-8">
              <img src="/brandana.webp" alt="Brandana" className="w-16 h-16" />
              <div>
                <h1 className="text-2xl font-bold">NANO-BRANDANA</h1>
                <p className="text-sm font-light">BATCH IMAGE EDITOR FOR BRANDS</p>
              </div>
            </div>
            
            <div className="space-y-4 mb-8">
              <p className="text-lg font-bold">
                Transform your brand images with AI-powered batch editing.
              </p>
              
              <div className="space-y-2 text-sm font-light">
                <p>• Upload multiple images at once</p>
                <p>• Apply consistent edits across all images</p>
                <p>• Use natural language instructions</p>
                <p>• Download edited images individually or as a ZIP</p>
              </div>
              
              <p className="text-sm">
                Perfect for social media content, product photos, marketing materials, and brand consistency.
              </p>
            </div>
            
            <div className="inline-flex items-center gap-2">
              <span className="bg-black text-white px-2 py-1 text-xs font-bold">
                POWERED BY VERCEL AI GATEWAY
              </span>
            </div>
          </div>
          
          {/* Right Column - Before/After Image (second on mobile) */}
          <div className="flex items-center justify-center p-8 order-2 md:order-2">
            <img
              src="/before-after.webp"
              alt="Before and After Example"
              className="max-w-[85%] max-h-[85%] object-contain"
            />
          </div>
          
        </div>
      </div>
    </div>
  );
};
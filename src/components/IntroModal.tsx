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
    <div className="fixed inset-0 bg-neon dark:bg-neon/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-600 max-w-6xl w-full max-h-[90vh] overflow-y-auto relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 border border-black dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-neon transition-all text-lg font-bold z-10"
        >
          ✕
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 min-h-full">
          {/* Left Column - Intro (first on mobile) */}
          <div className="p-8 flex flex-col justify-center border-r-0 md:border-r border-black dark:border-gray-600 order-1 md:order-1">
            <div className="flex items-center gap-4 mb-8">
              <img src="/brandana.webp" alt="Brandana" className="w-16 h-16" />
              <div>
                <h1 className="text-2xl font-bold">NANO-BRANDANA</h1>
                <p className="text-sm font-light">BATCH IMAGE EDITOR AGENT FOR BRANDS</p>
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
              
              <p>
                <a href="" onClick={handleClose} className="get-started-link underline decoration-neon decoration-2 decoration-offset-2">Get Started</a>
                
              </p>
            </div>
            
            <div className="inline-flex items-center gap-2">
              <span className="bg-black text-white px-3 py-2 text-xs font-bold rounded-lg flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 18 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M9 0.205765L18 15.7942H0L9 0.205765Z" fill="white"/>
</svg>
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
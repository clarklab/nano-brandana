import React from 'react';

interface IntroModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IntroModal: React.FC<IntroModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleClose = () => {
    localStorage.setItem('peel-intro-seen', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-amber-400 via-neon to-amber-300 dark:from-amber-900 dark:via-amber-800 dark:to-amber-900 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-elevated max-w-5xl w-full max-h-[90vh] overflow-y-auto relative animate-slide-up">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center z-10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" className="text-slate-500" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
          </svg>
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 min-h-full">
          {/* Left Column - Intro (first on mobile) */}
          <div className="p-8 md:p-10 flex flex-col justify-center order-1 md:order-1">
            <div className="flex items-center gap-4 mb-8">
              <img src="/peel.svg" alt="Peel" className="w-14 h-14" />
              <div>
                <h1 className="text-2xl font-medium font-display tracking-tight">Peel</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">Batch image editor for brands</p>
              </div>
            </div>

            <div className="space-y-5 mb-8">
              <p className="text-xl font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                Transform your brand images with AI-powered batch editing.
              </p>

              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-neon/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-neon"></div>
                  </div>
                  <span>Upload multiple images at once</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-neon/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-neon"></div>
                  </div>
                  <span>Apply consistent edits across all images</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-neon/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-neon"></div>
                  </div>
                  <span>Use natural language instructions</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-neon/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-neon"></div>
                  </div>
                  <span>Download edited images individually or as a ZIP</span>
                </div>
              </div>

              <p className="text-sm text-slate-500 dark:text-slate-400">
                Perfect for social media content, product photos, marketing materials, and brand consistency.
              </p>

              <button
                onClick={handleClose}
                className="btn-primary text-base px-6 py-3"
              >
                Get Started
              </button>
            </div>

            <div className="inline-flex items-center gap-2">
              <span className="bg-slate-900 text-white px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 18 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 0.205765L18 15.7942H0L9 0.205765Z" fill="white"/>
                </svg>
                Powered by Vercel AI Gateway
              </span>
            </div>
          </div>

          {/* Right Column - Before/After Image (second on mobile) */}
          <div className="flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900/50 rounded-r-3xl order-2 md:order-2">
            <img
              src="/before-after.webp"
              alt="Before and After Example"
              className="max-w-[90%] max-h-[85%] object-contain rounded-2xl shadow-card"
            />
          </div>

        </div>
      </div>
    </div>
  );
};
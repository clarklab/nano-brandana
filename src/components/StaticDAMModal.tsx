import { useState, useEffect, useCallback } from 'react';
import { useSounds } from '../lib/sounds';
import { base64ToFile } from '../lib/base64';
import { submitToStaticDAM, SubmitResult } from '../lib/staticdam';

interface StaticDAMModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageData: string;
  onSuccess?: (prUrl: string) => void;
}

const DEFAULT_SITE_URL = 'https://staticdam-sourceday.netlify.app';
const STORAGE_KEY = 'staticdam_site_url';

export function StaticDAMModal({
  isOpen,
  onClose,
  imageData,
  onSuccess,
}: StaticDAMModalProps) {
  const { click: playClick, blip: playBlip, error: playError } = useSounds();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [siteUrl, setSiteUrl] = useState(DEFAULT_SITE_URL);
  const [subfolder, setSubfolder] = useState('');
  const [tags, setTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  // Load saved site URL from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setSiteUrl(saved);
    }
  }, []);

  // Handle open/close animations and reset state
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setResult(null);
      setIsSubmitting(false);
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    playClick();
    onClose();
  }, [onClose, playClick]);

  const handleSubmit = useCallback(async () => {
    if (!imageData || isSubmitting) return;

    playBlip();
    setIsSubmitting(true);
    setResult(null);

    // Save site URL to localStorage
    localStorage.setItem(STORAGE_KEY, siteUrl);

    // Convert base64 to File
    const timestamp = Date.now();
    const file = base64ToFile(imageData, `image_${timestamp}.png`);

    // Parse tags (comma-separated)
    const tagArray = tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const submitResult = await submitToStaticDAM(siteUrl, file, {
      subfolder: subfolder.trim() || undefined,
      tags: tagArray.length > 0 ? tagArray : undefined,
    });

    setResult(submitResult);
    setIsSubmitting(false);

    if (submitResult.success && submitResult.pr_url) {
      onSuccess?.(submitResult.pr_url);
    } else {
      playError();
    }
  }, [imageData, isSubmitting, siteUrl, subfolder, tags, onSuccess, playBlip, playError]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, handleClose]);

  if (!isVisible) return null;

  // Success state
  if (result?.success && result.pr_url) {
    return (
      <div
        className={`fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-4 ${
          isAnimating ? 'animate-fade-in' : 'animate-fade-out'
        }`}
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
        onClick={(e) => e.target === e.currentTarget && handleClose()}
      >
        <div
          className={`bg-white dark:bg-slate-800 w-full h-auto md:max-w-md md:rounded-2xl shadow-elevated relative flex flex-col ${
            isAnimating ? 'animate-slide-up' : 'animate-slide-down'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
            <h2 className="text-lg font-semibold font-display">Submitted!</h2>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" className="text-slate-500" fill="currentColor">
                <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
              </svg>
            </button>
          </div>

          {/* Success Content */}
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-green-600 dark:text-green-400">check_circle</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300">PR Created Successfully</p>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex gap-3 bg-slate-50/50 dark:bg-slate-900/30 md:rounded-b-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button
              onClick={handleClose}
              className="btn-secondary flex-1"
            >
              Done
            </button>
            <a
              href={result.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary flex-1 text-center"
              onClick={() => playBlip()}
            >
              Open Pull Request
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-4 ${
        isAnimating ? 'animate-fade-in' : 'animate-fade-out'
      }`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && !isSubmitting && handleClose()}
    >
      <div
        className={`bg-white dark:bg-slate-800 w-full h-auto md:max-w-md md:rounded-2xl shadow-elevated relative flex flex-col ${
          isAnimating ? 'animate-slide-up' : 'animate-slide-down'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 78 78" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-slate-600 dark:text-slate-300">
              <path d="M64.3778 64.3778C71.4846 57.2711 65.7149 39.979 51.4908 25.755C37.2667 11.5309 19.9747 5.76118 12.8679 12.8679C5.76117 19.9747 11.5309 37.2668 25.7549 51.4908C39.979 65.7149 57.2711 71.4846 64.3778 64.3778Z" stroke="currentColor" strokeWidth="4.8" strokeMiterlimit="10"/>
              <path d="M51.4908 51.4908C65.7149 37.2668 71.4846 19.9747 64.3778 12.8679C57.2711 5.76119 39.979 11.5309 25.7549 25.755C11.5309 39.979 5.76117 57.2711 12.8679 64.3778C19.9747 71.4846 37.2667 65.7149 51.4908 51.4908Z" stroke="currentColor" strokeWidth="4.8" strokeMiterlimit="10"/>
            </svg>
            <h2 className="text-lg font-semibold font-display">Submit to staticDAM</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center disabled:opacity-50"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" className="text-slate-500" fill="currentColor">
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Error message */}
          {result && !result.success && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
              {result.error || 'Failed to submit image'}
            </div>
          )}

          {/* Site URL */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">
              SITE URL
            </label>
            <input
              type="url"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-neon/50 focus:border-neon disabled:opacity-50"
              placeholder="https://staticdam-yoursite.netlify.app"
            />
          </div>

          {/* Subfolder */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">
              SUBFOLDER <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
            </label>
            <input
              type="text"
              value={subfolder}
              onChange={(e) => setSubfolder(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-neon/50 focus:border-neon disabled:opacity-50"
              placeholder="incoming"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">
              TAGS <span className="font-normal text-slate-400 dark:text-slate-500">(comma separated, optional)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-neon/50 focus:border-neon disabled:opacity-50"
              placeholder="2025, product-shot"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex gap-3 bg-slate-50/50 dark:bg-slate-900/30 md:rounded-b-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !siteUrl.trim()}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                Submitting...
              </>
            ) : (
              'Submit'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StaticDAMModal;

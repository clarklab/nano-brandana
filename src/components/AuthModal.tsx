import { useState, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { trackMagicLinkRequested } from '../lib/auth-tracking';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  error?: string | null;
}

export function AuthModal({ isOpen, onClose, error }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setFormError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      // Track the magic link request BEFORE calling Supabase
      trackMagicLinkRequested(email);

      // Send magic link via Supabase
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (signInError) {
        console.error('[AuthModal] signInWithOtp error:', signInError);
        setFormError(signInError.message || 'Failed to send magic link');
        return;
      }

      // Success - show confirmation
      setIsSuccess(true);
    } catch (err) {
      console.error('[AuthModal] Unexpected error:', err);
      setFormError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Reset state when closing
    setEmail('');
    setIsSuccess(false);
    setFormError(null);
    setIsLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-50 md:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full h-full md:h-auto md:max-w-md md:rounded-2xl shadow-elevated p-6 md:p-8 relative overflow-y-auto animate-slide-up pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" className="text-slate-500" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
          </svg>
        </button>

        {/* Header with logo */}
        <div className="mb-6 pr-8">
          <img src="/peel.svg" alt="Peel" className="size-8 dark:invert mb-3" />
          <h2 className="text-lg font-semibold font-display mb-1">Create Peel account to continue</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Get <span className="font-bold text-amber-600 dark:text-amber-400">25,000 free tokens</span> for image generation
          </p>
        </div>

        {/* Error message from props (e.g., expired link) */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {isSuccess ? (
          // Success state
          <div className="text-center py-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-emerald-600 dark:text-emerald-400">
                <path fillRule="evenodd" d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold font-display mb-2">Check your email!</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              We sent a magic link to <strong>{email}</strong>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Click the link in your email to sign in. The link expires in 1 hour.
            </p>
            <button
              onClick={() => {
                setIsSuccess(false);
                setEmail('');
              }}
              className="mt-4 text-sm text-amber-600 dark:text-amber-400 hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          // Form state
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Form error */}
            {formError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <p className="text-sm text-red-700 dark:text-red-400">{formError}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={isLoading}
                autoComplete="email"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 dark:disabled:bg-amber-800 text-slate-900 font-semibold shadow-sm transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending...
                </>
              ) : (
                'Send magic link'
              )}
            </button>
          </form>
        )}

        {/* Footer */}
        <p className="text-xs text-center mt-6 text-slate-500 dark:text-slate-400">
          No password needed — we'll email you a secure link
        </p>
      </div>
    </div>
  );
}

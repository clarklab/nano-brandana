import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface TokenPackage {
  id: 'starter' | 'pro' | 'power';
  name: string;
  tokens: number;
  price: number;
  description: string;
  popular?: boolean;
}

interface BuyTokensModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PACKAGES: TokenPackage[] = [
  {
    id: 'starter',
    name: 'STARTER',
    tokens: 25000,
    price: 5,
    description: 'Perfect for trying out Peel',
  },
  {
    id: 'pro',
    name: 'PRO',
    tokens: 250000,
    price: 35,
    description: 'Great for regular users',
    popular: true,
  },
  {
    id: 'power',
    name: 'POWER',
    tokens: 1000000,
    price: 90,
    description: 'Maximum value for power users',
  },
];

export function BuyTokensModal({ isOpen, onClose }: BuyTokensModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePurchase = async (packageId: 'starter' | 'pro' | 'power') => {
    setLoading(packageId);
    setError(null);

    try {
      // Get current session from Supabase
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated. Please sign in.');
      }

      const accessToken = session.access_token;

      // Call create-checkout function
      const response = await fetch('/.netlify/functions/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ packageId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Polar checkout
      window.location.href = data.url;
    } catch (err) {
      console.error('Purchase error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
      setLoading(null);
    }
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(0)}K`;
    }
    return tokens.toString();
  };

  const estimateImages = (tokens: number) => {
    // Rough estimate: ~1500 tokens per image
    return Math.floor(tokens / 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-50 md:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full h-full md:h-auto md:max-w-lg md:rounded-2xl shadow-elevated p-6 md:p-8 relative overflow-y-auto animate-slide-up pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
          aria-label="Close"
          disabled={loading !== null}
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" className="text-slate-500" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
          </svg>
        </button>

        {/* Header */}
        <div className="mb-6 pr-8">
          <h2 className="text-lg font-semibold font-display">Buy Tokens</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Purchase tokens to process more images
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Packages */}
        <div className="space-y-4">
          {PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className={`relative rounded-xl border ${
                pkg.popular
                  ? 'border-neon dark:border-neon shadow-glow'
                  : 'border-slate-200 dark:border-slate-700'
              } p-4 transition-all hover:shadow-elevated`}
            >
              {/* Popular badge */}
              {pkg.popular && (
                <div className="absolute -top-2 left-4 bg-neon text-slate-900 text-xs font-bold px-3 py-1 rounded-full shadow-soft">
                  BEST VALUE
                </div>
              )}

              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">{pkg.name}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {pkg.description}
                  </p>

                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-neon-text font-bold">
                        {formatTokens(pkg.tokens)} tokens
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-600 dark:text-slate-400">
                        ~{estimateImages(pkg.tokens)} images
                      </span>
                    </div>
                  </div>
                </div>

                <div className="ml-4 text-right">
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">${pkg.price}</div>
                  <button
                    onClick={() => handlePurchase(pkg.id)}
                    disabled={loading !== null}
                    className={`mt-2 px-4 py-2 font-bold text-sm rounded-lg transition-all ${
                      loading === pkg.id
                        ? 'border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-wait'
                        : pkg.popular
                        ? 'bg-neon text-slate-900 hover:bg-amber-400 shadow-soft'
                        : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {loading === pkg.id ? 'LOADING...' : 'BUY NOW'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
          <p>✓ Secure payment via Polar</p>
          <p className="mt-1">✓ Tokens added instantly after payment</p>
          <p className="mt-1">✓ Tokens never expire</p>
        </div>
      </div>
    </div>
  );
}

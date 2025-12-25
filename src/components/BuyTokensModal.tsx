import { useState } from 'react';

interface TokenPackage {
  id: 'starter' | 'pro';
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
    name: 'STARTER PACK',
    tokens: 100000,
    price: 5,
    description: 'Perfect for trying out Nano Brandana',
  },
  {
    id: 'pro',
    name: 'PRO PACK',
    tokens: 1000000,
    price: 17,
    description: 'Best value for regular users',
    popular: true,
  },
];

export function BuyTokensModal({ isOpen, onClose }: BuyTokensModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePurchase = async (packageId: 'starter' | 'pro') => {
    setLoading(packageId);
    setError(null);

    try {
      // Get auth token from localStorage (set by Supabase)
      const session = JSON.parse(localStorage.getItem('sb-' + import.meta.env.VITE_SUPABASE_URL.split('//')[1].split('.')[0] + '-auth-token') || '{}');
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error('Not authenticated. Please sign in.');
      }

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-600 p-6 max-w-lg w-full relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-2xl leading-none hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
          disabled={loading !== null}
        >
          &times;
        </button>

        {/* Header */}
        <div className="mb-6 pr-8">
          <h2 className="text-lg font-bold">BUY TOKENS</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Purchase tokens to process more images
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Packages */}
        <div className="space-y-4">
          {PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className={`relative border-2 ${
                pkg.popular
                  ? 'border-neon dark:border-neon'
                  : 'border-gray-200 dark:border-gray-600'
              } p-4 transition-all hover:shadow-lg`}
            >
              {/* Popular badge */}
              {pkg.popular && (
                <div className="absolute -top-2 left-4 bg-neon text-black text-xs font-bold px-2 py-0.5">
                  BEST VALUE
                </div>
              )}

              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-bold text-sm">{pkg.name}</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {pkg.description}
                  </p>

                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-neon-text font-bold">
                        {formatTokens(pkg.tokens)} tokens
                      </span>
                      <span className="text-gray-400">•</span>
                      <span className="text-gray-600 dark:text-gray-400">
                        ~{estimateImages(pkg.tokens)} images
                      </span>
                    </div>
                  </div>
                </div>

                <div className="ml-4 text-right">
                  <div className="text-2xl font-bold">${pkg.price}</div>
                  <button
                    onClick={() => handlePurchase(pkg.id)}
                    disabled={loading !== null}
                    className={`mt-2 px-4 py-2 font-bold text-sm border-2 transition-all ${
                      loading === pkg.id
                        ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-wait'
                        : pkg.popular
                        ? 'border-neon bg-neon text-black hover:bg-neon-light'
                        : 'border-black dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
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
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          <p>✓ Secure payment via Polar</p>
          <p className="mt-1">✓ Tokens added instantly after payment</p>
          <p className="mt-1">✓ Tokens never expire</p>
        </div>
      </div>
    </div>
  );
}

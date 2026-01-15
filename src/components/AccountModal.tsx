import { useEffect, useState, useMemo, useCallback } from 'react';
import { Profile, JobLog, DEFAULT_HOURLY_RATE } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { BuyTokensModal } from './BuyTokensModal';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { AuthLogsPage } from './AuthLogsPage';
import { AdminActivityLog } from './AdminActivityLog';

// Admin emails that can access the auth logs
const ADMIN_EMAILS = ['clark@clarklab.net'];

interface BatchGroup {
  batchId: string | null;
  jobs: JobLog[];
  totalImages: number;
  totalReturned: number;
  totalTokens: number;
  hasError: boolean;
  firstDate: string;
}

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  jobLogs: JobLog[];
  email: string;
  onSignOut: () => void;
  onRefreshJobLogs: () => void;
}

export function AccountModal({ isOpen, onClose, profile, jobLogs, email, onSignOut, onRefreshJobLogs }: AccountModalProps) {
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [isBuyTokensOpen, setIsBuyTokensOpen] = useState(false);
  const [isAuthLogsOpen, setIsAuthLogsOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { updateHourlyRate, tokenAnimation, hasOwnApiKey, updateGeminiApiKey } = useAuth();

  // Check if current user is an admin
  const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());

  // Animated token count for the modal
  const animatedTokenCount = useAnimatedNumber(
    tokenAnimation?.to ?? (profile?.tokens_remaining || 0),
    tokenAnimation?.isAnimating ? tokenAnimation.from : undefined,
    { duration: 1500 }
  );

  // Helper to format large numbers with commas
  const formatNumber = useCallback((num: number) => num.toLocaleString(), []);

  // Hourly rate state
  const [hourlyRateInput, setHourlyRateInput] = useState<string>('');
  const [isSavingRate, setIsSavingRate] = useState(false);
  const [rateSaveStatus, setRateSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // API key state
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [apiKeySaveStatus, setApiKeySaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [isApiKeyInfoOpen, setIsApiKeyInfoOpen] = useState(false);

  // Initialize hourly rate input from profile
  useEffect(() => {
    if (profile?.hourly_rate !== undefined) {
      setHourlyRateInput(profile.hourly_rate !== null ? String(profile.hourly_rate) : '');
    }
  }, [profile?.hourly_rate]);

  // Handle hourly rate save
  const handleSaveHourlyRate = async () => {
    const rate = hourlyRateInput.trim() === '' ? null : parseFloat(hourlyRateInput);

    // Validate
    if (rate !== null && (isNaN(rate) || rate < 0 || rate > 10000)) {
      setRateSaveStatus('error');
      setTimeout(() => setRateSaveStatus('idle'), 2000);
      return;
    }

    setIsSavingRate(true);
    const success = await updateHourlyRate(rate);
    setIsSavingRate(false);

    if (success) {
      setRateSaveStatus('saved');
      setTimeout(() => setRateSaveStatus('idle'), 2000);
    } else {
      setRateSaveStatus('error');
      setTimeout(() => setRateSaveStatus('idle'), 2000);
    }
  };

  // Handle API key save
  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;

    // Basic validation - Google API keys typically start with "AIza"
    if (!apiKeyInput.startsWith('AIza') || apiKeyInput.length < 30) {
      setApiKeySaveStatus('error');
      setTimeout(() => setApiKeySaveStatus('idle'), 2000);
      return;
    }

    setIsSavingApiKey(true);
    const success = await updateGeminiApiKey(apiKeyInput.trim());
    setIsSavingApiKey(false);

    if (success) {
      setApiKeySaveStatus('saved');
      setApiKeyInput('');
      setTimeout(() => setApiKeySaveStatus('idle'), 2000);
    } else {
      setApiKeySaveStatus('error');
      setTimeout(() => setApiKeySaveStatus('idle'), 2000);
    }
  };

  // Handle API key removal
  const handleRemoveApiKey = async () => {
    setIsSavingApiKey(true);
    const success = await updateGeminiApiKey(null);
    setIsSavingApiKey(false);

    if (success) {
      setApiKeySaveStatus('saved');
      setTimeout(() => setApiKeySaveStatus('idle'), 2000);
    } else {
      setApiKeySaveStatus('error');
      setTimeout(() => setApiKeySaveStatus('idle'), 2000);
    }
  };

  // Refresh job logs when modal opens
  useEffect(() => {
    if (isOpen) {
      onRefreshJobLogs();
    }
  }, [isOpen, onRefreshJobLogs]);

  // Group jobs by batch_id
  const groupedJobs = useMemo(() => {
    const groups: BatchGroup[] = [];
    const batchMap = new Map<string, JobLog[]>();

    // Group by batch_id
    jobLogs.forEach(job => {
      const key = job.batch_id || job.id; // Use job id as key for non-batch jobs
      if (!batchMap.has(key)) {
        batchMap.set(key, []);
      }
      batchMap.get(key)!.push(job);
    });

    // Convert to BatchGroup array
    batchMap.forEach((jobs) => {
      const totalImages = jobs.reduce((sum, j) => sum + j.images_submitted, 0);
      const totalReturned = jobs.reduce((sum, j) => sum + j.images_returned, 0);
      const totalTokens = jobs.reduce((sum, j) => sum + (j.total_tokens || 0), 0);
      const hasError = jobs.some(j => j.status === 'error');
      const firstDate = jobs[0].created_at;

      groups.push({
        batchId: jobs[0].batch_id,
        jobs,
        totalImages,
        totalReturned,
        totalTokens,
        hasError,
        firstDate,
      });
    });

    return groups;
  }, [jobLogs]);

  const toggleBatch = (batchId: string) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  const handleSignOut = () => {
    onSignOut();
    onClose();
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatJobDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-50 md:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full h-full md:h-auto md:max-h-[calc(100vh-2rem)] md:max-w-md md:rounded-2xl shadow-elevated p-6 relative overflow-y-auto scrollbar-hide animate-slide-up pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" className="text-slate-500" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
          </svg>
        </button>

        {/* Header */}
        <div className="mb-6 pr-8">
          <h2 className="text-lg font-semibold font-display">{email ? 'Account' : 'Settings'}</h2>
        </div>

        {/* Account Details - only shown for logged in users */}
        {email && (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Email</label>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate mt-0.5">{email}</p>
            </div>

            <div className={`rounded-xl p-4 transition-all duration-300 ${
              tokenAnimation?.isAnimating
                ? 'bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 ring-2 ring-emerald-400 dark:ring-emerald-500'
                : 'bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {tokenAnimation?.isAnimating ? 'Tokens Added!' : 'Tokens Remaining'}
                  </label>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <p className={`text-xl font-bold tabular-nums ${
                      tokenAnimation?.isAnimating
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {tokenAnimation?.isAnimating
                        ? formatNumber(animatedTokenCount)
                        : formatNumber(profile?.tokens_remaining || 0)
                      }
                    </p>
                    {tokenAnimation?.isAnimating && (
                      <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold animate-pulse">
                        +{formatNumber(tokenAnimation.to - tokenAnimation.from)}
                      </span>
                    )}
                  </div>
                  {tokenAnimation?.isAnimating && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                      Purchase successful! Your tokens are ready to use.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setIsBuyTokensOpen(true)}
                  className="btn-primary py-2 text-sm"
                >
                  Buy Tokens
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tokens Used</label>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                  {profile?.tokens_used?.toLocaleString() || '0'}
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Last Login</label>
                <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5">
                  {formatDate(profile?.last_login)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Settings */}
        <div className={`${email ? 'mt-6 pt-6 border-t border-slate-100 dark:border-slate-700' : ''}`}>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Settings</label>
          <div className="mt-3">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-500">
                    <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-500">
                    <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.061 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.061 1.06l1.06 1.06Z" />
                  </svg>
                )}
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Dark Mode</span>
              </div>
              <button
                onClick={toggleTheme}
                className={`relative w-11 h-6 rounded-full transition-all duration-200 ${
                  theme === 'dark' ? 'bg-neon shadow-glow' : 'bg-slate-200 dark:bg-slate-600'
                }`}
                aria-label="Toggle dark mode"
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-soft ${
                    theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Admin: Auth Logs Link */}
            {isAdmin && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50 space-y-1">
                <button
                  onClick={() => setIsAuthLogsOpen(true)}
                  className="flex items-center gap-3 w-full py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-500">
                    <path fillRule="evenodd" d="M15.988 3.012A2.25 2.25 0 0 1 18 5.25v6.5A2.25 2.25 0 0 1 15.75 14H13.5V7A2.5 2.5 0 0 0 11 4.5H8.128a2.252 2.252 0 0 1 1.884-1.488A2.25 2.25 0 0 1 12.25 1h1.5a2.25 2.25 0 0 1 2.238 2.012ZM11.5 3.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v.25h-3v-.25Z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M2 7a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7Zm2 3.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Zm0 3.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Auth Logs</span>
                  <span className="ml-auto text-xs text-slate-400">Admin</span>
                </button>
                <button
                  onClick={() => setIsActivityLogOpen(true)}
                  className="flex items-center gap-3 w-full py-2 px-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-500">
                    <path d="M3.5 2.75a.75.75 0 0 0-1.5 0v14.5a.75.75 0 0 0 1.5 0v-4.392l1.657-.348a6.449 6.449 0 0 1 4.271.572 7.948 7.948 0 0 0 5.965.524l2.078-.64A.75.75 0 0 0 18 12.25v-8.5a.75.75 0 0 0-.904-.734l-2.38.501a7.25 7.25 0 0 1-4.186-.363l-.502-.2a8.75 8.75 0 0 0-5.053-.439l-1.475.31V2.75Z" />
                  </svg>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Activity Log</span>
                  <span className="ml-auto text-xs text-amber-500 font-semibold">New</span>
                </button>
              </div>
            )}

            {/* Hourly Rate Setting - only for logged in users */}
            {email && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-500 mt-0.5 flex-shrink-0" style={{ fontSize: '20px' }}>
                    local_atm
                  </span>
                  <div className="flex-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200 block mb-1">
                      Hourly Rate (Estimate)
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                        <input
                          type="number"
                          value={hourlyRateInput}
                          onChange={(e) => setHourlyRateInput(e.target.value)}
                          onBlur={handleSaveHourlyRate}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveHourlyRate()}
                          placeholder={String(DEFAULT_HOURLY_RATE)}
                          min="0"
                          max="10000"
                          step="1"
                          className="w-full pl-7 pr-10 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-neon/50 focus:border-neon"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">/hr</span>
                      </div>
                      {isSavingRate && (
                        <div className="w-4 h-4 border-2 border-neon/30 border-t-neon rounded-full animate-spin" />
                      )}
                      {rateSaveStatus === 'saved' && (
                        <span className="text-emerald-500 text-xs">Saved</span>
                      )}
                      {rateSaveStatus === 'error' && (
                        <span className="text-red-500 text-xs">Error</span>
                      )}
                    </div>
                    <p className="text-2xs text-slate-400 dark:text-slate-500 mt-1.5">
                      Used to calculate the "money saved" metrics, that's all.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Your API Key Setting - only for logged in users */}
            {email && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                <div className="flex items-start gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0">
                    <path fillRule="evenodd" d="M8 7a5 5 0 1 1 3.61 4.804l-1.903 1.903A1 1 0 0 1 9 14H8v1a1 1 0 0 1-1 1H6v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 .293-.707L8.196 8.39A5.002 5.002 0 0 1 8 7Zm5-3a.75.75 0 0 0 0 1.5A1.5 1.5 0 0 1 14.5 7 .75.75 0 0 0 16 7a3 3 0 0 0-3-3Z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        Your API Key
                      </label>
                      <button
                        onClick={() => setIsApiKeyInfoOpen(true)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                        title="Learn more"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    {hasOwnApiKey ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-1.5 text-sm border border-emerald-200 dark:border-emerald-800 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300">
                          Key active
                        </div>
                        <button
                          onClick={handleRemoveApiKey}
                          disabled={isSavingApiKey}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isSavingApiKey ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
                          placeholder="AIza..."
                          className="flex-1 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-neon/50 focus:border-neon"
                        />
                        <button
                          onClick={handleSaveApiKey}
                          disabled={isSavingApiKey || !apiKeyInput.trim()}
                          className="px-3 py-1.5 text-xs font-medium bg-neon text-slate-900 rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSavingApiKey ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                    {apiKeySaveStatus === 'error' && (
                      <p className="text-2xs text-red-500 mt-1">Invalid key format. Keys start with "AIza".</p>
                    )}
                    {apiKeySaveStatus === 'saved' && (
                      <p className="text-2xs text-emerald-500 mt-1">Saved!</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Job History - only shown for logged in users */}
        {email && (
        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Recent Jobs</label>
          {jobLogs.length === 0 ? (
            <p className="text-sm text-slate-400 mt-2">No jobs yet</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm max-h-60 overflow-y-auto scrollbar-hide">
              {groupedJobs.map((group) => {
                const isBatch = group.jobs.length > 1;
                const batchKey = group.batchId || group.jobs[0].id;
                const isExpanded = expandedBatches.has(batchKey);

                return (
                  <div key={batchKey}>
                    {/* Summary row (for batches) or single job row */}
                    <div
                      className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                        group.hasError ? 'bg-red-50 dark:bg-red-900/20' : 'bg-slate-50 dark:bg-slate-700/50'
                      } ${isBatch ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700' : ''}`}
                      onClick={() => isBatch && toggleBatch(batchKey)}
                    >
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 text-xs">
                        {isBatch && (
                          <span className="text-[10px]">{isExpanded ? '▼' : '▶'}</span>
                        )}
                        {formatJobDate(group.firstDate)}
                      </span>
                      <span className="text-slate-700 dark:text-slate-200 font-medium">
                        {group.totalImages} → {group.totalReturned}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 text-xs font-mono">
                        {group.totalTokens.toLocaleString()}
                      </span>
                      <span className="w-5 text-center">
                        {group.hasError ? (
                          <span className="text-red-500">✗</span>
                        ) : (
                          <span className="text-emerald-500">✓</span>
                        )}
                      </span>
                    </div>

                    {/* Expanded children for batches */}
                    {isBatch && isExpanded && (
                      <div className="ml-4 border-l-2 border-slate-200 dark:border-slate-600 pl-3 space-y-1 mt-1">
                        {group.jobs.map((job) => (
                          <div
                            key={job.id}
                            className={`flex items-center justify-between py-1.5 px-2 rounded text-xs ${
                              job.status === 'error' ? 'bg-red-50/50 dark:bg-red-900/10' : 'bg-slate-50/50 dark:bg-slate-800/30'
                            }`}
                          >
                            <span className="text-slate-300 dark:text-slate-600">└</span>
                            <span className="text-slate-600 dark:text-slate-300">
                              {job.images_submitted} → {job.images_returned}
                            </span>
                            <span className="text-slate-400 font-mono">
                              {job.total_tokens?.toLocaleString() || 0}
                            </span>
                            <span className="w-4 text-center">
                              {job.status === 'success' ? (
                                <span className="text-emerald-500">✓</span>
                              ) : (
                                <span className="text-red-400" title={job.error_message || job.error_code || 'Error'}>✗</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* Sign Out Button - only shown for logged in users */}
        {email && (
          <button
            onClick={handleSignOut}
            className="btn-secondary w-full mt-6 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-800"
          >
            Sign Out
          </button>
        )}
      </div>

      {/* Buy Tokens Modal */}
      <BuyTokensModal
        isOpen={isBuyTokensOpen}
        onClose={() => setIsBuyTokensOpen(false)}
      />

      {/* Auth Logs Page (Admin only) */}
      {isAdmin && (
        <AuthLogsPage
          isOpen={isAuthLogsOpen}
          onClose={() => setIsAuthLogsOpen(false)}
        />
      )}

      {/* Admin Activity Log (Admin only) */}
      {isAdmin && (
        <AdminActivityLog
          isOpen={isActivityLogOpen}
          onClose={() => setIsActivityLogOpen(false)}
        />
      )}

      {/* API Key Info Modal */}
      {isApiKeyInfoOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl shadow-elevated p-6 relative animate-slide-up">
            <button
              onClick={() => setIsApiKeyInfoOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" className="text-slate-500" fill="currentColor">
                <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
              </svg>
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-neon/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-600">
                  <path fillRule="evenodd" d="M8 7a5 5 0 1 1 3.61 4.804l-1.903 1.903A1 1 0 0 1 9 14H8v1a1 1 0 0 1-1 1H6v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 .293-.707L8.196 8.39A5.002 5.002 0 0 1 8 7Zm5-3a.75.75 0 0 0 0 1.5A1.5 1.5 0 0 1 14.5 7 .75.75 0 0 0 16 7a3 3 0 0 0-3-3Z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold font-display text-slate-800 dark:text-slate-100">
                Your API Key
              </h3>
            </div>

            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <p>
                Add your own Google Gemini API key for <strong>unlimited generations</strong> without using platform tokens.
              </p>
              <p>
                When your key is active, select <strong>"Your Key"</strong> from the model dropdown to route generations through your own API quota.
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Your key is stored securely and only used server-side. It's never exposed to the browser.
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-2">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-center py-2.5"
              >
                Get a Free API Key
              </a>
              <a
                href="https://peel.diy/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-center py-2.5"
              >
                Read the Docs
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

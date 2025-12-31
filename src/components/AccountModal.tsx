import { useEffect, useState, useMemo } from 'react';
import { Profile, JobLog, DEFAULT_HOURLY_RATE } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { BuyTokensModal } from './BuyTokensModal';

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
  const { theme, toggleTheme } = useTheme();
  const { updateHourlyRate } = useAuth();

  // Hourly rate state
  const [hourlyRateInput, setHourlyRateInput] = useState<string>('');
  const [isSavingRate, setIsSavingRate] = useState(false);
  const [rateSaveStatus, setRateSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

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

            <div className="bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tokens Remaining</label>
                  <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {profile?.tokens_remaining?.toLocaleString() || '0'}
                  </p>
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

            {/* Hourly Rate Setting - only for logged in users */}
            {email && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                <div className="flex items-start gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0">
                    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.732 6.232a2.5 2.5 0 0 1 3.536 0 .75.75 0 1 0 1.06-1.06A4 4 0 0 0 6.5 8v.165c0 .364.034.728.1 1.085h-.35a.75.75 0 0 0 0 1.5h.737a5.25 5.25 0 0 0 .346.975H6.75a.75.75 0 0 0 0 1.5h2.14c.085.049.17.097.256.143a4.001 4.001 0 0 0 4.222-.428.75.75 0 1 0-.888-1.21 2.5 2.5 0 0 1-3.522-.478h1.793a.75.75 0 0 0 0-1.5h-2.35a3.741 3.741 0 0 1-.163-.975h2.763a.75.75 0 0 0 0-1.5h-2.5c0-.101.003-.2.01-.3A2.5 2.5 0 0 1 8.732 6.232Z" clipRule="evenodd" />
                  </svg>
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
                          className="w-full pl-7 pr-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-neon/50 focus:border-neon"
                        />
                      </div>
                      <span className="text-xs text-slate-400">/hr</span>
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
    </div>
  );
}

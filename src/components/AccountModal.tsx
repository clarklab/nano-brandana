import { useEffect, useState, useMemo } from 'react';
import { Profile, JobLog } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-600 p-6 max-w-md w-full relative max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-2xl leading-none hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        {/* Header */}
        <div className="mb-6 pr-8">
          <h2 className="text-lg font-bold">{email ? 'ACCOUNT' : 'SETTINGS'}</h2>
        </div>

        {/* Account Details - only shown for logged in users */}
        {email && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400">EMAIL</label>
              <p className="text-sm font-bold truncate">{email}</p>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400">TOKENS REMAINING</label>
              <div className="flex items-center justify-between mt-1">
                <p className="text-sm font-bold text-neon-text">
                  {profile?.tokens_remaining?.toLocaleString() || '0'}
                </p>
                <button
                  onClick={() => setIsBuyTokensOpen(true)}
                  className="px-3 py-1 text-xs font-bold border-2 border-neon bg-neon text-black hover:bg-neon-light transition-colors"
                >
                  BUY TOKENS
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400">TOKENS USED</label>
              <p className="text-sm font-bold">
                {profile?.tokens_used?.toLocaleString() || '0'}
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400">LAST LOGIN</label>
              <p className="text-sm">
                {formatDate(profile?.last_login)}
              </p>
            </div>
          </div>
        )}

        {/* Settings */}
        <div className={`${email ? 'mt-6 pt-6 border-t border-gray-200 dark:border-gray-700' : ''}`}>
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400">SETTINGS</label>
          <div className="mt-2">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                {theme === 'dark' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.061 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.061 1.06l1.06 1.06Z" />
                  </svg>
                )}
                <span className="text-sm font-bold">DARK MODE</span>
              </div>
              <button
                onClick={toggleTheme}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  theme === 'dark' ? 'bg-neon' : 'bg-gray-300 dark:bg-gray-600'
                }`}
                aria-label="Toggle dark mode"
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${
                    theme === 'dark' ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Job History - only shown for logged in users */}
        {email && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400">RECENT JOBS</label>
          {jobLogs.length === 0 ? (
            <p className="text-sm text-gray-400 mt-2">No jobs yet</p>
          ) : (
            <div className="mt-2 space-y-1 font-mono text-xs">
              {groupedJobs.map((group) => {
                const isBatch = group.jobs.length > 1;
                const batchKey = group.batchId || group.jobs[0].id;
                const isExpanded = expandedBatches.has(batchKey);

                return (
                  <div key={batchKey}>
                    {/* Summary row (for batches) or single job row */}
                    <div
                      className={`flex items-center justify-between py-1 px-2 rounded ${
                        group.hasError ? 'bg-red-50 dark:bg-red-900/30' : 'bg-gray-50 dark:bg-gray-700'
                      } ${isBatch ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600' : ''}`}
                      onClick={() => isBatch && toggleBatch(batchKey)}
                    >
                      <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        {isBatch && (
                          <span className="text-[10px]">{isExpanded ? '▼' : '▶'}</span>
                        )}
                        {formatJobDate(group.firstDate)}
                      </span>
                      <span>
                        {group.totalImages} img{group.totalImages !== 1 ? 's' : ''} → {group.totalReturned}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        {group.totalTokens.toLocaleString()} tok
                      </span>
                      <span className="w-4 text-center">
                        {group.hasError ? (
                          <span className="text-red-500">✗</span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400">✓</span>
                        )}
                      </span>
                    </div>

                    {/* Expanded children for batches */}
                    {isBatch && isExpanded && (
                      <div className="ml-4 border-l-2 border-gray-200 dark:border-gray-600 pl-2 space-y-1 mt-1">
                        {group.jobs.map((job) => (
                          <div
                            key={job.id}
                            className={`flex items-center justify-between py-1 px-2 rounded text-[11px] ${
                              job.status === 'error' ? 'bg-red-50/50 dark:bg-red-900/20' : 'bg-gray-50/50 dark:bg-gray-700/50'
                            }`}
                          >
                            <span className="text-gray-400">└</span>
                            <span>
                              {job.images_submitted} → {job.images_returned}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400">
                              {job.total_tokens?.toLocaleString() || 0}
                            </span>
                            <span className="w-4 text-center">
                              {job.status === 'success' ? (
                                <span className="text-green-500 dark:text-green-400">✓</span>
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
            className="w-full mt-6 py-2 border-2 border-black dark:border-gray-600 font-bold text-sm hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            SIGN OUT
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

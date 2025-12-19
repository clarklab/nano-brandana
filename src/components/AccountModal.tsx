import { useEffect, useState, useMemo } from 'react';
import { Profile, JobLog } from '../lib/supabase';

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
      <div className="bg-white border-2 border-black p-6 max-w-md w-full relative max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-2xl leading-none hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        {/* Header */}
        <div className="mb-6 pr-8">
          <h2 className="text-lg font-bold">ACCOUNT</h2>
        </div>

        {/* Account Details */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500">EMAIL</label>
            <p className="text-sm font-bold truncate">{email}</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500">TOKENS REMAINING</label>
            <p className="text-sm font-bold text-neon-dark">
              {profile?.tokens_remaining?.toLocaleString() || '0'}
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500">TOKENS USED</label>
            <p className="text-sm font-bold">
              {profile?.tokens_used?.toLocaleString() || '0'}
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500">LAST LOGIN</label>
            <p className="text-sm">
              {formatDate(profile?.last_login)}
            </p>
          </div>
        </div>

        {/* Job History */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <label className="text-xs font-bold text-gray-500">RECENT JOBS</label>
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
                        group.hasError ? 'bg-red-50' : 'bg-gray-50'
                      } ${isBatch ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                      onClick={() => isBatch && toggleBatch(batchKey)}
                    >
                      <span className="text-gray-500 flex items-center gap-1">
                        {isBatch && (
                          <span className="text-[10px]">{isExpanded ? '▼' : '▶'}</span>
                        )}
                        {formatJobDate(group.firstDate)}
                      </span>
                      <span>
                        {group.totalImages} img{group.totalImages !== 1 ? 's' : ''} → {group.totalReturned}
                      </span>
                      <span className="text-gray-600">
                        {group.totalTokens.toLocaleString()} tok
                      </span>
                      <span className="w-4 text-center">
                        {group.hasError ? (
                          <span className="text-red-500">✗</span>
                        ) : (
                          <span className="text-green-600">✓</span>
                        )}
                      </span>
                    </div>

                    {/* Expanded children for batches */}
                    {isBatch && isExpanded && (
                      <div className="ml-4 border-l-2 border-gray-200 pl-2 space-y-1 mt-1">
                        {group.jobs.map((job) => (
                          <div
                            key={job.id}
                            className={`flex items-center justify-between py-1 px-2 rounded text-[11px] ${
                              job.status === 'error' ? 'bg-red-50/50' : 'bg-gray-50/50'
                            }`}
                          >
                            <span className="text-gray-400">└</span>
                            <span>
                              {job.images_submitted} → {job.images_returned}
                            </span>
                            <span className="text-gray-500">
                              {job.total_tokens?.toLocaleString() || 0}
                            </span>
                            <span className="w-4 text-center">
                              {job.status === 'success' ? (
                                <span className="text-green-500">✓</span>
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

        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          className="w-full mt-6 py-2 border-2 border-black font-bold text-sm hover:bg-red-100 transition-colors"
        >
          SIGN OUT
        </button>
      </div>
    </div>
  );
}

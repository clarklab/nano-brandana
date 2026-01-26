import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface Activity {
  id: string;
  timestamp: string;
  type: 'auth' | 'job' | 'purchase';
  subtype: string;
  status: string;
  email?: string;
  email_domain?: string;
  user_id?: string;
  session_id?: string;
  batch_id?: string;
  error_code?: string;
  error_message?: string;
  // Job-specific fields
  images_submitted?: number;
  images_returned?: number;
  image_size?: string;
  model?: string;
  total_tokens?: number;
  tokens_charged?: number;
  elapsed_ms?: number;
  // Purchase-specific fields
  amount_usd?: number;
  tokens_purchased?: number;
  provider_transaction_id?: string;
  // Auth-specific fields
  user_agent?: string;
  metadata?: Record<string, unknown>;
}

interface ActivityStats {
  total: number;
  auth: number;
  jobs: number;
  purchases: number;
  success: number;
  error: number;
  warning: number;
  pending: number;
}

interface ActivityFilters {
  timeRange: string;
  activityType: string;
  status: string;
  userEmail: string;
  limit: number;
}

interface AdminActivityLogProps {
  isOpen: boolean;
  onClose: () => void;
}

// Activity type labels and icons
const TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  // Auth events
  magic_link_requested: { label: 'Magic Link', icon: '📧', color: 'text-blue-600' },
  google_sign_in: { label: 'Google Login', icon: '🔐', color: 'text-blue-600' },
  callback_received: { label: 'Callback OK', icon: '🔗', color: 'text-emerald-600' },
  callback_error: { label: 'Callback Error', icon: '❌', color: 'text-red-600' },
  auth_completed: { label: 'Auth Success', icon: '✅', color: 'text-emerald-600' },
  auth_failed: { label: 'Auth Failed', icon: '🚫', color: 'text-red-600' },
  session_timeout: { label: 'Timeout', icon: '⏱️', color: 'text-amber-600' },
  token_refresh_failed: { label: 'Refresh Failed', icon: '🔄', color: 'text-red-600' },
  // Job types
  batch: { label: 'Batch Job', icon: '🖼️', color: 'text-purple-600' },
  singleJob: { label: 'Single Job', icon: '📸', color: 'text-indigo-600' },
  // Purchase types
  polar: { label: 'Polar Payment', icon: '💳', color: 'text-cyan-600' },
  stripe: { label: 'Stripe Payment', icon: '💳', color: 'text-cyan-600' },
};

export function AdminActivityLog({ isOpen, onClose }: AdminActivityLogProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<ActivityStats>({
    total: 0,
    auth: 0,
    jobs: 0,
    purchases: 0,
    success: 0,
    error: 0,
    warning: 0,
    pending: 0,
  });
  const [filters, setFilters] = useState<ActivityFilters>({
    timeRange: '24h',
    activityType: 'all',
    status: 'all',
    userEmail: '',
    limit: 500,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Build query string
      const params = new URLSearchParams({
        timeRange: filters.timeRange,
        activityType: filters.activityType,
        status: filters.status,
        limit: filters.limit.toString(),
      });

      if (filters.userEmail) {
        params.append('userEmail', filters.userEmail);
      }

      // Fetch from Netlify function
      const response = await fetch(`/.netlify/functions/get-admin-activities?${params}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setActivities(data.activities || []);
      setStats(data.stats || {
        total: 0,
        auth: 0,
        jobs: 0,
        purchases: 0,
        success: 0,
        error: 0,
        warning: 0,
        pending: 0,
      });

    } catch (err) {
      console.error('Failed to fetch activities:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch activities');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (isOpen) {
      fetchActivities();
    }
  }, [isOpen, fetchActivities]);

  if (!isOpen) return null;

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  const handleCopyLogs = () => {
    const lines = [
      `# Admin Activity Log - ${filters.timeRange} (${new Date().toISOString()})`,
      '',
      '## Summary',
      `- Total Activities: ${stats.total}`,
      `- Auth Events: ${stats.auth}`,
      `- Jobs: ${stats.jobs}`,
      `- Purchases: ${stats.purchases}`,
      `- Success: ${stats.success}`,
      `- Errors: ${stats.error}`,
      `- Pending: ${stats.pending}`,
      '',
      '## Filters Applied',
      `- Time Range: ${filters.timeRange}`,
      `- Activity Type: ${filters.activityType}`,
      `- Status: ${filters.status}`,
      ...(filters.userEmail ? [`- User Email: ${filters.userEmail}`] : []),
      '',
      '## Recent Activities',
      ...activities.slice(0, 100).map(a => {
        const typeInfo = TYPE_LABELS[a.subtype] || { label: a.subtype };
        return `- [${formatTime(a.timestamp)}] ${typeInfo.label} (${a.type}) - ${a.status}${
          a.email ? ` - ${a.email}` : ''
        }${a.error_message ? ` - ERROR: ${a.error_message}` : ''}`;
      }),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderActivityDetails = (activity: Activity) => {
    switch (activity.type) {
      case 'job':
        return (
          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-mono">{activity.image_size || 'unknown'}</span>
            <span>{activity.images_submitted || 0} → {activity.images_returned || 0} imgs</span>
            {activity.total_tokens && <span>{formatTokens(activity.total_tokens)} tokens</span>}
            {activity.elapsed_ms && <span>{formatDuration(activity.elapsed_ms)}</span>}
            {activity.batch_id && <span className="font-mono text-slate-400">batch: {activity.batch_id.slice(0, 8)}</span>}
          </div>
        );
      case 'purchase':
        return (
          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-emerald-600">${activity.amount_usd?.toFixed(2)}</span>
            <span>{formatTokens(activity.tokens_purchased || 0)} tokens</span>
            {activity.provider_transaction_id && (
              <span className="font-mono text-slate-400">{activity.provider_transaction_id.slice(0, 12)}</span>
            )}
          </div>
        );
      case 'auth':
        return (
          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
            <span>@{activity.email_domain || '?'}</span>
            {activity.session_id && (
              <span className="font-mono text-slate-400">{activity.session_id.slice(0, 8)}</span>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded">Success</span>;
      case 'error':
        return <span className="px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">Error</span>;
      case 'warning':
        return <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">No Images</span>;
      case 'pending':
        return <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">Pending</span>;
      case 'completed':
        return <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded">Completed</span>;
      case 'failed':
        return <span className="px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded">Failed</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">{status}</span>;
    }
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-900 z-[60] overflow-hidden flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold font-display">Activity Log</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchActivities}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>

          <button
            onClick={handleCopyLogs}
            className="px-3 py-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-slate-900 font-medium rounded-lg transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Logs'}
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-800/50">
        <select
          value={filters.timeRange}
          onChange={(e) => setFilters({ ...filters, timeRange: e.target.value })}
          className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
        >
          <option value="1h">Last 1 hour</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>

        <select
          value={filters.activityType}
          onChange={(e) => setFilters({ ...filters, activityType: e.target.value })}
          className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
        >
          <option value="all">All Activities</option>
          <option value="auth">Auth Events</option>
          <option value="jobs">Jobs</option>
          <option value="purchases">Purchases</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
        >
          <option value="all">All Status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="pending">Pending</option>
        </select>

        <input
          type="text"
          value={filters.userEmail}
          onChange={(e) => setFilters({ ...filters, userEmail: e.target.value })}
          placeholder="Filter by email..."
          className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 placeholder-slate-400"
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
            <div className="text-xl font-bold text-slate-900 dark:text-white">{stats.total}</div>
            <div className="text-xs text-slate-500">Total</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.auth}</div>
            <div className="text-xs text-slate-500">Auth</div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{stats.jobs}</div>
            <div className="text-xs text-slate-500">Jobs</div>
          </div>
          <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400">{stats.purchases}</div>
            <div className="text-xs text-slate-500">Purchases</div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.success}</div>
            <div className="text-xs text-slate-500">Success</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-red-600 dark:text-red-400">{stats.error}</div>
            <div className="text-xs text-slate-500">Errors</div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{stats.warning || 0}</div>
            <div className="text-xs text-slate-500">No Images</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</div>
            <div className="text-xs text-slate-500">Pending</div>
          </div>
        </div>

        {/* Activity Timeline */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            Activities ({activities.length})
          </h2>
          <div className="space-y-2">
            {activities.map(activity => {
              const typeInfo = TYPE_LABELS[activity.subtype] || {
                label: activity.subtype,
                icon: '📋',
                color: 'text-slate-600'
              };
              const isError = activity.status === 'error';

              const isWarning = activity.status === 'warning';

              return (
                <div
                  key={activity.id}
                  className={`flex flex-col gap-2 px-4 py-3 rounded-lg border ${
                    isError
                      ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                      : isWarning
                      ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {/* First row: Icon, time, type, email, status */}
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{typeInfo.icon}</span>
                    <span className="text-xs text-slate-400 w-28 flex-shrink-0">{formatTime(activity.timestamp)}</span>
                    <span className={`font-medium text-sm ${typeInfo.color}`}>{typeInfo.label}</span>
                    {activity.email && (
                      <span className="text-xs text-slate-600 dark:text-slate-400">{activity.email}</span>
                    )}
                    <div className="ml-auto">
                      {getStatusBadge(activity.status)}
                    </div>
                  </div>

                  {/* Second row: Activity details */}
                  {renderActivityDetails(activity)}

                  {/* Error/warning message if present */}
                  {(activity.error_code || activity.error_message) && (
                    <div className={`text-xs font-mono ${isWarning ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                      {activity.error_code && <span className="font-bold">{activity.error_code}: </span>}
                      {activity.error_message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {activities.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-500">
            <p>No activities found with the current filters.</p>
            <p className="text-sm mt-2">Try adjusting the time range or filters above.</p>
          </div>
        )}
      </div>
    </div>
  );
}

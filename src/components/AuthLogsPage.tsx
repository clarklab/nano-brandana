import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface AuthEvent {
  id: string;
  created_at: string;
  event_type: string;
  email_hash: string | null;
  email_domain: string | null;
  session_id: string | null;
  user_agent: string | null;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

interface AuthLogsPageProps {
  isOpen: boolean;
  onClose: () => void;
}

// Human-readable event type labels
const EVENT_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  magic_link_requested: { label: 'Link Requested', icon: '📧', color: 'text-blue-600' },
  callback_received: { label: 'Callback OK', icon: '🔗', color: 'text-emerald-600' },
  callback_error: { label: 'Callback Error', icon: '❌', color: 'text-red-600' },
  auth_completed: { label: 'Auth Success', icon: '✅', color: 'text-emerald-600' },
  auth_failed: { label: 'Auth Failed', icon: '🚫', color: 'text-red-600' },
  session_timeout: { label: 'Timeout', icon: '⏱️', color: 'text-amber-600' },
  token_refresh_failed: { label: 'Refresh Failed', icon: '🔄', color: 'text-red-600' },
};

export function AuthLogsPage({ isOpen, onClose }: AuthLogsPageProps) {
  const [events, setEvents] = useState<AuthEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [copied, setCopied] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Calculate time range
      const now = new Date();
      let since: Date;
      switch (timeRange) {
        case '1h':
          since = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      const { data, error: fetchError } = await supabase
        .from('auth_events')
        .select('*')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (fetchError) {
        throw fetchError;
      }

      setEvents(data || []);
    } catch (err) {
      console.error('Failed to fetch auth events:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    if (isOpen) {
      fetchEvents();
    }
  }, [isOpen, fetchEvents]);

  if (!isOpen) return null;

  // Calculate summary stats
  const stats = {
    totalRequests: events.filter(e => e.event_type === 'magic_link_requested').length,
    totalCompleted: events.filter(e => e.event_type === 'auth_completed').length,
    totalErrors: events.filter(e => ['callback_error', 'auth_failed', 'session_timeout'].includes(e.event_type)).length,
    callbackErrors: events.filter(e => e.event_type === 'callback_error').length,
    authFailed: events.filter(e => e.event_type === 'auth_failed').length,
    timeouts: events.filter(e => e.event_type === 'session_timeout').length,
  };

  const successRate = stats.totalRequests > 0
    ? Math.round((stats.totalCompleted / stats.totalRequests) * 100)
    : 0;

  // Group by session to find stuck flows
  const sessionMap = new Map<string, AuthEvent[]>();
  events.forEach(e => {
    if (e.session_id) {
      if (!sessionMap.has(e.session_id)) {
        sessionMap.set(e.session_id, []);
      }
      sessionMap.get(e.session_id)!.push(e);
    }
  });

  // Find incomplete flows (requested but never completed)
  const stuckFlows: { sessionId: string; events: AuthEvent[]; emailDomain: string | null }[] = [];
  sessionMap.forEach((sessionEvents, sessionId) => {
    const hasRequest = sessionEvents.some(e => e.event_type === 'magic_link_requested');
    const hasCompletion = sessionEvents.some(e => e.event_type === 'auth_completed');
    if (hasRequest && !hasCompletion) {
      stuckFlows.push({
        sessionId,
        events: sessionEvents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        emailDomain: sessionEvents[0].email_domain,
      });
    }
  });

  // Error breakdown by type and message
  const errorBreakdown = new Map<string, number>();
  events
    .filter(e => e.error_code || e.error_message)
    .forEach(e => {
      const key = `${e.error_code || 'unknown'}: ${e.error_message || 'No message'}`;
      errorBreakdown.set(key, (errorBreakdown.get(key) || 0) + 1);
    });

  // Format for copy/paste
  const formatLogsForAgent = () => {
    const lines = [
      `# Auth Flow Logs - ${timeRange} (${new Date().toISOString()})`,
      '',
      '## Summary',
      `- Requests: ${stats.totalRequests}`,
      `- Completed: ${stats.totalCompleted} (${successRate}%)`,
      `- Errors: ${stats.totalErrors}`,
      `  - Callback errors: ${stats.callbackErrors}`,
      `  - Auth failed: ${stats.authFailed}`,
      `  - Timeouts: ${stats.timeouts}`,
      '',
      '## Stuck Flows (requested but never completed)',
      ...stuckFlows.slice(0, 20).map(flow => {
        const lastEvent = flow.events[flow.events.length - 1];
        return `- Session ${flow.sessionId.slice(0, 8)}... (${flow.emailDomain || 'unknown domain'}): Last event was "${lastEvent.event_type}" at ${lastEvent.created_at}`;
      }),
      '',
      '## Error Breakdown',
      ...Array.from(errorBreakdown.entries()).map(([key, count]) => `- ${key}: ${count}x`),
      '',
      '## Recent Error Events (last 50)',
      ...events
        .filter(e => ['callback_error', 'auth_failed', 'session_timeout'].includes(e.event_type))
        .slice(0, 50)
        .map(e => JSON.stringify({
          time: e.created_at,
          type: e.event_type,
          session: e.session_id?.slice(0, 8),
          domain: e.email_domain,
          error_code: e.error_code,
          error_message: e.error_message,
          user_agent: e.user_agent?.slice(0, 50),
        })),
    ];
    return lines.join('\n');
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(formatLogsForAgent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          <h1 className="text-lg font-semibold font-display">Auth Flow Logs</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Time range selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
            className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
          >
            <option value="1h">Last 1 hour</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>

          <button
            onClick={fetchEvents}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>

          <button
            onClick={handleCopyLogs}
            className="px-3 py-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-slate-900 font-medium rounded-lg transition-colors"
          >
            {copied ? 'Copied!' : 'Copy for Agent'}
          </button>
        </div>
      </header>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalRequests}</div>
            <div className="text-sm text-slate-500">Link Requests</div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.totalCompleted}</div>
            <div className="text-sm text-slate-500">Completed ({successRate}%)</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.totalErrors}</div>
            <div className="text-sm text-slate-500">Errors</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stuckFlows.length}</div>
            <div className="text-sm text-slate-500">Stuck Flows</div>
          </div>
        </div>

        {/* Stuck Flows Section */}
        {stuckFlows.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Stuck Flows (requested but never completed)
            </h2>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {stuckFlows.slice(0, 20).map(flow => {
                const requestEvent = flow.events.find(e => e.event_type === 'magic_link_requested');
                const lastEvent = flow.events[flow.events.length - 1];
                return (
                  <div
                    key={flow.sessionId}
                    className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-slate-500">{flow.sessionId.slice(0, 12)}...</span>
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        @{flow.emailDomain || 'unknown'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                      <div>Requested: {requestEvent ? formatTime(requestEvent.created_at) : 'N/A'}</div>
                      <div>Last event: <span className="font-medium">{lastEvent.event_type}</span> at {formatTime(lastEvent.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Error Breakdown */}
        {errorBreakdown.size > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Error Breakdown</h2>
            <div className="space-y-2">
              {Array.from(errorBreakdown.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([error, count]) => (
                  <div
                    key={error}
                    className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2"
                  >
                    <span className="text-sm text-red-700 dark:text-red-400 font-mono truncate flex-1 mr-2">
                      {error}
                    </span>
                    <span className="text-sm font-bold text-red-600 dark:text-red-400">{count}x</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Event Timeline */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            All Events ({events.length})
          </h2>
          <div className="space-y-1">
            {events.map(event => {
              const eventInfo = EVENT_LABELS[event.event_type] || { label: event.event_type, icon: '📋', color: 'text-slate-600' };
              const isError = ['callback_error', 'auth_failed', 'session_timeout'].includes(event.event_type);
              return (
                <div
                  key={event.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                    isError ? 'bg-red-50 dark:bg-red-900/10' : 'bg-slate-50 dark:bg-slate-800/50'
                  }`}
                >
                  <span className="text-base">{eventInfo.icon}</span>
                  <span className="text-xs text-slate-400 w-32 flex-shrink-0">{formatTime(event.created_at)}</span>
                  <span className={`font-medium w-28 flex-shrink-0 ${eventInfo.color}`}>{eventInfo.label}</span>
                  <span className="text-xs text-slate-500 w-24 flex-shrink-0">@{event.email_domain || '?'}</span>
                  <span className="text-xs font-mono text-slate-400 truncate flex-1">
                    {event.error_code && <span className="text-red-500">{event.error_code}: </span>}
                    {event.error_message || event.session_id?.slice(0, 12) || ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {events.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-500">
            <p>No auth events found in this time range.</p>
            <p className="text-sm mt-2">Events will appear here after users attempt to log in.</p>
          </div>
        )}
      </div>
    </div>
  );
}

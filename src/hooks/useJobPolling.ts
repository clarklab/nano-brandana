import { useState, useEffect, useCallback, useRef } from 'react';
import { getJobStatus, JobStatusResponse, APIError } from '../lib/api';

interface UseJobPollingOptions {
  /** Polling interval in ms (default: 3000) */
  pollInterval?: number;
  /** Whether to start polling immediately (default: true) */
  enabled?: boolean;
  /** Callback when job completes */
  onComplete?: (result: JobStatusResponse) => void;
  /** Callback when job fails */
  onError?: (error: Error, status?: JobStatusResponse) => void;
}

interface UseJobPollingResult {
  status: JobStatusResponse | null;
  isPolling: boolean;
  error: Error | null;
  startPolling: () => void;
  stopPolling: () => void;
}

/**
 * Hook to poll job status until completion or failure.
 * Automatically stops polling when job reaches terminal state.
 */
export function useJobPolling(
  jobId: string | null,
  options: UseJobPollingOptions = {}
): UseJobPollingResult {
  const {
    pollInterval = 3000,
    enabled = true,
    onComplete,
    onError,
  } = options;

  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const poll = useCallback(async () => {
    if (!jobId || !isMountedRef.current) return;

    try {
      const result = await getJobStatus(jobId);

      if (!isMountedRef.current) return;

      setStatus(result);
      setError(null);

      // Check for terminal states
      if (result.status === 'completed') {
        stopPolling();
        onComplete?.(result);
      } else if (result.status === 'failed' || result.status === 'timeout') {
        stopPolling();
        const err = new Error(result.error || 'Job failed');
        setError(err);
        onError?.(err, result);
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);

      // Don't stop polling on transient errors (network issues, etc.)
      // Only stop on definitive errors (404, 401, etc.)
      if (err instanceof APIError && (err.status === 404 || err.status === 401)) {
        stopPolling();
        onError?.(error);
      }
    }
  }, [jobId, stopPolling, onComplete, onError]);

  const startPolling = useCallback(() => {
    if (!jobId || pollIntervalRef.current) return;

    setIsPolling(true);
    setError(null);

    // Poll immediately
    poll();

    // Then poll at interval
    pollIntervalRef.current = setInterval(poll, pollInterval);
  }, [jobId, poll, pollInterval]);

  // Auto-start polling when jobId changes and enabled
  useEffect(() => {
    if (jobId && enabled) {
      startPolling();
    }

    return () => {
      stopPolling();
    };
  }, [jobId, enabled, startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  return {
    status,
    isPolling,
    error,
    startPolling,
    stopPolling,
  };
}

/**
 * Hook to manage multiple job polls simultaneously.
 * Useful for batch processing where many jobs run in parallel.
 */
export function useMultiJobPolling(
  jobIds: string[],
  options: Omit<UseJobPollingOptions, 'onComplete' | 'onError'> & {
    onJobComplete?: (jobId: string, result: JobStatusResponse) => void;
    onJobError?: (jobId: string, error: Error, status?: JobStatusResponse) => void;
    onAllComplete?: (results: Map<string, JobStatusResponse>) => void;
  } = {}
) {
  const {
    pollInterval = 3000,
    enabled = true,
    onJobComplete,
    onJobError,
    onAllComplete,
  } = options;

  const [statuses, setStatuses] = useState<Map<string, JobStatusResponse>>(new Map());
  const [isPolling, setIsPolling] = useState(false);
  const [errors, setErrors] = useState<Map<string, Error>>(new Map());

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const pendingJobsRef = useRef<Set<string>>(new Set());

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const poll = useCallback(async () => {
    if (!isMountedRef.current || pendingJobsRef.current.size === 0) {
      if (pendingJobsRef.current.size === 0) {
        stopPolling();
        onAllComplete?.(statuses);
      }
      return;
    }

    // Poll all pending jobs in parallel
    const pendingIds = Array.from(pendingJobsRef.current);
    const results = await Promise.allSettled(
      pendingIds.map(jobId => getJobStatus(jobId).then(result => ({ jobId, result })))
    );

    if (!isMountedRef.current) return;

    const newStatuses = new Map(statuses);
    const newErrors = new Map(errors);

    for (const outcome of results) {
      if (outcome.status === 'fulfilled') {
        const { jobId, result } = outcome.value;
        newStatuses.set(jobId, result);

        if (result.status === 'completed') {
          pendingJobsRef.current.delete(jobId);
          onJobComplete?.(jobId, result);
        } else if (result.status === 'failed' || result.status === 'timeout') {
          pendingJobsRef.current.delete(jobId);
          const err = new Error(result.error || 'Job failed');
          newErrors.set(jobId, err);
          onJobError?.(jobId, err, result);
        }
      } else {
        // Handle poll error - don't remove from pending unless definitive error
        const jobId = pendingIds[results.indexOf(outcome)];
        const err = outcome.reason instanceof Error ? outcome.reason : new Error('Unknown error');

        if (outcome.reason instanceof APIError &&
            (outcome.reason.status === 404 || outcome.reason.status === 401)) {
          pendingJobsRef.current.delete(jobId);
          newErrors.set(jobId, err);
          onJobError?.(jobId, err);
        }
      }
    }

    setStatuses(newStatuses);
    setErrors(newErrors);

    // Check if all jobs are done
    if (pendingJobsRef.current.size === 0) {
      stopPolling();
      onAllComplete?.(newStatuses);
    }
  }, [statuses, errors, stopPolling, onJobComplete, onJobError, onAllComplete]);

  const startPolling = useCallback(() => {
    if (jobIds.length === 0 || pollIntervalRef.current) return;

    pendingJobsRef.current = new Set(jobIds);
    setIsPolling(true);
    setErrors(new Map());

    // Poll immediately
    poll();

    // Then poll at interval
    pollIntervalRef.current = setInterval(poll, pollInterval);
  }, [jobIds, poll, pollInterval]);

  // Auto-start polling when jobIds change and enabled
  useEffect(() => {
    if (jobIds.length > 0 && enabled) {
      // Add new job IDs to pending set
      for (const jobId of jobIds) {
        if (!statuses.has(jobId) ||
            (statuses.get(jobId)?.status !== 'completed' &&
             statuses.get(jobId)?.status !== 'failed' &&
             statuses.get(jobId)?.status !== 'timeout')) {
          pendingJobsRef.current.add(jobId);
        }
      }

      if (pendingJobsRef.current.size > 0 && !pollIntervalRef.current) {
        startPolling();
      }
    }
  }, [jobIds, enabled, statuses, startPolling]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  return {
    statuses,
    isPolling,
    errors,
    startPolling,
    stopPolling,
    pendingCount: pendingJobsRef.current.size,
  };
}

import React, { useState, useEffect } from 'react';
import { calculateTokenCost, formatUSD, formatTime as formatTimeSaved } from '../lib/pricing';

interface TimerProps {
  startTime: number | null;
  isRunning: boolean;
  totalElapsed: number;
  totalTokens: number;
  hasCompletedWork?: boolean;
  workItems?: Array<{
    status?: string;
    result?: {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        model?: string;
      };
      images?: string[];
      imageSize?: string;
    };
  }>;
}

export const Timer: React.FC<TimerProps> = ({ 
  startTime, 
  isRunning, 
  totalElapsed,
  totalTokens,
  hasCompletedWork = false,
  workItems = []
}) => {
  console.log('Timer render:', { isRunning, hasCompletedWork, startTime });
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    if (!isRunning || hasCompletedWork) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 100);

    return () => clearInterval(interval);
  }, [isRunning, hasCompletedWork]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const currentElapsed = startTime ? currentTime - startTime : 0;

  // Calculate total cost and time saved from all completed work items
  const successfulItems = workItems.filter(item => item.status === 'completed');
  
  const totalCost = successfulItems.reduce((sum, item) => {
    if (item.result?.usage) {
      const cost = calculateTokenCost(
        item.result.usage.prompt_tokens || 0,
        item.result.usage.completion_tokens || 0,
        item.result.usage.model || 'google/gemini-3-pro-image',
        item.result.images?.length || 1,
        item.result.imageSize
      );
      return sum + cost;
    }
    return sum;
  }, 0);
  
  // Estimate total time saved (10 minutes per successful image)
  const totalTimeSavedMinutes = successfulItems.length * 10;
  
  console.log('Timer metrics - successful items count:', successfulItems.length);
  console.log('Timer metrics - total time saved minutes:', totalTimeSavedMinutes);
  console.log('Timer metrics - formatted time:', formatTimeSaved(totalTimeSavedMinutes));
  console.log('Timer metrics - all statuses:', workItems.map(item => item.status));

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
      <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Metrics</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5">
          <div className="text-2xs text-slate-400 dark:text-slate-500 mb-0.5">Current</div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-mono">
            {formatTime(currentElapsed)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5">
          <div className="text-2xs text-slate-400 dark:text-slate-500 mb-0.5">Total</div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-mono">
            {formatTime(totalElapsed)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5">
          <div className="text-2xs text-slate-400 dark:text-slate-500 mb-0.5">Tokens</div>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 font-mono">
            {totalTokens.toLocaleString()}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg p-2.5">
          <div className="text-2xs text-slate-400 dark:text-slate-500 mb-0.5">Cost</div>
          <div className="text-sm font-semibold text-amber-600 dark:text-amber-400 font-mono">
            {formatUSD(totalCost)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Time saved: <span className="font-medium text-emerald-600 dark:text-emerald-400">{totalTimeSavedMinutes > 0 ? formatTimeSaved(totalTimeSavedMinutes) : '0m'}</span>
        </div>

        {(isRunning || hasCompletedWork) && (
          <div className="flex items-center gap-1.5">
            {isRunning && !hasCompletedWork ? (
              <div className="w-2 h-2 bg-neon rounded-full animate-pulse"></div>
            ) : (
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
            )}
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {isRunning && !hasCompletedWork ? 'Active' : 'Complete'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
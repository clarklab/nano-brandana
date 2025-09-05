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
        item.result.usage.model || 'google/gemini-2.5-flash-image-preview',
        item.result.images?.length || 1
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
    <div className="border-2 border-black p-2">
      <h3 className="text-xs font-bold mb-2">METRICS</h3>
      
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="font-light">CURRENT:</span>
          <span className="font-mono">
            {isRunning && !hasCompletedWork ? formatTime(currentElapsed) : formatTime(currentElapsed)}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="font-light">TOTAL:</span>
          <span className="font-mono">{formatTime(totalElapsed)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="font-light">TOKENS:</span>
          <span className="font-mono">{totalTokens.toLocaleString()}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="font-light">COST:</span>
          <span className="font-mono text-neon-text font-semibold">{formatUSD(totalCost)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="font-light">HUMAN TIME SAVED:</span>
          <span className="font-mono text-gray-400 font-semibold">
            {totalTimeSavedMinutes > 0 ? formatTimeSaved(totalTimeSavedMinutes) : '0m'}
          </span>
        </div>
      </div>

      {(isRunning || hasCompletedWork) && (
        <div className="mt-2 flex items-center gap-1">
          {isRunning && !hasCompletedWork ? (
            <div className="w-1 h-1 bg-neon animate-pulse"></div>
          ) : (
            <div className="w-1 h-1 bg-neon"></div>
          )}
          <span className="text-xs font-light">
            {isRunning && !hasCompletedWork ? 'ACTIVE' : 'JOB COMPLETE'}
          </span>
        </div>
      )}
    </div>
  );
};
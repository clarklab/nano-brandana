import React from 'react';
import { WorkItem } from '../lib/concurrency';

interface ProgressBarProps {
  items: WorkItem[];
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ items }) => {
  const completed = items.filter(item => item.status === 'completed').length;
  const failed = items.filter(item => item.status === 'failed').length;
  const processing = items.filter(item => item.status === 'processing').length;
  const total = items.length;

  if (total === 0) return null;

  const completedPercent = (completed / total) * 100;
  const failedPercent = (failed / total) * 100;
  const processingPercent = (processing / total) * 100;

  return (
    <div className="border-2 border-black dark:border-gray-600 p-2">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xs font-bold">PROGRESS</h3>
        <span className="text-xs font-light">
          {completed + failed} / {total}
        </span>
      </div>

      <div className="relative h-2 bg-white dark:bg-gray-800 border border-black dark:border-gray-600">
        <div
          className="absolute h-full bg-neon transition-all duration-300"
          style={{ width: `${completedPercent}%` }}
        />
        <div
          className="absolute h-full bg-black transition-all duration-300"
          style={{ 
            width: `${failedPercent}%`,
            left: `${completedPercent}%`
          }}
        />
        <div
          className="absolute h-full bg-gray-400 animate-pulse"
          style={{ 
            width: `${processingPercent}%`,
            left: `${completedPercent + failedPercent}%`
          }}
        />
      </div>

      <div className="flex mt-2 text-xs gap-3">
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 bg-neon border border-black dark:border-gray-600"></div>
          {completed} OK
        </span>
        {failed > 0 && (
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-black"></div>
            {failed} FAIL
          </span>
        )}
        {processing > 0 && (
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-gray-400"></div>
            {processing} PROC
          </span>
        )}
      </div>
    </div>
  );
};
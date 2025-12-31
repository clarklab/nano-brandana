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
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">Progress</h3>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {completed + failed} / {total}
        </span>
      </div>

      <div className="relative h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-neon transition-all duration-300 rounded-full"
          style={{ width: `${completedPercent}%` }}
        />
        <div
          className="absolute h-full bg-red-400 transition-all duration-300"
          style={{
            width: `${failedPercent}%`,
            left: `${completedPercent}%`
          }}
        />
        <div
          className="absolute h-full bg-amber-400 animate-pulse-soft"
          style={{
            width: `${processingPercent}%`,
            left: `${completedPercent + failedPercent}%`
          }}
        />
      </div>

      <div className="flex mt-3 text-xs gap-4">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <div className="w-2 h-2 bg-neon rounded-full"></div>
          {completed} done
        </span>
        {failed > 0 && (
          <span className="flex items-center gap-1.5 text-red-500">
            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
            {failed} failed
          </span>
        )}
        {processing > 0 && (
          <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
            {processing} working
          </span>
        )}
      </div>
    </div>
  );
};
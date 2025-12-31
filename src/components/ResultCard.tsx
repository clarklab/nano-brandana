import React, { useState } from 'react';
import { WorkItem, getInputDisplayName } from '../lib/concurrency';
import { base64ToBlob } from '../lib/base64';
import { calculateTokenCost, formatUSD, calculateTimeSaved, formatTime } from '../lib/pricing';

interface ResultCardProps {
  item: WorkItem;
  originalImage: string;
  onOpenLightbox?: (images: string[], index: number, title: string) => void;
  onRetry?: (itemId: string) => void;
}

// Helper to copy image to clipboard
const copyImageToClipboard = async (imageData: string): Promise<boolean> => {
  try {
    const blob = base64ToBlob(imageData);
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob
      })
    ]);
    return true;
  } catch (err) {
    console.error('Failed to copy image:', err);
    return false;
  }
};

export const ResultCard: React.FC<ResultCardProps> = ({ item, originalImage, onOpenLightbox, onRetry }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [timeSaved] = useState(() => calculateTimeSaved()); // Calculate once and persist
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [copiedImage, setCopiedImage] = useState(false);

  // Generate display name and filename based on input type
  const displayName = getInputDisplayName(item.input);

  const fileBaseName = item.input.type === 'image'
    ? item.input.file.name.split('.')[0]
    : item.input.type === 'composite'
    ? 'combined_job'
    : 'text_prompt';

  // Update timer for processing items
  React.useEffect(() => {
    if (item.status === 'processing' && item.startTime) {
      const interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 100);
      return () => clearInterval(interval);
    }
  }, [item.status, item.startTime]);

  const getStatusColor = () => {
    switch (item.status) {
      case 'completed': return 'badge-success';
      case 'failed': return 'badge-error';
      case 'processing': return 'badge-warning';
      default: return 'badge bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
    }
  };

  const getStatusText = () => {
    switch (item.status) {
      case 'completed': return 'Done';
      case 'failed': return 'Failed';
      case 'processing': return 'Working';
      case 'queued': return 'Queued';
    }
  };

  const downloadImage = (imageData: string, index: number) => {
    const blob = base64ToBlob(imageData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBaseName}_edited_${index + 1}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const elapsedTime = item.endTime && item.startTime
    ? ((item.endTime - item.startTime) / 1000).toFixed(1)
    : null;

  const processingTime = item.status === 'processing' && item.startTime
    ? ((currentTime - item.startTime) / 1000).toFixed(1)
    : null;

  // Handle copy image
  const handleCopyImage = async () => {
    if (item.result?.images && item.result.images[selectedImageIndex]) {
      const success = await copyImageToClipboard(item.result.images[selectedImageIndex]);
      if (success) {
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 2000);
      }
    }
  };

  // Handle redo image
  const handleRedo = () => {
    if (onRetry) {
      onRetry(item.id);
    }
  };

  return (
    <div className="card-interactive p-3 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate flex-1 mr-2">{displayName}</h3>
        <div className="flex items-center gap-2">
          <span className={getStatusColor()}>
            {getStatusText()}
          </span>
          {elapsedTime && (
            <span className="text-xs text-slate-400">{elapsedTime}s</span>
          )}
          {processingTime && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{processingTime}s</span>
          )}
        </div>
      </div>

      {item.status === 'processing' && (
        <div className="h-32 rounded-xl flex items-center justify-center bg-slate-50 dark:bg-slate-800/50">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Processing...</div>
          </div>
        </div>
      )}

      {item.status === 'completed' && item.result?.images && item.result.images.length > 0 && (
        <>
          {/* Check if we got fewer duplicates than requested */}
          {(() => {
            const duplicateMatch = item.instruction?.match(/Generate (?:exactly )?(\d+) variations/);
            if (duplicateMatch && item.result?.images) {
              const expectedCount = parseInt(duplicateMatch[1]);
              const actualCount = item.result.images.length;
              if (actualCount < expectedCount) {
                return (
                  <div className="mb-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                    Requested {expectedCount} variations but got {actualCount}
                  </div>
                );
              }
            }
            return null;
          })()}

          <div className="relative h-36 mb-3 group bg-slate-50 dark:bg-slate-800/50 rounded-xl overflow-hidden">
            <img
              src={showOriginal ? originalImage : item.result.images[selectedImageIndex]}
              alt={showOriginal ? 'Original' : 'Edited'}
              className="w-full h-full object-contain cursor-pointer"
              onClick={() => {
                if (onOpenLightbox && item.result?.images && !showOriginal) {
                  onOpenLightbox(item.result.images, selectedImageIndex, displayName);
                }
              }}
              onError={(e) => {
                console.error('Image failed to load:', displayName, selectedImageIndex);
                (e.target as HTMLImageElement).style.backgroundColor = '#fee2e2';
              }}
              onLoad={() => {
                console.log('Image loaded successfully:', displayName, selectedImageIndex);
              }}
            />
            <button
              onClick={() => setShowOriginal(!showOriginal)}
              className="absolute top-2 left-2 px-2 py-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors shadow-soft flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">compare_arrows</span>
              {showOriginal ? 'Original' : 'Compare'}
            </button>
          </div>

          {item.result.images.length > 1 && (
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
              {item.result.images.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImageIndex(index)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-all duration-200 font-medium ${
                    selectedImageIndex === index
                      ? 'bg-neon text-slate-900 shadow-soft'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  V{index + 1}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => downloadImage(item.result!.images[selectedImageIndex], selectedImageIndex)}
              className="btn-primary flex-1 py-2 text-xs"
            >
              Download
            </button>
            <button
              onClick={() => {
                if (onOpenLightbox && item.result?.images) {
                  onOpenLightbox(item.result.images, selectedImageIndex, displayName);
                }
              }}
              className="btn-secondary p-2"
              title="View image"
            >
              <span className="material-symbols-outlined text-[16px]">zoom_in</span>
            </button>
            <button
              onClick={handleCopyImage}
              className="btn-secondary p-2"
              title="Copy image"
            >
              <span className="material-symbols-outlined text-[16px]">
                {copiedImage ? 'check' : 'content_copy'}
              </span>
            </button>
            <button
              onClick={handleRedo}
              className="btn-secondary p-2"
              title="Redo image"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
            </button>
          </div>

          {item.result.usage && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{item.result.usage.total_tokens || 0} tokens</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {formatUSD(calculateTokenCost(
                    item.result.usage.prompt_tokens || 0,
                    item.result.usage.completion_tokens || 0,
                    'google/gemini-3-pro-image',
                    item.result.images?.length || 1,
                    item.result.imageSize
                  ))}
                </span>
                <span className="text-slate-400">
                  {formatTime(timeSaved)} saved
                </span>
                {item.result.imageSize && item.result.imageSize !== '1K' && (
                  <span className="text-purple-500 font-medium">
                    {item.result.imageSize}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {item.status === 'completed' && (!item.result?.images || item.result.images.length === 0) && (
        <div className="h-32 rounded-xl flex items-center justify-center p-3 bg-amber-50 dark:bg-amber-900/20">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-amber-100 dark:bg-amber-800/30 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" className="text-amber-500" fill="currentColor">
                <path d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">No images returned</p>
            <p className="text-xs text-amber-600/70 dark:text-amber-500/70 mt-1">API completed but no images received</p>
          </div>
        </div>
      )}

      {item.status === 'failed' && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 overflow-hidden">
          <div className="h-24 flex items-center justify-center p-3">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-red-100 dark:bg-red-800/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" className="text-red-500" fill="currentColor">
                  <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                {item.error?.includes('Internal Server Error') ? 'Server Error' :
                 item.error?.includes('Rate limit') ? 'Rate Limited' :
                 item.error?.includes('validation failed') ? 'Invalid Result' :
                 item.error || 'Failed'}
              </p>
              {item.retries > 0 && (
                <p className="text-xs text-red-500/70 mt-1">Retried {item.retries}x</p>
              )}
            </div>
          </div>
          {onRetry && (
            <div className="p-3 pt-0">
              <button
                onClick={() => onRetry(item.id)}
                className="btn-secondary w-full text-sm"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {item.status === 'queued' && (
        <div className="h-32 rounded-xl flex items-center justify-center bg-slate-50 dark:bg-slate-800/50">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" className="text-slate-400" fill="currentColor">
                <path d="M320-160h320v-120q0-66-47-113t-113-47q-66 0-113 47t-47 113v120ZM160-80v-80h80v-120q0-61 28.5-114.5T348-480q-51-32-79.5-85.5T240-680v-120h-80v-80h640v80h-80v120q0 61-28.5 114.5T612-480q51 32 79.5 85.5T720-280v120h80v80H160Z"/>
              </svg>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Queued</p>
          </div>
        </div>
      )}
    </div>
  );
};
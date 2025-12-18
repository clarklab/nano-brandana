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

export const ResultCard: React.FC<ResultCardProps> = ({ item, originalImage, onOpenLightbox, onRetry }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [timeSaved] = useState(() => calculateTimeSaved()); // Calculate once and persist
  const [currentTime, setCurrentTime] = useState(Date.now());

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
      case 'completed': return 'bg-neon text-black';
      case 'failed': return 'bg-black text-white';
      case 'processing': return 'bg-gray-400 text-black';
      default: return 'bg-white text-black border border-black';
    }
  };

  const getStatusText = () => {
    switch (item.status) {
      case 'completed': return 'OK';
      case 'failed': return 'FAIL';
      case 'processing': return 'PROC';
      case 'queued': return 'WAIT';
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

  return (
    <div className="border-2 border-black p-2 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold truncate flex-1 mr-2">{displayName}</h3>
        <div className="flex items-center gap-2">
          <span className={`px-1 py-0.5 text-xs font-bold ${getStatusColor()}`}>
            {getStatusText()}
          </span>
          {elapsedTime && (
            <span className="text-xs font-light">{elapsedTime}s</span>
          )}
          {processingTime && (
            <span className="text-xs font-semibold text-neon-text">{processingTime}s</span>
          )}
        </div>
      </div>

      {item.status === 'processing' && (
        <div className="h-32 border border-black flex items-center justify-center bg-gray-100">
          <div className="flex flex-col items-center gap-2">
            <svg width="60" height="60" viewBox="0 0 50 50">
              <path 
                d="M5,25 Q12.5,15 25,25 T45,25" 
                fill="none" 
                stroke="#00FF00" 
                strokeWidth="2" 
                opacity="0.3"
              >
                <animate 
                  attributeName="d" 
                  values="M5,25 Q12.5,15 25,25 T45,25; M5,25 Q12.5,35 25,25 T45,25; M5,25 Q12.5,15 25,25 T45,25" 
                  dur="1.33s" 
                  repeatCount="indefinite"
                />
              </path>
              <path 
                d="M5,25 Q12.5,15 25,25 T45,25" 
                fill="none" 
                stroke="#00FF00" 
                strokeWidth="2" 
                opacity="0.5"
              >
                <animate 
                  attributeName="d" 
                  values="M5,25 Q12.5,15 25,25 T45,25; M5,25 Q12.5,35 25,25 T45,25; M5,25 Q12.5,15 25,25 T45,25" 
                  dur="2s" 
                  repeatCount="indefinite"
                />
              </path>
              <path 
                d="M5,25 Q12.5,15 25,25 T45,25" 
                fill="none" 
                stroke="#00FF00" 
                strokeWidth="2" 
                opacity="0.7"
              >
                <animate 
                  attributeName="d" 
                  values="M5,25 Q12.5,15 25,25 T45,25; M5,25 Q12.5,35 25,25 T45,25; M5,25 Q12.5,15 25,25 T45,25" 
                  dur="2.67s" 
                  repeatCount="indefinite"
                />
              </path>
            </svg>
            <div className="text-xs font-light">PROCESSING...</div>
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
                  <div className="mb-2 p-1 bg-yellow-100 border border-yellow-400 text-xs">
                    ⚠️ Requested {expectedCount} variations but got {actualCount}
                  </div>
                );
              }
            }
            return null;
          })()}
          
          <div className="relative h-32 mb-2 group">
            <img
              src={showOriginal ? originalImage : item.result.images[selectedImageIndex]}
              alt={showOriginal ? 'Original' : 'Edited'}
              className="w-full h-full object-cover border border-black cursor-pointer"
              onClick={() => {
                if (onOpenLightbox && item.result?.images && !showOriginal) {
                  onOpenLightbox(item.result.images, selectedImageIndex, displayName);
                }
              }}
              onError={(e) => {
                console.error('Image failed to load:', displayName, selectedImageIndex);
                // Add a visual indicator for broken images
                (e.target as HTMLImageElement).style.backgroundColor = '#fee2e2';
                (e.target as HTMLImageElement).style.border = '2px solid red';
              }}
              onLoad={() => {
                console.log('Image loaded successfully:', displayName, selectedImageIndex);
              }}
            />
            <button
              onMouseDown={() => setShowOriginal(true)}
              onMouseUp={() => setShowOriginal(false)}
              onMouseLeave={() => setShowOriginal(false)}
              onTouchStart={() => setShowOriginal(true)}
              onTouchEnd={() => setShowOriginal(false)}
              className="absolute top-1 left-1 px-1 py-0.5 bg-white border border-black text-xs font-bold hover:bg-neon transition-colors w-[120px]"
            >
              {showOriginal ? 'ORIG' : 'HOLD TO COMPARE'}
            </button>
          </div>

          {item.result.images.length > 1 && (
            <div className="flex gap-1 mb-2 overflow-x-auto">
              {item.result.images.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImageIndex(index)}
                  className={`px-1 py-0.5 text-xs border transition-colors font-bold ${
                    selectedImageIndex === index
                      ? 'border-black bg-neon text-black'
                      : 'border-black bg-white hover:bg-gray-100'
                  }`}
                >
                  V{index + 1}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-1">
            <button
              onClick={() => downloadImage(item.result!.images[selectedImageIndex], selectedImageIndex)}
              className="flex-1 px-2 py-1 border-2 border-black bg-neon text-black text-xs font-bold hover:bg-white transition-colors"
            >
              DOWNLOAD
            </button>
            <button
              onClick={() => {
                if (onOpenLightbox && item.result?.images) {
                  onOpenLightbox(item.result.images, selectedImageIndex, displayName);
                }
              }}
              className="px-2 py-1 border border-black bg-white text-xs font-bold hover:bg-neon transition-colors"
            >
              VIEW
            </button>
          </div>

          {item.result.usage && (
            <div className="mt-1 text-xs font-light">
              <div className="flex justify-between">
                <span>TOKENS: {item.result.usage.total_tokens || 0}</span>
                <span className="text-neon-text font-semibold">
                  COST: {formatUSD(calculateTokenCost(
                    item.result.usage.prompt_tokens || 0,
                    item.result.usage.completion_tokens || 0,
                    'google/gemini-3-pro-image',
                    item.result.images?.length || 1,
                    item.result.imageSize
                  ))}
                </span>
                <span className="text-gray-400 font-semibold">
                  SAVED: {formatTime(timeSaved)}
                </span>
                {item.result.imageSize && item.result.imageSize !== '1K' && (
                  <span className="text-purple-600 font-bold">
                    {item.result.imageSize}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {item.status === 'completed' && (!item.result?.images || item.result.images.length === 0) && (
        <div className="h-32 border border-black flex items-center justify-center p-2 bg-yellow-100">
          <div className="text-center">
            <div className="text-lg font-bold mb-1">⚠</div>
            <p className="text-xs font-bold">NO IMAGES RETURNED</p>
            <p className="text-xs font-light mt-1">API completed but no images received</p>
          </div>
        </div>
      )}

      {item.status === 'failed' && (
        <div className="border border-black bg-gray-100">
          <div className="h-24 flex items-center justify-center p-2">
            <div className="text-center">
              <div className="text-lg font-bold mb-1">✗</div>
              <p className="text-xs font-bold">
                {item.error?.includes('Internal Server Error') ? 'SERVER_ERROR' : 
                 item.error?.includes('Rate limit') ? 'RATE_LIMITED' :
                 item.error?.includes('validation failed') ? 'INVALID_RESULT' :
                 item.error || 'FAILED'}
              </p>
              {item.retries > 0 && (
                <p className="text-xs font-light mt-1">RETRIED {item.retries}x</p>
              )}
            </div>
          </div>
          {onRetry && (
            <div className="border-t border-black p-2">
              <button
                onClick={() => onRetry(item.id)}
                className="w-full px-2 py-1 border border-black bg-white text-xs font-bold hover:bg-neon transition-colors"
              >
                RETRY_IMAGE
              </button>
            </div>
          )}
        </div>
      )}

      {item.status === 'queued' && (
        <div className="h-32 border border-black flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="text-lg font-light mb-1">⧖</div>
            <p className="text-xs font-light">QUEUED</p>
          </div>
        </div>
      )}
    </div>
  );
};
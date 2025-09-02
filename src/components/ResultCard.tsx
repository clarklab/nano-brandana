import React, { useState } from 'react';
import { WorkItem } from '../lib/concurrency';
import { base64ToBlob } from '../lib/base64';
import { calculateTokenCost, formatUSD, calculateTimeSaved, formatTime } from '../lib/pricing';

interface ResultCardProps {
  item: WorkItem;
  originalImage: string;
  onOpenLightbox?: (images: string[], index: number, title: string) => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ item, originalImage, onOpenLightbox }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [timeSaved] = useState(() => calculateTimeSaved()); // Calculate once and persist

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
    a.download = `${item.file.name.split('.')[0]}_edited_${index + 1}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const elapsedTime = item.endTime && item.startTime
    ? ((item.endTime - item.startTime) / 1000).toFixed(1)
    : null;

  return (
    <div className="border-2 border-black p-2 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold truncate flex-1 mr-2">{item.file.name}</h3>
        <div className="flex items-center gap-2">
          <span className={`px-1 py-0.5 text-xs font-bold ${getStatusColor()}`}>
            {getStatusText()}
          </span>
          {elapsedTime && (
            <span className="text-xs font-light">{elapsedTime}s</span>
          )}
        </div>
      </div>

      {item.status === 'processing' && (
        <div className="h-32 border border-black animate-pulse flex items-center justify-center bg-gray-100">
          <div className="text-xs font-light">PROCESSING...</div>
        </div>
      )}

      {item.status === 'completed' && item.result?.images && item.result.images.length > 0 && (
        <>
          <div className="relative h-32 mb-2 group">
            <img
              src={showOriginal ? originalImage : item.result.images[selectedImageIndex]}
              alt={showOriginal ? 'Original' : 'Edited'}
              className="w-full h-full object-cover border border-black cursor-pointer"
              onClick={() => {
                if (onOpenLightbox && item.result?.images && !showOriginal) {
                  onOpenLightbox(item.result.images, selectedImageIndex, item.file.name);
                }
              }}
            />
            <button
              onMouseDown={() => setShowOriginal(true)}
              onMouseUp={() => setShowOriginal(false)}
              onMouseLeave={() => setShowOriginal(false)}
              onTouchStart={() => setShowOriginal(true)}
              onTouchEnd={() => setShowOriginal(false)}
              className="absolute top-1 left-1 px-1 py-0.5 bg-white border border-black text-xs font-bold hover:bg-neon transition-colors"
            >
              {showOriginal ? 'ORIG' : 'HOLD'}
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
                  onOpenLightbox(item.result.images, selectedImageIndex, item.file.name);
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
                <span className="text-neon font-semibold">
                  COST: {formatUSD(calculateTokenCost(
                    item.result.usage.prompt_tokens || 0,
                    item.result.usage.completion_tokens || 0,
                    'google/gemini-2.5-flash-image-preview'
                  ))}
                </span>
                <span className="text-gray-400 font-semibold">
                  SAVED: {formatTime(timeSaved)}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {item.status === 'failed' && (
        <div className="h-32 border border-black flex items-center justify-center p-2 bg-gray-100">
          <div className="text-center">
            <div className="text-lg font-bold mb-1">✗</div>
            <p className="text-xs font-bold">{item.error || 'FAILED'}</p>
            {item.retries > 0 && (
              <p className="text-xs font-light mt-1">RETRIED {item.retries}x</p>
            )}
          </div>
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
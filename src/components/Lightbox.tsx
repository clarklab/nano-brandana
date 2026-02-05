import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StaticDAMModal } from './StaticDAMModal';

interface LightboxProps {
  images: string[];
  originalImages?: string[]; // Original images for comparison
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  // Action handlers
  onDownload?: (imageData: string, index: number) => void;
  onCopy?: (imageData: string) => Promise<boolean>;
  onRedo?: (itemId: string) => void;
  // Map image index to work item ID for redo
  imageToItemId?: Map<number, string>;
  // Called when user navigates to a different image (for stable tracking)
  onIndexChange?: (newIndex: number) => void;
}

export const Lightbox: React.FC<LightboxProps> = ({
  images,
  originalImages,
  initialIndex,
  isOpen,
  onClose,
  title,
  onDownload,
  onCopy,
  onRedo,
  imageToItemId,
  onIndexChange,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showOriginal, setShowOriginal] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const [lastTouchCenter, setLastTouchCenter] = useState<{ x: number, y: number } | null>(null);
  const [isPinching, setIsPinching] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newImagesCount, setNewImagesCount] = useState(0);
  const [staticDAMModalOpen, setStaticDAMModalOpen] = useState(false);
  const prevImagesLength = useRef(images.length);

  // Handle open/close animations
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // React to new images being added - show notification badge
  useEffect(() => {
    if (images.length > prevImagesLength.current) {
      const addedCount = images.length - prevImagesLength.current;
      setNewImagesCount(addedCount);
      // Auto-clear badge after 5 seconds
      const timer = setTimeout(() => setNewImagesCount(0), 5000);
      prevImagesLength.current = images.length;
      return () => clearTimeout(timer);
    }
    prevImagesLength.current = images.length;
  }, [images.length]);

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    if (onCopy && images[currentIndex]) {
      const success = await onCopy(images[currentIndex]);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }, [onCopy, images, currentIndex]);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    // Reset zoom when changing images
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [initialIndex]);

  // Reset zoom when switching images
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [currentIndex]);

  // Calculate distance between two touch points
  const getTouchDistance = (touches: TouchList | React.TouchList): number => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Calculate center point between two touches
  const getTouchCenter = (touches: TouchList | React.TouchList): { x: number, y: number } => {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      setIsPinching(true);
      const distance = getTouchDistance(e.touches);
      const center = getTouchCenter(e.touches);
      setLastTouchDistance(distance);
      setLastTouchCenter(center);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance && lastTouchCenter && isPinching) {
      e.preventDefault();

      const distance = getTouchDistance(e.touches);
      const center = getTouchCenter(e.touches);

      // Calculate scale change
      const scaleChange = distance / lastTouchDistance;
      const newScale = Math.min(Math.max(scale * scaleChange, 1), 5); // Min 1x, Max 5x

      // Calculate position change
      const dx = center.x - lastTouchCenter.x;
      const dy = center.y - lastTouchCenter.y;

      setScale(newScale);
      setPosition({
        x: position.x + dx,
        y: position.y + dy
      });

      setLastTouchDistance(distance);
      setLastTouchCenter(center);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      setIsPinching(false);
      setLastTouchDistance(null);
      setLastTouchCenter(null);

      // Reset to default zoom if zoomed out
      if (scale < 1.1) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    }
  };

  const handleDoubleClick = () => {
    if (scale > 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(2);
    }
  };

  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => {
      const newIndex = prev > 0 ? prev - 1 : images.length - 1;
      onIndexChange?.(newIndex);
      return newIndex;
    });
  }, [images.length, onIndexChange]);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => {
      const newIndex = prev < images.length - 1 ? prev + 1 : 0;
      onIndexChange?.(newIndex);
      return newIndex;
    });
  }, [images.length, onIndexChange]);

  const handleClose = useCallback(() => {
    setIsAnimating(false);
    setTimeout(() => {
      onClose();
    }, 200);
  }, [onClose]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'Escape':
        handleClose();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        goToPrevious();
        break;
      case 'ArrowRight':
        e.preventDefault();
        goToNext();
        break;
    }
  }, [isOpen, handleClose, goToPrevious, goToNext]);

  useEffect(() => {
    if (isOpen) {
      const keydownHandler = (e: KeyboardEvent) => {
        handleKeyDown(e);
      };
      document.addEventListener('keydown', keydownHandler);
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.removeEventListener('keydown', keydownHandler);
        document.body.style.overflow = 'unset';
      };
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isOpen, handleKeyDown]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col ${
        isAnimating ? 'animate-fade-in' : 'animate-fade-out'
      }`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.95)', backdropFilter: 'blur(8px)' }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between p-4 flex-shrink-0 ${
        isAnimating ? 'animate-slide-up' : ''
      }`}>
        <div className="flex items-center gap-3">
          {title && (
            <span className="text-white/80 text-sm font-medium">{title}</span>
          )}
          <span className="badge bg-white/10 text-white/90">
            {currentIndex + 1} / {images.length}
          </span>
          {/* New images notification badge */}
          {newImagesCount > 0 && (
            <button
              onClick={() => {
                const newIndex = images.length - 1;
                setCurrentIndex(newIndex);
                onIndexChange?.(newIndex);
                setNewImagesCount(0);
              }}
              className="badge bg-neon text-slate-900 font-medium animate-pulse cursor-pointer hover:bg-amber-400 transition-colors"
            >
              {newImagesCount} new →
            </button>
          )}
        </div>
        <button
          onClick={handleClose}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
          </svg>
        </button>
      </div>

      {/* Image Container */}
      <div className="relative flex-1 flex items-center justify-center min-h-0 overflow-hidden px-4">
        <div
          className={`relative touch-none ${isAnimating ? 'animate-scale-in' : ''}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
        >
          <img
            src={showOriginal && originalImages?.[currentIndex] ? originalImages[currentIndex] : images[currentIndex]}
            alt={showOriginal ? `Original ${currentIndex + 1}` : `Image ${currentIndex + 1}`}
            className="max-w-[calc(100vw-4rem)] max-h-[calc(100vh-12rem)] object-contain rounded-lg shadow-elevated select-none"
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              transformOrigin: 'center',
              transition: isPinching ? 'none' : 'transform 0.2s ease-out'
            }}
            draggable={false}
          />

          {/* Compare button - positioned over top-left of image */}
          {originalImages && originalImages[currentIndex] && (
            <button
              onClick={() => setShowOriginal(!showOriginal)}
              className={`absolute top-3 left-3 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 z-10 transition-all ${
                showOriginal
                  ? 'bg-neon text-slate-900'
                  : 'bg-white/90 hover:bg-white text-slate-700'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">compare_arrows</span>
              {showOriginal ? 'Original' : 'Compare'}
            </button>
          )}
        </div>

        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
              aria-label="Previous"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
              aria-label="Next"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Image Navigation Dots */}
      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 p-4">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setCurrentIndex(index);
                onIndexChange?.(index);
              }}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentIndex
                  ? 'bg-neon w-6'
                  : 'bg-white/30 hover:bg-white/50'
              }`}
              aria-label={`Go to image ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-center gap-2 pb-2">
        {onDownload && (
          <button
            onClick={() => onDownload(images[currentIndex], currentIndex)}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all text-sm font-medium"
            title="Download"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Download
          </button>
        )}
        {onCopy && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all text-sm font-medium"
            title="Copy to clipboard"
          >
            <span className="material-symbols-outlined text-[18px]">
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
        {onRedo && imageToItemId?.get(currentIndex) && (
          <button
            onClick={() => onRedo(imageToItemId.get(currentIndex)!)}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all text-sm font-medium"
            title="Redo this image"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Redo
          </button>
        )}
        <button
          onClick={() => setStaticDAMModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all text-sm font-medium"
          title="Save to staticDAM"
        >
          <svg width="18" height="18" viewBox="0 0 78 78" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M64.3778 64.3778C71.4846 57.2711 65.7149 39.979 51.4908 25.755C37.2667 11.5309 19.9747 5.76118 12.8679 12.8679C5.76117 19.9747 11.5309 37.2668 25.7549 51.4908C39.979 65.7149 57.2711 71.4846 64.3778 64.3778Z" stroke="currentColor" strokeWidth="4.8" strokeMiterlimit="10"/>
            <path d="M51.4908 51.4908C65.7149 37.2668 71.4846 19.9747 64.3778 12.8679C57.2711 5.76119 39.979 11.5309 25.7549 25.755C11.5309 39.979 5.76117 57.2711 12.8679 64.3778C19.9747 71.4846 37.2667 65.7149 51.4908 51.4908Z" stroke="currentColor" strokeWidth="4.8" strokeMiterlimit="10"/>
          </svg>
          staticDAM
        </button>
      </div>

      {/* Controls hint */}
      <div className="text-center pb-6 pt-2">
        <span className="text-white/40 text-xs">
          ESC to close • ← → to navigate • Double-click to zoom
        </span>
      </div>

      {/* StaticDAM Modal */}
      <StaticDAMModal
        isOpen={staticDAMModalOpen}
        onClose={() => setStaticDAMModalOpen(false)}
        imageData={images[currentIndex]}
      />
    </div>
  );
};
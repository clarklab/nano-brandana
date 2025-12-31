import React, { useState, useEffect, useCallback, useRef } from 'react';

interface LightboxProps {
  images: string[];
  originalImages?: string[]; // Original images for comparison
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export const Lightbox: React.FC<LightboxProps> = ({
  images,
  originalImages,
  initialIndex,
  isOpen,
  onClose,
  title
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

  // React to new images being added - keep showing new images as they come in
  useEffect(() => {
    if (images.length > prevImagesLength.current) {
      // New images have been added, optionally update to show the new one
      // Keep current index if it's still valid, otherwise stay at latest
    }
    prevImagesLength.current = images.length;
  }, [images.length]);

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
    setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
  }, [images.length]);

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
              onClick={() => setCurrentIndex(index)}
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

      {/* Controls hint */}
      <div className="text-center pb-6 pt-2">
        <span className="text-white/40 text-xs">
          ESC to close • ← → to navigate • Double-click to zoom
        </span>
      </div>
    </div>
  );
};
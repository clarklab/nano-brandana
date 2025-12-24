import React, { useState, useEffect, useCallback } from 'react';

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
  const getTouchDistance = (touches: TouchList): number => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Calculate center point between two touches
  const getTouchCenter = (touches: TouchList): { x: number, y: number } => {
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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    
    switch (e.key) {
      case 'Escape':
        onClose();
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
  }, [isOpen, onClose, goToPrevious, goToNext]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white flex-shrink-0">
        <div className="text-sm font-mono">
          {title && <span className="mr-4">{title}</span>}
          <span>{currentIndex + 1} / {images.length}</span>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:text-neon text-xl font-bold p-1"
        >
          ×
        </button>
      </div>

      {/* Image Container */}
      <div className="relative flex-1 flex items-center justify-center min-h-0 overflow-hidden">
        <div
          className="relative touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
        >
          <img
            src={showOriginal && originalImages?.[currentIndex] ? originalImages[currentIndex] : images[currentIndex]}
            alt={showOriginal ? `Original ${currentIndex + 1}` : `Image ${currentIndex + 1}`}
            className="max-w-[calc(100vw-8rem)] max-h-[calc(100vh-12rem)] object-contain border-2 border-white select-none"
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              transformOrigin: 'center',
              transition: isPinching ? 'none' : 'transform 0.2s ease-out'
            }}
            draggable={false}
          />

          {/* Hold to Compare button - positioned over top-left of image */}
          {originalImages && originalImages[currentIndex] && (
            <button
              onMouseDown={() => setShowOriginal(true)}
              onMouseUp={() => setShowOriginal(false)}
              onMouseLeave={() => setShowOriginal(false)}
              onTouchStart={(e) => {
                if (e.touches.length === 1 && !isPinching) {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowOriginal(true);
                }
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowOriginal(false);
              }}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute top-2 left-2 px-1 py-0.5 bg-white border border-black text-xs font-bold hover:bg-neon transition-colors w-[120px] touch-none z-10"
            >
              {showOriginal ? 'ORIG' : 'HOLD TO COMPARE'}
            </button>
          )}
        </div>

          {/* Navigation Arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={goToPrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-neon text-3xl font-bold p-2 hover:bg-white/10 transition-colors"
              >
                ←
              </button>
              <button
                onClick={goToNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-neon text-3xl font-bold p-2 hover:bg-white/10 transition-colors"
              >
                →
              </button>
            </>
          )}
        </div>

      {/* Image Navigation Dots */}
      {images.length > 1 && (
        <div className="flex justify-center gap-2 p-4">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 transition-colors ${
                index === currentIndex
                  ? 'bg-neon'
                  : 'bg-white/50 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="text-center p-4 text-white text-sm font-mono">
        <span>ESC to close • ← → to navigate</span>
      </div>
    </div>
  );
};
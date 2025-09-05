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

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

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
      <div className="relative flex-1 flex items-center justify-center min-h-0">
        <div className="relative">
          <img
            src={showOriginal && originalImages?.[currentIndex] ? originalImages[currentIndex] : images[currentIndex]}
            alt={showOriginal ? `Original ${currentIndex + 1}` : `Image ${currentIndex + 1}`}
            className="max-w-[calc(100vw-8rem)] max-h-[calc(100vh-12rem)] object-contain border-2 border-white"
          />
          
          {/* Hold to Compare button - positioned over top-left of image */}
          {originalImages && originalImages[currentIndex] && (
            <button
              onMouseDown={() => setShowOriginal(true)}
              onMouseUp={() => setShowOriginal(false)}
              onMouseLeave={() => setShowOriginal(false)}
              onTouchStart={() => setShowOriginal(true)}
              onTouchEnd={() => setShowOriginal(false)}
              className="absolute top-2 left-2 px-1 py-0.5 bg-white border border-black text-xs font-bold hover:bg-neon transition-colors w-[120px]"
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
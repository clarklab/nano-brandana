import { useState, useCallback, useMemo, useEffect } from 'react';
import { compressToTargetSize, CompressProgress } from '../lib/imageCompression';
import { formatFileSize } from '../lib/base64';

export interface OversizedFile {
  file: File;
  id: string;
}

interface FileCompressionState {
  status: 'pending' | 'compressing' | 'complete' | 'failed';
  progress?: CompressProgress;
  compressedFile?: File;
  compressedSize?: number;
  error?: string;
}

interface FileSizeLimitModalProps {
  isOpen: boolean;
  oversizedFiles: OversizedFile[];
  maxSizeBytes: number;
  onClose: () => void;
  onPickAnother: () => void;
  onResizeComplete: (files: File[]) => void;
}

export function FileSizeLimitModal({
  isOpen,
  oversizedFiles,
  maxSizeBytes,
  onClose,
  onPickAnother,
  onResizeComplete,
}: FileSizeLimitModalProps) {
  const [fileStates, setFileStates] = useState<Map<string, FileCompressionState>>(new Map());
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionComplete, setCompressionComplete] = useState(false);

  // Generate thumbnail URLs for each file
  const thumbnailUrls = useMemo(() => {
    const urls = new Map<string, string>();
    for (const { file, id } of oversizedFiles) {
      urls.set(id, URL.createObjectURL(file));
    }
    return urls;
  }, [oversizedFiles]);

  // Clean up object URLs when component unmounts or files change
  useEffect(() => {
    return () => {
      thumbnailUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [thumbnailUrls]);

  const handleResizeAndCompress = useCallback(async () => {
    setIsCompressing(true);
    setCompressionComplete(false);

    const newStates = new Map<string, FileCompressionState>();
    const compressedFiles: File[] = [];

    for (const { file, id } of oversizedFiles) {
      // Initialize state for this file
      newStates.set(id, { status: 'compressing' });
      setFileStates(new Map(newStates));

      try {
        const result = await compressToTargetSize(file, {
          maxSizeBytes,
          onProgress: (progress) => {
            newStates.set(id, { status: 'compressing', progress });
            setFileStates(new Map(newStates));
          },
        });

        if (result.success && result.file) {
          newStates.set(id, {
            status: 'complete',
            compressedFile: result.file,
            compressedSize: result.finalSizeBytes,
          });
          compressedFiles.push(result.file);
        } else {
          newStates.set(id, {
            status: 'failed',
            error: result.error || 'Compression failed',
          });
        }
      } catch (err) {
        newStates.set(id, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Compression failed',
        });
      }

      setFileStates(new Map(newStates));
    }

    setIsCompressing(false);
    setCompressionComplete(true);

    // If any files were successfully compressed, they'll be added when user clicks Done
    if (compressedFiles.length > 0) {
      // Store for later
      setFileStates(new Map(newStates));
    }
  }, [oversizedFiles, maxSizeBytes]);

  const handleDone = useCallback(() => {
    const compressedFiles: File[] = [];
    fileStates.forEach((state) => {
      if (state.status === 'complete' && state.compressedFile) {
        compressedFiles.push(state.compressedFile);
      }
    });

    if (compressedFiles.length > 0) {
      onResizeComplete(compressedFiles);
    } else {
      onClose();
    }

    // Reset state
    setFileStates(new Map());
    setCompressionComplete(false);
  }, [fileStates, onResizeComplete, onClose]);

  const handlePickAnother = useCallback(() => {
    setFileStates(new Map());
    setCompressionComplete(false);
    onPickAnother();
  }, [onPickAnother]);

  // Early return AFTER all hooks are declared (Rules of Hooks)
  if (!isOpen) return null;

  const successCount = Array.from(fileStates.values()).filter(s => s.status === 'complete').length;
  const failedCount = Array.from(fileStates.values()).filter(s => s.status === 'failed').length;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-50 md:p-4 animate-fade-in"
      onClick={!isCompressing ? onClose : undefined}
    >
      <div
        className="bg-white dark:bg-slate-800 w-full h-full md:h-auto md:max-w-md md:rounded-2xl shadow-elevated p-6 md:p-8 relative overflow-y-auto animate-slide-up pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        {!isCompressing && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor" className="text-slate-500">
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
            </svg>
          </button>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pr-10">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor" className="text-amber-600 dark:text-amber-400">
              <path d="m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold font-display">
              {compressionComplete ? 'Compression Complete' : 'Images Too Large'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Maximum size: {formatFileSize(maxSizeBytes)}
            </p>
          </div>
        </div>

        {/* File list */}
        <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
          {oversizedFiles.map(({ file, id }) => {
            const state = fileStates.get(id);
            const thumbnailUrl = thumbnailUrls.get(id);
            return (
              <div
                key={id}
                className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl"
              >
                <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                  {thumbnailUrl && (
                    <img
                      src={thumbnailUrl}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {/* Status overlay */}
                  {state?.status && state.status !== 'pending' && (
                    <div className={`absolute inset-0 flex items-center justify-center ${
                      state.status === 'complete' ? 'bg-emerald-500/80' :
                      state.status === 'failed' ? 'bg-red-500/80' :
                      'bg-black/50'
                    }`}>
                      {state.status === 'complete' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor" className="text-white">
                          <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
                        </svg>
                      ) : state.status === 'failed' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor" className="text-white">
                          <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
                        </svg>
                      ) : (
                        <svg className="animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="20" height="20">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                    {file.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${state?.status === 'complete' ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-red-500 dark:text-red-400 font-medium'}`}>
                      {formatFileSize(file.size)}
                    </span>
                    {state?.status === 'complete' && state.compressedSize && (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" height="12px" viewBox="0 -960 960 960" width="12px" fill="currentColor" className="text-slate-400">
                          <path d="M647-440H160v-80h487L423-744l57-56 320 320-320 320-57-56 224-224Z"/>
                        </svg>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          {formatFileSize(state.compressedSize)}
                        </span>
                      </>
                    )}
                    {state?.status === 'compressing' && state.progress && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        {state.progress.currentDimension && `${state.progress.currentDimension}px`}
                        {state.progress.currentQuality && ` @ ${Math.round(state.progress.currentQuality * 100)}%`}
                      </span>
                    )}
                  </div>
                  {state?.status === 'failed' && state.error && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                      {state.error}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Compression complete summary */}
        {compressionComplete && (successCount > 0 || failedCount > 0) && (
          <div className={`mb-4 p-3 rounded-xl ${failedCount > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'}`}>
            <p className={`text-sm ${failedCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
              {successCount > 0 && failedCount === 0 && (
                <>All {successCount} image{successCount > 1 ? 's' : ''} compressed successfully!</>
              )}
              {successCount > 0 && failedCount > 0 && (
                <>{successCount} image{successCount > 1 ? 's' : ''} compressed, {failedCount} failed.</>
              )}
              {successCount === 0 && failedCount > 0 && (
                <>Could not compress {failedCount} image{failedCount > 1 ? 's' : ''}. Try different images.</>
              )}
            </p>
          </div>
        )}

        {/* Help text (only shown before compression) */}
        {!isCompressing && !compressionComplete && (
          <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-4 mb-6">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Large images can cause upload failures. Peel can resize them automatically, or you can pick smaller images. And don't worry, <span className="font-semibold">we still generate high-res output for Shopify, Instagram, and more.</span>
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {compressionComplete ? (
            <button
              onClick={handleDone}
              className="btn-primary flex-1"
            >
              {successCount > 0 ? `Add ${successCount} Image${successCount > 1 ? 's' : ''}` : 'Close'}
            </button>
          ) : (
            <>
              <button
                onClick={handlePickAnother}
                disabled={isCompressing}
                className="btn-secondary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Pick Different
              </button>
              <button
                onClick={handleResizeAndCompress}
                disabled={isCompressing}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCompressing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="16" height="16">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Compressing...
                  </span>
                ) : (
                  'Resize & Compress'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

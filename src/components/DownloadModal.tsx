import { useState, useCallback, useMemo, useEffect } from 'react';
import JSZip from 'jszip';
import { formatFileSize } from '../lib/base64';
import {
  convertBase64ToFormat,
  estimateConvertedSize,
  FORMAT_SETTINGS,
  FormatKey,
} from '../lib/imageConversion';

export interface DownloadImage {
  id: string;
  base64: string;
  originalFilename: string;
}

interface DownloadModalProps {
  isOpen: boolean;
  images: DownloadImage[];
  onClose: () => void;
}

export function DownloadModal({ isOpen, images, onClose }: DownloadModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<FormatKey>('PNG');
  const [selectedImages, setSelectedImages] = useState<Map<string, boolean>>(new Map());
  const [customFilenames, setCustomFilenames] = useState<Map<string, string>>(new Map());
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);

  // Initialize selection state when images change
  useEffect(() => {
    const newSelection = new Map<string, boolean>();
    images.forEach((img) => newSelection.set(img.id, true));
    setSelectedImages(newSelection);
    // Reset custom filenames when images change
    setCustomFilenames(new Map());
  }, [images]);

  // Generate thumbnail URLs for each image
  const thumbnailUrls = useMemo(() => {
    const urls = new Map<string, string>();
    for (const { base64, id } of images) {
      urls.set(id, base64);
    }
    return urls;
  }, [images]);

  // Calculate estimated sizes for each image
  const estimatedSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const { base64, id } of images) {
      sizes.set(id, estimateConvertedSize(base64, selectedFormat));
    }
    return sizes;
  }, [images, selectedFormat]);

  // Calculate totals
  const selectedCount = useMemo(() => {
    return Array.from(selectedImages.values()).filter(Boolean).length;
  }, [selectedImages]);

  const estimatedTotalSize = useMemo(() => {
    let total = 0;
    images.forEach((img) => {
      if (selectedImages.get(img.id)) {
        total += estimatedSizes.get(img.id) || 0;
      }
    });
    return total;
  }, [images, selectedImages, estimatedSizes]);

  // Toggle image selection
  const toggleSelection = useCallback((id: string) => {
    setSelectedImages((prev) => {
      const newMap = new Map(prev);
      newMap.set(id, !prev.get(id));
      return newMap;
    });
  }, []);

  // Update custom filename
  const updateFilename = useCallback((id: string, filename: string) => {
    setCustomFilenames((prev) => {
      const newMap = new Map(prev);
      newMap.set(id, filename);
      return newMap;
    });
  }, []);

  // Get display filename for an image
  const getFilename = useCallback(
    (image: DownloadImage) => {
      return customFilenames.get(image.id) || image.originalFilename;
    },
    [customFilenames]
  );

  // Handle download
  const handleDownload = useCallback(async () => {
    const selectedList = images.filter((img) => selectedImages.get(img.id));
    if (selectedList.length === 0) return;

    setIsConverting(true);
    setConversionProgress(0);

    try {
      const zip = new JSZip();
      const settings = FORMAT_SETTINGS[selectedFormat];
      const total = selectedList.length;

      for (let i = 0; i < selectedList.length; i++) {
        const image = selectedList[i];
        const filename = getFilename(image);

        // Convert to selected format
        const { blob } = await convertBase64ToFormat(
          image.base64,
          settings.format,
          settings.quality
        );

        // Add to zip with proper extension
        zip.file(`${filename}.${settings.extension}`, blob);

        // Update progress
        setConversionProgress(Math.round(((i + 1) / total) * 100));
      }

      // Generate and download ZIP
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `images_${selectedFormat.toLowerCase()}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      // Close modal after download
      onClose();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsConverting(false);
      setConversionProgress(0);
    }
  }, [images, selectedImages, selectedFormat, getFilename, onClose]);

  // Select/deselect all
  const toggleAll = useCallback(() => {
    const allSelected = selectedCount === images.length;
    const newMap = new Map<string, boolean>();
    images.forEach((img) => newMap.set(img.id, !allSelected));
    setSelectedImages(newMap);
  }, [images, selectedCount]);

  // Early return after all hooks
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-50 md:p-4 animate-fade-in"
      onClick={!isConverting ? onClose : undefined}
    >
      <div
        className="bg-white dark:bg-slate-800 w-full h-full md:h-auto md:max-w-lg md:rounded-2xl shadow-elevated relative overflow-hidden animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-neon/20 flex items-center justify-center flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="20px"
                  viewBox="0 -960 960 960"
                  width="20px"
                  fill="currentColor"
                  className="text-amber-600 dark:text-amber-400"
                >
                  <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold font-display">Download Images</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {images.length} image{images.length !== 1 ? 's' : ''} available
                </p>
              </div>
            </div>

            {/* Close button */}
            {!isConverting && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="20px"
                  viewBox="0 -960 960 960"
                  width="20px"
                  fill="currentColor"
                  className="text-slate-500"
                >
                  <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
                </svg>
              </button>
            )}
          </div>

          {/* Format selector */}
          <div className="flex gap-2">
            {(['WEBP', 'PNG', 'JPG'] as FormatKey[]).map((format) => (
              <button
                key={format}
                onClick={() => setSelectedFormat(format)}
                disabled={isConverting}
                className={`flex-1 py-2 px-3 text-sm font-semibold rounded-lg transition-all ${
                  selectedFormat === format
                    ? 'bg-neon text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                } ${isConverting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {format}
              </button>
            ))}
          </div>
        </div>

        {/* Image list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0 max-h-[50vh] md:max-h-[40vh]">
          {/* Select all row */}
          <button
            onClick={toggleAll}
            disabled={isConverting}
            className="w-full flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                selectedCount === images.length
                  ? 'bg-neon border-neon'
                  : selectedCount > 0
                  ? 'bg-neon/50 border-neon'
                  : 'border-slate-300 dark:border-slate-500'
              }`}
            >
              {selectedCount > 0 && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="14px"
                  viewBox="0 -960 960 960"
                  width="14px"
                  fill="currentColor"
                  className="text-slate-900"
                >
                  <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
                </svg>
              )}
            </div>
            <span>{selectedCount === images.length ? 'Deselect All' : 'Select All'}</span>
          </button>

          {/* Individual images */}
          {images.map((image) => {
            const isSelected = selectedImages.get(image.id) ?? true;
            const thumbnailUrl = thumbnailUrls.get(image.id);
            const estimatedSize = estimatedSizes.get(image.id) || 0;
            const filename = getFilename(image);

            return (
              <div
                key={image.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                  isSelected
                    ? 'bg-slate-50 dark:bg-slate-700/50'
                    : 'bg-slate-50/50 dark:bg-slate-700/25 opacity-60'
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleSelection(image.id)}
                  disabled={isConverting}
                  className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-neon border-neon'
                      : 'border-slate-300 dark:border-slate-500 hover:border-slate-400'
                  } ${isConverting ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {isSelected && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="14px"
                      viewBox="0 -960 960 960"
                      width="14px"
                      fill="currentColor"
                      className="text-slate-900"
                    >
                      <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
                    </svg>
                  )}
                </button>

                {/* Thumbnail */}
                <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-600 flex-shrink-0 overflow-hidden">
                  {thumbnailUrl && (
                    <img
                      src={thumbnailUrl}
                      alt={filename}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                {/* Filename editor */}
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => updateFilename(image.id, e.target.value)}
                  disabled={isConverting}
                  className="flex-1 min-w-0 text-sm bg-transparent border-b border-transparent focus:border-neon outline-none text-slate-700 dark:text-slate-200 disabled:opacity-50"
                  placeholder="Filename"
                />

                {/* Estimated size */}
                <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
                  ~{formatFileSize(estimatedSize)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex-shrink-0 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {/* Summary */}
          <div className="flex items-center justify-between mb-4 text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              {selectedCount} of {images.length} selected
            </span>
            <span className="text-slate-500 dark:text-slate-400 tabular-nums">
              ~{formatFileSize(estimatedTotalSize)}
            </span>
          </div>

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={selectedCount === 0 || isConverting}
            className="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConverting ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Converting... {conversionProgress}%
              </span>
            ) : (
              `Download ${selectedCount > 0 ? selectedCount : ''} ${
                selectedCount === 1 ? 'Image' : 'Images'
              } as ZIP`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

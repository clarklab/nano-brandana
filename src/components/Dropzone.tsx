import React, { useCallback, useState } from 'react';
import { formatFileSize } from '../lib/base64';

interface DropzoneProps {
  onFilesAdded: (files: File[]) => void;
  files: File[];
  onRemoveFile: (index: number) => void;
  onClearAll: () => void;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFilesAdded,
  files,
  onRemoveFile,
  onClearAll,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => file.type.startsWith('image/')
    );
    
    if (droppedFiles.length > 0) {
      onFilesAdded(droppedFiles);
    }
  }, [onFilesAdded]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      onFilesAdded(selectedFiles);
    }
  }, [onFilesAdded]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">INPUT</h2>
        {files.length > 0 && (
          <button
            onClick={onClearAll}
            className="text-sm border border-black px-1 hover:bg-neon hover:border-neon transition-all"
          >
            CLEAR
          </button>
        )}
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          flex-1 border-2 transition-all
          ${isDragging 
            ? 'border-neon bg-neon/10' 
            : 'border-black border-dashed'
          }
        `}
      >
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <div className="text-6xl mb-4 font-light">↓</div>
            <p className="font-bold mb-2">DROP_IMAGES</p>
            <p className="text-sm mb-4">OR</p>
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileInput}
                className="hidden"
              />
              <span className="border-2 border-black px-4 py-2 hover:bg-neon hover:border-neon transition-all font-bold">
                BROWSE
              </span>
            </label>
            <p className="text-xs mt-4 font-light">JPG/PNG/WEBP</p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-2">
            <div className="grid grid-cols-1 gap-2">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="relative group border border-black p-2 hover:bg-neon/10 transition-colors"
                >
                  <div className="flex gap-2">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-16 h-16 object-cover border border-black"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate font-bold">{file.name}</p>
                      <p className="text-xs font-light">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveFile(index)}
                    className="absolute top-1 right-1 w-6 h-6 border border-black bg-white hover:bg-neon transition-all text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <label className="cursor-pointer mt-4 block">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileInput}
                className="hidden"
              />
              <div className="text-center py-2 border-2 border-dashed border-black hover:border-neon hover:bg-neon/10 transition-all">
                <span className="text-sm font-bold">+ ADD_MORE</span>
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
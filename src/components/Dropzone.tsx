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
        <h2 className="text-lg font-bold">INPUT IMAGES</h2>
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
          flex-1 border-2 transition-all rounded-xl min-h-0 overflow-hidden
          ${isDragging 
            ? 'border-neon bg-neon/10' 
            : 'border-black border-dashed opacity-50'
          }
        `}
      >
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <div className="mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="#1f1f1f">
                <path d="M170-228q-38-45-61-99T80-440h82q6 43 22 82.5t42 73.5l-56 56ZM80-520q8-59 30-113t60-99l56 56q-26 34-42 73.5T162-520H80ZM438-82q-59-6-112.5-28.5T226-170l56-58q35 26 74 43t82 23v80ZM284-732l-58-58q47-37 101-59.5T440-878v80q-43 6-82.5 23T284-732ZM518-82v-80q44-6 83.5-22.5T676-228l58 58q-47 38-101.5 60T518-82Zm160-650q-35-26-75-43t-83-23v-80q59 6 113.5 28.5T734-790l-56 58Zm112 504-56-56q26-34 42-73.5t22-82.5h82q-8 59-30 113t-60 99Zm8-292q-6-43-22-82.5T734-676l56-56q38 45 61 99t29 113h-82ZM441-280v-247L337-423l-56-57 200-200 200 200-57 56-103-103v247h-80Z"/>
              </svg>
            </div>
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
              <div className="text-center py-2 border-2 border-dashed border-black opacity-50 hover:border-neon hover:bg-neon/10 hover:opacity-100 transition-all rounded-xl">
                <span className="text-sm font-bold">+ ADD_MORE</span>
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
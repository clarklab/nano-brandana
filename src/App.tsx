import React, { useState, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import { Dropzone } from './components/Dropzone';
import { Chat } from './components/Chat';
import { ResultCard } from './components/ResultCard';
import { ProgressBar } from './components/ProgressBar';
import { Timer } from './components/Timer';
import { Lightbox } from './components/Lightbox';
import { IntroModal } from './components/IntroModal';
import { WorkItem, createBatchProcessor } from './lib/concurrency';
import { fileToBase64, resizeImage, base64ToBlob } from './lib/base64';
import { processImage, retryWithBackoff, validateImageData } from './lib/api';

const MAX_IMAGE_DIMENSION = 2048;
const BASE_CONCURRENCY = 3;

// Dynamic concurrency based on batch size to reduce server load
const getConcurrencyLimit = (batchSize: number) => {
  if (batchSize >= 10) return 1; // Large batches: sequential processing
  if (batchSize >= 5) return 2;  // Medium batches: low concurrency
  return BASE_CONCURRENCY;       // Small batches: normal concurrency
};

const getStaggerDelay = (batchSize: number) => {
  if (batchSize >= 10) return 2000; // 2 second delays for large batches
  if (batchSize >= 5) return 1000;  // 1 second delays for medium batches
  return 500;                       // 500ms delays for small batches
};

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [displayInstructions, setDisplayInstructions] = useState<string[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentModel, setCurrentModel] = useState('google/gemini-3-pro-image');
  const [batchStartTime, setBatchStartTime] = useState<number | null>(null);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [fileToBase64Map, setFileToBase64Map] = useState<Map<File, string>>(new Map());
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxOriginalImages, setLightboxOriginalImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxTitle, setLightboxTitle] = useState('');
  const [introModalOpen, setIntroModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'tasks' | 'results'>('input');

  // Check if intro has been seen before
  useEffect(() => {
    const hasSeenIntro = localStorage.getItem('nano-brandana-intro-seen');
    if (!hasSeenIntro) {
      setIntroModalOpen(true);
    }
  }, []);

  // Create batch processor with dynamic settings
  const batchProcessor = React.useMemo(() => {
    const concurrency = getConcurrencyLimit(files.length);
    const staggerDelay = getStaggerDelay(files.length);
    
    console.log('Creating batch processor:', { 
      fileCount: files.length, 
      concurrency, 
      staggerDelay 
    });

    return createBatchProcessor(async (item: WorkItem) => {
      try {
        // Get or create base64 for file
        let base64 = fileToBase64Map.get(item.file);
        if (!base64) {
          base64 = await fileToBase64(item.file);
          
          // Check if resizing is needed
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = base64!;
          });
          
          if (img.width > MAX_IMAGE_DIMENSION || img.height > MAX_IMAGE_DIMENSION) {
            base64 = await resizeImage(item.file, MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION);
          }
          
          setFileToBase64Map(prev => new Map(prev).set(item.file, base64!));
        }

        console.log('Starting API call for:', item.file.name, 'with imageSize:', item.imageSize);
        const result = await retryWithBackoff(
          () => processImage({
            image: base64!,
            instruction: item.instruction,
            model: currentModel,
            imageSize: item.imageSize || '1K',
          }),
          3, // maxRetries
          1000, // initialDelay
          (result) => {
            // Validator function - check if result has valid images
            if (!result.images || result.images.length === 0) {
              console.error('No images in result for:', item.file.name);
              return false;
            }

            const invalidImages = result.images.filter(img => !validateImageData(img));
            if (invalidImages.length > 0) {
              console.error('Invalid images detected for:', item.file.name, invalidImages.length, 'out of', result.images.length);
              return false;
            }

            // Check if we got the expected number of duplicates
            const duplicateMatch = item.instruction.match(/Generate (\d+) variations/);
            if (duplicateMatch) {
              const expectedCount = parseInt(duplicateMatch[1]);
              if (result.images.length < expectedCount) {
                console.warn(`Expected ${expectedCount} variations but got ${result.images.length} for:`, item.file.name);
                // Allow partial results but log the discrepancy
                // We don't fail validation to avoid endless retries
              }
            }

            console.log('Image validation passed for:', item.file.name, result.images.length, 'valid images');
            return true;
          }
        );
        console.log('API call completed for:', item.file.name, result);

        item.status = 'completed';
        item.result = result;
        item.endTime = Date.now();

        console.log('Completing item:', { fileName: item.file.name, status: item.status });

        // Update totals - safely handle potentially undefined usage
        try {
          if (result.usage?.total_tokens) {
            setTotalTokens(prev => prev + (result.usage?.total_tokens || 0));
          }
        } catch (e) {
          // Ignore token counting errors
        }

        return item;
      } catch (error) {
        item.status = 'failed';
        item.error = error instanceof Error ? error.message : 'Unknown error';
        item.endTime = Date.now();
        item.retries = (item.retries || 0) + 1;
        return item;
      }
    }, concurrency, staggerDelay);
  }, [currentModel, fileToBase64Map, files.length]);

  const handleRetryItem = useCallback((itemId: string) => {
    console.log('Retrying item:', itemId);
    batchProcessor.retryItem(itemId);
  }, [batchProcessor]);

  // Subscribe to updates
  useEffect(() => {
    const unsubscribe = batchProcessor.onUpdate(setWorkItems);
    return unsubscribe;
  }, [batchProcessor]);

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearAll = useCallback(() => {
    setFiles([]);
    setFileToBase64Map(new Map());
  }, []);

  const handleSendInstruction = useCallback((inst: string, displayText?: string) => {
    setInstructions(prev => [...prev, inst]);
    setDisplayInstructions(prev => [...prev, displayText || inst]);
  }, []);

  const handleClearInstructions = useCallback(() => {
    setInstructions([]);
    setDisplayInstructions([]);
  }, []);

  const handleRunBatch = useCallback((imageSize: '1K' | '2K' | '4K' = '1K') => {
    if (files.length === 0 || instructions.length === 0) return;

    // Combine all instructions into one
    const combinedInstruction = instructions.join('. ');

    // Create work items
    const newItems = files.map(file => ({
      file,
      instruction: combinedInstruction,
      imageSize,
    }));

    batchProcessor.addItems(newItems);
    batchProcessor.start();
    setIsProcessing(true);
    setBatchStartTime(Date.now());
  }, [files, instructions, batchProcessor]);

  // Check if processing is complete
  useEffect(() => {
    const statusSummary = workItems.map(item => ({ name: item.file.name, status: item.status }));
    console.log('Processing check:', {
      isProcessing,
      workItemsLength: workItems.length,
      workItemStatuses: statusSummary
    });
    console.log('Individual statuses:', statusSummary);

    if (!isProcessing) return;

    const allDone = workItems.every(
      item => item.status === 'completed' || item.status === 'failed'
    );

    console.log('All done check:', {
      allDone,
      workItemsLength: workItems.length,
      shouldComplete: allDone && workItems.length > 0,
      detailedStatuses: workItems.map(item => ({ 
        name: item.file.name, 
        status: item.status,
        hasResult: !!item.result,
        hasImages: !!item.result?.images?.length
      }))
    });

    if (allDone && workItems.length > 0) {
      console.log('Setting isProcessing to false - job complete!');
      
      // Final validation check - ensure all completed items have valid images
      const completedItems = workItems.filter(item => item.status === 'completed');
      const validCompletedItems = completedItems.filter(item => 
        item.result?.images && item.result.images.length > 0 && 
        item.result.images.every(img => validateImageData(img))
      );
      
      console.log('Batch completion summary:', {
        totalItems: workItems.length,
        completedItems: completedItems.length,
        validCompletedItems: validCompletedItems.length,
        failedItems: workItems.filter(item => item.status === 'failed').length
      });
      
      if (completedItems.length !== validCompletedItems.length) {
        console.warn('Some completed items have invalid images:', 
          completedItems.length - validCompletedItems.length, 'items affected');
      }
      
      setIsProcessing(false);
      if (batchStartTime) {
        setTotalElapsed(prev => prev + (Date.now() - batchStartTime));
      }
      setBatchStartTime(null);
    }
  }, [workItems, isProcessing, batchStartTime]);

  const handleDownloadAll = async () => {
    const zip = new JSZip();
    const completedItems = workItems.filter(item => item.status === 'completed' && item.result?.images);

    completedItems.forEach((item, itemIndex) => {
      item.result!.images.forEach((image, imageIndex) => {
        const blob = base64ToBlob(image);
        const filename = `${item.file.name.split('.')[0]}_edited_${itemIndex + 1}_v${imageIndex + 1}.png`;
        zip.file(filename, blob);
      });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edited_images.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasResults = workItems.some(item => item.status === 'completed');

  const handleOpenLightbox = useCallback((_images: string[], _index: number, title: string) => {
    // Collect ALL images from ALL completed work items
    const allImages: string[] = [];
    const allOriginalImages: string[] = [];
    let clickedImageGlobalIndex = 0;
    let foundClickedImage = false;
    
    workItems.forEach((item) => {
      if (item.status === 'completed' && item.result?.images) {
        const originalImage = fileToBase64Map.get(item.file);
        item.result.images.forEach((image) => {
          if (item.file.name === title && !foundClickedImage) {
            clickedImageGlobalIndex = allImages.length;
            foundClickedImage = true;
          }
          allImages.push(image);
          allOriginalImages.push(originalImage || '');
        });
      }
    });
    
    setLightboxImages(allImages);
    setLightboxOriginalImages(allOriginalImages);
    setLightboxIndex(clickedImageGlobalIndex);
    setLightboxTitle(`All Results (${allImages.length} images)`);
    setLightboxOpen(true);
  }, [workItems, fileToBase64Map]);

  const handleCloseLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-white text-black font-mono">
      {/* Header */}
      <header className="border-b-2 border-black p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/brandana.webp" alt="Brandana" className="size-8 md:size-12" />
            <div>
              <h1 className="text-base md:text-xl font-bold">NANO-BRANDANA</h1>
              <p className="text-xs md:text-sm">BATCH IMAGE EDITOR AGENT FOR BRANDS</p>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-1 md:gap-2">
            <label className="text-sm">MODEL:</label>
            <select
              value={currentModel}
              onChange={(e) => setCurrentModel(e.target.value)}
              className="bg-white border border-black px-2 py-1 pr-6 text-xs md:text-sm focus:outline-none focus:border-neon appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOCIgaGVpZ2h0PSI1IiB2aWV3Qm94PSIwIDAgOCA1IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xIDFMNCA0TDcgMSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+')] bg-no-repeat bg-[position:calc(100%-8px)_center] bg-[length:8px_5px]"
            >
              <option value="google/gemini-3-pro-image">
                NANO-BANANA-PRO
              </option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="h-[calc(100vh-170px)] md:h-[calc(100vh-80px)] grid grid-cols-1 md:grid-cols-3">
        {/* Left: Input Panel */}
        <div className={`border-r-0 md:border-r border-black p-4 flex flex-col overflow-hidden ${activeTab === 'input' ? 'block' : 'hidden'} md:block`}>
          <Dropzone
            onFilesAdded={handleFilesAdded}
            files={files}
            onRemoveFile={handleRemoveFile}
            onClearAll={handleClearAll}
          />
        </div>

        {/* Middle: Tasks/Progress */}
        <div className={`border-r-0 md:border-r border-black p-4 flex flex-col overflow-hidden ${activeTab === 'tasks' ? 'block' : 'hidden'} md:block`}>
          {isProcessing || workItems.length > 0 ? (
            // Show progress/stats during and after processing
            <>
              <h2 className="text-lg font-bold mb-4">PROGRESS</h2>
              <div className="space-y-4 flex-1">
                <ProgressBar items={workItems} />
                <Timer
                  startTime={batchStartTime}
                  isRunning={isProcessing}
                  totalElapsed={totalElapsed}
                  totalTokens={totalTokens}
                  hasCompletedWork={(() => {
                    const hasWork = workItems.some(item => item.status === 'completed' || item.status === 'failed');
                    console.log('hasCompletedWork calculation:', {
                      hasWork,
                      workItemsCount: workItems.length,
                      statuses: workItems.map(item => ({ name: item.file.name, status: item.status }))
                    });
                    return hasWork;
                  })()}
                  workItems={workItems}
                />
                
                {displayInstructions.length > 0 && (
                  <div className="border-2 border-black p-2">
                    <div className="text-xs font-bold mb-2">COMPLETED TASKS:</div>
                    <div className="text-xs font-light space-y-1">
                      {displayInstructions.map((instruction, index) => (
                        <div key={index}>- {instruction}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-center">
                  <div className="text-xs font-light mb-2">
                    {workItems.filter(i => i.status === 'completed').length} / {workItems.length} COMPLETED
                  </div>
                  <div className="text-xs font-light">
                    {workItems.filter(i => i.status === 'processing').length} PROCESSING
                  </div>
                  <p className="text-xs font-light mt-2 italic">
                    Brandana says "Have a nice day!"
                  </p>
                </div>
              </div>
              
              {!isProcessing && (
                <div className="border-t border-black pt-4 mt-4 flex-shrink-0">
                  <button
                    onClick={() => {
                      setWorkItems([]);
                      setDisplayInstructions([]);
                      setInstructions([]);
                    }}
                    className="w-full py-2 border border-black font-bold text-sm hover:bg-neon transition-all"
                  >
                    NEW_BATCH
                  </button>
                </div>
              )}
            </>
          ) : (
            // Show chat/tasks interface when not processing
            <>
              <Chat
                onSendInstruction={handleSendInstruction}
                isProcessing={isProcessing}
                currentModel={currentModel}
                onModelChange={setCurrentModel}
                onRunBatch={handleRunBatch}
                canRunBatch={files.length > 0 && instructions.length > 0 && !isProcessing}
                instructions={displayInstructions}
                onClearInstructions={handleClearInstructions}
                files={files}
              />
            </>
          )}
        </div>

        {/* Right: Results */}
        <div className={`p-4 flex flex-col overflow-hidden ${activeTab === 'results' ? 'block' : 'hidden'} md:block`}>
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h2 className="text-lg font-bold">RESULTS</h2>
            {hasResults && (
              <button
                onClick={handleDownloadAll}
                className="text-sm border border-black px-2 py-1 hover:bg-neon hover:border-neon transition-colors"
              >
                DOWNLOAD_ALL
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto h-full">
            {workItems.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-4xl mb-4">[ ]</div>
                  <p className="text-sm">AWAITING_RESULTS</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pb-24">
                {workItems.map((item) => (
                  <ResultCard
                    key={item.id}
                    item={item}
                    originalImage={fileToBase64Map.get(item.file) || ''}
                    onOpenLightbox={handleOpenLightbox}
                    onRetry={handleRetryItem}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-black">
        <div className="grid grid-cols-3">
          <button
            onClick={() => setActiveTab('input')}
            className={`p-3 text-xs font-bold border-r border-black flex flex-col items-center gap-1 ${
              activeTab === 'input' ? 'bg-neon' : 'hover:bg-neon/20'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#1f1f1f">
              <path d="M440-440v-80h80v80h-80Zm-80 80v-80h80v80h-80Zm160 0v-80h80v80h-80Zm80-80v-80h80v80h-80Zm-320 0v-80h80v80h-80Zm-80 320q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm80-80h80v-80h-80v80Zm160 0h80v-80h-80v80Zm320 0v-80 80Zm-560-80h80v-80h80v80h80v-80h80v80h80v-80h80v80h80v-80h-80v-80h80v-320H200v320h80v80h-80v80Zm0 80v-560 560Zm560-240v80-80ZM600-280v80h80v-80h-80Z"/>
            </svg>
            IMAGES
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`p-3 text-xs font-bold border-r border-black flex flex-col items-center gap-1 ${
              activeTab === 'tasks' ? 'bg-neon' : 'hover:bg-neon/20'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#1f1f1f">
              <path d="M620-163 450-333l56-56 114 114 226-226 56 56-282 282Zm220-397h-80v-200h-80v120H280v-120h-80v560h240v80H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h167q11-35 43-57.5t70-22.5q40 0 71.5 22.5T594-840h166q33 0 56.5 23.5T840-760v200ZM480-760q17 0 28.5-11.5T520-800q0-17-11.5-28.5T480-840q-17 0-28.5 11.5T440-800q0 17 11.5 28.5T480-760Z"/>
            </svg>
            TASKS
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`p-3 text-xs font-bold flex flex-col items-center gap-1 ${
              activeTab === 'results' ? 'bg-neon' : 'hover:bg-neon/20'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#1f1f1f">
              <path d="m720-80 120-120-28-28-72 72v-164h-40v164l-72-72-28 28L720-80ZM480-800 243-663l237 137 237-137-237-137ZM120-321v-318q0-22 10.5-40t29.5-29l280-161q10-5 19.5-8t20.5-3q11 0 21 3t19 8l280 161q19 11 29.5 29t10.5 40v159h-80v-116L479-434 200-596v274l240 139v92L160-252q-19-11-29.5-29T120-321ZM720 0q-83 0-141.5-58.5T520-200q0-83 58.5-141.5T720-400q83 0 141.5 58.5T920-200q0 83-58.5 141.5T720 0ZM480-491Z"/>
            </svg>
            RESULTS
          </button>
        </div>
      </nav>
      
      <Lightbox
        images={lightboxImages}
        originalImages={lightboxOriginalImages}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={handleCloseLightbox}
        title={lightboxTitle}
      />
      
      <IntroModal
        isOpen={introModalOpen}
        onClose={() => setIntroModalOpen(false)}
      />
    </div>
  );
}

export default App;
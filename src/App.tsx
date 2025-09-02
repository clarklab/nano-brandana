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
import { processImage, retryWithBackoff } from './lib/api';

const MAX_IMAGE_DIMENSION = 2048;
const CONCURRENCY_LIMIT = 3;

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [displayInstructions, setDisplayInstructions] = useState<string[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentModel, setCurrentModel] = useState('google/gemini-2.5-flash-image-preview');
  const [batchStartTime, setBatchStartTime] = useState<number | null>(null);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [fileToBase64Map, setFileToBase64Map] = useState<Map<File, string>>(new Map());
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxTitle, setLightboxTitle] = useState('');
  const [introModalOpen, setIntroModalOpen] = useState(false);

  // Check if intro has been seen before
  useEffect(() => {
    const hasSeenIntro = localStorage.getItem('nano-brandana-intro-seen');
    if (!hasSeenIntro) {
      setIntroModalOpen(true);
    }
  }, []);

  // Create batch processor
  const batchProcessor = React.useMemo(() => {
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

        console.log('Starting API call for:', item.file.name);
        const result = await retryWithBackoff(() => 
          processImage({
            image: base64!,
            instruction: item.instruction,
            model: currentModel,
          })
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
    }, CONCURRENCY_LIMIT);
  }, [currentModel, fileToBase64Map]);

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

  const handleRunBatch = useCallback(() => {
    if (files.length === 0 || instructions.length === 0) return;

    // Combine all instructions into one
    const combinedInstruction = instructions.join('. ');

    // Create work items
    const newItems = files.map(file => ({
      file,
      instruction: combinedInstruction,
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
    let clickedImageGlobalIndex = 0;
    let foundClickedImage = false;
    
    workItems.forEach((item) => {
      if (item.status === 'completed' && item.result?.images) {
        item.result.images.forEach((image) => {
          if (item.file.name === title && !foundClickedImage) {
            clickedImageGlobalIndex = allImages.length;
            foundClickedImage = true;
          }
          allImages.push(image);
        });
      }
    });
    
    setLightboxImages(allImages);
    setLightboxIndex(clickedImageGlobalIndex);
    setLightboxTitle(`All Results (${allImages.length} images)`);
    setLightboxOpen(true);
  }, [workItems]);

  const handleCloseLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-white text-black font-mono">
      {/* Header */}
      <header className="border-b-2 border-black p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/brandana.webp" alt="Brandana" className="w-12 h-12" />
            <div>
              <h1 className="text-xl font-bold">NANO-BRANDANA</h1>
              <p className="text-sm">BATCH IMAGE EDITOR AGENT FOR BRANDS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm">MODEL:</label>
            <select
              value={currentModel}
              onChange={(e) => setCurrentModel(e.target.value)}
              className="bg-white border border-black px-2 py-1 pr-6 text-sm focus:outline-none focus:border-neon appearance-none bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOCIgaGVpZ2h0PSI1IiB2aWV3Qm94PSIwIDAgOCA1IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xIDFMNCA0TDcgMSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+')] bg-no-repeat bg-[position:calc(100%-8px)_center] bg-[length:8px_5px]"
            >
              <option value="google/gemini-2.5-flash-image-preview">
                GEMINI-2.5-FLASH
              </option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="h-[calc(100vh-80px)] grid grid-cols-3">
        {/* Left: Input Panel */}
        <div className="border-r border-black p-4 overflow-hidden">
          <Dropzone
            onFilesAdded={handleFilesAdded}
            files={files}
            onRemoveFile={handleRemoveFile}
            onClearAll={handleClearAll}
          />
        </div>

        {/* Middle: Tasks/Progress */}
        <div className="border-r border-black p-4 flex flex-col overflow-hidden">
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
              <div className="flex-1 overflow-hidden">
                <Chat
                  onSendInstruction={handleSendInstruction}
                  isProcessing={isProcessing}
                  currentModel={currentModel}
                  onModelChange={setCurrentModel}
                  onRunBatch={handleRunBatch}
                  canRunBatch={files.length > 0 && instructions.length > 0 && !isProcessing}
                  instructions={displayInstructions}
                  onClearInstructions={handleClearInstructions}
                />
              </div>
              
              {files.length > 0 && instructions.length > 0 && (
                <div className="border-t border-black pt-4 mt-4 space-y-2 flex-shrink-0">
                  <button
                    onClick={handleRunBatch}
                    disabled={isProcessing}
                    className="w-full py-2 border-2 border-neon bg-neon text-black font-bold text-sm hover:bg-white hover:text-black transition-all"
                  >
                    {isProcessing ? 'PROCESSING...' : `RUN_BATCH [${files.length}]`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Results */}
        <div className="p-4 flex flex-col overflow-hidden">
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
          
          {workItems.length === 0 ? (
            <div className="text-center mt-16">
              <div className="text-4xl mb-4">[ ]</div>
              <p className="text-sm">AWAITING_RESULTS</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4">
              {workItems.map((item) => (
                <ResultCard
                  key={item.id}
                  item={item}
                  originalImage={fileToBase64Map.get(item.file) || ''}
                  onOpenLightbox={handleOpenLightbox}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      
      <Lightbox
        images={lightboxImages}
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
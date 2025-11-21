import pLimit from 'p-limit';

export interface WorkItem {
  id: string;
  file: File;
  instruction: string;
  imageSize?: '1K' | '2K' | '4K';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: {
    images: string[];
    content?: string;
    elapsed: number;
    usage?: any;
    imageSize?: string;
  };
  error?: string;
  retries: number;
  startTime?: number;
  endTime?: number;
  expectedImageCount?: number; // Track expected duplicate count
}

export interface BatchProcessor {
  addItems(items: Omit<WorkItem, 'id' | 'status' | 'retries'>[]): void;
  start(): void;
  stop(): void;
  retryItem(itemId: string): void;
  getItems(): WorkItem[];
  onUpdate(callback: (items: WorkItem[]) => void): void;
  isProcessing(): boolean;
}

export function createBatchProcessor(
  processItem: (item: WorkItem) => Promise<WorkItem>,
  concurrency: number = 3,
  staggerDelay: number = 500 // Delay between starting each request
): BatchProcessor {
  const limit = pLimit(concurrency);
  const items: WorkItem[] = [];
  let updateCallbacks: ((items: WorkItem[]) => void)[] = [];
  let processing = false;
  let abortController: AbortController | null = null;

  const notifyUpdate = () => {
    updateCallbacks.forEach(cb => cb([...items]));
  };

  const processQueue = async () => {
    if (!processing) return;

    const queuedItems = items.filter(item => item.status === 'queued');
    if (queuedItems.length === 0) {
      processing = false;
      return;
    }

    abortController = new AbortController();

    await Promise.all(
      queuedItems.map((item, index) =>
        limit(async () => {
          if (abortController?.signal.aborted) return;

          // Add stagger delay to reduce server load
          if (index > 0 && staggerDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, index * staggerDelay));
          }

          if (abortController?.signal.aborted) return;

          item.status = 'processing';
          item.startTime = Date.now();
          notifyUpdate();

          try {
            const result = await processItem(item);
            if (!abortController?.signal.aborted) {
              console.log('Batch processor - assigning result:', { 
                fileName: item.file.name, 
                beforeStatus: item.status, 
                resultStatus: result.status 
              });
              Object.assign(item, result);
              console.log('Batch processor - after assign:', { 
                fileName: item.file.name, 
                afterStatus: item.status 
              });
              notifyUpdate();
              
              // Check if all items are done and force another update
              const allDone = items.every(i => i.status === 'completed' || i.status === 'failed');
              console.log('Batch processor - all done check:', { allDone, itemCount: items.length });
              if (allDone) {
                console.log('Batch processor - forcing final update');
                setTimeout(() => {
                  console.log('Batch processor - executing final notifyUpdate');
                  notifyUpdate();
                }, 100);
              }
            }
          } catch (error) {
            if (!abortController?.signal.aborted) {
              item.status = 'failed';
              item.error = error instanceof Error ? error.message : 'Unknown error';
              item.endTime = Date.now();
              notifyUpdate();
            }
          }
        })
      )
    );

    // Process next batch if still processing
    if (processing && !abortController?.signal.aborted) {
      processQueue();
    }
  };

  return {
    addItems(newItems) {
      const itemsToAdd = newItems.map((item, index) => ({
        ...item,
        id: `${Date.now()}-${index}`,
        status: 'queued' as const,
        retries: 0,
      }));
      items.push(...itemsToAdd);
      notifyUpdate();
    },

    start() {
      processing = true;
      processQueue();
    },

    stop() {
      processing = false;
      abortController?.abort();
      
      // Reset queued and processing items
      items.forEach(item => {
        if (item.status === 'processing' || item.status === 'queued') {
          item.status = 'queued';
        }
      });
      notifyUpdate();
    },

    getItems() {
      return [...items];
    },

    onUpdate(callback) {
      updateCallbacks.push(callback);
      return () => {
        updateCallbacks = updateCallbacks.filter(cb => cb !== callback);
      };
    },

    retryItem(itemId: string) {
      const item = items.find(i => i.id === itemId);
      if (item && (item.status === 'failed' || item.status === 'completed')) {
        console.log('Retrying item:', item.file.name);
        item.status = 'queued';
        item.error = undefined;
        item.result = undefined;
        item.startTime = undefined;
        item.endTime = undefined;
        item.retries = (item.retries || 0) + 1;
        notifyUpdate();
        
        // Start processing if not already running
        if (!processing) {
          processing = true;
          processQueue();
        }
      }
    },

    isProcessing() {
      return processing;
    }
  };
}
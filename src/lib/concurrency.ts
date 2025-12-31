import pLimit from 'p-limit';

// Base input types - original inputs from user (image or text)
export type ImageInputItem = { type: 'image'; file: File; id: string };
export type TextInputItem = { type: 'text'; prompt: string; id: string };
export type BaseInputItem = ImageInputItem | TextInputItem;

// Composite input type - combines multiple inputs for Single Job mode
export type CompositeInputItem = { type: 'composite'; items: BaseInputItem[]; id: string };

// Full input type including composite (used in WorkItem)
export type InputItem = BaseInputItem | CompositeInputItem;

export interface WorkItem {
  id: string;
  input: InputItem; // Changed from 'file: File' to support both types
  instruction: string;
  referenceImageUrls?: string[]; // Reference images from presets (max 3)
  imageSize?: '1K' | '2K' | '4K';
  batchId?: string; // Groups logs from a single batch run
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
  redoItem(itemId: string): string | null; // Creates a NEW item based on existing, returns new item ID
  createRedoFromItem(sourceItem: WorkItem): string; // Creates a NEW item from provided item data
  createRedoFromItemWithInstruction(sourceItem: WorkItem, instruction: string): string; // Creates a NEW item with custom instruction
  replaceAndRedoItem(sourceItem: WorkItem, instruction: string): void; // Replaces existing item and reprocesses
  getItems(): WorkItem[];
  onUpdate(callback: (items: WorkItem[]) => void): void;
  isProcessing(): boolean;
}

// Helper function to get display name for an input item
export function getInputDisplayName(input: InputItem): string {
  if (input.type === 'image') {
    return input.file.name;
  } else if (input.type === 'text') {
    return `Text: ${input.prompt.substring(0, 30)}...`;
  } else if (input.type === 'composite') {
    const imageCount = input.items.filter(i => i.type === 'image').length;
    const textCount = input.items.filter(i => i.type === 'text').length;
    const parts = [];
    if (imageCount > 0) parts.push(`${imageCount} image${imageCount > 1 ? 's' : ''}`);
    if (textCount > 0) parts.push(`${textCount} text${textCount > 1 ? 's' : ''}`);
    return `Combined: ${parts.join(' + ')}`;
  }
  return 'Unknown';
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
                inputName: getInputDisplayName(item.input),
                beforeStatus: item.status,
                resultStatus: result.status
              });
              Object.assign(item, result);
              console.log('Batch processor - after assign:', {
                inputName: getInputDisplayName(item.input),
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
        console.log('Retrying item:', getInputDisplayName(item.input));
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

    redoItem(itemId: string): string | null {
      const item = items.find(i => i.id === itemId);
      if (item && (item.status === 'failed' || item.status === 'completed')) {
        // Create a NEW item based on the existing one
        const newId = `${Date.now()}-redo-${Math.random().toString(36).substring(2, 7)}`;
        const newItem: WorkItem = {
          id: newId,
          input: item.input,
          instruction: item.instruction,
          imageSize: item.imageSize,
          batchId: item.batchId,
          status: 'queued',
          retries: 0,
        };

        console.log('Creating redo item:', getInputDisplayName(item.input), 'new ID:', newId);

        // Add new item to the list (after the original)
        const originalIndex = items.indexOf(item);
        items.splice(originalIndex + 1, 0, newItem);
        notifyUpdate();

        // Start processing if not already running
        if (!processing) {
          processing = true;
          processQueue();
        }

        return newId;
      }
      return null;
    },

    // Create a redo from external item data (when internal items might be stale)
    createRedoFromItem(sourceItem: WorkItem): string {
      const newId = `${Date.now()}-redo-${Math.random().toString(36).substring(2, 7)}`;
      const newItem: WorkItem = {
        id: newId,
        input: sourceItem.input,
        instruction: sourceItem.instruction,
        imageSize: sourceItem.imageSize,
        batchId: sourceItem.batchId,
        status: 'queued',
        retries: 0,
      };

      console.log('Creating redo from external item:', getInputDisplayName(sourceItem.input), 'new ID:', newId);

      // Add new item to the end of the list
      items.push(newItem);
      notifyUpdate();

      // Start processing if not already running
      if (!processing) {
        processing = true;
        processQueue();
      }

      return newId;
    },

    // Create a redo from external item data with custom instruction
    createRedoFromItemWithInstruction(sourceItem: WorkItem, instruction: string): string {
      const newId = `${Date.now()}-redo-${Math.random().toString(36).substring(2, 7)}`;
      const newItem: WorkItem = {
        id: newId,
        input: sourceItem.input,
        instruction: instruction,
        imageSize: sourceItem.imageSize,
        batchId: sourceItem.batchId,
        status: 'queued',
        retries: 0,
      };

      console.log('Creating redo with custom instruction:', getInputDisplayName(sourceItem.input), 'new ID:', newId);

      // Add new item to the end of the list
      items.push(newItem);
      notifyUpdate();

      // Start processing if not already running
      if (!processing) {
        processing = true;
        processQueue();
      }

      return newId;
    },

    // Replace existing item in-place and reprocess
    replaceAndRedoItem(sourceItem: WorkItem, instruction: string): void {
      const item = items.find(i => i.id === sourceItem.id);
      if (item && (item.status === 'failed' || item.status === 'completed')) {
        console.log('Replacing and redoing item:', getInputDisplayName(item.input));

        // Update the item in-place
        item.instruction = instruction;
        item.status = 'queued';
        item.error = undefined;
        item.result = undefined;
        item.startTime = undefined;
        item.endTime = undefined;
        item.retries = 0;

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
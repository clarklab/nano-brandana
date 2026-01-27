import pLimit from 'p-limit';
import { enqueueJob, getJobsStatus, EnqueueJobRequest } from './api';

// Base input types - original inputs from user (image or text)
export type ImageInputItem = { type: 'image'; file: File; id: string; displayName?: string };
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
  aspectRatio?: string; // Aspect ratio for image generation
  customWidth?: number; // Custom output width (for exact size feature)
  customHeight?: number; // Custom output height (for exact size feature)
  batchId?: string; // Groups logs from a single batch run
  presetLabel?: string; // Label of preset used (if any)
  presetIcon?: string; // Icon of preset used (if any)
  resizeOnly?: boolean; // Skip API, do client-side resize only (no AI processing)
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
  // Async job queue fields
  jobId?: string; // Server-side job ID for async processing
  requestId?: string; // Client-generated request ID
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
    return input.displayName || input.file.name;
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
              Object.assign(item, result);
              notifyUpdate();

              // Check if all items are done and force another update
              const allDone = items.every(i => i.status === 'completed' || i.status === 'failed');
              if (allDone) {
                setTimeout(() => notifyUpdate(), 100);
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
          aspectRatio: item.aspectRatio,
          customWidth: item.customWidth,
          customHeight: item.customHeight,
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
        aspectRatio: sourceItem.aspectRatio,
        customWidth: sourceItem.customWidth,
        customHeight: sourceItem.customHeight,
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
        aspectRatio: sourceItem.aspectRatio,
        customWidth: sourceItem.customWidth,
        customHeight: sourceItem.customHeight,
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

// === Async Batch Processor ===
// Uses the async job queue to avoid timeout issues

export interface AsyncBatchProcessorOptions {
  /** Concurrency for enqueue requests (default: 5) */
  enqueueConcurrency?: number;
  /** Polling interval in ms (default: 3000) */
  pollInterval?: number;
  /** Delay between enqueue requests in ms (default: 200) */
  staggerDelay?: number;
  /** Function to convert WorkItem to base64 images */
  getImagesFromItem: (item: WorkItem) => Promise<string[]>;
  /** Function to get reference images as base64 */
  getReferenceImages?: (item: WorkItem) => Promise<string[]>;
  /** Model to use */
  model?: string;
  /** Optional local processor for items that should be handled client-side (e.g., resize-only) */
  processLocally?: (item: WorkItem) => Promise<WorkItem>;
  /** Callback when a job completes (for updating token balance, etc.) */
  onJobComplete?: (item: WorkItem, tokensRemaining: number | null) => void;
}

export interface AsyncBatchProcessor extends BatchProcessor {
  /** Get token balance from last enqueue response */
  getTokensRemaining(): number | null;
}

/**
 * Creates a batch processor that uses the async job queue.
 * Jobs are enqueued instantly and polled for results.
 */
export function createAsyncBatchProcessor(
  options: AsyncBatchProcessorOptions
): AsyncBatchProcessor {
  const {
    enqueueConcurrency = 5,
    pollInterval = 3000,
    staggerDelay = 200,
    getImagesFromItem,
    getReferenceImages,
    model,
    processLocally,
    onJobComplete,
  } = options;

  const limit = pLimit(enqueueConcurrency);
  const items: WorkItem[] = [];
  let updateCallbacks: ((items: WorkItem[]) => void)[] = [];
  let processing = false;
  let abortController: AbortController | null = null;
  let pollIntervalId: ReturnType<typeof setInterval> | null = null;
  let tokensRemaining: number | null = null;

  const notifyUpdate = () => {
    updateCallbacks.forEach(cb => cb([...items]));
  };

  // Poll all processing jobs for status updates (batch)
  const pollJobs = async () => {
    const processingItems = items.filter(
      item => item.status === 'processing' && item.jobId
    );

    if (processingItems.length === 0) {
      // No more processing items, stop polling
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }

      // Check if all items are done
      const allDone = items.every(
        i => i.status === 'completed' || i.status === 'failed'
      );
      if (allDone && items.length > 0) {
        processing = false;
        notifyUpdate();
      }
      return;
    }

    if (abortController?.signal.aborted) return;

    // Collect all job IDs to poll in one request
    const jobIds = processingItems
      .map(item => item.jobId)
      .filter((id): id is string => !!id);

    if (jobIds.length === 0) return;

    try {
      // Single batch request for all jobs
      const batchStatus = await getJobsStatus(jobIds);

      if (abortController?.signal.aborted) return;

      let needsUpdate = false;

      // Update each item based on batch response
      for (const item of processingItems) {
        if (!item.jobId) continue;

        const status = batchStatus.jobs[item.jobId];
        if (!status) continue;

        if (status.status === 'completed') {
          item.status = 'completed';
          item.endTime = Date.now();
          item.result = {
            images: status.images || [],
            content: status.content,
            elapsed: status.elapsed || 0,
            usage: status.usage,
          };
          needsUpdate = true;
          onJobComplete?.(item, tokensRemaining);
        } else if (status.status === 'failed' || status.status === 'timeout') {
          item.status = 'failed';
          item.endTime = Date.now();
          item.error = status.error || 'Job failed';
          needsUpdate = true;
        }
        // For 'pending' or 'processing', keep polling
      }

      if (needsUpdate) {
        notifyUpdate();
      }
    } catch (err) {
      console.error('Batch poll error:', err);
      // Don't fail items on transient poll errors
    }
  };

  // Enqueue a single item (or process locally if applicable)
  const enqueueItem = async (item: WorkItem): Promise<void> => {
    if (abortController?.signal.aborted) return;

    item.status = 'processing';
    item.startTime = Date.now();
    notifyUpdate();

    // Check if this item should be processed locally (e.g., resize-only)
    if (processLocally && item.resizeOnly) {
      try {
        const result = await processLocally(item);
        if (abortController?.signal.aborted) return;
        Object.assign(item, result);
        notifyUpdate();
        onJobComplete?.(item, tokensRemaining);
        return;
      } catch (err) {
        if (abortController?.signal.aborted) return;
        item.status = 'failed';
        item.endTime = Date.now();
        item.error = err instanceof Error ? err.message : 'Local processing failed';
        notifyUpdate();
        return;
      }
    }

    try {
      // Get images from the work item
      const images = await getImagesFromItem(item);
      const referenceImages = getReferenceImages
        ? await getReferenceImages(item)
        : [];

      if (abortController?.signal.aborted) return;

      // Build enqueue request
      const request: EnqueueJobRequest = {
        instruction: item.instruction,
        images: images.length > 0 ? images : undefined,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        imageSize: item.imageSize,
        aspectRatio: item.aspectRatio || undefined,
        mode: 'batch',
        batchId: item.batchId,
        model,
      };

      // Enqueue the job
      const response = await enqueueJob(request);

      if (abortController?.signal.aborted) return;

      // Store job ID for polling
      item.jobId = response.jobId;
      item.requestId = response.requestId;
      tokensRemaining = response.tokens_remaining;

      console.log('Job enqueued:', {
        itemId: item.id,
        jobId: response.jobId,
        tokensRemaining,
      });

      notifyUpdate();
    } catch (err) {
      if (abortController?.signal.aborted) return;

      item.status = 'failed';
      item.endTime = Date.now();
      item.error = err instanceof Error ? err.message : 'Failed to enqueue job';
      notifyUpdate();
    }
  };

  // Process all queued items
  const processQueue = async () => {
    if (!processing) return;

    const queuedItems = items.filter(item => item.status === 'queued');
    if (queuedItems.length === 0) {
      // No queued items, but might have processing items
      const hasProcessing = items.some(item => item.status === 'processing');
      if (!hasProcessing) {
        processing = false;
      }
      return;
    }

    abortController = new AbortController();

    // Enqueue all items with concurrency limit
    await Promise.all(
      queuedItems.map((item, index) =>
        limit(async () => {
          if (abortController?.signal.aborted) return;

          // Stagger requests to avoid overwhelming the server
          if (index > 0 && staggerDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, index * staggerDelay));
          }

          if (abortController?.signal.aborted) return;

          await enqueueItem(item);
        })
      )
    );

    // Start polling if not already polling
    if (!pollIntervalId && !abortController?.signal.aborted) {
      pollIntervalId = setInterval(pollJobs, pollInterval);
      // Also poll immediately
      pollJobs();
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

      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }

      // Reset queued and processing items
      items.forEach(item => {
        if (item.status === 'processing' || item.status === 'queued') {
          item.status = 'queued';
          item.jobId = undefined;
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
        item.jobId = undefined;
        item.retries = (item.retries || 0) + 1;
        notifyUpdate();

        if (!processing) {
          processing = true;
          processQueue();
        }

        // Restart polling if not polling
        if (!pollIntervalId) {
          pollIntervalId = setInterval(pollJobs, pollInterval);
        }
      }
    },

    redoItem(itemId: string): string | null {
      const item = items.find(i => i.id === itemId);
      if (item && (item.status === 'failed' || item.status === 'completed')) {
        const newId = `${Date.now()}-redo-${Math.random().toString(36).substring(2, 7)}`;
        const newItem: WorkItem = {
          id: newId,
          input: item.input,
          instruction: item.instruction,
          imageSize: item.imageSize,
          aspectRatio: item.aspectRatio,
          customWidth: item.customWidth,
          customHeight: item.customHeight,
          batchId: item.batchId,
          status: 'queued',
          retries: 0,
        };

        const originalIndex = items.indexOf(item);
        items.splice(originalIndex + 1, 0, newItem);
        notifyUpdate();

        if (!processing) {
          processing = true;
          processQueue();
        }

        if (!pollIntervalId) {
          pollIntervalId = setInterval(pollJobs, pollInterval);
        }

        return newId;
      }
      return null;
    },

    createRedoFromItem(sourceItem: WorkItem): string {
      const newId = `${Date.now()}-redo-${Math.random().toString(36).substring(2, 7)}`;
      const newItem: WorkItem = {
        id: newId,
        input: sourceItem.input,
        instruction: sourceItem.instruction,
        imageSize: sourceItem.imageSize,
        aspectRatio: sourceItem.aspectRatio,
        customWidth: sourceItem.customWidth,
        customHeight: sourceItem.customHeight,
        batchId: sourceItem.batchId,
        status: 'queued',
        retries: 0,
      };

      items.push(newItem);
      notifyUpdate();

      if (!processing) {
        processing = true;
        processQueue();
      }

      if (!pollIntervalId) {
        pollIntervalId = setInterval(pollJobs, pollInterval);
      }

      return newId;
    },

    createRedoFromItemWithInstruction(sourceItem: WorkItem, instruction: string): string {
      const newId = `${Date.now()}-redo-${Math.random().toString(36).substring(2, 7)}`;
      const newItem: WorkItem = {
        id: newId,
        input: sourceItem.input,
        instruction: instruction,
        imageSize: sourceItem.imageSize,
        aspectRatio: sourceItem.aspectRatio,
        customWidth: sourceItem.customWidth,
        customHeight: sourceItem.customHeight,
        batchId: sourceItem.batchId,
        status: 'queued',
        retries: 0,
      };

      items.push(newItem);
      notifyUpdate();

      if (!processing) {
        processing = true;
        processQueue();
      }

      if (!pollIntervalId) {
        pollIntervalId = setInterval(pollJobs, pollInterval);
      }

      return newId;
    },

    replaceAndRedoItem(sourceItem: WorkItem, instruction: string): void {
      const item = items.find(i => i.id === sourceItem.id);
      if (item && (item.status === 'failed' || item.status === 'completed')) {
        item.instruction = instruction;
        item.status = 'queued';
        item.error = undefined;
        item.result = undefined;
        item.startTime = undefined;
        item.endTime = undefined;
        item.jobId = undefined;
        item.retries = 0;

        notifyUpdate();

        if (!processing) {
          processing = true;
          processQueue();
        }

        if (!pollIntervalId) {
          pollIntervalId = setInterval(pollJobs, pollInterval);
        }
      }
    },

    isProcessing() {
      return processing;
    },

    getTokensRemaining() {
      return tokensRemaining;
    },
  };
}
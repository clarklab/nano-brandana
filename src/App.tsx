import React, { useState, useCallback, useEffect, useRef } from 'react';
import { InputPanel } from './components/InputPanel';
import { Chat } from './components/Chat';
import { ResultCard } from './components/ResultCard';
import { ProgressBar } from './components/ProgressBar';
import { Timer } from './components/Timer';
import { Lightbox } from './components/Lightbox';
import { IntroModal } from './components/IntroModal';
import { AuthModal } from './components/AuthModal';
import { AccountModal } from './components/AccountModal';
import { RedoModal } from './components/RedoModal';
import { DownloadModal, DownloadImage } from './components/DownloadModal';
import { WorkItem, InputItem, BaseInputItem, createBatchProcessor, getInputDisplayName } from './lib/concurrency';
import { fileToBase64, resizeImage, base64ToBlob, resizeBase64ToExact } from './lib/base64';
import { resizeImageLocally } from './lib/imageResize';
import { processImage, retryWithBackoff, validateImageData, logResizeJob } from './lib/api';
import { useAuth } from './contexts/AuthContext';
import { useSounds } from './lib/sounds';
import { useAnimatedNumber } from './hooks/useAnimatedNumber';
import { trackCallbackReceived, trackCallbackError } from './lib/auth-tracking';

const MAX_IMAGE_DIMENSION = 2048;
const BASE_CONCURRENCY = 3;

// Format token count for display (cosmetic only)
// Under 100k: show real number (e.g., 45,678)
// Under 1M: show as 126k, 724k, etc.
// Over 1M: show as 1.4m, 2.3m, etc.
const formatTokenCount = (count: number): string => {
  if (count < 100_000) {
    return count.toLocaleString();
  } else if (count < 1_000_000) {
    const k = Math.floor(count / 1000);
    return `${k}k`;
  } else {
    const m = count / 1_000_000;
    return `${m.toFixed(1)}m`;
  }
};

// Edge v2 is now the default (no timeout issues, can be more aggressive)
// Disable via ?edge-v2=false as escape hatch
const isUsingEdgeV2 = () => {
  if (typeof window === 'undefined') return true; // Default to v2

  const urlParams = new URLSearchParams(window.location.search);
  // Only check for explicit disable
  if (urlParams.get('edge-v2') === 'false') {
    localStorage.setItem('use-edge-v2', 'false');
    return false;
  }
  // Check if explicitly disabled in localStorage
  if (localStorage.getItem('use-edge-v2') === 'false') {
    return false;
  }

  // Default: use Edge v2
  return true;
};

// Dynamic concurrency based on batch size and endpoint
// Edge v2 has no timeout, so we can run more in parallel
const getConcurrencyLimit = (batchSize: number) => {
  if (isUsingEdgeV2()) {
    // Edge v2: Aggressive concurrency (no timeout concerns)
    // If we hit 429 rate limits, retry logic will handle it
    return 8; // Let's see how many we can push!
  }
  // Original v1: Conservative to avoid timeouts
  if (batchSize >= 10) return 1; // Large batches: sequential processing
  if (batchSize >= 5) return 2;  // Medium batches: low concurrency
  return BASE_CONCURRENCY;       // Small batches: normal concurrency
};

const getStaggerDelay = (batchSize: number) => {
  if (isUsingEdgeV2()) {
    // Edge v2: Minimal delays, let concurrency do the work
    return 100; // Just enough to not slam the server at once
  }
  // Original v1: Longer delays to avoid overwhelming server
  if (batchSize >= 10) return 2000; // 2 second delays for large batches
  if (batchSize >= 5) return 1000;  // 1 second delays for medium batches
  return 500;                       // 500ms delays for small batches
};

function App() {
  // Sounds
  const { blip: playBlip, click: playClick, ping: playPing } = useSounds();

  // Auth state
  const { user, profile, jobLogs, loading: authLoading, isConfigured: authConfigured, signOut, refreshProfile, refreshJobLogs, updateTokenBalance, tokenAnimation, triggerTokenAnimation, clearTokenAnimation } = useAuth();

  // Ref to hold updateTokenBalance to avoid useMemo dependency issues
  const updateTokenBalanceRef = useRef(updateTokenBalance);
  useEffect(() => {
    updateTokenBalanceRef.current = updateTokenBalance;
  }, [updateTokenBalance]);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  const [inputs, setInputs] = useState<BaseInputItem[]>([]);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [displayInstructions, setDisplayInstructions] = useState<string[]>([]);
  const [instructionReferenceImages, setInstructionReferenceImages] = useState<Map<number, string[]>>(new Map());
  const [instructionPresetInfo, setInstructionPresetInfo] = useState<{ label: string; icon: string | null } | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentModel, setCurrentModel] = useState('google/gemini-3-pro-image');
  const [batchStartTime, setBatchStartTime] = useState<number | null>(null);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [inputToBase64Map, setInputToBase64Map] = useState<Map<string, string>>(new Map());
  const [loadingInputIds, setLoadingInputIds] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxOriginalImages, setLightboxOriginalImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxTitle, setLightboxTitle] = useState('');
  const [lightboxImageToItemId, setLightboxImageToItemId] = useState<Map<number, string>>(new Map());
  const [introModalOpen, setIntroModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'tasks' | 'results'>('input');
  const [processingMode, setProcessingMode] = useState<'batch' | 'singleJob'>('batch');
  const [redoModalItem, setRedoModalItem] = useState<WorkItem | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  // Check if intro has been seen before
  useEffect(() => {
    const hasSeenIntro = localStorage.getItem('peel-intro-seen');
    if (!hasSeenIntro) {
      setIntroModalOpen(true);
    }
  }, []);

  // Handle auth callbacks from URL params (success or error)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));

    // Check for error params
    const errorCode = urlParams.get('error_code') || hashParams.get('error_code');
    const errorDescription = urlParams.get('error_description') || hashParams.get('error_description');

    // Check for success params (access_token indicates successful callback)
    const accessToken = hashParams.get('access_token');
    const hasAuthCallback = accessToken || errorCode;

    if (hasAuthCallback) {
      // Track that we received a callback (before processing)
      if (accessToken) {
        // Successful callback
        console.log('Auth callback detected: success');
        trackCallbackReceived();
      } else if (errorCode) {
        // Error callback
        console.log('Auth callback detected: error', errorCode, errorDescription);
        trackCallbackError(errorCode, errorDescription?.replace(/\+/g, ' ') || undefined);

        // Map error codes to user-friendly messages
        let message = errorDescription?.replace(/\+/g, ' ') || 'Authentication failed';
        if (errorCode === 'otp_expired') {
          message = 'Your magic link has expired. Please request a new one.';
        } else if (errorCode === 'access_denied') {
          message = 'Access denied. Please try signing in again.';
        }

        setAuthError(message);
        setAuthModalOpen(true);

        // Clean up URL for errors (Supabase handles success URL cleanup)
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  // Track payment success processing state
  const paymentProcessedRef = useRef(false);
  const prePurchaseTokensRef = useRef<number | null>(null);
  const isPollingForTokensRef = useRef(false);

  // Throttled processing status log (every 5s)
  const lastPollLogRef = useRef(0);

  // Handle payment success redirect - refresh profile to get updated token balance
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');

    if (paymentStatus === 'success' && !paymentProcessedRef.current) {
      paymentProcessedRef.current = true;
      console.log('Payment success detected!');

      // Store the pre-purchase token count
      // This might be 0 if profile hasn't loaded yet, or the current balance
      prePurchaseTokensRef.current = profile?.tokens_remaining ?? 0;
      console.log('Pre-purchase token count stored:', prePurchaseTokensRef.current);

      // Open account modal to show the updated balance
      setAccountModalOpen(true);

      // Clean up URL parameters immediately
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);

      // Start polling for token increase
      if (authConfigured && !isPollingForTokensRef.current) {
        isPollingForTokensRef.current = true;

        const pollForTokenIncrease = async () => {
          const maxAttempts = 15; // 15 attempts over ~15 seconds
          let attempts = 0;

          console.log('Starting to poll for token increase...');

          while (attempts < maxAttempts) {
            await refreshProfile();

            // Wait for next attempt
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;

            console.log(`Poll attempt ${attempts}/${maxAttempts}`);
          }

          console.log('Finished polling for token increase');
          isPollingForTokensRef.current = false;
        };

        // Start polling after a short delay
        setTimeout(pollForTokenIncrease, 500);
      }
    }
  }, [authConfigured, refreshProfile]);

  // Watch for token changes and trigger animation
  useEffect(() => {
    // Only check if we've processed a payment and have a stored pre-purchase value
    if (prePurchaseTokensRef.current !== null && profile?.tokens_remaining !== undefined) {
      const prePurchaseTokens = prePurchaseTokensRef.current;
      const currentTokens = profile.tokens_remaining;

      // If tokens increased from pre-purchase value, trigger animation
      if (currentTokens > prePurchaseTokens && !tokenAnimation?.isAnimating) {
        console.log('Token increase detected! Animating from', prePurchaseTokens, 'to', currentTokens);
        triggerTokenAnimation(prePurchaseTokens, currentTokens);

        // Reset the pre-purchase ref so we don't re-animate
        prePurchaseTokensRef.current = null;
      }
    }
  }, [profile?.tokens_remaining, tokenAnimation?.isAnimating, triggerTokenAnimation]);

  // Animated token count for the header pill
  const handleAnimationComplete = useCallback(() => {
    console.log('Token animation complete, playing ping sound');
    playPing();
    // Clear animation state after a short delay
    setTimeout(() => {
      clearTokenAnimation();
    }, 100);
  }, [playPing, clearTokenAnimation]);

  const animatedTokenCount = useAnimatedNumber(
    tokenAnimation?.to ?? (profile?.tokens_remaining || 0),
    tokenAnimation?.isAnimating ? tokenAnimation.from : undefined,
    { duration: 1500, onComplete: tokenAnimation?.isAnimating ? handleAnimationComplete : undefined }
  );

  // Create batch processor with dynamic settings
  const batchProcessor = React.useMemo(() => {
    const concurrency = getConcurrencyLimit(inputs.length);
    const staggerDelay = getStaggerDelay(inputs.length);

    console.log('Creating batch processor:', {
      inputCount: inputs.length,
      concurrency,
      staggerDelay
    });

    return createBatchProcessor(async (item: WorkItem) => {
      try {
        // Handle resize-only jobs (local processing, no API call)
        if (item.resizeOnly && item.input.type === 'image') {
          const startTime = Date.now();
          const inputName = getInputDisplayName(item.input);
          console.log('Local resize for:', inputName, 'with imageSize:', item.imageSize, 'aspectRatio:', item.aspectRatio);

          try {
            const result = await resizeImageLocally(item.input.file, {
              imageSize: item.imageSize,
              aspectRatio: item.aspectRatio,
              customWidth: item.customWidth,
              customHeight: item.customHeight,
            });

            const elapsed = Date.now() - startTime;
            console.log('Local resize completed for:', inputName, 'in', elapsed, 'ms');

            item.status = 'completed';
            item.result = {
              images: [result.base64],
              elapsed,
              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
              imageSize: item.imageSize || '1K',
            };
            item.endTime = Date.now();

            // Log to database (fire and forget)
            logResizeJob({
              batchId: item.batchId,
              imageSize: item.imageSize,
              imagesCount: 1,
              elapsedMs: elapsed,
              aspectRatio: item.aspectRatio,
              customWidth: item.customWidth,
              customHeight: item.customHeight,
            });

            return item;
          } catch (err) {
            console.error('Local resize failed for:', inputName, err);
            item.status = 'failed';
            item.error = err instanceof Error ? err.message : 'Resize failed';
            item.endTime = Date.now();
            return item;
          }
        }

        let base64: string | undefined;
        let base64Array: string[] | undefined;
        const inputId = item.input.id;

        // Handle composite inputs (Single Job mode)
        if (item.input.type === 'composite') {
          const imageItems = item.input.items.filter(i => i.type === 'image') as { type: 'image'; file: File; id: string }[];
          base64Array = [];

          for (const imgItem of imageItems) {
            let imgBase64 = inputToBase64Map.get(imgItem.id);
            if (!imgBase64) {
              imgBase64 = await fileToBase64(imgItem.file);

              // Check if resizing is needed
              const img = new Image();
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imgBase64!;
              });

              if (img.width > MAX_IMAGE_DIMENSION || img.height > MAX_IMAGE_DIMENSION) {
                imgBase64 = await resizeImage(imgItem.file, MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION);
              }

              setInputToBase64Map(prev => new Map(prev).set(imgItem.id, imgBase64!));
            }
            base64Array.push(imgBase64);
          }
        }
        // Handle single image inputs
        else if (item.input.type === 'image') {
          // Get or create base64 for file
          base64 = inputToBase64Map.get(inputId);
          if (!base64) {
            base64 = await fileToBase64(item.input.file);

            // Check if resizing is needed
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = base64!;
            });

            if (img.width > MAX_IMAGE_DIMENSION || img.height > MAX_IMAGE_DIMENSION) {
              base64 = await resizeImage(item.input.file, MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION);
            }

            setInputToBase64Map(prev => new Map(prev).set(inputId, base64!));
          }
        }
        // For text inputs, both base64 and base64Array remain undefined

        // Fetch and convert reference images if present
        let referenceImages: string[] | undefined;
        if (item.referenceImageUrls && item.referenceImageUrls.length > 0) {
          referenceImages = [];
          for (const url of item.referenceImageUrls) {
            try {
              // Fetch the image from the URL
              const response = await fetch(url);
              const blob = await response.blob();

              // Convert blob to base64
              const base64Ref = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });

              referenceImages.push(base64Ref);
            } catch (err) {
              console.error('Failed to fetch reference image:', url, err);
              // Continue without this reference image rather than failing
            }
          }
        }

        const inputName = getInputDisplayName(item.input);
        console.log('Starting API call for:', inputName, 'with imageSize:', item.imageSize, 'aspectRatio:', item.aspectRatio, 'images:', base64Array?.length || (base64 ? 1 : 0), 'reference images:', referenceImages?.length || 0);
        const result = await retryWithBackoff(
          () => processImage({
            image: base64, // undefined for text-only or composite
            images: base64Array, // array for composite (Single Job mode)
            referenceImages, // Reference images from presets
            instruction: item.instruction,
            model: currentModel,
            imageSize: item.imageSize || '1K',
            aspectRatio: item.aspectRatio,
            mode: item.input.type === 'composite' ? 'singleJob' : 'batch',
            batchId: item.batchId,
          }),
          3, // maxRetries
          1000, // initialDelay
          (result) => {
            // Validator function - check if result has valid images
            if (!result.images || result.images.length === 0) {
              console.error('No images in result for:', inputName);
              return false;
            }

            const invalidImages = result.images.filter(img => !validateImageData(img));
            if (invalidImages.length > 0) {
              console.error('Invalid images detected for:', inputName, invalidImages.length, 'out of', result.images.length);
              return false;
            }

            // Check if we got the expected number of duplicates
            const duplicateMatch = item.instruction.match(/Generate (\d+) variations/);
            if (duplicateMatch) {
              const expectedCount = parseInt(duplicateMatch[1]);
              if (result.images.length < expectedCount) {
                console.warn(`Expected ${expectedCount} variations but got ${result.images.length} for:`, inputName);
                // Allow partial results but log the discrepancy
                // We don't fail validation to avoid endless retries
              }
            }

            console.log('Image validation passed for:', inputName, result.images.length, 'valid images');
            return true;
          }
        );
        console.log('API call completed for:', inputName, result);

        // If custom dimensions were specified, resize images to exact size
        if (item.customWidth && item.customHeight && result.images && result.images.length > 0) {
          console.log('Resizing images to custom size:', item.customWidth, 'x', item.customHeight);
          try {
            const resizedImages = await Promise.all(
              result.images.map(img => resizeBase64ToExact(img, item.customWidth!, item.customHeight!))
            );
            result.images = resizedImages;
            console.log('Images resized successfully');
          } catch (resizeError) {
            console.error('Failed to resize images:', resizeError);
            // Continue with original images if resize fails
          }
        }

        item.status = 'completed';
        item.result = result;
        item.endTime = Date.now();

        console.log('Completing item:', { inputName, status: item.status });

        // Update totals - sum input + output tokens for accurate billing
        try {
          if (result.usage) {
            const promptTokens = result.usage.prompt_tokens || 0;
            const completionTokens = result.usage.completion_tokens || 0;
            const totalTokens = result.usage.total_tokens || (promptTokens + completionTokens);
            if (totalTokens > 0) {
              setTotalTokens(prev => prev + totalTokens);
            }
          }
          // Update token balance in real-time if returned from API
          if (typeof result.tokens_remaining === 'number') {
            updateTokenBalanceRef.current(result.tokens_remaining);
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
  }, [currentModel, inputToBase64Map, inputs.length]);

  const handleRedoItem = useCallback((itemId: string) => {
    console.log('Redo requested for item:', itemId);

    // Find the item in React state (which persists across batchProcessor recreations)
    const sourceItem = workItems.find(item => item.id === itemId);
    if (!sourceItem) {
      console.error('Could not find item to redo:', itemId);
      return;
    }

    if (sourceItem.status !== 'completed' && sourceItem.status !== 'failed') {
      console.log('Item is not in a state that can be redone:', sourceItem.status);
      return;
    }

    // Open the redo modal with the item
    setRedoModalItem(sourceItem);
  }, [workItems]);

  const handleRedoModalSubmit = useCallback((itemId: string, instruction: string, mode: 'replace' | 'new') => {
    console.log('Redo modal submitted:', { itemId, instruction, mode });

    // Find the item in React state
    const sourceItem = workItems.find(item => item.id === itemId);
    if (!sourceItem) {
      console.error('Could not find item to redo:', itemId);
      return;
    }

    if (mode === 'replace') {
      // Replace existing item in-place
      batchProcessor.replaceAndRedoItem(sourceItem, instruction);
    } else {
      // Create a new work item with the custom instruction
      batchProcessor.createRedoFromItemWithInstruction(sourceItem, instruction);
    }

    // Set processing state
    setIsProcessing(true);
    if (!batchStartTime) {
      setBatchStartTime(Date.now());
    }
  }, [batchProcessor, workItems, batchStartTime]);

  // Subscribe to updates
  useEffect(() => {
    const unsubscribe = batchProcessor.onUpdate(setWorkItems);
    return unsubscribe;
  }, [batchProcessor]);

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    const newInputs: BaseInputItem[] = newFiles.map(file => ({
      type: 'image' as const,
      file,
      id: `${Date.now()}-${Math.random()}`,
    }));
    setInputs(prev => [...prev, ...newInputs]);
  }, []);

  // Handle "Edit with Peel" link - load image from ?img= URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const imageUrl = urlParams.get('img');

    if (imageUrl) {
      console.log('Edit with Peel: Loading image from URL:', imageUrl);

      // Extract filename from URL for display
      let displayFilename = 'Loading image...';
      try {
        const urlPath = new URL(imageUrl).pathname;
        displayFilename = decodeURIComponent(urlPath.split('/').pop() || 'imported-image.png');
      } catch {
        // Keep default filename
      }

      // Create a placeholder input immediately for visual feedback
      const placeholderId = `${Date.now()}-${Math.random()}`;
      const placeholderBlob = new Blob([], { type: 'image/png' });
      const placeholderFile = new File([placeholderBlob], displayFilename, { type: 'image/png' });

      const placeholderInput: BaseInputItem = {
        type: 'image',
        file: placeholderFile,
        id: placeholderId,
      };

      // Add placeholder and mark as loading
      setInputs(prev => [...prev, placeholderInput]);
      setLoadingInputIds(prev => new Set(prev).add(placeholderId));

      // Clean up URL parameter immediately
      window.history.replaceState({}, '', window.location.pathname);

      // Fetch the actual image via proxy
      const loadImageFromUrl = async () => {
        try {
          const proxyUrl = `/.netlify/functions/image-proxy?url=${encodeURIComponent(imageUrl)}`;
          const response = await fetch(proxyUrl);

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Failed to fetch image via proxy:', errorData);
            // Remove placeholder on error
            setInputs(prev => prev.filter(input => input.id !== placeholderId));
            setLoadingInputIds(prev => {
              const next = new Set(prev);
              next.delete(placeholderId);
              return next;
            });
            // Show error modal
            setImportError(errorData.error || 'Failed to import image');
            return;
          }

          // Get the image as a blob directly
          const blob = await response.blob();
          const contentType = response.headers.get('Content-Type') || 'image/png';
          const filename = decodeURIComponent(
            response.headers.get('X-Image-Filename') || 'imported-image.png'
          );

          // Create a File object from the blob
          const file = new File([blob], filename, { type: contentType });

          // Replace placeholder with actual file
          setInputs(prev => prev.map(input =>
            input.id === placeholderId
              ? { ...input, file }
              : input
          ));

          // Remove from loading state
          setLoadingInputIds(prev => {
            const next = new Set(prev);
            next.delete(placeholderId);
            return next;
          });

          console.log('Edit with Peel: Image loaded successfully:', filename);
        } catch (error) {
          console.error('Edit with Peel: Failed to load image:', error);
          // Remove placeholder on error
          setInputs(prev => prev.filter(input => input.id !== placeholderId));
          setLoadingInputIds(prev => {
            const next = new Set(prev);
            next.delete(placeholderId);
            return next;
          });
        }
      };

      loadImageFromUrl();
    }
  }, []);

  const handlePromptsAdded = useCallback((prompts: string[]) => {
    const newInputs: BaseInputItem[] = prompts.map(prompt => ({
      type: 'text' as const,
      prompt,
      id: `${Date.now()}-${Math.random()}`,
    }));
    setInputs(prev => [...prev, ...newInputs]);
  }, []);

  const handleRemoveInput = useCallback((id: string) => {
    setInputs(prev => prev.filter(input => input.id !== id));
  }, []);

  const handleUpdateDisplayName = useCallback((id: string, displayName: string) => {
    setInputs(prev => prev.map(input => {
      if (input.id === id && input.type === 'image') {
        return { ...input, displayName: displayName || undefined };
      }
      return input;
    }));
  }, []);

  const handleClearAll = useCallback(() => {
    setInputs([]);
    setInputToBase64Map(new Map());
  }, []);

  // Clear results and reset tasks/progress view
  const handleClearResults = useCallback(() => {
    setWorkItems([]);
    setDisplayInstructions([]);
    setInstructions([]);
    setInstructionReferenceImages(new Map());
    setInstructionPresetInfo(null);
    setTotalElapsed(0);
    setTotalTokens(0);
    setIsProcessing(false);
    setBatchStartTime(null);
  }, []);

  const handleSendInstruction = useCallback((inst: string, displayText?: string, referenceImageUrls?: string[], presetInfo?: { label: string; icon: string | null }) => {
    setInstructions(prev => {
      const newInstructions = [...prev, inst];
      // Store reference images for this instruction index
      if (referenceImageUrls && referenceImageUrls.length > 0) {
        setInstructionReferenceImages(map => new Map(map).set(newInstructions.length - 1, referenceImageUrls));
      }
      return newInstructions;
    });
    setDisplayInstructions(prev => [...prev, displayText || inst]);
    // Store preset info if provided (use the most recent preset for the batch)
    if (presetInfo) {
      setInstructionPresetInfo(presetInfo);
    }
  }, []);

  const handleClearInstructions = useCallback(() => {
    setInstructions([]);
    setDisplayInstructions([]);
    setInstructionReferenceImages(new Map());
    setInstructionPresetInfo(null);
  }, []);

  const handleRemoveInstruction = useCallback((index: number) => {
    setInstructions(prev => prev.filter((_, i) => i !== index));
    setDisplayInstructions(prev => prev.filter((_, i) => i !== index));
    // Update reference images map - shift indices down
    setInstructionReferenceImages(prev => {
      const newMap = new Map<number, string[]>();
      prev.forEach((urls, i) => {
        if (i < index) {
          newMap.set(i, urls);
        } else if (i > index) {
          newMap.set(i - 1, urls);
        }
        // Skip the removed index
      });
      return newMap;
    });
  }, []);

  const handleRunBatch = useCallback((imageSize: '1K' | '2K' | '4K' = '1K', aspectRatio?: string | null, customWidth?: number, customHeight?: number, pendingInstruction?: string, isResizeOnly?: boolean) => {
    if (inputs.length === 0) return;

    // AUTH GATE: If auth is configured and user is not logged in, show auth modal
    // Skip for resize-only (free) jobs
    if (authConfigured && !user && !isResizeOnly) {
      setAuthModalOpen(true);
      return;
    }

    // Check if user has enough tokens (rough estimate: ~1500 tokens per image)
    // Skip for resize-only (free) jobs
    if (authConfigured && profile && !isResizeOnly) {
      const estimatedTokens = inputs.length * 1500;
      if (profile.tokens_remaining < estimatedTokens) {
        alert(`Not enough tokens! You need ~${estimatedTokens.toLocaleString()} tokens but only have ${profile.tokens_remaining.toLocaleString()} remaining.`);
        return;
      }
    }

    // Check if we have instructions for image inputs - use pending instruction if state hasn't updated yet
    // Skip this check for resize-only jobs (they don't need instructions)
    const effectiveInstructions = pendingInstruction
      ? [...instructions, pendingInstruction]
      : instructions;
    const hasImages = inputs.some(input => input.type === 'image');
    if (hasImages && effectiveInstructions.length === 0 && !isResizeOnly) return;

    // Combine all global instructions
    const globalInstruction = effectiveInstructions.join('. ');

    // Collect all reference images from all instructions
    const allReferenceImageUrls: string[] = [];
    instructionReferenceImages.forEach((urls) => {
      allReferenceImageUrls.push(...urls);
    });

    // Generate a batch ID to group all items from this run
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let newItems;

    if (processingMode === 'singleJob') {
      // Single Job mode: combine all inputs into one composite work item
      // Gather all text prompts to include in the instruction
      const textPrompts = inputs
        .filter((input): input is BaseInputItem & { type: 'text' } => input.type === 'text')
        .map(input => input.prompt);

      // Build the final instruction: text prompts + global instructions
      const allInstructions = [...textPrompts, globalInstruction].filter(Boolean);
      const finalInstruction = allInstructions.join('. ');

      // Create composite input with all items (inputs are already BaseInputItem[])
      const compositeInput: InputItem = {
        type: 'composite',
        items: inputs, // Already BaseInputItem[]
        id: `composite-${Date.now()}`,
      };

      newItems = [{
        input: compositeInput,
        instruction: finalInstruction,
        referenceImageUrls: allReferenceImageUrls.length > 0 ? allReferenceImageUrls : undefined,
        imageSize,
        aspectRatio: aspectRatio || undefined,
        customWidth,
        customHeight,
        batchId,
        presetLabel: instructionPresetInfo?.label,
        presetIcon: instructionPresetInfo?.icon ?? undefined,
      }];
    } else {
      // Batch mode: create work items for each input separately
      newItems = inputs.map(input => {
        let finalInstruction: string;

        if (isResizeOnly) {
          // For resize-only jobs, use a simple descriptor
          finalInstruction = 'Local resize';
        } else if (input.type === 'text') {
          // For text prompts: combine the prompt text with global instructions
          finalInstruction = globalInstruction
            ? `${input.prompt}. ${globalInstruction}`
            : input.prompt;
        } else {
          // For images: just use global instructions
          finalInstruction = globalInstruction;
        }

        return {
          input,
          instruction: finalInstruction,
          referenceImageUrls: isResizeOnly ? undefined : (allReferenceImageUrls.length > 0 ? allReferenceImageUrls : undefined),
          imageSize,
          aspectRatio: aspectRatio || undefined,
          customWidth,
          customHeight,
          batchId,
          presetLabel: isResizeOnly ? undefined : instructionPresetInfo?.label,
          presetIcon: isResizeOnly ? undefined : (instructionPresetInfo?.icon ?? undefined),
          resizeOnly: isResizeOnly,
        };
      });
    }

    batchProcessor.addItems(newItems);
    batchProcessor.start();
    setIsProcessing(true);
    setBatchStartTime(Date.now());

    // On mobile, jump to results view when starting a job
    setActiveTab('results');
  }, [inputs, instructions, instructionReferenceImages, instructionPresetInfo, batchProcessor, processingMode, authConfigured, user, profile]);

  // Handle cancel job - stops processing, clears results, keeps inputs
  const handleCancelJob = useCallback(() => {
    // Stop the batch processor (aborts in-flight requests)
    batchProcessor.stop();

    // Clear processing state
    setIsProcessing(false);
    setBatchStartTime(null);

    // Clear results but keep inputs
    setWorkItems([]);
    setDisplayInstructions([]);
    setInstructions([]);
    setTotalElapsed(0);
    setTotalTokens(0);

    // Switch back to tasks/chat view
    setActiveTab('tasks');

    // Close the confirm modal
    setShowCancelConfirm(false);

    console.log('Job cancelled by user');
  }, [batchProcessor]);

  // Check if processing is complete
  useEffect(() => {
    if (!isProcessing) return;

    // Throttled status log every 5 seconds
    const now = Date.now();
    if (now - lastPollLogRef.current >= 5000) {
      const statusCounts = workItems.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log('Processing status:', statusCounts);
      lastPollLogRef.current = now;
    }

    const allDone = workItems.every(
      item => item.status === 'completed' || item.status === 'failed'
    );

    if (allDone && workItems.length > 0) {
      console.log('Job complete!');
      
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

      // Refresh profile to get updated token balance
      if (authConfigured) {
        refreshProfile();
      }
    }
  }, [workItems, isProcessing, batchStartTime, authConfigured, refreshProfile]);

  // Collect downloadable images for the modal
  const downloadableImages = React.useMemo((): DownloadImage[] => {
    const images: DownloadImage[] = [];
    workItems
      .filter((item) => item.status === 'completed' && item.result?.images)
      .forEach((item, itemIndex) => {
        const baseName =
          item.input.type === 'image'
            ? (item.input.displayName || item.input.file.name).split('.')[0]
            : item.input.type === 'composite'
            ? 'combined_job'
            : `text_prompt_${itemIndex + 1}`;

        item.result!.images.forEach((base64, variantIndex) => {
          images.push({
            id: `${item.id}-${variantIndex}`,
            base64,
            originalFilename: `${baseName}_peel${item.result!.images.length > 1 ? `_v${variantIndex + 1}` : ''}`,
          });
        });
      });
    return images;
  }, [workItems]);

  const handleDownloadAll = () => {
    setDownloadModalOpen(true);
  };

  const hasResults = workItems.some(item => item.status === 'completed');

  const handleOpenLightbox = useCallback((_images: string[], _index: number, title: string) => {
    // Collect ALL images from ALL completed work items
    const allImages: string[] = [];
    const allOriginalImages: string[] = [];
    const imageToItemIdMap = new Map<number, string>();
    let clickedImageGlobalIndex = 0;
    let foundClickedImage = false;

    workItems.forEach((item) => {
      if (item.status === 'completed' && item.result?.images) {
        const itemTitle = getInputDisplayName(item.input);
        // For composite inputs, get the first image's original; for regular images, use the input's original
        let originalImage = '';
        if (item.input.type === 'image') {
          originalImage = inputToBase64Map.get(item.input.id) || '';
        } else if (item.input.type === 'composite') {
          const firstImage = item.input.items.find(i => i.type === 'image');
          if (firstImage && firstImage.type === 'image') {
            originalImage = inputToBase64Map.get(firstImage.id) || '';
          }
        }
        item.result.images.forEach((image) => {
          if (itemTitle === title && !foundClickedImage) {
            clickedImageGlobalIndex = allImages.length;
            foundClickedImage = true;
          }
          // Map this image index to its work item ID
          imageToItemIdMap.set(allImages.length, item.id);
          allImages.push(image);
          allOriginalImages.push(originalImage);
        });
      }
    });

    setLightboxImages(allImages);
    setLightboxOriginalImages(allOriginalImages);
    setLightboxImageToItemId(imageToItemIdMap);
    setLightboxIndex(clickedImageGlobalIndex);
    setLightboxTitle(`All Results (${allImages.length} images)`);
    setLightboxOpen(true);
  }, [workItems, inputToBase64Map]);

  const handleCloseLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  // Lightbox action handlers
  const handleLightboxDownload = useCallback((imageData: string, index: number) => {
    const blob = base64ToBlob(imageData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited_image_${index + 1}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleLightboxCopy = useCallback(async (imageData: string): Promise<boolean> => {
    try {
      const blob = base64ToBlob(imageData);
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      return true;
    } catch (err) {
      console.error('Failed to copy image:', err);
      return false;
    }
  }, []);

  // Update lightbox images reactively when new images come in while lightbox is open
  useEffect(() => {
    if (!lightboxOpen) return;

    // Recollect all images from completed work items
    const allImages: string[] = [];
    const allOriginalImages: string[] = [];
    const imageToItemIdMap = new Map<number, string>();

    workItems.forEach(item => {
      if (item.status === 'completed' && item.result?.images && item.result.images.length > 0) {
        // Get original image for this item
        let originalImage = '';
        if (item.input.type === 'image') {
          originalImage = inputToBase64Map.get(item.input.file.name) || '';
        } else if (item.input.type === 'composite') {
          const imageItem = item.input.items.find(i => i.type === 'image');
          if (imageItem && imageItem.type === 'image') {
            originalImage = inputToBase64Map.get(imageItem.file.name) || '';
          }
        }

        item.result.images.forEach(img => {
          imageToItemIdMap.set(allImages.length, item.id);
          allImages.push(img);
          allOriginalImages.push(originalImage);
        });
      }
    });

    // Update the images if they've changed
    if (allImages.length !== lightboxImages.length) {
      setLightboxImages(allImages);
      setLightboxOriginalImages(allOriginalImages);
      setLightboxImageToItemId(imageToItemIdMap);
      setLightboxTitle(`All Results (${allImages.length} images)`);
    }
  }, [lightboxOpen, workItems, inputToBase64Map, lightboxImages.length]);

  return (
    <div className="h-[var(--vh-full)] flex flex-col bg-surface dark:bg-surface-dark overflow-hidden">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-700/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm p-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/peel.svg" alt="Peel" className="size-7 md:size-8 dark:invert" />
            <h1 className="text-xl md:text-2xl font-medium font-display tracking-tight">Peel</h1>
            {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <span className="bg-yellow-400 text-black text-2xs px-1.5 py-0.5 rounded font-mono font-bold">
                DEV
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {/* Auth section */}
            {authConfigured ? (
              <div className="flex items-center gap-2">
                {authLoading ? (
                  // Show loading state while checking auth
                  <button
                    disabled
                    className="btn-secondary text-sm opacity-50"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span className="animate-pulse">.</span>
                      <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>.</span>
                      <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>.</span>
                    </span>
                  </button>
                ) : user ? (
                  <>
                    {/* Token pill */}
                    <button
                      onClick={() => {
                        playBlip();
                        setAccountModalOpen(true);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 shadow-soft ${
                        tokenAnimation?.isAnimating
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 ring-2 ring-emerald-400 dark:ring-emerald-500 animate-pulse'
                          : 'bg-neon/15 hover:bg-neon/25'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" fill="currentColor" className={`w-3.5 h-3.5 ${tokenAnimation?.isAnimating ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}`}>
                        <path d="m600 24c-317.61 0-576 258.39-576 576s258.39 576 576 576 576-258.39 576-576-258.39-576-576-576zm-246.07 567.52 237.59-237.59c3.0586-3.0469 6.6367-3.5039 8.4844-3.5039s5.4258 0.45703 8.4844 3.5039l237.59 237.6c3.0586 3.0469 3.5156 6.625 3.5156 8.4844s-0.45703 5.4258-3.5156 8.4844l-237.59 237.57c-3.0586 3.0469-6.6367 3.5039-8.4844 3.5039s-5.4258-0.45703-8.4844-3.5039l-237.59-237.6c-3.0586-3.0469-3.5156-6.625-3.5156-8.4844 0-1.8555 0.45703-5.4102 3.5195-8.4688z"/>
                      </svg>
                      <span className={`text-sm font-semibold tabular-nums ${tokenAnimation?.isAnimating ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-500'}`}>
                        {tokenAnimation?.isAnimating
                          ? formatTokenCount(animatedTokenCount)
                          : formatTokenCount(profile?.tokens_remaining || 0)
                        }
                      </span>
                      {tokenAnimation?.isAnimating && (
                        <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">+{formatTokenCount(tokenAnimation.to - tokenAnimation.from)}</span>
                      )}
                    </button>
                    {/* Menu hamburger */}
                    <button
                      onClick={() => {
                        playBlip();
                        setAccountModalOpen(true);
                      }}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded-xl"
                      aria-label="Account menu"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-600 dark:text-slate-400">
                        <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5A.75.75 0 0 1 2.75 9h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 9.75Zm0 5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        playBlip();
                        setAuthModalOpen(true);
                      }}
                      className="btn-secondary text-sm"
                    >
                      Get Started
                    </button>
                    {/* Menu hamburger for guests */}
                    <button
                      onClick={() => {
                        playBlip();
                        setAccountModalOpen(true);
                      }}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded-xl"
                      aria-label="Settings menu"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-600 dark:text-slate-400">
                        <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5A.75.75 0 0 1 2.75 9h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 9.75Zm0 5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* Menu hamburger for when auth is not configured */
              <button
                onClick={() => {
                  playBlip();
                  setAccountModalOpen(true);
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded-xl"
                aria-label="Settings menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-600 dark:text-slate-400">
                  <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5A.75.75 0 0 1 2.75 9h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 9.75Zm0 5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 pb-[calc(var(--tab-bar-height)+var(--safe-area-bottom))] md:pb-0 bg-slate-50/50 dark:bg-slate-900/50">
        {/* Left: Input Panel */}
        <div className={`border-r-0 md:border-r border-slate-200 dark:border-slate-700/50 p-4 flex flex-col overflow-hidden bg-white dark:bg-surface-dark ${activeTab === 'input' ? 'block' : 'hidden'} md:block`}>
          <InputPanel
            onFilesAdded={handleFilesAdded}
            onPromptsAdded={handlePromptsAdded}
            inputs={inputs}
            loadingInputIds={loadingInputIds}
            onRemoveInput={handleRemoveInput}
            onClearAll={handleClearAll}
            processingMode={processingMode}
            onProcessingModeChange={setProcessingMode}
            onUpdateDisplayName={handleUpdateDisplayName}
          />
        </div>

        {/* Middle: Tasks/Progress */}
        <div className={`border-r-0 md:border-r border-slate-200 dark:border-slate-700/50 p-4 flex flex-col overflow-hidden bg-white dark:bg-surface-dark ${activeTab === 'tasks' ? 'block' : 'hidden'} md:block`}>
          {isProcessing || workItems.length > 0 ? (
            // Show progress/stats during and after processing
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold font-display">Progress</h2>
                {!isProcessing && workItems.length > 0 && (
                  <button
                    onClick={() => {
                      playBlip();
                      setWorkItems([]);
                      setDisplayInstructions([]);
                      setInstructions([]);
                      setTotalElapsed(0);
                      setTotalTokens(0);
                    }}
                    className="btn-secondary text-sm py-1.5"
                  >
                    Try Again
                  </button>
                )}
              </div>
              <div className="space-y-4 flex-1">
                <ProgressBar items={workItems} />
                <Timer
                  startTime={batchStartTime}
                  isRunning={isProcessing}
                  totalElapsed={totalElapsed}
                  totalTokens={totalTokens}
                  hourlyRate={profile?.hourly_rate}
                  hasCompletedWork={workItems.some(item => item.status === 'completed' || item.status === 'failed')}
                  workItems={workItems}
                />

                {displayInstructions.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Completed Tasks</div>
                    <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                      {displayInstructions.map((instruction, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <span className="text-emerald-500 mt-0.5">✓</span>
                          <span>{instruction}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-center space-y-1">
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{workItems.filter(i => i.status === 'completed').length}</span> of {workItems.length} completed
                  </div>
                  {workItems.filter(i => i.status === 'processing').length > 0 && (
                    <div className="text-sm text-amber-600 dark:text-amber-400">
                      {workItems.filter(i => i.status === 'processing').length} processing...
                    </div>
                  )}
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 italic">
                    Peel says "Have a nice day!"
                  </p>
                </div>
              </div>
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
                canRunBatch={
                  inputs.length > 0 &&
                  !isProcessing &&
                  // Either all text prompts, or has instructions for images
                  (inputs.every(i => i.type === 'text') || instructions.length > 0)
                }
                instructions={displayInstructions}
                onClearInstructions={handleClearInstructions}
                onRemoveInstruction={handleRemoveInstruction}
                inputs={inputs}
                processingMode={processingMode}
              />
            </>
          )}
        </div>

        {/* Right: Results */}
        <div className={`p-4 flex flex-col overflow-hidden bg-white dark:bg-surface-dark ${activeTab === 'results' ? 'block' : 'hidden'} md:block`}>
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h2 className="text-lg font-semibold font-display">Results</h2>
            <div className="flex items-center gap-3">
              {isProcessing && (
                <button
                  onClick={() => {
                    playBlip();
                    setShowCancelConfirm(true);
                  }}
                  className="text-sm font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                >
                  Cancel
                </button>
              )}
              {!isProcessing && workItems.length > 0 && (
                <button
                  onClick={() => {
                    playBlip();
                    handleClearResults();
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                >
                  Clear all
                </button>
              )}
              {hasResults && (
                <button
                  onClick={() => {
                    playBlip();
                    handleDownloadAll();
                  }}
                  className="btn-secondary text-sm py-1.5"
                >
                  Download All
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto h-full">
            {workItems.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" className="text-slate-400 dark:text-slate-500" fill="currentColor">
                      <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z"/>
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Awaiting results</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {workItems.map((item) => {
                  // Get original image for comparison
                  let originalImage = '';
                  if (item.input.type === 'image') {
                    originalImage = inputToBase64Map.get(item.input.id) || '';
                  } else if (item.input.type === 'composite') {
                    const firstImage = item.input.items.find(i => i.type === 'image');
                    if (firstImage && firstImage.type === 'image') {
                      originalImage = inputToBase64Map.get(firstImage.id) || '';
                    }
                  }
                  return (
                    <ResultCard
                      key={item.id}
                      item={item}
                      originalImage={originalImage}
                      onOpenLightbox={handleOpenLightbox}
                      onRetry={handleRedoItem}
                      hourlyRate={profile?.hourly_rate}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-slate-200 dark:border-slate-700/50" style={{ paddingBottom: 'var(--safe-area-bottom)' }}>
        <div className="grid grid-cols-3 h-[var(--tab-bar-height)]">
          <button
            onClick={() => {
              playClick();
              setActiveTab('input');
            }}
            className={`text-xs font-medium flex flex-col items-center justify-center transition-all duration-200 ${
              activeTab === 'input'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <div className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 ${activeTab === 'input' ? 'bg-neon/20' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" height="22px" viewBox="0 -960 960 960" width="22px" fill="currentColor">
                <path d="M440-440v-80h80v80h-80Zm-80 80v-80h80v80h-80Zm160 0v-80h80v80h-80Zm80-80v-80h80v80h-80Zm-320 0v-80h80v80h-80Zm-80 320q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm80-80h80v-80h-80v80Zm160 0h80v-80h-80v80Zm320 0v-80 80Zm-560-80h80v-80h80v80h80v-80h80v80h80v-80h80v80h80v-80h-80v-80h80v-320H200v320h80v80h-80v80Zm0 80v-560 560Zm560-240v80-80ZM600-280v80h80v-80h-80Z"/>
              </svg>
              <span>Upload</span>
            </div>
          </button>
          <button
            onClick={() => {
              playClick();
              setActiveTab('tasks');
            }}
            className={`text-xs font-medium flex flex-col items-center justify-center transition-all duration-200 ${
              activeTab === 'tasks'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <div className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 ${activeTab === 'tasks' ? 'bg-neon/20' : ''}`}>
              <img src="/peel.svg" alt="" className={`w-[22px] h-[22px] ${activeTab === 'tasks' ? '' : 'opacity-60'} dark:invert`} />
              <span>Tasks</span>
            </div>
          </button>
          <button
            onClick={() => {
              playClick();
              setActiveTab('results');
            }}
            className={`text-xs font-medium flex flex-col items-center justify-center transition-all duration-200 ${
              activeTab === 'results'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <div className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 ${activeTab === 'results' ? 'bg-neon/20' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" height="22px" viewBox="0 -960 960 960" width="22px" fill="currentColor">
                <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-120H640q-30 38-71.5 59T480-240q-47 0-88.5-21T320-320H200v120Zm280-120q38 0 69-22t43-58h168v-360H200v360h168q12 36 43 58t69 22ZM200-200h560-560Z"/>
              </svg>
              <span>Output</span>
            </div>
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
        onDownload={handleLightboxDownload}
        onCopy={handleLightboxCopy}
        onRedo={handleRedoItem}
        imageToItemId={lightboxImageToItemId}
      />
      
      <IntroModal
        isOpen={introModalOpen}
        onClose={() => setIntroModalOpen(false)}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthError(null);
        }}
        error={authError}
      />

      <AccountModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        profile={profile}
        jobLogs={jobLogs}
        email={profile?.email || user?.email || ''}
        onSignOut={signOut}
        onRefreshJobLogs={refreshJobLogs}
      />

      <RedoModal
        isOpen={redoModalItem !== null}
        onClose={() => setRedoModalItem(null)}
        item={redoModalItem}
        originalImage={(() => {
          if (!redoModalItem) return '';
          if (redoModalItem.input.type === 'image') {
            return inputToBase64Map.get(redoModalItem.input.id) || '';
          } else if (redoModalItem.input.type === 'composite') {
            const firstImage = redoModalItem.input.items.find(i => i.type === 'image');
            if (firstImage && firstImage.type === 'image') {
              return inputToBase64Map.get(firstImage.id) || '';
            }
          }
          return '';
        })()}
        onSubmit={handleRedoModalSubmit}
      />

      {/* Cancel Job Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-elevated max-w-sm w-full p-5 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 dark:text-red-400" style={{ fontSize: '20px' }}>cancel_presentation</span>
              </div>
              <h3 className="text-lg font-semibold font-display">Cancel Job?</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
              This will stop the current job and clear all results. Your input images will be kept. Any images already processed won't be charged.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  playBlip();
                  handleCancelJob();
                }}
                className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors"
              >
                Yes, Cancel Job
              </button>
              <button
                onClick={() => {
                  playBlip();
                  setShowCancelConfirm(false);
                }}
                className="flex-1 py-2.5 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition-colors"
              >
                Keep Running
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Error Modal */}
      {importError && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-elevated max-w-md w-full p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-amber-600 dark:text-amber-400">
                  <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold font-display">Couldn't Import Image</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              {importError.includes('too large')
                ? 'This image is too large to import directly (max 4MB). Please save the image to your device first, then drag and drop or browse to add it.'
                : importError
              }
            </p>
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 mb-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">To add this image:</p>
              <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-decimal list-inside">
                <li>Right-click the original image and save it</li>
                <li>Drag & drop or browse to upload here</li>
              </ol>
            </div>
            <button
              onClick={() => {
                playBlip();
                setImportError(null);
              }}
              className="btn-primary w-full"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Download Modal */}
      <DownloadModal
        isOpen={downloadModalOpen}
        images={downloadableImages}
        onClose={() => setDownloadModalOpen(false)}
      />
    </div>
  );
}

export default App;
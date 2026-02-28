// Edge Function - no timeout waiting for upstream services
// Runs in Deno, not Node.js
// Path: /api/process-image-v2

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Types
interface Context {
  geo?: { city?: string; country?: { code?: string } };
}

// Constants
const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_INSTRUCTION_LENGTH = 10000;

// Gateway detection helpers
function getGatewayType(model: string | undefined): string {
  if (model?.startsWith('byo/')) return 'byo';
  if (model?.startsWith('netlify/')) return 'netlify';
  if (model?.startsWith('direct/')) return 'direct';
  return 'vercel'; // default
}

// Check if model is an Imagen model (text-to-image only)
function isImagenModel(model: string | undefined): boolean {
  const stripped = (model || '').replace(/^(byo|netlify|direct|google)\//, '');
  return stripped.startsWith('imagen-');
}

function getActualModelId(model: string | undefined, gatewayType: string): string {
  let actualModel = model || 'gemini-3-pro-image';

  // Strip gateway prefix
  if (actualModel.startsWith('byo/')) actualModel = actualModel.replace('byo/', '');
  else if (actualModel.startsWith('netlify/')) actualModel = actualModel.replace('netlify/', '');
  else if (actualModel.startsWith('direct/')) actualModel = actualModel.replace('direct/', '');
  else if (actualModel.startsWith('google/')) actualModel = actualModel.replace('google/', '');

  // Map model names for non-Vercel gateways
  if (gatewayType !== 'vercel') {
    if (actualModel === 'gemini-3-pro-image') {
      actualModel = 'gemini-3-pro-image-preview';
    }
    if (actualModel === 'gemini-3.1-flash-image') {
      actualModel = 'gemini-3.1-flash-image-preview';
    }
  }

  return actualModel;
}

// Helper to log job to Supabase
async function logJob(supabase: SupabaseClient, params: Record<string, unknown>) {
  try {
    const { data, error } = await supabase.rpc('log_job', {
      p_user_id: params.userId,
      p_request_id: params.requestId || `auto-${Date.now()}`,
      p_mode: params.mode || 'batch',
      p_image_size: params.imageSize || '1K',
      p_model: params.model,
      p_images_submitted: params.imagesSubmitted || 0,
      p_instruction_length: params.instructionLength || 0,
      p_total_input_bytes: params.totalInputBytes || 0,
      p_images_returned: params.imagesReturned || 0,
      p_prompt_tokens: params.promptTokens || null,
      p_completion_tokens: params.completionTokens || null,
      p_total_tokens: params.totalTokens || null,
      p_elapsed_ms: params.elapsedMs || 0,
      p_status: params.status,
      p_error_code: params.errorCode || null,
      p_error_message: params.errorMessage?.toString().substring(0, 500) || null,
      p_tokens_charged: params.tokensCharged || null,
      p_token_balance_before: params.tokenBalanceBefore || null,
      p_token_balance_after: params.tokenBalanceAfter || null,
      p_batch_id: params.batchId || null,
    });

    if (error) {
      console.error('Job logging error:', error.message, error.details, error.hint);
    } else {
      console.log('Job logged successfully:', data);
    }
  } catch (err) {
    console.error('Job logging failed:', err);
  }
}

// Humanize error responses from AI gateways
function humanizeError(status: number, rawBody: string): string {
  let message = rawBody || '';
  try {
    const parsed = JSON.parse(message);
    if (parsed?.error?.message) message = parsed.error.message;
    else if (parsed?.error && typeof parsed.error === 'string') message = parsed.error;
  } catch { /* not JSON, use as-is */ }

  if (status === 503) return 'Model busy — try again';
  if (status === 429) return 'Rate limited — try again later';
  if (status === 504) return 'Request timed out';
  if (status >= 500) return 'Server error — please retry';

  const lower = message.toLowerCase();
  if (lower.includes('high demand') || lower.includes('overloaded')) return 'Model busy — try again';
  if (lower.includes('safety') || lower.includes('blocked')) return 'Content blocked by safety filter';
  if (lower.includes('timeout') || lower.includes('timed out')) return 'Request timed out';

  if (message.length > 100) return message.substring(0, 100) + '...';
  return message || 'Unknown error';
}

// CORS helper
function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  };

  if (origin) {
    // Allow Netlify deploys and localhost
    const isAllowed = origin.includes('netlify.app') ||
                      origin.includes('localhost') ||
                      origin === Deno.env.get('URL');
    if (isAllowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    }
  }

  return headers;
}

export default async function handler(request: Request, _context: Context) {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: corsHeaders }
    );
  }

  // Environment variables
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY');
  const AI_GATEWAY_API_KEY = Deno.env.get('AI_GATEWAY_API_KEY');
  const AI_GATEWAY_BASE_URL = Deno.env.get('AI_GATEWAY_BASE_URL') || 'https://ai-gateway.vercel.sh/v1';
  const GOOGLE_DIRECT_KEY = Deno.env.get('GOOGLE_DIRECT_API_KEY') || Deno.env.get('GEMINI_API_KEY');
  const IMAGE_MODEL_ID = Deno.env.get('IMAGE_MODEL_ID') || 'google/gemini-3-pro-image';

  // Check Supabase configuration
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('SECURITY ERROR: Supabase not configured');
    return new Response(
      JSON.stringify({ error: 'Service temporarily unavailable' }),
      { status: 503, headers: corsHeaders }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // AUTH: Verify user authentication
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Authentication required. Please sign in.' }),
      { status: 401, headers: corsHeaders }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  let userId: string | null = null;
  let userProfile: { tokens_remaining: number; gemini_api_key?: string } | null = null;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session. Please sign in again.' }),
        { status: 401, headers: corsHeaders }
      );
    }

    userId = user.id;

    // Get user's token balance and BYO API key
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tokens_remaining, gemini_api_key')
      .eq('id', userId)
      .single();

    if (profileError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { status: 500, headers: corsHeaders }
      );
    }

    userProfile = profile;

    // Check token balance
    if (!profile || profile.tokens_remaining < 500) {
      // Log insufficient tokens error
      await logJob(supabase, {
        userId,
        requestId: `insufficient-${Date.now()}`,
        mode: 'batch',
        imageSize: '1K',
        model: 'unknown',
        imagesSubmitted: 0,
        instructionLength: 0,
        totalInputBytes: 0,
        imagesReturned: 0,
        elapsedMs: 0,
        status: 'error',
        errorCode: '402',
        errorMessage: 'Insufficient tokens',
        tokenBalanceBefore: profile?.tokens_remaining || 0,
        tokenBalanceAfter: profile?.tokens_remaining || 0,
      });

      return new Response(
        JSON.stringify({
          error: 'Insufficient tokens',
          tokens_remaining: profile?.tokens_remaining || 0,
          message: 'You have run out of tokens. Please contact support for more.'
        }),
        { status: 402, headers: corsHeaders }
      );
    }
  } catch (err) {
    console.error('Auth verification failed:', err);
    return new Response(
      JSON.stringify({ error: 'Authentication failed' }),
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const body = await request.json();
    const {
      image,
      images,
      referenceImages,
      instruction,
      model = IMAGE_MODEL_ID,
      stream = false,
      imageSize = '1K',
      aspectRatio = null,
      mode = 'batch',
      batchId,
      requestId,
    } = body;

    // Validate instruction
    if (!instruction) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: instruction' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (typeof instruction !== 'string' || instruction.length > MAX_INSTRUCTION_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Instruction must be max ${MAX_INSTRUCTION_LENGTH} characters` }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Get all images
    const allImages: string[] = images || (image ? [image] : []);
    const refImages: string[] = referenceImages || [];

    // Validate image sizes
    for (let i = 0; i < allImages.length; i++) {
      const img = allImages[i];
      if (img.length * 0.75 > MAX_IMAGE_SIZE) {
        return new Response(
          JSON.stringify({ error: `Image ${i + 1} too large. Maximum: 4MB` }),
          { status: 400, headers: corsHeaders }
        );
      }
    }

    for (let i = 0; i < refImages.length; i++) {
      const img = refImages[i];
      if (img.length * 0.75 > MAX_IMAGE_SIZE) {
        return new Response(
          JSON.stringify({ error: `Reference image ${i + 1} too large. Maximum: 4MB` }),
          { status: 400, headers: corsHeaders }
        );
      }
    }

    const startTime = Date.now();
    const gatewayType = getGatewayType(model);
    const actualModel = getActualModelId(model, gatewayType);
    const userByoKey = userProfile?.gemini_api_key;

    // Check API key for gateway
    if (gatewayType === 'byo' && !userByoKey) {
      return new Response(
        JSON.stringify({ error: 'No API key configured. Add your key in settings.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (gatewayType === 'vercel' && !AI_GATEWAY_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Vercel AI Gateway API key not configured' }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (gatewayType === 'direct' && !GOOGLE_DIRECT_KEY) {
      return new Response(
        JSON.stringify({ error: 'Google Direct API key not configured' }),
        { status: 500, headers: corsHeaders }
      );
    }

    console.log('Edge Function request:', {
      gateway: gatewayType,
      model: actualModel,
      imageCount: allImages.length,
      refCount: refImages.length,
      instructionLength: instruction.length,
    });

    // ========== IMAGEN (text-to-image only) via REST :predict endpoint ==========
    if ((gatewayType === 'byo' || gatewayType === 'direct') && isImagenModel(model)) {
      // Imagen is text-to-image only — reject if images were sent
      if (allImages.length > 0) {
        return new Response(
          JSON.stringify({ error: 'Imagen models are text-to-image only. Remove uploaded images or switch to a Gemini model.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const apiKey = gatewayType === 'byo' ? userByoKey : GOOGLE_DIRECT_KEY;

      const imagenParams: Record<string, unknown> = { sampleCount: 1 };
      if (aspectRatio) {
        imagenParams.aspectRatio = aspectRatio;
      }

      const imagenEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:predict`;
      const imagenBody = {
        instances: [{ prompt: instruction }],
        parameters: imagenParams,
      };

      console.log('Calling Imagen :predict', { model: actualModel, aspectRatio });

      const imagenController = new AbortController();
      const imagenTimeoutId = setTimeout(() => imagenController.abort(), 30000);

      let imagenResponse: Response;
      try {
        imagenResponse = await fetch(imagenEndpoint, {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(imagenBody),
          signal: imagenController.signal,
        });
        clearTimeout(imagenTimeoutId);
      } catch (fetchError) {
        clearTimeout(imagenTimeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          const timeoutElapsed = Date.now() - startTime;
          logJob(supabase, {
            userId, requestId, batchId, mode, imageSize, model,
            imagesSubmitted: 0, instructionLength: instruction.length,
            totalInputBytes: 0, imagesReturned: 0, elapsedMs: timeoutElapsed,
            status: 'error', errorCode: 'TIMEOUT',
            errorMessage: 'Imagen request timed out after 30 seconds',
            tokenBalanceBefore: userProfile?.tokens_remaining,
            tokenBalanceAfter: userProfile?.tokens_remaining,
          }).catch(() => {});

          return new Response(
            JSON.stringify({ error: 'Request timed out. The AI service is busy - please retry.', retryable: true }),
            { status: 504, headers: corsHeaders }
          );
        }
        throw fetchError;
      }

      if (!imagenResponse.ok) {
        const errorText = await imagenResponse.text();
        console.error('Imagen API error:', imagenResponse.status, errorText);

        const errorElapsed = Date.now() - startTime;
        await logJob(supabase, {
          userId, requestId, batchId, mode, imageSize, model,
          imagesSubmitted: 0, instructionLength: instruction.length,
          totalInputBytes: 0, imagesReturned: 0, elapsedMs: errorElapsed,
          status: 'error', errorCode: String(imagenResponse.status),
          errorMessage: errorText,
          tokenBalanceBefore: userProfile?.tokens_remaining,
          tokenBalanceAfter: userProfile?.tokens_remaining,
        });

        return new Response(
          JSON.stringify({ error: humanizeError(imagenResponse.status, errorText), retryable: imagenResponse.status >= 500 }),
          { status: imagenResponse.status, headers: corsHeaders }
        );
      }

      const imagenResult = await imagenResponse.json();
      const elapsed = Date.now() - startTime;

      // Extract images from :predict response
      const generatedImages: string[] = (imagenResult.predictions || [])
        .map((pred: { bytesBase64Encoded?: string }) =>
          pred.bytesBase64Encoded ? `data:image/png;base64,${pred.bytesBase64Encoded}` : null
        )
        .filter(Boolean);

      const tokensUsed = 1500; // Flat estimate — Imagen doesn't return usage
      const noImagesReturned = generatedImages.length === 0;
      const jobStatus = noImagesReturned ? 'warning' : 'success';
      const tokensCharged = (gatewayType === 'byo' || noImagesReturned) ? 0 : tokensUsed;

      let newTokenBalance = userProfile?.tokens_remaining || null;
      if (userId && gatewayType !== 'byo' && !noImagesReturned) {
        try {
          const { data: updateResult } = await supabase.rpc('deduct_tokens', {
            user_id: userId, amount: tokensUsed
          });
          if (updateResult && updateResult[0]) {
            newTokenBalance = updateResult[0].new_balance;
          }
        } catch (err) {
          console.error('Token deduction failed:', err);
        }
      }

      await logJob(supabase, {
        userId, requestId, batchId, mode, imageSize, model,
        imagesSubmitted: 0, instructionLength: instruction.length,
        totalInputBytes: 0, imagesReturned: generatedImages.length,
        promptTokens: 0, completionTokens: 0, totalTokens: tokensUsed,
        elapsedMs: elapsed, status: jobStatus,
        errorCode: noImagesReturned ? 'NO_IMAGES' : null,
        errorMessage: noImagesReturned ? 'Imagen returned no images' : null,
        tokensCharged,
        tokenBalanceBefore: userProfile?.tokens_remaining,
        tokenBalanceAfter: newTokenBalance,
      });

      return new Response(
        JSON.stringify({
          images: generatedImages,
          content: '',
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: tokensUsed },
          elapsed, model: actualModel, imageSize,
          tokens_remaining: newTokenBalance, gateway: gatewayType,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    let endpoint: string;
    let requestHeaders: Record<string, string>;
    let requestBody: unknown;

    if (gatewayType === 'byo' || gatewayType === 'direct') {
      // Google GenAI format
      const apiKey = gatewayType === 'byo' ? userByoKey : GOOGLE_DIRECT_KEY;
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent`;
      requestHeaders = {
        'x-goog-api-key': apiKey!,
        'Content-Type': 'application/json',
      };

      const parts: unknown[] = [{ text: instruction }];
      for (const img of allImages) {
        const match = img.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      }
      for (const img of refImages) {
        const match = img.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      }

      requestBody = {
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          ...(aspectRatio && { aspectRatio }),
        },
      };
    } else {
      // Vercel AI Gateway (OpenAI-compatible format)
      endpoint = `${AI_GATEWAY_BASE_URL}/chat/completions`;
      requestHeaders = {
        'Authorization': `Bearer ${AI_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
      };

      const messageContent: unknown[] = [{ type: 'text', text: instruction }];
      for (const img of allImages) {
        messageContent.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
      }
      for (const img of refImages) {
        messageContent.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
      }

      const imageConfig: Record<string, string> = {};
      if (imageSize && ['1K', '2K', '4K'].includes(imageSize)) {
        imageConfig.imageSize = imageSize;
      }
      if (aspectRatio) {
        imageConfig.aspectRatio = aspectRatio;
      }

      requestBody = {
        model: actualModel,
        messages: [{ role: 'user', content: messageContent }],
        stream,
        modalities: ['text', 'image'],
        ...(Object.keys(imageConfig).length > 0 && {
          generationConfig: { imageConfig }
        }),
      };
    }

    // Call AI Gateway with our own timeout (30s) to gracefully handle slow responses
    // before Netlify's platform timeout (~36s) kills the function
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // Handle our timeout (before Netlify kills us)
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        const timeoutElapsed = Date.now() - startTime;
        console.error('AI Gateway timeout after', timeoutElapsed, 'ms');

        // Log timeout error (fire-and-forget to avoid blocking)
        logJob(supabase, {
          userId,
          requestId,
          batchId,
          mode,
          imageSize,
          model,
          imagesSubmitted: allImages.length,
          instructionLength: instruction.length,
          totalInputBytes: allImages.reduce((sum, img) => sum + img.length, 0),
          imagesReturned: 0,
          elapsedMs: timeoutElapsed,
          status: 'error',
          errorCode: 'TIMEOUT',
          errorMessage: 'AI Gateway request timed out after 30 seconds',
          tokenBalanceBefore: userProfile?.tokens_remaining,
          tokenBalanceAfter: userProfile?.tokens_remaining,
        }).catch(() => {}); // Ignore logging errors

        return new Response(
          JSON.stringify({
            error: 'Request timed out. The AI service is busy - please retry.',
            retryable: true,
          }),
          { status: 504, headers: corsHeaders }
        );
      }

      // Re-throw other fetch errors
      throw fetchError;
    }

    console.log('AI Gateway response:', {
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);

      const errorElapsed = Date.now() - startTime;
      await logJob(supabase, {
        userId,
        requestId,
        batchId,
        mode,
        imageSize,
        model,
        imagesSubmitted: allImages.length,
        instructionLength: instruction.length,
        totalInputBytes: allImages.reduce((sum, img) => sum + img.length, 0),
        imagesReturned: 0,
        elapsedMs: errorElapsed,
        status: 'error',
        errorCode: String(response.status),
        errorMessage: errorText,
        tokenBalanceBefore: userProfile?.tokens_remaining,
        tokenBalanceAfter: userProfile?.tokens_remaining,
      });

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limited — try again later', retryable: true }),
          { status: 429, headers: corsHeaders }
        );
      }

      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'Authentication failed. Please check your API key.' }),
          { status: 403, headers: corsHeaders }
        );
      }

      if (response.status === 503) {
        return new Response(
          JSON.stringify({ error: 'Model busy — try again', retryable: true }),
          { status: 503, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ error: humanizeError(response.status, errorText), retryable: response.status >= 500 }),
        { status: response.status, headers: corsHeaders }
      );
    }

    const result = await response.json();
    const elapsed = Date.now() - startTime;

    // Extract generated images and content
    let generatedImages: string[] = [];
    let content = '';
    let promptTokens = 0;
    let completionTokens = 0;

    if (gatewayType === 'byo' || gatewayType === 'direct') {
      // Google GenAI response format
      for (const part of result.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          // Strip whitespace/newlines from base64 — Google's API sometimes embeds these
          const cleanData = (part.inlineData.data || '').replace(/\s/g, '');
          generatedImages.push(`data:${part.inlineData.mimeType};base64,${cleanData}`);
        }
        if (part.text) {
          content += part.text;
        }
      }
      promptTokens = result.usageMetadata?.promptTokenCount || 0;
      completionTokens = result.usageMetadata?.candidatesTokenCount || 0;
    } else {
      // Vercel/OpenAI response format
      generatedImages = result.choices?.[0]?.message?.images?.map((img: { image_url?: { url?: string }; url?: string }) =>
        img.image_url?.url || img.url
      ).filter(Boolean) || [];
      content = result.choices?.[0]?.message?.content || '';
      promptTokens = result.usage?.prompt_tokens || 0;
      completionTokens = result.usage?.completion_tokens || 0;
    }

    const tokensUsed = (promptTokens + completionTokens) || 1500;

    // Determine job status - warning if API worked but no images returned
    const noImagesReturned = generatedImages.length === 0;
    const jobStatus = noImagesReturned ? 'warning' : 'success';
    const warningReason = noImagesReturned && content
      ? content.substring(0, 500)
      : (noImagesReturned ? 'Model returned no images' : null);

    // Only charge tokens when images were actually returned (skip for BYO)
    const tokensCharged = (gatewayType === 'byo' || noImagesReturned) ? 0 : tokensUsed;

    let newTokenBalance = userProfile?.tokens_remaining || null;
    if (userId && gatewayType !== 'byo' && !noImagesReturned) {
      try {
        const { data: updateResult } = await supabase.rpc('deduct_tokens', {
          user_id: userId,
          amount: tokensUsed
        });
        if (updateResult && updateResult[0]) {
          newTokenBalance = updateResult[0].new_balance;
        }
      } catch (err) {
        console.error('Token deduction failed:', err);
      }
    } else if (noImagesReturned && gatewayType !== 'byo') {
      console.log('No images returned - skipping token deduction:', { userId, tokensUsed: 0 });
    }

    // Log job with appropriate status
    await logJob(supabase, {
      userId,
      requestId,
      batchId,
      mode,
      imageSize,
      model,
      imagesSubmitted: allImages.length,
      instructionLength: instruction.length,
      totalInputBytes: allImages.reduce((sum: number, img: string) => sum + img.length, 0),
      imagesReturned: generatedImages.length,
      promptTokens,
      completionTokens,
      totalTokens: tokensUsed,
      elapsedMs: elapsed,
      status: jobStatus,
      errorCode: noImagesReturned ? 'NO_IMAGES' : null,
      errorMessage: warningReason,
      tokensCharged,
      tokenBalanceBefore: userProfile?.tokens_remaining,
      tokenBalanceAfter: newTokenBalance,
    });

    return new Response(
      JSON.stringify({
        images: generatedImages,
        content,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: tokensUsed,
        },
        providerMetadata: result.providerMetadata || result.modelVersion,
        elapsed,
        model: actualModel,
        imageSize,
        tokens_remaining: newTokenBalance,
        gateway: gatewayType,
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Edge Function error:', error);

    // Log the error to job_logs
    if (userId) {
      await logJob(supabase, {
        userId,
        requestId: `error-${Date.now()}`,
        mode: 'batch',
        imageSize: '1K',
        model: 'unknown',
        imagesSubmitted: 0,
        instructionLength: 0,
        totalInputBytes: 0,
        imagesReturned: 0,
        elapsedMs: 0,
        status: 'error',
        errorCode: '500',
        errorMessage: error instanceof Error ? error.message : 'Internal server error',
        tokenBalanceBefore: userProfile?.tokens_remaining,
        tokenBalanceAfter: userProfile?.tokens_remaining,
      });
    }

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
}

export const config = {
  path: '/api/process-image-v2',
};

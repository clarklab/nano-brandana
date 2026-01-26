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

    // Call AI Gateway - NO TIMEOUT in Edge Functions!
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    });

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
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: corsHeaders }
        );
      }

      if (response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'Authentication failed. Please check your API key.' }),
          { status: 403, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ error: `AI Gateway error: ${response.statusText}` }),
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
          generatedImages.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
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
    const tokensCharged = gatewayType === 'byo' ? 0 : tokensUsed;

    // Deduct tokens (skip for BYO)
    let newTokenBalance = userProfile?.tokens_remaining || null;
    if (userId && gatewayType !== 'byo') {
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
    }

    // Determine job status - warning if API worked but no images returned
    const noImagesReturned = generatedImages.length === 0;
    const jobStatus = noImagesReturned ? 'warning' : 'success';
    const warningReason = noImagesReturned && content
      ? content.substring(0, 500)
      : (noImagesReturned ? 'Model returned no images' : null);

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

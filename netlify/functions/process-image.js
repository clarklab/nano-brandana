const { createClient } = require('@supabase/supabase-js');

// Vercel AI Gateway (existing)
const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
const AI_GATEWAY_BASE_URL = process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1';

// Netlify AI Gateway (auto-injected by Netlify when deployed)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = process.env.GOOGLE_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

const IMAGE_MODEL_ID = process.env.IMAGE_MODEL_ID || 'google/gemini-3-pro-image';

// Gateway detection helpers
function isNetlifyGateway(model) {
  return model?.startsWith('netlify/');
}

function getActualModelId(model) {
  // Strip gateway prefix for Netlify models
  if (model?.startsWith('netlify/')) {
    return model.replace('netlify/', '');
  }
  return model;
}

// Supabase configuration - REQUIRED for security
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB - matches client-side limit for Lambda safety
const MAX_INSTRUCTION_LENGTH = 10000; // Max 10K characters for instruction

// Allowed origins for CORS (production + local dev)
const ALLOWED_ORIGINS = [
  process.env.URL, // Netlify deploy URL
  process.env.DEPLOY_PRIME_URL, // Netlify branch deploy URL
  'http://localhost:8889',
  'http://localhost:3000',
].filter(Boolean);

// Create Supabase admin client - REQUIRED for security
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// Helper to get CORS origin (validate against allowed list)
function getCorsOrigin(requestOrigin) {
  if (!requestOrigin) return null;
  // Check exact match or if origin starts with an allowed origin (for deploy previews)
  const isAllowed = ALLOWED_ORIGINS.some(allowed =>
    requestOrigin === allowed ||
    (allowed && requestOrigin.startsWith(allowed.replace(/\/$/, '')))
  );
  // Also allow *.netlify.app for preview deploys
  const isNetlifyPreview = /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(requestOrigin) ||
                           /^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(requestOrigin);
  return (isAllowed || isNetlifyPreview) ? requestOrigin : null;
}

// Helper to log job to Supabase
async function logJob(params) {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await supabaseAdmin.rpc('log_job', {
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
      p_error_message: params.errorMessage?.substring(0, 500) || null,
      p_tokens_charged: params.tokensCharged || null,
      p_token_balance_before: params.tokenBalanceBefore || null,
      p_token_balance_after: params.tokenBalanceAfter || null,
      p_batch_id: params.batchId || null,
    });

    if (error) {
      console.error('Job logging error:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Job logging failed:', err);
    return null;
  }
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsOrigin = getCorsOrigin(requestOrigin);

  // Common security headers for all responses
  const securityHeaders = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...(corsOrigin && {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
    }),
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: securityHeaders,
      body: '',
    };
  }

  // Log environment variables (masked)
  console.log('Environment check:', {
    hasVercelKey: !!AI_GATEWAY_API_KEY,
    vercelKeyPrefix: AI_GATEWAY_API_KEY?.substring(0, 10) + '...',
    vercelBaseUrl: AI_GATEWAY_BASE_URL,
    hasNetlifyKey: !!GEMINI_API_KEY,
    netlifyKeyPrefix: GEMINI_API_KEY?.substring(0, 10) + '...',
    netlifyBaseUrl: GEMINI_BASE_URL,
    imageModelId: IMAGE_MODEL_ID,
    hasSupabase: !!supabaseAdmin,
  });

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: securityHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // SECURITY: Require Supabase authentication - fail closed
  if (!supabaseAdmin) {
    console.error('SECURITY ERROR: Supabase not configured - blocking request');
    return {
      statusCode: 503,
      headers: securityHeaders,
      body: JSON.stringify({ error: 'Service temporarily unavailable. Authentication system not configured.' }),
    };
  }

  // Note: API key check moved to after model selection to check the right gateway

  let userId = null;
  let userProfile = null;

  // AUTH: Verify user authentication and check tokens (REQUIRED)
  {
    const authHeader = event.headers.authorization || event.headers.Authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Authentication required. Please sign in.' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      // Verify the user's session
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

      if (authError || !user) {
        console.error('Auth error:', authError);
        return {
          statusCode: 401,
          headers: securityHeaders,
          body: JSON.stringify({ error: 'Invalid or expired session. Please sign in again.' }),
        };
      }

      userId = user.id;

      // Get user's token balance
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('tokens_remaining')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Profile error:', profileError);
        return {
          statusCode: 500,
          headers: securityHeaders,
          body: JSON.stringify({ error: 'Failed to fetch user profile' }),
        };
      }

      userProfile = profile;

      // Check if user has enough tokens (minimum 500 to attempt)
      if (!profile || profile.tokens_remaining < 500) {
        // Log insufficient tokens error
        await logJob({
          userId,
          requestId: `auto-${Date.now()}`,
          mode: 'batch',
          imageSize: '1K',
          model: IMAGE_MODEL_ID,
          imagesSubmitted: 0,
          status: 'error',
          errorCode: '402',
          errorMessage: 'Insufficient tokens',
          tokenBalanceAfter: profile?.tokens_remaining || 0,
        });

        return {
          statusCode: 402,
          headers: securityHeaders,
          body: JSON.stringify({
            error: 'Insufficient tokens',
            tokens_remaining: profile?.tokens_remaining || 0,
            message: 'You have run out of tokens. Please contact support for more.'
          }),
        };
      }

      console.log('User authenticated:', { userId, tokens_remaining: profile.tokens_remaining });
    } catch (err) {
      console.error('Auth verification failed:', err);
      return {
        statusCode: 401,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Authentication failed' }),
      };
    }
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { image, images, referenceImages, instruction, model = IMAGE_MODEL_ID, stream = false, imageSize = '1K', aspectRatio = null, mode = 'batch', batchId } = body;

    // Validate input - instruction is always required, image is optional for text-to-image
    if (!instruction) {
      return {
        statusCode: 400,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Missing required field: instruction' }),
      };
    }

    // SECURITY: Validate instruction length to prevent abuse
    if (typeof instruction !== 'string' || instruction.length > MAX_INSTRUCTION_LENGTH) {
      return {
        statusCode: 400,
        headers: securityHeaders,
        body: JSON.stringify({
          error: 'Invalid instruction',
          message: `Instruction must be a string with maximum ${MAX_INSTRUCTION_LENGTH} characters`
        }),
      };
    }

    // Get all images to process (single image or multiple images array)
    const allImages = images || (image ? [image] : []);

    // Get reference images from presets (max 3)
    const refImages = referenceImages || [];

    // Check image sizes if images are provided
    for (let i = 0; i < allImages.length; i++) {
      const img = allImages[i];
      const imageFileSize = img.length * 0.75;
      if (imageFileSize > MAX_IMAGE_SIZE) {
        return {
          statusCode: 400,
          headers: securityHeaders,
          body: JSON.stringify({ error: `Image ${i + 1} too large. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB` }),
        };
      }
    }

    // Check reference image sizes
    for (let i = 0; i < refImages.length; i++) {
      const img = refImages[i];
      const imageFileSize = img.length * 0.75;
      if (imageFileSize > MAX_IMAGE_SIZE) {
        return {
          statusCode: 400,
          headers: securityHeaders,
          body: JSON.stringify({ error: `Reference image ${i + 1} too large. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB` }),
        };
      }
    }

    const startTime = Date.now();

    // Determine which gateway to use based on model prefix
    const useNetlify = isNetlifyGateway(model);
    const actualModel = getActualModelId(model);

    // Check API key for the selected gateway
    if (useNetlify && !GEMINI_API_KEY) {
      console.error('ERROR: GEMINI_API_KEY is not configured for Netlify Gateway');
      return {
        statusCode: 500,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Netlify AI Gateway API key not configured. Deploy to Netlify for auto-injection.' }),
      };
    }
    if (!useNetlify && !AI_GATEWAY_API_KEY) {
      console.error('ERROR: AI_GATEWAY_API_KEY is not configured for Vercel Gateway');
      return {
        statusCode: 500,
        headers: securityHeaders,
        body: JSON.stringify({ error: 'Vercel AI Gateway API key not configured' }),
      };
    }

    let endpoint, requestHeaders, requestBody;

    if (useNetlify) {
      // ========== NETLIFY AI GATEWAY (Google GenAI format) ==========
      endpoint = `${GEMINI_BASE_URL}/v1beta/models/${actualModel}:generateContent`;
      requestHeaders = {
        'x-goog-api-key': GEMINI_API_KEY,
        'Content-Type': 'application/json',
      };

      // Build parts array for Google GenAI format
      const parts = [{ text: instruction }];

      // Add all main images as inlineData
      for (const img of allImages) {
        const match = img.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      }

      // Add all reference images
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
        },
      };

      // Add image configuration if specified
      if (aspectRatio && ['1:1', '2:3', '3:4', '4:5', '9:16', '3:2', '4:3', '5:4', '16:9', '21:9'].includes(aspectRatio)) {
        requestBody.generationConfig.aspectRatio = aspectRatio;
      }
      // Note: Netlify/Google GenAI may handle imageSize differently - test this

    } else {
      // ========== VERCEL AI GATEWAY (OpenAI-compatible format) ==========
      endpoint = `${AI_GATEWAY_BASE_URL}/chat/completions`;
      requestHeaders = {
        'Authorization': `Bearer ${AI_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
      };

      // Build content array for OpenAI format
      const messageContent = [{ type: 'text', text: instruction }];

      // Add all main images to the message content
      for (const img of allImages) {
        messageContent.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
      }

      // Add all reference images AFTER main images
      for (const img of refImages) {
        messageContent.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
      }

      requestBody = {
        model: actualModel,
        messages: [{
          role: 'user',
          content: messageContent
        }],
        stream,
        modalities: ['text', 'image'],
      };

      // Add image configuration if specified (size and/or aspect ratio)
      const imageConfig = {};
      if (imageSize && ['1K', '2K', '4K'].includes(imageSize)) {
        imageConfig.imageSize = imageSize;
      }
      if (aspectRatio && ['1:1', '2:3', '3:4', '4:5', '9:16', '3:2', '4:3', '5:4', '16:9', '21:9'].includes(aspectRatio)) {
        imageConfig.aspectRatio = aspectRatio;
      }
      if (Object.keys(imageConfig).length > 0) {
        requestBody.generationConfig = {
          imageConfig: imageConfig
        };
      }
    }

    // Log request details (without sensitive data)
    console.log('API Request:', {
      gateway: useNetlify ? 'Netlify' : 'Vercel',
      endpoint,
      model: actualModel,
      stream,
      imageSize,
      aspectRatio,
      mode,
      imageCount: allImages.length,
      referenceImageCount: refImages.length,
      totalImageLength: allImages.reduce((sum, img) => sum + img.length, 0),
      totalReferenceImageLength: refImages.reduce((sum, img) => sum + img.length, 0),
      instructionLength: instruction?.length,
    });

    // Call the selected AI Gateway
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    });

    // Log response details
    console.log('API Response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('AI Gateway error details:', {
        status: response.status,
        statusText: response.statusText,
        error,
        headers: Object.fromEntries(response.headers.entries()),
      });

      const errorElapsed = Date.now() - startTime;

      // Log error for all gateway failures
      if (userId) {
        await logJob({
          userId,
          requestId: body.requestId,
          batchId,
          mode,
          imageSize,
          model,
          imagesSubmitted: allImages.length,
          instructionLength: instruction?.length,
          totalInputBytes: allImages.reduce((sum, img) => sum + img.length, 0),
          imagesReturned: 0,
          elapsedMs: errorElapsed,
          status: 'error',
          errorCode: String(response.status),
          errorMessage: error.substring(0, 500),
          tokenBalanceBefore: userProfile?.tokens_remaining,
          tokenBalanceAfter: userProfile?.tokens_remaining,
        });
      }

      if (response.status === 403) {
        // Check if it's the free credits restriction error
        if (error.includes('Free credits temporarily have restricted access')) {
          return {
            statusCode: 403,
            headers: securityHeaders,
            body: JSON.stringify({
              error: 'Vercel AI Gateway free credits are temporarily restricted due to abuse.',
              message: 'To continue using this service, you need to purchase paid credits. Visit https://vercel.com/docs/ai-gateway/pricing for more information.',
            }),
          };
        }

        return {
          statusCode: 403,
          headers: securityHeaders,
          body: JSON.stringify({
            error: 'Authentication failed. Please check your API key.',
          }),
        };
      }

      if (response.status === 429) {
        return {
          statusCode: 429,
          headers: securityHeaders,
          body: JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        };
      }

      return {
        statusCode: response.status,
        headers: securityHeaders,
        body: JSON.stringify({
          error: `AI Gateway error: ${response.statusText}`,
        }),
      };
    }

    const result = await response.json();
    const elapsed = Date.now() - startTime;

    // Extract generated images and content based on gateway format
    let generatedImages = [];
    let content = '';
    let promptTokens = 0;
    let completionTokens = 0;

    if (useNetlify) {
      // ========== PARSE NETLIFY/GOOGLE GENAI RESPONSE ==========
      // Images come in candidates[0].content.parts[].inlineData
      for (const part of result.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          // Convert back to data URL format for consistency with frontend
          generatedImages.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        }
        if (part.text) {
          content += part.text;
        }
      }
      // Google GenAI uses usageMetadata instead of usage
      promptTokens = result.usageMetadata?.promptTokenCount || 0;
      completionTokens = result.usageMetadata?.candidatesTokenCount || 0;
    } else {
      // ========== PARSE VERCEL/OPENAI-COMPATIBLE RESPONSE ==========
      generatedImages = result.choices?.[0]?.message?.images?.map((img) =>
        img.image_url?.url || img.url
      ).filter(Boolean) || [];
      content = result.choices?.[0]?.message?.content || '';
      promptTokens = result.usage?.prompt_tokens || 0;
      completionTokens = result.usage?.completion_tokens || 0;
    }

    // Get tokens used from response - sum input + output tokens for accurate billing
    const tokensUsed = (promptTokens + completionTokens) || 1500; // Fallback estimate

    // DEDUCT TOKENS: Deduct tokens from user's balance
    let newTokenBalance = null;
    if (userId) {
      try {
        // Use atomic update to prevent race conditions
        const { data: updateResult, error: updateError } = await supabaseAdmin
          .rpc('deduct_tokens', {
            user_id: userId,
            amount: tokensUsed
          });

        if (updateError) {
          console.error('Token deduction error:', updateError);
          // Don't fail the request, just log the error
        } else if (updateResult && updateResult[0]) {
          newTokenBalance = updateResult[0].new_balance;
          console.log('Tokens deducted:', { userId, tokensUsed, newBalance: newTokenBalance });
        }
      } catch (err) {
        console.error('Token deduction failed:', err);
        // Don't fail the request, just log the error
      }
    }

    // Log successful job
    if (userId) {
      await logJob({
        userId,
        requestId: body.requestId,
        batchId,
        mode,
        imageSize,
        model,
        imagesSubmitted: allImages.length,
        instructionLength: instruction?.length,
        totalInputBytes: allImages.reduce((sum, img) => sum + img.length, 0),
        imagesReturned: generatedImages.length,
        promptTokens,
        completionTokens,
        totalTokens: tokensUsed,
        elapsedMs: elapsed,
        status: 'success',
        tokensCharged: tokensUsed,
        tokenBalanceBefore: userProfile?.tokens_remaining,
        tokenBalanceAfter: newTokenBalance,
      });
    }

    // Normalize usage for response (both gateways return same format to frontend)
    const normalizedUsage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: tokensUsed,
    };

    return {
      statusCode: 200,
      headers: securityHeaders,
      body: JSON.stringify({
        images: generatedImages,
        content,
        usage: normalizedUsage,
        providerMetadata: result.providerMetadata || result.modelVersion,
        elapsed,
        model: actualModel,
        imageSize,
        tokens_remaining: newTokenBalance,
        gateway: useNetlify ? 'netlify' : 'vercel',
      }),
    };
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: securityHeaders,
      body: JSON.stringify({
        error: 'Internal server error',
      }),
    };
  }
};

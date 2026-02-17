const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

// Vercel AI Gateway (OpenAI-compatible format)
const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
const AI_GATEWAY_BASE_URL = process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1';

// Netlify AI Gateway (auto-injected by Netlify platform)
// Uses GOOGLE_GEMINI_BASE_URL which routes through Netlify's gateway for usage tracking
const NETLIFY_GEMINI_KEY = process.env.NETLIFY_AI_GATEWAY_KEY || process.env.GEMINI_API_KEY;
const NETLIFY_GEMINI_BASE_URL = process.env.GOOGLE_GEMINI_BASE_URL;

// Google Direct API (your own API key, no gateway)
const GOOGLE_DIRECT_KEY = process.env.GOOGLE_DIRECT_API_KEY || process.env.GEMINI_API_KEY;
const GOOGLE_DIRECT_BASE_URL = 'https://generativelanguage.googleapis.com';

const IMAGE_MODEL_ID = process.env.IMAGE_MODEL_ID || 'google/gemini-3-pro-image';

// Gateway detection helpers
// Prefixes: byo/ = User's own key, google/ = Vercel, netlify/ = Netlify AI Gateway, direct/ = Google Direct
function getGatewayType(model) {
  if (model?.startsWith('byo/')) return 'byo';
  if (model?.startsWith('netlify/')) return 'netlify';
  if (model?.startsWith('direct/')) return 'direct';
  return 'vercel'; // default (google/ prefix or no prefix)
}

function getActualModelId(model, gatewayType) {
  // Strip gateway prefix first
  let actualModel = model;
  if (model?.startsWith('byo/')) actualModel = model.replace('byo/', '');
  else if (model?.startsWith('netlify/')) actualModel = model.replace('netlify/', '');
  else if (model?.startsWith('direct/')) actualModel = model.replace('direct/', '');
  else if (model?.startsWith('google/')) actualModel = model.replace('google/', '');

  // For non-Vercel gateways (Direct, BYO, Netlify), map to Google's actual model names
  // Vercel gateway handles its own mapping internally
  if (gatewayType !== 'vercel') {
    // Map Vercel-style names to Google's actual API model names
    if (actualModel === 'gemini-3-pro-image') {
      actualModel = 'gemini-3-pro-image-preview';
    }
    // Add more mappings as needed
  }

  return actualModel;
}

// Supabase configuration - REQUIRED for security
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB - matches client-side limit for Lambda safety
const MAX_INSTRUCTION_LENGTH = 10000; // Max 10K characters for instruction

// Humanize error responses from AI gateways
function humanizeError(status, rawBody) {
  // Try to extract nested error message from JSON (Google's { error: { message } } format)
  let message = typeof rawBody === 'string' ? rawBody : String(rawBody || '');
  try {
    const parsed = JSON.parse(message);
    if (parsed?.error?.message) message = parsed.error.message;
    else if (parsed?.error) message = typeof parsed.error === 'string' ? parsed.error : message;
  } catch { /* not JSON, use as-is */ }

  // Map by status code first
  if (status === 503) return 'Model busy — try again';
  if (status === 429) return 'Rate limited — try again later';
  if (status === 504) return 'Request timed out';
  if (status >= 500) return 'Server error — please retry';

  // Pattern-match on message text
  const lower = message.toLowerCase();
  if (lower.includes('high demand') || lower.includes('overloaded')) return 'Model busy — try again';
  if (lower.includes('safety') || lower.includes('blocked')) return 'Content blocked by safety filter';
  if (lower.includes('timeout') || lower.includes('timed out')) return 'Request timed out';

  // Truncate long messages to prevent raw JSON leaking through
  if (message.length > 100) return message.substring(0, 100) + '...';
  return message || 'Unknown error';
}

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
    // Vercel AI Gateway
    hasVercelKey: !!AI_GATEWAY_API_KEY,
    vercelKeyPrefix: AI_GATEWAY_API_KEY?.substring(0, 10) + '...',
    vercelBaseUrl: AI_GATEWAY_BASE_URL,
    // Netlify AI Gateway (auto-injected)
    hasNetlifyKey: !!NETLIFY_GEMINI_KEY,
    netlifyKeyPrefix: NETLIFY_GEMINI_KEY?.substring(0, 10) + '...',
    netlifyBaseUrl: NETLIFY_GEMINI_BASE_URL || '(not injected)',
    // Google Direct API
    hasGoogleDirectKey: !!GOOGLE_DIRECT_KEY,
    googleDirectKeyPrefix: GOOGLE_DIRECT_KEY?.substring(0, 10) + '...',
    googleDirectBaseUrl: GOOGLE_DIRECT_BASE_URL,
    // Other
    imageModelId: IMAGE_MODEL_ID,
    hasSupabase: !!supabaseAdmin,
  });

  // DEBUG: Log all potential Netlify AI-injected env vars
  console.log('Netlify AI env vars check:', {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? 'SET' : 'NOT SET',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET',
    GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY ? 'SET' : 'NOT SET',
    GOOGLE_GEMINI_BASE_URL: process.env.GOOGLE_GEMINI_BASE_URL ? 'SET' : 'NOT SET',
    NETLIFY_AI_API_KEY: process.env.NETLIFY_AI_API_KEY ? 'SET' : 'NOT SET',
    // List any env vars containing GOOGLE, GEMINI, or AI
    allGoogleVars: Object.keys(process.env).filter(k => k.includes('GOOGLE')),
    allGeminiVars: Object.keys(process.env).filter(k => k.includes('GEMINI')),
    allAIVars: Object.keys(process.env).filter(k => k.includes('AI') && !k.includes('FAIL')),
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

      // Get user's token balance and BYO API key
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('tokens_remaining, gemini_api_key')
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
    const gatewayType = getGatewayType(model);
    const actualModel = getActualModelId(model, gatewayType);

    // Get user's BYO API key if they have one
    const userByoKey = userProfile?.gemini_api_key;

    // Check API key for the selected gateway
    if (gatewayType === 'byo') {
      if (!userByoKey) {
        console.error('ERROR: BYO gateway selected but user has no API key configured');
        return {
          statusCode: 400,
          headers: securityHeaders,
          body: JSON.stringify({ error: 'No API key configured. Add your key in settings to use this option.' }),
        };
      }
    } else if (gatewayType === 'netlify') {
      // Netlify AI Gateway uses @google/genai SDK with auto-injected credentials
      // No manual env var check needed - SDK handles this automatically
      console.log('Using Netlify AI Gateway with @google/genai SDK (auto-injected credentials)');
    } else if (gatewayType === 'direct') {
      if (!GOOGLE_DIRECT_KEY) {
        console.error('ERROR: GOOGLE_DIRECT_API_KEY or GEMINI_API_KEY not configured');
        return {
          statusCode: 500,
          headers: securityHeaders,
          body: JSON.stringify({ error: 'Google Direct API key not configured. Set GOOGLE_DIRECT_API_KEY or GEMINI_API_KEY.' }),
        };
      }
    } else {
      // Vercel gateway
      if (!AI_GATEWAY_API_KEY) {
        console.error('ERROR: AI_GATEWAY_API_KEY is not configured for Vercel Gateway');
        return {
          statusCode: 500,
          headers: securityHeaders,
          body: JSON.stringify({ error: 'Vercel AI Gateway API key not configured' }),
        };
      }
    }

    let endpoint, requestHeaders, requestBody;

    if (gatewayType === 'byo') {
      // ========== BYO KEY (user's own Google API key, no token charges) ==========
      endpoint = `${GOOGLE_DIRECT_BASE_URL}/v1beta/models/${actualModel}:generateContent`;
      requestHeaders = {
        'x-goog-api-key': userByoKey,
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

      // Add image configuration if specified (imageSize and/or aspectRatio)
      const imageConfig = {};
      if (imageSize && ['1K', '2K', '4K'].includes(imageSize)) {
        imageConfig.imageSize = imageSize;
      }
      if (aspectRatio && ['1:1', '2:3', '3:4', '4:5', '9:16', '3:2', '4:3', '5:4', '16:9', '21:9'].includes(aspectRatio)) {
        imageConfig.aspectRatio = aspectRatio;
      }
      if (Object.keys(imageConfig).length > 0) {
        requestBody.generationConfig.imageConfig = imageConfig;
      }

    } else if (gatewayType === 'netlify') {
      // ========== NETLIFY AI GATEWAY (uses @google/genai SDK with auto-injected credentials) ==========
      // SDK call is handled separately below - just prepare parts here
      endpoint = null; // Not used - SDK handles this
      requestHeaders = null;

      // Build parts array for Google GenAI SDK format
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

      // Build imageConfig for SDK call
      const imageConfig = {};
      if (imageSize && ['1K', '2K', '4K'].includes(imageSize)) {
        imageConfig.imageSize = imageSize;
      }
      if (aspectRatio && ['1:1', '2:3', '3:4', '4:5', '9:16', '3:2', '4:3', '5:4', '16:9', '21:9'].includes(aspectRatio)) {
        imageConfig.aspectRatio = aspectRatio;
      }

      // Store parts for SDK call (requestBody used as carrier)
      requestBody = {
        _sdkParts: parts,
        _sdkConfig: {
          responseModalities: ['Text', 'Image'],
          ...(Object.keys(imageConfig).length > 0 && { imageConfig }),
        },
      };

    } else if (gatewayType === 'direct') {
      // ========== GOOGLE DIRECT API (your own key, no gateway) ==========
      endpoint = `${GOOGLE_DIRECT_BASE_URL}/v1beta/models/${actualModel}:generateContent`;
      requestHeaders = {
        'x-goog-api-key': GOOGLE_DIRECT_KEY,
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

      // Add image configuration if specified (imageSize and/or aspectRatio)
      const imageConfig = {};
      if (imageSize && ['1K', '2K', '4K'].includes(imageSize)) {
        imageConfig.imageSize = imageSize;
      }
      if (aspectRatio && ['1:1', '2:3', '3:4', '4:5', '9:16', '3:2', '4:3', '5:4', '16:9', '21:9'].includes(aspectRatio)) {
        imageConfig.aspectRatio = aspectRatio;
      }
      if (Object.keys(imageConfig).length > 0) {
        requestBody.generationConfig.imageConfig = imageConfig;
      }

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
      gateway: gatewayType,
      endpoint: gatewayType === 'netlify' ? '(@google/genai SDK)' : endpoint,
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

    let result;

    if (gatewayType === 'netlify') {
      // ========== NETLIFY AI GATEWAY - Use @google/genai SDK ==========
      // Try to find an API key from Netlify-injected env vars
      const netlifyApiKey = process.env.GOOGLE_API_KEY ||
                            process.env.GEMINI_API_KEY ||
                            process.env.GOOGLE_GEMINI_API_KEY ||
                            process.env.NETLIFY_AI_API_KEY;

      const apiKeySource = process.env.GOOGLE_API_KEY ? 'GOOGLE_API_KEY' :
                           process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' :
                           process.env.GOOGLE_GEMINI_API_KEY ? 'GOOGLE_GEMINI_API_KEY' :
                           process.env.NETLIFY_AI_API_KEY ? 'NETLIFY_AI_API_KEY' :
                           'NONE';

      console.log('Netlify SDK config:', {
        hasApiKey: !!netlifyApiKey,
        apiKeySource,
      });

      if (!netlifyApiKey) {
        console.error('ERROR: Netlify AI Gateway not injecting credentials. Check AI Features is enabled in Netlify dashboard.');
        return {
          statusCode: 500,
          headers: securityHeaders,
          body: JSON.stringify({ error: 'Netlify AI Gateway credentials not available. Netlify is not injecting API keys - please contact Netlify support.' }),
        };
      }

      const ai = new GoogleGenAI({ apiKey: netlifyApiKey });

      console.log('Calling Netlify AI Gateway via @google/genai SDK...');

      try {
        const sdkResponse = await ai.models.generateContent({
          model: actualModel,
          contents: [
            {
              role: 'user',
              parts: requestBody._sdkParts,
            },
          ],
          config: requestBody._sdkConfig,
        });

        console.log('Netlify SDK Response received:', {
          hasResponse: !!sdkResponse,
          hasText: !!sdkResponse?.text,
          hasCandidates: !!sdkResponse?.candidates,
        });

        // Convert SDK response to match our expected format
        result = {
          candidates: sdkResponse.candidates,
          usageMetadata: sdkResponse.usageMetadata,
        };
      } catch (sdkError) {
        console.error('Netlify SDK error:', sdkError);

        const errorElapsed = Date.now() - startTime;

        // Log error
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
            errorCode: sdkError.status || '500',
            errorMessage: (sdkError.message || 'SDK error').substring(0, 500),
            tokenBalanceBefore: userProfile?.tokens_remaining,
            tokenBalanceAfter: userProfile?.tokens_remaining,
          });
        }

        return {
          statusCode: sdkError.status || 500,
          headers: securityHeaders,
          body: JSON.stringify({
            error: humanizeError(sdkError.status || 500, sdkError.message || 'Unknown error'),
            retryable: sdkError.status === 503 || sdkError.status === 429 || sdkError.status >= 500,
          }),
        };
      }
    } else {
      // ========== OTHER GATEWAYS - Use fetch ==========
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
            body: JSON.stringify({ error: 'Rate limited — try again later', retryable: true }),
          };
        }

        if (response.status === 503) {
          return {
            statusCode: 503,
            headers: securityHeaders,
            body: JSON.stringify({ error: 'Model busy — try again', retryable: true }),
          };
        }

        return {
          statusCode: response.status,
          headers: securityHeaders,
          body: JSON.stringify({
            error: humanizeError(response.status, error),
            retryable: response.status >= 500,
          }),
        };
      }

      result = await response.json();
    }

    const elapsed = Date.now() - startTime;

    // Extract generated images and content based on gateway format
    let generatedImages = [];
    let content = '';
    let promptTokens = 0;
    let completionTokens = 0;

    if (gatewayType === 'byo' || gatewayType === 'netlify' || gatewayType === 'direct') {
      // ========== PARSE GOOGLE GENAI RESPONSE (BYO, Netlify gateway, and Direct) ==========
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

    // Determine job status - warning if API worked but no images returned
    const noImagesReturned = generatedImages.length === 0;
    const jobStatus = noImagesReturned ? 'warning' : 'success';
    const warningReason = noImagesReturned && content
      ? content.substring(0, 500)
      : (noImagesReturned ? 'Model returned no images' : null);

    // DEDUCT TOKENS: Only charge when images were actually returned (skip for BYO key users)
    let newTokenBalance = null;
    const tokensCharged = (gatewayType === 'byo' || noImagesReturned) ? 0 : tokensUsed;

    if (userId && gatewayType !== 'byo' && !noImagesReturned) {
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
    } else if (gatewayType === 'byo') {
      console.log('BYO key used - no token deduction:', { userId, tokensUsed });
      newTokenBalance = userProfile?.tokens_remaining || null;
    } else if (noImagesReturned) {
      console.log('No images returned - skipping token deduction:', { userId, tokensUsed: 0 });
      newTokenBalance = userProfile?.tokens_remaining || null;
    }

    // Log job with appropriate status
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
        status: jobStatus,
        errorCode: noImagesReturned ? 'NO_IMAGES' : null,
        errorMessage: warningReason,
        tokensCharged, // 0 for BYO, tokensUsed otherwise
        tokenBalanceBefore: userProfile?.tokens_remaining,
        tokenBalanceAfter: newTokenBalance,
        gateway: gatewayType, // Track which gateway was used
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
        gateway: gatewayType,
      }),
    };
  } catch (error) {
    console.error('Function error:', error);

    // Log the error to job_logs
    if (userId) {
      await logJob({
        userId,
        requestId: `error-${Date.now()}`,
        mode: 'batch',
        imageSize: '1K',
        model: IMAGE_MODEL_ID,
        imagesSubmitted: 0,
        instructionLength: 0,
        totalInputBytes: 0,
        imagesReturned: 0,
        elapsedMs: 0,
        status: 'error',
        errorCode: '500',
        errorMessage: (error?.message || 'Internal server error').substring(0, 500),
        tokenBalanceBefore: userProfile?.tokens_remaining,
        tokenBalanceAfter: userProfile?.tokens_remaining,
      });
    }

    return {
      statusCode: 500,
      headers: securityHeaders,
      body: JSON.stringify({
        error: 'Internal server error',
      }),
    };
  }
};

const { createClient } = require('@supabase/supabase-js');

const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
const AI_GATEWAY_BASE_URL = process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1';
const IMAGE_MODEL_ID = process.env.IMAGE_MODEL_ID || 'google/gemini-3-pro-image';

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// Create Supabase admin client (only if configured)
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const isAuthEnabled = Boolean(supabaseAdmin);

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
  // Log environment variables (masked)
  console.log('Environment check:', {
    hasApiKey: !!AI_GATEWAY_API_KEY,
    apiKeyLength: AI_GATEWAY_API_KEY?.length,
    apiKeyPrefix: AI_GATEWAY_API_KEY?.substring(0, 10) + '...',
    baseUrl: AI_GATEWAY_BASE_URL,
    imageModelId: IMAGE_MODEL_ID,
    authEnabled: isAuthEnabled,
  });

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Check API key
  if (!AI_GATEWAY_API_KEY) {
    console.error('ERROR: AI_GATEWAY_API_KEY is not configured');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'AI Gateway API key not configured' }),
    };
  }

  let userId = null;
  let userProfile = null;

  // AUTH: If Supabase is configured, verify user and check tokens
  if (isAuthEnabled) {
    const authHeader = event.headers.authorization || event.headers.Authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
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
        body: JSON.stringify({ error: 'Authentication failed' }),
      };
    }
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { image, images, referenceImages, instruction, model = IMAGE_MODEL_ID, stream = false, imageSize = '1K', mode = 'batch', batchId } = body;

    // Validate input - instruction is always required, image is optional for text-to-image
    if (!instruction) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required field: instruction' }),
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
          body: JSON.stringify({ error: `Reference image ${i + 1} too large. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB` }),
        };
      }
    }

    const startTime = Date.now();

    // Prepare request
    const endpoint = `${AI_GATEWAY_BASE_URL}/chat/completions`;

    // Build content array based on whether we have images
    const messageContent = [{ type: 'text', text: instruction }];

    // Add all main images to the message content
    for (const img of allImages) {
      messageContent.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
    }

    // Add all reference images AFTER main images
    for (const img of refImages) {
      messageContent.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
    }

    const requestBody = {
      model,
      messages: [{
        role: 'user',
        content: messageContent
      }],
      stream,
      modalities: ['text', 'image'],
    };

    // Add image size configuration if specified
    if (imageSize && ['1K', '2K', '4K'].includes(imageSize)) {
      requestBody.generation_config = {
        image_config: {
          image_size: imageSize
        }
      };
    }

    // Log request details (without sensitive data)
    console.log('API Request:', {
      endpoint,
      model,
      stream,
      imageSize,
      mode,
      imageCount: allImages.length,
      referenceImageCount: refImages.length,
      totalImageLength: allImages.reduce((sum, img) => sum + img.length, 0),
      totalReferenceImageLength: refImages.reduce((sum, img) => sum + img.length, 0),
      instructionLength: instruction?.length,
      authHeader: `Bearer ${AI_GATEWAY_API_KEY?.substring(0, 15)}...`,
    });

    // Call Vercel AI Gateway
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AI_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
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
      if (isAuthEnabled && userId) {
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
            body: JSON.stringify({
              error: 'Vercel AI Gateway free credits are temporarily restricted due to abuse.',
              message: 'To continue using this service, you need to purchase paid credits. Visit https://vercel.com/docs/ai-gateway/pricing for more information.',
              details: error,
            }),
          };
        }

        return {
          statusCode: 403,
          body: JSON.stringify({
            error: 'Authentication failed. Please check your API key.',
            details: error,
          }),
        };
      }

      if (response.status === 429) {
        return {
          statusCode: 429,
          body: JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        };
      }

      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: `AI Gateway error: ${response.statusText}`,
          details: error,
        }),
      };
    }

    const result = await response.json();
    const elapsed = Date.now() - startTime;

    // Extract generated images from response
    const generatedImages = result.choices?.[0]?.message?.images?.map((img) =>
      img.image_url?.url || img.url
    ).filter(Boolean) || [];

    // Also check for images in the content
    const content = result.choices?.[0]?.message?.content;

    // Get tokens used from response - sum input + output tokens for accurate billing
    const promptTokens = result.usage?.prompt_tokens || 0;
    const completionTokens = result.usage?.completion_tokens || 0;
    const tokensUsed = result.usage?.total_tokens || (promptTokens + completionTokens) || 1500; // Fallback estimate

    // DEDUCT TOKENS: If auth is enabled, deduct tokens from user's balance
    let newTokenBalance = null;
    if (isAuthEnabled && userId) {
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
    if (isAuthEnabled && userId) {
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
        promptTokens: result.usage?.prompt_tokens,
        completionTokens: result.usage?.completion_tokens,
        totalTokens: result.usage?.total_tokens,
        elapsedMs: elapsed,
        status: 'success',
        tokensCharged: tokensUsed,
        tokenBalanceBefore: userProfile?.tokens_remaining,
        tokenBalanceAfter: newTokenBalance,
      });
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: JSON.stringify({
        images: generatedImages,
        content,
        usage: result.usage,
        providerMetadata: result.providerMetadata,
        elapsed,
        model: result.model,
        imageSize,
        tokens_remaining: newTokenBalance,
      }),
    };
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};

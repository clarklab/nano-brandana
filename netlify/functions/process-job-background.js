/**
 * Background Function - Process pending jobs from the queue
 * Runs up to 15 minutes without timeout pressure
 * Triggered by enqueue-job edge function
 */

const { createClient } = require('@supabase/supabase-js');

// Configuration for background function
exports.config = {
  type: 'background',
};

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
const AI_GATEWAY_BASE_URL = process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1';
const IMAGE_MODEL_ID = process.env.IMAGE_MODEL_ID || 'google/gemini-3-pro-image';
const GOOGLE_DIRECT_KEY = process.env.GOOGLE_DIRECT_API_KEY || process.env.GEMINI_API_KEY;

// Netlify AI Gateway key (auto-injected by Netlify platform)
const NETLIFY_GEMINI_KEY = process.env.GOOGLE_API_KEY ||
                           process.env.GEMINI_API_KEY ||
                           process.env.GOOGLE_GEMINI_API_KEY ||
                           process.env.NETLIFY_AI_API_KEY;

// Create Supabase admin client
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// Humanize error responses from AI gateways
function humanizeError(status, rawBody) {
  let message = typeof rawBody === 'string' ? rawBody : String(rawBody || '');
  try {
    const parsed = JSON.parse(message);
    if (parsed?.error?.message) message = parsed.error.message;
    else if (parsed?.error) message = typeof parsed.error === 'string' ? parsed.error : message;
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

// Gateway detection helpers
function getGatewayType(model) {
  if (model?.startsWith('byo/')) return 'byo';
  if (model?.startsWith('netlify/')) return 'netlify';
  if (model?.startsWith('direct/')) return 'direct';
  return 'vercel';
}

function getActualModelId(model, gatewayType) {
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

// Log job completion to job_logs table
async function logJobCompletion(job, result) {
  if (!supabaseAdmin) return;

  try {
    await supabaseAdmin.rpc('log_job', {
      p_user_id: job.user_id,
      p_request_id: job.request_id,
      p_mode: job.mode || 'batch',
      p_image_size: job.image_size || '1K',
      p_model: job.model,
      p_images_submitted: job.images?.length || 0,
      p_instruction_length: job.instruction?.length || 0,
      p_total_input_bytes: (job.images || []).reduce((sum, img) => sum + (img?.length || 0), 0),
      p_images_returned: result.images?.length || 0,
      p_prompt_tokens: result.usage?.prompt_tokens || null,
      p_completion_tokens: result.usage?.completion_tokens || null,
      p_total_tokens: result.usage?.total_tokens || null,
      p_elapsed_ms: result.elapsed || 0,
      p_status: result.status,
      p_error_code: result.errorCode || null,
      p_error_message: result.errorMessage?.substring(0, 500) || null,
      p_tokens_charged: result.tokensCharged || null,
      p_token_balance_before: result.tokenBalanceBefore || null,
      p_token_balance_after: result.tokenBalanceAfter || null,
      p_batch_id: job.batch_id || null,
    });
  } catch (err) {
    console.error('Failed to log job completion:', err);
  }
}

// Process a single job
async function processJob(job) {
  const startTime = Date.now();
  const gatewayType = getGatewayType(job.model);
  const actualModel = getActualModelId(job.model, gatewayType);

  // Mark job as processing
  await supabaseAdmin
    .from('pending_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', job.id);

  // Get user's API key if BYO
  let userByoKey = null;
  if (gatewayType === 'byo') {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('gemini_api_key')
      .eq('id', job.user_id)
      .single();
    userByoKey = profile?.gemini_api_key;

    if (!userByoKey) {
      return {
        status: 'failed',
        errorCode: 'NO_API_KEY',
        errorMessage: 'No API key configured for BYO mode',
        elapsed: Date.now() - startTime,
      };
    }
  }

  // Get user's current token balance for logging
  const { data: userProfile } = await supabaseAdmin
    .from('profiles')
    .select('tokens_remaining')
    .eq('id', job.user_id)
    .single();
  const tokenBalanceBefore = userProfile?.tokens_remaining || 0;

  // Build API request
  const allImages = job.images || [];
  const refImages = job.reference_images || [];

  let endpoint, requestHeaders, requestBody;

  if (gatewayType === 'byo' || gatewayType === 'direct' || gatewayType === 'netlify') {
    // Google GenAI format (BYO, Direct, and Netlify all use Google's native API)
    const apiKey = gatewayType === 'byo' ? userByoKey :
                   gatewayType === 'netlify' ? NETLIFY_GEMINI_KEY :
                   GOOGLE_DIRECT_KEY;
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent`;
    requestHeaders = {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    };

    const parts = [{ text: job.instruction }];
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

    // Build imageConfig for Google's API
    const imageConfig = {};
    if (job.image_size && ['1K', '2K', '4K'].includes(job.image_size)) {
      imageConfig.imageSize = job.image_size;
    }
    if (job.aspect_ratio) {
      imageConfig.aspectRatio = job.aspect_ratio;
    }

    requestBody = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        ...(Object.keys(imageConfig).length > 0 && { imageConfig }),
      },
    };
  } else {
    // Vercel AI Gateway (OpenAI-compatible format)
    endpoint = `${AI_GATEWAY_BASE_URL}/chat/completions`;
    requestHeaders = {
      'Authorization': `Bearer ${AI_GATEWAY_API_KEY}`,
      'Content-Type': 'application/json',
    };

    const messageContent = [{ type: 'text', text: job.instruction }];
    for (const img of allImages) {
      messageContent.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
    }
    for (const img of refImages) {
      messageContent.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
    }

    const imageConfig = {};
    if (job.image_size && ['1K', '2K', '4K'].includes(job.image_size)) {
      imageConfig.imageSize = job.image_size;
    }
    if (job.aspect_ratio) {
      imageConfig.aspectRatio = job.aspect_ratio;
    }

    requestBody = {
      model: actualModel,
      messages: [{ role: 'user', content: messageContent }],
      stream: false,
      modalities: ['text', 'image'],
      ...(Object.keys(imageConfig).length > 0 && {
        generationConfig: { imageConfig }
      }),
    };
  }

  console.log('Processing job:', {
    jobId: job.id,
    gateway: gatewayType,
    model: actualModel,
    imageSize: job.image_size,
    aspectRatio: job.aspect_ratio,
    imageCount: allImages.length,
    refCount: refImages.length,
  });

  try {
    // Call AI Gateway (no timeout - background function has 15 min limit)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);

      return {
        status: 'failed',
        errorCode: String(response.status),
        errorMessage: humanizeError(response.status, errorText),
        elapsed: Date.now() - startTime,
        tokenBalanceBefore,
        tokenBalanceAfter: tokenBalanceBefore, // No tokens charged on error
      };
    }

    const result = await response.json();
    const elapsed = Date.now() - startTime;

    // Extract generated images and content
    let generatedImages = [];
    let content = '';
    let promptTokens = 0;
    let completionTokens = 0;

    if (gatewayType === 'byo' || gatewayType === 'direct' || gatewayType === 'netlify') {
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
      generatedImages = result.choices?.[0]?.message?.images?.map(img =>
        img.image_url?.url || img.url
      ).filter(Boolean) || [];
      content = result.choices?.[0]?.message?.content || '';
      promptTokens = result.usage?.prompt_tokens || 0;
      completionTokens = result.usage?.completion_tokens || 0;
    }

    const tokensUsed = (promptTokens + completionTokens) || 1500;
    const tokensCharged = gatewayType === 'byo' ? 0 : tokensUsed;

    // Note: Tokens were already deducted upfront in enqueue-job
    // Here we just track the actual usage for logging

    return {
      status: generatedImages.length > 0 ? 'completed' : 'warning',
      images: generatedImages,
      content,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: tokensUsed,
      },
      elapsed,
      tokensCharged,
      tokenBalanceBefore,
      tokenBalanceAfter: tokenBalanceBefore - tokensCharged,
      errorCode: generatedImages.length === 0 ? 'NO_IMAGES' : null,
      errorMessage: generatedImages.length === 0 ? (content || 'Model returned no images') : null,
    };

  } catch (err) {
    console.error('Job processing error:', err);
    return {
      status: 'failed',
      errorCode: 'PROCESSING_ERROR',
      errorMessage: err.message || 'Unknown error during processing',
      elapsed: Date.now() - startTime,
      tokenBalanceBefore,
      tokenBalanceAfter: tokenBalanceBefore,
    };
  }
}

exports.handler = async (event) => {
  console.log('Background function triggered');

  if (!supabaseAdmin) {
    console.error('Supabase not configured');
    return { statusCode: 500 };
  }

  // Parse job ID from request body (if triggered directly)
  let targetJobId = null;
  try {
    const body = JSON.parse(event.body || '{}');
    targetJobId = body.jobId;
  } catch (e) {
    // No specific job ID, will process any pending jobs
  }

  // Fetch pending jobs
  let query = supabaseAdmin
    .from('pending_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5); // Process up to 5 jobs per invocation

  if (targetJobId) {
    // If specific job requested, prioritize it
    query = supabaseAdmin
      .from('pending_jobs')
      .select('*')
      .eq('id', targetJobId)
      .eq('status', 'pending');
  }

  const { data: jobs, error: fetchError } = await query;

  if (fetchError) {
    console.error('Failed to fetch pending jobs:', fetchError);
    return { statusCode: 500 };
  }

  if (!jobs || jobs.length === 0) {
    console.log('No pending jobs to process');
    return { statusCode: 200 };
  }

  console.log(`Processing ${jobs.length} pending job(s)`);

  // Process jobs sequentially to respect API rate limits
  for (const job of jobs) {
    try {
      console.log(`Starting job ${job.id}`);
      const result = await processJob(job);

      // Refund pre-deducted tokens if job failed or returned no images
      // (tokens were deducted upfront in enqueue-job; refund via negative deduction)
      const gatewayType = getGatewayType(job.model);
      if (gatewayType !== 'byo' && (result.status === 'failed' || result.status === 'warning')) {
        try {
          await supabaseAdmin.rpc('deduct_tokens', {
            user_id: job.user_id,
            amount: -1500, // Negative = refund
          });
          console.log(`Refunded 1500 tokens for job ${job.id} (status: ${result.status})`);
        } catch (refundErr) {
          console.error(`Token refund failed for job ${job.id}:`, refundErr);
        }
      }

      // Update job with results
      const updateData = {
        status: result.status === 'warning' ? 'completed' : result.status,
        completed_at: new Date().toISOString(),
        result_images: result.images || null,
        result_content: result.content || null,
        usage: result.usage || null,
        error_code: result.errorCode || null,
        error_message: result.errorMessage || null,
      };

      const { error: updateError } = await supabaseAdmin
        .from('pending_jobs')
        .update(updateData)
        .eq('id', job.id);

      if (updateError) {
        console.error(`Failed to update job ${job.id}:`, updateError);
      } else {
        console.log(`Job ${job.id} completed with status: ${result.status}`);
      }

      // Log to job_logs for analytics
      await logJobCompletion(job, result);

    } catch (err) {
      console.error(`Job ${job.id} failed:`, err);

      // Refund pre-deducted tokens on unexpected errors
      const gatewayType = getGatewayType(job.model);
      if (gatewayType !== 'byo') {
        try {
          await supabaseAdmin.rpc('deduct_tokens', {
            user_id: job.user_id,
            amount: -1500,
          });
          console.log(`Refunded 1500 tokens for failed job ${job.id}`);
        } catch (refundErr) {
          console.error(`Token refund failed for job ${job.id}:`, refundErr);
        }
      }

      // Mark job as failed
      await supabaseAdmin
        .from('pending_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_code: 'UNEXPECTED_ERROR',
          error_message: err.message || 'Unexpected error',
          retry_count: (job.retry_count || 0) + 1,
        })
        .eq('id', job.id);
    }
  }

  console.log('Background function completed');
  return { statusCode: 200 };
};

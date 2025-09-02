import { Handler } from '@netlify/functions';

const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
const AI_GATEWAY_BASE_URL = process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1';
const IMAGE_MODEL_ID = process.env.IMAGE_MODEL_ID || 'google/gemini-2.5-flash-image-preview';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export const handler: Handler = async (event) => {
  // Log environment variables (masked)
  console.log('Environment check:', {
    hasApiKey: !!AI_GATEWAY_API_KEY,
    apiKeyLength: AI_GATEWAY_API_KEY?.length,
    apiKeyPrefix: AI_GATEWAY_API_KEY?.substring(0, 10) + '...',
    baseUrl: AI_GATEWAY_BASE_URL,
    imageModelId: IMAGE_MODEL_ID,
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

  try {
    const body = JSON.parse(event.body || '{}');
    const { image, instruction, model = IMAGE_MODEL_ID, stream = false } = body;

    // Validate input
    if (!image || !instruction) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: image and instruction' }),
      };
    }

    // Check image size (rough estimate for base64)
    const imageSize = image.length * 0.75;
    if (imageSize > MAX_IMAGE_SIZE) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Image too large. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB` }),
      };
    }

    const startTime = Date.now();

    // Prepare request
    const endpoint = `${AI_GATEWAY_BASE_URL}/chat/completions`;
    const requestBody = {
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: instruction },
          { type: 'image_url', image_url: { url: image, detail: 'high' } }
        ]
      }],
      stream,
      modalities: ['text', 'image'],
    };

    // Log request details (without sensitive data)
    console.log('API Request:', {
      endpoint,
      model,
      stream,
      hasImage: !!image,
      imageLength: image?.length,
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
    const generatedImages = result.choices?.[0]?.message?.images?.map((img: any) => 
      img.image_url?.url || img.url
    ).filter(Boolean) || [];

    // Also check for images in the content
    const content = result.choices?.[0]?.message?.content;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({
        images: generatedImages,
        content,
        usage: result.usage,
        providerMetadata: result.providerMetadata,
        elapsed,
        model: result.model,
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
// Simple image proxy to bypass CORS restrictions for "Edit with Peel" links
const https = require('https');
const http = require('http');

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  process.env.URL,
  process.env.DEPLOY_PRIME_URL,
  'http://localhost:8889',
  'http://localhost:3000',
].filter(Boolean);

// Max image size: 4MB (leaves room for base64 overhead within Lambda's 6MB limit)
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

function getCorsOrigin(requestOrigin) {
  if (!requestOrigin) return null;
  const isAllowed = ALLOWED_ORIGINS.some(allowed =>
    requestOrigin === allowed ||
    (allowed && requestOrigin.startsWith(allowed.replace(/\/$/, '')))
  );
  const isNetlifyPreview = /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(requestOrigin) ||
                           /^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(requestOrigin);
  return (isAllowed || isNetlifyPreview) ? requestOrigin : null;
}

// Fetch URL using built-in http/https modules
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const request = client.get(url, {
      headers: {
        'User-Agent': 'Peel-Image-Proxy/1.0',
      },
    }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchUrl(response.headers.location).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const chunks = [];
      let totalSize = 0;

      response.on('data', chunk => {
        totalSize += chunk.length;
        if (totalSize > MAX_IMAGE_SIZE) {
          request.destroy();
          reject(new Error(`Image too large (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`));
          return;
        }
        chunks.push(chunk);
      });

      response.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: response.headers['content-type'] || 'application/octet-stream',
        });
      });
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

exports.handler = async (event) => {
  const origin = getCorsOrigin(event.headers.origin);

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Image-Filename',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const imageUrl = event.queryStringParameters?.url;

  if (!imageUrl) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing url parameter' }),
    };
  }

  try {
    // Validate URL
    const parsedUrl = new URL(imageUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid URL protocol' }),
      };
    }

    // Fetch the image
    const { buffer, contentType } = await fetchUrl(imageUrl);

    if (!contentType.startsWith('image/')) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: `URL does not point to an image (got ${contentType})` }),
      };
    }

    // Extract filename from URL
    const filename = parsedUrl.pathname.split('/').pop() || 'image.png';

    // Return image directly as binary (base64 encoded for Lambda)
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'X-Image-Filename': encodeURIComponent(filename),
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Image proxy error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Failed to fetch image: ${error.message}` }),
    };
  }
};

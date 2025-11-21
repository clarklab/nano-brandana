#!/usr/bin/env node

// Test script for Vercel AI Gateway
// Usage: node test-vercel-gateway.js

const API_KEY = process.env.AI_GATEWAY_API_KEY || 'vck_19urLUoIHxmRENnjKYa943w5...'; // Replace with your actual key
const BASE_URL = process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1';
const MODEL = process.env.IMAGE_MODEL_ID || 'google/gemini-3-pro-image';

// Simple test without image
async function testTextOnly() {
  console.log('Testing text-only request...');
  
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{
        role: 'user',
        content: 'Hello, this is a test.'
      }],
      stream: false,
    }),
  });

  console.log('Response status:', response.status, response.statusText);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));
  
  const text = await response.text();
  console.log('Response body:', text);
  
  if (response.ok) {
    try {
      const json = JSON.parse(text);
      console.log('Parsed response:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Could not parse as JSON');
    }
  }
}

// Test with image
async function testWithImage() {
  console.log('\nTesting with image (1K resolution)...');

  // Create a small test image (1x1 red pixel)
  const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What color is this pixel?' },
          { type: 'image_url', image_url: { url: testImageBase64, detail: 'auto' } }
        ]
      }],
      stream: false,
      modalities: ['text', 'image'],
      generation_config: {
        image_config: {
          image_size: '1K'
        }
      }
    }),
  });

  console.log('Response status:', response.status, response.statusText);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));

  const text = await response.text();
  console.log('Response body:', text);
}

// Check API key format
function checkApiKeyFormat() {
  console.log('Checking API key format...');
  console.log('API Key length:', API_KEY.length);
  console.log('API Key prefix:', API_KEY.substring(0, 15) + '...');
  console.log('API Key pattern match (vck_...):', /^vck_[a-zA-Z0-9]+/.test(API_KEY));
  
  if (API_KEY.includes('...')) {
    console.warn('WARNING: API key contains "..." - make sure to use the full key!');
  }
}

// Main
async function main() {
  console.log('Vercel AI Gateway Test');
  console.log('======================');
  console.log('Base URL:', BASE_URL);
  console.log('Model:', MODEL);
  console.log('');
  
  checkApiKeyFormat();
  console.log('');
  
  try {
    await testTextOnly();
    await testWithImage();
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
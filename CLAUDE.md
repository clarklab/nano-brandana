# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a drag-and-drop batch image editor web application that uses AI-powered image editing via Vercel AI Gateway and Google's Gemini 2.5 Flash Image model. The app is designed to handle dozens of high-quality photos with batch processing capabilities.

## Common Development Commands

```bash
# Install dependencies
npm install

# Start development server with Netlify Functions
netlify dev

# Build for production
npm run build

# Run tests (not yet configured)
npm test

# Set up environment variables in Netlify
netlify env:set AI_GATEWAY_API_KEY your-api-key
netlify env:set AI_GATEWAY_BASE_URL https://ai-gateway.vercel.sh/v1
netlify env:set IMAGE_MODEL_ID google/gemini-2.5-flash-image-preview
```

## High-Level Architecture

### Tech Stack
- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Backend**: Netlify Functions (serverless Node.js)
- **AI Service**: Vercel AI Gateway → Google Gemini 2.5 Flash Image
- **Deployment**: Netlify (with GitHub integration)
- **State Management**: Client-side only (no database)

### Project Structure (to be implemented)
```
/netlify/functions/
  process-image.ts     # Handles single image processing via AI Gateway
  batch.ts            # Manages batch processing with concurrency control

/src/
  /components/
    Dropzone.tsx      # Drag-and-drop file upload component
    Chat.tsx          # Instruction input with chat-style UI
    ResultCard.tsx    # Display processed images with download options
    ProgressBar.tsx   # Show batch processing progress
    Timer.tsx         # Display processing time and usage metrics
  /lib/
    api.ts            # API client for Netlify Functions
    concurrency.ts    # p-limit based queue management
    base64.ts         # Image encoding/decoding utilities
  App.tsx             # Main application component
  main.tsx            # Application entry point

/public/              # Static assets
index.html            # HTML entry point
tailwind.config.js    # Tailwind CSS configuration
postcss.config.js     # PostCSS configuration
netlify.toml          # Netlify deployment configuration
vite.config.ts        # Vite build configuration
tsconfig.json         # TypeScript configuration
```

### Key Implementation Details

1. **AI Gateway Integration**
   - Use OpenAI-compatible API at `https://ai-gateway.vercel.sh/v1/chat/completions`
   - Model ID: `google/gemini-2.5-flash-image-preview` (verify in Vercel Model Library)
   - Images sent as base64 data URIs in messages array
   - Response includes generated images in `choices[0].message.images[].image_url.url`

2. **Batch Processing**
   - Client-side concurrency control using `p-limit` (3-5 parallel requests)
   - Each image processed individually through `process-image` function
   - Retry logic with exponential backoff for rate limits (429) and errors (5xx)
   - Progress tracking per image with status updates

3. **Security**
   - AI Gateway API key stored in Netlify environment variables only
   - Never expose keys to client-side code
   - Implement CORS restrictions in Netlify Functions

4. **User Experience**
   - Three-column layout: Input (left), Settings/Chat (middle), Results (right)
   - Real-time progress updates with elapsed time per image
   - Download individual results or batch ZIP (using JSZip)
   - "AI aesthetic" UI with gradients, rounded corners, and shimmer effects

### Critical Implementation Notes

- Always read Vercel AI Gateway documentation for latest API shapes and model IDs
- Use Netlify CLI (`netlify dev`) for local development to access environment variables
- Images are processed transiently - no server-side storage
- Handle large files by downscaling client-side before sending to API
- Show usage metrics from Gateway response (`usage` and `providerMetadata` fields)

## References

When implementing features, consult:
1. Vercel AI Gateway - Image Generation docs
2. Vercel AI Gateway - OpenAI-compatible API docs
3. Vercel AI Gateway - Models & Providers (for current model IDs)
4. Google Gemini API docs (for understanding capabilities only - use Gateway API)
5. spec.md in this repository for detailed requirements
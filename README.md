# Nano Brandana - AI-Powered Batch Image Editor

A drag-and-drop batch image editor powered by Vercel AI Gateway and Google's Gemini 2.5 Flash Image model (aka "Nano/Nana Banana"). Built with React, TypeScript, Tailwind CSS, and deployed on Netlify.

## Features

- 🎨 Batch image editing with AI-powered transformations
- 🚀 Process dozens of images concurrently
- 💬 Chat-style interface for natural language instructions
- ⚡ Real-time progress tracking and usage metrics
- 📦 Download individual results or batch ZIP
- 🎯 Automatic retry with exponential backoff
- 📊 Token usage and time tracking

## Setup

### Prerequisites

- Node.js 20+
- Netlify CLI (`npm install -g netlify-cli`)
- Vercel AI Gateway API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/nano-brandana.git
cd nano-brandana
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
netlify env:set AI_GATEWAY_API_KEY your-api-key
netlify env:set AI_GATEWAY_BASE_URL https://ai-gateway.vercel.sh/v1
netlify env:set IMAGE_MODEL_ID google/gemini-2.5-flash-image-preview
```

### Development

Run the development server with Netlify Functions:
```bash
netlify dev
```

The app will be available at `http://localhost:8888`

### Production Build

```bash
npm run build
```

Deploy to Netlify:
```bash
netlify deploy --prod
```

## Usage

1. **Upload Images**: Drag and drop images or click to browse
2. **Enter Instructions**: Type editing instructions (e.g., "Remove background", "Make it warmer")
3. **Run Batch**: Click the Run Batch button to process all images
4. **Download Results**: Download individual images or all as ZIP

## Quick Presets

- **Remove BG**: Remove the background and make it transparent
- **Upscale**: Upscale the image and enhance details
- **Warmer**: Make the image warmer with enhanced warm tones
- **Desaturate**: Desaturate the image to make it more muted

## Architecture

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Netlify Functions (serverless)
- **AI**: Vercel AI Gateway → Google Gemini 2.5 Flash Image
- **Concurrency**: Client-side queue with p-limit (3-5 parallel requests)
- **State**: Client-side only, no database

## Testing the Function

Test the image processing function directly:

```bash
curl -X POST http://localhost:8888/.netlify/functions/process-image \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/png;base64,iVBORw0KGgo...",
    "instruction": "Remove the background"
  }'
```

## Troubleshooting

- **Rate Limits**: The app implements automatic retry with exponential backoff
- **Large Images**: Images are automatically resized client-side if > 2048px
- **API Key Issues**: Ensure your Vercel AI Gateway key is properly set in Netlify

## License

ISC
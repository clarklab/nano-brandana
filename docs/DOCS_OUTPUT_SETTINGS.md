# Output Settings

Control the size, quality, and dimensions of your generated images with Nano's flexible output settings.

---

## Quality

The quality setting determines the resolution tier for generated images.

| Setting | Resolution | Best For |
|---------|------------|----------|
| **SD** | ~1024px | Quick drafts, thumbnails, social media icons |
| **HD** | ~2048px | Web graphics, social posts, presentations |
| **4K** | ~4096px | Print materials, large displays, hero images |

The quality picker appears in the chat footer. Click to select your preferred resolution before generating.

**Tip:** Higher quality takes slightly longer to generate. Start with SD for rapid iteration, then regenerate your favorites at higher quality.

---

## Aspect Ratio

Choose from preset aspect ratios optimized for common use cases.

| Ratio | Name | Common Uses |
|-------|------|-------------|
| **Auto** | AI Decides | Let the AI choose the best ratio for your content |
| **1:1** | Square | Instagram posts, profile pictures, app icons |
| **4:5** | Portrait | Instagram portrait, Pinterest pins |
| **9:16** | Story | Instagram/TikTok stories, mobile wallpapers |
| **16:9** | Wide | YouTube thumbnails, presentations, desktop wallpapers |
| **3:2** | Photo | Traditional photo prints, camera aspect ratio |

The ratio picker appears next to the quality picker in the chat footer.

---

## Custom Size (Exact Dimensions)

Need a specific size like 400×600 or 1920×1080? Custom Size lets you specify exact pixel dimensions for your output.

### How to Use

1. Click the **Ratio Picker** in the chat footer
2. Select **Custom Size** at the bottom of the menu
3. Enter your desired **Width** and **Height** in pixels
4. Click **Apply**
5. Generate your image — it will be delivered at exactly those dimensions

### How It Works

When you specify custom dimensions, Nano automatically:

1. **Calculates the closest aspect ratio** — Your dimensions are matched to the nearest supported ratio (1:1, 4:5, 9:16, etc.) to ensure optimal generation quality
2. **Selects the appropriate quality tier** — Based on your largest dimension:
   - Up to 1024px → SD quality
   - 1025–2048px → HD quality
   - 2049px+ → 4K quality
3. **Generates the image** at optimal settings
4. **Resizes to your exact dimensions** — The final image is precisely cropped and scaled to match your specifications

This process is automatic and invisible — you simply receive an image at exactly the size you requested.

### Specifications

- **Minimum size:** 256×256 pixels
- **Maximum size:** Limited by 4K generation (~4096px on longest edge)
- **Cropping:** Minimal, center-weighted cropping is applied when aspect ratios don't match exactly

### Examples

| Custom Size | Matched Ratio | Quality | Use Case |
|-------------|---------------|---------|----------|
| 400×600 | 2:3 | SD | Email graphics |
| 1080×1080 | 1:1 | HD | Instagram post |
| 1920×1080 | 16:9 | HD | YouTube thumbnail |
| 1080×1920 | 9:16 | HD | Instagram story |
| 800×600 | 4:3 | SD | Blog images |
| 2400×3000 | 4:5 | 4K | Print poster |

---

## Tips for Best Results

### Choosing Quality

- **Iterating on ideas?** Use SD for fast generation, then upscale your favorites
- **Final deliverable?** Match quality to your output medium — HD for web, 4K for print
- **Batch processing?** Lower quality processes faster when working with many images

### Choosing Aspect Ratio

- **Know your platform** — Use Story (9:16) for TikTok/Reels, Wide (16:9) for YouTube
- **Unsure?** Start with Auto and let the AI optimize for your content
- **Repurposing content?** Generate the same prompt at multiple ratios

### Using Custom Size

- **Match your template** — Enter exact dimensions from your design software
- **Consider the ratio** — Sizes close to standard ratios produce better results with less cropping
- **Start larger** — You can always scale down; scaling up loses quality

---

## Settings Location

All output settings appear in the **chat footer**, to the left of the message input:

```
┌─────────────────────────────────────────────────────┐
│  [SD ▾] [Auto ▾]  │  Type your instructions...  │ ▶ │
└─────────────────────────────────────────────────────┘
     ↑        ↑
  Quality   Ratio
```

Settings persist across generations until you change them. When using Custom Size, the ratio picker displays your dimensions (e.g., "400×600") instead of a ratio name.

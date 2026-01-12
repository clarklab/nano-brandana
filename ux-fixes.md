# UX Fixes Log

Based on PRD: `docs/PRD-USER-TEST-FIXES.md`

## Status

| # | Task | Status |
|---|------|--------|
| 1 | Cross-subdomain auth | OUT OF SCOPE |
| 2 | Image preview modal | COMPLETE |
| 3 | Batch toggle → segmented control | COMPLETE |
| 4 | Generate button label clarity | COMPLETE |
| 5 | Chat input restructure | COMPLETE |
| 6 | Button label updates | COMPLETE |

---

## Log

### 2026-01-11

#### Task #6: Button Label Updates
- Changed "Browse Images" → "Upload Images"
- Changed "Add Text" → "Make Image with Text"
- Changed "+ Add more images" → "+ Upload Images"
- Changed "+ Add text prompt" → "+ Make Image with Text"
- File: `src/components/InputPanel.tsx`

#### Task #3: Batch Toggle → Segmented Control
- Replaced iOS-style toggle with segmented control
- Two visible buttons: "Run as batch" | "Combine images"
- Active segment highlighted with neon color
- Badge showing count on batch mode
- File: `src/components/InputPanel.tsx`

#### Task #2: Image Preview Modal
- Added `previewImage` state to track selected image
- Added click handler to image thumbnails with hover ring effect
- Created modal with:
  - Filename header
  - Close button (X)
  - Large image preview (max 60vh height)
  - Click-outside to close
  - Animated in/out (fade + slide)
- File: `src/components/InputPanel.tsx`

#### Task #4: Generate Button Label Clarity
- Changed from "Generate Images (X)" to:
  - "Make Single Image" when processingMode is 'singleJob' OR inputs.length === 1
  - "Make X Images" for batch mode with multiple inputs
- File: `src/components/Chat.tsx`

#### Task #5: Chat Input Restructure
- Moved Generate button INTO the chat input container (bottom)
- Created new container with rounded border styling
- Restructured layout:
  - Textarea (taller: h-24 instead of h-20)
  - "Send as chat" link (subtle, right-aligned at bottom of textarea)
  - Generate button with quality picker (full-width at bottom)
- Generate button now also sends instruction text if present
- Removed old separate Generate button position
- File: `src/components/Chat.tsx`

---

## Files Modified

1. `src/components/InputPanel.tsx` - Tasks #2, #3, #6
2. `src/components/Chat.tsx` - Tasks #4, #5


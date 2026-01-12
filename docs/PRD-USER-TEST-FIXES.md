# PRD: User Testing Fixes (v1.0)

**Date:** January 11, 2026
**Source:** First live user test session
**Priority:** High - These are usability blockers

---

## 1. Cross-Subdomain Auth Status (Marketing Site)

### Problem
User expected to see login status on `peel.diy` (marketing site) but auth only works on `banana.peel.diy` (app subdomain).

### Analysis
This is **purely a marketing site fix**. Supabase auth cookies are scoped to the subdomain where login occurred. Options:
- Set cookie domain to `.peel.diy` so it's accessible across subdomains
- Marketing site needs to initialize Supabase client and check auth state

### Action
**OUT OF SCOPE** for this repo. Fix in marketing site codebase by:
1. Adding Supabase client initialization
2. Reading auth state from shared cookie (domain: `.peel.diy`)
3. Displaying logged-in user indicator

---

## 2. Image Preview Modal on Input Cards

### Problem
User wanted to click input image thumbnails to see them larger. Currently no click handler exists.

### Current State
- **File:** `src/components/InputPanel.tsx` (lines 219-286)
- Images display as 56x56px thumbnails (`w-14 h-14`)
- Only clickable element is the remove (X) button

### Requirements
1. Add click handler to the image thumbnail or card area
2. Open modal showing larger version of the image
3. Modal style should match the existing "redo modal" aesthetic (not full lightbox)
4. Animate in/out like other modals in the app (fade + scale)
5. Click outside or X button to close
6. Show filename in modal header

### Implementation Notes
- Create reusable `ImagePreviewModal` component or extend existing modal pattern
- Use `URL.createObjectURL(input.file)` for the full-size image src
- Add `cursor-pointer` to thumbnail and visual hover state to indicate clickability
- Ensure modal is responsive (max-width constraint, centered)

---

## 3. Batch Toggle → Labeled Segment Control

### Problem
Toggle switch for batch/single mode is confusing. Labels aren't clear.

### Current State
- **File:** `src/components/InputPanel.tsx` (lines 140-167)
- Shows as iOS-style toggle with "Batch" or "Single" label
- Only one label visible at a time

### Requirements
1. Replace toggle with a **segmented control** (two visible buttons side-by-side)
2. Labels: **"Run as batch"** (left) and **"Combine images"** (right)
3. Active segment is highlighted (neon/accent color)
4. Inactive segment is muted but still readable
5. Maintain click sound on selection change

### Design Spec
```
┌─────────────────┬─────────────────┐
│  Run as batch   │ Combine images  │  ← segmented control
└─────────────────┴─────────────────┘
     [active]         [inactive]
```

### Implementation Notes
- Use pill-shaped container with two clickable segments
- Active: `bg-neon text-slate-900`
- Inactive: `bg-slate-200 dark:bg-slate-700 text-slate-500`
- Both labels always visible

---

## 4. Generate Button Label Clarity

### Problem
"Generate Images (2)" doesn't clearly communicate how many images will be created, especially with duplicate presets.

### Current State
- **File:** `src/components/Chat.tsx` (lines 451-496)
- Label: `Generate Images (${inputs.length})`
- Doesn't account for duplicate preset multiplier

### Requirements
1. Change label format:
   - Multiple outputs: **"Make X Images"** (e.g., "Make 6 Images")
   - Single output: **"Make Single Image"**
2. Calculate actual output count:
   - Base count = `inputs.length`
   - If processing mode is batch AND no duplicate preset: output = input count
   - If duplicate preset active: output = input count × duplicate multiplier
   - If "combine images" mode: output = 1 (single combined image)
3. Button should always reflect the **actual number of result images**

### Implementation Notes
- May need to pass `duplicateCount` or `expectedOutputCount` as prop
- Check if combine mode (`processingMode === 'singleJob'`) → always "Make Single Image"
- Singular vs plural: "Make 1 Image" → "Make Single Image"

---

## 5. Chat Input with Integrated Generate Button

### Problem
User expected typing in chat and pressing Enter to start the job. Current UX requires typing instruction, submitting it, then clicking separate Generate button.

### Current State
- **File:** `src/components/Chat.tsx` (lines 560-587)
- Textarea with small send button (arrow) in bottom-right corner
- Generate button is completely separate, below the chat area

### Requirements
1. **Move Generate button INTO the chat input area** (bottom of textarea container)
2. Generate button spans full width inside input area, positioned at bottom
3. Quality picker (1K/2K/4K) remains integrated in Generate button
4. **Keep the small send arrow** but restyle:
   - Remove yellow background, make it plaintext/subtle
   - Label: **"Send as chat"** with arrow icon
   - Position: floating above the Generate button (right-aligned)
5. Make textarea **taller** to accommodate the new layout (~20-30% taller)
6. This gives users two clear actions from the input:
   - **Primary:** Big Generate button → starts job immediately
   - **Secondary:** "Send as chat" → adds instruction to chat, continues conversation

### Visual Layout (when input has text)
```
┌─────────────────────────────────────────────────┐
│                                                 │
│  [Textarea - taller than before]                │
│                                                 │
│                                                 │
│                         Send as chat [↑]        │  ← subtle, right-aligned
├─────────────────────────────────────────────────┤
│  ████████ Make 3 Images [1K][2K][4K] ██████████ │  ← big yellow button
└─────────────────────────────────────────────────┘
```

### Implementation Notes
- Restructure the `Chat.tsx` input section layout
- Generate button only appears when `inputs.length > 0`
- "Send as chat" uses existing `handleSend()` logic
- Generate button uses existing `onRunBatch()` logic
- Both actions should work with current instruction text
- Consider: should Generate also send the current text as instruction? (Probably yes)

---

## 6. Button Label Updates

### Problem
"Browse Images" and "Add Text" labels aren't clear enough.

### Current State
- **File:** `src/components/InputPanel.tsx`
- Empty state buttons (lines 192-212): "Browse Images", "Add Text"
- After images added (lines 289-309): "+ Add more images", "+ Add text prompt"

### Requirements
| Current Label | New Label |
|--------------|-----------|
| "Browse Images" | **"Upload Images"** |
| "Add Text" | **"Make Image with Text"** |
| "+ Add more images" | **"+ Upload Images"** |
| "+ Add text prompt" | **"+ Make Image with Text"** |

### Implementation Notes
- Simple string replacements in `InputPanel.tsx`
- Ensure button width accommodates longer text
- Keep consistent styling

---

## Summary Checklist

- [ ] **#1** - Out of scope (marketing site fix)
- [ ] **#2** - Add `ImagePreviewModal` for input thumbnails
- [ ] **#3** - Replace toggle with segmented "Run as batch" / "Combine images" control
- [ ] **#4** - Update Generate button to "Make X Images" / "Make Single Image"
- [ ] **#5** - Restructure chat input with integrated Generate button + "Send as chat"
- [ ] **#6** - Update button labels to "Upload Images" and "Make Image with Text"

---

## Files to Modify

1. `src/components/InputPanel.tsx` - #2, #3, #6
2. `src/components/Chat.tsx` - #4, #5
3. Possibly new: `src/components/ImagePreviewModal.tsx` - #2

---

## Testing Considerations

- Verify Generate button count updates when inputs added/removed
- Verify count updates with duplicate preset selection
- Test modal animations match existing modal behavior
- Ensure segmented control state persists correctly
- Test both "Send as chat" and "Generate" paths work with typed instruction

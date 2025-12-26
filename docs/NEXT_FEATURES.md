# Next 3 Features to Build for Peel

**Date:** December 26, 2025
**Status:** Recommended priorities based on codebase analysis
**Decision Maker:** Product team

---

## Overview

After comprehensive codebase review, these are the **top 3 recommended features** that would deliver maximum value with reasonable implementation effort.

All recommendations consider:
- ✅ Current architecture capabilities
- ✅ Existing infrastructure (Supabase, Netlify)
- ✅ User pain points
- ✅ Technical debt/maintenance burden
- ✅ Time to market

---

## 🥇 #1: Batch Templates System

### Why This Should Be First

**User Pain Point:** Users repeatedly run the same multi-step workflows:
- "Remove BG → Add Brand Color → Upscale" for product photos
- "Duplicate 5x → Different angles" for marketing content
- "Desaturate → Add warmth" for consistent brand aesthetic

Currently, users must:
1. Re-select all images
2. Re-enter the same instructions
3. Re-configure the same settings

**This is tedious and error-prone.**

### What It Does

Allows users to save complete batch configurations as reusable templates:

```
Template: "Product Photo Standard"
├─ Instructions: Remove BG, Add brand color #FF6B35, Upscale to 2K
├─ Image Size: 2K
├─ Processing Mode: Batch
└─ Presets Used: [REMOVE BG, ADD BRAND COLOR, UPSCALE]
```

User workflow:
1. Complete a batch normally
2. Click "Save as Template" → Name it
3. Next time: Upload images → Select template → Run (1 click!)

### Implementation Plan

**Complexity:** ⭐⭐⭐ Medium (2-3 days)

#### Database (Supabase)

New table: `batch_templates`

```sql
CREATE TABLE batch_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  instructions TEXT[],              -- Array of instruction strings
  display_instructions TEXT[],      -- Array of display text
  image_size TEXT DEFAULT '1K',     -- '1K', '2K', '4K'
  processing_mode TEXT DEFAULT 'batch', -- 'batch' or 'singleJob'
  preset_ids UUID[],                -- References to presets used (optional)
  is_favorite BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,    -- Track popularity
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_batch_templates_user_id ON batch_templates(user_id);
CREATE INDEX idx_batch_templates_favorite ON batch_templates(user_id, is_favorite) WHERE is_favorite = true;

-- RLS Policies
ALTER TABLE batch_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates" ON batch_templates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own templates" ON batch_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates" ON batch_templates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates" ON batch_templates
  FOR DELETE USING (auth.uid() = user_id);
```

Migration file: `supabase/migrations/004_batch_templates.sql`

#### Frontend Components

**New Hook:** `src/hooks/useBatchTemplates.ts`

```typescript
interface BatchTemplate {
  id: string;
  name: string;
  description?: string;
  instructions: string[];
  display_instructions: string[];
  image_size: '1K' | '2K' | '4K';
  processing_mode: 'batch' | 'singleJob';
  is_favorite: boolean;
  usage_count: number;
}

export function useBatchTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<BatchTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTemplates = async () => { /* ... */ };
  const saveTemplate = async (template: Omit<BatchTemplate, 'id'>) => { /* ... */ };
  const updateTemplate = async (id: string, updates: Partial<BatchTemplate>) => { /* ... */ };
  const deleteTemplate = async (id: string) => { /* ... */ };
  const applyTemplate = (template: BatchTemplate) => { /* ... */ };

  return { templates, loading, saveTemplate, updateTemplate, deleteTemplate, applyTemplate };
}
```

**Modified Component:** `src/components/Chat.tsx`

Add UI elements:
1. **Template Selector Dropdown** (above instruction textarea)
   - Shows saved templates
   - "Apply Template" button
   - Star icon for favorites

2. **Save Template Button** (near Run Batch)
   - Only enabled when instructions exist
   - Opens modal to name template
   - Auto-saves current configuration

**New Modal:** `src/components/TemplateSaveModal.tsx`

Simple form:
- Template name (required)
- Description (optional)
- "Mark as favorite" checkbox
- Save/Cancel buttons

**Modified Component:** `src/components/AccountModal.tsx`

Add new tab: "Templates"
- List of user's templates
- Edit/Delete/Favorite actions
- Usage count display
- "Duplicate template" action

#### User Flow

**Creating a Template:**
1. User sets up batch with instructions
2. Clicks "💾 Save as Template"
3. Modal appears → Enter name → Save
4. Template saved, confirmation shown

**Using a Template:**
1. User uploads images
2. Clicks template dropdown
3. Selects "Product Photo Standard"
4. Instructions, settings auto-populated
5. Click Run Batch

**Managing Templates:**
1. Open Account Modal → Templates tab
2. See all saved templates
3. Edit name/description
4. Star favorites (appear at top)
5. Delete unused templates
6. View usage count

### Success Metrics

- **Adoption:** % of users who create at least 1 template
- **Engagement:** Average templates per active user
- **Efficiency:** Time saved per batch (reduced setup time)
- **Retention:** Return users who use templates vs don't

### Technical Risks

**Low Risk:**
- Simple CRUD operations
- Existing auth/RLS patterns
- No external dependencies

**Potential Issues:**
- Template-preset conflict (if user deletes a preset used in template)
  - **Mitigation:** Store preset data in template (not just ID)
- Template versioning (if we change preset system later)
  - **Mitigation:** Include schema version field

---

## 🥈 #2: Usage Analytics Dashboard

### Why This Should Be Second

**User Pain Point:** "How much am I spending? What tasks cost the most?"

Currently:
- Users see token balance
- They see individual job history
- BUT: No aggregated insights, trends, or optimization suggestions

**This leads to:**
- Surprise token depletion
- No understanding of cost drivers
- Can't optimize for token efficiency

### What It Does

Visual analytics dashboard showing:

**Key Metrics:**
- Total tokens used (lifetime + last 30 days)
- Images processed (total + this month)
- Average tokens per image
- Estimated cost per image (in dollars)
- Token burn rate (tokens/day)

**Charts:**
- Line chart: Token usage over time (daily)
- Bar chart: Images processed per day
- Pie chart: Token usage by instruction type (Remove BG, Upscale, etc.)
- Table: Most expensive jobs (top 10)

**Insights:**
- "You use 45% of tokens on Upscale operations"
- "Average batch size: 12 images"
- "Tip: Batch larger jobs to reduce overhead"

### Implementation Plan

**Complexity:** ⭐⭐⭐ Medium (3-4 days)

#### Database (Use Existing!)

All data already exists in `job_logs` table. No migration needed!

Queries we'll use:

```sql
-- Total tokens used (lifetime)
SELECT
  SUM(total_tokens) as lifetime_tokens,
  SUM(images_submitted) as lifetime_images,
  AVG(total_tokens::float / NULLIF(images_submitted, 0)) as avg_tokens_per_image
FROM job_logs
WHERE user_id = '<user-id>' AND status = 'success';

-- Token usage over time (last 30 days)
SELECT
  DATE(created_at) as date,
  SUM(total_tokens) as tokens,
  SUM(images_submitted) as images
FROM job_logs
WHERE user_id = '<user-id>'
  AND status = 'success'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Most common instruction patterns
-- (This requires parsing instruction field - simplified version)
SELECT
  COUNT(*) as usage_count,
  AVG(total_tokens) as avg_tokens,
  SUM(total_tokens) as total_tokens
FROM job_logs
WHERE user_id = '<user-id>' AND status = 'success'
GROUP BY LEFT(instruction_length::text, 20)  -- Rough grouping
ORDER BY usage_count DESC
LIMIT 10;
```

#### Frontend Components

**Modified Component:** `src/components/AccountModal.tsx`

Add new tab: "Analytics" (between History and Settings)

**New Component:** `src/components/UsageChart.tsx`

```typescript
interface UsageChartProps {
  data: {
    date: string;
    tokens: number;
    images: number;
  }[];
  type: 'line' | 'bar';
}

export function UsageChart({ data, type }: UsageChartProps) {
  // Use lightweight charting library (recharts or visx)
  // Render responsive chart
}
```

**Modified Hook:** `src/contexts/AuthContext.tsx`

Add analytics data fetching:

```typescript
const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

const loadAnalytics = async () => {
  if (!user) return;

  // Fetch aggregated data from Supabase
  const { data, error } = await supabase
    .from('job_logs')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'success')
    .order('created_at', { ascending: false });

  // Process data for charts
  const processed = processAnalyticsData(data);
  setAnalytics(processed);
};
```

#### Charting Library

**Recommended:** [Recharts](https://recharts.org/)

**Why:**
- Lightweight (~100KB gzipped)
- React-native
- Responsive by default
- Good TypeScript support
- MIT licensed

**Alternative:** Build custom with D3.js (heavier, more flexible)

**Installation:**
```bash
npm install recharts
```

#### UI Layout

**Analytics Tab Structure:**

```
┌─────────────────────────────────────────┐
│  USAGE ANALYTICS                        │
├─────────────────────────────────────────┤
│  📊 Key Metrics                         │
│  ┌─────────┬──────────┬────────────┐   │
│  │ 125.4K  │ 1,247    │ 100.5      │   │
│  │ Tokens  │ Images   │ Avg/Image  │   │
│  └─────────┴──────────┴────────────┘   │
│                                         │
│  📈 Token Usage (Last 30 Days)         │
│  [Line chart]                          │
│                                         │
│  📊 Images Processed                   │
│  [Bar chart]                           │
│                                         │
│  💡 Insights                            │
│  • 45% of tokens on Upscale            │
│  • Avg batch: 12 images                │
│  • Peak usage: Weekdays 2-4pm          │
│                                         │
│  📋 Top 10 Most Expensive Jobs         │
│  [Table with job details]              │
└─────────────────────────────────────────┘
```

### Success Metrics

- **Engagement:** % of users who view analytics tab
- **Token awareness:** Correlation between analytics views and token purchases
- **Optimization:** Users who reduce avg tokens/image after viewing analytics

### Technical Risks

**Low Risk:**
- Uses existing data
- Read-only (no complex mutations)
- Lightweight library

**Considerations:**
- Large datasets (1000+ jobs) → Add pagination or limit to last 90 days
- Chart rendering performance → Use React.memo, virtualization
- Mobile responsiveness → Charts can be tricky, test thoroughly

---

## 🥉 #3: Preset Marketplace

### Why This Should Be Third

**User Pain Point:** "I don't know what presets to create"

Currently:
- Power users create sophisticated presets with templates, placeholders, validation
- Novice users stick to default 6 presets
- No way to discover or share advanced workflows

**Opportunity:**
- Community-driven content
- Virality (users share presets on social media)
- Reduced support burden (community helps itself)
- User engagement (gamification with ratings)

### What It Does

A marketplace where users can:

**Discover:**
- Browse public presets by category (Background, Color, Style, etc.)
- Search by keyword
- Filter by rating, popularity
- Preview preset details (prompt, examples)

**Use:**
- One-click import to personal preset library
- Star favorites
- Rate & review presets

**Share:**
- Publish personal presets (opt-in)
- See download count, ratings
- Edit/unpublish anytime
- Optional: Attribution link (user profile)

**Example Marketplace Listing:**

```
🎨 Product Photo: Clean White Background
By: @pro_photographer
⭐⭐⭐⭐⭐ (127 ratings) | 2.3K downloads

Description:
Perfect for e-commerce product shots. Removes background,
adds pure white (#FFFFFF), and enhances product details.

Category: Background Removal
Validation: None (direct preset)
Prompt: "Remove background completely and replace with pure
        white. Enhance product details and colors for
        professional e-commerce appearance."

[Preview] [Import to My Presets] [⭐ Rate]
```

### Implementation Plan

**Complexity:** ⭐⭐⭐⭐⭐ High (5-7 days)

#### Database (Supabase)

New tables:

```sql
-- Public presets (marketplace listings)
CREATE TABLE public_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Preset data (denormalized from user_presets)
  label VARCHAR(50) NOT NULL,
  description TEXT,
  category VARCHAR(50),              -- 'background', 'color', 'style', etc.
  preset_type VARCHAR(10) NOT NULL,  -- 'direct' or 'ask'
  prompt TEXT NOT NULL,
  ask_message TEXT,
  display_text_template VARCHAR(200),
  response_confirmation TEXT,
  validation_type VARCHAR(20),
  validation_min INTEGER,
  validation_max INTEGER,
  validation_error_message TEXT,

  -- Marketplace metadata
  is_published BOOLEAN DEFAULT true,
  download_count INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2),       -- 0.00 - 5.00
  rating_count INTEGER DEFAULT 0,

  -- Example images (optional URLs)
  example_before_url TEXT,
  example_after_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Preset ratings
CREATE TABLE preset_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id UUID REFERENCES public_presets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(preset_id, user_id)  -- One rating per user per preset
);

-- User's imported presets (tracking)
CREATE TABLE preset_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  public_preset_id UUID REFERENCES public_presets(id) ON DELETE CASCADE,
  imported_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, public_preset_id)
);

-- Indexes
CREATE INDEX idx_public_presets_category ON public_presets(category);
CREATE INDEX idx_public_presets_rating ON public_presets(average_rating DESC);
CREATE INDEX idx_public_presets_downloads ON public_presets(download_count DESC);
CREATE INDEX idx_preset_ratings_preset ON preset_ratings(preset_id);

-- RLS Policies
ALTER TABLE public_presets ENABLE ROW LEVEL SECURITY;

-- Anyone can read published presets
CREATE POLICY "Public presets are viewable by all" ON public_presets
  FOR SELECT USING (is_published = true);

-- Users can create their own public presets
CREATE POLICY "Users can publish own presets" ON public_presets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update/delete their own presets
CREATE POLICY "Users can manage own public presets" ON public_presets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own public presets" ON public_presets
  FOR DELETE USING (auth.uid() = user_id);

-- Similar policies for ratings and imports...
```

Migration: `supabase/migrations/005_preset_marketplace.sql`

#### Frontend Components

**New Page/Modal:** `src/components/PresetMarketplace.tsx`

Full-screen marketplace browser:

```typescript
export function PresetMarketplace() {
  const [category, setCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'recent' | 'rated'>('popular');
  const [presets, setPresets] = useState<PublicPreset[]>([]);

  // Grid layout with preset cards
  // Search bar, category filter, sort dropdown
  // Infinite scroll or pagination
}
```

**New Component:** `src/components/PresetCard.tsx`

Individual preset listing:

```typescript
interface PresetCardProps {
  preset: PublicPreset;
  onImport: (id: string) => void;
  onRate: (id: string, rating: number) => void;
}

export function PresetCard({ preset, onImport, onRate }: PresetCardProps) {
  // Card with:
  // - Preset name, description
  // - Author (user_id → username lookup)
  // - Star rating, download count
  // - Category badge
  // - "Import" button
  // - Rating widget (if user hasn't rated)
}
```

**Modified Component:** `src/components/PresetConfigModal.tsx`

Add new tab: "Marketplace"
- Embed `<PresetMarketplace />`
- "Publish Current Preset" button (in edit mode)

**New Hook:** `src/hooks/usePublicPresets.ts`

```typescript
export function usePublicPresets() {
  const { user } = useAuth();

  const browsePresets = async (filters: BrowseFilters) => { /* ... */ };
  const publishPreset = async (preset: UserPreset) => { /* ... */ };
  const importPreset = async (publicPresetId: string) => { /* ... */ };
  const ratePreset = async (presetId: string, rating: number, review?: string) => { /* ... */ };
  const unpublishPreset = async (publicPresetId: string) => { /* ... */ };

  return { browsePresets, publishPreset, importPreset, ratePreset, unpublishPreset };
}
```

#### User Flows

**Browsing Presets:**
1. User opens Preset Config Modal → Marketplace tab
2. Sees grid of popular presets
3. Filters by category "Background Removal"
4. Clicks preset to view details
5. Sees preview, description, ratings
6. Clicks "Import" → Preset added to personal library
7. Can now use in Chat.tsx

**Publishing a Preset:**
1. User creates custom preset in Config Modal
2. Clicks "Publish to Marketplace"
3. Modal: Add description, category, example images (optional)
4. Clicks "Publish"
5. Preset appears in marketplace
6. User can see download count, ratings in "My Published Presets" section

**Rating a Preset:**
1. User imports and uses a preset
2. Goes back to marketplace
3. Finds the preset
4. Clicks star rating (1-5)
5. Optionally adds written review
6. Rating saved, average updated

### Success Metrics

- **Content Growth:** # of published presets per week
- **Engagement:** % of users who browse marketplace
- **Adoption:** % of users who import at least 1 preset
- **Quality:** Average rating of published presets
- **Virality:** Presets shared outside app (social media links)

### Technical Risks

**Medium-High Risk:**
- Content moderation (spam, inappropriate presets)
  - **Mitigation:** User reporting, manual review queue
- Spam prevention (bots publishing junk)
  - **Mitigation:** Rate limiting, CAPTCHA on publish
- Attribution conflicts (user deletes account but presets remain)
  - **Mitigation:** "Created by [deleted user]" fallback
- Versioning (preset schema changes over time)
  - **Mitigation:** Schema version field, migration scripts

**Performance Considerations:**
- Large preset catalog (10k+ presets) → Pagination required
- Search performance → Consider full-text search (Supabase supports this)
- Image hosting for examples → Use Supabase Storage or external CDN

---

## Comparison Matrix

| Feature | User Value | Dev Effort | Maintenance | Time to Market |
|---------|-----------|-----------|-------------|----------------|
| **Batch Templates** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ (Medium) | ⭐⭐ (Low) | 2-3 days |
| **Analytics Dashboard** | ⭐⭐⭐⭐ | ⭐⭐⭐ (Medium) | ⭐⭐ (Low) | 3-4 days |
| **Preset Marketplace** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (High) | ⭐⭐⭐⭐ (High) | 5-7 days |

---

## Recommended Build Order

### Phase 1: Foundation (Week 1)
**Build: Batch Templates**
- Quick win for users
- Low maintenance burden
- Validates template concept before marketplace

### Phase 2: Insights (Week 2)
**Build: Analytics Dashboard**
- Helps users understand costs
- Drives token purchases (shows value)
- Uses existing data (low risk)

### Phase 3: Community (Week 3-4)
**Build: Preset Marketplace**
- Community engagement
- Content flywheel (more presets → more users → more presets)
- Requires moderation/support infrastructure first

---

## Alternative Approaches

### If Resources Are Limited

**Option A: Build Templates Only**
- Still huge value
- Ship in 3 days
- Get user feedback before committing to other features

**Option B: Build Analytics Only**
- Data-driven decision making
- Drives revenue (users see value → buy tokens)
- Skip templates if users don't batch frequently

**Option C: Simple Preset Sharing (not marketplace)**
- Users can export presets as JSON
- Share via copy/paste or file
- Import others' presets manually
- No moderation needed
- Effort: 1-2 days

### If Resources Are Abundant

**Build All 3 + Bonus:**
- Add **Preset Collections** (curated packs like "E-commerce Essentials")
- Add **Preset Versioning** (update published presets, users auto-sync)
- Add **Preset Analytics** (which presets are most used in your library)
- Add **Social Features** (follow users, notifications when they publish)

---

## Open Questions

1. **Monetization:** Should marketplace presets be free or paid?
   - Recommendation: Free initially, add paid option later (70/30 revenue split)

2. **Moderation:** Who approves marketplace listings?
   - Recommendation: Auto-publish with user reporting → manual review queue

3. **Attribution:** Should preset authors get credit/links?
   - Recommendation: Yes, include username + optional profile link

4. **Examples:** Require example images for marketplace?
   - Recommendation: Optional but encouraged (featured if included)

5. **Categories:** What preset categories to support?
   - Recommendation: Background, Color, Style, Size, Effects, Custom

---

## Conclusion

**Recommended Path:** Build all 3 in order (Templates → Analytics → Marketplace)

**Total Timeline:** 10-14 days for all features

**Expected Impact:**
- 🚀 Increased user retention (templates reduce friction)
- 💰 Increased token purchases (analytics show value)
- 🌟 Viral growth (marketplace encourages sharing)
- 📈 Community engagement (user-generated content)

**Next Steps:**
1. Validate priorities with product team
2. Finalize database schemas (review SQL)
3. Create detailed task breakdowns
4. Assign to development sprint
5. Set up analytics tracking (measure success)

---

**Document Version:** 1.0
**Last Updated:** December 26, 2025
**Decision Status:** Pending product review

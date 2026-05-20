-- Add featured_image_url column to articles table
ALTER TABLE articles ADD COLUMN featured_image_url TEXT;

-- Create SEO configuration table
CREATE TABLE IF NOT EXISTS seo_config (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL UNIQUE,
  canonical_tags TEXT,
  schema_types TEXT,
  keyword_focus TEXT,
  title_template TEXT,
  h_structure TEXT,
  readability_rules TEXT,
  image_guidance TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default SEO configuration for Hindi blogs
INSERT INTO seo_config (
  id,
  category,
  canonical_tags,
  schema_types,
  keyword_focus,
  title_template,
  h_structure,
  readability_rules,
  image_guidance
) VALUES (
  'default-hindi',
  'Default',
  'Include canonical tags to prevent duplicate content issues',
  'Article,BreadcrumbList,FAQPageSchema,OrganizationSchema,NewsArticleSchema',
  'Primary keyword should appear naturally in first 100 words of blog. Use variations and LSI keywords throughout.',
  'Primary Keyword + Benefit + Year (e.g., "Waiting List Kya Hai 2026 - Complete Guide")',
  'H1 (1 per page, main topic) → H2 (2-3, main sections) → H3 (under H2, subtopics)',
  'Small paragraphs (2-3 sentences), Simple Hindi/English mix (Hinglish), Bullet points for lists, Tables for comparisons, Bold highlights for key terms',
  'Trending topics with emotional appeal, Large images (1200x800px), WebP format, Descriptive filenames, ALT text with keywords'
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_seo_config_category ON seo_config(category);

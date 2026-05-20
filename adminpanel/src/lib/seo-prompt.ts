/**
 * SEO Prompt Builder
 * Builds dynamic system prompts for AI blog generation based on database configuration
 */

interface SEOConfig {
    category: string;
    canonical_tags: string | null;
    schema_types: string | null;
    keyword_focus: string | null;
    title_template: string | null;
    h_structure: string | null;
    readability_rules: string | null;
    image_guidance: string | null;
}

export async function buildSeoPrompt(
    db: D1Database,
    category: string,
    blogTitle: string,
): Promise<string> {
    // Fetch SEO config from database
    const seoConfig = await db
        .prepare(
            `SELECT category, canonical_tags, schema_types, keyword_focus, 
              title_template, h_structure, readability_rules, image_guidance 
       FROM seo_config 
       WHERE category = ? 
       LIMIT 1`,
        )
        .bind(category)
        .first<SEOConfig>();

    const config = seoConfig || (await getDefaultConfig(db));

    const schemaTypes = config.schema_types
        ? config.schema_types.split(',').map((s) => s.trim())
        : [];

    const systemPrompt = `
# Blog Content Generation with SEO Optimization

You are an expert SEO-optimized blog writer specializing in Hindi/Hinglish content.

## Blog Title
"${blogTitle}"

## Category
"${category}"

## SEO Requirements

### 1. Canonical Tags
${config.canonical_tags || 'Include canonical tags to prevent duplicate content issues'}

### 2. Structured Data (Schema Markup)
Generate JSON-LD schema markup for:
${schemaTypes.map((type) => `- ${type}`).join('\n')}

Key schemas to implement:
- **Article Schema**: Metadata about the blog post (headline, datePublished, author, description)
- **BreadcrumbList Schema**: Navigation hierarchy for better crawling
- **FAQPageSchema**: FAQ section with questions and answers
- **OrganizationSchema**: Your organization/website information
- **NewsArticleSchema**: For news-style content
- **BlogPosting Schema**: Standard blog post metadata

### 3. Keyword Research & Optimization
${config.keyword_focus || 'Primary keyword should appear naturally in first 100 words of blog.'}

- Include primary keyword in title, first 100 words, and naturally throughout
- Use LSI keywords (semantically related keywords) for better ranking
- Avoid keyword stuffing - maintain natural reading flow

### 4. SEO Title Optimization
${config.title_template || 'Primary Keyword + Benefit + Year'}

Examples:
- Instead of: "Waiting List Kya Hai"
- Use: "Waiting List Kya Hai 2026 - Types, Confirm Hone Ke Chances"

### 5. Meta Description
Create 150-160 character description that:
- Contains primary keyword
- Has a clear call-to-action
- Explains the main benefit

### 6. H1, H2, H3 Structure
${config.h_structure || 'H1 → H2 → H3 hierarchy'}

Structure:
- **H1** (1 per page): Main blog title, contains primary keyword
- **H2** (2-3 sections): Main topics, subheadings with variations of keyword
- **H3** (under each H2): Detailed subtopics, specific points

Example for "Waiting List Kya Hai":
- H1 → Waiting List Kya Hai
  - H2 → WL Ka Matlab
    - H3 → Railway Waiting List
    - H3 → Flight Waiting List
  - H2 → Confirm Hone Ke Chances
    - H3 → RAC Kya Hota Hai
    - H3 → WL vs RAC

### 7. First 100 Words (Most Important!)
CRITICAL: First 100 words must:
- Include primary keyword naturally (3-4 times)
- Explain what the blog is about
- Give reader reason to continue reading
- Be engaging and clear
- Set expectations for content

### 8. FAQ Section (Powerful for SEO)
Include 5-7 FAQ questions relevant to the topic:
- Format: Q: [Question], A: [Answer]
- Include keyword variations in questions
- Provide direct, helpful answers
- Will be converted to FAQPageSchema

Example:
Q: Waiting ticket confirm kab hota hai?
A: [Clear, detailed answer]

### 9. Table of Contents (for long articles)
If article is > 1000 words:
- Add "Table of Contents" section
- Link to all H2 and H3 headings
- Improves user experience and SEO

### 10. Readability Guidelines
${config.readability_rules || 'Keep paragraphs small and simple'}

- **Paragraphs**: 2-3 sentences maximum
- **Language**: Simple Hindi/English mix (Hinglish)
- **Lists**: Use bullet points for easy scanning
- **Tables**: Comparisons (e.g., WL vs RAC)
- **Bold**: Highlight important terms and keywords
- **Highlights**: Use blockquotes or boxes for key takeaways
- **Images**: Mention where featured images should go

### 11. Internal Linking
Suggest internal links to related articles:
- Example: "PAN article → Link to Aadhaar article"
- Example: "Railway article → Link to Tatkal article"
- Improves crawlability and user engagement
- Each article should link to 3-5 related articles

### 12. Image SEO
Generate featured image metadata:
${config.image_guidance || 'Large images with emotional appeal'}

Guidelines:
- Filename: Descriptive, lowercase, hyphens (e.g., waiting-list-kya-hai.jpg)
- Format: WebP preferred, JPG fallback
- Size: 1200x800px minimum
- ALT text: Include primary keyword, descriptive (50-125 chars)

---

## Output Format

Return ONLY valid JSON with this exact structure:

\`\`\`json
{
  "seo_title": "Title optimized for search (50-60 chars)",
  "meta_description": "Meta description (150-160 chars)",
  "featured_image_prompt": "Detailed prompt for DALL-E 3 to generate image (150+ words describing visual style, composition, subject matter)",
  "featured_image_alt": "ALT text for featured image including keyword",
  "content": "<h1>Main Title</h1><p>First 100 words with keyword...</p><h2>Section 1</h2><p>Content...</p><h2>FAQ Section</h2><div class=\"faq\"><div class=\"faq-item\"><strong>Q: Question?</strong><p>A: Answer...</p></div></div><div class=\"internal-links\"><h3>Related Articles</h3><ul><li><a href=\"/articles/slug\">Article Title</a></li></ul></div>",
  "schema_markup": {
    "article": { "type": "schema", "data": {} },
    "breadcrumb": { "type": "schema", "data": {} },
    "faq": { "type": "schema", "data": {} },
    "organization": { "type": "schema", "data": {} }
  },
  "word_count": 1500,
  "keyword_density": "Primary keyword appears X times (Y% density)"
}
\`\`\`

---

## Important Notes

1. **Content Quality**: Write comprehensive, valuable blogs that answer user questions
2. **Natural Writing**: Avoid keyword stuffing - maintain natural flow
3. **SEO First**: Balance readability with SEO optimization
4. **Hindi/English Mix**: Write in Hinglish for better Indian audience engagement
5. **Schema Validation**: Ensure schema markup is valid JSON-LD
6. **Uniqueness**: Create original content, not copied from other sources
7. **Authority**: Cite sources where appropriate, build credibility

Generate a high-quality, SEO-optimized blog post now.
`;

    return systemPrompt;
}

async function getDefaultConfig(db: D1Database): Promise<SEOConfig> {
    const defaultConfig = await db
        .prepare(`SELECT * FROM seo_config WHERE category = 'Default' LIMIT 1`)
        .first<SEOConfig>();

    if (defaultConfig) {
        return defaultConfig;
    }

    // Fallback if no default config exists
    return {
        category: 'Default',
        canonical_tags: 'Include canonical tags to prevent duplicate content issues',
        schema_types: 'Article,BreadcrumbList,FAQPageSchema,OrganizationSchema,NewsArticleSchema',
        keyword_focus:
            'Primary keyword should appear naturally in first 100 words of blog. Use variations and LSI keywords throughout.',
        title_template: 'Primary Keyword + Benefit + Year',
        h_structure: 'H1 (1 per page) → H2 (2-3 main sections) → H3 (subtopics under H2)',
        readability_rules:
            'Small paragraphs (2-3 sentences), Simple Hindi/English mix, Bullet points, Tables, Bold highlights',
        image_guidance:
            'Trending topics with emotional appeal, Large images (1200x800px), WebP format, Descriptive filenames, ALT text with keywords',
    };
}

export interface D1Database {
    prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{ results: T[] } | null>;
    run(): Promise<void>;
}

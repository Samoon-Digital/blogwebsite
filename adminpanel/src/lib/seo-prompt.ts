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

export type SeoPromptControls = {
    includeFaqs: boolean;
    includeToc: boolean;
    includeInternalLinks: boolean;
    includeExternalLinks: boolean;
    includeTables: boolean;
    useTrainingTitleStyle: boolean;
    useTrainingArticleStyle: boolean;
    useTrainingImageStyle: boolean;
    newsAngle: boolean;
};

export type TrainingStyleSet = {
    title: string[];
    article: string[];
    image: string[];
};

export type SeoPromptContext = {
    controls?: SeoPromptControls;
    trainingStyles?: TrainingStyleSet;
    relatedArticles?: Array<{ title: string; slug: string; category?: string | null }>;
    writerInstructions?: string;
    imageDirection?: string;
    inlineImageCount?: number;
    tutorialVideoUrl?: string;
};

export async function buildSeoPrompt(
    db: D1Database,
    category: string,
    blogTitle: string,
    context: SeoPromptContext = {},
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
    const controls = context.controls || {
        includeFaqs: true,
        includeToc: true,
        includeInternalLinks: true,
        includeExternalLinks: true,
        includeTables: true,
        useTrainingTitleStyle: true,
        useTrainingArticleStyle: true,
        useTrainingImageStyle: true,
        newsAngle: true,
    };
    const titleTrainingNotes = controls.useTrainingTitleStyle && context.trainingStyles?.title?.length
        ? context.trainingStyles.title.map((note, index) => `${index + 1}. ${note}`).join('\n')
        : 'No saved headline training notes available.';
    const articleTrainingNotes = controls.useTrainingArticleStyle && context.trainingStyles?.article?.length
        ? context.trainingStyles.article.map((note, index) => `${index + 1}. ${note}`).join('\n')
        : 'No saved article/body training notes available.';
    const imageTrainingNotes = controls.useTrainingImageStyle && context.trainingStyles?.image?.length
        ? context.trainingStyles.image.map((note, index) => `${index + 1}. ${note}`).join('\n')
        : 'No saved featured image training notes available.';
    const relatedArticles = context.relatedArticles?.length
        ? context.relatedArticles.map((article) => `- ${article.title}: /${article.slug}`).join('\n')
        : 'No related internal articles available.';
    const writerInstructions = context.writerInstructions?.trim() || 'No extra writing instructions provided.';
    const imageDirection = context.imageDirection?.trim() || 'No extra image direction provided.';
    const inlineImageCount = Math.max(0, Math.min(4, context.inlineImageCount || 0));
    const tutorialVideoUrl = context.tutorialVideoUrl?.trim() || '';

    const systemPrompt = `
# Blog Content Generation with SEO Optimization

You are an expert Hindi/Hinglish news editor and SEO blog writer for an India-focused website.

Editorial focus:
- Prefer news-style explainers: what happened, why it matters, who is affected, key facts, timeline, next steps.
- Keep the tone clear, useful, trustworthy and engaging without clickbait.
- When the topic is not breaking news, write it as a practical blog guide with a current-news angle where natural.
- Treat the user title as a rough topic. Always create a strong, SEO-aware Hindi/Hinglish headline instead of copying rough wording exactly.

## Blog Title
"${blogTitle}"

## Category
"${category}"

## Article Controls
- FAQs: ${controls.includeFaqs ? 'ON - include helpful FAQ section and FAQ schema.' : 'OFF - do not include FAQ section or FAQ schema.'}
- Table of Contents: ${controls.includeToc ? 'ON - include a compact table of contents for long articles.' : 'OFF - do not include table of contents.'}
- Internal Links: ${controls.includeInternalLinks ? 'ON - add inline internal links from the provided related articles where natural.' : 'OFF - avoid internal links.'}
- External Links: ${controls.includeExternalLinks ? 'ON - add authoritative external links where useful, especially for vacancy/student/government topics.' : 'OFF - avoid external links unless source citation is essential.'}
- Tables: ${controls.includeTables ? 'ON - use simple comparison/date/eligibility tables where useful.' : 'OFF - avoid HTML tables.'}
- Headline Training Style: ${controls.useTrainingTitleStyle ? 'ON - follow saved headline style notes below.' : 'OFF - ignore saved headline style notes.'}
- Article Training Style: ${controls.useTrainingArticleStyle ? 'ON - follow saved article/body style notes below.' : 'OFF - ignore saved article/body style notes.'}
- Featured Image Training Style: ${controls.useTrainingImageStyle ? 'ON - follow saved featured image notes below.' : 'OFF - ignore saved featured image notes.'}
- News Angle: ${controls.newsAngle ? 'ON - write with a current news/explainer angle.' : 'OFF - write as an evergreen practical guide.'}
- Inline Section Images: ${inlineImageCount > 0 ? `ON - plan ${inlineImageCount} supporting in-article images aligned with major sections.` : 'OFF - do not plan supporting in-article images.'}

## Saved Headline Training Notes
${titleTrainingNotes}

## Saved Article/Body Training Notes
${articleTrainingNotes}

## Saved Featured Image Training Notes
${imageTrainingNotes}

## Related Internal Articles Available
${relatedArticles}

## Custom Writer Instructions
${writerInstructions}

## Image Direction
${imageDirection}

## Tutorial Video URL
${tutorialVideoUrl || 'No tutorial video provided.'}

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

Headline rules:
- Think like a Hindi news desk editor and silently draft 3 headline options before choosing the strongest one.
- The final headline should feel sharper than the raw topic by surfacing the key update, benefit, warning, date, audience, or next step.
- Prefer patterns like: topic + big update, topic + what changed, topic + who is affected, topic + deadline/timeline, or topic + practical payoff.
- Stay factual and clean. Avoid fake suspense, all-caps, emoji, or punctuation spam.
- Prefer a strong medium-length headline instead of an ultra-short one. Usually target 8-14 words when natural.

### 5. Meta Description
Create 150-160 character description that:
- Contains primary keyword
- Has a clear call-to-action
- Explains the main benefit

### 6. H1, H2, H3 Structure
${config.h_structure || 'H1 → H2 → H3 hierarchy'}

Structure:
- **H1** (1 per page): Main blog title, contains primary keyword. The website renderer adds this from the article title, so do not include an <h1> tag inside the returned content body.
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
${controls.includeFaqs ? 'Include 4-5 FAQ questions relevant to the topic:' : 'Do not include FAQ questions for this article.'}
- Format: Q: [Question], A: [Answer]
- Include keyword variations in questions
- Provide direct, helpful answers
- Will be converted to FAQPageSchema

Example:
Q: Waiting ticket confirm kab hota hai?
A: [Clear, detailed answer]

### 9. Table of Contents (for long articles)
${controls.includeToc ? 'If article is > 1000 words:' : 'Do not include a table of contents.'}
- Add "Table of Contents" section
- Link to all H2 and H3 headings
- Improves user experience and SEO

### 10. Readability Guidelines
${config.readability_rules || 'Keep paragraphs small and simple'}

- **Paragraphs**: 2-3 sentences maximum
- **Language**: Simple Hindi/English mix (Hinglish)
- **Lists**: Use bullet points for easy scanning
- **Tables**: ${controls.includeTables ? 'Use comparisons, dates, eligibility, fees, vacancy breakdowns, or important timelines when useful' : 'Avoid tables in this article'}
- **Bold**: Highlight important terms and keywords
- **Highlights**: Use blockquotes or boxes for key takeaways
- **Images**: Mention where featured images should go
- **DOM Size**: Keep HTML lean. Use semantic p, h2, h3, ul, ol, table only when useful. Avoid unnecessary wrapper divs and deeply nested elements.

### 11. Internal Linking
${controls.includeInternalLinks ? 'Add inline internal links to related articles:' : 'Internal linking is OFF for this article.'}
- Example: "PAN article → Link to Aadhaar article"
- Example: "Railway article → Link to Tatkal article"
- Improves crawlability and user engagement
- Use actual href values from "Related Internal Articles Available" when relevant.
- Add links inside paragraphs naturally, not only at the bottom.

### 11B. External Linking
${controls.includeExternalLinks ? `For vacancy, student, admit card, result, scholarship, exam, government scheme, and application topics:
- Add authoritative external links where useful.
- Prefer official domains such as gov.in, nic.in, nta.ac.in, ssc.gov.in, upsc.gov.in, railway recruitment boards, university/exam portals.
- External links must use target="_blank" rel="noopener noreferrer".
- Do not invent fake official URLs.
- Do not link to or mention the scraped/source website unless it is the official government/exam portal itself.
- If exact official URL is not known, write plain text without a link.` : 'External linking is OFF. Do not add external links or source citations.'}

### 12. Image SEO
Generate featured image metadata:
${config.image_guidance || 'Large images with emotional appeal'}

Guidelines:
- Filename: Descriptive, lowercase, hyphens (e.g., waiting-list-kya-hai.avif)
- Format: AVIF delivery
- Size: Google Discover-friendly large image, at least 1200px wide, 16:9 crop-safe composition
- ALT text: Include primary keyword, descriptive (50-125 chars)
- Apply "Saved Featured Image Training Notes" directly inside featured_image_prompt when they are available.
- Respect "Image Direction" for both featured and inline image ideas when provided.

### 12B. Optional Inline Images Inside Article
${inlineImageCount > 0 ? `Plan exactly ${inlineImageCount} supporting in-article images.` : 'Do not plan any inline images.'}
- Each inline image should support a specific section, example, workflow, job role, comparison, or real-world scenario from the article.
- Prompts must be visually specific, useful, editorial, and safe for a Hindi news/blog website.
- Do not mention prompt text inside article content.
- Inline image prompts should complement the article, not repeat the featured image.

### 12C. Tutorial Video
${tutorialVideoUrl ? 'A tutorial video URL is provided and the website will embed it automatically at the very end of the article.' : 'No tutorial video will be embedded.'}
- If a tutorial video URL is provided, add a short natural lead-in sentence near the close of the article so the ending transitions well into the video section.
- Do not output iframe/embed code for the video. Backend will place the video block automatically.

---

## Output Format

Return ONLY valid JSON with this exact structure:

\`\`\`json
{
  "seo_title": "Title optimized for search (roughly 55-72 chars, strong and readable)",
  "meta_description": "Meta description (150-160 chars)",
  "featured_image_prompt": "Detailed prompt for GPT Image to generate image (150+ words describing visual style, composition, subject matter)",
  "featured_image_alt": "ALT text for featured image including keyword",
  "content": "<p>First 100 words with keyword...</p><h2>Section 1</h2><p>Content...</p><h2>FAQ Section</h2><div class=\"faq\"><div class=\"faq-item\"><strong>Q: Question?</strong><p>A: Answer...</p></div></div><div class=\"internal-links\"><h3>Related Articles</h3><ul><li><a href=\"/articles/slug\">Article Title</a></li></ul></div>",
  "inline_images": [
    {
      "prompt": "Prompt for a supporting in-article image",
      "alt": "ALT text for that supporting image",
      "caption": "Short caption in Hindi/Hinglish"
    }
  ],
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
8. **Body HTML Only**: Return only article body HTML in content. Do not include <html>, <head>, <body>, duplicate <title>, meta tags, or a duplicate <h1>.
9. **Links**: Use valid <a href="..."> anchors. Internal links should point to site slugs like "/slug"; external links must use target="_blank" rel="noopener noreferrer".
10. **No Source Disclosure**: Never include "Reporting Source", "Source", source website name, source page title labels, or any note saying the article was created from another website.
11. **Training Fidelity**: When saved training notes are ON, apply them only to the matching layer: headline notes for title tone, article notes for body structure/voice, and image notes for featured image prompt direction.
12. **Inline Images Array**: Return exactly ${inlineImageCount} inline_images items when Inline Section Images is ON, otherwise return an empty array.

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

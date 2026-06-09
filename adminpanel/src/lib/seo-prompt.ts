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
    featuredImageInstruction?: string;
    imageDirection?: string;
    inlineImageCount?: number;
    tutorialVideoUrl?: string;
};

function normalizeTargetCategoryKey(category: string | null | undefined) {
    return (category || '')
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ');
}

function compactTargetCategoryKey(category: string | null | undefined) {
    return normalizeTargetCategoryKey(category).replace(/\s+/g, '');
}

function isVacancyCategory(category: string | null | undefined) {
    const key = normalizeTargetCategoryKey(category);
    const compact = compactTargetCategoryKey(category);
    return ['भर्ती', 'job', 'jobs', 'vacancy', 'recruitment', 'bharti', 'naukri', 'sarkari naukri'].includes(key)
        || compact === 'sarkarinaukri';
}

function isAdmitCardCategory(category: string | null | undefined) {
    const key = normalizeTargetCategoryKey(category);
    const compact = compactTargetCategoryKey(category);
    return ['एडमिट कार्ड', 'admit card', 'admitcard', 'hall ticket', 'hallticket'].includes(key)
        || compact === 'एडमिटकार्ड';
}

function isAdmissionsCategory(category: string | null | undefined) {
    return ['admissions', 'admission', 'प्रवेश'].includes(normalizeTargetCategoryKey(category));
}

function isTargetedStructuredCategory(category: string) {
    return isVacancyCategory(category) || isAdmitCardCategory(category) || isAdmissionsCategory(category);
}

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
    const featuredImageInstruction = context.featuredImageInstruction?.trim()
        || context.imageDirection?.trim()
        || 'No extra featured image instruction provided.';
    const tutorialVideoUrl = context.tutorialVideoUrl?.trim() || '';
    const isVacancyArticle = isVacancyCategory(category);
    const isTargetedStructuredArticle = isTargetedStructuredCategory(category);
    if (isTargetedStructuredArticle) {
        return `You are a Hindi education/jobs editor for Hindiline.

Create a compact, factual Hindi article package for this category only: "${category}".
Title: "${blogTitle}"

Use the private source/user topic only as background. Do not mention source website names. Do not invent exact dates, post counts, fees, official URLs, or eligibility. If a fact is missing, write "जल्द जारी" or "आधिकारिक नोटिफिकेशन देखें".

Return ONLY valid JSON with this exact shape:
{
  "seo_title": "Readable Hindi SEO title, 50-65 chars",
  "meta_description": "120-160 chars Hindi summary with main date/action",
  "primary_keyword": "Main search keyword used naturally in the summary",
  "featured_image_prompt": "90-150 words, specific Hindi news thumbnail/recruitment update card prompt, department-specific visual, useful poster/editorial composition",
  "featured_image_alt": "Hindi alt text",
  "content": "<p>1-2 line Hindi summary only.</p>",
  "targeted_article_data": {
    "summary": "2 short Hindi sentences",
    "quickFacts": [{"label":"कुल पद","value":"295","tone":"blue"}],
    "importantDates": [{"label":"आवेदन शुरू","value":"16 जून 2026","status":"घोषित"}],
    "postsOrSeats": [{"label":"Platoon Commander","value":"52 पद","description":"short detail"}],
    "fees": [{"label":"General / OBC / EWS","value":"₹25","note":"online payment"}],
    "eligibility": [{"title":"शैक्षणिक योग्यता","description":"short factual detail","note":"optional"}],
    "ageLimit": [{"label":"न्यूनतम आयु","value":"21 वर्ष","note":"optional"}],
    "selectionProcess": [{"step":"01","title":"Shortlisting","description":"short detail"}],
    "howToApply": [{"step":"1","title":"Official website","description":"short detail"}],
    "documents": [{"title":"Aadhaar Card","description":"आधार कार्ड"}],
    "officialLinks": [{"label":"Official Website देखें","url":"https://example.gov.in"}],
    "faqs": [{"question":"आवेदन कब शुरू होंगे?","answer":"short answer"}],
    "warningNote": "अभ्यर्थी आवेदन से पहले आधिकारिक नोटिफिकेशन जरूर पढ़ें।"
  },
  "inline_images": [],
  "schema_markup": {
    "article": {"type":"schema","data":{}},
    "breadcrumb": {"type":"schema","data":{}},
    "faq": {"type":"schema","data":{}},
    "organization": {"type":"schema","data":{}}
  },
  "word_count": 500,
  "keyword_density": "natural"
}

Rules:
- Fill as many targeted_article_data arrays as facts allow; keep each item short.
- Jobs/recruitment: prioritize quickFacts, importantDates, postsOrSeats, fees, eligibility, ageLimit, selectionProcess, howToApply, documents, and only the useful FAQs the article genuinely needs.
- Admit card: prioritize quickFacts, importantDates, eligibility/exam details, howToApply/download steps, documents, officialLinks, and only the useful FAQs the article genuinely needs.
- Admissions: prioritize dates, seats/courses, fees, eligibility, ageLimit only if relevant, howToApply, documents, and only the useful FAQs the article genuinely needs.
- Decide the FAQ count from the available facts and reader intent. Return 0-10 concise, non-repetitive FAQs; use an empty array when FAQs would be filler.
- Featured image prompt must not request a generic laptop/office/candidate-at-desk stock photo. For jobs, make it a recruitment news card with department/post-specific workplace or uniform/document visual. For admit card, show exam/admit-card document and exam hall/checklist visual. For admissions, show college/institute admission form/campus visual.
- Use image text only as 2-4 large clean label elements such as department acronym/name, short subject, year, post count or last date. Do not put the full article title on the image. Avoid tiny Hindi paragraphs and random decorative text.
- If exact official URL is not known, return officialLinks as [].
- Keep token use low: no long article body HTML. Backend will render the premium UI.`;
    }
    const vacancyArticleInstructions = isVacancyArticle
        ? `## Vacancy Article Mode
- This is a jobs/vacancy article, so keep it short, practical, and highly scannable.
- Only include the main reader-useful sections: overview/highlights, important dates, post or vacancy details, eligibility, fees, age limit, selection process, how to apply, important links, and useful FAQs when needed.
- Do not add background explainers, history, generic career advice, motivational filler, trend commentary, or extra descriptive sections from your side.
- Target roughly 450-750 words total for the article body, including any useful FAQs.
- Use at most 5 main H2 sections before an optional FAQ section.
- Keep each section tight: 1 short paragraph and/or 2-5 bullets, or one small useful table only when it directly helps.
- Do not include a table of contents for vacancy/job articles.`
        : '';

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
- FAQs: ${controls.includeFaqs ? 'ON - independently choose 0-10 useful FAQs; omit both the section and FAQ schema when none are needed.' : 'OFF - do not include FAQ section or FAQ schema.'}
- Table of Contents: ${controls.includeToc ? 'ON - include a compact table of contents for long articles.' : 'OFF - do not include table of contents.'}
- Internal Links: ${controls.includeInternalLinks ? 'ON - add inline internal links from the provided related articles where natural.' : 'OFF - avoid internal links.'}
- External Links: ${controls.includeExternalLinks ? 'ON - add authoritative external links where useful, especially for vacancy/student/government topics.' : 'OFF - avoid external links unless source citation is essential.'}
- Tables: ${controls.includeTables ? 'ON - use simple comparison/date/eligibility tables where useful.' : 'OFF - avoid HTML tables.'}
- Headline Training Style: ${controls.useTrainingTitleStyle ? 'ON - follow saved headline style notes below.' : 'OFF - ignore saved headline style notes.'}
- Article Training Style: ${controls.useTrainingArticleStyle ? 'ON - follow saved article/body style notes below.' : 'OFF - ignore saved article/body style notes.'}
- Featured Image Training Style: ${controls.useTrainingImageStyle ? 'ON - follow saved featured image notes below.' : 'OFF - ignore saved featured image notes.'}
- News Angle: ${controls.newsAngle ? 'ON - write with a current news/explainer angle.' : 'OFF - write as an evergreen practical guide.'}
- Inline Section Images: ON - let the article decide useful supporting images and place them near the most relevant sections.

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

## Featured Image Instruction
${featuredImageInstruction}

## Tutorial Video URL
${tutorialVideoUrl || 'No tutorial video provided.'}

${vacancyArticleInstructions}

## SEO Requirements

### 1. Canonical Tags
${config.canonical_tags || 'Include canonical tags to prevent duplicate content issues'}

### 2. Structured Data (Schema Markup)
Generate JSON-LD schema markup for:
${schemaTypes.map((type) => `- ${type}`).join('\n')}

Key schemas to implement:
- **NewsArticle Schema**: Present every article as a news-style article with headline, datePublished, dateModified, author, publisher, description, and mainEntityOfPage
- **BreadcrumbList Schema**: Navigation hierarchy for better crawling
- **FAQPageSchema**: Generate only when matching questions and answers are visibly present in the article
- **OrganizationSchema**: Your organization/website information
- **ImageObject Schema**: Include featured image and every useful inline image with URL/contentUrl, alt/description, caption, width and height when known
- **Speakable Schema**: Add speakable selectors for the H1, dek/summary and first useful paragraph where applicable
- **WebSite SearchAction**: Website schema should support site search with a query input
- Do not generate JobPosting schema for any article. Keep jobs/vacancy/recruitment posts as NewsArticle-style content only.

### 3. Keyword Research & Optimization
${config.keyword_focus || 'Primary keyword should appear naturally in first 100 words of blog.'}

- Include primary keyword in title, first 100 words, and naturally throughout
- Return the chosen main search keyword in "primary_keyword"; it should be the same phrase readers would search.
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
Create 120-160 character description that:
- Contains primary keyword
- Has a clear call-to-action
- Explains the main benefit
- Starts with a crisp, human summary so its first 18-26 words can also work as the visible article description without feeling truncated
- Avoid repetitive keyword stuffing or robotic phrasing in the opening line

### 6. H1, H2, H3 Structure
${config.h_structure || 'H1 → H2 → H3 hierarchy'}

Structure:
- **H1** (1 per page): Main blog title, contains primary keyword. The website renderer adds this from the article title, so never include an <h1> tag anywhere inside the returned content body.
- **H2** (${isVacancyArticle ? '3-5 sections only' : '2-3 sections'}): Main topics, subheadings with variations of keyword
- **H3** (under each H2): ${isVacancyArticle ? 'Use sparingly only if a key detail must be split out' : 'Detailed subtopics, specific points'}

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
- Include primary keyword naturally (usually 1-2 times, only more if it still reads naturally)
- Start with a concise answer summary or quick-facts style opening so search users and AI answer engines can understand the direct answer immediately
- Explain what the blog is about
- Give reader reason to continue reading
- Be engaging and clear
- Set expectations for content
- Keep the first paragraph concise and human because the opening summary may be reused as the article description/dek

### 8. FAQ Section (Powerful for SEO)
${controls.includeFaqs ? 'Decide how many FAQs the article genuinely needs and include 0-10 concise, non-repetitive questions at the end. Omit the FAQ section when it would add no useful information:' : 'Do not include FAQ questions for this article.'}
- Format: Q: [Question], A: [Answer]
- Include keyword variations in questions
- Provide direct, helpful answers
- Visible FAQs will be converted to FAQPageSchema; never return FAQ schema without a matching visible FAQ

Example:
Q: Waiting ticket confirm kab hota hai?
A: [Clear, detailed answer]

### 9. Table of Contents (for long articles)
${isVacancyArticle ? 'Do not include a table of contents for vacancy/job articles.' : controls.includeToc ? 'If article is > 1000 words:' : 'Do not include a table of contents.'}
${isVacancyArticle ? '- Keep the article directly scannable without a TOC section' : '- Add "Table of Contents" section'}
${isVacancyArticle ? '- Start with the key update and move straight into main details' : '- Link to all H2 and H3 headings'}
${isVacancyArticle ? '- Avoid any extra layout filler before the useful sections' : '- Improves user experience and SEO'}

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
- If related articles are available, include at least 2 natural inline internal links in the body when possible. This is required for crawl paths and topical authority.
- Do not leave the article body without inline internal links when relevant related articles are provided.
- Do not output a bottom related-articles CTA block and do not use the wrapper <div class="internal-links">. The backend will append one clean related block automatically.
- Internal article links must use the exact provided slug paths like "/article-slug", never "/articles/article-slug".

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
- Respect "Featured Image Instruction" only for featured_image_prompt. Do not force that instruction into inline images unless it also appears in Custom Writer Instructions.
- Featured image prompt must be article-specific and click-worthy: use the article title/source facts/instructions to create a useful news-thumbnail scene with a strong visual hook, not a generic human photo or plain background.
- For normal featured images, allow only 2-4 large clean readable label-style elements when they genuinely improve click clarity, such as department/name, short subject, year, count, date, result/admit card label. Do not put the full article title on the image; avoid tiny paragraphs, random letters, and gibberish text.

### 12B. AI-Placed Inline Images Inside Article
- Plan useful supporting in-article images for normal long-form articles. Usually return 2-6 inline_images, but use fewer for short articles and only when a visual improves understanding.
- If Custom Writer Instructions name specific images/scenes, create one inline_images item for each meaningful named image/scene when it fits the article.
- Each inline image should support a specific section, example, workflow, job role, comparison, or real-world scenario from the article.
- Prompts must be visually specific, useful, editorial, and safe for a Hindi news/blog website.
- Do not mention prompt text inside article content.
- For every inline image, create a short lowercase hyphenated anchor such as "track-maintainer" or "salary-table".
- In content, place exactly one invisible anchor near the best location for that image, using single quotes in the HTML attribute: <span data-inline-image-anchor='track-maintainer'></span>
- Because content is inside a JSON string, escape any double quotes inside HTML attributes or use single quotes for HTML attributes.
- Put the anchor after the paragraph that introduces the section/example, or immediately below the most relevant H2/H3 if the section starts with the visual.
- Do not place image anchors in or immediately after Table of Contents, FAQ, related-articles blocks, or video sections.
- Do not use [IMAGE_PROMPT_1] placeholders.
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
  "seo_title": "Title optimized for search (50-65 chars, strong and readable)",
  "meta_description": "Meta description (120-160 chars)",
  "primary_keyword": "Main search keyword naturally used in the first 100 words",
  "featured_image_prompt": "Detailed prompt for GPT Image to generate image (150+ words describing visual style, composition, subject matter)",
  "featured_image_alt": "ALT text for featured image including keyword",
  "content": "<p>First 100 words with keyword...</p><h2>Section 1</h2><p>Content with a natural internal link like <a href=\"/article-slug\">Article Title</a> when relevant.</p>",
  "inline_images": [
    {
      "name": "Short image name",
      "prompt": "Prompt for a supporting in-article image",
      "alt": "ALT text for that supporting image",
      "caption": "Short caption in Hindi/Hinglish",
      "anchor": "same-anchor-used-in-content",
      "placement_heading": "Closest H2 or H3 heading text"
    }
  ],
  "schema_markup": {
    "article": { "type": "schema", "data": {} },
    "breadcrumb": { "type": "schema", "data": {} },
    "faq": { "type": "schema", "data": {} },
    "organization": { "type": "schema", "data": {} }
  },
  "word_count": ${isVacancyArticle ? 650 : 1500},
  "keyword_density": "Primary keyword appears X times (Y% density)"
}
\`\`\`

---

## Important Notes

1. **Content Quality**: Write comprehensive, valuable blogs that answer user questions
${isVacancyArticle ? '1B. **Vacancy Focus**: Keep vacancy articles concise and action-focused. Do not add extra explanatory filler beyond the core recruitment details and any genuinely useful FAQs.' : ''}
2. **Natural Writing**: Avoid keyword stuffing - maintain natural flow
3. **SEO First**: Balance readability with SEO optimization
4. **Hindi/English Mix**: Write in Hinglish for better Indian audience engagement
5. **Schema Validation**: Ensure schema markup is valid JSON-LD
6. **Uniqueness**: Create original content, not copied from other sources
7. **Authority**: Cite sources where appropriate, build credibility
8. **Body HTML Only**: Return only article body HTML in content. Do not include <html>, <head>, <body>, duplicate <title>, meta tags, or any <h1>.
9. **Links**: Use valid <a href="..."> anchors. Internal links should point to site slugs like "/slug"; external links must use target="_blank" rel="noopener noreferrer".
10. **No Source Disclosure**: Never include "Reporting Source", "Source", source website name, source page title labels, or any note saying the article was created from another website.
11. **Training Fidelity**: When saved training notes are ON, apply them only to the matching layer: headline notes for title tone, article notes for body structure/voice, and image notes for featured image prompt direction.
12. **Inline Images Array**: For normal articles, return a useful inline_images array that matches the anchors placed in content. For targeted/jobs/admission/admit-card articles, the separate targeted prompt returns an empty inline_images array.

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

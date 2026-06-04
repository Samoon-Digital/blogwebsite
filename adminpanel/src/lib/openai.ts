/**
 * OpenAI Integration
 * Handles Hindi news/blog generation with GPT-5.5 and featured image generation.
 */

const DEFAULT_TEXT_MODEL = 'gpt-5.5';
const DEFAULT_IMAGE_MODEL = 'gpt-image-2';

type OpenAIClientConfig = {
    apiKey: string;
    trackingId?: string;
    textModel?: string;
    imageModel?: string;
};

export interface GeneratedBlogContent {
    seo_title: string;
    meta_description: string;
    featured_image_prompt: string;
    featured_image_alt: string;
    content: string;
    targeted_article_data?: TargetedArticleData | null;
    inline_images?: InlineImagePlan[];
    schema_markup: Record<string, unknown>;
    word_count: number;
    keyword_density: string;
}

export interface TargetedArticleData {
    summary?: string;
    quickFacts?: Array<{ label: string; value: string; tone?: string }>;
    importantDates?: Array<{ label: string; value: string; status?: string }>;
    postsOrSeats?: Array<{ label: string; value: string; description?: string }>;
    fees?: Array<{ label: string; value: string; note?: string }>;
    eligibility?: Array<{ title: string; description: string; note?: string }>;
    ageLimit?: Array<{ label: string; value: string; note?: string }>;
    selectionProcess?: Array<{ step: string; title: string; description: string }>;
    howToApply?: Array<{ step: string; title: string; description: string }>;
    documents?: Array<{ title: string; description?: string }>;
    officialLinks?: Array<{ label: string; url: string }>;
    faqs?: Array<{ question: string; answer: string }>;
    warningNote?: string;
}

export interface InlineImagePlan {
    prompt: string;
    alt: string;
    caption: string;
}

export interface GeneratedImage {
    bytes: Uint8Array;
    contentType: string;
    extension: string;
    altText: string;
}

export interface BlogTopicResult {
    blog_title: string;
    category: string;
    reason: string;
}

export interface TrainingAnalysisResult {
    title_style: string;
    article_style: string;
    image_style: string;
    linking_style: string;
    summary: string;
}

export interface SourceArticleContext {
    url: string;
    title?: string;
    text: string;
}

class OpenAIClient {
    private apiKey: string;
    private trackingId?: string;
    private textModel: string;
    private imageModel: string;
    private baseUrl = 'https://api.openai.com/v1';

    constructor(config: OpenAIClientConfig) {
        if (!config.apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
        }
        this.apiKey = config.apiKey;
        this.trackingId = config.trackingId;
        this.textModel = config.textModel || DEFAULT_TEXT_MODEL;
        this.imageModel = config.imageModel || DEFAULT_IMAGE_MODEL;
    }

    private headers() {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
        };

        if (this.trackingId) {
            headers['X-Samoon-Tracking-ID'] = this.trackingId;
        }

        return headers;
    }

    private async readApiError(response: Response, serviceName: string) {
        try {
            const error = (await response.json()) as { error?: { message?: string } };
            return `${serviceName} API error: ${error.error?.message || 'Unknown error'}`;
        } catch {
            return `${serviceName} API error: HTTP ${response.status}`;
        }
    }

    private extractResponsesText(data: unknown, serviceName: string) {
        const response = data as {
            output_text?: string;
            status?: string;
            incomplete_details?: { reason?: string };
            output?: Array<{
                type?: string;
                status?: string;
                content?: Array<{ type?: string; text?: string }>;
            }>;
        };

        if (typeof response.output_text === 'string' && response.output_text.trim()) {
            return response.output_text.trim();
        }

        const textParts: string[] = [];
        for (const item of response.output || []) {
            for (const content of item.content || []) {
                if (typeof content.text === 'string' && content.text.trim()) {
                    textParts.push(content.text);
                }
            }
        }

        const text = textParts.join('\n').trim();
        if (text) {
            return text;
        }

        const details = [
            response.status ? `status: ${response.status}` : '',
            response.incomplete_details?.reason ? `reason: ${response.incomplete_details.reason}` : '',
        ]
            .filter(Boolean)
            .join(', ');
        throw new Error(
            `${serviceName} returned no text output${details ? ` (${details})` : ''}. Check the model output limit and account/model access.`,
        );
    }

    private parseJson<T>(raw: string, label: string): T {
        const cleaned = raw
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        try {
            return JSON.parse(cleaned) as T;
        } catch {
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                try {
                    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
                } catch {
                    // Fall through to the clearer error below.
                }
            }
            throw new Error(`Failed to parse ${label} response as JSON`);
        }
    }

    private extractJsonString(raw: string) {
        const cleaned = raw
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
        const start = cleaned.indexOf('{');
        if (start === -1) {
            return '';
        }

        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = start; index < cleaned.length; index += 1) {
            const char = cleaned[index];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
                continue;
            }
            if (inString) {
                continue;
            }
            if (char === '{') {
                depth += 1;
            } else if (char === '}') {
                depth -= 1;
                if (depth === 0) {
                    return cleaned.slice(start, index + 1);
                }
            }
        }

        return cleaned.slice(start);
    }

    private async repairJsonResponse<T>(raw: string, label: string, fallback: T): Promise<T> {
        try {
            return this.parseJson<T>(this.extractJsonString(raw) || raw, label);
        } catch {
            // Continue to repair pass.
        }

        try {
            const repaired = await this.createJsonResponse(
                'You repair malformed model output into valid JSON. Return valid JSON only. No markdown.',
                `Repair this ${label} into a JSON object with the same keys and concise string values:\n${raw.slice(0, 6000)}`,
                1400,
            );
            return this.parseJson<T>(repaired, label);
        } catch {
            return fallback;
        }
    }

    private scalarText(value: unknown, fallback = ''): string {
        if (typeof value === 'string') {
            return value.trim() || fallback;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        if (Array.isArray(value)) {
            return value
                .map((item) => this.scalarText(item))
                .filter(Boolean)
                .join('; ')
                .trim() || fallback;
        }
        if (value && typeof value === 'object') {
            return Object.values(value as Record<string, unknown>)
                .map((item) => this.scalarText(item))
                .filter(Boolean)
                .join('; ')
                .trim() || fallback;
        }
        return fallback;
    }

    private async createJsonResponse(systemPrompt: string, userPrompt: string, maxOutputTokens: number) {
        const response = await fetch(`${this.baseUrl}/responses`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                model: this.textModel,
                instructions: systemPrompt,
                input: `${userPrompt}\n\nReturn valid JSON only.`,
                max_output_tokens: maxOutputTokens,
                text: {
                    format: { type: 'json_object' },
                },
            }),
        });

        if (!response.ok) {
            throw new Error(await this.readApiError(response, 'OpenAI'));
        }

        return this.extractResponsesText(await response.json(), 'OpenAI');
    }

    private normalizeInlineImages(value: unknown): InlineImagePlan[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map((item) => {
                const record = item as Record<string, unknown>;
                const prompt = this.scalarText(record?.prompt, '');
                const alt = this.scalarText(record?.alt, '');
                const caption = this.scalarText(record?.caption, '');
                if (!prompt) {
                    return null;
                }
                return {
                    prompt,
                    alt,
                    caption,
                };
            })
            .filter((item): item is InlineImagePlan => Boolean(item));
    }

    private normalizeRecordArray<T extends Record<string, string>>(value: unknown, keys: Array<keyof T>, minRequired: Array<keyof T>): T[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map((item) => {
                const source = item as Record<string, unknown>;
                const record: Record<string, string> = {};
                for (const key of keys) {
                    record[String(key)] = this.scalarText(source?.[String(key)], '');
                }
                return record as T;
            })
            .filter((item) => minRequired.every((key) => Boolean(item[key])));
    }

    normalizeTargetedArticleData(value: unknown): TargetedArticleData | null {
        if (!value || typeof value !== 'object') {
            return null;
        }
        const record = value as Record<string, unknown>;
        const data: TargetedArticleData = {
            summary: this.scalarText(record.summary, ''),
            quickFacts: this.normalizeRecordArray(record.quickFacts, ['label', 'value', 'tone'], ['label', 'value']),
            importantDates: this.normalizeRecordArray(record.importantDates, ['label', 'value', 'status'], ['label', 'value']),
            postsOrSeats: this.normalizeRecordArray(record.postsOrSeats, ['label', 'value', 'description'], ['label', 'value']),
            fees: this.normalizeRecordArray(record.fees, ['label', 'value', 'note'], ['label', 'value']),
            eligibility: this.normalizeRecordArray(record.eligibility, ['title', 'description', 'note'], ['title', 'description']),
            ageLimit: this.normalizeRecordArray(record.ageLimit, ['label', 'value', 'note'], ['label', 'value']),
            selectionProcess: this.normalizeRecordArray(record.selectionProcess, ['step', 'title', 'description'], ['title', 'description']),
            howToApply: this.normalizeRecordArray(record.howToApply, ['step', 'title', 'description'], ['title', 'description']),
            documents: this.normalizeRecordArray(record.documents, ['title', 'description'], ['title']),
            officialLinks: this.normalizeRecordArray(record.officialLinks, ['label', 'url'], ['label', 'url']),
            faqs: this.normalizeRecordArray(record.faqs, ['question', 'answer'], ['question', 'answer']),
            warningNote: this.scalarText(record.warningNote, ''),
        };

        const hasUsefulData = Boolean(
            data.summary ||
            data.quickFacts?.length ||
            data.importantDates?.length ||
            data.eligibility?.length ||
            data.faqs?.length,
        );
        return hasUsefulData ? data : null;
    }

    async generateBlogContent(
        systemPrompt: string,
        title: string,
        source?: SourceArticleContext,
    ): Promise<GeneratedBlogContent> {
        const sourceInstructions = source
            ? `\n\nPRIVATE BACKGROUND SOURCE - DO NOT DISCLOSE IN ARTICLE.\nThe following source material is only for your understanding. Never write "Reporting Source", "Source", "SarkariResult source page", the source website name, or any sentence saying this article was made from another website.\nSource page title for private context: ${source.title || 'Unknown'}\nPrivate source content excerpt:\n${source.text.substring(0, 9000)}\n\nWrite a fresh Hindi/Hinglish news-style article for Hindiline. Do not copy sentences. Summarize, explain context, and make it useful for Indian readers. Do not cite or name the source website.`
            : '';
        const content = await this.createJsonResponse(
            systemPrompt,
            `Generate an SEO-optimized news/blog post with all required metadata and schema markup. Blog title: "${title}"${sourceInstructions}`,
            9000,
        );
        const parsed = this.parseJson<GeneratedBlogContent>(content, 'OpenAI blog content');

        if (!parsed.content || !parsed.featured_image_prompt) {
            throw new Error('OpenAI blog response missed required content or featured image prompt fields');
        }

        return {
            seo_title: parsed.seo_title || title,
            meta_description: parsed.meta_description || `Read ${title}.`,
            featured_image_prompt: parsed.featured_image_prompt,
            featured_image_alt: parsed.featured_image_alt || title,
            content: parsed.content,
            targeted_article_data: this.normalizeTargetedArticleData((parsed as unknown as Record<string, unknown>).targeted_article_data),
            inline_images: this.normalizeInlineImages((parsed as unknown as Record<string, unknown>).inline_images),
            schema_markup: parsed.schema_markup || {},
            word_count: Number(parsed.word_count) || 0,
            keyword_density: parsed.keyword_density || '',
        };
    }

    async extractTargetedArticleData(input: {
        title: string;
        category: string;
        contentText: string;
    }): Promise<TargetedArticleData | null> {
        const content = await this.createJsonResponse(
            'You extract compact Hindi article facts for Hindiline. Return valid JSON only. Do not invent exact URLs or dates if missing; use "जल्द जारी" or "आधिकारिक वेबसाइट देखें" for unknowns.',
            `Article title: ${input.title}
Category: ${input.category}
Existing article text:
${input.contentText.slice(0, 6500)}

Return JSON with one key "targeted_article_data". It must include concise Hindi/Hinglish fields:
summary, quickFacts[{label,value,tone}], importantDates[{label,value,status}], postsOrSeats[{label,value,description}], fees[{label,value,note}], eligibility[{title,description,note}], ageLimit[{label,value,note}], selectionProcess[{step,title,description}], howToApply[{step,title,description}], documents[{title,description}], officialLinks[{label,url}], faqs[{question,answer}], warningNote.
Keep answers short and factual. Use only details present in the text. If official URL is unknown, omit officialLinks.`,
            2600,
        );
        const parsed = this.parseJson<{ targeted_article_data?: unknown }>(content, 'targeted article facts');
        return this.normalizeTargetedArticleData(parsed.targeted_article_data);
    }

    async createHeadlineFromTitle(rawTitle: string, categoryHint: string, trainingNotes: string[] = []): Promise<BlogTopicResult> {
        const content = await this.createJsonResponse(
            'You are an Indian Hindi/Hinglish news editor for Hindiline. Rewrite rough user-provided topics into strong, SEO-aware Hindi/Hinglish headlines. Do not copy the raw title as-is. Think of 3 headline options internally, then return only the strongest one. Aim for a medium-length publishable headline, usually around 8-14 words or roughly 55-85 characters when natural. Surface the key update, benefit, audience, timeline, warning, or reason-to-care when relevant. Keep it factual, not cheap clickbait, and do not use punctuation spam. Return JSON with keys: blog_title, category, reason.',
            `Raw user title/topic: ${rawTitle}\nCategory hint: ${categoryHint || 'News'}\nSaved headline style notes:\n${trainingNotes.join('\n') || 'No saved training notes.'}\nCreate a sharper Hindi/Hinglish headline suitable for a news/blog article. News titles should feel strong enough to win clicks without sounding fake, and SEO-strong enough to stand on their own.`,
            900,
        );
        const parsed = this.parseJson<BlogTopicResult>(content, 'OpenAI headline brief');
        if (!parsed.blog_title) {
            throw new Error('OpenAI headline brief missed blog_title');
        }
        return parsed;
    }

    async createArticleBriefFromSource(source: SourceArticleContext, categoryHint: string, trainingNotes: string[] = []): Promise<BlogTopicResult> {
        const content = await this.createJsonResponse(
            'You are an Indian news editor for Hindiline. Read the source content and create the best Hindi/Hinglish article brief for our website. The headline must feel newsroom-sharp and publication-ready, not bland. Think of 3 headline options internally and choose the strongest factual one. Aim for a medium-length SEO-capable headline, usually around 8-14 words or roughly 55-85 characters when natural. Use the most important update, audience impact, timeline, amount, result, or action point to make the title compelling without becoming clickbait. Return JSON with keys: blog_title (clear Hindi/Hinglish headline, no clickbait), category (one of: News, Government, Railway, Education, Finance, Technology, Business, Sports, Entertainment, Lifestyle, Default), reason (1 sentence explaining audience value).',
            `Category hint: ${categoryHint || 'News'}\nSaved headline style notes:\n${trainingNotes.join('\n') || 'No saved training notes.'}\nSource URL: ${source.url}\nSource page title: ${source.title || 'Unknown'}\nSource content:\n${source.text.substring(0, 9000)}`,
            1200,
        );
        const parsed = this.parseJson<BlogTopicResult>(content, 'OpenAI source article brief');
        if (!parsed.blog_title) {
            throw new Error('OpenAI source brief missed blog_title');
        }
        return parsed;
    }

    async analyzeTrainingSample(input: {
        category: string;
        sourceUrl?: string;
        title?: string;
        articleText?: string;
        imageDataUrl?: string;
        scanTitleStyle?: boolean;
        scanArticleStyle?: boolean;
        scanImageStyle?: boolean;
    }): Promise<TrainingAnalysisResult> {
        const scanTitleStyle = input.scanTitleStyle !== false;
        const scanArticleStyle = input.scanArticleStyle !== false;
        const scanImageStyle = input.scanImageStyle !== false;
        const textInput = [
            `Category: ${input.category}`,
            input.sourceUrl ? `Source/link: ${input.sourceUrl}` : '',
            input.title ? `Sample title/headline: ${input.title}` : '',
            input.articleText ? `Sample article/content:\n${input.articleText.slice(0, 9000)}` : '',
            `Scan targets:\n- title_style: ${scanTitleStyle ? 'ON' : 'OFF'}\n- article_style: ${scanArticleStyle ? 'ON' : 'OFF'}\n- image_style: ${scanImageStyle ? 'ON' : 'OFF'}`,
            'Analyze this sample for reusable editorial training. Return JSON with ONLY these string keys: title_style, article_style, image_style, summary. title_style should explain headline/title pattern. article_style should explain reusable body/blog structure and tone. image_style should be a reusable featured image generation prompt/style. If a scan target is OFF, return an empty string for that key. Do not return nested objects or arrays.',
        ]
            .filter(Boolean)
            .join('\n\n');
        const inputContent: Array<{ type: string; text?: string; image_url?: string; detail?: string }> = [
            { type: 'input_text', text: textInput },
        ];
        if (input.imageDataUrl) {
            inputContent.push({ type: 'input_image', image_url: input.imageDataUrl, detail: 'auto' });
        }

        const response = await fetch(`${this.baseUrl}/responses`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                model: this.textModel,
                instructions:
                    'You are a Hindi news/blog editorial trainer for Hindiline. Extract only reusable headline style, article/body style, and featured image prompt style when requested. Return valid JSON only with string keys: title_style, article_style, image_style, summary. If any style target is disabled, return an empty string for that field.',
                input: [
                    {
                        role: 'user',
                        content: inputContent,
                    },
                ],
                max_output_tokens: 1800,
                text: {
                    format: { type: 'json_object' },
                },
            }),
        });

        if (!response.ok) {
            throw new Error(await this.readApiError(response, 'OpenAI'));
        }

        const rawText = this.extractResponsesText(await response.json(), 'OpenAI');
        const parsed = await this.repairJsonResponse<TrainingAnalysisResult>(
            rawText,
            'OpenAI training analysis',
            {
                title_style: `Use concise Hindi/Hinglish headlines inspired by: ${input.title || input.sourceUrl || input.category}`,
                article_style: 'Use crisp intro-first blog structure with short paragraphs, useful subheads, and a practical Hindi/Hinglish explainer tone.',
                image_style: input.imageDataUrl
                    ? 'Use the source featured image direction: clean editorial composition, one clear subject, mobile-safe crop.'
                    : 'Use clean editorial featured images with one clear subject, low noise, and Google Discover-safe 16:9 framing.',
                linking_style: '',
                summary: 'Fallback training analysis saved from source content.',
            },
        );

        const parsedRecord = parsed as unknown as Record<string, unknown>;
        const titleStyle = this.scalarText(
            parsedRecord.title_style,
            `Use concise Hindi/Hinglish headlines inspired by: ${input.title || input.sourceUrl || input.category}`,
        );
        const imageStyle = this.scalarText(
            parsedRecord.image_style,
            input.imageDataUrl
                ? 'Featured image prompt: clean editorial composition inspired by the source image, one clear subject, mobile-safe crop, no text overlay.'
                : 'Featured image prompt: clean editorial image, one clear subject, low visual noise, Google Discover-safe 16:9 framing, no text overlay.',
        );

        return {
            title_style: scanTitleStyle ? titleStyle : '',
            article_style: scanArticleStyle
                ? this.scalarText(
                    parsedRecord.article_style,
                    'Use crisp intro-first blog structure with short paragraphs, useful subheads, and a practical Hindi/Hinglish explainer tone.',
                )
                : '',
            image_style: scanImageStyle ? imageStyle : '',
            linking_style: '',
            summary: this.scalarText(parsedRecord.summary, 'Headline and image prompt training saved.'),
        };
    }

    async generateFeaturedImage(prompt: string, title: string, altText?: string, variant: 'featured' | 'inline' = 'featured'): Promise<GeneratedImage> {
        const variantRequirements = variant === 'inline'
            ? `Requirements:
- Professional editorial image suitable inside a long-form article
- Clear visual explanation of the section topic
- Natural composition with useful detail, not a hero-banner look
- No text overlays on image
- 16:9 aspect ratio for responsive web content
- Clean composition, realistic details, and low visual noise
- Strong enough for mobile, but optimized as an in-article supporting image`
            : `Requirements:
- Professional quality suitable for blog headers
- Bright, engaging colors that stand out
- Clear, readable even as a thumbnail
- Emotional appeal with relatable imagery
- No text overlays on image
- 16:9 aspect ratio (ideal for web)
- Clean editorial composition with one clear subject, low visual noise, sharp edges, and uncluttered background
- Google Discover-friendly large image composition, safe at 1200px+ wide and strong on mobile crops`;
        const imagePrompt = `
Create a professional, engaging featured image for a blog post titled: "${title}"

${prompt}

${variantRequirements}
`;

        const response = await fetch(`${this.baseUrl}/images/generations`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                model: this.imageModel,
                prompt: imagePrompt,
                n: 1,
                size: '1536x1024',
                quality: 'medium',
                output_format: 'webp',
                output_compression: 58,
            }),
        });

        if (!response.ok) {
            throw new Error(await this.readApiError(response, 'GPT Image'));
        }

        const data = (await response.json()) as {
            data: Array<{ url?: string; b64_json?: string }>;
        };
        const imageUrl = data.data[0]?.url;
        const imageBase64 = data.data[0]?.b64_json;

        if (imageBase64) {
            return {
                bytes: base64ToBytes(imageBase64),
                contentType: 'image/webp',
                extension: 'webp',
                altText: altText || title,
            };
        }

        if (imageUrl) {
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
                throw new Error(`Generated image download failed: HTTP ${imageResponse.status}`);
            }
            return {
                bytes: new Uint8Array(await imageResponse.arrayBuffer()),
                contentType: imageResponse.headers.get('content-type') || 'image/webp',
                extension: 'webp',
                altText: altText || title,
            };
        }

        throw new Error('No image generated from GPT Image');
    }

}

function base64ToBytes(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

let clientInstance: OpenAIClient | null = null;
let clientSignature = '';

export function initOpenAIClient(config: OpenAIClientConfig): OpenAIClient {
    const signature = [
        config.apiKey,
        config.trackingId || '',
        config.textModel || DEFAULT_TEXT_MODEL,
        config.imageModel || DEFAULT_IMAGE_MODEL,
    ].join(':');

    if (clientInstance && clientSignature === signature) {
        return clientInstance;
    }
    clientSignature = signature;
    clientInstance = new OpenAIClient(config);
    return clientInstance;
}

export function getOpenAIClient(): OpenAIClient {
    if (!clientInstance) {
        throw new Error(
            'OpenAI client not initialized. Call initOpenAIClient first.',
        );
    }
    return clientInstance;
}

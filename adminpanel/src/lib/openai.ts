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
    schema_markup: Record<string, unknown>;
    word_count: number;
    keyword_density: string;
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

    async generateBlogContent(
        systemPrompt: string,
        title: string,
        source?: SourceArticleContext,
    ): Promise<GeneratedBlogContent> {
        const sourceInstructions = source
            ? `\n\nUse this source URL as the reporting source: ${source.url}\nSource page title: ${source.title || 'Unknown'}\nSource content excerpt:\n${source.text.substring(0, 9000)}\n\nWrite a fresh Hindi/Hinglish news-style article for Laxy.in. Do not copy sentences. Summarize, explain context, and make it useful for Indian readers. Mention the source only when naturally useful.`
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
            schema_markup: parsed.schema_markup || {},
            word_count: Number(parsed.word_count) || 0,
            keyword_density: parsed.keyword_density || '',
        };
    }

    async createHeadlineFromTitle(rawTitle: string, categoryHint: string, trainingNotes: string[] = []): Promise<BlogTopicResult> {
        const content = await this.createJsonResponse(
            'You are an Indian Hindi/Hinglish news editor for Laxy.in. Rewrite rough user-provided topics into short, catchy, SEO-safe Hindi headlines. Do not copy the raw title as-is. Keep it factual, no clickbait, no extra punctuation spam. Return JSON with keys: blog_title, category, reason.',
            `Raw user title/topic: ${rawTitle}\nCategory hint: ${categoryHint || 'News'}\nSaved category style notes:\n${trainingNotes.join('\n') || 'No saved training notes.'}\nCreate a sharper Hindi/Hinglish headline suitable for a news/blog article.`,
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
            'You are an Indian news editor for Laxy.in. Read the source content and create the best Hindi/Hinglish article brief for our website. Return JSON with keys: blog_title (clear Hindi/Hinglish headline, no clickbait), category (one of: News, Government, Railway, Education, Finance, Technology, Business, Sports, Entertainment, Lifestyle, Default), reason (1 sentence explaining audience value).',
            `Category hint: ${categoryHint || 'News'}\nSaved category style notes:\n${trainingNotes.join('\n') || 'No saved training notes.'}\nSource URL: ${source.url}\nSource page title: ${source.title || 'Unknown'}\nSource content:\n${source.text.substring(0, 9000)}`,
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
    }): Promise<TrainingAnalysisResult> {
        const textInput = [
            `Category: ${input.category}`,
            input.sourceUrl ? `Source/link: ${input.sourceUrl}` : '',
            input.title ? `Sample title/headline: ${input.title}` : '',
            input.articleText ? `Sample article/content:\n${input.articleText.slice(0, 9000)}` : '',
            'Analyze this sample for reusable editorial training. Return JSON with ONLY these string keys: title_style, image_style, summary. title_style should explain headline/title pattern. image_style should be a reusable featured image generation prompt/style. Do not return nested objects or arrays.',
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
                    'You are a Hindi news/blog editorial trainer for Laxy.in. Extract only reusable headline/title style and featured image prompt style. Return valid JSON only with string keys: title_style, image_style, summary.',
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
                article_style: '',
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
            title_style: titleStyle,
            article_style: '',
            image_style: imageStyle,
            linking_style: '',
            summary: this.scalarText(parsedRecord.summary, 'Headline and image prompt training saved.'),
        };
    }

    async generateFeaturedImage(prompt: string, title: string, altText?: string): Promise<GeneratedImage> {
        const imagePrompt = `
Create a professional, engaging featured image for a blog post titled: "${title}"

${prompt}

Requirements:
- Professional quality suitable for blog headers
- Bright, engaging colors that stand out
- Clear, readable even as a thumbnail
- Emotional appeal with relatable imagery
- No text overlays on image
- 16:9 aspect ratio (ideal for web)
- Clean editorial composition with one clear subject, low visual noise, sharp edges, and uncluttered background
- Google Discover-friendly large image composition, safe at 1200px+ wide and strong on mobile crops
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

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
            'Analyze this sample for reusable editorial training. Return JSON with keys: title_style, article_style, image_style, linking_style, summary. Focus on how future articles in this category should be titled, structured, linked, and what featured images should look like.',
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
                    'You are a Hindi news/blog editorial trainer for Laxy.in. Extract reusable writing, headline, linking, and image style guidance from user-provided examples. Return valid JSON only.',
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

        const parsed = this.parseJson<TrainingAnalysisResult>(
            this.extractResponsesText(await response.json(), 'OpenAI'),
            'OpenAI training analysis',
        );

        return {
            title_style: parsed.title_style || 'Short Hindi/Hinglish factual headline style',
            article_style: parsed.article_style || 'Clear Hindi/Hinglish news explainer style',
            image_style: parsed.image_style || 'Clean editorial featured image style',
            linking_style: parsed.linking_style || 'Use helpful internal and authoritative external links naturally',
            summary: parsed.summary || 'Reusable training sample saved.',
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

/**
 * OpenAI Integration
 * Handles blog generation with GPT-5.5 and image generation with GPT Image.
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
    ): Promise<GeneratedBlogContent> {
        const content = await this.createJsonResponse(
            systemPrompt,
            `Generate an SEO-optimized blog post with all required metadata and schema markup. Blog title: "${title}"`,
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
                output_compression: 82,
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

    async findBlogTopic(pageText: string, categoryHint: string): Promise<BlogTopicResult> {
        const content = await this.createJsonResponse(
            'You are an expert Indian content strategist. Analyze the given webpage text and identify the single most important, timely topic for an evergreen blog post targeting Indian readers. Focus on: job vacancies, government notifications, sarkari aadesh, government schemes, exam notifications, or major India news events. Return JSON with keys: blog_title (compelling Hindi or English headline), category (one of: Government, Railway, Education, Finance, Technology, News), reason (1 sentence why this topic is valuable).',
            `Category hint: ${categoryHint}\n\nWebpage content:\n${pageText.substring(0, 6000)}`,
            1200,
        );
        const parsed = this.parseJson<BlogTopicResult>(content, 'OpenAI blog topic');
        if (!parsed.blog_title) {
            throw new Error('OpenAI topic response missed blog_title');
        }
        return parsed;
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

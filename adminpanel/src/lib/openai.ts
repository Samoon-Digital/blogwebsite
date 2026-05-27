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
    url: string;
    alt_text: string;
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

    async generateBlogContent(
        systemPrompt: string,
        title: string,
    ): Promise<GeneratedBlogContent> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                model: this.textModel,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt,
                    },
                    {
                        role: 'user',
                        content: `Generate an SEO-optimized blog post with all required metadata and schema markup. Blog title: "${title}"`,
                    },
                ],
                max_completion_tokens: 6000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            throw new Error(await this.readApiError(response, 'OpenAI'));
        }

        const data = (await response.json()) as {
            choices: Array<{ message: { content: string } }>;
        };
        const content = data.choices[0]?.message?.content;

        if (!content) {
            throw new Error('No content generated from OpenAI');
        }

        try {
            const parsed = JSON.parse(content) as GeneratedBlogContent;
            return parsed;
        } catch {
            throw new Error('Failed to parse OpenAI response as JSON');
        }
    }

    async generateFeaturedImage(prompt: string, title: string): Promise<string> {
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
                size: '1536x864',
                quality: 'medium',
                output_format: 'jpeg',
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

        if (imageUrl) {
            return imageUrl;
        }

        if (imageBase64) {
            return `data:image/jpeg;base64,${imageBase64}`;
        }

        throw new Error('No image generated from GPT Image');
    }

    async findBlogTopic(pageText: string, categoryHint: string): Promise<BlogTopicResult> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                model: this.textModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert Indian content strategist. Analyze the given webpage text and identify the single most important, timely topic for an evergreen blog post targeting Indian readers. Focus on: job vacancies, government notifications, sarkari aadesh, government schemes, exam notifications, or major India news events. Return JSON with keys: blog_title (compelling Hindi or English headline), category (one of: Government, Railway, Education, Finance, Technology, News), reason (1 sentence why this topic is valuable).',
                    },
                    {
                        role: 'user',
                        content: `Category hint: ${categoryHint}\n\nWebpage content:\n${pageText.substring(0, 6000)}`,
                    },
                ],
                max_completion_tokens: 800,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            throw new Error(await this.readApiError(response, 'OpenAI'));
        }

        const data = (await response.json()) as {
            choices: Array<{ message: { content: string } }>;
        };
        const content = data.choices[0]?.message?.content;
        if (!content) throw new Error('No topic identified from OpenAI');

        try {
            return JSON.parse(content) as BlogTopicResult;
        } catch {
            throw new Error('Failed to parse blog topic response');
        }
    }
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

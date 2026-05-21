/**
 * OpenAI Integration
 * Handles blog generation with GPT-4 Turbo and image generation with DALL-E 3
 */

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
    private baseUrl = 'https://api.openai.com/v1';

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
        }
        this.apiKey = apiKey;
    }

    async generateBlogContent(
        systemPrompt: string,
        title: string,
    ): Promise<GeneratedBlogContent> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo',
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
                temperature: 0.7,
                max_tokens: 3000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(
                `OpenAI API error: ${error.error?.message || 'Unknown error'}`,
            );
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
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: 'dall-e-3',
                prompt: imagePrompt,
                n: 1,
                size: '1792x1024',
                quality: 'standard',
                style: 'natural',
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(
                `DALL-E API error: ${error.error?.message || 'Unknown error'}`,
            );
        }

        const data = (await response.json()) as {
            data: Array<{ url: string }>;
        };
        const imageUrl = data.data[0]?.url;

        if (!imageUrl) {
            throw new Error('No image generated from DALL-E');
        }

        return imageUrl;
    }

    async findBlogTopic(pageText: string, categoryHint: string): Promise<BlogTopicResult> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo',
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
                temperature: 0.5,
                max_tokens: 400,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const error = (await response.json()) as { error?: { message?: string } };
            throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
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

export function initOpenAIClient(apiKey: string): OpenAIClient {
    if (clientInstance) {
        return clientInstance;
    }
    clientInstance = new OpenAIClient(apiKey);
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

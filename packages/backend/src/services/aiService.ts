import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Bookmark, Category, AIAnalysisResult } from '@x-bookmarker/shared/types';

// Custom error classes for better error handling
export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigurationError';
  }
}

export class AIProviderError extends Error {
  public readonly provider: string;
  public readonly originalError?: Error;

  constructor(message: string, provider: string, originalError?: Error) {
    super(message);
    this.name = 'AIProviderError';
    this.provider = provider;
    this.originalError = originalError;
  }
}

export class AIAnalysisError extends Error {
  public readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'AIAnalysisError';
    this.retryable = retryable;
  }
}

export interface AIProvider {
  name: 'openai' | 'anthropic' | 'huggingface';
  client: OpenAI | Anthropic | null;
  analyze: (content: string, existingCategories: Category[]) => Promise<AIAnalysisResult>;
}

interface AIConfig {
  provider: 'openai' | 'anthropic' | 'huggingface';
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  enabled: boolean;
}

export class AIService {
  private config: AIConfig;
  private provider: AIProvider | null = null;

  constructor() {
    this.config = {
      provider: (process.env.AI_PROVIDER as 'openai' | 'anthropic' | 'huggingface') || 'openai',
      apiKey: process.env.AI_API_KEY || '',
      model: process.env.AI_MODEL || 'gpt-4',
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000'),
      temperature: parseFloat(process.env.AI_TEMPERATURE || '0.3'),
      enabled: process.env.AI_ENABLED === 'true'
    };

    // Validate configuration
    this.validateConfig();

    if (this.config.enabled && this.config.apiKey) {
      this.initializeProvider();
    }
  }

  private validateConfig(): void {
    if (this.config.enabled) {
      if (!this.config.apiKey) {
        throw new AIConfigurationError('AI API key is required when AI is enabled');
      }

      if (this.config.maxTokens <= 0 || this.config.maxTokens > 10000) {
        throw new AIConfigurationError('AI max tokens must be between 1 and 10000');
      }

      if (this.config.temperature < 0 || this.config.temperature > 1) {
        throw new AIConfigurationError('AI temperature must be between 0 and 1');
      }

      const validProviders = ['openai', 'anthropic', 'huggingface'];
      if (!validProviders.includes(this.config.provider)) {
        throw new AIConfigurationError(`Invalid AI provider: ${this.config.provider}`);
      }
    }
  }

  private initializeProvider(): void {
    switch (this.config.provider) {
      case 'openai':
        this.provider = this.createOpenAIProvider();
        break;
      case 'anthropic':
        this.provider = this.createAnthropicProvider();
        break;
      case 'huggingface':
        // For future implementation
        throw new Error('Hugging Face provider not yet implemented');
      default:
        throw new Error(`Unsupported AI provider: ${this.config.provider}`);
    }
  }

  private createOpenAIProvider(): AIProvider {
    const client = new OpenAI({
      apiKey: this.config.apiKey,
    });

    return {
      name: 'openai',
      client,
      analyze: async (content: string, existingCategories: Category[]): Promise<AIAnalysisResult> => {
        const categoryNames = existingCategories.map(cat => cat.name).join(', ');
        
        const prompt = `Analyze the following tweet content and provide:
1. Suggested categories from these options: [${categoryNames}] or suggest new ones
2. Relevant tags (5-10 words/phrases)
3. Sentiment (positive/negative/neutral)
4. Language detected
5. Main topics/themes

Tweet content: "${content}"

Please respond in JSON format with the following structure:
{
  "suggestedCategories": [{"categoryName": "string", "confidence": number}],
  "suggestedTags": ["string"],
  "sentiment": "positive|negative|neutral",
  "language": "string",
  "topics": ["string"]
}`;

        try {
          const response = await client.chat.completions.create({
            model: this.config.model,
            messages: [
              {
                role: 'system',
                content: 'You are an expert content analyzer. Provide accurate analysis in the requested JSON format.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
          });

          const result = response.choices[0]?.message?.content;
          if (!result) {
            throw new Error('No response from OpenAI');
          }

          return JSON.parse(result) as AIAnalysisResult;
        } catch (error) {
          console.error('OpenAI analysis error:', error);
          throw new AIProviderError(
            'Failed to analyze content with OpenAI',
            'openai',
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    };
  }

  private createAnthropicProvider(): AIProvider {
    const client = new Anthropic({
      apiKey: this.config.apiKey,
    });

    return {
      name: 'anthropic',
      client,
      analyze: async (content: string, existingCategories: Category[]): Promise<AIAnalysisResult> => {
        const categoryNames = existingCategories.map(cat => cat.name).join(', ');
        
        const prompt = `Analyze the following tweet content and provide:
1. Suggested categories from these options: [${categoryNames}] or suggest new ones
2. Relevant tags (5-10 words/phrases)
3. Sentiment (positive/negative/neutral)
4. Language detected
5. Main topics/themes

Tweet content: "${content}"

Respond in JSON format:
{
  "suggestedCategories": [{"categoryName": "string", "confidence": number}],
  "suggestedTags": ["string"],
  "sentiment": "positive|negative|neutral",
  "language": "string",
  "topics": ["string"]
}`;

        try {
          const response = await client.messages.create({
            model: this.config.model || 'claude-3-sonnet-20240229',
            max_tokens: this.config.maxTokens,
            temperature: this.config.temperature,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
          });

          const result = response.content[0];
          if (result.type !== 'text') {
            throw new Error('Unexpected response type from Anthropic');
          }

          return JSON.parse(result.text) as AIAnalysisResult;
        } catch (error) {
          console.error('Anthropic analysis error:', error);
          throw new AIProviderError(
            'Failed to analyze content with Anthropic',
            'anthropic',
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    };
  }

  private getFallbackResult(): AIAnalysisResult {
    return {
      suggestedCategories: [{ categoryName: '未分類', confidence: 0.5 }],
      suggestedTags: [],
      sentiment: 'neutral',
      language: 'unknown',
      topics: []
    };
  }

  public isEnabled(): boolean {
    return this.config.enabled && this.provider !== null;
  }

  public async analyzeContent(
    content: string, 
    existingCategories: Category[]
  ): Promise<AIAnalysisResult> {
    if (!this.isEnabled()) {
      throw new AIConfigurationError('AI service is not enabled or configured');
    }

    if (!this.provider) {
      throw new AIConfigurationError('AI provider not initialized');
    }

    if (!content || content.trim().length === 0) {
      throw new AIAnalysisError('Content cannot be empty');
    }

    try {
      return await this.provider.analyze(content, existingCategories);
    } catch (error) {
      if (error instanceof AIProviderError) {
        // For provider errors, return fallback result instead of throwing
        console.warn(`AI provider error, using fallback: ${error.message}`);
        return this.getFallbackResult();
      }
      throw error;
    }
  }

  public async analyzeBookmark(
    bookmark: Bookmark, 
    existingCategories: Category[]
  ): Promise<AIAnalysisResult> {
    // Combine content for comprehensive analysis
    const fullContent = [
      bookmark.content,
      ...bookmark.hashtags.map(tag => `#${tag}`),
      ...bookmark.tags,
      bookmark.authorDisplayName
    ].join(' ');

    return await this.analyzeContent(fullContent, existingCategories);
  }

  public async batchAnalyze(
    bookmarks: Bookmark[], 
    existingCategories: Category[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<Map<string, AIAnalysisResult>> {
    const results = new Map<string, AIAnalysisResult>();
    
    for (let i = 0; i < bookmarks.length; i++) {
      const bookmark = bookmarks[i];
      try {
        const analysis = await this.analyzeBookmark(bookmark, existingCategories);
        results.set(bookmark.id, analysis);
        
        if (onProgress) {
          onProgress(i + 1, bookmarks.length);
        }

        // Add delay to respect rate limits
        await this.delay(100);
      } catch (error) {
        console.error(`Failed to analyze bookmark ${bookmark.id}:`, error);
        results.set(bookmark.id, this.getFallbackResult());
      }
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getConfig(): Partial<AIConfig> {
    return {
      provider: this.config.provider,
      model: this.config.model,
      enabled: this.config.enabled
    };
  }

  public updateConfig(newConfig: Partial<AIConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.config.enabled && this.config.apiKey) {
      this.initializeProvider();
    } else {
      this.provider = null;
    }
  }
}

export const aiService = new AIService();
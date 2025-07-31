import { AIService } from '../aiService';
import { Category, Bookmark } from '@x-bookmarker/shared/types';

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    AI_ENABLED: 'true',
    AI_PROVIDER: 'openai',
    AI_API_KEY: 'test-api-key',
    AI_MODEL: 'gpt-3.5-turbo',
    AI_MAX_TOKENS: '1000',
    AI_TEMPERATURE: '0.3'
  };
});

afterEach(() => {
  process.env = originalEnv;
});

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                suggestedCategories: [
                  { categoryName: '技術・AI', confidence: 0.9 },
                  { categoryName: 'プログラミング', confidence: 0.8 }
                ],
                suggestedTags: ['javascript', 'react', 'frontend'],
                sentiment: 'positive',
                language: 'japanese',
                topics: ['web development', 'programming']
              })
            }
          }]
        })
      }
    }
  }));
});

// Mock Anthropic
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            suggestedCategories: [
              { categoryName: '技術・AI', confidence: 0.85 },
              { categoryName: 'プログラミング', confidence: 0.75 }
            ],
            suggestedTags: ['anthropic', 'claude', 'ai'],
            sentiment: 'neutral',
            language: 'english',
            topics: ['artificial intelligence', 'language models']
          })
        }]
      })
    }
  }));
});

describe('AIService', () => {
  let aiService: AIService;
  let mockCategories: Category[];
  let mockBookmark: Bookmark;

  beforeEach(() => {
    aiService = new AIService();
    mockCategories = [
      {
        id: '1',
        userId: 'user1',
        name: '技術・AI',
        description: 'AI and technology related',
        color: '#3B82F6',
        icon: 'brain',
        parentId: undefined,
        order: 1,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '2',
        userId: 'user1',
        name: 'プログラミング',
        description: 'Programming related',
        color: '#10B981',
        icon: 'code',
        parentId: undefined,
        order: 2,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    mockBookmark = {
      id: 'bookmark1',
      userId: 'user1',
      xTweetId: 'tweet123',
      content: 'Reactの新しいhooksについて学んでいます。とても興味深い！',
      authorUsername: 'dev_user',
      authorDisplayName: 'Developer User',
      authorAvatarUrl: 'https://example.com/avatar.jpg',
      mediaUrls: [],
      links: ['https://react.dev'],
      hashtags: ['react', 'javascript'],
      mentions: [],
      categoryId: undefined,
      tags: [],
      isArchived: false,
      bookmarkedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with correct configuration from environment variables', () => {
      const config = aiService.getConfig();
      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-3.5-turbo');
      expect(config.enabled).toBe(true);
    });

    it('should be disabled when AI_ENABLED is false', () => {
      process.env.AI_ENABLED = 'false';
      const disabledService = new AIService();
      expect(disabledService.isEnabled()).toBe(false);
    });

    it('should be disabled when AI_API_KEY is missing', () => {
      delete process.env.AI_API_KEY;
      const noKeyService = new AIService();
      expect(noKeyService.isEnabled()).toBe(false);
    });
  });

  describe('Content Analysis', () => {
    it('should analyze content and return AI analysis result', async () => {
      const content = 'JavaScriptのReactフレームワークについて学習中';
      const result = await aiService.analyzeContent(content, mockCategories);

      expect(result).toHaveProperty('suggestedCategories');
      expect(result).toHaveProperty('suggestedTags');
      expect(result).toHaveProperty('sentiment');
      expect(result).toHaveProperty('language');
      expect(result).toHaveProperty('topics');

      expect(result.suggestedCategories).toHaveLength(2);
      expect(result.suggestedCategories[0]).toHaveProperty('categoryName');
      expect(result.suggestedCategories[0]).toHaveProperty('confidence');
      expect(result.suggestedTags).toContain('javascript');
    });

    it('should handle analysis errors gracefully', async () => {
      // Mock OpenAI to throw an error
      const mockOpenAI = require('openai');
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('API Error'))
          }
        }
      }));

      const errorService = new AIService();
      const result = await errorService.analyzeContent('test content', mockCategories);

      // Should return fallback result
      expect(result.suggestedCategories[0].categoryName).toBe('未分類');
      expect(result.sentiment).toBe('neutral');
      expect(result.language).toBe('unknown');
    });
  });

  describe('Bookmark Analysis', () => {
    it('should analyze bookmark with combined content', async () => {
      const result = await aiService.analyzeBookmark(mockBookmark, mockCategories);

      expect(result).toHaveProperty('suggestedCategories');
      expect(result).toHaveProperty('suggestedTags');
      
      // Verify that hashtags and other metadata are included in analysis
      expect(result.suggestedTags).toContain('react');
    });
  });

  describe('Batch Analysis', () => {
    it('should analyze multiple bookmarks with progress callback', async () => {
      const bookmarks = [mockBookmark, { ...mockBookmark, id: 'bookmark2' }];
      const progressCalls: Array<{ processed: number; total: number }> = [];

      const results = await aiService.batchAnalyze(
        bookmarks,
        mockCategories,
        (processed, total) => {
          progressCalls.push({ processed, total });
        }
      );

      expect(results.size).toBe(2);
      expect(results.has('bookmark1')).toBe(true);
      expect(results.has('bookmark2')).toBe(true);
      expect(progressCalls.length).toBe(2);
      expect(progressCalls[0]).toEqual({ processed: 1, total: 2 });
      expect(progressCalls[1]).toEqual({ processed: 2, total: 2 });
    });

    it('should handle individual bookmark failures in batch analysis', async () => {
      // Mock one successful and one failed analysis
      const mockOpenAI = require('openai');
      let callCount = 0;
      
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve({
                  choices: [{
                    message: {
                      content: JSON.stringify({
                        suggestedCategories: [{ categoryName: '技術・AI', confidence: 0.9 }],
                        suggestedTags: ['success'],
                        sentiment: 'positive',
                        language: 'japanese',
                        topics: ['test']
                      })
                    }
                  }]
                });
              } else {
                return Promise.reject(new Error('API Error'));
              }
            })
          }
        }
      }));

      const batchService = new AIService();
      const bookmarks = [mockBookmark, { ...mockBookmark, id: 'bookmark2' }];
      
      const results = await batchService.batchAnalyze(bookmarks, mockCategories);

      expect(results.size).toBe(2);
      
      // First bookmark should have successful result
      const result1 = results.get('bookmark1');
      expect(result1?.suggestedTags).toContain('success');
      
      // Second bookmark should have fallback result
      const result2 = results.get('bookmark2');
      expect(result2?.suggestedCategories[0].categoryName).toBe('未分類');
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration', () => {
      aiService.updateConfig({
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        enabled: false
      });

      const config = aiService.getConfig();
      expect(config.provider).toBe('anthropic');
      expect(config.model).toBe('claude-3-sonnet-20240229');
      expect(config.enabled).toBe(false);
    });

    it('should reinitialize provider when config changes', () => {
      expect(aiService.isEnabled()).toBe(true);
      
      // Disable AI
      aiService.updateConfig({ enabled: false });
      expect(aiService.isEnabled()).toBe(false);

      // Re-enable AI
      aiService.updateConfig({ enabled: true });
      expect(aiService.isEnabled()).toBe(true);
    });
  });

  describe('Provider-Specific Tests', () => {
    it('should work with Anthropic provider', async () => {
      process.env.AI_PROVIDER = 'anthropic';
      const anthropicService = new AIService();
      
      const result = await anthropicService.analyzeContent('test content', mockCategories);
      
      expect(result).toHaveProperty('suggestedCategories');
      expect(result.suggestedTags).toContain('anthropic');
    });

    it('should throw error for unsupported provider', () => {
      process.env.AI_PROVIDER = 'huggingface';
      
      expect(() => {
        new AIService();
      }).toThrow('Hugging Face provider not yet implemented');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when analyzing content with disabled service', async () => {
      process.env.AI_ENABLED = 'false';
      const disabledService = new AIService();

      await expect(disabledService.analyzeContent('test', mockCategories))
        .rejects.toThrow('AI service is not enabled or configured');
    });

    it('should handle invalid JSON response from AI provider', async () => {
      const mockOpenAI = require('openai');
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: 'invalid json response'
                }
              }]
            })
          }
        }
      }));

      const invalidResponseService = new AIService();
      const result = await invalidResponseService.analyzeContent('test', mockCategories);

      // Should return fallback result when JSON parsing fails
      expect(result.suggestedCategories[0].categoryName).toBe('未分類');
    });
  });
});
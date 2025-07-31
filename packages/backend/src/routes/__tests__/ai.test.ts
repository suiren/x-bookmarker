import request from 'supertest';
import express from 'express';
import { aiRoutes } from '../ai';
import { aiService, categoryService } from '../../services';
import { authMiddleware } from '../../middleware/auth';

// Mock services
jest.mock('../../services');
jest.mock('../../middleware/auth');

const mockAIService = aiService as jest.Mocked<typeof aiService>;
const mockCategoryService = categoryService as jest.Mocked<typeof categoryService>;
const mockAuthMiddleware = authMiddleware as jest.MockedFunction<typeof authMiddleware>;

// Mock user for authenticated requests
const mockUser = {
  id: 'user1',
  xUserId: 'x123',
  username: 'testuser',
  displayName: 'Test User'
};

describe('AI Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock auth middleware to always pass and set user
    mockAuthMiddleware.mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
    
    app.use('/ai', aiRoutes);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('POST /ai/analyze', () => {
    const mockAnalysisResult = {
      suggestedCategories: [
        { categoryName: '技術・AI', confidence: 0.9 },
        { categoryName: 'プログラミング', confidence: 0.8 }
      ],
      suggestedTags: ['javascript', 'react', 'frontend'],
      sentiment: 'positive' as const,
      language: 'japanese',
      topics: ['web development', 'programming']
    };

    const mockCategories = [
      {
        id: '1',
        userId: 'user1',
        name: '技術・AI',
        description: 'AI and technology',
        color: '#3B82F6',
        icon: 'brain',
        parentId: undefined,
        order: 1,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    beforeEach(() => {
      mockAIService.isEnabled.mockReturnValue(true);
      mockAIService.analyzeContent.mockResolvedValue(mockAnalysisResult);
      mockCategoryService.getUserCategories.mockResolvedValue(mockCategories);
    });

    it('should analyze content successfully', async () => {
      const response = await request(app)
        .post('/ai/analyze')
        .send({
          content: 'Reactの新しいhooksについて学んでいます',
          bookmarkId: 'bookmark123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockAnalysisResult);
      
      expect(mockCategoryService.getUserCategories).toHaveBeenCalledWith('user1');
      expect(mockAIService.analyzeContent).toHaveBeenCalledWith(
        'Reactの新しいhooksについて学んでいます',
        mockCategories
      );
    });

    it('should return 400 for invalid input', async () => {
      const response = await request(app)
        .post('/ai/analyze')
        .send({
          content: '', // Invalid: empty content
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 503 when AI service is disabled', async () => {
      mockAIService.isEnabled.mockReturnValue(false);

      const response = await request(app)
        .post('/ai/analyze')
        .send({
          content: 'Test content'
        });

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('AI service is not enabled or configured');
    });

    it('should handle AI service errors', async () => {
      mockAIService.analyzeContent.mockRejectedValue(new Error('AI API Error'));

      const response = await request(app)
        .post('/ai/analyze')
        .send({
          content: 'Test content'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to analyze content');
    });

    it('should return 401 when user is not authenticated', async () => {
      // Mock auth middleware to not set user
      mockAuthMiddleware.mockImplementation((req, res, next) => {
        next();
      });

      const response = await request(app)
        .post('/ai/analyze')
        .send({
          content: 'Test content'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not authenticated');
    });
  });

  describe('GET /ai/config', () => {
    const mockConfig = {
      provider: 'openai' as const,
      model: 'gpt-3.5-turbo',
      enabled: true
    };

    beforeEach(() => {
      mockAIService.getConfig.mockReturnValue(mockConfig);
    });

    it('should return AI configuration', async () => {
      const response = await request(app).get('/ai/config');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockConfig);
      expect(mockAIService.getConfig).toHaveBeenCalled();
    });

    it('should handle configuration errors', async () => {
      mockAIService.getConfig.mockImplementation(() => {
        throw new Error('Config error');
      });

      const response = await request(app).get('/ai/config');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get AI configuration');
    });
  });

  describe('PUT /ai/config', () => {
    const mockUpdatedConfig = {
      provider: 'anthropic' as const,
      model: 'claude-3-sonnet-20240229',
      enabled: true
    };

    beforeEach(() => {
      mockAIService.updateConfig.mockReturnValue(undefined);
      mockAIService.getConfig.mockReturnValue(mockUpdatedConfig);
    });

    it('should update AI configuration', async () => {
      const updates = {
        provider: 'anthropic' as const,
        model: 'claude-3-sonnet-20240229'
      };

      const response = await request(app)
        .put('/ai/config')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockUpdatedConfig);
      
      expect(mockAIService.updateConfig).toHaveBeenCalledWith(updates);
      expect(mockAIService.getConfig).toHaveBeenCalled();
    });

    it('should return 400 for invalid configuration updates', async () => {
      const response = await request(app)
        .put('/ai/config')
        .send({
          provider: 'invalid-provider'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle update errors', async () => {
      mockAIService.updateConfig.mockImplementation(() => {
        throw new Error('Update error');
      });

      const response = await request(app)
        .put('/ai/config')
        .send({
          provider: 'openai'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to update AI configuration');
    });
  });

  describe('GET /ai/health', () => {
    it('should return health status when AI is enabled', async () => {
      const mockConfig = {
        provider: 'openai' as const,
        model: 'gpt-3.5-turbo', 
        enabled: true
      };

      mockAIService.isEnabled.mockReturnValue(true);
      mockAIService.getConfig.mockReturnValue(mockConfig);

      const response = await request(app).get('/ai/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        enabled: true,
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        status: 'healthy'
      });
    });

    it('should return disabled status when AI is disabled', async () => {
      const mockConfig = {
        provider: 'openai' as const,
        model: 'gpt-3.5-turbo',
        enabled: false
      };

      mockAIService.isEnabled.mockReturnValue(false);
      mockAIService.getConfig.mockReturnValue(mockConfig);

      const response = await request(app).get('/ai/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('disabled');
    });

    it('should handle health check errors', async () => {
      mockAIService.isEnabled.mockImplementation(() => {
        throw new Error('Health check error');
      });

      const response = await request(app).get('/ai/health');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('AI service health check failed');
    });
  });

  describe('POST /ai/batch-analyze', () => {
    beforeEach(() => {
      mockAIService.isEnabled.mockReturnValue(true);
      mockCategoryService.getUserCategories.mockResolvedValue([]);
    });

    it('should return 400 for invalid batch request', async () => {
      const response = await request(app)
        .post('/ai/batch-analyze')
        .send({
          bookmarkIds: [] // Invalid: empty array
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 503 when AI service is disabled', async () => {
      mockAIService.isEnabled.mockReturnValue(false);

      const response = await request(app)
        .post('/ai/batch-analyze')
        .send({
          bookmarkIds: ['bookmark1', 'bookmark2']
        });

      expect(response.status).toBe(503);
    });

    // Note: Full SSE testing would require more complex setup
    // This tests the initial validation and setup
  });
});
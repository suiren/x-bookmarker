import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { aiService, categoryService } from '../services';
import { authMiddleware } from '../middleware/auth';
import { validateMiddleware } from '../middleware/validate';
import { APIResponse, AIAnalysisResult } from '@x-bookmarker/shared/types';

const router = Router();

// Apply authentication middleware to all AI routes
router.use(authMiddleware);

// Validation schemas
const analyzeContentSchema = z.object({
  content: z.string().min(1, 'Content is required').max(5000, 'Content too long'),
  bookmarkId: z.string().uuid().optional(),
});

const batchAnalyzeSchema = z.object({
  bookmarkIds: z.array(z.string().uuid()).min(1, 'At least one bookmark ID required').max(100, 'Too many bookmarks'),
});

const updateConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'huggingface']).optional(),
  model: z.string().optional(),
  enabled: z.boolean().optional(),
});

/**
 * POST /ai/analyze
 * Analyze content using AI service
 */
router.post(
  '/analyze',
  validateMiddleware(analyzeContentSchema),
  async (req: Request, res: Response) => {
    try {
      const { content, bookmarkId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        } as APIResponse<null>);
      }

      // Check if AI service is enabled
      if (!aiService.isEnabled()) {
        return res.status(503).json({
          success: false,
          error: 'AI service is not enabled or configured'
        } as APIResponse<null>);
      }

      // Get user's existing categories for better suggestions
      const categories = await categoryService.getUserCategories(userId);

      // Analyze the content
      const analysis = await aiService.analyzeContent(content, categories);

      res.json({
        success: true,
        data: analysis,
        message: 'Content analyzed successfully'
      } as APIResponse<AIAnalysisResult>);

    } catch (error) {
      console.error('AI analysis error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze content'
      } as APIResponse<null>);
    }
  }
);

/**
 * POST /ai/batch-analyze
 * Analyze multiple bookmarks in batch
 */
router.post(
  '/batch-analyze',
  validateMiddleware(batchAnalyzeSchema),
  async (req: Request, res: Response) => {
    try {
      const { bookmarkIds } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        } as APIResponse<null>);
      }

      // Check if AI service is enabled
      if (!aiService.isEnabled()) {
        return res.status(503).json({
          success: false,
          error: 'AI service is not enabled or configured'
        } as APIResponse<null>);
      }

      // Get bookmarks and categories
      const bookmarks = await Promise.all(
        bookmarkIds.map(id => 
          // Note: This would need to be implemented in bookmarkService
          // For now, we'll create a placeholder
          ({ id, content: 'Sample content', userId })
        )
      );

      const categories = await categoryService.getUserCategories(userId);

      // Create SSE response for real-time progress
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      const results = new Map<string, AIAnalysisResult>();
      let processed = 0;

      // Start batch analysis with progress callback
      const analysisResults = await aiService.batchAnalyze(
        bookmarks as any[],
        categories,
        (processedCount: number, total: number) => {
          processed = processedCount;
          const progress = Math.round((processedCount / total) * 100);
          
          // Send progress update via SSE
          res.write(`data: ${JSON.stringify({
            type: 'progress',
            processed: processedCount,
            total,
            progress
          })}\n\n`);
        }
      );

      // Send final results
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        results: Object.fromEntries(analysisResults),
        message: 'Batch analysis completed successfully'
      })}\n\n`);

      res.end();

    } catch (error) {
      console.error('Batch AI analysis error:', error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Failed to analyze bookmarks'
      })}\n\n`);
      res.end();
    }
  }
);

/**
 * GET /ai/config
 * Get current AI service configuration
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const config = aiService.getConfig();
    
    res.json({
      success: true,
      data: config,
      message: 'AI configuration retrieved successfully'
    } as APIResponse<any>);

  } catch (error) {
    console.error('Get AI config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI configuration'
    } as APIResponse<null>);
  }
});

/**
 * PUT /ai/config
 * Update AI service configuration
 */
router.put(
  '/config',
  validateMiddleware(updateConfigSchema),
  async (req: Request, res: Response) => {
    try {
      const updates = req.body;
      
      // Only allow certain config updates (not API keys for security)
      const allowedUpdates = {
        provider: updates.provider,
        model: updates.model,
        enabled: updates.enabled
      };

      // Remove undefined values
      const cleanUpdates = Object.fromEntries(
        Object.entries(allowedUpdates).filter(([_, value]) => value !== undefined)
      );

      aiService.updateConfig(cleanUpdates);
      
      const newConfig = aiService.getConfig();

      res.json({
        success: true,
        data: newConfig,
        message: 'AI configuration updated successfully'
      } as APIResponse<any>);

    } catch (error) {
      console.error('Update AI config error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update AI configuration'
      } as APIResponse<null>);
    }
  }
);

/**
 * GET /ai/health
 * Check AI service health and availability
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const isEnabled = aiService.isEnabled();
    const config = aiService.getConfig();

    res.json({
      success: true,
      data: {
        enabled: isEnabled,
        provider: config.provider,
        model: config.model,
        status: isEnabled ? 'healthy' : 'disabled'
      },
      message: 'AI service health check completed'
    } as APIResponse<any>);

  } catch (error) {
    console.error('AI health check error:', error);
    res.status(500).json({
      success: false,
      error: 'AI service health check failed'
    } as APIResponse<null>);
  }
});

export { router as aiRoutes };
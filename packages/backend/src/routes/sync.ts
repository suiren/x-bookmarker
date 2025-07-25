import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import {
  SyncJobConfig,
  SyncJobConfigSchema,
  SyncJobStatus,
} from '@x-bookmarker/shared';
import { SyncJobManager } from '../jobs/syncJob';
import { authenticateJWT } from '../middleware/auth';
import { apiRateLimit, xApiRateLimit } from '../middleware/rateLimit';

const router = Router();

// Dependencies will be injected
let db: Pool;
let syncJobManager: SyncJobManager;

export const setSyncDependencies = (
  database: Pool,
  jobManager: SyncJobManager
): void => {
  db = database;
  syncJobManager = jobManager;
};

/**
 * Start bookmark sync
 * POST /sync/start
 */
router.post(
  '/start',
  authenticateJWT,
  xApiRateLimit,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        });
        return;
      }

      // Validate request body
      const configValidation = SyncJobConfigSchema.safeParse({
        userId: req.user.userId,
        ...req.body,
      });

      if (!configValidation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid sync configuration',
          code: 'INVALID_SYNC_CONFIG',
          details: configValidation.error.issues,
        });
        return;
      }

      const config = configValidation.data;

      // Get user's access token from database
      const user = await getUserById(req.user.userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
        return;
      }

      if (!user.access_token) {
        res.status(400).json({
          success: false,
          error: 'User access token not available',
          code: 'ACCESS_TOKEN_MISSING',
        });
        return;
      }

      // Check token expiry
      if (
        user.token_expires_at &&
        new Date(user.token_expires_at) <= new Date()
      ) {
        res.status(400).json({
          success: false,
          error: 'Access token expired',
          code: 'ACCESS_TOKEN_EXPIRED',
        });
        return;
      }

      // Start sync job
      try {
        const jobId = await syncJobManager.startSyncJob(
          req.user.userId,
          config,
          user.access_token
        );

        res.json({
          success: true,
          jobId,
          message: 'Bookmark sync started',
          config: {
            fullSync: config.fullSync,
            maxTweets: config.maxTweets,
            batchSize: config.batchSize,
          },
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('already has an active sync job')
        ) {
          res.status(409).json({
            success: false,
            error: 'User already has an active sync job',
            code: 'SYNC_JOB_ACTIVE',
          });
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('❌ Start sync error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start sync',
        code: 'SYNC_START_ERROR',
      });
    }
  }
);

/**
 * Get sync job status
 * GET /sync/status/:jobId
 */
router.get(
  '/status/:jobId',
  authenticateJWT,
  apiRateLimit,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        });
        return;
      }

      const { jobId } = req.params;

      if (!jobId) {
        res.status(400).json({
          success: false,
          error: 'Job ID is required',
          code: 'JOB_ID_REQUIRED',
        });
        return;
      }

      const jobStatus = await syncJobManager.getJobStatus(jobId);

      if (!jobStatus) {
        res.status(404).json({
          success: false,
          error: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
        return;
      }

      // Check if job belongs to user
      if (jobStatus.userId !== req.user.userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          code: 'ACCESS_DENIED',
        });
        return;
      }

      res.json({
        success: true,
        job: jobStatus,
      });
    } catch (error) {
      console.error('❌ Get sync status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sync status',
        code: 'SYNC_STATUS_ERROR',
      });
    }
  }
);

/**
 * Cancel sync job
 * POST /sync/cancel/:jobId
 */
router.post(
  '/cancel/:jobId',
  authenticateJWT,
  apiRateLimit,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        });
        return;
      }

      const { jobId } = req.params;

      if (!jobId) {
        res.status(400).json({
          success: false,
          error: 'Job ID is required',
          code: 'JOB_ID_REQUIRED',
        });
        return;
      }

      try {
        const cancelled = await syncJobManager.cancelSyncJob(
          jobId,
          req.user.userId
        );

        if (cancelled) {
          res.json({
            success: true,
            message: 'Sync job cancelled successfully',
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'Job not found or already completed',
            code: 'JOB_NOT_FOUND',
          });
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Unauthorized')) {
          res.status(403).json({
            success: false,
            error: 'Access denied',
            code: 'ACCESS_DENIED',
          });
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('❌ Cancel sync error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel sync',
        code: 'SYNC_CANCEL_ERROR',
      });
    }
  }
);

/**
 * Get user's sync history
 * GET /sync/history
 */
router.get(
  '/history',
  authenticateJWT,
  apiRateLimit,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        });
        return;
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const history = await syncJobManager.getUserSyncHistory(
        req.user.userId,
        limit,
        offset
      );

      res.json({
        success: true,
        history,
        pagination: {
          limit,
          offset,
          total: history.length,
        },
      });
    } catch (error) {
      console.error('❌ Get sync history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sync history',
        code: 'SYNC_HISTORY_ERROR',
      });
    }
  }
);

/**
 * Get sync queue statistics (admin only)
 * GET /sync/stats
 */
router.get(
  '/stats',
  authenticateJWT,
  apiRateLimit,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        });
        return;
      }

      // TODO: Add admin role check
      // For now, any authenticated user can view stats

      const stats = await syncJobManager.getQueueStats();

      res.json({
        success: true,
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('❌ Get sync stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sync stats',
        code: 'SYNC_STATS_ERROR',
      });
    }
  }
);

/**
 * Health check for sync service
 * GET /sync/health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const stats = await syncJobManager.getQueueStats();
    const isHealthy = stats.active < 10 && stats.failed < 5; // Simple health check

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      status: isHealthy ? 'healthy' : 'degraded',
      queue: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Sync health check error:', error);
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Sync service unavailable',
      code: 'SYNC_SERVICE_ERROR',
    });
  }
});

/**
 * Cleanup old jobs (admin endpoint)
 * POST /sync/cleanup
 */
router.post(
  '/cleanup',
  authenticateJWT,
  apiRateLimit,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        });
        return;
      }

      // TODO: Add admin role check

      await syncJobManager.cleanupOldJobs();

      res.json({
        success: true,
        message: 'Old jobs cleaned up successfully',
      });
    } catch (error) {
      console.error('❌ Sync cleanup error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cleanup old jobs',
        code: 'SYNC_CLEANUP_ERROR',
      });
    }
  }
);

// Helper function
async function getUserById(userId: string) {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

export default router;

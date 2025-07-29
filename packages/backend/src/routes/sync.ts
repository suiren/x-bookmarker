import { Router, Request, Response } from 'express';
import { syncQueue, SyncJobData } from '../queue/queue';
import { authenticateJWT } from '../middleware/auth';
import { apiRateLimit, xApiRateLimit } from '../middleware/rateLimit';
import { logger } from '../utils/logger';
import { DatabaseService } from '../services/databaseService';

const router = Router();
const db = DatabaseService.getInstance();

/**
 * Start bookmark sync
 * POST /bookmarks/sync
 */
router.post(
  '/',
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

      const userId = req.user.userId;
      const { fullSync = false, forceSync = false } = req.body;

      // Check if user already has an active sync job
      const activeJobs = await syncQueue.getActive();
      const userActiveJob = activeJobs.find(job => job.data.userId === userId);

      if (userActiveJob && !forceSync) {
        res.status(409).json({
          success: false,
          error: 'User already has an active sync job',
          code: 'SYNC_JOB_ACTIVE',
          jobId: userActiveJob.id,
        });
        return;
      }

      // Get user info from database
      const userResult = await db.query(
        'SELECT access_token, refresh_token, token_expires_at FROM users WHERE id = $1',
        [userId]
      );

      if (!userResult.rows.length) {
        res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
        return;
      }

      const user = userResult.rows[0];

      // Check if user has valid tokens
      if (!user.access_token) {
        res.status(400).json({
          success: false,
          error: 'User needs to authenticate with X',
          code: 'AUTHENTICATION_REQUIRED',
        });
        return;
      }

      // Get last sync time
      const lastSyncResult = await db.query(
        'SELECT updated_at FROM users WHERE id = $1',
        [userId]
      );
      const lastSyncTime = lastSyncResult.rows[0]?.updated_at;

      // Create sync job data
      const jobData: SyncJobData = {
        userId,
        lastSyncTime: lastSyncTime ? new Date(lastSyncTime) : undefined,
        options: {
          fullSync,
          forceSync,
        },
      };

      // Add job to queue with high priority for forced syncs
      const job = await syncQueue.add('bookmark-sync', jobData, {
        priority: forceSync ? 10 : 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      // Save job to database for tracking
      await db.query(
        `INSERT INTO sync_jobs (id, user_id, status, created_at) 
         VALUES ($1, $2, 'pending', NOW())`,
        [job.id, userId]
      );

      logger.info('同期ジョブを開始しました', {
        jobId: job.id,
        userId,
        fullSync,
        forceSync,
      });

      res.json({
        success: true,
        jobId: job.id,
        message: 'Bookmark sync started',
        options: {
          fullSync,
          forceSync,
        },
      });
    } catch (error) {
      logger.error('同期開始エラー', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.userId,
      });

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
      const userId = req.user.userId;

      if (!jobId) {
        res.status(400).json({
          success: false,
          error: 'Job ID is required',
          code: 'JOB_ID_REQUIRED',
        });
        return;
      }

      // Get job from Bull queue
      const job = await syncQueue.getJob(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
        return;
      }

      // Verify job belongs to user
      if (job.data.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          code: 'ACCESS_DENIED',
        });
        return;
      }

      // Get job state and progress
      const state = await job.getState();
      const progress = job.progress();
      const logs = job.returnvalue;

      // Get additional job info from database
      const jobInfoResult = await db.query(
        'SELECT * FROM sync_jobs WHERE id = $1',
        [jobId]
      );
      const jobInfo = jobInfoResult.rows[0];

      const response = {
        success: true,
        job: {
          id: job.id,
          userId: job.data.userId,
          status: state,
          progress: progress || {
            total: 0,
            processed: 0,
            percentage: 0,
            errors: [],
          },
          options: job.data.options,
          createdAt: new Date(job.timestamp).toISOString(),
          processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
          finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          result: logs,
          failedReason: job.failedReason,
          ...(jobInfo && {
            dbStatus: jobInfo.status,
            totalItems: jobInfo.total_items,
            processedItems: jobInfo.processed_items,
            errorMessage: jobInfo.error_message,
          }),
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('同期状態取得エラー', {
        error: error instanceof Error ? error.message : String(error),
        jobId: req.params.jobId,
        userId: req.user?.userId,
      });

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
      const userId = req.user.userId;

      if (!jobId) {
        res.status(400).json({
          success: false,
          error: 'Job ID is required',
          code: 'JOB_ID_REQUIRED',
        });
        return;
      }

      // Get job from Bull queue
      const job = await syncQueue.getJob(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: 'Job not found',
          code: 'JOB_NOT_FOUND',
        });
        return;
      }

      // Verify job belongs to user
      if (job.data.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
          code: 'ACCESS_DENIED',
        });
        return;
      }

      // Cancel the job
      await job.remove();

      // Update database status
      await db.query(
        'UPDATE sync_jobs SET status = $1, error_message = $2 WHERE id = $3',
        ['cancelled', 'Cancelled by user', jobId]
      );

      logger.info('同期ジョブをキャンセルしました', {
        jobId,
        userId,
      });

      res.json({
        success: true,
        message: 'Sync job cancelled successfully',
      });
    } catch (error) {
      logger.error('同期キャンセルエラー', {
        error: error instanceof Error ? error.message : String(error),
        jobId: req.params.jobId,
        userId: req.user?.userId,
      });

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

      const userId = req.user.userId;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      // Get sync history from database
      const historyResult = await db.query(
        `SELECT * FROM sync_jobs 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      const totalResult = await db.query(
        'SELECT COUNT(*) as total FROM sync_jobs WHERE user_id = $1',
        [userId]
      );

      const total = parseInt(totalResult.rows[0].total);

      res.json({
        success: true,
        history: historyResult.rows,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      logger.error('同期履歴取得エラー', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get sync history',
        code: 'SYNC_HISTORY_ERROR',
      });
    }
  }
);

/**
 * Get sync queue statistics
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

      // Get queue statistics
      const [waiting, active, completed, failed] = await Promise.all([
        syncQueue.getWaiting(),
        syncQueue.getActive(),
        syncQueue.getCompleted(),
        syncQueue.getFailed(),
      ]);

      const stats = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length + completed.length + failed.length,
      };

      res.json({
        success: true,
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('同期統計取得エラー', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get sync stats',
        code: 'SYNC_STATS_ERROR',
      });
    }
  }
);

/**
 * Get detailed sync analytics for user
 * GET /sync/analytics
 */
router.get(
  '/analytics',
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

      const userId = req.user.userId;
      const days = parseInt(req.query.days as string) || 30;

      // 基本統計情報
      const statsResult = await db.query(
        `SELECT 
          COUNT(*) as total_syncs,
          COUNT(CASE WHEN status = 'completed' AND completed_at >= NOW() - INTERVAL '${days} days' THEN 1 END) as successful_syncs,
          COUNT(CASE WHEN status = 'failed' AND completed_at >= NOW() - INTERVAL '${days} days' THEN 1 END) as failed_syncs,
          AVG(CASE WHEN status = 'completed' AND total_items > 0 THEN total_items END) as avg_items_per_sync,
          MAX(total_items) as max_items_synced,
          MIN(created_at) as first_sync,
          MAX(completed_at) as last_sync
         FROM sync_jobs 
         WHERE user_id = $1`,
        [userId]
      );

      // 日別同期履歴
      const dailyStatsResult = await db.query(
        `SELECT 
          DATE(created_at) as sync_date,
          COUNT(*) as total_syncs,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_syncs,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_syncs,
          SUM(CASE WHEN status = 'completed' THEN total_items ELSE 0 END) as total_items_synced
         FROM sync_jobs 
         WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY DATE(created_at)
         ORDER BY sync_date DESC`,
        [userId]
      );

      // 最近のエラー分析
      const errorAnalysisResult = await db.query(
        `SELECT 
          error_message,
          COUNT(*) as occurrence_count,
          MAX(created_at) as last_occurrence
         FROM sync_jobs 
         WHERE user_id = $1 AND status = 'failed' AND created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY error_message
         ORDER BY occurrence_count DESC, last_occurrence DESC
         LIMIT 10`,
        [userId]
      );

      const analytics = {
        summary: statsResult.rows[0],
        dailyStats: dailyStatsResult.rows,
        errorAnalysis: errorAnalysisResult.rows,
        period: {
          days,
          startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
        },
      };

      res.json({
        success: true,
        analytics,
      });
    } catch (error) {
      logger.error('同期分析取得エラー', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get sync analytics',
        code: 'SYNC_ANALYTICS_ERROR',
      });
    }
  }
);

/**
 * Delete old sync history
 * DELETE /sync/history/cleanup
 */
router.delete(
  '/history/cleanup',
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

      const userId = req.user.userId;
      const daysToKeep = parseInt(req.query.days as string) || 90;

      // 古い同期履歴を削除（90日以上前）
      const deleteResult = await db.query(
        'DELETE FROM sync_jobs WHERE user_id = $1 AND created_at < NOW() - INTERVAL $2',
        [userId, `${daysToKeep} days`]
      );

      res.json({
        success: true,
        deletedCount: deleteResult.rowCount,
        message: `Deleted sync history older than ${daysToKeep} days`,
      });

      logger.info('同期履歴をクリーンアップしました', {
        userId,
        deletedCount: deleteResult.rowCount,
        daysToKeep,
      });
    } catch (error) {
      logger.error('同期履歴クリーンアップエラー', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to cleanup sync history',
        code: 'SYNC_CLEANUP_ERROR',
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
    const [waiting, active, failed] = await Promise.all([
      syncQueue.getWaiting(),
      syncQueue.getActive(),
      syncQueue.getFailed(),
    ]);

    const stats = {
      waiting: waiting.length,
      active: active.length,
      failed: failed.length,
    };

    const isHealthy = stats.active < 10 && stats.failed < 5;

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      status: isHealthy ? 'healthy' : 'degraded',
      queue: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('同期ヘルスチェックエラー', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Sync service unavailable',
      code: 'SYNC_SERVICE_ERROR',
    });
  }
});

export default router;
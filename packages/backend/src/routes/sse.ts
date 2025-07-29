import { Router, Request, Response } from 'express';
import { syncQueue } from '../queue/queue';
import { authenticateJWT } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Server-Sent Events endpoint for real-time sync progress
 * GET /sync/events/:jobId
 */
router.get(
  '/events/:jobId',
  authenticateJWT,
  async (req: Request, res: Response) => {
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

    try {
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

      // Setup SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Send initial connection confirmation
      res.write('data: {"type":"connected","jobId":"' + jobId + '"}\n\n');

      // Function to send progress updates
      const sendProgress = async () => {
        try {
          const currentJob = await syncQueue.getJob(jobId);
          if (!currentJob) {
            res.write('data: {"type":"error","message":"Job not found"}\n\n');
            res.end();
            return;
          }

          const state = await currentJob.getState();
          const progress = currentJob.progress();
          const result = currentJob.returnvalue;
          const error = currentJob.failedReason;

          const progressData = {
            type: 'progress',
            jobId,
            status: state,
            progress: progress || {
              total: 0,
              processed: 0,
              percentage: 0,
              currentItem: 'Preparing...',
              errors: [],
            },
            result,
            error,
            timestamp: new Date().toISOString(),
          };

          res.write(`data: ${JSON.stringify(progressData)}\n\n`);

          // If job is completed or failed, close the connection
          if (state === 'completed' || state === 'failed') {
            logger.info('SSE接続を終了します', {
              jobId,
              userId,
              finalStatus: state,
            });
            res.end();
            clearInterval(intervalId);
            return;
          }
        } catch (error) {
          logger.error('SSE進捗送信エラー', {
            jobId,
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
          res.write(`data: {"type":"error","message":"Failed to get progress"}\n\n`);
          res.end();
          clearInterval(intervalId);
        }
      };

      // Send progress updates every 2 seconds
      const intervalId = setInterval(sendProgress, 2000);

      // Send initial progress
      await sendProgress();

      // Handle client disconnect
      req.on('close', () => {
        logger.info('SSEクライアント切断', { jobId, userId });
        clearInterval(intervalId);
        res.end();
      });

      req.on('error', (error) => {
        logger.error('SSE接続エラー', {
          jobId,
          userId,
          error: error.message,
        });
        clearInterval(intervalId);
        res.end();
      });

      logger.info('SSE接続を開始しました', { jobId, userId });

    } catch (error) {
      logger.error('SSE初期化エラー', {
        jobId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to initialize progress stream',
        code: 'SSE_INIT_ERROR',
      });
    }
  }
);

/**
 * WebSocket-style events for specific job updates
 * This endpoint can be used for more granular event listening
 * GET /sync/events/:jobId/updates
 */
router.get(
  '/events/:jobId/updates',
  authenticateJWT,
  async (req: Request, res: Response) => {
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

    try {
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

      // Setup SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 30000);

      // Listen for job events (this would require extending Bull Queue with custom events)
      // For now, we'll simulate with periodic checks
      let previousProgress: any = null;

      const checkForUpdates = async () => {
        try {
          const currentJob = await syncQueue.getJob(jobId);
          if (!currentJob) {
            res.write('event: error\ndata: {"message":"Job not found"}\n\n');
            res.end();
            return;
          }

          const state = await currentJob.getState();
          const progress = currentJob.progress();

          // Only send updates if progress has changed
          const currentProgressStr = JSON.stringify(progress);
          if (currentProgressStr !== previousProgress) {
            const eventData = {
              jobId,
              status: state,
              progress,
              timestamp: new Date().toISOString(),
            };

            res.write(`event: progress\ndata: ${JSON.stringify(eventData)}\n\n`);
            previousProgress = currentProgressStr;

            // Send completion event
            if (state === 'completed') {
              const result = currentJob.returnvalue;
              res.write(`event: completed\ndata: ${JSON.stringify({ jobId, result })}\n\n`);
              clearInterval(updateInterval);
              clearInterval(heartbeatInterval);
              res.end();
            } else if (state === 'failed') {
              const error = currentJob.failedReason;
              res.write(`event: failed\ndata: ${JSON.stringify({ jobId, error })}\n\n`);
              clearInterval(updateInterval);
              clearInterval(heartbeatInterval);
              res.end();
            }
          }
        } catch (error) {
          logger.error('SSE更新チェックエラー', {
            jobId,
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
          res.write(`event: error\ndata: {"message":"Update check failed"}\n\n`);
          clearInterval(updateInterval);
          clearInterval(heartbeatInterval);
          res.end();
        }
      };

      // Check for updates every second
      const updateInterval = setInterval(checkForUpdates, 1000);

      // Initial update
      await checkForUpdates();

      // Handle client disconnect
      req.on('close', () => {
        logger.info('SSE更新ストリーム切断', { jobId, userId });
        clearInterval(updateInterval);
        clearInterval(heartbeatInterval);
        res.end();
      });

      req.on('error', (error) => {
        logger.error('SSE更新ストリームエラー', {
          jobId,
          userId,
          error: error.message,
        });
        clearInterval(updateInterval);
        clearInterval(heartbeatInterval);
        res.end();
      });

      logger.info('SSE更新ストリームを開始しました', { jobId, userId });

    } catch (error) {
      logger.error('SSE更新ストリーム初期化エラー', {
        jobId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to initialize update stream',
        code: 'SSE_UPDATE_INIT_ERROR',
      });
    }
  }
);

export default router;
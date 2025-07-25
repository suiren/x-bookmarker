import { Pool } from 'pg';
import Bull, { Job, Queue } from 'bull';
import {
  SyncJobConfig,
  SyncJobStatus,
  SyncJobResult,
  XApiClientConfig,
} from '@x-bookmarker/shared';
import { createXApiClient } from '../services/xApiClient';
import { BookmarkService } from '../services/bookmarkService';

interface SyncJobData {
  userId: string;
  config: SyncJobConfig;
  userAccessToken: string;
}

interface JobProgress {
  current: number;
  total?: number;
  percentage: number;
  message?: string;
}

class SyncJobManager {
  private syncQueue: Queue<SyncJobData>;
  private db: Pool;
  private activeJobs = new Map<string, Job<SyncJobData>>();

  constructor(db: Pool, redisUrl: string) {
    this.db = db;

    // Initialize Bull queue
    this.syncQueue = new Bull<SyncJobData>('bookmark-sync', {
      redis: redisUrl,
      defaultJobOptions: {
        removeOnComplete: 50, // Keep last 50 completed jobs
        removeOnFail: 100, // Keep last 100 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.setupJobProcessors();
    this.setupJobEventListeners();
  }

  /**
   * Start a new bookmark sync job
   */
  async startSyncJob(
    userId: string,
    config: SyncJobConfig,
    userAccessToken: string
  ): Promise<string> {
    // Check if user already has an active sync job
    const existingJob = await this.getActiveJobForUser(userId);
    if (existingJob) {
      throw new Error('User already has an active sync job');
    }

    // Create job data
    const jobData: SyncJobData = {
      userId,
      config,
      userAccessToken,
    };

    // Add job to queue
    const job = await this.syncQueue.add(jobData, {
      priority: config.fullSync ? 1 : 5, // Full sync has higher priority
      delay: 0,
      jobId: `sync-${userId}-${Date.now()}`,
    });

    // Store job reference
    this.activeJobs.set(job.id as string, job);

    // Store job in database
    await this.saveJobToDatabase(job.id as string, userId, 'pending', config);

    console.log(`📋 Started sync job ${job.id} for user ${userId}`);
    return job.id as string;
  }

  /**
   * Cancel a sync job
   */
  async cancelSyncJob(jobId: string, userId: string): Promise<boolean> {
    const job = await this.syncQueue.getJob(jobId);
    if (!job) {
      return false;
    }

    // Check if job belongs to user
    if (job.data.userId !== userId) {
      throw new Error('Unauthorized to cancel this job');
    }

    // Remove job from queue
    await job.remove();
    this.activeJobs.delete(jobId);

    // Update database
    await this.updateJobStatus(jobId, 'cancelled');

    console.log(`🛑 Cancelled sync job ${jobId} for user ${userId}`);
    return true;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<SyncJobStatus | null> {
    // First check database
    const dbJob = await this.getJobFromDatabase(jobId);
    if (!dbJob) {
      return null;
    }

    // Get job from queue for live progress
    const queueJob = await this.syncQueue.getJob(jobId);
    if (!queueJob) {
      return dbJob;
    }

    // Merge database data with live progress
    const progress = queueJob.progress() as JobProgress;
    return {
      ...dbJob,
      progress: {
        current: progress.current || 0,
        total: progress.total || 0,
        percentage: progress.percentage || 0,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get user's sync job history
   */
  async getUserSyncHistory(
    userId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<SyncJobStatus[]> {
    const result = await this.db.query(
      `
      SELECT * FROM sync_jobs 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `,
      [userId, limit, offset]
    );

    return result.rows.map(row => this.mapDbRowToJobStatus(row));
  }

  /**
   * Setup job processors
   */
  private setupJobProcessors(): void {
    this.syncQueue.process(async (job: Job<SyncJobData>) => {
      const { userId, config, userAccessToken } = job.data;

      try {
        // Update job status to running
        await this.updateJobStatus(job.id as string, 'running');

        // Create X API client with user's token
        const xApiClient = createXApiClient({
          bearerToken: userAccessToken,
          baseURL: 'https://api.twitter.com/2',
          timeout: 30000,
          retryAttempts: 3,
          retryDelay: 1000,
          rateLimitBuffer: 5,
        });

        // Create bookmark service
        const bookmarkService = new BookmarkService(this.db, xApiClient);

        // Start sync process
        const syncGenerator = bookmarkService.syncUserBookmarks(userId, config);

        let lastStatus: SyncJobStatus | null = null;
        for await (const status of syncGenerator) {
          lastStatus = status;

          // Update job progress
          await job.progress({
            current: status.stats.tweetsProcessed,
            total: config.maxTweets,
            percentage: Math.round(
              (status.stats.tweetsProcessed / config.maxTweets) * 100
            ),
            message: `Processed ${status.stats.tweetsProcessed} tweets`,
          });

          // Update database status
          await this.updateJobStatusFull(job.id as string, status);

          // Handle rate limiting
          if (status.rateLimit?.retryAfter) {
            console.log(`⏳ Job ${job.id} waiting for rate limit reset...`);
          }
        }

        // Get final result
        const result = await syncGenerator.return(undefined);

        if (result.value?.success) {
          await this.updateJobStatus(
            job.id as string,
            'completed',
            result.value.stats
          );
          console.log(`✅ Completed sync job ${job.id} for user ${userId}`);
          return result.value;
        } else {
          await this.updateJobStatus(
            job.id as string,
            'failed',
            result.value?.stats,
            result.value?.error
          );
          throw new Error(result.value?.error?.message || 'Sync failed');
        }
      } catch (error) {
        console.error(`❌ Sync job ${job.id} failed:`, error);
        await this.updateJobStatus(job.id as string, 'failed', undefined, {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'SYNC_JOB_ERROR',
        });
        throw error;
      } finally {
        // Remove from active jobs
        this.activeJobs.delete(job.id as string);
      }
    });
  }

  /**
   * Setup job event listeners
   */
  private setupJobEventListeners(): void {
    this.syncQueue.on(
      'completed',
      (job: Job<SyncJobData>, result: SyncJobResult) => {
        console.log(
          `✅ Job ${job.id} completed with ${result.stats.bookmarksAdded} new bookmarks`
        );
      }
    );

    this.syncQueue.on('failed', (job: Job<SyncJobData>, error: Error) => {
      console.error(`❌ Job ${job.id} failed:`, error.message);
    });

    this.syncQueue.on('stalled', (job: Job<SyncJobData>) => {
      console.warn(`⚠️  Job ${job.id} stalled`);
    });

    this.syncQueue.on(
      'progress',
      (job: Job<SyncJobData>, progress: JobProgress) => {
        console.log(`📊 Job ${job.id} progress: ${progress.percentage}%`);
      }
    );
  }

  /**
   * Get active job for user
   */
  private async getActiveJobForUser(
    userId: string
  ): Promise<Job<SyncJobData> | null> {
    const waitingJobs = await this.syncQueue.getWaiting();
    const activeJobs = await this.syncQueue.getActive();

    const allJobs = [...waitingJobs, ...activeJobs];
    return allJobs.find(job => job.data.userId === userId) || null;
  }

  /**
   * Save job to database
   */
  private async saveJobToDatabase(
    jobId: string,
    userId: string,
    status: string,
    config: SyncJobConfig
  ): Promise<void> {
    await this.db.query(
      `
      INSERT INTO sync_jobs (
        id, user_id, status, config, progress, stats, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `,
      [
        jobId,
        userId,
        status,
        JSON.stringify(config),
        JSON.stringify({ current: 0, total: 0, percentage: 0 }),
        JSON.stringify({
          tweetsProcessed: 0,
          bookmarksAdded: 0,
          bookmarksUpdated: 0,
          bookmarksSkipped: 0,
          errors: 0,
        }),
      ]
    );
  }

  /**
   * Update job status in database
   */
  private async updateJobStatus(
    jobId: string,
    status: string,
    stats?: any,
    error?: { message: string; code: string }
  ): Promise<void> {
    const updateFields = ['status = $2', 'updated_at = NOW()'];
    const values = [jobId, status];
    let paramIndex = 3;

    if (stats) {
      updateFields.push(`stats = $${paramIndex}`);
      values.push(JSON.stringify(stats));
      paramIndex++;
    }

    if (error) {
      updateFields.push(`error = $${paramIndex}`);
      values.push(JSON.stringify(error));
      paramIndex++;
    }

    if (status === 'completed' || status === 'failed') {
      updateFields.push(`completed_at = NOW()`);
    }

    await this.db.query(
      `
      UPDATE sync_jobs 
      SET ${updateFields.join(', ')}
      WHERE id = $1
    `,
      values
    );
  }

  /**
   * Update full job status in database
   */
  private async updateJobStatusFull(
    jobId: string,
    status: SyncJobStatus
  ): Promise<void> {
    await this.db.query(
      `
      UPDATE sync_jobs 
      SET 
        status = $2,
        progress = $3,
        stats = $4,
        rate_limit = $5,
        error = $6,
        updated_at = NOW()
      WHERE id = $1
    `,
      [
        jobId,
        status.status,
        JSON.stringify(status.progress),
        JSON.stringify(status.stats),
        status.rateLimit ? JSON.stringify(status.rateLimit) : null,
        status.error ? JSON.stringify(status.error) : null,
      ]
    );
  }

  /**
   * Get job from database
   */
  private async getJobFromDatabase(
    jobId: string
  ): Promise<SyncJobStatus | null> {
    const result = await this.db.query(
      'SELECT * FROM sync_jobs WHERE id = $1',
      [jobId]
    );
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDbRowToJobStatus(result.rows[0]);
  }

  /**
   * Map database row to job status
   */
  private mapDbRowToJobStatus(row: any): SyncJobStatus {
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      progress: JSON.parse(
        row.progress || '{"current":0,"total":0,"percentage":0}'
      ),
      stats: JSON.parse(
        row.stats ||
          '{"tweetsProcessed":0,"bookmarksAdded":0,"bookmarksUpdated":0,"bookmarksSkipped":0,"errors":0}'
      ),
      rateLimit: row.rate_limit ? JSON.parse(row.rate_limit) : undefined,
      error: row.error ? JSON.parse(row.error) : undefined,
      startedAt: row.started_at?.toISOString(),
      completedAt: row.completed_at?.toISOString(),
      estimatedCompletionAt: row.estimated_completion_at?.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.syncQueue.getWaiting(),
      this.syncQueue.getActive(),
      this.syncQueue.getCompleted(),
      this.syncQueue.getFailed(),
      this.syncQueue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  /**
   * Clean up old jobs
   */
  async cleanupOldJobs(): Promise<void> {
    // Clean queue
    await this.syncQueue.clean(24 * 60 * 60 * 1000, 'completed'); // 24 hours
    await this.syncQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // 7 days

    // Clean database
    await this.db.query(`
      DELETE FROM sync_jobs 
      WHERE completed_at < NOW() - INTERVAL '30 days'
      AND status IN ('completed', 'failed', 'cancelled')
    `);
  }

  /**
   * Close queue connection
   */
  async close(): Promise<void> {
    await this.syncQueue.close();
  }
}

export { SyncJobManager };

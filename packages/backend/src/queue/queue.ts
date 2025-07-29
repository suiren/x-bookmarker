import Bull from 'bull';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis接続設定
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
};

// Redis クライアント
export const redis = new Redis(redisConfig);

// Bull Queue インスタンス
export const syncQueue = new Bull('bookmark-sync', {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 10, // 完了したジョブは10件まで保持
    removeOnFail: 50,     // 失敗したジョブは50件まで保持
    attempts: 3,          // 最大3回リトライ
    backoff: {
      type: 'exponential',
      delay: 2000,        // 2秒から開始
    },
  },
});

// Queue イベントハンドラー
syncQueue.on('completed', (job, result) => {
  logger.info('同期ジョブが完了しました', {
    jobId: job.id,
    userId: job.data.userId,
    duration: Date.now() - job.processedOn,
    result,
  });
});

syncQueue.on('failed', (job, err) => {
  logger.error('同期ジョブが失敗しました', {
    jobId: job.id,
    userId: job.data.userId,
    error: err.message,
    stack: err.stack,
  });
});

syncQueue.on('stalled', (job) => {
  logger.warn('同期ジョブがスタックしました', {
    jobId: job.id,
    userId: job.data.userId,
  });
});

// Queue の初期化
export const initializeQueue = async (): Promise<void> => {
  try {
    await redis.ping();
    logger.info('Redis接続が確立されました');
    
    // Queueの統計情報をログ出力
    const waiting = await syncQueue.getWaiting();
    const active = await syncQueue.getActive();
    const completed = await syncQueue.getCompleted();
    const failed = await syncQueue.getFailed();
    
    logger.info('Queue初期化完了', {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    });
  } catch (error) {
    logger.error('Queue初期化に失敗しました', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

// Queue のクリーンアップ
export const cleanupQueue = async (): Promise<void> => {
  try {
    await syncQueue.close();
    await redis.disconnect();
    logger.info('Queue接続を正常に切断しました');
  } catch (error) {
    logger.error('Queue切断時にエラーが発生しました', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// ジョブ情報の型定義
export interface SyncJobData {
  userId: string;
  lastSyncTime?: Date;
  options?: {
    fullSync?: boolean;
    forceSync?: boolean;
  };
}

export interface SyncJobResult {
  totalFetched: number;
  newBookmarks: number;
  updatedBookmarks: number;
  errors: string[];
  syncTime: number;
}

// ジョブの状態型定義
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';

export interface JobProgress {
  total: number;
  processed: number;
  percentage: number;
  currentItem?: string;
  errors: string[];
}
/**
 * 最適化されたキューシステム
 * Bull Queueの並列処理とバッチサイズを最適化
 */

import Queue, { Job, JobOptions, ProcessCallbackFunction } from 'bull';
import Redis from 'ioredis';
import { config } from '../config';

interface QueueConfig {
  concurrency: number;
  batchSize: number;
  maxRetries: number;
  backoffType: 'fixed' | 'exponential';
  backoffDelay: number;
}

interface JobMetrics {
  jobType: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  avgProcessingTime: number;
  throughput: number; // jobs per minute
}

class OptimizedQueueManager {
  private redis: Redis;
  private queues: Map<string, Queue.Queue> = new Map();
  private metrics: Map<string, JobMetrics> = new Map();
  private processingTimes: Map<string, number[]> = new Map();

  // 各ジョブタイプの最適化設定
  private readonly queueConfigs: Record<string, QueueConfig> = {
    'bookmark-sync': {
      concurrency: 3, // 同時実行数を制限（API制限考慮）
      batchSize: 50, // X APIの制限に合わせて調整
      maxRetries: 3,
      backoffType: 'exponential',
      backoffDelay: 5000,
    },
    'search-indexing': {
      concurrency: 5, // 検索インデックス更新は並列度高め
      batchSize: 100,
      maxRetries: 2,
      backoffType: 'fixed',
      backoffDelay: 2000,
    },
    'cache-cleanup': {
      concurrency: 2, // キャッシュクリーンアップは軽量
      batchSize: 1000,
      maxRetries: 1,
      backoffType: 'fixed',
      backoffDelay: 1000,
    },
    'notification': {
      concurrency: 10, // 通知は高並列度
      batchSize: 20,
      maxRetries: 5,
      backoffType: 'exponential',
      backoffDelay: 1000,
    },
    'analytics': {
      concurrency: 2, // 分析は低優先度
      batchSize: 500,
      maxRetries: 1,
      backoffType: 'fixed',
      backoffDelay: 10000,
    },
  };

  constructor() {
    this.redis = new Redis({
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      db: config.redis?.db || 1, // キューは別DBを使用
    });

    this.setupEventHandlers();
  }

  /**
   * キューを初期化
   */
  private initializeQueue(queueName: string): Queue.Queue {
    const queueConfig = this.queueConfigs[queueName] || this.queueConfigs['notification'];
    
    const queue = new Queue(queueName, {
      redis: {
        host: config.redis?.host || 'localhost',
        port: config.redis?.port || 6379,
        password: config.redis?.password,
        db: config.redis?.db || 1,
      },
      defaultJobOptions: {
        attempts: queueConfig.maxRetries + 1,
        backoff: {
          type: queueConfig.backoffType,
          delay: queueConfig.backoffDelay,
        },
        removeOnComplete: 100, // 完了ジョブの保持数
        removeOnFail: 50, // 失敗ジョブの保持数
      },
      settings: {
        stalledInterval: 30000, // 30秒
        maxStalledCount: 3,
      },
    });

    // イベントハンドラーの設定
    this.setupQueueEventHandlers(queue, queueName);

    return queue;
  }

  /**
   * キューを取得または作成
   */
  getQueue(queueName: string): Queue.Queue {
    if (!this.queues.has(queueName)) {
      const queue = this.initializeQueue(queueName);
      this.queues.set(queueName, queue);
      
      // メトリクス初期化
      this.metrics.set(queueName, {
        jobType: queueName,
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        activeJobs: 0,
        avgProcessingTime: 0,
        throughput: 0,
      });
      
      this.processingTimes.set(queueName, []);
    }
    
    return this.queues.get(queueName)!;
  }

  /**
   * ジョブを追加（バッチ処理対応）
   */
  async addJob(
    queueName: string,
    jobName: string,
    data: any,
    options?: JobOptions
  ): Promise<Job> {
    const queue = this.getQueue(queueName);
    const job = await queue.add(jobName, data, options);

    // メトリクス更新
    const metrics = this.metrics.get(queueName)!;
    metrics.totalJobs++;
    
    return job;
  }

  /**
   * バッチジョブを追加
   */
  async addBatchJobs(
    queueName: string,
    jobs: Array<{ name: string; data: any; options?: JobOptions }>
  ): Promise<Job[]> {
    const queue = this.getQueue(queueName);
    const result = await queue.addBulk(jobs);

    // メトリクス更新
    const metrics = this.metrics.get(queueName)!;
    metrics.totalJobs += jobs.length;

    return result;
  }

  /**
   * プロセッサーを登録（最適化された並列処理）
   */
  process(
    queueName: string,
    jobName: string,
    processor: ProcessCallbackFunction<any>
  ): void {
    const queue = this.getQueue(queueName);
    const config = this.queueConfigs[queueName] || this.queueConfigs['notification'];

    // 並列実行数を設定してプロセッサーを登録
    queue.process(jobName, config.concurrency, async (job) => {
      const startTime = Date.now();
      
      try {
        const result = await processor(job);
        
        // 処理時間を記録
        const processingTime = Date.now() - startTime;
        this.recordProcessingTime(queueName, processingTime);
        
        // メトリクス更新
        const metrics = this.metrics.get(queueName)!;
        metrics.completedJobs++;
        
        return result;
      } catch (error) {
        // 失敗メトリクス更新
        const metrics = this.metrics.get(queueName)!;
        metrics.failedJobs++;
        
        throw error;
      }
    });
  }

  /**
   * バッチプロセッサーを登録
   */
  processBatch(
    queueName: string,
    jobName: string,
    processor: (jobs: Job[]) => Promise<void>
  ): void {
    const queue = this.getQueue(queueName);
    const config = this.queueConfigs[queueName] || this.queueConfigs['notification'];

    queue.process(jobName, config.concurrency, async (job) => {
      // バッチサイズ分のジョブを取得
      const batchJobs = await this.getBatchJobs(queue, config.batchSize);
      
      if (batchJobs.length > 0) {
        await processor(batchJobs);
      }
      
      return { processedCount: batchJobs.length };
    });
  }

  /**
   * 優先度付きジョブ処理
   */
  async addPriorityJob(
    queueName: string,
    jobName: string,
    data: any,
    priority: 'low' | 'normal' | 'high' | 'critical' = 'normal'
  ): Promise<Job> {
    const priorityMap = {
      low: 1,
      normal: 5,
      high: 10,
      critical: 20,
    };

    return this.addJob(queueName, jobName, data, {
      priority: priorityMap[priority],
    });
  }

  /**
   * 遅延実行ジョブを追加
   */
  async addDelayedJob(
    queueName: string,
    jobName: string,
    data: any,
    delayMs: number
  ): Promise<Job> {
    return this.addJob(queueName, jobName, data, {
      delay: delayMs,
    });
  }

  /**
   * 定期実行ジョブを追加（cron形式）
   */
  async addRecurringJob(
    queueName: string,
    jobName: string,
    data: any,
    cronPattern: string
  ): Promise<Job> {
    return this.addJob(queueName, jobName, data, {
      repeat: { cron: cronPattern },
    });
  }

  /**
   * キュー状態を取得
   */
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    const queue = this.getQueue(queueName);
    
    return {
      waiting: await queue.getWaiting().then(jobs => jobs.length),
      active: await queue.getActive().then(jobs => jobs.length),
      completed: await queue.getCompleted().then(jobs => jobs.length),
      failed: await queue.getFailed().then(jobs => jobs.length),
      delayed: await queue.getDelayed().then(jobs => jobs.length),
      paused: queue.isPaused() ? 1 : 0,
    };
  }

  /**
   * 全体のパフォーマンスメトリクスを取得
   */
  async getPerformanceMetrics(): Promise<Record<string, JobMetrics>> {
    const result: Record<string, JobMetrics> = {};
    
    for (const [queueName, metrics] of this.metrics.entries()) {
      const queueStats = await this.getQueueStats(queueName);
      const processingTimes = this.processingTimes.get(queueName) || [];
      
      // 平均処理時間を計算
      const avgProcessingTime = processingTimes.length > 0
        ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
        : 0;

      // スループット計算（過去10分間の完了ジョブ数）
      const throughput = this.calculateThroughput(queueName);
      
      result[queueName] = {
        ...metrics,
        activeJobs: queueStats.active,
        avgProcessingTime: Math.round(avgProcessingTime),
        throughput,
      };
    }
    
    return result;
  }

  /**
   * バッチサイズを動的に調整
   */
  async optimizeBatchSize(queueName: string): Promise<void> {
    const config = this.queueConfigs[queueName];
    if (!config) return;

    const metrics = await this.getPerformanceMetrics();
    const queueMetrics = metrics[queueName];
    
    if (!queueMetrics) return;

    // 平均処理時間に基づいてバッチサイズを調整
    if (queueMetrics.avgProcessingTime > 5000) { // 5秒以上
      config.batchSize = Math.max(10, Math.floor(config.batchSize * 0.8));
      console.log(`📉 ${queueName}: バッチサイズを${config.batchSize}に減少`);
    } else if (queueMetrics.avgProcessingTime < 1000 && queueMetrics.failedJobs === 0) { // 1秒未満かつエラーなし
      config.batchSize = Math.min(200, Math.floor(config.batchSize * 1.2));
      console.log(`📈 ${queueName}: バッチサイズを${config.batchSize}に増加`);
    }
  }

  /**
   * キューを一時停止
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
    console.log(`⏸️ キュー一時停止: ${queueName}`);
  }

  /**
   * キューを再開
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
    console.log(`▶️ キュー再開: ${queueName}`);
  }

  /**
   * 失敗したジョブを再実行
   */
  async retryFailedJobs(queueName: string, limit: number = 10): Promise<number> {
    const queue = this.getQueue(queueName);
    const failedJobs = await queue.getFailed(0, limit - 1);
    
    let retriedCount = 0;
    for (const job of failedJobs) {
      try {
        await job.retry();
        retriedCount++;
      } catch (error) {
        console.error(`ジョブ再試行失敗: ${job.id}`, error);
      }
    }
    
    return retriedCount;
  }

  /**
   * イベントハンドラーの設定
   */
  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      console.log('✅ キューRedis接続が確立されました');
    });

    this.redis.on('error', (error) => {
      console.error('❌ キューRedis接続エラー:', error);
    });
  }

  /**
   * キューイベントハンドラーの設定
   */
  private setupQueueEventHandlers(queue: Queue.Queue, queueName: string): void {
    queue.on('completed', (job, result) => {
      console.log(`✅ ジョブ完了: ${queueName}:${job.name} (${job.id})`);
    });

    queue.on('failed', (job, error) => {
      console.error(`❌ ジョブ失敗: ${queueName}:${job.name} (${job.id})`, error.message);
    });

    queue.on('stalled', (job) => {
      console.warn(`⚠️ ジョブ停滞: ${queueName}:${job.name} (${job.id})`);
    });

    queue.on('progress', (job, progress) => {
      console.log(`📊 ジョブ進捗: ${queueName}:${job.name} (${job.id}) - ${progress}%`);
    });
  }

  /**
   * 処理時間を記録
   */
  private recordProcessingTime(queueName: string, processingTime: number): void {
    const times = this.processingTimes.get(queueName) || [];
    times.push(processingTime);
    
    // 最新100件のみ保持
    if (times.length > 100) {
      times.shift();
    }
    
    this.processingTimes.set(queueName, times);
  }

  /**
   * バッチジョブを取得
   */
  private async getBatchJobs(queue: Queue.Queue, batchSize: number): Promise<Job[]> {
    const waitingJobs = await queue.getWaiting(0, batchSize - 1);
    return waitingJobs;
  }

  /**
   * スループットを計算
   */
  private calculateThroughput(queueName: string): number {
    const metrics = this.metrics.get(queueName);
    if (!metrics) return 0;

    // 簡単な実装：過去の完了数を時間で割る
    // 実際の実装では、時系列データを使用してより正確に計算
    return Math.round(metrics.completedJobs / 10); // 仮の計算
  }

  /**
   * 全キューをクローズ
   */
  async closeAll(): Promise<void> {
    console.log('🔄 全キューを閉じています...');
    
    for (const [queueName, queue] of this.queues.entries()) {
      try {
        await queue.close();
        console.log(`✅ キュー閉鎖完了: ${queueName}`);
      } catch (error) {
        console.error(`❌ キュー閉鎖エラー: ${queueName}`, error);
      }
    }
    
    await this.redis.quit();
    console.log('✅ 全キュー閉鎖完了');
  }
}

// シングルトンインスタンス
let queueManagerInstance: OptimizedQueueManager | null = null;

/**
 * 最適化されたキューマネージャのシングルトンインスタンスを取得
 */
export function getQueueManager(): OptimizedQueueManager {
  if (!queueManagerInstance) {
    queueManagerInstance = new OptimizedQueueManager();
  }
  return queueManagerInstance;
}

export { OptimizedQueueManager };
export type { QueueConfig, JobMetrics };
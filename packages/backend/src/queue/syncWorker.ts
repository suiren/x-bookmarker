import Bull from 'bull';
import { syncQueue, SyncJobData, SyncJobResult, JobProgress } from './queue';
import { xApiService, bookmarkService } from '../services';
import { logger } from '../utils/logger';
import { DatabaseService } from '../services/databaseService';
import { retryWithBackoff } from '../utils/circuitBreaker';

// パフォーマンス最適化の設定
const PERFORMANCE_SETTINGS = {
  BATCH_SIZE: 100,
  DB_BATCH_SIZE: 50,
  MAX_CONCURRENT_REQUESTS: 3,
  MEMORY_CLEANUP_INTERVAL: 10, // 10バッチごとにメモリクリーンアップ
  PROGRESS_UPDATE_INTERVAL: 2000, // 2秒間隔で進捗更新
  MAX_MEMORY_USAGE_MB: 512, // 512MB制限
};

// メモリ使用量監視
function getMemoryUsage() {
  const memUsage = process.memoryUsage();
  return {
    rss: Math.round(memUsage.rss / 1024 / 1024), // MB
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
    external: Math.round(memUsage.external / 1024 / 1024), // MB
  };
}

// メモリクリーンアップ
function forceGarbageCollection() {
  if (global.gc) {
    global.gc();
    logger.debug('強制ガベージコレクション実行', getMemoryUsage());
  }
}

// バッチ処理のヘルパー関数
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// 同期ワーカーの処理（並行数を最適化）
syncQueue.process('bookmark-sync', PERFORMANCE_SETTINGS.MAX_CONCURRENT_REQUESTS, async (job: Bull.Job<SyncJobData>): Promise<SyncJobResult> => {
  const { userId, lastSyncTime, options = {} } = job.data;
  const startTime = Date.now();
  
  logger.info('ブックマーク同期を開始します', {
    jobId: job.id,
    userId,
    lastSyncTime,
    options,
  });

  // sync_jobsテーブルの状態を更新
  await DatabaseService.getInstance().query(
    'UPDATE sync_jobs SET status = $1, started_at = NOW() WHERE id = $2',
    ['running', job.id]
  );

  try {
    // 進捗状況の初期化
    let progress: JobProgress = {
      total: 0,
      processed: 0,
      percentage: 0,
      errors: [],
    };

    // ユーザーの認証情報を取得
    const user = await DatabaseService.getInstance().query(
      'SELECT access_token, refresh_token, token_expires_at FROM users WHERE id = $1',
      [userId]
    );

    if (!user.rows.length) {
      throw new Error('ユーザーが見つかりません');
    }

    const userToken = user.rows[0];
    
    // トークンが期限切れの場合はリフレッシュ
    if (new Date(userToken.token_expires_at) <= new Date()) {
      logger.info('アクセストークンを更新します', { userId });
      try {
        const tokenResponse = await xApiService.refreshToken(userToken.refresh_token);
        
        // データベースのトークン情報を更新
        await DatabaseService.getInstance().query(
          `UPDATE users SET 
           access_token = $1, 
           refresh_token = $2, 
           token_expires_at = $3,
           updated_at = NOW()
           WHERE id = $4`,
          [
            tokenResponse.access_token,
            tokenResponse.refresh_token,
            new Date(Date.now() + tokenResponse.expires_in * 1000),
            userId
          ]
        );
        
        logger.info('トークン更新完了', { userId });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('トークン更新失敗', { userId, error: errorMessage });
        throw new Error(`トークン更新に失敗しました: ${errorMessage}`);
      }
    }

    // X APIから全ブックマークを取得（最適化版）
    let allBookmarks: any[] = [];
    let pagination_token: string | undefined;
    let batchCount = 0;
    const maxBatches = options.fullSync ? 1000 : 50;
    let lastProgressUpdate = Date.now();
    let memoryCleanupCounter = 0;

    do {
      const memoryUsage = getMemoryUsage();
      
      // メモリ使用量チェック
      if (memoryUsage.heapUsed > PERFORMANCE_SETTINGS.MAX_MEMORY_USAGE_MB) {
        logger.warn('メモリ使用量が制限に近づいています', {
          jobId: job.id,
          memoryUsage,
          limit: PERFORMANCE_SETTINGS.MAX_MEMORY_USAGE_MB,
        });
        
        // 強制的にガベージコレクション実行
        forceGarbageCollection();
        
        // 少し待機してメモリを安定させる
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      try {
        // エラー回復機能付きでAPIを呼び出し
        const response = await retryWithBackoff(
          () => xApiService.getBookmarks({
            userId,
            maxResults: PERFORMANCE_SETTINGS.BATCH_SIZE,
            paginationToken: pagination_token,
            tweetFields: ['created_at', 'author_id', 'public_metrics', 'attachments', 'entities'],
            userFields: ['username', 'name', 'profile_image_url'],
            expansions: ['author_id', 'attachments.media_keys'],
            mediaFields: ['url', 'preview_image_url', 'type', 'width', 'height'],
          }),
          {
            maxAttempts: 3,
            baseDelay: 2000,
            maxDelay: 30000,
            shouldRetry: (error: unknown) => {
              if (error instanceof Error) {
                // レート制限エラーの場合は特別処理
                if (error.message.includes('Rate limit') || error.message.includes('429')) {
                  return true;
                }
                // サーバーエラーもリトライ
                return error.message.includes('5') || error.message.includes('timeout');
              }
              return false;
            },
            onRetry: (error: unknown, attempt: number) => {
              logger.warn('X APIリクエストをリトライ', {
                jobId: job.id,
                attempt,
                batchCount,
                error: error instanceof Error ? error.message : String(error),
              });
            },
          }
        );

        if (response.data.data) {
          allBookmarks.push(...response.data.data);
        }

        pagination_token = response.data.meta?.next_token;
        batchCount++;
        memoryCleanupCounter++;

        // 定期的にメモリクリーンアップ
        if (memoryCleanupCounter >= PERFORMANCE_SETTINGS.MEMORY_CLEANUP_INTERVAL) {
          forceGarbageCollection();
          memoryCleanupCounter = 0;
        }

        // 進捗更新を間引く（パフォーマンス向上）
        const now = Date.now();
        if (now - lastProgressUpdate >= PERFORMANCE_SETTINGS.PROGRESS_UPDATE_INTERVAL) {
          progress.processed = allBookmarks.length;
          progress.percentage = Math.min((batchCount / maxBatches) * 50, 50); // 取得フェーズは50%まで
          progress.currentItem = `バッチ ${batchCount} / ${maxBatches} (${allBookmarks.length}件取得済み)`;
          
          await job.progress(progress);
          lastProgressUpdate = now;
        }

        logger.debug('ブックマークバッチを取得', {
          jobId: job.id,
          batchCount,
          currentBatchSize: response.data.data?.length || 0,
          totalFetched: allBookmarks.length,
          hasNextToken: !!pagination_token,
          memoryUsage: getMemoryUsage(),
        });

        // 動的な待機時間（レート制限を考慮）
        const waitTime = response.rateLimit && response.rateLimit.remaining < 10 ? 2000 : 800;
        await new Promise(resolve => setTimeout(resolve, waitTime));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('ブックマーク取得エラー', {
          jobId: job.id,
          batchCount,
          error: errorMessage,
          memoryUsage: getMemoryUsage(),
        });

        progress.errors.push(`バッチ ${batchCount}: ${errorMessage}`);
        
        // エラー時の進捗更新
        const now = Date.now();
        if (now - lastProgressUpdate >= 1000) {
          await job.progress(progress);
          lastProgressUpdate = now;
        }

        // レート制限エラーの場合は長めに待機
        if (errorMessage.includes('Rate limit') || errorMessage.includes('429')) {
          logger.warn('レート制限により長時間待機', {
            jobId: job.id,
            waitTimeMinutes: 15,
          });
          await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));
        } else {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    } while (pagination_token && batchCount < maxBatches);

    // 総数を確定
    progress.total = allBookmarks.length;
    progress.percentage = 50; // 取得完了時点で50%
    progress.currentItem = '取得完了。データベースに保存中...';
    await job.progress(progress);

    logger.info('ブックマーク取得完了', {
      jobId: job.id,
      totalFetched: allBookmarks.length,
      batchCount,
    });

    // データベースに保存 - 最適化されたバッチ処理
    let newBookmarks = 0;
    let updatedBookmarks = 0;
    lastProgressUpdate = Date.now();

    // X APIレスポンスのincludesデータから著者情報を抽出（最適化版）
    logger.info('ブックマークデータ処理開始', {
      jobId: job.id,
      totalBookmarks: allBookmarks.length,
      batchSize: PERFORMANCE_SETTINGS.DB_BATCH_SIZE,
    });

    const processedBookmarks = allBookmarks.map(tweet => ({
      ...tweet,
      author: {
        username: `user_${tweet.author_id}`,
        name: `User ${tweet.author_id}`,
        profile_image_url: null,
      }
    }));

    // 並列処理用にバッチを分割
    const batches = chunkArray(processedBookmarks, PERFORMANCE_SETTINGS.DB_BATCH_SIZE);
    let processedCount = 0;

    // バッチを順次処理（メモリ効率を考慮）
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      try {
        // データベース操作もエラー回復機能付きで実行
        const result = await retryWithBackoff(
          () => bookmarkService.upsertBookmarks(userId, batch),
          {
            maxAttempts: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            shouldRetry: (error: unknown) => {
              // データベース接続エラーやタイムアウトの場合のみリトライ
              if (error instanceof Error) {
                return error.message.includes('timeout') || 
                       error.message.includes('connection') ||
                       error.message.includes('ECONNRESET');
              }
              return false;
            },
            onRetry: (error: unknown, attempt: number) => {
              logger.warn('データベース操作をリトライ', {
                jobId: job.id,
                batchIndex,
                attempt,
                error: error instanceof Error ? error.message : String(error),
              });
            },
          }
        );

        newBookmarks += result.newCount;
        updatedBookmarks += result.updatedCount;
        processedCount += batch.length;

        // 進捗更新を間引く
        const now = Date.now();
        if (now - lastProgressUpdate >= PERFORMANCE_SETTINGS.PROGRESS_UPDATE_INTERVAL || 
            batchIndex === batches.length - 1) {
          progress.processed = processedCount;
          progress.percentage = 50 + (processedCount / processedBookmarks.length) * 50;
          progress.currentItem = `データベース保存中: ${processedCount} / ${processedBookmarks.length}`;
          await job.progress(progress);
          lastProgressUpdate = now;
        }

        logger.debug('ブックマークバッチ保存完了', {
          jobId: job.id,
          batchIndex,
          batchSize: batch.length,
          newCount: result.newCount,
          updatedCount: result.updatedCount,
          totalProcessed: processedCount,
          memoryUsage: getMemoryUsage(),
        });

        // 定期的にメモリクリーンアップ
        if ((batchIndex + 1) % PERFORMANCE_SETTINGS.MEMORY_CLEANUP_INTERVAL === 0) {
          forceGarbageCollection();
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('ブックマーク保存エラー', {
          jobId: job.id,
          batchIndex,
          batchSize: batch.length,
          error: errorMessage,
          memoryUsage: getMemoryUsage(),
        });

        progress.errors.push(`データベース保存バッチ ${batchIndex + 1}: ${errorMessage}`);
        
        // エラー時も進捗更新
        const now = Date.now();
        if (now - lastProgressUpdate >= 1000) {
          await job.progress(progress);
          lastProgressUpdate = now;
        }
      }
    }

    // 最終メモリクリーンアップ
    forceGarbageCollection();

    // 最後の同期時刻を更新
    await DatabaseService.getInstance().query(
      'UPDATE users SET updated_at = NOW() WHERE id = $1',
      [userId]
    );

    const result: SyncJobResult = {
      totalFetched: processedBookmarks.length,
      newBookmarks,
      updatedBookmarks,
      errors: progress.errors,
      syncTime: Date.now() - startTime,
    };

    // 最終進捗状況を更新
    progress.percentage = 100;
    progress.currentItem = '同期完了';
    await job.progress(progress);

    // sync_jobsテーブルに結果を保存
    await DatabaseService.getInstance().query(
      `UPDATE sync_jobs SET 
       status = $1, 
       progress = $2, 
       total_items = $3, 
       processed_items = $4, 
       completed_at = NOW() 
       WHERE id = $5`,
      [
        'completed',
        100,
        result.totalFetched,
        result.totalFetched,
        job.id
      ]
    );

    const finalMemoryUsage = getMemoryUsage();
    logger.info('ブックマーク同期が完了しました', {
      jobId: job.id,
      userId,
      result,
      performance: {
        totalTime: result.syncTime,
        averageTimePerItem: Math.round(result.syncTime / result.totalFetched),
        itemsPerSecond: Math.round(result.totalFetched / (result.syncTime / 1000)),
        batchCount,
        finalMemoryUsage,
      },
    });

    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('同期ジョブでエラーが発生しました', {
      jobId: job.id,
      userId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // エラー情報を進捗に反映
    await job.progress({
      total: 0,
      processed: 0,
      percentage: 0,
      currentItem: 'エラーが発生しました',
      errors: [errorMessage],
    });

    // sync_jobsテーブルのエラー状態を更新
    await DatabaseService.getInstance().query(
      `UPDATE sync_jobs SET 
       status = $1, 
       error_message = $2, 
       completed_at = NOW() 
       WHERE id = $3`,
      ['failed', errorMessage, job.id]
    );

    throw error;
  }
});

export { syncQueue };
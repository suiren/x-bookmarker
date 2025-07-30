/**
 * 高度なトランザクション管理ユーティリティ
 * 
 * 💡 このファイルでは、より複雑なトランザクション操作をサポートします：
 * - セーブポイント（部分ロールバック）
 * - 分散トランザクション
 * - パフォーマンス監視
 */

import { PoolClient } from 'pg';
import { getPool, withTransaction } from './connection';

/**
 * セーブポイント付きトランザクション
 * 
 * 💡 セーブポイントとは:
 * トランザクション内で部分的なロールバックポイントを作成する機能
 * 大きなトランザクション内で、一部の操作だけを取り消したい場合に使用
 * 
 * @param callback - 実行する処理
 * @returns 処理結果
 */
export async function withSavepoint<T>(
  callback: (client: PoolClient, savepoint: (name: string) => Promise<void>, rollbackTo: (name: string) => Promise<void>) => Promise<T>
): Promise<T> {
  return withTransaction(async (client) => {
    const savepoints = new Set<string>();
    
    const createSavepoint = async (name: string): Promise<void> => {
      if (savepoints.has(name)) {
        throw new Error(`セーブポイント '${name}' は既に存在します`);
      }
      
      await client.query(`SAVEPOINT ${name}`);
      savepoints.add(name);
      console.log(`🔖 セーブポイント作成: ${name}`);
    };
    
    const rollbackToSavepoint = async (name: string): Promise<void> => {
      if (!savepoints.has(name)) {
        throw new Error(`セーブポイント '${name}' が見つかりません`);
      }
      
      await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
      console.log(`🔄 セーブポイントへロールバック: ${name}`);
    };
    
    return callback(client, createSavepoint, rollbackToSavepoint);
  });
}

/**
 * バッチ処理用トランザクション
 * 
 * 💡 大量のデータを効率的に処理するための機能
 * - バッチサイズによる分割
 * - 進捗報告
 * - エラー時の部分コミット対応
 * 
 * @param items - 処理対象のアイテム配列
 * @param processor - 各アイテムの処理関数
 * @param batchSize - バッチサイズ（デフォルト: 100）
 * @param onProgress - 進捗コールバック
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T, client: PoolClient) => Promise<R>,
  options: {
    batchSize?: number;
    onProgress?: (processed: number, total: number) => void;
    continueOnError?: boolean;
  } = {}
): Promise<{ results: R[]; errors: Error[] }> {
  const { batchSize = 100, onProgress, continueOnError = false } = options;
  const results: R[] = [];
  const errors: Error[] = [];
  
  console.log(`🚀 バッチ処理開始: ${items.length}件をサイズ${batchSize}で処理`);
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(items.length / batchSize);
    
    console.log(`📦 バッチ ${batchNumber}/${totalBatches} 処理中...`);
    
    try {
      await withTransaction(async (client) => {
        for (const item of batch) {
          try {
            const result = await processor(item, client);
            results.push(result);
          } catch (error) {
            if (continueOnError) {
              errors.push(error as Error);
              console.warn(`⚠️ アイテム処理エラー (継続):`, error);
            } else {
              throw error;
            }
          }
        }
      });
      
      console.log(`✅ バッチ ${batchNumber} 完了`);
    } catch (error) {
      console.error(`❌ バッチ ${batchNumber} 失敗:`, error);
      if (!continueOnError) {
        throw error;
      }
      errors.push(error as Error);
    }
    
    if (onProgress) {
      onProgress(Math.min(i + batchSize, items.length), items.length);
    }
  }
  
  console.log(`🎉 バッチ処理完了: ${results.length}件成功, ${errors.length}件エラー`);
  return { results, errors };
}

/**
 * デッドロック対応リトライ機能付きトランザクション
 * 
 * 💡 デッドロックとは:
 * 複数のトランザクションが互いのリソースを待ち合う状態
 * PostgreSQLは自動検出してエラーを発生させるため、リトライで対応
 * 
 * @param callback - 実行する処理
 * @param maxRetries - 最大リトライ回数
 * @param baseDelay - 基本遅延時間（ミリ秒）
 */
export async function withDeadlockRetry<T>(
  callback: (client: PoolClient) => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await withTransaction(callback);
    } catch (error) {
      lastError = error as Error;
      
      // デッドロックエラーの検出
      if (
        error instanceof Error &&
        error.message.includes('deadlock detected')
      ) {
        if (attempt <= maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // 指数バックオフ
          console.warn(`🔄 デッドロック検出。${delay}ms後にリトライ (${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // デッドロック以外のエラーまたは最大リトライ回数到達
      throw error;
    }
  }
  
  throw lastError!;
}

/**
 * トランザクション統計情報の取得
 * 
 * 💡 パフォーマンス監視用の情報を収集
 */
export async function getTransactionStats(): Promise<{
  activeTransactions: number;
  longestTransaction: string | null;
  blockedQueries: number;
}> {
  const pool = getPool();
  
  const [activeResult, longestResult, blockedResult] = await Promise.all([
    // アクティブなトランザクション数
    pool.query(`
      SELECT COUNT(*) as count 
      FROM pg_stat_activity 
      WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%'
    `),
    
    // 最も長時間実行中のトランザクション
    pool.query(`
      SELECT query_start, now() - query_start as duration, query
      FROM pg_stat_activity 
      WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%'
      ORDER BY query_start 
      LIMIT 1
    `),
    
    // ブロックされているクエリ数
    pool.query(`
      SELECT COUNT(*) as count
      FROM pg_stat_activity 
      WHERE wait_event_type = 'Lock'
    `)
  ]);
  
  return {
    activeTransactions: parseInt(activeResult.rows[0]?.count || '0'),
    longestTransaction: longestResult.rows[0]?.duration || null,
    blockedQueries: parseInt(blockedResult.rows[0]?.count || '0')
  };
}

/**
 * トランザクション ログ記録機能
 * 
 * 💡 デバッグとパフォーマンス分析用
 */
export class TransactionLogger {
  private static logs: Array<{
    id: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    success?: boolean;
    error?: string;
  }> = [];
  
  static startTransaction(id: string): void {
    this.logs.push({
      id,
      startTime: new Date()
    });
    console.log(`🚀 トランザクション開始: ${id}`);
  }
  
  static endTransaction(id: string, success: boolean, error?: Error): void {
    const log = this.logs.find(l => l.id === id && !l.endTime);
    if (log) {
      log.endTime = new Date();
      log.duration = log.endTime.getTime() - log.startTime.getTime();
      log.success = success;
      log.error = error?.message;
      
      const status = success ? '✅' : '❌';
      console.log(`${status} トランザクション終了: ${id} (${log.duration}ms)`);
    }
  }
  
  static getStats(): {
    total: number;
    successful: number;
    failed: number;
    averageDuration: number;
  } {
    const completed = this.logs.filter(l => l.endTime);
    const successful = completed.filter(l => l.success);
    const failed = completed.filter(l => !l.success);
    const avgDuration = completed.length > 0 
      ? completed.reduce((sum, l) => sum + (l.duration || 0), 0) / completed.length 
      : 0;
    
    return {
      total: completed.length,
      successful: successful.length,
      failed: failed.length,
      averageDuration: Math.round(avgDuration)
    };
  }
  
  static clearLogs(): void {
    this.logs = [];
    console.log('🧹 トランザクションログをクリアしました');
  }
}
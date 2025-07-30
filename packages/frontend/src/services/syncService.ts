/**
 * オンライン・オフライン同期サービス
 * @description データの同期とコンフリクト解決を管理
 */

import type { Bookmark, Category } from '@x-bookmarker/shared';
import { offlineService } from './offlineService';

export interface SyncResult {
  success: boolean;
  synced: number;
  conflicts: number;
  errors: string[];
}

export interface SyncStatus {
  isRunning: boolean;
  progress: number;
  currentOperation: string;
  error?: Error;
}

// 同期コンフリクト情報
export interface SyncConflict {
  id: string;
  type: 'bookmark' | 'category';
  localVersion: Bookmark | Category;
  remoteVersion: Bookmark | Category;
  conflictFields: string[];
}

// 同期操作の種類
export type SyncOperation = 'pull' | 'push' | 'bidirectional';

class SyncService {
  private syncInProgress = false;
  private syncQueue: Array<() => Promise<void>> = [];
  private statusCallbacks: Array<(status: SyncStatus) => void> = [];

  /**
   * 同期状態の監視コールバックを登録
   */
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusCallbacks.push(callback);
    
    // アンサブスクライブ関数を返す
    return () => {
      const index = this.statusCallbacks.indexOf(callback);
      if (index > -1) {
        this.statusCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 同期状態を通知
   */
  private notifyStatusChange(status: SyncStatus): void {
    this.statusCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Sync status callback error:', error);
      }
    });
  }

  /**
   * 同期をキューに追加
   */
  private async enqueueSyncOperation(operation: () => Promise<SyncResult>): Promise<SyncResult> {
    return new Promise((resolve, reject) => {
      this.syncQueue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processSyncQueue();
    });
  }

  /**
   * 同期キューを処理
   */
  private async processSyncQueue(): Promise<void> {
    if (this.syncInProgress || this.syncQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;
    this.notifyStatusChange({
      isRunning: true,
      progress: 0,
      currentOperation: 'Starting sync...'
    });

    try {
      while (this.syncQueue.length > 0) {
        const operation = this.syncQueue.shift()!;
        await operation();
      }

      this.notifyStatusChange({
        isRunning: false,
        progress: 100,
        currentOperation: 'Sync completed'
      });
    } catch (error) {
      console.error('Sync queue processing error:', error);
      this.notifyStatusChange({
        isRunning: false,
        progress: 0,
        currentOperation: 'Sync failed',
        error: error as Error
      });
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * オンラインからオフラインへデータをプル
   */
  async pullFromOnline(
    userId: string, 
    onlineBookmarks: Bookmark[], 
    onlineCategories: Category[]
  ): Promise<SyncResult> {
    return this.enqueueSyncOperation(async () => {
      this.notifyStatusChange({
        isRunning: true,
        progress: 10,
        currentOperation: 'Initializing offline storage...'
      });

      await offlineService.init();

      this.notifyStatusChange({
        isRunning: true,
        progress: 30,
        currentOperation: 'Syncing bookmarks...'
      });

      let syncedCount = 0;
      const errors: string[] = [];

      try {
        // ブックマークを同期
        if (onlineBookmarks.length > 0) {
          await offlineService.saveBookmarks(onlineBookmarks);
          syncedCount += onlineBookmarks.length;
        }

        this.notifyStatusChange({
          isRunning: true,
          progress: 70,
          currentOperation: 'Syncing categories...'
        });

        // カテゴリを同期
        if (onlineCategories.length > 0) {
          await offlineService.saveCategories(onlineCategories);
          syncedCount += onlineCategories.length;
        }

        this.notifyStatusChange({
          isRunning: true,
          progress: 90,
          currentOperation: 'Updating sync metadata...'
        });

        // 同期時刻を更新
        await offlineService.updateLastSyncTime(userId);

        console.log(`✅ Pull sync completed: ${syncedCount} items synced`);
        
        return {
          success: true,
          synced: syncedCount,
          conflicts: 0,
          errors
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(errorMessage);
        console.error('Pull sync failed:', error);
        
        throw error;
      }
    });
  }

  /**
   * オフラインからオンラインへデータをプッシュ
   * 注意: 実際のオンラインAPI呼び出しは実装時に追加
   */
  async pushToOnline(userId: string): Promise<SyncResult> {
    return this.enqueueSyncOperation(async () => {
      this.notifyStatusChange({
        isRunning: true,
        progress: 10,
        currentOperation: 'Getting offline changes...'
      });

      await offlineService.init();

      // オフラインでの変更を取得（実装では同期ステータスを使用）
      const offlineBookmarks = await offlineService.getBookmarks({ userId });
      const offlineCategories = await offlineService.getCategories(userId);

      let syncedCount = 0;
      const errors: string[] = [];

      try {
        this.notifyStatusChange({
          isRunning: true,
          progress: 50,
          currentOperation: 'Uploading changes to server...'
        });

        // 実際の実装では、ここでオンラインAPIに変更をプッシュ
        // 今は仮実装
        console.log('Pushing to online:', {
          bookmarks: offlineBookmarks.length,
          categories: offlineCategories.length
        });

        syncedCount = offlineBookmarks.length + offlineCategories.length;

        this.notifyStatusChange({
          isRunning: true,
          progress: 90,
          currentOperation: 'Updating sync status...'
        });

        await offlineService.updateLastSyncTime(userId);

        console.log(`✅ Push sync completed: ${syncedCount} items synced`);
        
        return {
          success: true,
          synced: syncedCount,
          conflicts: 0,
          errors
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(errorMessage);
        console.error('Push sync failed:', error);
        
        throw error;
      }
    });
  }

  /**
   * 同期の実行
   */
  async sync(
    operation: SyncOperation,
    userId: string,
    onlineBookmarks: Bookmark[] = [],
    onlineCategories: Category[] = []
  ): Promise<SyncResult> {
    switch (operation) {
      case 'pull':
        return this.pullFromOnline(userId, onlineBookmarks, onlineCategories);
      case 'push':
        return this.pushToOnline(userId);
      case 'bidirectional':
        return this.pullFromOnline(userId, onlineBookmarks, onlineCategories);
      default:
        throw new Error(`Unknown sync operation: ${operation}`);
    }
  }

  /**
   * 同期をキャンセル
   */
  cancelSync(): void {
    this.syncQueue.length = 0;
    
    if (this.syncInProgress) {
      this.notifyStatusChange({
        isRunning: false,
        progress: 0,
        currentOperation: 'Sync cancelled'
      });
    }
  }

  /**
   * 同期が進行中かチェック
   */
  isSyncInProgress(): boolean {
    return this.syncInProgress;
  }
}

// シングルトンインスタンス
export const syncService = new SyncService();
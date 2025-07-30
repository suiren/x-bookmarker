/**
 * オフライン同期管理hook
 */

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { offlineService } from '../services/offlineService';
import { useNetworkState } from './useNetworkState';
import { useAuth } from './useAuth';

interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingChanges: number;
  error: Error | null;
}

interface UseOfflineSyncReturn extends SyncStatus {
  syncNow: () => Promise<void>;
  clearOfflineData: () => Promise<void>;
  getOfflineStats: () => Promise<{
    totalBookmarks: number;
    totalCategories: number;
    lastSyncTime: Date | null;
  }>;
}

export function useOfflineSync(): UseOfflineSyncReturn {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline, isOffline } = useNetworkState();
  
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    pendingChanges: 0,
    error: null
  });

  // 自動同期の実行
  const performSync = useCallback(async (force = false): Promise<void> => {
    if (!user?.id || (!isOnline && !force)) {
      return;
    }

    setSyncStatus(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      await offlineService.init();

      console.log('🔄 Starting offline sync...');

      // 1. オンラインデータを取得して同期
      if (isOnline) {
        // ブックマークデータを同期
        try {
          await queryClient.invalidateQueries({ queryKey: ['bookmarks', user.id] });
          const bookmarksQuery = await queryClient.fetchQuery({
            queryKey: ['bookmarks', user.id],
            queryFn: async () => {
              const response = await fetch(`/api/bookmarks?userId=${user.id}`);
              if (!response.ok) throw new Error('Failed to fetch bookmarks');
              return response.json();
            }
          });

          if (bookmarksQuery?.bookmarks) {
            await offlineService.saveBookmarks(bookmarksQuery.bookmarks);
          }
        } catch (error) {
          console.warn('Failed to sync bookmarks:', error);
        }

        // カテゴリデータを同期
        try {
          await queryClient.invalidateQueries({ queryKey: ['categories', user.id] });
          const categoriesQuery = await queryClient.fetchQuery({
            queryKey: ['categories', user.id],
            queryFn: async () => {
              const response = await fetch(`/api/categories?userId=${user.id}`);
              if (!response.ok) throw new Error('Failed to fetch categories');
              return response.json();
            }
          });

          if (categoriesQuery?.categories) {
            await offlineService.saveCategories(categoriesQuery.categories);
          }
        } catch (error) {
          console.warn('Failed to sync categories:', error);
        }

        // 同期時刻を更新
        await offlineService.updateLastSyncTime(user.id);
      }

      // 2. 最終同期時刻を取得
      const metadata = await offlineService.getMetadata(`sync-${user.id}`);
      const lastSyncTime = metadata?.lastSyncTime ? new Date(metadata.lastSyncTime) : null;

      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncTime,
        pendingChanges: 0 // TODO: 実際の保留中変更数を計算
      }));

      console.log('✅ Offline sync completed successfully');
    } catch (error) {
      console.error('❌ Offline sync failed:', error);
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        error: error as Error
      }));
    }
  }, [user?.id, isOnline, queryClient]);

  // 手動同期
  const syncNow = useCallback(async (): Promise<void> => {
    await performSync(true);
  }, [performSync]);

  // オフラインデータをクリア
  const clearOfflineData = useCallback(async (): Promise<void> => {
    try {
      await offlineService.clearAllData();
      setSyncStatus(prev => ({
        ...prev,
        lastSyncTime: null,
        pendingChanges: 0,
        error: null
      }));
      console.log('✅ Offline data cleared');
    } catch (error) {
      console.error('❌ Failed to clear offline data:', error);
      setSyncStatus(prev => ({
        ...prev,
        error: error as Error
      }));
    }
  }, []);

  // オフライン統計を取得
  const getOfflineStats = useCallback(async () => {
    try {
      await offlineService.init();
      
      if (!user?.id) {
        return {
          totalBookmarks: 0,
          totalCategories: 0,
          lastSyncTime: null
        };
      }

      const [bookmarks, categories, metadata] = await Promise.all([
        offlineService.getBookmarks({ userId: user.id }),
        offlineService.getCategories(user.id),
        offlineService.getMetadata(`sync-${user.id}`)
      ]);

      return {
        totalBookmarks: bookmarks.length,
        totalCategories: categories.length,
        lastSyncTime: metadata?.lastSyncTime ? new Date(metadata.lastSyncTime) : null
      };
    } catch (error) {
      console.error('Failed to get offline stats:', error);
      return {
        totalBookmarks: 0,
        totalCategories: 0,
        lastSyncTime: null
      };
    }
  }, [user?.id]);

  // ネットワーク状態変化時の自動同期
  useEffect(() => {
    if (isOnline && user?.id) {
      // オンライン復帰時は少し遅延させて同期
      const timeoutId = setTimeout(() => {
        performSync();
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [isOnline, user?.id, performSync]);

  // 初期化時にlastSyncTimeを取得
  useEffect(() => {
    const initializeSyncStatus = async () => {
      if (!user?.id) return;

      try {
        await offlineService.init();
        const metadata = await offlineService.getMetadata(`sync-${user.id}`);
        const lastSyncTime = metadata?.lastSyncTime ? new Date(metadata.lastSyncTime) : null;

        setSyncStatus(prev => ({
          ...prev,
          lastSyncTime
        }));
      } catch (error) {
        console.error('Failed to initialize sync status:', error);
      }
    };

    initializeSyncStatus();
  }, [user?.id]);

  // 定期的な自動同期（5分間隔）
  useEffect(() => {
    if (!isOnline || !user?.id) return;

    const intervalId = setInterval(() => {
      performSync();
    }, 5 * 60 * 1000); // 5分

    return () => clearInterval(intervalId);
  }, [isOnline, user?.id, performSync]);

  return {
    ...syncStatus,
    syncNow,
    clearOfflineData,
    getOfflineStats
  };
}

/**
 * オフライン同期状態表示用のhook
 */
export function useOfflineSyncStatus() {
  const { isSyncing, lastSyncTime, error } = useOfflineSync();
  const { isOffline } = useNetworkState();

  const getSyncStatusText = useCallback((): string => {
    if (isOffline) {
      return 'オフライン';
    }

    if (isSyncing) {
      return '同期中...';
    }

    if (error) {
      return '同期エラー';
    }

    if (lastSyncTime) {
      const now = new Date();
      const diffMs = now.getTime() - lastSyncTime.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);

      if (diffMinutes < 1) {
        return '今同期済み';
      } else if (diffMinutes < 60) {
        return `${diffMinutes}分前に同期`;
      } else {
        const diffHours = Math.floor(diffMinutes / 60);
        return `${diffHours}時間前に同期`;
      }
    }

    return '未同期';
  }, [isOffline, isSyncing, error, lastSyncTime]);

  const getSyncStatusColor = useCallback((): string => {
    if (isOffline) {
      return 'text-orange-600 dark:text-orange-400';
    }

    if (isSyncing) {
      return 'text-blue-600 dark:text-blue-400';
    }

    if (error) {
      return 'text-red-600 dark:text-red-400';
    }

    return 'text-green-600 dark:text-green-400';
  }, [isOffline, isSyncing, error]);

  return {
    statusText: getSyncStatusText(),
    statusColor: getSyncStatusColor(),
    isSyncing,
    hasError: !!error,
    isOffline
  };
}
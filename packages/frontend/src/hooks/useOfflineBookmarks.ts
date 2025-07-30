/**
 * オフライン ブックマーク管理Hook
 * @description オフライン時のブックマーク操作を管理
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bookmark, Category } from '@x-bookmarker/shared';
import { offlineService } from '../services/offlineService';
import { useNetworkStatus } from './useNetworkStatus';
import { useAuthStore } from '../stores/authStore';

export interface OfflineBookmarkOptions {
  categoryId?: string;
  isArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface OfflineSearchOptions {
  query: string;
  categoryIds?: string[];
  tags?: string[];
  authors?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  sortBy?: 'relevance' | 'date' | 'author';
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export function useOfflineBookmarks(options: OfflineBookmarkOptions = {}) {
  const { user } = useAuthStore();
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();

  // オフライン初期化
  useEffect(() => {
    offlineService.init().catch(console.error);
  }, []);

  // オフラインブックマーク取得
  const {
    data: bookmarks = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['offline-bookmarks', user?.id, options],
    queryFn: async () => {
      if (!user?.id) return [];
      
      await offlineService.init();
      return offlineService.getBookmarks({
        userId: user.id,
        ...options
      });
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5分
    cacheTime: 1000 * 60 * 30, // 30分
  });

  // オンライン復帰時にオンラインデータと同期
  useEffect(() => {
    if (isOnline && user?.id) {
      // オンラインAPIからデータを取得してオフラインストレージを更新
      const syncWithOnline = async () => {
        try {
          // オンラインAPIからブックマークを取得（実際のAPIエンドポイントに置き換え）
          const onlineBookmarks = queryClient.getQueryData<Bookmark[]>(['bookmarks', user.id]);
          if (onlineBookmarks) {
            await offlineService.saveBookmarks(onlineBookmarks);
            refetch(); // オフラインクエリを更新
          }
        } catch (error) {
          console.warn('Failed to sync offline bookmarks:', error);
        }
      };

      syncWithOnline();
    }
  }, [isOnline, user?.id, queryClient, refetch]);

  return {
    bookmarks,
    isLoading,
    error,
    refetch,
    isOffline: !isOnline
  };
}

export function useOfflineCategories() {
  const { user } = useAuthStore();
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();

  // オフライン初期化
  useEffect(() => {
    offlineService.init().catch(console.error);
  }, []);

  // オフラインカテゴリ取得
  const {
    data: categories = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['offline-categories', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      await offlineService.init();
      return offlineService.getCategories(user.id);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 10, // 10分
    cacheTime: 1000 * 60 * 60, // 1時間
  });

  // オンライン復帰時にオンラインデータと同期
  useEffect(() => {
    if (isOnline && user?.id) {
      const syncWithOnline = async () => {
        try {
          const onlineCategories = queryClient.getQueryData<Category[]>(['categories', user.id]);
          if (onlineCategories) {
            await offlineService.saveCategories(onlineCategories);
            refetch();
          }
        } catch (error) {
          console.warn('Failed to sync offline categories:', error);
        }
      };

      syncWithOnline();
    }
  }, [isOnline, user?.id, queryClient, refetch]);

  return {
    categories,
    isLoading,
    error,
    refetch,
    isOffline: !isOnline
  };
}

export function useOfflineSearch() {
  const { user } = useAuthStore();
  const [searchResults, setSearchResults] = useState<Bookmark[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<Error | null>(null);

  // オフライン初期化
  useEffect(() => {
    offlineService.init().catch(console.error);
  }, []);

  const searchBookmarks = useCallback(async (options: OfflineSearchOptions) => {
    if (!user?.id) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      await offlineService.init();
      
      const results = await offlineService.searchBookmarksAdvanced({
        userId: user.id,
        query: options.query,
        filters: {
          categoryIds: options.categoryIds,
          tags: options.tags,
          authors: options.authors,
          dateRange: options.dateRange
        },
        sortBy: options.sortBy || 'relevance',
        sortDirection: options.sortDirection || 'desc',
        limit: options.limit,
        offset: options.offset
      });

      setSearchResults(results);
    } catch (error) {
      console.error('Offline search failed:', error);
      setSearchError(error as Error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [user?.id]);

  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setSearchError(null);
  }, []);

  return {
    searchResults,
    isSearching,
    searchError,
    searchBookmarks,
    clearSearch
  };
}

export function useOfflineSync() {
  const { user } = useAuthStore();
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // 最後の同期時刻を取得
  useEffect(() => {
    const getLastSyncTime = async () => {
      if (user?.id) {
        try {
          await offlineService.init();
          const metadata = await offlineService.getMetadata(`sync-${user.id}`);
          if (metadata?.lastSyncTime) {
            setLastSyncTime(new Date(metadata.lastSyncTime));
          }
        } catch (error) {
          console.warn('Failed to get last sync time:', error);
        }
      }
    };

    getLastSyncTime();
  }, [user?.id]);

  const syncToOffline = useCallback(async () => {
    if (!user?.id || !isOnline) return;

    setIsSyncing(true);
    setSyncError(null);

    try {
      await offlineService.init();

      // オンラインAPIからデータを取得
      const [bookmarksData, categoriesData] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: ['bookmarks', user.id],
          queryFn: async () => {
            // 実際のAPIエンドポイントを呼び出し
            // ここでは仮のデータを返す（実装時に実際のAPI呼び出しに置き換え）
            return queryClient.getQueryData<Bookmark[]>(['bookmarks', user.id]) || [];
          }
        }),
        queryClient.fetchQuery({
          queryKey: ['categories', user.id], 
          queryFn: async () => {
            return queryClient.getQueryData<Category[]>(['categories', user.id]) || [];
          }
        })
      ]);

      // オフラインストレージに保存
      if (bookmarksData.length > 0) {
        await offlineService.saveBookmarks(bookmarksData);
      }
      
      if (categoriesData.length > 0) {
        await offlineService.saveCategories(categoriesData);
      }

      // 同期時刻を更新
      await offlineService.updateLastSyncTime(user.id);
      setLastSyncTime(new Date());

      console.log('✅ Offline sync completed successfully');
    } catch (error) {
      console.error('Offline sync failed:', error);
      setSyncError(error as Error);
    } finally {
      setIsSyncing(false);
    }
  }, [user?.id, isOnline, queryClient]);

  const clearOfflineData = useCallback(async () => {
    try {
      await offlineService.init();
      await offlineService.clearAllData();
      setLastSyncTime(null);
      console.log('✅ Offline data cleared');
    } catch (error) {
      console.error('Failed to clear offline data:', error);
      setSyncError(error as Error);
    }
  }, []);

  // オンライン復帰時に自動同期（デバウンス付き）
  useEffect(() => {
    if (isOnline && user?.id) {
      const timeoutId = setTimeout(() => {
        syncToOffline();
      }, 2000); // 2秒後に同期

      return () => clearTimeout(timeoutId);
    }
  }, [isOnline, user?.id, syncToOffline]);

  return {
    isSyncing,
    syncError,
    lastSyncTime,
    syncToOffline,
    clearOfflineData,
    canSync: isOnline && !!user?.id
  };
}
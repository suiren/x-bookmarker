/**
 * オフライン対応React Query設定
 */

import { QueryClient, QueryFunction, QueryKey } from '@tanstack/react-query';
import { Bookmark, Category } from '@x-bookmarker/shared';
import { offlineService } from '../services/offlineService';

// オフライン対応のクエリオプション
export interface OfflineQueryOptions {
  enableOfflineFallback?: boolean;
  syncOnReconnect?: boolean;
  offlineCacheDuration?: number;
}

/**
 * オフライン対応QueryClientを作成
 */
export function createOfflineQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // オフライン時のリトライを無効化
        retry: (failureCount, error: any) => {
          // ネットワークエラーの場合はリトライしない
          if (error?.code === 'NETWORK_ERROR' || !navigator.onLine) {
            return false;
          }
          return failureCount < 3;
        },
        
        // オフライン時のrefetchを制御
        refetchOnWindowFocus: () => navigator.onLine,
        refetchOnReconnect: true,
        
        // キャッシュ時間を延長
        staleTime: 5 * 60 * 1000, // 5分
        gcTime: 24 * 60 * 60 * 1000, // 24時間 (旧cacheTime)
        
        // オフライン時のフォールバック関数
        queryFn: async (context) => {
          const { queryKey, signal } = context;
          
          try {
            // オンライン時は通常のフェッチを試行
            if (navigator.onLine) {
              return await defaultQueryFunction(context);
            }
          } catch (error) {
            console.warn('Online query failed, falling back to offline data:', error);
          }
          
          // オフライン時またはオンラインフェッチ失敗時はオフラインデータを使用
          return await getOfflineData(queryKey);
        }
      },
      
      mutations: {
        // オフライン時のmutationはキューに保存
        retry: (failureCount, error: any) => {
          if (!navigator.onLine) {
            // オフライン時はmutationをキューに保存
            return false;
          }
          return failureCount < 3;
        }
      }
    }
  });
}

/**
 * デフォルトのクエリ関数（実際のAPI呼び出し）
 */
async function defaultQueryFunction({ queryKey, signal }: { queryKey: QueryKey; signal?: AbortSignal }): Promise<any> {
  const [resource, ...params] = queryKey as string[];
  
  // 実際のAPI呼び出しロジックをここに実装
  // 現在は既存のAPIクライアントを使用すると仮定
  const response = await fetch(`/api/${resource}${params.length ? '/' + params.join('/') : ''}`, {
    signal,
    headers: {
      'Content-Type': 'application/json',
      // 認証ヘッダーなどを追加
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}

/**
 * オフラインデータを取得
 */
async function getOfflineData(queryKey: QueryKey): Promise<any> {
  const [resource, ...params] = queryKey as string[];
  
  try {
    await offlineService.init();
    
    switch (resource) {
      case 'bookmarks':
        return await getOfflineBookmarks(params);
      
      case 'categories':
        return await getOfflineCategories(params);
      
      case 'search':
        return await getOfflineSearchResults(params);
      
      default:
        throw new Error(`Offline fallback not implemented for resource: ${resource}`);
    }
  } catch (error) {
    console.error('Failed to get offline data:', error);
    throw new Error('No offline data available');
  }
}

/**
 * オフラインブックマークデータを取得
 */
async function getOfflineBookmarks(params: string[]): Promise<{ bookmarks: Bookmark[]; total: number }> {
  const [userId, categoryId] = params;
  
  if (!userId) {
    throw new Error('User ID is required for offline bookmarks');
  }
  
  const bookmarks = await offlineService.getBookmarks({
    userId,
    categoryId: categoryId || undefined,
    isArchived: false,
    limit: 50
  });
  
  return {
    bookmarks,
    total: bookmarks.length
  };
}

/**
 * オフラインカテゴリデータを取得
 */
async function getOfflineCategories(params: string[]): Promise<{ categories: Category[] }> {
  const [userId] = params;
  
  if (!userId) {
    throw new Error('User ID is required for offline categories');
  }
  
  const categories = await offlineService.getCategories(userId);
  
  return { categories };
}

/**
 * オフライン検索結果を取得
 */
async function getOfflineSearchResults(params: string[]): Promise<{ bookmarks: Bookmark[]; total: number }> {
  const [userId, query, categoryId] = params;
  
  if (!userId || !query) {
    throw new Error('User ID and query are required for offline search');
  }
  
  const bookmarks = await offlineService.searchBookmarks({
    userId,
    query: decodeURIComponent(query),
    categoryId: categoryId || undefined,
    limit: 30
  });
  
  return {
    bookmarks,
    total: bookmarks.length
  };
}

/**
 * オンラインデータをオフラインストレージに同期
 */
export async function syncDataToOfflineStorage(queryClient: QueryClient, userId: string): Promise<void> {
  console.log('📦 Syncing online data to offline storage...');
  
  try {
    await offlineService.init();
    
    // ブックマークデータを同期
    const bookmarksData = queryClient.getQueryData(['bookmarks', userId]);
    if (bookmarksData && 'bookmarks' in bookmarksData) {
      await offlineService.saveBookmarks(bookmarksData.bookmarks as Bookmark[]);
    }
    
    // カテゴリデータを同期
    const categoriesData = queryClient.getQueryData(['categories', userId]);
    if (categoriesData && 'categories' in categoriesData) {
      await offlineService.saveCategories(categoriesData.categories as Category[]);
    }
    
    // 同期時刻を更新
    await offlineService.updateLastSyncTime(userId);
    
    console.log('✅ Data successfully synced to offline storage');
  } catch (error) {
    console.error('❌ Failed to sync data to offline storage:', error);
    throw error;
  }
}

/**
 * オフラインキューからmutationを実行
 */
export async function processOfflineQueue(queryClient: QueryClient): Promise<void> {
  // オフラインキューの実装は後で追加
  // 現在はスタブとして残す
  console.log('🔄 Processing offline mutation queue...');
}

/**
 * ネットワーク再接続時の処理
 */
export function setupReconnectHandlers(queryClient: QueryClient): void {
  const handleOnline = async () => {
    console.log('🌐 Network reconnected, invalidating queries...');
    
    // すべてのクエリを再フェッチ
    await queryClient.invalidateQueries();
    
    // オフラインキューを処理
    await processOfflineQueue(queryClient);
  };
  
  const handleOffline = () => {
    console.log('📴 Network disconnected, switching to offline mode...');
    
    // オフライン時の処理（必要に応じて）
  };
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // クリーンアップ関数を返す
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
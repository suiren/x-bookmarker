# オフライン機能アーキテクチャ

## 概要

X Bookmarkerのオフライン機能は、Progressive Web App (PWA) 技術を活用して、ネットワーク接続がない状況でもブックマークの閲覧・検索を可能にします。Service Worker、IndexedDB、そして高度なキャッシュ戦略により、ネイティブアプリのような滑らかなオフライン体験を提供します。

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────┐
│                  Offline Architecture                      │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ Service Worker  │ │ IndexedDB       │ │ Cache API       │ │
│ │ (Workbox)       │ │ (Local Storage) │ │ (Network Cache) │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ React Query     │ │ Network State   │ │ Sync Manager    │ │
│ │ (Offline Aware) │ │ Monitoring      │ │ (Background)    │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                    Data Layer                           │ │
│ │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐    │ │
│ │  │ Search      │ │ Bookmark    │ │ Metadata        │    │ │
│ │  │ Index       │ │ Storage     │ │ Management      │    │ │
│ │  └─────────────┘ └─────────────┘ └─────────────────┘    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 主要コンポーネント

### 1. Service Worker (Workbox統合)

**目的**: ネットワークリクエストの管理とキャッシュ制御

**実装場所**: Vite PWAプラグインによる自動生成 + カスタム設定

#### キャッシュ戦略

```typescript
// vite.config.ts での Workbox 設定
workbox: {
  globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
  runtimeCaching: [
    // API レスポンスキャッシュ (Network First)
    {
      urlPattern: /^https:\/\/api\.twitter\.com\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'twitter-api-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 // 24時間
        },
        cacheKeyWillBeUsed: async ({ request }) => {
          return `${request.url}`;
        }
      }
    },
    
    // 画像キャッシュ (Cache First)
    {
      urlPattern: /^https:\/\/pbs\.twimg\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'twitter-images-cache',
        expiration: {
          maxEntries: 500,
          maxAgeSeconds: 60 * 60 * 24 * 7 // 7日間
        }
      }
    },
    
    // ページキャッシュ (Network First)
    {
      urlPattern: ({ request }) => request.destination === 'document',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 // 24時間
        }
      }
    }
  ]
}
```

#### カスタム Service Worker ロジック

```typescript
// src/hooks/useServiceWorker.ts
export function useServiceWorker(): ServiceWorkerState & ServiceWorkerActions {
  const [state, setState] = useState<ServiceWorkerState>({
    isRegistered: false,
    isUpdateAvailable: false,
    isOfflineReady: false,
    registration: null,
    error: null
  });

  const [workbox, setWorkbox] = useState<Workbox | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setState(prev => ({
        ...prev,
        error: new Error('Service Worker is not supported in this browser')
      }));
      return;
    }

    const wb = new Workbox('/sw.js', { scope: '/' });
    setWorkbox(wb);

    // アップデート検出
    wb.addEventListener('installed', (event) => {
      if (event.isUpdate) {
        setState(prev => ({ ...prev, isUpdateAvailable: true }));
      } else {
        setState(prev => ({ ...prev, isOfflineReady: true }));
      }
    });

    // 制御権取得
    wb.addEventListener('controlling', (event) => {
      window.location.reload();
    });

    // 登録実行
    wb.register()
      .then((registration) => {
        setState(prev => ({
          ...prev,
          isRegistered: true,
          registration
        }));
      })
      .catch((error) => {
        setState(prev => ({ ...prev, error }));
      });
  }, []);

  return { ...state, skipWaiting, checkForUpdate, unregister };
}
```

### 2. IndexedDB オフラインストレージ

**目的**: ブラウザ内での構造化データ永続化

**実装場所**: `src/services/offlineService.ts`

#### データベース設計

```typescript
// IndexedDB スキーマ定義
const DB_NAME = 'x-bookmarker-offline';
const DB_VERSION = 1;

const STORES = {
  BOOKMARKS: 'bookmarks',      // ブックマーク本体データ
  CATEGORIES: 'categories',    // カテゴリ情報
  SEARCH_INDEX: 'searchIndex', // 検索インデックス
  METADATA: 'metadata'         // 同期メタデータ
} as const;

// ブックマークストア設計
interface BookmarkStore {
  keyPath: 'id';
  indexes: {
    userId: string;          // ユーザー別フィルタリング
    categoryId: string;      // カテゴリ別フィルタリング
    bookmarkedAt: Date;      // 日付ソート
    isArchived: boolean;     // アーカイブ状態フィルタ
  };
}

// 検索インデックスストア設計
interface SearchIndexStore {
  keyPath: 'id';
  indexes: {
    bookmarkId: string;      // ブックマーク逆引き
    text: string;           // テキスト検索
    weight: number;         // 重要度ソート
  };
}
```

#### 効率的なデータ操作

```typescript
export class OfflineService {
  // 高性能ブックマーク保存
  async saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.BOOKMARKS, STORES.SEARCH_INDEX], 'readwrite');
    const bookmarkStore = transaction.objectStore(STORES.BOOKMARKS);
    const searchStore = transaction.objectStore(STORES.SEARCH_INDEX);

    // バッチ処理で効率化
    const promises = bookmarks.map(async (bookmark) => {
      // ブックマーク保存
      await this.promisifyRequest(bookmarkStore.put(bookmark));
      
      // 検索インデックス構築
      await this.buildSearchIndexForBookmark(searchStore, bookmark);
    });

    await Promise.all(promises);
    await this.promisifyRequest(transaction);
  }

  // 最適化されたクエリ実行
  async getBookmarks(options: {
    userId: string;
    categoryId?: string;
    isArchived?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Bookmark[]> {
    const db = await this.getDB();
    const transaction = db.transaction(STORES.BOOKMARKS, 'readonly');
    const store = transaction.objectStore(STORES.BOOKMARKS);
    
    // 複合インデックスを活用
    const index = store.index('userId');
    const request = index.getAll(options.userId);
    const allBookmarks = await this.promisifyRequest<Bookmark[]>(request);

    // メモリ内フィルタリング（インデックス化されていない条件）
    let filteredBookmarks = allBookmarks;

    if (options.categoryId !== undefined) {
      filteredBookmarks = filteredBookmarks.filter(b => b.categoryId === options.categoryId);
    }

    if (options.isArchived !== undefined) {
      filteredBookmarks = filteredBookmarks.filter(b => b.isArchived === options.isArchived);
    }

    // 日付降順ソート
    filteredBookmarks.sort((a, b) => 
      new Date(b.bookmarkedAt).getTime() - new Date(a.bookmarkedAt).getTime()
    );

    // ページネーション
    if (options.limit || options.offset) {
      const start = options.offset || 0;
      const end = start + (options.limit || filteredBookmarks.length);
      filteredBookmarks = filteredBookmarks.slice(start, end);
    }

    return filteredBookmarks;
  }
}
```

### 3. 高度な検索インデックス

**目的**: オフライン環境での高速全文検索

#### 重み付きインデックス構築

```typescript
// ブックマーク用検索インデックス構築
private async buildSearchIndexForBookmark(
  searchStore: IDBObjectStore, 
  bookmark: Bookmark
): Promise<void> {
  // 既存インデックスを削除
  const existingIndex = searchStore.index('bookmarkId');
  const existingEntries = await this.promisifyRequest(existingIndex.getAll(bookmark.id));
  
  for (const entry of existingEntries) {
    await this.promisifyRequest(searchStore.delete(entry.id));
  }

  // 新しいインデックスエントリを作成
  const indexEntries: SearchIndexEntry[] = [];

  // タイトル (最重要: weight 10)
  if (bookmark.title) {
    indexEntries.push({
      id: `${bookmark.id}-title`,
      text: bookmark.title.toLowerCase(),
      bookmarkId: bookmark.id,
      weight: 10
    });
    
    // タイトルの単語分割もインデックス化
    const titleWords = bookmark.title.toLowerCase().split(/\s+/);
    titleWords.forEach((word, index) => {
      if (word.length > 2) { // 2文字以下は除外
        indexEntries.push({
          id: `${bookmark.id}-title-word-${index}`,
          text: word,
          bookmarkId: bookmark.id,
          weight: 8
        });
      }
    });
  }

  // 説明文 (重要: weight 5)
  if (bookmark.description) {
    indexEntries.push({
      id: `${bookmark.id}-description`,
      text: bookmark.description.toLowerCase(),
      bookmarkId: bookmark.id,
      weight: 5
    });
  }

  // URL (中重要: weight 3)
  indexEntries.push({
    id: `${bookmark.id}-url`,
    text: bookmark.url.toLowerCase(),
    bookmarkId: bookmark.id,
    weight: 3
  });

  // タグ (重要: weight 7)
  bookmark.tags.forEach((tag, index) => {
    indexEntries.push({
      id: `${bookmark.id}-tag-${index}`,
      text: tag.toLowerCase(),
      bookmarkId: bookmark.id,
      weight: 7
    });
  });

  // インデックスエントリを保存
  for (const entry of indexEntries) {
    await this.promisifyRequest(searchStore.put(entry));
  }
}
```

#### 高度な検索アルゴリズム

```typescript
// オフライン検索実行
async searchBookmarks(options: {
  userId: string;
  query: string;
  categoryId?: string;
  limit?: number;
}): Promise<Bookmark[]> {
  if (!options.query.trim()) {
    return this.getBookmarks({ 
      userId: options.userId, 
      categoryId: options.categoryId,
      limit: options.limit 
    });
  }

  const db = await this.getDB();
  const transaction = db.transaction([STORES.SEARCH_INDEX, STORES.BOOKMARKS], 'readonly');
  const searchStore = transaction.objectStore(STORES.SEARCH_INDEX);
  const bookmarkStore = transaction.objectStore(STORES.BOOKMARKS);

  // 検索クエリを正規化・分析
  const normalizedQuery = options.query.toLowerCase().trim();
  const searchTerms = normalizedQuery.split(/\s+/);
  
  // 検索語による部分一致とスコアリング
  const textIndex = searchStore.index('text');
  const allEntries = await this.promisifyRequest<SearchIndexEntry[]>(textIndex.getAll());

  // 複合スコアリングシステム
  const scoreMap = new Map<string, number>();

  for (const entry of allEntries) {
    const entryText = entry.text.toLowerCase();
    let score = 0;

    for (const term of searchTerms) {
      // 完全一致（最高スコア）
      if (entryText === term) {
        score += entry.weight * 3;
      }
      // 前方一致（高スコア）
      else if (entryText.startsWith(term)) {
        score += entry.weight * 2;
      }
      // 部分一致（基本スコア）
      else if (entryText.includes(term)) {
        score += entry.weight;
      }
      // 単語境界での一致（高スコア）
      else if (new RegExp(`\\b${term}`, 'i').test(entryText)) {
        score += entry.weight * 1.5;
      }
    }

    // 複数検索語が同じブックマークにヒットした場合はボーナス
    if (score > 0) {
      const currentScore = scoreMap.get(entry.bookmarkId) || 0;
      const newScore = currentScore + score;
      
      // 複数フィールドマッチボーナス
      if (currentScore > 0) {
        newScore *= 1.2; // 20%ボーナス
      }
      
      scoreMap.set(entry.bookmarkId, newScore);
    }
  }

  // スコア順にソートしてブックマークIDを取得
  const rankedBookmarkIds = Array.from(scoreMap.entries())
    .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
    .map(([bookmarkId]) => bookmarkId);

  // ブックマーク本体データを取得
  const bookmarks: Bookmark[] = [];
  for (const bookmarkId of rankedBookmarkIds) {
    const bookmark = await this.promisifyRequest<Bookmark>(
      bookmarkStore.get(bookmarkId)
    );
    
    if (bookmark && bookmark.userId === options.userId) {
      // カテゴリフィルタ適用
      if (!options.categoryId || bookmark.categoryId === options.categoryId) {
        bookmarks.push(bookmark);
      }
    }

    // 制限に達したら終了
    if (options.limit && bookmarks.length >= options.limit) {
      break;
    }
  }

  return bookmarks;
}
```

### 4. React Query統合とオフライン対応

**目的**: 既存の状態管理システムとのシームレス統合

**実装場所**: `src/lib/offlineQuery.ts`

#### オフライン対応クエリクライアント

```typescript
export function createOfflineQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // オフライン時のリトライ制御
        retry: (failureCount, error: any) => {
          if (error?.code === 'NETWORK_ERROR' || !navigator.onLine) {
            return false; // ネットワークエラー時はリトライしない
          }
          return failureCount < 3;
        },
        
        // オフライン状況に応じたrefetch制御
        refetchOnWindowFocus: () => navigator.onLine,
        refetchOnReconnect: true,
        
        // 拡張されたキャッシュ時間
        staleTime: 5 * 60 * 1000,     // 5分間新鮮
        gcTime: 24 * 60 * 60 * 1000,  // 24時間保持
        
        // カスタムクエリ関数（オフラインフォールバック付き）
        queryFn: async (context) => {
          const { queryKey, signal } = context;
          
          try {
            // オンライン時は通常のAPIを試行
            if (navigator.onLine) {
              return await defaultQueryFunction(context);
            }
          } catch (error) {
            console.warn('Online query failed, falling back to offline:', error);
          }
          
          // オフライン時またはAPI失敗時はローカルデータを使用
          return await getOfflineData(queryKey);
        }
      }
    }
  });
}
```

#### 自動同期システム

```typescript
// オンライン復帰時の自動同期
export function setupReconnectHandlers(queryClient: QueryClient): (() => void) {
  const handleOnline = async () => {
    console.log('🌐 Network reconnected, starting sync...');
    
    // 全クエリを無効化して再フェッチ
    await queryClient.invalidateQueries();
    
    // オフライン中のmutationを処理
    await processOfflineQueue(queryClient);
    
    // データをオフラインストレージに同期
    const userId = getCurrentUserId();
    if (userId) {
      await syncDataToOfflineStorage(queryClient, userId);
    }
  };
  
  const handleOffline = () => {
    console.log('📴 Network disconnected, switching to offline mode');
  };
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // クリーンアップ関数
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
```

### 5. ネットワーク状態監視

**目的**: リアルタイムなネットワーク状態追跡とUX最適化

**実装場所**: `src/hooks/useNetworkState.ts`

#### 包括的ネットワーク監視

```typescript
export function useNetworkState(): NetworkState {
  const [networkState, setNetworkState] = useState<NetworkState>(() => {
    const connection = getConnection();
    
    return {
      isOnline: navigator.onLine,
      isOffline: !navigator.onLine,
      effectiveType: connection?.effectiveType || null,
      downlink: connection?.downlink || null,
      rtt: connection?.rtt || null,
      saveData: connection?.saveData || false
    };
  });

  useEffect(() => {
    const updateNetworkState = () => {
      const connection = getConnection();
      
      setNetworkState({
        isOnline: navigator.onLine,
        isOffline: !navigator.onLine,
        effectiveType: connection?.effectiveType || null,
        downlink: connection?.downlink || null,
        rtt: connection?.rtt || null,
        saveData: connection?.saveData || false
      });
    };

    // 基本的なonline/offlineイベント
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);

    // Network Information API (Chrome/Edge)
    const connection = getConnection();
    if (connection) {
      connection.addEventListener('change', updateNetworkState);
    }

    return () => {
      window.removeEventListener('online', updateNetworkState);
      window.removeEventListener('offline', updateNetworkState);
      
      if (connection) {
        connection.removeEventListener('change', updateNetworkState);
      }
    };
  }, []);

  return networkState;
}

// 接続品質判定
export function getConnectionQuality(networkState: NetworkState): ConnectionQuality {
  if (networkState.isOffline) return 'offline';
  
  if (!networkState.effectiveType) return 'good';
  
  switch (networkState.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 'slow';
    case '3g':
      return 'good';
    case '4g':
      return 'fast';
    default:
      return 'good';
  }
}
```

### 6. 同期管理システム

**目的**: オンライン復帰時の効率的データ同期

**実装場所**: `src/hooks/useOfflineSync.ts`

#### インテリジェント同期

```typescript
export function useOfflineSync(): UseOfflineSyncReturn {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useNetworkState();
  
  const performSync = useCallback(async (force = false): Promise<void> => {
    if (!user?.id || (!isOnline && !force)) return;

    setSyncStatus(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      await offlineService.init();

      // 段階的同期プロセス
      console.log('🔄 Starting intelligent sync...');

      // 1. メタデータ確認
      const lastSync = await offlineService.getMetadata(`sync-${user.id}`);
      const syncNeeded = !lastSync || 
        (Date.now() - new Date(lastSync.lastSyncTime).getTime()) > 5 * 60 * 1000;

      if (!syncNeeded && !force) {
        console.log('✅ Data is already up to date');
        return;
      }

      // 2. ブックマークデータ同期
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
        console.log(`📚 Synced ${bookmarksQuery.bookmarks.length} bookmarks`);
      }

      // 3. カテゴリデータ同期
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
        console.log(`🏷️ Synced ${categoriesQuery.categories.length} categories`);
      }

      // 4. 同期メタデータ更新
      await offlineService.updateLastSyncTime(user.id);

      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: new Date(),
        pendingChanges: 0
      }));

      console.log('✅ Sync completed successfully');

    } catch (error) {
      console.error('❌ Sync failed:', error);
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        error: error as Error
      }));
    }
  }, [user?.id, isOnline, queryClient]);

  // ネットワーク復帰時の自動同期
  useEffect(() => {
    if (isOnline && user?.id) {
      const timeoutId = setTimeout(() => {
        performSync();
      }, 1000); // 1秒遅延で同期開始

      return () => clearTimeout(timeoutId);
    }
  }, [isOnline, user?.id, performSync]);

  return { ...syncStatus, syncNow, clearOfflineData, getOfflineStats };
}
```

## UI統合とユーザー体験

### 1. オフライン状態表示

**実装場所**: `src/components/OfflineIndicator.tsx`

```typescript
export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  className = '',
  showDetails = false
}) => {
  const networkState = useNetworkState();
  const connectionQuality = getConnectionQuality(networkState);
  const dataSaver = isDataSaverMode(networkState);

  // オフライン時のみ表示（詳細モード以外）
  if (networkState.isOnline && !showDetails) {
    return null;
  }

  const getStatusIcon = () => {
    if (networkState.isOffline) return <WifiOff className="w-4 h-4" />;
    
    switch (connectionQuality) {
      case 'fast': return <Zap className="w-4 h-4" />;
      case 'good': return <Wifi className="w-4 h-4" />;
      case 'slow': return <Signal className="w-4 h-4" />;
      default: return <Wifi className="w-4 h-4" />;
    }
  };

  return (
    <div className={clsx(
      'inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
      getStatusColor(),
      className
    )}>
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span>{getStatusText()}</span>
        
        {dataSaver && (
          <div className="flex items-center gap-1 text-xs opacity-75">
            <Clock className="w-3 h-3" />
            <span>節約</span>
          </div>
        )}
      </div>
    </div>
  );
};
```

### 2. PWA更新通知

**実装場所**: `src/components/PWAUpdateNotification.tsx`

```typescript
export const PWAUpdateNotification: React.FC = () => {
  const { isUpdateAvailable, isOfflineReady, skipWaiting } = useServiceWorker();
  const [isVisible, setIsVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = async () => {
    if (!isUpdateAvailable) return;

    try {
      setIsUpdating(true);
      await skipWaiting();
      // Service Workerがリロードを処理
    } catch (error) {
      console.error('Failed to update app:', error);
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            {isUpdateAvailable ? (
              <Download className="w-5 h-5 text-blue-600" />
            ) : (
              <RefreshCw className="w-5 h-5 text-green-600" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium">
              {isUpdateAvailable ? 'アップデート利用可能' : 'オフライン対応完了'}
            </h3>
            
            <div className="flex gap-2 mt-3">
              {isUpdateAvailable && (
                <button
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md"
                >
                  {isUpdating ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      更新中...
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3" />
                      更新
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
```

## パフォーマンス最適化

### 1. ストレージ効率化

#### データ圧縮とインデックス最適化

```typescript
// 効率的なデータ格納
export class OptimizedOfflineStorage {
  // JSON圧縮による容量削減
  private compressData(data: any): string {
    const jsonString = JSON.stringify(data);
    
    // 大きなデータのみ圧縮（1KB以上）
    if (jsonString.length > 1024) {
      return pako.deflate(jsonString, { to: 'string' });
    }
    
    return jsonString;
  }

  // バッチ書き込みによる性能向上
  async saveBatch(items: any[], storeName: string): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    
    // 並列書き込み
    const promises = items.map(item => 
      this.promisifyRequest(store.put(item))
    );
    
    await Promise.all(promises);
    await this.promisifyRequest(transaction);
  }

  // インデックス再構築の最適化
  async rebuildSearchIndex(): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(
      [STORES.BOOKMARKS, STORES.SEARCH_INDEX], 
      'readwrite'
    );
    
    const bookmarkStore = transaction.objectStore(STORES.BOOKMARKS);
    const searchStore = transaction.objectStore(STORES.SEARCH_INDEX);
    
    // 既存インデックスをクリア
    await this.promisifyRequest(searchStore.clear());
    
    // 全ブックマークを読み込み、インデックスを再構築
    const allBookmarks = await this.promisifyRequest<Bookmark[]>(
      bookmarkStore.getAll()
    );
    
    // バッチでインデックス構築
    const batchSize = 100;
    for (let i = 0; i < allBookmarks.length; i += batchSize) {
      const batch = allBookmarks.slice(i, i + batchSize);
      
      for (const bookmark of batch) {
        await this.buildSearchIndexForBookmark(searchStore, bookmark);
      }
      
      // CPU負荷軽減のため小休憩
      if (i % 500 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  }
}
```

### 2. メモリ管理

#### 効率的なリソース管理

```typescript
export class MemoryEfficientOfflineService {
  private cache = new Map<string, { data: any; expiry: number }>();
  private readonly MAX_CACHE_SIZE = 100;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分

  // LRU キャッシュ実装
  private manageCacheSize(): void {
    if (this.cache.size <= this.MAX_CACHE_SIZE) return;
    
    // 期限切れアイテムを削除
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (value.expiry < now) {
        this.cache.delete(key);
      }
    }
    
    // まだサイズオーバーの場合、最古のアイテムを削除
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  // メモリ使用量監視
  private monitorMemoryUsage(): void {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      const usageRatio = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit;
      
      if (usageRatio > 0.8) { // 80%以上の使用率
        console.warn('High memory usage detected, clearing caches');
        this.cache.clear();
        
        // ガベージコレクションを促進
        if ('gc' in window) {
          (window as any).gc();
        }
      }
    }
  }
}
```

## デバッグとトラブルシューティング

### 1. 開発者ツール

#### オフライン機能デバッグ

```typescript
// 開発環境用デバッグユーティリティ
export class OfflineDebugTools {
  static async inspectIndexedDB(): Promise<void> {
    if (process.env.NODE_ENV !== 'development') return;
    
    const service = new OfflineService();
    await service.init();
    
    console.group('📊 IndexedDB Status');
    
    // データベース統計
    const stats = await this.getStorageStats();
    console.table(stats);
    
    // 検索インデックス健全性チェック
    const indexHealth = await this.checkSearchIndexHealth();
    console.log('🔍 Search Index Health:', indexHealth);
    
    console.groupEnd();
  }
  
  static async getStorageStats(): Promise<StorageStats> {
    const estimate = await navigator.storage.estimate();
    
    return {
      quota: estimate.quota || 0,
      usage: estimate.usage || 0,
      usagePercentage: estimate.quota && estimate.usage 
        ? Math.round((estimate.usage / estimate.quota) * 100)
        : 0,
      available: (estimate.quota || 0) - (estimate.usage || 0)
    };
  }
  
  // Service Worker状態診断
  static async diagnoseServiceWorker(): Promise<void> {
    console.group('🔧 Service Worker Diagnosis');
    
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      
      if (registration) {
        console.log('✅ Service Worker registered');
        console.log('📍 Scope:', registration.scope);
        console.log('🔄 Update found:', !!registration.waiting);
        console.log('⚡ Active:', !!registration.active);
      } else {
        console.log('❌ Service Worker not registered');
      }
      
      // キャッシュ内容検査
      const cacheNames = await caches.keys();
      console.log('🗄️ Available caches:', cacheNames);
      
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        console.log(`📦 ${cacheName}: ${requests.length} items`);
      }
    } else {
      console.log('❌ Service Worker not supported');
    }
    
    console.groupEnd();
  }
}

// 使用例（開発環境のみ）
if (process.env.NODE_ENV === 'development') {
  (window as any).offlineDebug = OfflineDebugTools;
}
```

### 2. よくある問題と解決方法

#### IndexedDB関連の問題

```typescript
// 問題: IndexedDBトランザクションのデッドロック
// 解決: 適切なトランザクション管理
export class SafeTransactionManager {
  private activeTransactions = new Set<IDBTransaction>();
  
  async withTransaction<T>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    operation: (transaction: IDBTransaction) => Promise<T>
  ): Promise<T> {
    const db = await this.getDB();
    const transaction = db.transaction(storeNames, mode);
    
    this.activeTransactions.add(transaction);
    
    try {
      // タイムアウト設定
      const timeoutId = setTimeout(() => {
        if (this.activeTransactions.has(transaction)) {
          console.error('Transaction timeout detected');
          transaction.abort();
        }
      }, 30000); // 30秒タイムアウト
      
      const result = await operation(transaction);
      
      // トランザクション完了を待機
      await this.promisifyRequest(transaction);
      
      clearTimeout(timeoutId);
      return result;
      
    } finally {
      this.activeTransactions.delete(transaction);
    }
  }
}
```

#### Service Worker更新の問題

```typescript
// 問題: Service Worker更新が反映されない
// 解決: 強制更新メカニズム
export class ForceUpdateManager {
  async forceServiceWorkerUpdate(): Promise<void> {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      
      if (registration) {
        // 既存の登録を解除
        await registration.unregister();
        
        // キャッシュをクリア
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
        
        // ページをリロード
        window.location.reload();
      }
    }
  }
}
```

このオフライン機能により、X Bookmarkerはネットワーク接続の有無に関わらず、一貫した高品質なユーザー体験を提供します。PWA技術の活用により、ネイティブアプリに匹敵する性能と利便性を実現しています。
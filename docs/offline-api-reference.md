# X Bookmarker オフライン機能 API リファレンス

## 概要

このドキュメントでは、X Bookmarkerのオフライン機能で使用される主要なAPI、Hook、サービスの詳細な仕様を説明します。

## 目次

1. [IndexedDB Service API](#indexeddb-service-api)
2. [Offline Service API](#offline-service-api)
3. [React Hooks API](#react-hooks-api)
4. [Network Status API](#network-status-api)
5. [Service Worker API](#service-worker-api)
6. [型定義](#型定義)

---

## IndexedDB Service API

### `indexedDbService`

IndexedDBを使用したローカルデータストレージを管理するサービス。

#### Methods

##### `init(): Promise<void>`

データベースを初期化します。

```typescript
await indexedDbService.init();
```

**戻り値**: `Promise<void>`

**エラー**: 
- `Error` - データベース初期化に失敗した場合

---

##### `saveBookmarks(bookmarks: Bookmark[]): Promise<void>`

ブックマークをローカルストレージに保存します。

```typescript
const bookmarks: Bookmark[] = [
  {
    id: 'bookmark-1',
    userId: 'user-123',
    xTweetId: 'tweet-456',
    content: 'TypeScriptの素晴らしい記事',
    authorUsername: 'dev_user',
    authorDisplayName: 'Developer User',
    // ... その他のプロパティ
  }
];

await indexedDbService.saveBookmarks(bookmarks);
```

**パラメータ**:
- `bookmarks: Bookmark[]` - 保存するブックマークの配列

**戻り値**: `Promise<void>`

**エラー**:
- `Error` - データベース接続エラー
- `QuotaExceededError` - ストレージ容量超過

---

##### `getBookmarks(userId: string): Promise<OfflineBookmark[]>`

指定ユーザーのブックマークを取得します。

```typescript
const bookmarks = await indexedDbService.getBookmarks('user-123');
console.log(`取得したブックマーク: ${bookmarks.length}件`);
```

**パラメータ**:
- `userId: string` - ユーザーID

**戻り値**: `Promise<OfflineBookmark[]>` - オフライン情報付きブックマーク配列

---

##### `saveCategories(categories: Category[]): Promise<void>`

カテゴリをローカルストレージに保存します。

```typescript
const categories: Category[] = [
  {
    id: 'cat-1',
    userId: 'user-123',
    name: '技術記事',
    description: 'プログラミング関連の記事',
    color: '#3B82F6',
    icon: 'code',
    order: 1,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

await indexedDbService.saveCategories(categories);
```

**パラメータ**:
- `categories: Category[]` - 保存するカテゴリの配列

**戻り値**: `Promise<void>`

---

##### `getCategories(userId: string): Promise<OfflineCategory[]>`

指定ユーザーのカテゴリを取得します。

```typescript
const categories = await indexedDbService.getCategories('user-123');
// カテゴリは order フィールドでソートされて返される
```

**パラメータ**:
- `userId: string` - ユーザーID

**戻り値**: `Promise<OfflineCategory[]>` - オフライン情報付きカテゴリ配列

---

##### `setSyncMetadata(key: string, lastSync: Date, version?: number): Promise<void>`

同期メタデータを保存します。

```typescript
await indexedDbService.setSyncMetadata(
  'bookmarks-sync',
  new Date(),
  1
);
```

**パラメータ**:
- `key: string` - メタデータキー
- `lastSync: Date` - 最終同期時刻
- `version?: number` - バージョン番号（デフォルト: 1）

**戻り値**: `Promise<void>`

---

##### `getSyncMetadata(key: string): Promise<SyncMetadata | null>`

同期メタデータを取得します。

```typescript
const metadata = await indexedDbService.getSyncMetadata('bookmarks-sync');
if (metadata) {
  console.log('最終同期時刻:', metadata.lastSync);
}
```

**パラメータ**:
- `key: string` - メタデータキー

**戻り値**: `Promise<SyncMetadata | null>` - メタデータまたはnull

---

##### `clearAll(): Promise<void>`

すべてのローカルデータを削除します。

```typescript
await indexedDbService.clearAll();
console.log('オフラインデータをクリアしました');
```

**戻り値**: `Promise<void>`

---

## Offline Service API

### `offlineService`

オフライン機能のビジネスロジックを管理するサービス。

#### Methods

##### `initialize(): Promise<void>`

オフラインサービスを初期化します。

```typescript
await offlineService.initialize();
```

**戻り値**: `Promise<void>`

---

##### `searchBookmarksAdvanced(options: SearchOptions): Promise<SearchResult>`

高度な検索機能を実行します。

```typescript
const searchOptions: SearchOptions = {
  userId: 'user-123',
  query: 'React TypeScript',
  filters: {
    categoryIds: ['cat-1', 'cat-2'],
    tags: ['開発', '学習'],
    dateRange: {
      start: new Date('2024-01-01'),
      end: new Date('2024-12-31')
    }
  },
  limit: 20,
  offset: 0,
  sortBy: 'relevance'
};

const results = await offlineService.searchBookmarksAdvanced(searchOptions);
console.log(`検索結果: ${results.totalCount}件中${results.bookmarks.length}件表示`);
```

**パラメータ**:
- `options: SearchOptions` - 検索オプション

**戻り値**: `Promise<SearchResult>` - 検索結果

**SearchOptions の詳細**:
```typescript
interface SearchOptions {
  userId: string;
  query?: string;
  filters?: SearchFilters;
  limit?: number;
  offset?: number; 
  sortBy?: 'relevance' | 'date' | 'author';
}

interface SearchFilters {
  categoryIds?: string[];
  tags?: string[];
  authors?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  isArchived?: boolean;
}
```

---

##### `searchByTags(userId: string, tags: string[]): Promise<Bookmark[]>`

タグベースでブックマークを検索します。

```typescript
const results = await offlineService.searchByTags(
  'user-123',
  ['React', 'TypeScript', '開発']
);
```

**パラメータ**:
- `userId: string` - ユーザーID
- `tags: string[]` - 検索するタグの配列

**戻り値**: `Promise<Bookmark[]>` - マッチしたブックマーク

---

##### `searchByAuthor(userId: string, authorUsername: string): Promise<Bookmark[]>`

作者名でブックマークを検索します。

```typescript
const results = await offlineService.searchByAuthor('user-123', 'developer_user');
```

**パラメータ**:
- `userId: string` - ユーザーID  
- `authorUsername: string` - 作者のユーザー名

**戻り値**: `Promise<Bookmark[]>` - マッチしたブックマーク

---

##### `isOnline(): boolean`

オンライン状態を確認します。

```typescript
if (offlineService.isOnline()) {
  console.log('オンライン状態です');
} else {
  console.log('オフライン状態です');
}
```

**戻り値**: `boolean` - オンライン状態

---

## React Hooks API

### `useOfflineSync()`

オフライン同期の状態と操作を管理するHook。

```typescript
const {
  isSyncing,
  lastSyncTime,
  pendingChanges,
  error,
  syncNow,
  clearOfflineData,
  getOfflineStats
} = useOfflineSync();
```

**戻り値**:
```typescript
interface UseOfflineSyncReturn {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingChanges: number;
  error: Error | null;
  syncNow: () => Promise<void>;
  clearOfflineData: () => Promise<void>;
  getOfflineStats: () => Promise<OfflineStats>;
}
```

#### 使用例

```typescript
function SyncStatus() {
  const { isSyncing, lastSyncTime, syncNow, error } = useOfflineSync();

  return (
    <div>
      {isSyncing ? (
        <p>同期中...</p>
      ) : (
        <button onClick={syncNow}>
          今すぐ同期
        </button>
      )}
      
      {lastSyncTime && (
        <p>最終同期: {formatDistanceToNow(lastSyncTime)}前</p>
      )}
      
      {error && (
        <p className="error">同期エラー: {error.message}</p>
      )}
    </div>
  );
}
```

---

### `useNetworkStatus()`

ネットワーク状態を監視するHook。

```typescript
const networkStatus = useNetworkStatus();
```

**戻り値**:
```typescript
interface NetworkStatus {
  isOnline: boolean;
  isSlowConnection: boolean;
  connectionType: string | null;
  downlink: number | null;
  effectiveType: string | null;
}
```

#### 使用例

```typescript
function NetworkIndicator() {
  const { isOnline, isSlowConnection, effectiveType } = useNetworkStatus();

  return (
    <div>
      <span className={isOnline ? 'online' : 'offline'}>
        {isOnline ? 'オンライン' : 'オフライン'}
      </span>
      
      {isSlowConnection && (
        <span className="warning">低速接続</span>
      )}
      
      {effectiveType && (
        <span className="connection-type">{effectiveType}</span>
      )}
    </div>
  );
}
```

---

### `useOfflineSearch()`

オフライン検索機能を管理するHook。

```typescript
const {
  isSearching,
  searchResults,
  searchError,
  search,
  clearSearch
} = useOfflineSearch();
```

**戻り値**:
```typescript
interface UseOfflineSearchReturn {
  isSearching: boolean;
  searchResults: SearchResult | null;
  searchError: Error | null;
  search: (options: SearchOptions) => Promise<void>;
  clearSearch: () => void;
}
```

#### 使用例

```typescript
function SearchComponent() {
  const { isSearching, searchResults, search } = useOfflineSearch();
  const [query, setQuery] = useState('');

  const handleSearch = async () => {
    await search({
      userId: 'current-user',
      query,
      limit: 20
    });
  };

  return (
    <div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="検索キーワード"
      />
      <button onClick={handleSearch} disabled={isSearching}>
        {isSearching ? '検索中...' : '検索'}
      </button>
      
      {searchResults && (
        <div>
          <p>{searchResults.totalCount}件の結果</p>
          {searchResults.bookmarks.map(bookmark => (
            <BookmarkCard key={bookmark.id} bookmark={bookmark} />
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### `useServiceWorker()`

Service Workerの状態を管理するHook。

```typescript
const {
  isRegistered,
  isUpdateAvailable,
  isOfflineReady,
  registration,
  error,
  skipWaiting,
  checkForUpdate,
  unregister
} = useServiceWorker();
```

**戻り値**:
```typescript
interface ServiceWorkerState {
  isRegistered: boolean;
  isUpdateAvailable: boolean;
  isOfflineReady: boolean;
  registration: ServiceWorkerRegistration | null;
  error: Error | null;
}

interface ServiceWorkerActions {
  skipWaiting: () => Promise<void>;
  checkForUpdate: () => Promise<void>;
  unregister: () => Promise<boolean>;
}
```

---

## Network Status API

### Network Information API 統合

```typescript
// ネットワーク情報を取得
function getConnectionInfo(): ConnectionInfo {
  if ('connection' in navigator) {
    const connection = (navigator as any).connection;
    return {
      type: connection?.type || 'unknown',
      effectiveType: connection?.effectiveType || 'unknown',  
      downlink: connection?.downlink || 0,
      rtt: connection?.rtt || 0,
      saveData: connection?.saveData || false
    };
  }
  
  return {
    type: 'unknown',
    effectiveType: 'unknown',
    downlink: 0,
    rtt: 0,
    saveData: false
  };
}
```

### Connection Quality Detection

```typescript
function getConnectionQuality(networkStatus: NetworkStatus): 'fast' | 'good' | 'slow' {
  if (!networkStatus.isOnline) return 'slow';
  
  const { effectiveType, downlink } = networkStatus;
  
  if (effectiveType === '4g' && downlink && downlink > 2) {
    return 'fast';
  } else if (effectiveType === '3g' || (downlink && downlink > 0.5)) {
    return 'good';
  } else {
    return 'slow';
  }
}
```

---

## Service Worker API

### Workbox Configuration

```typescript
// Service Worker イベントハンドリング
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// バックグラウンド同期
self.addEventListener('sync', (event) => {
  if (event.tag === 'bookmark-sync') {
    event.waitUntil(syncBookmarks());
  }
});

// プッシュ通知（将来実装）
self.addEventListener('push', (event) => {
  const options = {
    body: event.data?.text() || 'New bookmark available',
    icon: '/pwa-192x192.svg',
    badge: '/pwa-192x192.svg'
  };
  
  event.waitUntil(
    self.registration.showNotification('X Bookmarker', options)
  );
});
```

---

## 型定義

### Core Types

```typescript
interface Bookmark {
  id: string;
  userId: string;
  xTweetId: string;
  content: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  mediaUrls: string[];
  links: string[];
  hashtags: string[];
  mentions: string[];
  categoryId?: string;
  tags: string[];
  isArchived: boolean;
  bookmarkedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface OfflineBookmark extends Bookmark {
  lastModified: Date;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

interface Category {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  parentId?: string;
  order: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface OfflineCategory extends Category {
  lastModified: Date;
  syncStatus: 'synced' | 'pending' | 'conflict';
}
```

### Search Types

```typescript
interface SearchQuery {
  text?: string;
  categoryIds?: string[];
  tags?: string[];
  authorUsername?: string;
  dateFrom?: Date;
  dateTo?: Date;
  hasMedia?: boolean;
  hasLinks?: boolean;
  sortBy: 'relevance' | 'date' | 'author';
  sortOrder: 'asc' | 'desc';
  limit: number;
  offset: number;
}

interface SearchResult {
  bookmarks: Bookmark[];
  totalCount: number;
  facets: {
    categories: { id: string; name: string; count: number }[];
    tags: { name: string; count: number }[];
    authors: { username: string; displayName: string; count: number }[];
  };
  queryTime: number;
}
```

### Sync Types

```typescript
interface SyncMetadata {
  key: string;
  lastSync: Date;
  version: number;
}

interface SyncJob {
  id: string;
  userId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  totalItems: number;
  processedItems: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}
```

---

## エラーコード

### Standard Error Codes

```typescript
enum OfflineErrorCode {
  // データベースエラー
  DB_INIT_FAILED = 'DB_INIT_FAILED',
  DB_CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  DB_TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',
  
  // ストレージエラー
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  STORAGE_NOT_SUPPORTED = 'STORAGE_NOT_SUPPORTED',
  
  // 同期エラー
  SYNC_NETWORK_ERROR = 'SYNC_NETWORK_ERROR',
  SYNC_AUTH_ERROR = 'SYNC_AUTH_ERROR',
  SYNC_CONFLICT = 'SYNC_CONFLICT',
  
  // 検索エラー
  SEARCH_INDEX_MISSING = 'SEARCH_INDEX_MISSING',
  SEARCH_QUERY_INVALID = 'SEARCH_QUERY_INVALID',
  
  // Service Worker エラー
  SW_NOT_SUPPORTED = 'SW_NOT_SUPPORTED',
  SW_REGISTRATION_FAILED = 'SW_REGISTRATION_FAILED',
  SW_UPDATE_FAILED = 'SW_UPDATE_FAILED'
}
```

### Error Handling Utilities

```typescript
function isOfflineError(error: unknown): error is OfflineError {
  return error instanceof Error && error.name === 'OfflineError';
}

function handleOfflineError(error: unknown): string {
  if (isOfflineError(error)) {
    switch (error.code) {
      case OfflineErrorCode.STORAGE_QUOTA_EXCEEDED:
        return 'ストレージ容量が不足しています。不要なデータを削除してください。';
      case OfflineErrorCode.DB_CONNECTION_FAILED:
        return 'データベース接続に失敗しました。ページを再読み込みしてください。';
        // ... その他のエラーケース
      default:
        return error.message;
    }
  }
  
  return '予期しないエラーが発生しました。';
}
```

---

## パフォーマンス監視

### Metrics Collection

```typescript
interface PerformanceMetrics {
  searchTime: number;
  syncTime: number;
  indexingTime: number;
  cacheHitRate: number;
  storageUsage: number;
}

// パフォーマンス計測ユーティリティ
function measurePerformance<T>(
  operation: () => Promise<T>,
  metricName: string
): Promise<T> {
  const startTime = performance.now();
  
  return operation().finally(() => {
    const duration = performance.now() - startTime;
    console.log(`[Performance] ${metricName}: ${duration.toFixed(2)}ms`);
    
    // 実際のアプリケーションでは分析サービスに送信
    // analytics.track('performance', { metric: metricName, duration });
  });
}
```

このAPIリファレンスにより、開発者はX Bookmarkerのオフライン機能を効果的に活用し、拡張することができます。
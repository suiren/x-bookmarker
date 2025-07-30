# オフライン機能実装ガイド

## 概要

X Bookmarkerのオフライン機能は、インターネット接続が不安定な環境でも快適にブックマーク管理ができるよう設計されています。Service WorkerとIndexedDBを活用したPWA（Progressive Web App）として実装されています。

## アーキテクチャ概要

### 技術スタック

- **Service Worker**: ネットワークリクエストの制御とキャッシング
- **IndexedDB**: ブラウザ内データベースによるオフラインデータ保存
- **Fuse.js**: 高性能なクライアントサイド全文検索
- **Vite PWA Plugin**: PWA設定とService Workerの自動生成

### データフロー

```
オンライン状態:
API Server ←→ React App ←→ IndexedDB (キャッシュ)

オフライン状態:
React App ←→ IndexedDB (メインデータソース)

同期:
API Server ←→ Sync Service ←→ IndexedDB
```

## 実装詳細

### 1. Service Worker設定 (vite.config.ts)

```typescript
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/api\.twitter\.com\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'twitter-api-cache',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 // 24時間
          }
        }
      }
    ]
  }
})
```

**主要機能:**
- アプリケーションリソースの自動キャッシュ
- X API レスポンスのキャッシング
- 画像ファイルの長期キャッシュ
- ネットワーク優先→キャッシュフォールバック戦略

### 2. オフラインデータストレージ (offlineService.ts)

**IndexedDB スキーマ:**

```typescript
// データベース構造
const STORES = {
  BOOKMARKS: 'bookmarks',      // ブックマークデータ
  CATEGORIES: 'categories',    // カテゴリデータ  
  SEARCH_INDEX: 'searchIndex', // 検索インデックス
  METADATA: 'metadata'         // 同期メタデータ
};
```

**主要メソッド:**

- `saveBookmarks(bookmarks)`: ブックマークの保存と検索インデックス構築
- `getBookmarks(options)`: フィルタリング・ページネーション対応の取得
- `searchBookmarksAdvanced(options)`: Fuse.js による高性能検索
- `saveCategories(categories)`: カテゴリデータの保存
- `updateLastSyncTime(userId)`: 同期時刻の記録

### 3. 検索機能

**Fuse.js 設定:**

```typescript
const fuseOptions = {
  keys: [
    { name: 'content', weight: 0.7 },        // コンテンツ重要度: 70%
    { name: 'tags', weight: 0.5 },           // タグ重要度: 50%
    { name: 'authorDisplayName', weight: 0.3 }, // 作者重要度: 30%
    { name: 'hashtags', weight: 0.4 }        // ハッシュタグ重要度: 40%
  ],
  threshold: 0.3,           // 一致精度: 70%以上
  includeScore: true,
  includeMatches: true,
  useExtendedSearch: true   // 高度な検索構文サポート
};
```

**サポートする検索機能:**
- 全文検索（コンテンツ・タグ・作者名）
- フィルタリング（カテゴリ・タグ・作者・日付範囲）
- ソート（関連度・日付・作者名）
- ページネーション

### 4. オンライン・オフライン同期 (syncService.ts)

**同期戦略:**

1. **Pull同期**: オンラインデータをオフラインストレージに保存
2. **Push同期**: オフライン変更をオンラインサーバーに送信
3. **双方向同期**: コンフリクト検出・解決付きの完全同期

**コンフリクト解決:**
- 最新タイムスタンプ優先戦略
- フィールド単位での変更検出
- ユーザー選択による手動解決（将来機能）

### 5. ネットワーク状態管理 (useNetworkStatus.ts)

**監視項目:**
- オンライン/オフライン状態
- 接続速度 (Network Information API)
- 接続タイプ (WiFi, 4G, 3G等)
- 低速接続の判定

**イベントハンドリング:**
```typescript
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
connection?.addEventListener('change', updateConnectionInfo);
```

## 使用方法

### 基本的な使用例

```typescript
// オフラインブックマーク取得
const { bookmarks, isOffline } = useOfflineBookmarks({
  categoryId: 'tech',
  limit: 20
});

// オフライン検索
const { searchBookmarks } = useOfflineSearch();
await searchBookmarks({
  query: 'React hooks',
  categoryIds: ['tech'],
  sortBy: 'relevance'
});

// 同期実行
const { syncToOffline, isSyncing } = useOfflineSync();
await syncToOffline();
```

### UIコンポーネントの統合

```tsx
// オフライン状態表示
<OfflineIndicator showDetails />

// フローティングインジケーター
<FloatingOfflineIndicator />

// 検索ページでのオフライン対応
const { isOnline } = useNetworkStatus();
const data = isOnline ? onlineResults : offlineResults;
```

## パフォーマンス最適化

### 1. データキャッシング

- **Fuse.js インスタンス**: 5分間のメモリキャッシュ
- **検索結果**: React Queryによる自動キャッシング
- **画像**: Service Workerによる長期キャッシュ (30日)

### 2. 初期化遅延

```typescript
// 必要時のみIndexedDB初期化
useEffect(() => {
  offlineService.init().catch(console.error);
}, []);
```

### 3. バックグラウンド同期

```typescript
// オンライン復帰時の自動同期（デバウンス付き）
useEffect(() => {
  if (isOnline && user?.id) {
    const timeoutId = setTimeout(() => {
      syncToOffline();
    }, 2000); // 2秒後に同期
    
    return () => clearTimeout(timeoutId);
  }
}, [isOnline, user?.id]);
```

## エラーハンドリング

### 1. IndexedDBエラー

```typescript
try {
  await offlineService.saveBookmarks(bookmarks);
} catch (error) {
  console.error('Offline save failed:', error);
  // フォールバック処理
  showErrorNotification('データの保存に失敗しました');
}
```

### 2. 同期エラー

```typescript
const [syncError, setSyncError] = useState<Error | null>(null);

// エラー状態の監視
useEffect(() => {
  const unsubscribe = syncService.onStatusChange((status) => {
    if (status.error) {
      setSyncError(status.error);
    }
  });
  return unsubscribe;
}, []);
```

### 3. ネットワークエラー

```typescript
// オフライン時のAPIエラーハンドリング
const { data, error } = useQuery({
  queryKey: ['bookmarks'],
  queryFn: fetchBookmarks,
  retry: (failureCount, error) => {
    // オフライン時はリトライしない
    if (!navigator.onLine) return false;
    return failureCount < 3;
  }
});
```

## まとめ

オフライン機能の実装により、X Bookmarkerは：

- **可用性**: ネットワーク状況に関係なく利用可能
- **パフォーマンス**: 高速なローカル検索
- **ユーザビリティ**: シームレスなオンライン・オフライン切り替え
- **拡張性**: 将来機能への対応可能な設計

を実現しています。継続的な改善により、さらなるユーザー体験の向上を図っていきます。
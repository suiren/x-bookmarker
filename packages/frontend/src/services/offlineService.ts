/**
 * オフラインデータ管理サービス (IndexedDB)
 */

import Fuse from 'fuse.js';
import type { Bookmark, Category } from '@x-bookmarker/shared';

// IndexedDBデータベース名とバージョン
const DB_NAME = 'x-bookmarker-offline';
const DB_VERSION = 1;

// オブジェクトストア名
const STORES = {
  BOOKMARKS: 'bookmarks',
  CATEGORIES: 'categories',
  SEARCH_INDEX: 'searchIndex',
  METADATA: 'metadata'
} as const;

// メタデータタイプ
interface OfflineMetadata {
  id: string;
  lastSyncTime: string;
  totalBookmarks: number;
  totalCategories: number;
  version: number;
}

// 検索インデックス用の型
interface SearchIndexEntry {
  id: string;
  text: string;
  bookmarkId: string;
  weight: number; // 検索重要度 (1-10)
}

// Fuse.js検索オプション設定
interface FuseSearchOptions {
  keys: Array<{
    name: string;
    weight: number;
  }>;
  threshold: number;
  distance: number;
  minMatchCharLength: number;
  includeScore: boolean;
  includeMatches: boolean;
  shouldSort: true;
  useExtendedSearch: boolean;
  ignoreLocation: boolean;
}

// 検索フィルターオプション
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

// 拡張検索オプション
interface ExtendedSearchOptions {
  userId: string;
  query: string;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'date' | 'author';
  sortDirection?: 'asc' | 'desc';
}

class OfflineService {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private fuseCache: Map<string, Fuse<Bookmark>> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分

  /**
   * データベースを初期化
   */
  async init(): Promise<void> {
    if (this.db) return;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // ブックマークストア
        if (!db.objectStoreNames.contains(STORES.BOOKMARKS)) {
          const bookmarkStore = db.createObjectStore(STORES.BOOKMARKS, {
            keyPath: 'id'
          });
          bookmarkStore.createIndex('userId', 'userId');
          bookmarkStore.createIndex('categoryId', 'categoryId');
          bookmarkStore.createIndex('bookmarkedAt', 'bookmarkedAt');
          bookmarkStore.createIndex('isArchived', 'isArchived');
        }

        // カテゴリストア
        if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
          const categoryStore = db.createObjectStore(STORES.CATEGORIES, {
            keyPath: 'id'
          });
          categoryStore.createIndex('userId', 'userId');
          categoryStore.createIndex('order', 'order');
        }

        // 検索インデックスストア
        if (!db.objectStoreNames.contains(STORES.SEARCH_INDEX)) {
          const searchStore = db.createObjectStore(STORES.SEARCH_INDEX, {
            keyPath: 'id'
          });
          searchStore.createIndex('bookmarkId', 'bookmarkId');
          searchStore.createIndex('text', 'text');
          searchStore.createIndex('weight', 'weight');
        }

        // メタデータストア
        if (!db.objectStoreNames.contains(STORES.METADATA)) {
          db.createObjectStore(STORES.METADATA, {
            keyPath: 'id'
          });
        }

        console.log('✅ IndexedDB schema upgraded');
      };
    });

    await this.dbPromise;
  }

  /**
   * データベース接続を取得
   */
  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  // ===============================
  // ブックマーク操作
  // ===============================

  /**
   * ブックマークを保存
   */
  async saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.BOOKMARKS, STORES.SEARCH_INDEX], 'readwrite');
    const bookmarkStore = transaction.objectStore(STORES.BOOKMARKS);
    const searchStore = transaction.objectStore(STORES.SEARCH_INDEX);

    for (const bookmark of bookmarks) {
      // ブックマークを保存
      await this.promisifyRequest(bookmarkStore.put(bookmark));

      // 検索インデックスを構築
      await this.buildSearchIndexForBookmark(searchStore, bookmark);
    }

    await this.promisifyRequest(transaction);
    
    // Fuseキャッシュをクリア（データが更新されたため）
    this.clearFuseCache();
    
    console.log(`✅ Saved ${bookmarks.length} bookmarks to IndexedDB`);
  }

  /**
   * ブックマークを取得
   */
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
    
    // ユーザーIDでフィルタリング
    const index = store.index('userId');
    const request = index.getAll(options.userId);
    const allBookmarks = await this.promisifyRequest<Bookmark[]>(request);

    // 追加フィルタリング
    let filteredBookmarks = allBookmarks;

    if (options.categoryId !== undefined) {
      filteredBookmarks = filteredBookmarks.filter(b => b.categoryId === options.categoryId);
    }

    if (options.isArchived !== undefined) {
      filteredBookmarks = filteredBookmarks.filter(b => b.isArchived === options.isArchived);
    }

    // ソート（新しいものから）
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

  /**
   * ブックマークを削除
   */
  async deleteBookmark(bookmarkId: string): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([STORES.BOOKMARKS, STORES.SEARCH_INDEX], 'readwrite');
    const bookmarkStore = transaction.objectStore(STORES.BOOKMARKS);
    const searchStore = transaction.objectStore(STORES.SEARCH_INDEX);

    // ブックマークを削除
    await this.promisifyRequest(bookmarkStore.delete(bookmarkId));

    // 関連する検索インデックスを削除
    const searchIndex = searchStore.index('bookmarkId');
    const searchEntries = await this.promisifyRequest(searchIndex.getAll(bookmarkId));
    
    for (const entry of searchEntries) {
      await this.promisifyRequest(searchStore.delete(entry.id));
    }

    await this.promisifyRequest(transaction);
    
    // Fuseキャッシュをクリア（データが更新されたため）
    this.clearFuseCache();
  }

  // ===============================
  // カテゴリ操作
  // ===============================

  /**
   * カテゴリを保存
   */
  async saveCategories(categories: Category[]): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(STORES.CATEGORIES, 'readwrite');
    const store = transaction.objectStore(STORES.CATEGORIES);

    for (const category of categories) {
      await this.promisifyRequest(store.put(category));
    }

    await this.promisifyRequest(transaction);
    console.log(`✅ Saved ${categories.length} categories to IndexedDB`);
  }

  /**
   * カテゴリを取得
   */
  async getCategories(userId: string): Promise<Category[]> {
    const db = await this.getDB();
    const transaction = db.transaction(STORES.CATEGORIES, 'readonly');
    const store = transaction.objectStore(STORES.CATEGORIES);
    const index = store.index('userId');
    
    const categories = await this.promisifyRequest<Category[]>(index.getAll(userId));
    
    // 表示順でソート
    return categories.sort((a, b) => a.order - b.order);
  }

  // ===============================
  // 検索機能
  // ===============================

  /**
   * Fuse.jsの検索設定を取得
   */
  private getFuseOptions(): FuseSearchOptions {
    return {
      keys: [
        { name: 'content', weight: 0.7 },
        { name: 'tags', weight: 0.5 },
        { name: 'authorDisplayName', weight: 0.3 },
        { name: 'hashtags', weight: 0.4 }
      ],
      threshold: 0.3, // 0.0 = 完全一致, 1.0 = すべてマッチ
      distance: 100, // 検索距離
      minMatchCharLength: 1,
      includeScore: true,
      includeMatches: true,
      shouldSort: true,
      useExtendedSearch: true, // 高度な検索構文をサポート
      ignoreLocation: true // 位置に関係なくマッチ
    };
  }

  /**
   * ユーザー用のFuseインスタンスを取得（キャッシュ付き）
   */
  private async getFuseInstance(userId: string): Promise<Fuse<Bookmark>> {
    const now = Date.now();
    const cacheKey = `fuse-${userId}`;
    
    // キャッシュが有効かチェック
    if (this.fuseCache.has(cacheKey) && (now - this.lastCacheUpdate) < this.CACHE_TTL) {
      return this.fuseCache.get(cacheKey)!;
    }

    // すべてのブックマークを取得
    const bookmarks = await this.getBookmarks({ userId });
    
    // Fuseインスタンスを作成
    const fuseInstance = new Fuse(bookmarks, this.getFuseOptions());
    
    // キャッシュに保存
    this.fuseCache.set(cacheKey, fuseInstance);
    this.lastCacheUpdate = now;
    
    return fuseInstance;
  }

  /**
   * Fuseキャッシュをクリア
   */
  private clearFuseCache(): void {
    this.fuseCache.clear();
    this.lastCacheUpdate = 0;
  }

  /**
   * フィルターを適用
   */
  private applyFilters(bookmarks: Bookmark[], filters?: SearchFilters): Bookmark[] {
    if (!filters) return bookmarks;

    let filtered = bookmarks;

    // カテゴリフィルター
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      filtered = filtered.filter(bookmark => 
        filters.categoryIds!.includes(bookmark.categoryId || '')
      );
    }

    // タグフィルター
    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(bookmark =>
        filters.tags!.some(tag => bookmark.tags.includes(tag))
      );
    }

    // 作者フィルター
    if (filters.authors && filters.authors.length > 0) {
      filtered = filtered.filter(bookmark =>
        filters.authors!.includes(bookmark.authorUsername)
      );
    }

    // 日付範囲フィルター
    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      filtered = filtered.filter(bookmark => {
        const bookmarkDate = new Date(bookmark.bookmarkedAt);
        return bookmarkDate >= start && bookmarkDate <= end;
      });
    }

    // アーカイブフィルター
    if (filters.isArchived !== undefined) {
      filtered = filtered.filter(bookmark => bookmark.isArchived === filters.isArchived);
    }

    return filtered;
  }

  /**
   * 検索結果をソート
   */
  private sortBookmarks(
    bookmarks: Bookmark[], 
    sortBy: 'relevance' | 'date' | 'author' = 'relevance',
    sortDirection: 'asc' | 'desc' = 'desc'
  ): Bookmark[] {
    if (sortBy === 'relevance') {
      // relevanceの場合はFuse.jsのスコアでソート済みなので、そのまま返す
      return bookmarks;
    }

    const sorted = [...bookmarks].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'date':
          comparison = new Date(a.bookmarkedAt).getTime() - new Date(b.bookmarkedAt).getTime();
          break;
        case 'author':
          comparison = a.authorDisplayName.localeCompare(b.authorDisplayName);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }

  /**
   * 拡張検索機能（Fuse.jsベース）
   */
  async searchBookmarksAdvanced(options: ExtendedSearchOptions): Promise<Bookmark[]> {
    // 空のクエリの場合は通常の取得
    if (!options.query.trim()) {
      const bookmarks = await this.getBookmarks({ 
        userId: options.userId,
        limit: options.limit,
        offset: options.offset
      });
      
      const filtered = this.applyFilters(bookmarks, options.filters);
      const sorted = this.sortBookmarks(filtered, options.sortBy, options.sortDirection);
      
      return sorted;
    }

    // Fuseインスタンスを取得
    const fuse = await this.getFuseInstance(options.userId);

    // 検索実行
    const searchLimit = options.limit && options.offset 
      ? options.limit + options.offset 
      : options.limit;
    
    const results = fuse.search(options.query, {
      limit: searchLimit
    });

    // 検索結果からブックマークを抽出
    let bookmarks = results.map(result => result.item);

    // フィルターを適用
    bookmarks = this.applyFilters(bookmarks, options.filters);

    // ソート（relevanceの場合はFuse.jsでソート済み）
    if (options.sortBy && options.sortBy !== 'relevance') {
      bookmarks = this.sortBookmarks(bookmarks, options.sortBy, options.sortDirection);
    }

    // ページネーション
    if (options.offset || options.limit) {
      const start = options.offset || 0;
      const end = start + (options.limit || bookmarks.length);
      bookmarks = bookmarks.slice(start, end);
    }

    return bookmarks;
  }

  /**
   * オフライン検索を実行（後方互換性のため）
   * @deprecated searchBookmarksAdvancedを使用してください
   */
  async searchBookmarks(options: {
    userId: string;
    query: string;
    categoryId?: string;
    limit?: number;
  }): Promise<Bookmark[]> {
    return this.searchBookmarksAdvanced({
      userId: options.userId,
      query: options.query,
      filters: options.categoryId ? { categoryIds: [options.categoryId] } : undefined,
      limit: options.limit,
      sortBy: 'relevance'
    });
  }

  /**
   * タグでブックマークを検索
   */
  async searchByTags(userId: string, tags: string[]): Promise<Bookmark[]> {
    return this.searchBookmarksAdvanced({
      userId,
      query: '', // 空のクエリでフィルターのみ適用
      filters: { tags },
      sortBy: 'date'
    });
  }

  /**
   * 作者でブックマークを検索
   */
  async searchByAuthor(userId: string, authorUsername: string): Promise<Bookmark[]> {
    return this.searchBookmarksAdvanced({
      userId,
      query: '', // 空のクエリでフィルターのみ適用
      filters: { authors: [authorUsername] },
      sortBy: 'date'
    });
  }

  /**
   * 日付範囲でブックマークを検索
   */
  async searchByDateRange(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<Bookmark[]> {
    return this.searchBookmarksAdvanced({
      userId,
      query: '', // 空のクエリでフィルターのみ適用
      filters: { dateRange: { start: startDate, end: endDate } },
      sortBy: 'date'
    });
  }

  /**
   * カテゴリ別ブックマーク検索
   */
  async searchByCategories(userId: string, categoryIds: string[]): Promise<Bookmark[]> {
    return this.searchBookmarksAdvanced({
      userId,
      query: '', // 空のクエリでフィルターのみ適用
      filters: { categoryIds },
      sortBy: 'date'
    });
  }

  // ===============================
  // メタデータ操作
  // ===============================

  /**
   * メタデータを保存
   */
  async saveMetadata(metadata: OfflineMetadata): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(STORES.METADATA, 'readwrite');
    const store = transaction.objectStore(STORES.METADATA);
    
    await this.promisifyRequest(store.put(metadata));
    await this.promisifyRequest(transaction);
  }

  /**
   * メタデータを取得
   */
  async getMetadata(id: string): Promise<OfflineMetadata | null> {
    const db = await this.getDB();
    const transaction = db.transaction(STORES.METADATA, 'readonly');
    const store = transaction.objectStore(STORES.METADATA);
    
    const metadata = await this.promisifyRequest<OfflineMetadata>(store.get(id));
    return metadata || null;
  }

  /**
   * 同期時刻を更新
   */
  async updateLastSyncTime(userId: string): Promise<void> {
    const metadata: OfflineMetadata = {
      id: `sync-${userId}`,
      lastSyncTime: new Date().toISOString(),
      totalBookmarks: 0, // 実際の値は同期時に更新
      totalCategories: 0,
      version: DB_VERSION
    };

    await this.saveMetadata(metadata);
  }

  // ===============================
  // データクリア
  // ===============================

  /**
   * すべてのオフラインデータをクリア
   */
  async clearAllData(): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(
      [STORES.BOOKMARKS, STORES.CATEGORIES, STORES.SEARCH_INDEX, STORES.METADATA], 
      'readwrite'
    );

    const stores = Object.values(STORES);
    for (const storeName of stores) {
      const store = transaction.objectStore(storeName);
      await this.promisifyRequest(store.clear());
    }

    await this.promisifyRequest(transaction);
    
    // Fuseキャッシュもクリア
    this.clearFuseCache();
    
    console.log('✅ All offline data cleared');
  }

  // ===============================
  // プライベートメソッド
  // ===============================

  /**
   * ブックマーク用の検索インデックスを構築
   * Fuse.jsベースの検索では主にlegacyサポート用
   */
  private async buildSearchIndexForBookmark(
    searchStore: IDBObjectStore, 
    bookmark: Bookmark
  ): Promise<void> {
    // 既存のインデックスを削除
    const existingIndex = searchStore.index('bookmarkId');
    const existingEntries = await this.promisifyRequest(existingIndex.getAll(bookmark.id));
    
    for (const entry of existingEntries) {
      await this.promisifyRequest(searchStore.delete(entry.id));
    }

    // 新しいインデックスを作成
    const indexEntries: SearchIndexEntry[] = [];

    // コンテンツ (重要度: 7 - Fuse.jsの重み0.7に対応)
    if (bookmark.content) {
      indexEntries.push({
        id: `${bookmark.id}-content`,
        text: bookmark.content,
        bookmarkId: bookmark.id,
        weight: 7
      });
    }

    // 作者表示名 (重要度: 3 - Fuse.jsの重み0.3に対応)
    if (bookmark.authorDisplayName) {
      indexEntries.push({
        id: `${bookmark.id}-author`,
        text: bookmark.authorDisplayName,
        bookmarkId: bookmark.id,
        weight: 3
      });
    }

    // タグ (重要度: 5 - Fuse.jsの重み0.5に対応)
    for (let i = 0; i < bookmark.tags.length; i++) {
      const tag = bookmark.tags[i];
      indexEntries.push({
        id: `${bookmark.id}-tag-${i}`,
        text: tag,
        bookmarkId: bookmark.id,
        weight: 5
      });
    }

    // ハッシュタグ (重要度: 4 - Fuse.jsの重み0.4に対応)
    for (let i = 0; i < bookmark.hashtags.length; i++) {
      const hashtag = bookmark.hashtags[i];
      indexEntries.push({
        id: `${bookmark.id}-hashtag-${i}`,
        text: hashtag,
        bookmarkId: bookmark.id,
        weight: 4
      });
    }

    // インデックスを保存
    for (const entry of indexEntries) {
      await this.promisifyRequest(searchStore.put(entry));
    }
  }

  /**
   * IDBRequestをPromiseに変換
   */
  private promisifyRequest<T = any>(request: IDBRequest | IDBTransaction): Promise<T> {
    return new Promise((resolve, reject) => {
      if ('result' in request) {
        // IDBRequest
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } else {
        // IDBTransaction
        request.oncomplete = () => resolve(undefined as T);
        request.onerror = () => reject(request.error);
      }
    });
  }

  /**
   * データベース接続を閉じる
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPromise = null;
    }
  }
}

// シングルトンインスタンス
export const offlineService = new OfflineService();
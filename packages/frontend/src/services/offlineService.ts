/**
 * オフラインデータ管理サービス (IndexedDB)
 */

import { Bookmark, Category } from '@x-bookmarker/shared';

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

class OfflineService {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

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
          categoryStore.createIndex('displayOrder', 'displayOrder');
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
    return categories.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  // ===============================
  // 検索機能
  // ===============================

  /**
   * オフライン検索を実行
   */
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

    // 検索クエリを正規化
    const normalizedQuery = options.query.toLowerCase().trim();
    const searchTerms = normalizedQuery.split(/\s+/);

    // 検索インデックスから候補を取得
    const textIndex = searchStore.index('text');
    const allEntries = await this.promisifyRequest<SearchIndexEntry[]>(textIndex.getAll());

    // スコアリング
    const scoreMap = new Map<string, number>();

    for (const entry of allEntries) {
      const entryText = entry.text.toLowerCase();
      let score = 0;

      for (const term of searchTerms) {
        if (entryText.includes(term)) {
          // 完全一致にはより高いスコア
          if (entryText === term) {
            score += entry.weight * 3;
          } 
          // 開始一致
          else if (entryText.startsWith(term)) {
            score += entry.weight * 2;
          }
          // 部分一致
          else {
            score += entry.weight;
          }
        }
      }

      if (score > 0) {
        const currentScore = scoreMap.get(entry.bookmarkId) || 0;
        scoreMap.set(entry.bookmarkId, currentScore + score);
      }
    }

    // スコア順にソートしてブックマークIDを取得
    const rankedBookmarkIds = Array.from(scoreMap.entries())
      .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
      .map(([bookmarkId]) => bookmarkId);

    // ブックマークを取得
    const bookmarks: Bookmark[] = [];
    for (const bookmarkId of rankedBookmarkIds) {
      const bookmark = await this.promisifyRequest<Bookmark>(
        bookmarkStore.get(bookmarkId)
      );
      
      if (bookmark && bookmark.userId === options.userId) {
        // カテゴリフィルタ
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
    console.log('✅ All offline data cleared');
  }

  // ===============================
  // プライベートメソッド
  // ===============================

  /**
   * ブックマーク用の検索インデックスを構築
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

    // タイトル (重要度: 10)
    if (bookmark.title) {
      indexEntries.push({
        id: `${bookmark.id}-title`,
        text: bookmark.title,
        bookmarkId: bookmark.id,
        weight: 10
      });
    }

    // 説明文 (重要度: 5)
    if (bookmark.description) {
      indexEntries.push({
        id: `${bookmark.id}-description`,
        text: bookmark.description,
        bookmarkId: bookmark.id,
        weight: 5
      });
    }

    // URL (重要度: 3)
    indexEntries.push({
      id: `${bookmark.id}-url`,
      text: bookmark.url,
      bookmarkId: bookmark.id,
      weight: 3
    });

    // タグ (重要度: 7)
    for (let i = 0; i < bookmark.tags.length; i++) {
      const tag = bookmark.tags[i];
      indexEntries.push({
        id: `${bookmark.id}-tag-${i}`,
        text: tag,
        bookmarkId: bookmark.id,
        weight: 7
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
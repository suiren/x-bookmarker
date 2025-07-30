/**
 * IndexedDBサービス - オフラインデータストレージ
 * @description ブックマーク、カテゴリ、タグ、検索履歴のオフライン保存を管理
 * 注意: このファイルは後方互換性のため残されています。
 * 新しい実装では offlineService.ts を使用してください。
 */

import type { Bookmark, Category, Tag, SearchQuery } from '../types';
import { offlineService } from './offlineService';

const DB_NAME = 'XBookmarkerOfflineDB';
const DB_VERSION = 1;

// データベースのスキーマ定義
export interface OfflineBookmark extends Omit<Bookmark, 'searchVector'> {
  lastModified: Date;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface OfflineCategory extends Category {
  lastModified: Date;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface OfflineTag extends Tag {
  lastModified: Date;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface SearchIndex {
  id: string;
  bookmarkId: string;
  content: string;
  tags: string[];
  authorUsername: string;
  categoryId?: string;
  lastUpdated: Date;
}

export interface SyncMetadata {
  key: string;
  lastSync: Date;
  version: number;
}

class IndexedDbService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * データベースを初期化
   */
  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('IndexedDB initialization failed'));
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createStores(db);
      };
    });

    return this.initPromise;
  }

  /**
   * オブジェクトストアを作成
   */
  private createStores(db: IDBDatabase): void {
    // ブックマークストア
    if (!db.objectStoreNames.contains('bookmarks')) {
      const bookmarkStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
      bookmarkStore.createIndex('userId', 'userId');
      bookmarkStore.createIndex('categoryId', 'categoryId');
      bookmarkStore.createIndex('tags', 'tags', { multiEntry: true });
      bookmarkStore.createIndex('syncStatus', 'syncStatus');
      bookmarkStore.createIndex('lastModified', 'lastModified');
    }

    // カテゴリストア
    if (!db.objectStoreNames.contains('categories')) {
      const categoryStore = db.createObjectStore('categories', { keyPath: 'id' });
      categoryStore.createIndex('userId', 'userId');
      categoryStore.createIndex('parentId', 'parentId');
      categoryStore.createIndex('syncStatus', 'syncStatus');
    }

    // タグストア
    if (!db.objectStoreNames.contains('tags')) {
      const tagStore = db.createObjectStore('tags', { keyPath: 'id' });
      tagStore.createIndex('userId', 'userId');
      tagStore.createIndex('name', 'name');
      tagStore.createIndex('syncStatus', 'syncStatus');
    }

    // 検索インデックスストア
    if (!db.objectStoreNames.contains('searchIndex')) {
      const searchStore = db.createObjectStore('searchIndex', { keyPath: 'id' });
      searchStore.createIndex('bookmarkId', 'bookmarkId', { unique: true });
      searchStore.createIndex('content', 'content');
      searchStore.createIndex('tags', 'tags', { multiEntry: true });
      searchStore.createIndex('authorUsername', 'authorUsername');
    }

    // 同期メタデータストア
    if (!db.objectStoreNames.contains('syncMetadata')) {
      db.createObjectStore('syncMetadata', { keyPath: 'key' });
    }

    // 検索履歴ストア
    if (!db.objectStoreNames.contains('searchHistory')) {
      const historyStore = db.createObjectStore('searchHistory', { keyPath: 'id', autoIncrement: true });
      historyStore.createIndex('userId', 'userId');
      historyStore.createIndex('createdAt', 'createdAt');
    }
  }

  /**
   * データベース接続を確保
   */
  private async ensureConnection(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Database connection failed');
    }
    return this.db;
  }

  /**
   * ブックマークを保存
   */
  async saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['bookmarks', 'searchIndex'], 'readwrite');
    const bookmarkStore = transaction.objectStore('bookmarks');
    const searchStore = transaction.objectStore('searchIndex');

    for (const bookmark of bookmarks) {
      const offlineBookmark: OfflineBookmark = {
        ...bookmark,
        lastModified: new Date(),
        syncStatus: 'synced'
      };

      await new Promise<void>((resolve, reject) => {
        const request = bookmarkStore.put(offlineBookmark);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // 検索インデックスを更新
      const searchIndex: SearchIndex = {
        id: `search_${bookmark.id}`,
        bookmarkId: bookmark.id,
        content: bookmark.content,
        tags: bookmark.tags,
        authorUsername: bookmark.authorUsername,
        categoryId: bookmark.categoryId || undefined,
        lastUpdated: new Date()
      };

      await new Promise<void>((resolve, reject) => {
        const request = searchStore.put(searchIndex);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * ブックマークを取得
   */
  async getBookmarks(userId: string): Promise<OfflineBookmark[]> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['bookmarks'], 'readonly');
    const store = transaction.objectStore('bookmarks');
    const index = store.index('userId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * カテゴリを保存
   */
  async saveCategories(categories: Category[]): Promise<void> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['categories'], 'readwrite');
    const store = transaction.objectStore('categories');

    for (const category of categories) {
      const offlineCategory: OfflineCategory = {
        ...category,
        lastModified: new Date(),
        syncStatus: 'synced'
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(offlineCategory);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * カテゴリを取得
   */
  async getCategories(userId: string): Promise<OfflineCategory[]> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['categories'], 'readonly');
    const store = transaction.objectStore('categories');
    const index = store.index('userId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * タグを保存
   */
  async saveTags(tags: Tag[]): Promise<void> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['tags'], 'readwrite');
    const store = transaction.objectStore('tags');

    for (const tag of tags) {
      const offlineTag: OfflineTag = {
        ...tag,
        lastModified: new Date(),
        syncStatus: 'synced'
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(offlineTag);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * タグを取得
   */
  async getTags(userId: string): Promise<OfflineTag[]> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['tags'], 'readonly');
    const store = transaction.objectStore('tags');
    const index = store.index('userId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 検索インデックスを取得
   */
  async getSearchIndex(): Promise<SearchIndex[]> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['searchIndex'], 'readonly');
    const store = transaction.objectStore('searchIndex');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 同期メタデータを保存
   */
  async setSyncMetadata(key: string, lastSync: Date, version: number = 1): Promise<void> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['syncMetadata'], 'readwrite');
    const store = transaction.objectStore('syncMetadata');

    const metadata: SyncMetadata = { key, lastSync, version };

    return new Promise((resolve, reject) => {
      const request = store.put(metadata);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 同期メタデータを取得
   */
  async getSyncMetadata(key: string): Promise<SyncMetadata | null> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['syncMetadata'], 'readonly');
    const store = transaction.objectStore('syncMetadata');

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 検索履歴を保存
   */
  async saveSearchHistory(userId: string, query: Partial<SearchQuery>): Promise<void> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['searchHistory'], 'readwrite');
    const store = transaction.objectStore('searchHistory');

    const historyItem = {
      userId,
      query,
      createdAt: new Date()
    };

    return new Promise((resolve, reject) => {
      const request = store.add(historyItem);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 検索履歴を取得
   */
  async getSearchHistory(userId: string, limit: number = 10): Promise<any[]> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['searchHistory'], 'readonly');
    const store = transaction.objectStore('searchHistory');
    const index = store.index('userId');

    return new Promise((resolve, reject) => {
      const results: any[] = [];
      const request = index.openCursor(IDBKeyRange.only(userId), 'prev');

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * データベースをクリア
   */
  async clearAll(): Promise<void> {
    const db = await this.ensureConnection();
    const storeNames = ['bookmarks', 'categories', 'tags', 'searchIndex', 'syncMetadata', 'searchHistory'];
    
    const transaction = db.transaction(storeNames, 'readwrite');

    for (const storeName of storeNames) {
      const store = transaction.objectStore(storeName);
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * 同期待ちアイテムを取得
   */
  async getPendingSync(): Promise<{
    bookmarks: OfflineBookmark[];
    categories: OfflineCategory[];
    tags: OfflineTag[];
  }> {
    const db = await this.ensureConnection();
    const transaction = db.transaction(['bookmarks', 'categories', 'tags'], 'readonly');

    const results = await Promise.all([
      this.getItemsBySyncStatus('bookmarks', 'pending'),
      this.getItemsBySyncStatus('categories', 'pending'),
      this.getItemsBySyncStatus('tags', 'pending')
    ]);

    return {
      bookmarks: results[0] as OfflineBookmark[],
      categories: results[1] as OfflineCategory[],
      tags: results[2] as OfflineTag[]
    };
  }

  /**
   * 同期ステータス別にアイテムを取得
   */
  private async getItemsBySyncStatus(storeName: string, status: string): Promise<any[]> {
    const db = await this.ensureConnection();
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index('syncStatus');

    return new Promise((resolve, reject) => {
      const request = index.getAll(status);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// シングルトンインスタンス
export const indexedDbService = new IndexedDbService();
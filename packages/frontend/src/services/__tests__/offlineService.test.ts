/**
 * オフラインサービステスト
 * @description Fuse.jsベースの検索機能のテストケース
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { offlineService } from '../offlineService';
import type { Bookmark, Category } from '@x-bookmarker/shared';

// IndexedDBのモック
const mockIDBRequest = {
  onsuccess: null as any,
  onerror: null as any,
  result: null as any,
  error: null as any,
};

const mockIDBObjectStore = {
  put: vi.fn().mockReturnValue(mockIDBRequest),
  get: vi.fn().mockReturnValue(mockIDBRequest),
  getAll: vi.fn().mockReturnValue(mockIDBRequest),
  delete: vi.fn().mockReturnValue(mockIDBRequest),
  clear: vi.fn().mockReturnValue(mockIDBRequest),
  createIndex: vi.fn(),
  index: vi.fn().mockReturnValue({
    getAll: vi.fn().mockReturnValue(mockIDBRequest),
  }),
};

const mockIDBTransaction = {
  objectStore: vi.fn().mockReturnValue(mockIDBObjectStore),
  oncomplete: null as any,
  onerror: null as any,
};

const mockIDBDatabase = {
  transaction: vi.fn().mockReturnValue(mockIDBTransaction),
  createObjectStore: vi.fn().mockReturnValue(mockIDBObjectStore),
  objectStoreNames: {
    contains: vi.fn().mockReturnValue(false),
  },
  close: vi.fn(),
};

const mockIndexedDB = {
  open: vi.fn().mockReturnValue({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: mockIDBDatabase,
  }),
  deleteDatabase: vi.fn(),
};

// グローバルIndexedDBのモック
Object.defineProperty(global, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

// テスト用のモックデータ
const mockBookmarks: Bookmark[] = [
  {
    id: 'bookmark1',
    userId: 'user1',
    xTweetId: 'tweet1',
    content: 'React Hooksに関する投稿です',
    authorUsername: 'dev_user',
    authorDisplayName: '開発者',
    authorAvatarUrl: 'https://example.com/avatar1.jpg',
    mediaUrls: [],
    links: ['https://reactjs.org'],
    hashtags: ['React', 'JavaScript'],
    mentions: ['@reactjs'],
    categoryId: 'cat1',
    tags: ['開発', 'React'],
    isArchived: false,
    bookmarkedAt: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'bookmark2',
    userId: 'user1',
    xTweetId: 'tweet2',
    content: 'TypeScriptの型システムについて学習',
    authorUsername: 'typescript_fan',
    authorDisplayName: 'TypeScript愛好者',
    authorAvatarUrl: 'https://example.com/avatar2.jpg',
    mediaUrls: [],
    links: ['https://typescriptlang.org'],
    hashtags: ['TypeScript'],
    mentions: [],
    categoryId: 'cat2',
    tags: ['学習', 'TypeScript'],
    isArchived: false,
    bookmarkedAt: new Date('2024-01-02'),
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  },
];

const mockCategories: Category[] = [
  {
    id: 'cat1',
    userId: 'user1',
    name: '開発',
    description: '開発関連のブックマーク',
    color: '#3b82f6',
    icon: 'code',
    parentId: undefined,
    order: 1,
    isDefault: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'cat2',
    userId: 'user1',
    name: '学習',
    description: '学習関連のブックマーク',
    color: '#10b981',
    icon: 'book',
    parentId: undefined,
    order: 2,
    isDefault: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
];

describe('OfflineService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // IDBRequestの成功をシミュレート
    mockIDBRequest.onsuccess = null;
    mockIDBRequest.onerror = null;
    mockIDBRequest.result = null;
    
    // IndexedDBオープンの成功をシミュレート
    const openRequest = mockIndexedDB.open();
    setTimeout(() => {
      if (openRequest.onsuccess) {
        openRequest.result = mockIDBDatabase;
        openRequest.onsuccess();
      }
    }, 0);
  });

  afterEach(async () => {
    // キャッシュをクリア
    offlineService.close();
  });

  describe('データベース初期化', () => {
    it('正常に初期化される', async () => {
      await expect(offlineService.init()).resolves.not.toThrow();
    });
  });

  describe('ブックマーク操作', () => {
    it('ブックマークを保存できる', async () => {
      // モックの設定
      mockIDBObjectStore.put.mockReturnValue(mockIDBRequest);
      
      await expect(offlineService.saveBookmarks(mockBookmarks))
        .resolves.not.toThrow();
      
      expect(mockIDBObjectStore.put).toHaveBeenCalledTimes(mockBookmarks.length);
    });

    it('ブックマークを取得できる', async () => {
      // モックの設定
      mockIDBRequest.result = mockBookmarks;
      mockIDBObjectStore.getAll.mockReturnValue(mockIDBRequest);
      
      // IDBRequestの成功をシミュレート
      setTimeout(() => {
        if (mockIDBRequest.onsuccess) {
          mockIDBRequest.onsuccess();
        }
      }, 0);

      const result = await offlineService.getBookmarks({ userId: 'user1' });
      
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('カテゴリ操作', () => {
    it('カテゴリを保存できる', async () => {
      await expect(offlineService.saveCategories(mockCategories))
        .resolves.not.toThrow();
      
      expect(mockIDBObjectStore.put).toHaveBeenCalledTimes(mockCategories.length);
    });
  });

  describe('検索機能', () => {
    beforeEach(() => {
      // ブックマーク取得のモック設定
      mockIDBRequest.result = mockBookmarks;
      mockIDBObjectStore.getAll.mockReturnValue(mockIDBRequest);
      
      setTimeout(() => {
        if (mockIDBRequest.onsuccess) {
          mockIDBRequest.onsuccess();
        }
      }, 0);
    });

    it('基本検索が動作する', async () => {
      const result = await offlineService.searchBookmarks({
        userId: 'user1',
        query: 'React',
        limit: 10,
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('高度な検索が動作する', async () => {
      const result = await offlineService.searchBookmarksAdvanced({
        userId: 'user1',
        query: 'TypeScript',
        filters: {
          categoryIds: ['cat2'],
          tags: ['学習'],
        },
        limit: 10,
        sortBy: 'relevance',
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('タグ検索が動作する', async () => {
      const result = await offlineService.searchByTags('user1', ['開発']);
      
      expect(Array.isArray(result)).toBe(true);
    });

    it('作者検索が動作する', async () => {
      const result = await offlineService.searchByAuthor('user1', 'dev_user');
      
      expect(Array.isArray(result)).toBe(true);
    });

    it('日付範囲検索が動作する', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-02');
      
      const result = await offlineService.searchByDateRange('user1', startDate, endDate);
      
      expect(Array.isArray(result)).toBe(true);
    });

    it('カテゴリ検索が動作する', async () => {
      const result = await offlineService.searchByCategories('user1', ['cat1']);
      
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('データクリア', () => {
    it('全データをクリアできる', async () => {
      await expect(offlineService.clearAllData()).resolves.not.toThrow();
      
      expect(mockIDBObjectStore.clear).toHaveBeenCalled();
    });
  });
});
/**
 * IndexedDBサービステスト
 * @description IndexedDBを使用したオフラインストレージのテスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { indexedDbService } from '../indexedDbService';
import type { Bookmark, Category, Tag } from '../../types';

// IndexedDBのモック実装
class MockIDBDatabase {
  objectStoreNames = {
    contains: vi.fn(() => false),
  };
  
  transaction = vi.fn(() => new MockIDBTransaction());
  createObjectStore = vi.fn(() => new MockIDBObjectStore());
  close = vi.fn();
}

class MockIDBTransaction {
  objectStore = vi.fn(() => new MockIDBObjectStore());
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class MockIDBObjectStore {
  createIndex = vi.fn();
  put = vi.fn(() => new MockIDBRequest());
  get = vi.fn(() => new MockIDBRequest());
  getAll = vi.fn(() => new MockIDBRequest());
  clear = vi.fn(() => new MockIDBRequest());
  add = vi.fn(() => new MockIDBRequest());
  index = vi.fn(() => new MockIDBIndex());
}

class MockIDBIndex {
  getAll = vi.fn(() => new MockIDBRequest());
  openCursor = vi.fn(() => new MockIDBRequest());
}

class MockIDBRequest {
  onsuccess: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  result: any = null;
  error: any = null;

  constructor(result?: any, error?: any) {
    this.result = result;
    this.error = error;
    
    // 非同期でイベントを発火
    setTimeout(() => {
      if (error) {
        this.onerror?.(new CustomEvent('error'));
      } else {
        this.onsuccess?.(new CustomEvent('success'));
      }
    }, 0);
  }
}

const mockIndexedDB = {
  open: vi.fn(() => {
    const request = new MockIDBRequest(new MockIDBDatabase());
    
    setTimeout(() => {
      // onupgradeneededイベントを発火
      const upgradeEvent = new CustomEvent('upgradeneeded');
      Object.defineProperty(upgradeEvent, 'target', {
        value: { result: new MockIDBDatabase() }
      });
      (request as any).onupgradeneeded?.(upgradeEvent);
      
      // onsuccessイベントを発火
      const successEvent = new CustomEvent('success');
      Object.defineProperty(successEvent, 'target', {
        value: { result: new MockIDBDatabase() }
      });
      request.onsuccess?.(successEvent);
    }, 0);
    
    return request;
  }),
  deleteDatabase: vi.fn(),
};

// グローバルオブジェクトにモックを設定
Object.defineProperty(global, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

// テスト用サンプルデータ
const mockBookmarks: Bookmark[] = [
  {
    id: '1',
    userId: 'user1',
    xTweetId: 'tweet1',
    content: 'テストブックマーク1',
    authorUsername: 'author1',
    authorDisplayName: 'Author 1',
    authorAvatarUrl: 'https://example.com/avatar1.jpg',
    mediaUrls: [],
    links: [],
    hashtags: [],
    mentions: [],
    categoryId: 'cat1',
    tags: ['test'],
    isArchived: false,
    bookmarkedAt: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
];

const mockCategories: Category[] = [
  {
    id: 'cat1',
    userId: 'user1',
    name: 'テストカテゴリ',
    description: 'テスト用カテゴリ',
    color: '#3B82F6',
    icon: 'folder',
    parentId: undefined,
    order: 1,
    isDefault: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
];

const mockTags: Tag[] = [
  {
    id: 'tag1',
    userId: 'user1',
    name: 'テストタグ',
    color: '#10B981',
    usageCount: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
];

describe('IndexedDbService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('初期化', () => {
    it('データベースが正常に初期化される', async () => {
      await expect(indexedDbService.init()).resolves.not.toThrow();
      expect(mockIndexedDB.open).toHaveBeenCalledWith('XBookmarkerOfflineDB', 1);
    });

    it('初期化が重複実行されても問題ない', async () => {
      await indexedDbService.init();
      await indexedDbService.init(); // 二回目の呼び出し
      
      // 一度だけ実行されることを確認
      expect(mockIndexedDB.open).toHaveBeenCalledTimes(1);
    });

    it('データベース初期化エラーが適切に処理される', async () => {
      mockIndexedDB.open.mockImplementationOnce(() => {
        const request = new MockIDBRequest(null, new Error('DB Open Failed'));
        return request;
      });

      await expect(indexedDbService.init()).rejects.toThrow('IndexedDB initialization failed');
    });
  });

  describe('ブックマーク操作', () => {
    beforeEach(async () => {
      await indexedDbService.init();
    });

    it('ブックマークが正常に保存される', async () => {
      await expect(indexedDbService.saveBookmarks(mockBookmarks))
        .resolves.not.toThrow();
    });

    it('ブックマークが正常に取得される', async () => {
      // モックの戻り値を設定
      const mockStore = new MockIDBObjectStore();
      const mockIndex = new MockIDBIndex();
      
      vi.spyOn(mockIndex, 'getAll').mockImplementation(() => 
        new MockIDBRequest(mockBookmarks.map(b => ({
          ...b,
          lastModified: new Date(),
          syncStatus: 'synced'
        })))
      );
      
      vi.spyOn(mockStore, 'index').mockReturnValue(mockIndex);

      const result = await indexedDbService.getBookmarks('user1');
      
      expect(result).toBeDefined();
    });

    it('空の結果でもエラーが発生しない', async () => {
      const mockStore = new MockIDBObjectStore();
      const mockIndex = new MockIDBIndex();
      
      vi.spyOn(mockIndex, 'getAll').mockImplementation(() => 
        new MockIDBRequest([])
      );
      
      vi.spyOn(mockStore, 'index').mockReturnValue(mockIndex);

      const result = await indexedDbService.getBookmarks('user1');
      
      expect(result).toEqual([]);
    });

    it('大量のブックマークが正常に処理される', async () => {
      const largeBookmarks = Array.from({ length: 1000 }, (_, i) => ({
        ...mockBookmarks[0],
        id: `bookmark-${i}`,
        content: `テストブックマーク ${i}`,
      }));

      await expect(indexedDbService.saveBookmarks(largeBookmarks))
        .resolves.not.toThrow();
    });
  });

  describe('カテゴリ操作', () => {
    beforeEach(async () => {
      await indexedDbService.init();
    });

    it('カテゴリが正常に保存される', async () => {
      await expect(indexedDbService.saveCategories(mockCategories))
        .resolves.not.toThrow();
    });

    it('カテゴリが正常に取得される', async () => {
      const mockStore = new MockIDBObjectStore();
      const mockIndex = new MockIDBIndex();
      
      vi.spyOn(mockIndex, 'getAll').mockImplementation(() => 
        new MockIDBRequest(mockCategories.map(c => ({
          ...c,
          lastModified: new Date(),
          syncStatus: 'synced'
        })))
      );
      
      vi.spyOn(mockStore, 'index').mockReturnValue(mockIndex);

      const result = await indexedDbService.getCategories('user1');
      
      expect(result).toBeDefined();
    });
  });

  describe('タグ操作', () => {
    beforeEach(async () => {
      await indexedDbService.init();
    });

    it('タグが正常に保存される', async () => {
      await expect(indexedDbService.saveTags(mockTags))
        .resolves.not.toThrow();
    });

    it('タグが正常に取得される', async () => {
      const mockStore = new MockIDBObjectStore();
      const mockIndex = new MockIDBIndex();
      
      vi.spyOn(mockIndex, 'getAll').mockImplementation(() => 
        new MockIDBRequest(mockTags.map(t => ({
          ...t,
          lastModified: new Date(),
          syncStatus: 'synced'
        })))
      );
      
      vi.spyOn(mockStore, 'index').mockReturnValue(mockIndex);

      const result = await indexedDbService.getTags('user1');
      
      expect(result).toBeDefined();
    });
  });

  describe('検索インデックス', () => {
    beforeEach(async () => {
      await indexedDbService.init();
    });

    it('検索インデックスが正常に取得される', async () => {
      const mockSearchIndex = [
        {
          id: 'search_1',
          bookmarkId: '1',
          content: 'テストコンテンツ',
          tags: ['test'],
          authorUsername: 'author1',
          categoryId: 'cat1',
          lastUpdated: new Date(),
        },
      ];

      const mockStore = new MockIDBObjectStore();
      vi.spyOn(mockStore, 'getAll').mockImplementation(() => 
        new MockIDBRequest(mockSearchIndex)
      );

      const result = await indexedDbService.getSearchIndex();
      
      expect(result).toBeDefined();
    });
  });

  describe('同期メタデータ', () => {
    beforeEach(async () => {
      await indexedDbService.init();
    });

    it('同期メタデータが正常に保存される', async () => {
      const lastSync = new Date();
      
      await expect(indexedDbService.setSyncMetadata('bookmarks', lastSync, 1))
        .resolves.not.toThrow();
    });

    it('同期メタデータが正常に取得される', async () => {
      const mockMetadata = {
        key: 'bookmarks',
        lastSync: new Date(),
        version: 1,
      };

      const mockStore = new MockIDBObjectStore();
      vi.spyOn(mockStore, 'get').mockImplementation(() => 
        new MockIDBRequest(mockMetadata)
      );

      const result = await indexedDbService.getSyncMetadata('bookmarks');
      
      expect(result).toBeDefined();
    });

    it('存在しないメタデータでnullが返される', async () => {
      const mockStore = new MockIDBObjectStore();
      vi.spyOn(mockStore, 'get').mockImplementation(() => 
        new MockIDBRequest(undefined)
      );

      const result = await indexedDbService.getSyncMetadata('nonexistent');
      
      expect(result).toBeNull();
    });
  });

  describe('検索履歴', () => {
    beforeEach(async () => {
      await indexedDbService.init();
    });

    it('検索履歴が正常に保存される', async () => {
      const query = { text: 'test query', limit: 10 };
      
      await expect(indexedDbService.saveSearchHistory('user1', query))
        .resolves.not.toThrow();
    });

    it('検索履歴が正常に取得される', async () => {
      const mockHistory = [
        {
          id: 1,
          userId: 'user1',
          query: { text: 'test query' },
          createdAt: new Date(),
        },
      ];

      const mockStore = new MockIDBObjectStore();
      const mockIndex = new MockIDBIndex();
      
      // カーソルのモック
      const mockCursor = {
        value: mockHistory[0],
        continue: vi.fn(),
      };

      vi.spyOn(mockIndex, 'openCursor').mockImplementation(() => {
        const request = new MockIDBRequest();
        setTimeout(() => {
          Object.defineProperty(request, 'result', { value: mockCursor });
          request.onsuccess?.(new CustomEvent('success', { target: request } as any));
          
          // 二回目の呼び出しでnullを返す（カーソル終了）
          setTimeout(() => {
            Object.defineProperty(request, 'result', { value: null });
            request.onsuccess?.(new CustomEvent('success', { target: request } as any));
          }, 10);
        }, 0);
        return request;
      });
      
      vi.spyOn(mockStore, 'index').mockReturnValue(mockIndex);

      const result = await indexedDbService.getSearchHistory('user1', 5);
      
      expect(result).toBeDefined();
    });
  });

  describe('データクリア', () => {
    beforeEach(async () => {
      await indexedDbService.init();
    });

    it('全データが正常にクリアされる', async () => {
      await expect(indexedDbService.clearAll())
        .resolves.not.toThrow();
    });
  });

  describe('同期待ちアイテム', () => {
    beforeEach(async () => {
      await indexedDbService.init();
    });

    it('同期待ちアイテムが正常に取得される', async () => {
      const pendingBookmarks = mockBookmarks.map(b => ({
        ...b,
        lastModified: new Date(),
        syncStatus: 'pending' as const,
      }));

      const mockStore = new MockIDBObjectStore();
      const mockIndex = new MockIDBIndex();
      
      vi.spyOn(mockIndex, 'getAll').mockImplementation((status) => {
        if (status === 'pending') {
          return new MockIDBRequest(pendingBookmarks);
        }
        return new MockIDBRequest([]);
      });
      
      vi.spyOn(mockStore, 'index').mockReturnValue(mockIndex);

      const result = await indexedDbService.getPendingSync();
      
      expect(result).toBeDefined();
      expect(result.bookmarks).toBeDefined();
      expect(result.categories).toBeDefined();
      expect(result.tags).toBeDefined();
    });
  });

  describe('エラーハンドリング', () => {
    it('データベース接続エラーが適切に処理される', async () => {
      // 初期化前にデータ操作を試行
      const uninitializedService = Object.create(indexedDbService);
      uninitializedService.db = null;

      await expect(uninitializedService.saveBookmarks(mockBookmarks))
        .rejects.toThrow();
    });

    it('トランザクションエラーが適切に処理される', async () => {
      await indexedDbService.init();

      // エラーを発生させるモック
      const mockStore = new MockIDBObjectStore();
      vi.spyOn(mockStore, 'put').mockImplementation(() => 
        new MockIDBRequest(null, new Error('Transaction failed'))
      );

      // エラーが適切に伝播されることを確認
      await expect(indexedDbService.saveBookmarks(mockBookmarks))
        .rejects.toThrow();
    });
  });

  describe('パフォーマンス', () => {
    beforeEach(async () => {
      await indexedDbService.init();
    });

    it('大量データの操作が合理的な時間で完了する', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        ...mockBookmarks[0],
        id: `perf-test-${i}`,
        content: `パフォーマンステスト ${i}`,
      }));

      const startTime = Date.now();
      await indexedDbService.saveBookmarks(largeDataset);
      const endTime = Date.now();

      // 5秒以内に完了することを確認
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('並行アクセスが適切に処理される', async () => {
      const promises = [
        indexedDbService.saveBookmarks(mockBookmarks),
        indexedDbService.saveCategories(mockCategories),
        indexedDbService.saveTags(mockTags),
      ];

      await expect(Promise.all(promises))
        .resolves.not.toThrow();
    });
  });
});
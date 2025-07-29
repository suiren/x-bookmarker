/**
 * Redis キャッシュサービス
 * 検索結果、セッション管理、カテゴリ統計などの高速キャッシング
 */

import Redis from 'ioredis';
import { config } from '../config';

interface CacheConfig {
  defaultTTL: number;
  searchResultsTTL: number;
  categoryStatsTTL: number;
  sessionTTL: number;
  userBookmarksTTL: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: string;
}

class CacheService {
  private redis: Redis;
  private stats = {
    hits: 0,
    misses: 0
  };

  private readonly config: CacheConfig = {
    defaultTTL: 300, // 5分
    searchResultsTTL: 600, // 10分
    categoryStatsTTL: 1800, // 30分
    sessionTTL: 3600, // 1時間
    userBookmarksTTL: 180, // 3分
  };

  constructor() {
    this.redis = new Redis({
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      db: config.redis?.db || 0,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.setupEventHandlers();
  }

  /**
   * Redis接続イベントハンドラーの設定
   */
  private setupEventHandlers() {
    this.redis.on('connect', () => {
      console.log('✅ Redis接続が確立されました');
    });

    this.redis.on('ready', () => {
      console.log('🚀 Redisが使用可能です');
    });

    this.redis.on('error', (error) => {
      console.error('❌ Redis接続エラー:', error);
    });

    this.redis.on('close', () => {
      console.log('🔌 Redis接続が閉じられました');
    });
  }

  /**
   * キャッシュキーを生成
   */
  private generateKey(namespace: string, ...parts: (string | number)[]): string {
    return `x-bookmarker:${namespace}:${parts.join(':')}`;
  }

  /**
   * 値を取得（統計付き）
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      
      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return JSON.parse(value);
    } catch (error) {
      console.error(`キャッシュ取得エラー (${key}):`, error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * 値を設定
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const ttlToUse = ttl || this.config.defaultTTL;
      const result = await this.redis.setex(key, ttlToUse, JSON.stringify(value));
      return result === 'OK';
    } catch (error) {
      console.error(`キャッシュ設定エラー (${key}):`, error);
      return false;
    }
  }

  /**
   * キーを削除
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(key);
      return result > 0;
    } catch (error) {
      console.error(`キャッシュ削除エラー (${key}):`, error);
      return false;
    }
  }

  /**
   * パターンマッチングで複数キーを削除
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;
      
      const result = await this.redis.del(...keys);
      return result;
    } catch (error) {
      console.error(`パターン削除エラー (${pattern}):`, error);
      return 0;
    }
  }

  /**
   * キーの存在確認
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`キー存在確認エラー (${key}):`, error);
      return false;
    }
  }

  /**
   * TTLを設定
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.redis.expire(key, seconds);
      return result === 1;
    } catch (error) {
      console.error(`TTL設定エラー (${key}):`, error);
      return false;
    }
  }

  // ===== 高レベルキャッシュメソッド =====

  /**
   * ユーザーブックマークをキャッシュ
   */
  async cacheUserBookmarks(userId: string, options: any, bookmarks: any[]): Promise<boolean> {
    const cacheKey = this.generateKey('bookmarks', userId, JSON.stringify(options));
    return await this.set(cacheKey, bookmarks, this.config.userBookmarksTTL);
  }

  /**
   * ユーザーブックマークを取得
   */
  async getUserBookmarks(userId: string, options: any): Promise<any[] | null> {
    const cacheKey = this.generateKey('bookmarks', userId, JSON.stringify(options));
    return await this.get(cacheKey);
  }

  /**
   * 検索結果をキャッシュ
   */
  async cacheSearchResults(userId: string, query: any, results: any): Promise<boolean> {
    const queryHash = this.hashQuery(query);
    const cacheKey = this.generateKey('search', userId, queryHash);
    return await this.set(cacheKey, results, this.config.searchResultsTTL);
  }

  /**
   * 検索結果を取得
   */
  async getSearchResults(userId: string, query: any): Promise<any | null> {
    const queryHash = this.hashQuery(query);
    const cacheKey = this.generateKey('search', userId, queryHash);
    return await this.get(cacheKey);
  }

  /**
   * カテゴリ統計をキャッシュ
   */
  async cacheCategoryStats(userId: string, stats: any): Promise<boolean> {
    const cacheKey = this.generateKey('category-stats', userId);
    return await this.set(cacheKey, stats, this.config.categoryStatsTTL);
  }

  /**
   * カテゴリ統計を取得
   */
  async getCategoryStats(userId: string): Promise<any | null> {
    const cacheKey = this.generateKey('category-stats', userId);
    return await this.get(cacheKey);
  }

  /**
   * 検索履歴をキャッシュ
   */
  async cacheSearchHistory(userId: string, history: any[]): Promise<boolean> {
    const cacheKey = this.generateKey('search-history', userId);
    return await this.set(cacheKey, history, this.config.sessionTTL);
  }

  /**
   * 検索履歴を取得
   */
  async getSearchHistory(userId: string): Promise<any[] | null> {
    const cacheKey = this.generateKey('search-history', userId);
    return await this.get(cacheKey);
  }

  /**
   * 特定ユーザーのキャッシュをすべて削除
   */
  async clearUserCache(userId: string): Promise<number> {
    const patterns = [
      this.generateKey('bookmarks', userId, '*'),
      this.generateKey('search', userId, '*'),
      this.generateKey('category-stats', userId),
      this.generateKey('search-history', userId),
    ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
      totalDeleted += await this.deletePattern(pattern);
    }

    return totalDeleted;
  }

  /**
   * 検索関連のキャッシュを削除
   */
  async clearSearchCache(userId?: string): Promise<number> {
    const pattern = userId 
      ? this.generateKey('search', userId, '*')
      : this.generateKey('search', '*');
    
    return await this.deletePattern(pattern);
  }

  /**
   * ブックマーク関連のキャッシュを削除
   */
  async clearBookmarkCache(userId?: string): Promise<number> {
    const patterns = userId 
      ? [
          this.generateKey('bookmarks', userId, '*'),
          this.generateKey('category-stats', userId),
        ]
      : [
          this.generateKey('bookmarks', '*'),
          this.generateKey('category-stats', '*'),
        ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
      totalDeleted += await this.deletePattern(pattern);
    }

    return totalDeleted;
  }

  /**
   * クエリをハッシュ化（キャッシュキー生成用）
   */
  private hashQuery(query: any): string {
    const queryString = JSON.stringify(query, Object.keys(query).sort());
    return Buffer.from(queryString).toString('base64').replace(/[/+=]/g, '_').slice(0, 32);
  }

  /**
   * キャッシュ統計を取得
   */
  async getStats(): Promise<CacheStats> {
    try {
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1] : 'N/A';

      const dbInfo = await this.redis.info('keyspace');
      const keyMatch = dbInfo.match(/keys=(\d+)/);
      const totalKeys = keyMatch ? parseInt(keyMatch[1]) : 0;

      const totalRequests = this.stats.hits + this.stats.misses;
      const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: parseFloat(hitRate.toFixed(2)),
        totalKeys,
        memoryUsage,
      };
    } catch (error) {
      console.error('キャッシュ統計取得エラー:', error);
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: 0,
        totalKeys: 0,
        memoryUsage: 'Error',
      };
    }
  }

  /**
   * キャッシュ統計をリセット
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Redisの健全性チェック
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number; error?: string }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;
      
      return { status: 'healthy', latency };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * キーの一覧を取得（デバッグ用）
   */
  async listKeys(pattern: string = 'x-bookmarker:*'): Promise<string[]> {
    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      console.error('キー一覧取得エラー:', error);
      return [];
    }
  }

  /**
   * キーの詳細情報を取得（デバッグ用）
   */
  async getKeyInfo(key: string): Promise<{ value: any; ttl: number; type: string } | null> {
    try {
      const [value, ttl, type] = await Promise.all([
        this.redis.get(key),
        this.redis.ttl(key),
        this.redis.type(key),
      ]);

      if (value === null) return null;

      return {
        value: JSON.parse(value),
        ttl,
        type,
      };
    } catch (error) {
      console.error(`キー情報取得エラー (${key}):`, error);
      return null;
    }
  }

  /**
   * 全キャッシュをクリア（注意：本番環境では使用禁止）
   */
  async flushAll(): Promise<boolean> {
    try {
      if (config.environment === 'production') {
        throw new Error('本番環境では全キャッシュクリアは禁止されています');
      }
      
      await this.redis.flushdb();
      this.resetStats();
      return true;
    } catch (error) {
      console.error('全キャッシュクリアエラー:', error);
      return false;
    }
  }

  /**
   * 接続を閉じる
   */
  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      console.log('✅ Redis接続を正常に切断しました');
    } catch (error) {
      console.error('❌ Redis切断エラー:', error);
    }
  }
}

// シングルトンインスタンス
let cacheServiceInstance: CacheService | null = null;

/**
 * キャッシュサービスのシングルトンインスタンスを取得
 */
export function getCacheService(): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService();
  }
  return cacheServiceInstance;
}

export { CacheService };
export type { CacheConfig, CacheStats };
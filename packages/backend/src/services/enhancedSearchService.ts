/**
 * 拡張検索サービス
 * Redisキャッシュを統合した高速検索機能
 */

import { Pool } from 'pg';
import { SearchQuery } from '@x-bookmarker/shared';
import { getCacheService } from './cacheService';
import { SearchService, SearchResult, SearchFacets, SearchHistoryEntry } from './searchService';

class EnhancedSearchService extends SearchService {
  private cache = getCacheService();

  constructor(db: Pool) {
    super(db);
  }

  /**
   * キャッシュ統合済みの検索
   */
  async search(
    userId: string,
    query: SearchQuery,
    includeFacets: boolean = true
  ): Promise<SearchResult> {
    // キャッシュから検索結果を試行
    const cachedResult = await this.cache.getSearchResults(userId, { query, includeFacets });
    if (cachedResult) {
      console.log('🚀 検索結果をキャッシュから取得');
      return cachedResult;
    }

    // キャッシュミス：データベースから検索
    console.log('🔍 データベースから検索実行');
    const startTime = Date.now();
    const result = await super.search(userId, query, includeFacets);
    const executionTime = Date.now() - startTime;

    // 結果をキャッシュに保存（実行時間が長い場合は長めにキャッシュ）
    const ttl = executionTime > 1000 ? 1800 : 600; // 1秒以上なら30分、それ以外は10分
    await this.cache.cacheSearchResults(userId, { query, includeFacets }, result);

    console.log(`✅ 検索完了: ${executionTime}ms (キャッシュTTL: ${ttl}s)`);
    return result;
  }

  /**
   * キャッシュ統合済みの検索履歴取得
   */
  async getSearchHistory(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    history: SearchHistoryEntry[];
    totalCount: number;
  }> {
    // オフセットが0の場合のみキャッシュを使用
    if (offset === 0) {
      const cached = await this.cache.getSearchHistory(userId);
      if (cached && cached.length >= limit) {
        console.log('🚀 検索履歴をキャッシュから取得');
        return {
          history: cached.slice(0, limit),
          totalCount: cached.length,
        };
      }
    }

    // データベースから取得
    const result = await super.getSearchHistory(userId, limit, offset);

    // 最初のページの場合はキャッシュに保存
    if (offset === 0) {
      await this.cache.cacheSearchHistory(userId, result.history);
    }

    return result;
  }

  /**
   * 検索履歴保存（キャッシュクリア付き）
   */
  async saveToHistory(
    userId: string,
    query: SearchQuery,
    resultCount: number,
    executionTime: number
  ): Promise<string> {
    const historyId = await super.saveToHistory(userId, query, resultCount, executionTime);
    
    // 検索履歴キャッシュをクリア
    await this.cache.clearSearchCache(userId);
    
    return historyId;
  }

  /**
   * 検索履歴削除（キャッシュクリア付き）
   */
  async deleteSearchHistoryEntry(userId: string, historyId: string): Promise<boolean> {
    const result = await super.deleteSearchHistoryEntry(userId, historyId);
    
    if (result) {
      // 検索履歴キャッシュをクリア
      await this.cache.clearSearchCache(userId);
    }
    
    return result;
  }

  /**
   * 検索履歴全削除（キャッシュクリア付き）
   */
  async clearSearchHistory(userId: string): Promise<number> {
    const result = await super.clearSearchHistory(userId);
    
    if (result > 0) {
      // 検索履歴キャッシュをクリア
      await this.cache.clearSearchCache(userId);
    }
    
    return result;
  }

  /**
   * 検索提案のキャッシュ統合
   */
  async getSearchSuggestions(
    userId: string,
    queryText: string,
    limit: number = 10
  ): Promise<{
    tags: string[];
    authors: string[];
    categories: string[];
  }> {
    // 短いクエリや一般的でないクエリはキャッシュしない
    if (queryText.length < 2) {
      return super.getSearchSuggestions(userId, queryText, limit);
    }

    const cacheKey = `suggestions:${userId}:${queryText.toLowerCase()}:${limit}`;
    const cached = await this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await super.getSearchSuggestions(userId, queryText, limit);
    
    // 5分間キャッシュ
    await this.cache.set(cacheKey, result, 300);
    
    return result;
  }

  /**
   * 検索分析のキャッシュ統合
   */
  async getSearchAnalytics(
    userId: string,
    days: number = 30
  ): Promise<{
    totalSearches: number;
    avgExecutionTime: number;
    mostSearchedTerms: { query: string; count: number }[];
    searchTrends: { date: string; count: number }[];
  }> {
    const cacheKey = `analytics:${userId}:${days}`;
    const cached = await this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const result = await super.getSearchAnalytics(userId, days);
    
    // 1時間キャッシュ
    await this.cache.set(cacheKey, result, 3600);
    
    return result;
  }

  /**
   * 検索キャッシュの手動無効化
   */
  async invalidateSearchCache(userId?: string): Promise<number> {
    return await this.cache.clearSearchCache(userId);
  }

  /**
   * ウォームアップ：よく使われる検索クエリを事前にキャッシュ
   */
  async warmupCache(userId: string): Promise<void> {
    console.log(`🔥 検索キャッシュのウォームアップ開始: ユーザー ${userId}`);
    
    const commonQueries: SearchQuery[] = [
      // 最新ブックマーク
      {
        text: '',
        limit: 20,
        offset: 0,
        sortBy: 'date',
        sortOrder: 'desc',
      },
      // カテゴリ別（主要カテゴリ）
      {
        text: '',
        categoryIds: [], // 実際の運用では主要カテゴリIDを指定
        limit: 20,
        offset: 0,
        sortBy: 'date',
        sortOrder: 'desc',
      },
      // よく使われるタグ
      {
        text: '',
        tags: ['tech', 'AI'], // 実際の運用では人気タグを指定
        limit: 20,
        offset: 0,
        sortBy: 'date',
        sortOrder: 'desc',
      },
    ];

    for (const query of commonQueries) {
      try {
        await this.search(userId, query, true);
        console.log('✅ ウォームアップクエリ完了');
      } catch (error) {
        console.warn('⚠️ ウォームアップクエリ失敗:', error);
      }
    }

    console.log('🎯 検索キャッシュのウォームアップ完了');
  }

  /**
   * キャッシュパフォーマンス統計
   */
  async getCachePerformanceStats(): Promise<{
    cacheStats: any;
    recommendations: string[];
  }> {
    const stats = await this.cache.getStats();
    const recommendations: string[] = [];

    // キャッシュヒット率に基づく推奨事項
    if (stats.hitRate < 30) {
      recommendations.push('キャッシュヒット率が低すぎます。TTLの調整を検討してください。');
    } else if (stats.hitRate > 90) {
      recommendations.push('キャッシュヒット率が非常に高いです。TTLを延長できるかもしれません。');
    }

    // キー数に基づく推奨事項
    if (stats.totalKeys > 10000) {
      recommendations.push('キャッシュキー数が多すぎます。古いキーの削除を検討してください。');
    }

    return {
      cacheStats: stats,
      recommendations,
    };
  }
}

export { EnhancedSearchService };
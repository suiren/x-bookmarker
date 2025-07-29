/**
 * パフォーマンス最適化ミドルウェア
 * レスポンス圧縮、ETag、キャッシュヘッダー、データ転送効率化
 */

import { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import crypto from 'crypto';
import { getCacheService } from '../services/cacheService';

interface PerformanceMetrics {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  responseSize: number;
  cached: boolean;
  compressed: boolean;
  clientIp: string;
  userAgent: string;
  timestamp: Date;
}

class PerformanceMiddleware {
  private cache = getCacheService();
  private metrics: PerformanceMetrics[] = [];
  private maxMetricsSize = 1000; // 最大保持メトリクス数

  /**
   * レスポンス圧縮ミドルウェア
   */
  compressionMiddleware() {
    return compression({
      // 圧縮レベル（1-9、6がデフォルト）
      level: 6,
      // 最小サイズ（これより小さいレスポンスは圧縮しない）
      threshold: 1024,
      // 圧縮するMIMEタイプ
      filter: (req, res) => {
        // 既に圧縮されているファイルは除外
        if (req.headers['x-no-compression']) {
          return false;
        }

        const contentType = res.getHeader('content-type') as string;
        if (!contentType) return false;

        // 圧縮対象のMIMEタイプ
        const compressibleTypes = [
          'text/',
          'application/json',
          'application/javascript',
          'application/xml',
          'application/rss+xml',
          'application/atom+xml',
          'image/svg+xml',
        ];

        return compressibleTypes.some(type => contentType.includes(type));
      },
    });
  }

  /**
   * ETagミドルウェア（弱いETag）
   */
  etagMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const originalSend = res.send;
      
      res.send = function(data: any) {
        // レスポンスデータからETagを生成
        if (data && res.statusCode === 200) {
          const etag = generateWeakETag(data);
          res.setHeader('ETag', etag);

          // If-None-Matchヘッダーをチェック
          const ifNoneMatch = req.headers['if-none-match'];
          if (ifNoneMatch === etag) {
            res.status(304);
            return originalSend.call(this, '');
          }
        }

        return originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * キャッシュヘッダーミドルウェア
   */
  cacheHeadersMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // ルートに基づいてキャッシュ戦略を設定
      const path = req.path;
      
      if (path.includes('/api/')) {
        // APIエンドポイント
        if (req.method === 'GET') {
          if (path.includes('/bookmarks') || path.includes('/search')) {
            // ブックマークと検索結果は短期キャッシュ
            res.setHeader('Cache-Control', 'private, max-age=300'); // 5分
          } else if (path.includes('/categories')) {
            // カテゴリは中期キャッシュ
            res.setHeader('Cache-Control', 'private, max-age=1800'); // 30分
          } else if (path.includes('/user')) {
            // ユーザー情報は長期キャッシュ
            res.setHeader('Cache-Control', 'private, max-age=3600'); // 1時間
          } else {
            // その他のGETリクエスト
            res.setHeader('Cache-Control', 'private, max-age=600'); // 10分
          }
        } else {
          // POST/PUT/DELETE等は基本的にキャッシュしない
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      } else {
        // 静的ファイル
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24時間
      }

      next();
    };
  }

  /**
   * レスポンス時間測定ミドルウェア
   */
  responseTimeMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const requestId = crypto.randomUUID();
      
      // リクエストIDをレスポンスヘッダーに追加
      res.setHeader('X-Request-ID', requestId);

      // レスポンス完了時に実行
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        const responseSize = parseInt(res.getHeader('content-length') as string) || 0;
        
        // メトリクスを記録
        this.recordMetrics({
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTime,
          responseSize,
          cached: res.getHeader('X-Cache-Hit') === 'true',
          compressed: res.getHeader('content-encoding') === 'gzip',
          clientIp: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          timestamp: new Date(),
        });

        // 遅いリクエストをログ出力
        if (responseTime > 1000) {
          console.warn(`🐌 スローリクエスト: ${req.method} ${req.path} - ${responseTime}ms`);
        }

        // レスポンス時間をヘッダーに追加
        res.setHeader('X-Response-Time', `${responseTime}ms`);
      });

      next();
    };
  }

  /**
   * APIレスポンス最適化ミドルウェア
   */
  apiOptimizationMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const originalJson = res.json;
      
      res.json = function(data: any) {
        // 不要なフィールドを除去
        const optimizedData = optimizeResponseData(data, req.path);
        
        // レスポンス最適化ヘッダー
        res.setHeader('X-Optimized', 'true');
        
        return originalJson.call(this, optimizedData);
      };

      next();
    };
  }

  /**
   * 条件付きリクエストミドルウェア（Last-Modified対応）
   */
  conditionalRequestMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      // GETリクエストのみ対象
      if (req.method !== 'GET') {
        return next();
      }

      const path = req.path;
      const userId = (req as any).user?.id;

      if (!userId || !path.includes('/api/')) {
        return next();
      }

      try {
        // ユーザーの最終更新時刻をキャッシュから取得
        const lastModifiedKey = `last-modified:${userId}:${path}`;
        const cachedLastModified = await this.cache.get(lastModifiedKey);

        if (cachedLastModified) {
          const lastModified = new Date(cachedLastModified);
          res.setHeader('Last-Modified', lastModified.toUTCString());

          // If-Modified-Sinceをチェック
          const ifModifiedSince = req.headers['if-modified-since'];
          if (ifModifiedSince) {
            const modifiedSince = new Date(ifModifiedSince);
            if (lastModified <= modifiedSince) {
              return res.status(304).send();
            }
          }
        }

        // レスポンス送信時に最終更新時刻を更新
        const originalSend = res.send;
        res.send = function(data: any) {
          if (res.statusCode === 200) {
            const now = new Date();
            res.setHeader('Last-Modified', now.toUTCString());
            // キャッシュに保存（1時間）
            (async () => {
              await getCacheService().set(lastModifiedKey, now.toISOString(), 3600);
            })();
          }

          return originalSend.call(this, data);
        };

      } catch (error) {
        console.warn('条件付きリクエスト処理エラー:', error);
      }

      next();
    };
  }

  /**
   * セキュリティヘッダーミドルウェア
   */
  securityHeadersMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // XSS保護
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      
      // HTTPS強制（本番環境）
      if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }

      // Content-Security-Policy
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.twitter.com"
      );

      next();
    };
  }

  /**
   * パフォーマンスメトリクスを記録
   */
  private recordMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);

    // メトリクス数が上限を超えた場合、古いものを削除
    if (this.metrics.length > this.maxMetricsSize) {
      this.metrics = this.metrics.slice(-this.maxMetricsSize / 2);
    }
  }

  /**
   * パフォーマンス統計を取得
   */
  getPerformanceStats(): {
    totalRequests: number;
    averageResponseTime: number;
    slowRequests: number;
    cacheHitRate: number;
    compressionRate: number;
    topSlowEndpoints: { path: string; avgTime: number; count: number }[];
  } {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        slowRequests: 0,
        cacheHitRate: 0,
        compressionRate: 0,
        topSlowEndpoints: [],
      };
    }

    const totalRequests = this.metrics.length;
    const averageResponseTime = this.metrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests;
    const slowRequests = this.metrics.filter(m => m.responseTime > 1000).length;
    const cachedRequests = this.metrics.filter(m => m.cached).length;
    const compressedRequests = this.metrics.filter(m => m.compressed).length;

    // エンドポイント別平均時間
    const endpointStats = this.metrics.reduce((acc, m) => {
      const key = m.path;
      if (!acc[key]) {
        acc[key] = { totalTime: 0, count: 0 };
      }
      acc[key].totalTime += m.responseTime;
      acc[key].count++;
      return acc;
    }, {} as Record<string, { totalTime: number; count: number }>);

    const topSlowEndpoints = Object.entries(endpointStats)
      .map(([path, stats]) => ({
        path,
        avgTime: Math.round(stats.totalTime / stats.count),
        count: stats.count,
      }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);

    return {
      totalRequests,
      averageResponseTime: Math.round(averageResponseTime),
      slowRequests,
      cacheHitRate: Math.round((cachedRequests / totalRequests) * 100),
      compressionRate: Math.round((compressedRequests / totalRequests) * 100),
      topSlowEndpoints,
    };
  }

  /**
   * メトリクスをクリア
   */
  clearMetrics(): void {
    this.metrics = [];
  }
}

/**
 * 弱いETagを生成
 */
function generateWeakETag(data: any): string {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  const hash = crypto.createHash('md5').update(content).digest('hex');
  return `W/"${hash}"`;
}

/**
 * レスポンスデータを最適化
 */
function optimizeResponseData(data: any, path: string): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // ブックマーク一覧の場合
  if (path.includes('/bookmarks') && Array.isArray(data)) {
    return data.map(bookmark => ({
      id: bookmark.id,
      content: bookmark.content?.slice(0, 200), // 内容を200文字に制限
      authorUsername: bookmark.authorUsername,
      authorDisplayName: bookmark.authorDisplayName,
      mediaUrls: bookmark.mediaUrls?.slice(0, 3), // メディアURLを3つに制限
      categoryId: bookmark.categoryId,
      tags: bookmark.tags?.slice(0, 5), // タグを5つに制限
      bookmarkedAt: bookmark.bookmarkedAt,
      // 不要なフィールドを除外
    }));
  }

  // 検索結果の場合
  if (path.includes('/search') && data.bookmarks) {
    return {
      ...data,
      bookmarks: data.bookmarks.map((bookmark: any) => ({
        id: bookmark.id,
        content: bookmark.content?.slice(0, 150), // 検索結果は短めに
        authorUsername: bookmark.authorUsername,
        categoryId: bookmark.categoryId,
        tags: bookmark.tags?.slice(0, 3),
        bookmarkedAt: bookmark.bookmarkedAt,
        relevanceScore: bookmark.relevanceScore,
      })),
    };
  }

  return data;
}

// シングルトンインスタンス
const performanceMiddleware = new PerformanceMiddleware();

export { performanceMiddleware, PerformanceMiddleware };
export type { PerformanceMetrics };
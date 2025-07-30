/**
 * パフォーマンス監視APIエンドポイント
 * 統合的なパフォーマンスダッシュボード機能
 */

import { Router, Request, Response } from 'express';
import { getDatabaseManager } from '../database/optimizedConnection';
import { getCacheService } from '../services/cacheService';
import { getQueueManager } from '../queue/optimizedQueue';
import { performanceMiddleware } from '../middleware/performance';

const router = Router();

/**
 * 統合パフォーマンスダッシュボード
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const dbManager = getDatabaseManager();
    const cacheService = getCacheService();
    const queueManager = getQueueManager();

    // 並列でメトリクスを取得
    const [
      dbMetrics,
      dbHealth,
      dbStats,
      queryStats,
      slowQueries,
      cacheStats,
      cacheHealth,
      queueMetrics,
      apiMetrics,
    ] = await Promise.all([
      dbManager.getPerformanceMetrics(),
      dbManager.healthCheck(),
      dbManager.getDatabaseStats(),
      dbManager.getQueryStats(),
      dbManager.getSlowQueryReport(10),
      cacheService.getStats(),
      cacheService.healthCheck(),
      queueManager.getPerformanceMetrics(),
      performanceMiddleware.getPerformanceStats(),
    ]);

    // 全体的な健全性スコアを計算
    const healthScore = calculateOverallHealthScore({
      database: dbHealth.status,
      cache: cacheHealth.status,
      api: apiMetrics.averageResponseTime < 1000 ? 'healthy' : 'degraded',
    });

    const dashboard = {
      timestamp: new Date().toISOString(),
      healthScore,
      overview: {
        status: healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'degraded' : 'unhealthy',
        totalRequests: apiMetrics.totalRequests,
        averageResponseTime: apiMetrics.averageResponseTime,
        uptime: Math.floor(process.uptime()),
        memoryUsage: process.memoryUsage(),
      },
      database: {
        metrics: dbMetrics,
        health: dbHealth,
        queryStats,
        slowQueries: slowQueries.slice(0, 5), // トップ5のみ
        connectionStats: dbStats.connections,
      },
      cache: {
        stats: cacheStats,
        health: cacheHealth,
        recommendations: getCacheRecommendations(cacheStats),
      },
      queues: {
        metrics: queueMetrics,
        summary: calculateQueueSummary(queueMetrics),
      },
      api: {
        metrics: apiMetrics,
        topSlowEndpoints: apiMetrics.topSlowEndpoints.slice(0, 5),
      },
    };

    res.json(dashboard);
  } catch (error) {
    console.error('パフォーマンスダッシュボード取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * データベースパフォーマンス詳細
 */
router.get('/database', async (req: Request, res: Response) => {
  try {
    const dbManager = getDatabaseManager();
    
    const [metrics, health, stats, queryStats, slowQueries] = await Promise.all([
      dbManager.getPerformanceMetrics(),
      dbManager.healthCheck(),
      dbManager.getDatabaseStats(),
      dbManager.getQueryStats(),
      dbManager.getSlowQueryReport(20),
    ]);

    res.json({
      metrics,
      health,
      stats,
      queryStats,
      slowQueries,
      recommendations: getDatabaseRecommendations(metrics, queryStats),
    });
  } catch (error) {
    console.error('データベースメトリクス取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * キャッシュパフォーマンス詳細
 */
router.get('/cache', async (req: Request, res: Response) => {
  try {
    const cacheService = getCacheService();
    
    const [stats, health] = await Promise.all([
      cacheService.getStats(),
      cacheService.healthCheck(),
    ]);

    // キー分析（デバッグ用）
    const keys = await cacheService.listKeys();
    const keyAnalysis = analyzeKeys(keys);

    res.json({
      stats,
      health,
      keyAnalysis,
      recommendations: getCacheRecommendations(stats),
    });
  } catch (error) {
    console.error('キャッシュメトリクス取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * キューパフォーマンス詳細
 */
router.get('/queues', async (req: Request, res: Response) => {
  try {
    const queueManager = getQueueManager();
    const metrics = await queueManager.getPerformanceMetrics();

    // 各キューの詳細統計を取得
    const queueDetails: Record<string, any> = {};
    for (const queueName of Object.keys(metrics)) {
      queueDetails[queueName] = await queueManager.getQueueStats(queueName);
    }

    res.json({
      metrics,
      queueDetails,
      summary: calculateQueueSummary(metrics),
      recommendations: getQueueRecommendations(metrics),
    });
  } catch (error) {
    console.error('キューメトリクス取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * APIパフォーマンス詳細
 */
router.get('/api', async (req: Request, res: Response) => {
  try {
    const metrics = performanceMiddleware.getPerformanceStats();

    res.json({
      metrics,
      recommendations: getAPIRecommendations(metrics),
    });
  } catch (error) {
    console.error('APIメトリクス取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * システム全体の健全性チェック
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const dbManager = getDatabaseManager();
    const cacheService = getCacheService();

    const [dbHealth, cacheHealth] = await Promise.all([
      dbManager.healthCheck(),
      cacheService.healthCheck(),
    ]);

    const healthScore = calculateOverallHealthScore({
      database: dbHealth.status,
      cache: cacheHealth.status,
      api: 'healthy', // 簡易判定
    });

    const overall = healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'degraded' : 'unhealthy';

    res.status(overall === 'healthy' ? 200 : overall === 'degraded' ? 206 : 503).json({
      status: overall,
      score: healthScore,
      checks: {
        database: dbHealth,
        cache: cacheHealth,
        memory: getMemoryStatus(),
        uptime: Math.floor(process.uptime()),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('ヘルスチェックエラー:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * パフォーマンス最適化提案
 */
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const dbManager = getDatabaseManager();
    const cacheService = getCacheService();
    const queueManager = getQueueManager();

    const [
      dbMetrics,
      queryStats,
      cacheStats,
      queueMetrics,
      apiMetrics,
    ] = await Promise.all([
      dbManager.getPerformanceMetrics(),
      dbManager.getQueryStats(),
      cacheService.getStats(),
      queueManager.getPerformanceMetrics(),
      performanceMiddleware.getPerformanceStats(),
    ]);

    const recommendations = {
      database: getDatabaseRecommendations(dbMetrics, queryStats),
      cache: getCacheRecommendations(cacheStats),
      queues: getQueueRecommendations(queueMetrics),
      api: getAPIRecommendations(apiMetrics),
      priority: getPriorityRecommendations({
        database: dbMetrics,
        queryStats,
        cache: cacheStats,
        queues: queueMetrics,
        api: apiMetrics,
      }),
    };

    res.json(recommendations);
  } catch (error) {
    console.error('推奨事項取得エラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * メトリクスリセット（開発用）
 */
router.post('/reset', async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Not allowed in production' });
    }

    const cacheService = getCacheService();
    
    // キャッシュ統計をリセット
    cacheService.resetStats();
    
    // API統計をリセット
    performanceMiddleware.clearMetrics();

    res.json({ message: 'メトリクスをリセットしました' });
  } catch (error) {
    console.error('メトリクスリセットエラー:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== ヘルパー関数 =====

function calculateOverallHealthScore(components: Record<string, string>): number {
  let score = 0;
  let totalComponents = 0;

  for (const [component, status] of Object.entries(components)) {
    totalComponents++;
    switch (status) {
      case 'healthy':
        score += 100;
        break;
      case 'degraded':
        score += 60;
        break;
      case 'unhealthy':
        score += 20;
        break;
    }
  }

  return totalComponents > 0 ? Math.round(score / totalComponents) : 0;
}

function getDatabaseRecommendations(metrics: any, queryStats: any): string[] {
  const recommendations: string[] = [];

  if (queryStats.averageQueryTime > 500) {
    recommendations.push('平均クエリ時間が高いです。インデックスの最適化を検討してください。');
  }

  if (queryStats.slowQueryCount > 10) {
    recommendations.push('スロークエリが多数検出されています。クエリの最適化が必要です。');
  }

  if (metrics.activeConnections / metrics.totalConnections > 0.9) {
    recommendations.push('接続プールの使用率が高いです。接続数の増加を検討してください。');
  }

  if (queryStats.errorRate > 5) {
    recommendations.push('クエリエラー率が高いです。エラーの原因を調査してください。');
  }

  return recommendations;
}

function getCacheRecommendations(stats: any): string[] {
  const recommendations: string[] = [];

  if (stats.hitRate < 70) {
    recommendations.push('キャッシュヒット率が低いです。TTLの調整やキャッシュキーの見直しを検討してください。');
  }

  if (stats.totalKeys > 50000) {
    recommendations.push('キャッシュキー数が多すぎます。定期的なクリーンアップを検討してください。');
  }

  if (stats.hitRate > 95) {
    recommendations.push('キャッシュヒット率が非常に高いです。TTLを延長できる可能性があります。');
  }

  return recommendations;
}

function getQueueRecommendations(metrics: Record<string, any>): string[] {
  const recommendations: string[] = [];

  for (const [queueName, queueMetrics] of Object.entries(metrics)) {
    if ((queueMetrics as any).avgProcessingTime > 10000) {
      recommendations.push(`${queueName}キューの処理時間が長いです。バッチサイズの調整を検討してください。`);
    }

    if ((queueMetrics as any).failedJobs > (queueMetrics as any).completedJobs * 0.1) {
      recommendations.push(`${queueName}キューの失敗率が高いです。エラーハンドリングの改善が必要です。`);
    }
  }

  return recommendations;
}

function getAPIRecommendations(metrics: any): string[] {
  const recommendations: string[] = [];

  if (metrics.averageResponseTime > 1000) {
    recommendations.push('API平均レスポンス時間が長いです。最適化が必要です。');
  }

  if (metrics.slowRequests / metrics.totalRequests > 0.1) {
    recommendations.push('スロークエリの割合が高いです。パフォーマンスの改善を検討してください。');
  }

  if (metrics.compressionRate < 80) {
    recommendations.push('レスポンス圧縮率が低いです。圧縮設定を確認してください。');
  }

  return recommendations;
}

function getPriorityRecommendations(data: any): Array<{ priority: 'critical' | 'high' | 'medium'; message: string }> {
  const recommendations: Array<{ priority: 'critical' | 'high' | 'medium'; message: string }> = [];

  // クリティカルな問題
  if (data.api.averageResponseTime > 3000) {
    recommendations.push({
      priority: 'critical',
      message: 'APIレスポンス時間が3秒を超えています。緊急対応が必要です。'
    });
  }

  if (data.queryStats.errorRate > 10) {
    recommendations.push({
      priority: 'critical',
      message: 'データベースエラー率が10%を超えています。至急調査が必要です。'
    });
  }

  // 高優先度の問題
  if (data.cache.hitRate < 50) {
    recommendations.push({
      priority: 'high',
      message: 'キャッシュヒット率が50%を下回っています。キャッシュ戦略の見直しが必要です。'
    });
  }

  if (data.queryStats.slowQueryCount > 20) {
    recommendations.push({
      priority: 'high',
      message: '多数のスロークエリが検出されています。インデックス最適化を優先してください。'
    });
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

function calculateQueueSummary(metrics: Record<string, any>): any {
  let totalJobs = 0;
  let totalCompleted = 0;
  let totalFailed = 0;
  let totalActive = 0;

  for (const queueMetrics of Object.values(metrics)) {
    totalJobs += (queueMetrics as any).totalJobs;
    totalCompleted += (queueMetrics as any).completedJobs;
    totalFailed += (queueMetrics as any).failedJobs;
    totalActive += (queueMetrics as any).activeJobs;
  }

  return {
    totalJobs,
    totalCompleted,
    totalFailed,
    totalActive,
    successRate: totalJobs > 0 ? Math.round((totalCompleted / totalJobs) * 100) : 0,
  };
}

function analyzeKeys(keys: string[]): any {
  const analysis: Record<string, number> = {};
  
  for (const key of keys) {
    const namespace = key.split(':')[1] || 'unknown';
    analysis[namespace] = (analysis[namespace] || 0) + 1;
  }

  return {
    totalKeys: keys.length,
    namespaces: analysis,
  };
}

function getMemoryStatus(): any {
  const mem = process.memoryUsage();
  const totalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const usedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const usage = (usedMB / totalMB) * 100;

  return {
    heapUsed: `${usedMB}MB`,
    heapTotal: `${totalMB}MB`,
    usage: `${Math.round(usage)}%`,
    status: usage > 90 ? 'high' : usage > 70 ? 'medium' : 'normal',
  };
}

export { router as performanceRouter };
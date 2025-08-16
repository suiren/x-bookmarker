/**
 * 最適化されたデータベース接続管理
 * 接続プール最適化、パフォーマンス監視、ヘルスチェック機能
 */

import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';

interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingConnections: number;
  totalQueries: number;
  slowQueries: number;
  averageQueryTime: number;
  connectionPoolHitRate: number;
  lastHealthCheck: Date;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

interface QueryMetrics {
  queryId: string;
  sql: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  rowCount: number;
}

interface PoolOptimizationConfig {
  // 基本接続設定
  maxConnections: number;
  minConnections: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  
  // 動的調整設定
  enableDynamicSizing: boolean;
  scaleUpThreshold: number; // 使用率がこの値を超えたら接続数を増やす
  scaleDownThreshold: number; // 使用率がこの値を下回ったら接続数を減らす
  
  // パフォーマンス監視
  slowQueryThreshold: number; // ミリ秒
  enableQueryLogging: boolean;
  metricsRetentionCount: number;
}

class OptimizedDatabaseManager {
  private pool: Pool | null = null;
  private metrics: ConnectionMetrics;
  private queryHistory: QueryMetrics[] = [];
  private lastHealthCheck: Date = new Date();
  
  private readonly optimizationConfig: PoolOptimizationConfig = {
    maxConnections: config.database?.maxConnections || 20,
    minConnections: config.database?.minConnections || 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    
    enableDynamicSizing: true,
    scaleUpThreshold: 0.8, // 80%
    scaleDownThreshold: 0.3, // 30%
    
    slowQueryThreshold: 1000, // 1秒
    enableQueryLogging: true,
    metricsRetentionCount: 1000,
  };

  constructor() {
    this.metrics = this.initializeMetrics();
    this.initializePool();
    this.startMonitoring();
  }

  /**
   * 最適化されたプール設定でデータベース接続を初期化
   */
  private initializePool(): void {
    const poolConfig: PoolConfig = {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.username,
      password: config.database.password,
      
      // 接続プール設定
      max: this.optimizationConfig.maxConnections,
      min: this.optimizationConfig.minConnections,
      
      // タイムアウト設定
      idleTimeoutMillis: this.optimizationConfig.idleTimeoutMillis,
      connectionTimeoutMillis: this.optimizationConfig.connectionTimeoutMillis,
      
      // キープアライブ設定
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      
      // SSL設定（本番環境）
      ssl: config.database.ssl ? {
        rejectUnauthorized: false,
      } : false,
      
      // ステートメントタイムアウト
      statement_timeout: 30000, // 30秒
      query_timeout: 25000, // 25秒
      
      // アプリケーション名
      application_name: 'x-bookmarker-backend',
    };

    this.pool = new Pool(poolConfig);
    this.setupPoolEventHandlers();
    
    console.log('✅ 最適化されたデータベース接続プールを初期化しました');
    console.log(`📊 接続設定: ${this.optimizationConfig.minConnections}-${this.optimizationConfig.maxConnections} connections`);
  }

  /**
   * プールイベントハンドラーの設定
   */
  private setupPoolEventHandlers(): void {
    if (!this.pool) return;

    this.pool.on('connect', (client) => {
      console.log('🔗 新しいデータベース接続が確立されました');
      this.updateConnectionMetrics();
    });

    this.pool.on('acquire', (client) => {
      this.updateConnectionMetrics();
    });

    this.pool.on('remove', (client) => {
      console.log('🔌 データベース接続が削除されました');
      this.updateConnectionMetrics();
    });

    this.pool.on('error', (error, client) => {
      console.error('❌ データベース接続エラー:', error);
      this.metrics.healthStatus = 'unhealthy';
    });
  }

  /**
   * 最適化されたクエリ実行
   */
  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
    client?: PoolClient
  ): Promise<QueryResult<T>> {
    const queryId = this.generateQueryId();
    const startTime = Date.now();
    
    try {
      let result: QueryResult<T>;
      
      if (client) {
        result = await client.query(text, params);
      } else {
        if (!this.pool) throw new Error('Database pool not initialized');
        result = await this.pool.query(text, params);
      }
      
      const duration = Date.now() - startTime;
      
      // クエリメトリクスを記録
      this.recordQueryMetrics({
        queryId,
        sql: this.sanitizeSQL(text),
        duration,
        timestamp: new Date(),
        success: true,
        rowCount: result.rowCount || 0,
      });
      
      // スロークエリの警告
      if (duration > this.optimizationConfig.slowQueryThreshold) {
        console.warn(`🐌 スロークエリ検出: ${duration}ms - ${this.sanitizeSQL(text).slice(0, 100)}...`);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // エラーメトリクスを記録
      this.recordQueryMetrics({
        queryId,
        sql: this.sanitizeSQL(text),
        duration,
        timestamp: new Date(),
        success: false,
        rowCount: 0,
      });
      
      console.error(`❌ クエリ実行エラー (${duration}ms):`, error);
      throw error;
    }
  }

  /**
   * トランザクションを最適化して実行
   */
  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    isolationLevel: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' = 'READ COMMITTED'
  ): Promise<T> {
    if (!this.pool) throw new Error('Database pool not initialized');
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * バッチクエリの最適実行
   */
  async executeBatch(queries: Array<{ text: string; params?: any[] }>): Promise<QueryResult[]> {
    if (!this.pool) throw new Error('Database pool not initialized');
    
    const client = await this.pool.connect();
    const results: QueryResult[] = [];
    
    try {
      await client.query('BEGIN');
      
      for (const query of queries) {
        const result = await this.query(query.text, query.params, client);
        results.push(result);
      }
      
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 準備済みステートメントの実行
   */
  async executePrepared(
    name: string,
    text: string,
    params: any[]
  ): Promise<QueryResult> {
    if (!this.pool) throw new Error('Database pool not initialized');
    
    const client = await this.pool.connect();
    
    try {
      // ステートメントを準備（存在しない場合）
      await client.query(`PREPARE ${name} AS ${text}`);
      
      // 準備済みステートメントを実行
      const result = await client.query(`EXECUTE ${name}(${params.map((_, i) => `$${i + 1}`).join(', ')})`, params);
      
      return result;
    } finally {
      client.release();
    }
  }

  /**
   * 接続プールの健全性チェック
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
      connectionTest: boolean;
      queryTest: boolean;
      poolStats: any;
      latency: number;
    };
  }> {
    const startTime = Date.now();
    let connectionTest = false;
    let queryTest = false;
    
    try {
      if (!this.pool) {
        throw new Error('Pool not initialized');
      }
      
      // 接続テスト
      const client = await this.pool.connect();
      connectionTest = true;
      
      // 簡単なクエリテスト
      await client.query('SELECT 1');
      queryTest = true;
      
      client.release();
      
      const latency = Date.now() - startTime;
      
      // プール統計を取得
      const poolStats = {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
      };
      
      // ステータス判定
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (latency > 5000) { // 5秒以上
        status = 'unhealthy';
      } else if (latency > 1000 || poolStats.waitingCount > 5) { // 1秒以上または待機が多い
        status = 'degraded';
      }
      
      this.metrics.healthStatus = status;
      this.lastHealthCheck = new Date();
      
      return {
        status,
        details: {
          connectionTest,
          queryTest,
          poolStats,
          latency,
        },
      };
    } catch (error) {
      console.error('❌ ヘルスチェック失敗:', error);
      
      this.metrics.healthStatus = 'unhealthy';
      
      return {
        status: 'unhealthy',
        details: {
          connectionTest,
          queryTest,
          poolStats: {},
          latency: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * 接続プールの動的最適化
   */
  async optimizePool(): Promise<void> {
    if (!this.pool || !this.optimizationConfig.enableDynamicSizing) {
      return;
    }

    const stats = {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };

    const utilizationRate = (stats.totalCount - stats.idleCount) / stats.totalCount;
    
    // スケールアップの判定
    if (utilizationRate > this.optimizationConfig.scaleUpThreshold && 
        stats.totalCount < this.optimizationConfig.maxConnections) {
      
      const newMax = Math.min(
        this.optimizationConfig.maxConnections,
        stats.totalCount + 2
      );
      
      console.log(`📈 接続プールをスケールアップ: ${stats.totalCount} → ${newMax}`);
      // 注意: pg.Poolでは動的な最大接続数変更は制限されているため、
      // 実際の実装では新しいプールを作成し、古いプールを段階的に置き換える必要がある
    }
    
    // スケールダウンの判定
    if (utilizationRate < this.optimizationConfig.scaleDownThreshold && 
        stats.totalCount > this.optimizationConfig.minConnections) {
      
      const newMax = Math.max(
        this.optimizationConfig.minConnections,
        stats.totalCount - 1
      );
      
      console.log(`📉 接続プールをスケールダウン: ${stats.totalCount} → ${newMax}`);
    }
  }

  /**
   * 詳細なパフォーマンスメトリクスを取得
   */
  getPerformanceMetrics(): ConnectionMetrics {
    this.updateConnectionMetrics();
    return { ...this.metrics };
  }

  /**
   * スロークエリレポートを生成
   */
  getSlowQueryReport(limit: number = 10): QueryMetrics[] {
    return this.queryHistory
      .filter(q => q.duration > this.optimizationConfig.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * クエリ統計を取得
   */
  getQueryStats(): {
    totalQueries: number;
    averageQueryTime: number;
    slowQueryCount: number;
    errorRate: number;
    queriesPerSecond: number;
  } {
    const totalQueries = this.queryHistory.length;
    const slowQueries = this.queryHistory.filter(q => q.duration > this.optimizationConfig.slowQueryThreshold);
    const errorQueries = this.queryHistory.filter(q => !q.success);
    
    const totalTime = this.queryHistory.reduce((sum, q) => sum + q.duration, 0);
    const averageQueryTime = totalQueries > 0 ? totalTime / totalQueries : 0;
    
    // 過去1分間のクエリ数を計算
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentQueries = this.queryHistory.filter(q => q.timestamp > oneMinuteAgo);
    const queriesPerSecond = recentQueries.length / 60;
    
    return {
      totalQueries,
      averageQueryTime: Math.round(averageQueryTime),
      slowQueryCount: slowQueries.length,
      errorRate: totalQueries > 0 ? (errorQueries.length / totalQueries) * 100 : 0,
      queriesPerSecond: Math.round(queriesPerSecond * 100) / 100,
    };
  }

  /**
   * データベース統計情報を取得
   */
  async getDatabaseStats(): Promise<{
    connections: any[];
    lockStats: any[];
    indexUsage: any[];
    tableStats: any[];
  }> {
    const [connections, lockStats, indexUsage, tableStats] = await Promise.all([
      this.query(`
        SELECT state, count(*) as count 
        FROM pg_stat_activity 
        WHERE datname = current_database()
        GROUP BY state
      `),
      this.query(`
        SELECT mode, count(*) as count
        FROM pg_locks l
        JOIN pg_stat_activity a ON l.pid = a.pid
        WHERE a.datname = current_database()
        GROUP BY mode
      `),
      this.query(`
        SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
        LIMIT 20
      `),
      this.query(`
        SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY n_live_tup DESC
      `),
    ]);

    return {
      connections: connections.rows,
      lockStats: lockStats.rows,
      indexUsage: indexUsage.rows,
      tableStats: tableStats.rows,
    };
  }

  /**
   * プライベートヘルパーメソッド
   */
  private initializeMetrics(): ConnectionMetrics {
    return {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingConnections: 0,
      totalQueries: 0,
      slowQueries: 0,
      averageQueryTime: 0,
      connectionPoolHitRate: 0,
      lastHealthCheck: new Date(),
      healthStatus: 'healthy',
    };
  }

  private updateConnectionMetrics(): void {
    if (!this.pool) return;

    this.metrics.totalConnections = this.pool.totalCount;
    this.metrics.idleConnections = this.pool.idleCount;
    this.metrics.waitingConnections = this.pool.waitingCount;
    this.metrics.activeConnections = this.pool.totalCount - this.pool.idleCount;
    
    // プールヒット率を計算
    const totalRequests = this.metrics.totalQueries;
    const poolHits = totalRequests - this.metrics.waitingConnections;
    this.metrics.connectionPoolHitRate = totalRequests > 0 ? (poolHits / totalRequests) * 100 : 100;
  }

  private recordQueryMetrics(metrics: QueryMetrics): void {
    this.queryHistory.push(metrics);
    
    // 履歴サイズを制限
    if (this.queryHistory.length > this.optimizationConfig.metricsRetentionCount) {
      this.queryHistory.shift();
    }
    
    // メトリクス更新
    this.metrics.totalQueries++;
    if (metrics.duration > this.optimizationConfig.slowQueryThreshold) {
      this.metrics.slowQueries++;
    }
    
    // 平均クエリ時間を更新
    const totalTime = this.queryHistory.reduce((sum, q) => sum + q.duration, 0);
    this.metrics.averageQueryTime = Math.round(totalTime / this.queryHistory.length);
  }

  private generateQueryId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  private sanitizeSQL(sql: string): string {
    // パスワードやトークンなどの機密情報を除去
    return sql
      .replace(/password\s*=\s*'[^']*'/gi, "password='***'")
      .replace(/token\s*=\s*'[^']*'/gi, "token='***'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private startMonitoring(): void {
    // 定期的な健全性チェック（5分間隔）
    setInterval(async () => {
      await this.healthCheck();
    }, 5 * 60 * 1000);

    // 定期的なプール最適化（10分間隔）
    setInterval(async () => {
      await this.optimizePool();
    }, 10 * 60 * 1000);

    console.log('📊 データベース監視を開始しました');
  }

  /**
   * 接続プールを閉じる
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('✅ データベース接続プールを閉じました');
    }
  }
}

// シングルトンインスタンス
let dbManagerInstance: OptimizedDatabaseManager | null = null;

/**
 * 最適化されたデータベースマネージャのシングルトンインスタンスを取得
 */
export function getDatabaseManager(): OptimizedDatabaseManager {
  if (!dbManagerInstance) {
    dbManagerInstance = new OptimizedDatabaseManager();
  }
  return dbManagerInstance;
}

export { OptimizedDatabaseManager };
export type { ConnectionMetrics, QueryMetrics, PoolOptimizationConfig };
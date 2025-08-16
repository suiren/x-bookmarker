#!/usr/bin/env tsx

/**
 * ヘルスチェックスクリプト
 * 
 * OOPベストプラクティス:
 * - Command Pattern でヘルスチェック操作をカプセル化
 * - Observer Pattern で結果通知
 * - Composite Pattern で複数チェックの組み合わせ
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import { config } from '../config';

/**
 * ヘルスチェック結果のインターフェース
 */
interface HealthStatus {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  responseTime?: number;
  metadata?: Record<string, any>;
}

/**
 * ヘルスチェック全体の結果
 */
interface OverallHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: HealthStatus[];
  timestamp: string;
  uptime: number;
}

/**
 * ヘルスチェックコマンドの抽象クラス
 */
abstract class HealthCheckCommand {
  abstract execute(): Promise<HealthStatus>;
  
  protected measureTime<T>(operation: () => Promise<T>): Promise<{ result: T; time: number }> {
    const start = Date.now();
    return operation().then(result => ({
      result,
      time: Date.now() - start
    }));
  }
}

/**
 * データベースヘルスチェック
 */
class DatabaseHealthCheck extends HealthCheckCommand {
  private pool: Pool | null = null;

  async execute(): Promise<HealthStatus> {
    try {
      const { result, time } = await this.measureTime(async () => {
        this.pool = new Pool({
          connectionString: config.database.host ? 
            `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/${config.database.name}` :
            process.env.DATABASE_URL,
          connectionTimeoutMillis: 5000,
        });

        const result = await this.pool.query('SELECT version(), now() as current_time');
        const poolInfo = {
          totalConnections: this.pool.totalCount,
          idleConnections: this.pool.idleCount,
          waitingClients: this.pool.waitingCount,
        };

        return { dbVersion: result.rows[0], poolInfo };
      });

      return {
        service: 'database',
        status: 'healthy',
        message: 'データベース接続正常',
        responseTime: time,
        metadata: {
          version: result.dbVersion.version,
          currentTime: result.dbVersion.current_time,
          connectionPool: result.poolInfo,
        },
      };
    } catch (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        message: `データベース接続エラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    } finally {
      if (this.pool) {
        await this.pool.end();
      }
    }
  }
}

/**
 * Redisヘルスチェック
 */
class RedisHealthCheck extends HealthCheckCommand {
  private redis: Redis | null = null;

  async execute(): Promise<HealthStatus> {
    try {
      const { result, time } = await this.measureTime(async () => {
        this.redis = new Redis({
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          connectTimeout: 5000,
          lazyConnect: true,
        });

        await this.redis.connect();
        const ping = await this.redis.ping();
        const info = await this.redis.info('memory');
        
        return { ping, memoryInfo: info };
      });

      return {
        service: 'redis',
        status: 'healthy',
        message: 'Redis接続正常',
        responseTime: time,
        metadata: {
          ping: result.ping,
          memoryInfo: result.memoryInfo.split('\r\n').slice(0, 5), // 主要な情報のみ
        },
      };
    } catch (error) {
      return {
        service: 'redis',
        status: 'unhealthy',
        message: `Redis接続エラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    } finally {
      if (this.redis) {
        this.redis.disconnect();
      }
    }
  }
}

/**
 * 環境変数ヘルスチェック
 */
class EnvironmentHealthCheck extends HealthCheckCommand {
  async execute(): Promise<HealthStatus> {
    const requiredEnvVars = [
      'NODE_ENV',
      'PORT',
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_SECRET',
    ];

    const missingVars: string[] = [];
    const presentVars: string[] = [];

    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        presentVars.push(envVar);
      } else {
        missingVars.push(envVar);
      }
    }

    // JWT秘密鍵の強度チェック
    const jwtSecret = process.env.JWT_SECRET;
    const jwtIssues: string[] = [];
    
    if (jwtSecret) {
      if (jwtSecret.length < 32) {
        jwtIssues.push('JWT秘密鍵が短すぎます（最低32文字）');
      }
      if (jwtSecret === 'your-super-secret-jwt-key-minimum-32-characters') {
        jwtIssues.push('JWT秘密鍵がデフォルト値のままです');
      }
    }

    const status = missingVars.length === 0 && jwtIssues.length === 0 ? 'healthy' : 
                   missingVars.length > 0 ? 'unhealthy' : 'degraded';

    return {
      service: 'environment',
      status,
      message: status === 'healthy' ? '環境変数設定正常' : 
               `環境変数に問題があります: ${missingVars.length}個不足, ${jwtIssues.length}個の設定問題`,
      metadata: {
        present: presentVars,
        missing: missingVars,
        jwtIssues,
        nodeEnv: process.env.NODE_ENV,
      },
    };
  }
}

/**
 * システム情報ヘルスチェック
 */
class SystemHealthCheck extends HealthCheckCommand {
  async execute(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    };

    // メモリ使用量のチェック
    const memoryUsagePercent = (systemInfo.memoryUsage.heapUsed / systemInfo.memoryUsage.heapTotal) * 100;
    const status = memoryUsagePercent > 90 ? 'degraded' : 'healthy';

    return {
      service: 'system',
      status,
      message: status === 'healthy' ? 'システム状態正常' : 'システムリソース使用量が高いです',
      responseTime: Date.now() - startTime,
      metadata: {
        ...systemInfo,
        memoryUsagePercent: Math.round(memoryUsagePercent * 100) / 100,
      },
    };
  }
}

/**
 * 複合ヘルスチェック実行者（Composite Pattern）
 */
class HealthChecker {
  private checks: HealthCheckCommand[] = [];

  addCheck(check: HealthCheckCommand): void {
    this.checks.push(check);
  }

  async executeAll(): Promise<OverallHealth> {
    const results = await Promise.all(
      this.checks.map(check => check.execute())
    );

    // 全体のステータス判定
    const overallStatus = this.determineOverallStatus(results);

    return {
      status: overallStatus,
      checks: results,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  private determineOverallStatus(results: HealthStatus[]): 'healthy' | 'unhealthy' | 'degraded' {
    const hasUnhealthy = results.some(r => r.status === 'unhealthy');
    const hasDegraded = results.some(r => r.status === 'degraded');

    if (hasUnhealthy) return 'unhealthy';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }
}

/**
 * ヘルスチェック結果表示クラス
 */
class HealthReporter {
  static displayResults(health: OverallHealth): void {
    console.log('\n🏥 ヘルスチェック結果\n');

    // 全体ステータス
    const statusIcon = health.status === 'healthy' ? '✅' : 
                      health.status === 'degraded' ? '⚠️' : '❌';
    console.log(`${statusIcon} 全体ステータス: ${health.status.toUpperCase()}`);
    console.log(`⏰ 検査時刻: ${health.timestamp}`);
    console.log(`🕐 アップタイム: ${Math.round(health.uptime)}秒\n`);

    // 各サービスの詳細
    health.checks.forEach(check => {
      const icon = check.status === 'healthy' ? '✅' : 
                   check.status === 'degraded' ? '⚠️' : '❌';
      
      console.log(`${icon} ${check.service.toUpperCase()}: ${check.message}`);
      
      if (check.responseTime) {
        console.log(`   応答時間: ${check.responseTime}ms`);
      }

      if (check.metadata) {
        Object.entries(check.metadata).forEach(([key, value]) => {
          if (typeof value === 'object') {
            console.log(`   ${key}: ${JSON.stringify(value, null, 2).slice(0, 100)}...`);
          } else {
            console.log(`   ${key}: ${value}`);
          }
        });
      }
      console.log('');
    });

    // 終了コード設定
    if (health.status === 'unhealthy') {
      process.exit(1);
    }
  }
}

/**
 * メイン実行関数
 */
async function main() {
  const command = process.argv[2] || 'all';

  const checker = new HealthChecker();

  // コマンドに応じてチェック項目を追加
  switch (command) {
    case 'db':
    case 'database':
      checker.addCheck(new DatabaseHealthCheck());
      break;

    case 'redis':
      checker.addCheck(new RedisHealthCheck());
      break;

    case 'env':
    case 'environment':
      checker.addCheck(new EnvironmentHealthCheck());
      break;

    case 'system':
      checker.addCheck(new SystemHealthCheck());
      break;

    case 'all':
    default:
      checker.addCheck(new DatabaseHealthCheck());
      checker.addCheck(new RedisHealthCheck());
      checker.addCheck(new EnvironmentHealthCheck());
      checker.addCheck(new SystemHealthCheck());
      break;
  }

  try {
    const results = await checker.executeAll();
    HealthReporter.displayResults(results);
  } catch (error) {
    console.error('❌ ヘルスチェック実行エラー:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// スクリプトが直接実行された場合のみ実行
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 予期しないエラー:', error);
    process.exit(1);
  });
}

export { main, HealthChecker, HealthReporter };
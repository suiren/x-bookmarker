/**
 * 開発環境セットアップユーティリティ
 * 
 * OOPベストプラクティス:
 * - シングルトンパターンで環境設定管理
 * - Factory Pattern でサービス初期化
 * - Strategy Pattern で異なる環境対応
 * - Dependency Injection による疎結合
 */

import { existsSync, copyFileSync } from 'fs';
import { Pool } from 'pg';
import Redis from 'ioredis';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';

/**
 * 環境セットアップの結果
 */
interface SetupResult {
  success: boolean;
  message: string;
  details?: string[];
  errors?: string[];
}

/**
 * 環境チェック項目のインターフェース
 */
interface HealthCheckItem {
  name: string;
  check: () => Promise<boolean>;
  critical: boolean;
}

/**
 * 環境セットアップ戦略の抽象クラス
 */
abstract class EnvironmentStrategy {
  abstract setup(): Promise<SetupResult>;
  abstract validate(): Promise<SetupResult>;
}

/**
 * 開発環境用セットアップ戦略
 */
class DevelopmentEnvironmentStrategy extends EnvironmentStrategy {
  
  async setup(): Promise<SetupResult> {
    const steps: string[] = [];
    const errors: string[] = [];

    try {
      // 1. .envファイル作成
      const envResult = await this.createEnvironmentFile();
      if (envResult.success) {
        steps.push(envResult.message);
      } else {
        errors.push(envResult.message);
      }

      // 2. JWT秘密鍵生成
      const jwtResult = await this.generateJwtSecret();
      if (jwtResult.success) {
        steps.push(jwtResult.message);
      } else {
        errors.push(jwtResult.message);
      }

      return {
        success: errors.length === 0,
        message: `開発環境セットアップ${errors.length === 0 ? '完了' : '一部失敗'}`,
        details: steps,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: '開発環境セットアップ中にエラーが発生しました',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  async validate(): Promise<SetupResult> {
    const checks: HealthCheckItem[] = [
      {
        name: '環境変数ファイル存在確認',
        check: () => Promise.resolve(existsSync('.env')),
        critical: true,
      },
      {
        name: 'データベース接続確認',
        check: () => this.checkDatabaseConnection(),
        critical: true,
      },
      {
        name: 'Redis接続確認',
        check: () => this.checkRedisConnection(),
        critical: true,
      },
      {
        name: 'JWT設定確認',
        check: () => Promise.resolve(!!process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32),
        critical: true,
      },
    ];

    const results: string[] = [];
    const errors: string[] = [];

    for (const check of checks) {
      try {
        const result = await check.check();
        if (result) {
          results.push(`✅ ${check.name}: OK`);
        } else {
          const message = `❌ ${check.name}: FAILED`;
          if (check.critical) {
            errors.push(message);
          } else {
            results.push(message);
          }
        }
      } catch (error) {
        const message = `❌ ${check.name}: ERROR - ${error instanceof Error ? error.message : 'Unknown'}`;
        if (check.critical) {
          errors.push(message);
        } else {
          results.push(message);
        }
      }
    }

    return {
      success: errors.length === 0,
      message: `環境検証${errors.length === 0 ? '完了' : '失敗'}`,
      details: results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private async createEnvironmentFile(): Promise<SetupResult> {
    const envPath = '.env';
    const examplePath = '.env.example';

    if (existsSync(envPath)) {
      return {
        success: true,
        message: '.envファイルは既に存在します',
      };
    }

    if (!existsSync(examplePath)) {
      return {
        success: false,
        message: '.env.exampleファイルが見つかりません',
      };
    }

    try {
      copyFileSync(examplePath, envPath);
      return {
        success: true,
        message: '.envファイルを.env.exampleから作成しました',
      };
    } catch (error) {
      return {
        success: false,
        message: `.envファイルの作成に失敗: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async generateJwtSecret(): Promise<SetupResult> {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET !== 'your-super-secret-jwt-key-minimum-32-characters') {
      return {
        success: true,
        message: 'JWT秘密鍵は既に設定されています',
      };
    }

    const secret = crypto.randomBytes(64).toString('hex');
    console.log(`🔑 生成されたJWT秘密鍵: ${secret}`);
    console.log('💡 この秘密鍵を.envファイルのJWT_SECRETに設定してください');

    return {
      success: true,
      message: 'JWT秘密鍵を生成しました（コンソールログを確認してください）',
    };
  }

  private async checkDatabaseConnection(): Promise<boolean> {
    let client: Pool | null = null;
    try {
      client = new Pool({
        connectionString: config.database.host ? 
          `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/${config.database.name}` :
          process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
      });
      
      const result = await client.query('SELECT 1');
      return result.rows.length > 0;
    } catch (error) {
      console.error('Database connection check failed:', error);
      return false;
    } finally {
      if (client) {
        await client.end();
      }
    }
  }

  private async checkRedisConnection(): Promise<boolean> {
    let redis: Redis | null = null;
    try {
      redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        connectTimeout: 5000,
        lazyConnect: true,
      });
      
      await redis.connect();
      const result = await redis.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis connection check failed:', error);
      return false;
    } finally {
      if (redis) {
        redis.disconnect();
      }
    }
  }
}

/**
 * 本番環境用セットアップ戦略
 */
class ProductionEnvironmentStrategy extends EnvironmentStrategy {
  
  async setup(): Promise<SetupResult> {
    return {
      success: false,
      message: '本番環境では自動セットアップは実行できません',
      errors: ['本番環境設定は手動で行ってください'],
    };
  }

  async validate(): Promise<SetupResult> {
    // 本番環境用の厳格なバリデーション
    const checks: HealthCheckItem[] = [
      {
        name: 'JWT秘密鍵強度確認',
        check: () => Promise.resolve(
          !!process.env.JWT_SECRET && 
          process.env.JWT_SECRET.length >= 64 &&
          process.env.JWT_SECRET !== 'your-super-secret-jwt-key-minimum-32-characters'
        ),
        critical: true,
      },
      {
        name: 'HTTPS設定確認',
        check: () => Promise.resolve(!!process.env.HTTPS_ENABLED),
        critical: true,
      },
      {
        name: 'X OAuth設定確認',
        check: () => Promise.resolve(
          !!process.env.X_CLIENT_ID && 
          !!process.env.X_CLIENT_SECRET &&
          process.env.X_CLIENT_ID !== 'your_x_client_id_here'
        ),
        critical: true,
      },
    ];

    const results: string[] = [];
    const errors: string[] = [];

    for (const check of checks) {
      try {
        const result = await check.check();
        if (result) {
          results.push(`✅ ${check.name}: OK`);
        } else {
          errors.push(`❌ ${check.name}: FAILED`);
        }
      } catch (error) {
        errors.push(`❌ ${check.name}: ERROR - ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    return {
      success: errors.length === 0,
      message: `本番環境検証${errors.length === 0 ? '完了' : '失敗'}`,
      details: results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

/**
 * 環境セットアップマネージャー（シングルトン）
 */
class EnvironmentSetupManager {
  private static instance: EnvironmentSetupManager;
  private strategy: EnvironmentStrategy;

  private constructor() {
    this.strategy = this.createStrategy();
  }

  public static getInstance(): EnvironmentSetupManager {
    if (!EnvironmentSetupManager.instance) {
      EnvironmentSetupManager.instance = new EnvironmentSetupManager();
    }
    return EnvironmentSetupManager.instance;
  }

  /**
   * Factory Method: 環境に応じた戦略を作成
   */
  private createStrategy(): EnvironmentStrategy {
    const environment = process.env.NODE_ENV || 'development';
    
    switch (environment) {
      case 'production':
        return new ProductionEnvironmentStrategy();
      case 'development':
      case 'test':
      default:
        return new DevelopmentEnvironmentStrategy();
    }
  }

  /**
   * 環境セットアップ実行
   */
  public async setup(): Promise<SetupResult> {
    console.log('🚀 環境セットアップを開始します...');
    const result = await this.strategy.setup();
    
    if (result.success) {
      console.log('✅ 環境セットアップが完了しました');
      if (result.details) {
        result.details.forEach(detail => console.log(`  ${detail}`));
      }
    } else {
      console.error('❌ 環境セットアップに失敗しました');
      if (result.errors) {
        result.errors.forEach(error => console.error(`  ${error}`));
      }
    }

    return result;
  }

  /**
   * 環境検証実行
   */
  public async validate(): Promise<SetupResult> {
    console.log('🔍 環境検証を開始します...');
    const result = await this.strategy.validate();
    
    if (result.success) {
      console.log('✅ 環境検証が完了しました');
    } else {
      console.error('❌ 環境検証に失敗しました');
    }

    if (result.details) {
      result.details.forEach(detail => console.log(`  ${detail}`));
    }

    if (result.errors) {
      result.errors.forEach(error => console.error(`  ${error}`));
    }

    return result;
  }

  /**
   * フルセットアップ（セットアップ + 検証）
   */
  public async fullSetup(): Promise<SetupResult> {
    const setupResult = await this.setup();
    
    if (!setupResult.success) {
      return setupResult;
    }

    // セットアップ後に検証実行
    const validateResult = await this.validate();
    
    return {
      success: setupResult.success && validateResult.success,
      message: `フルセットアップ${setupResult.success && validateResult.success ? '完了' : '失敗'}`,
      details: [...(setupResult.details || []), ...(validateResult.details || [])],
      errors: [...(setupResult.errors || []), ...(validateResult.errors || [])],
    };
  }
}

// Singleton instance export
export const environmentSetup = EnvironmentSetupManager.getInstance();

// 型エクスポート
export type { SetupResult, HealthCheckItem };
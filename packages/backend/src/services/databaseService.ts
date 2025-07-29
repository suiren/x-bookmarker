import { Pool, PoolClient, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

export class DatabaseService {
  private static instance: Pool;
  private static config: PoolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'x_bookmarker',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_SIZE || '10'),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  public static getInstance(): Pool {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new Pool(DatabaseService.config);
      
      DatabaseService.instance.on('connect', (client: PoolClient) => {
        logger.info('新しいデータベース接続が確立されました');
      });

      DatabaseService.instance.on('error', (error: Error) => {
        logger.error('データベース接続エラー', { error: error.message });
      });
    }

    return DatabaseService.instance;
  }

  public static async testConnection(): Promise<boolean> {
    try {
      const pool = DatabaseService.getInstance();
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('データベース接続テストが成功しました');
      return true;
    } catch (error) {
      logger.error('データベース接続テストが失敗しました', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public static async close(): Promise<void> {
    if (DatabaseService.instance) {
      await DatabaseService.instance.end();
      logger.info('データベース接続プールを閉じました');
    }
  }
}
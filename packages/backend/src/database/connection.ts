/**
 * データベース接続管理
 * 
 * このファイルでは、PostgreSQLへの接続管理を行います。
 * コネクションプールを使用することで、効率的なデータベース接続を実現します。
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';

/**
 * グローバルコネクションプール
 * アプリケーション全体で単一のプールインスタンスを使用
 */
let pool: Pool | null = null;

/**
 * データベース接続プールの初期化
 * 
 * 💡 コネクションプールのメリット:
 * - 接続の再利用により、接続コストを削減
 * - 同時接続数の制限により、データベースへの負荷を制御
 * - 自動的な接続の健全性チェック
 */
export function initializeDatabase(): Pool {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    
    // コネクションプール設定
    min: 2,                    // 最小接続数
    max: 20,                   // 最大接続数
    idleTimeoutMillis: 30000,  // アイドル接続のタイムアウト (30秒)
    connectionTimeoutMillis: 2000, // 接続取得のタイムアウト (2秒)
    
    // SSL設定 (本番環境では必須)
    ssl: config.env === 'production' ? { rejectUnauthorized: false } : false,
  });

  // プールイベントのログ記録
  pool.on('connect', () => {
    console.log('✅ データベースに接続しました');
  });

  pool.on('error', (err) => {
    console.error('❌ データベース接続エラー:', err);
    // プールを再初期化
    pool = null;
  });

  return pool;
}

/**
 * データベース接続プールの取得
 */
export function getPool(): Pool {
  if (!pool) {
    return initializeDatabase();
  }
  return pool;
}

/**
 * データベース接続の終了
 * アプリケーション終了時に呼び出し
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('🔌 データベース接続を終了しました');
  }
}

/**
 * クエリ実行のヘルパー関数
 * 
 * @param text - SQL文
 * @param params - パラメータ配列
 * @returns クエリ結果
 */
export async function query<T = any>(
  text: string, 
  params?: any[]
): Promise<QueryResult<T>> {
  const client = getPool();
  
  try {
    const start = Date.now();
    const result = await client.query<T>(text, params);
    const duration = Date.now() - start;
    
    // 遅いクエリをログ出力 (100ms以上)
    if (duration > 100) {
      console.warn(`⚠️ 遅いクエリ (${duration}ms):`, text);
    }
    
    return result;
  } catch (error) {
    console.error('❌ クエリ実行エラー:', error);
    console.error('SQL:', text);
    console.error('Params:', params);
    throw error;
  }
}

/**
 * トランザクション実行のヘルパー関数
 * 
 * 💡 トランザクションとは:
 * 複数のデータベース操作をひとまとまりとして実行し、
 * 全て成功した場合のみコミット、一つでも失敗した場合は全てロールバックする仕組み
 * 
 * @param callback - トランザクション内で実行する処理
 * @returns コールバック関数の戻り値
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  
  try {
    await client.query('BEGIN');
    console.log('🔄 トランザクション開始');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    console.log('✅ トランザクションコミット');
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.log('❌ トランザクションロールバック');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * データベース接続テスト
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW() as current_time');
    console.log('✅ データベース接続テスト成功:', result.rows[0].current_time);
    return true;
  } catch (error) {
    console.error('❌ データベース接続テスト失敗:', error);
    return false;
  }
}
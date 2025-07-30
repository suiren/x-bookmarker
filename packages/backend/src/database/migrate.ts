/**
 * データベースマイグレーション管理システム
 * 
 * 💡 マイグレーションとは:
 * データベーススキーマの変更を段階的に管理するシステム
 * - バージョン管理されたSQL文の実行
 * - 実行済みマイグレーションの記録
 * - 失敗時の自動ロールバック
 */

import fs from 'fs/promises';
import path from 'path';
import { getPool, withTransaction, query } from './connection';

interface MigrationResult {
  success: boolean;
  migrationsRun: number;
  error?: string;
}

interface MigrationStatus {
  filename: string;
  applied_at: Date;
}

/**
 * マイグレーション管理テーブルの作成
 * 
 * 💡 このテーブルで実行済みマイグレーションを追跡します
 */
const createMigrationsTable = async (): Promise<void> => {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  console.log('📊 マイグレーション管理テーブルを確認しました');
};

/**
 * 適用済みマイグレーション一覧の取得
 */
const getAppliedMigrations = async (): Promise<string[]> => {
  const result = await query<{ filename: string }>(
    'SELECT filename FROM migrations ORDER BY applied_at'
  );
  return result.rows.map(row => row.filename);
};

/**
 * マイグレーションファイル一覧の取得
 * 
 * 💡 ファイル名の数字順にソートして順序実行を保証
 */
const getMigrationFiles = async (): Promise<string[]> => {
  const migrationsDir = path.join(__dirname, 'migrations');
  try {
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(file => file.endsWith('.sql')).sort();
    console.log(`📁 ${sqlFiles.length}個のマイグレーションファイルを発見:`, sqlFiles);
    return sqlFiles;
  } catch (error) {
    console.error('❌ マイグレーションディレクトリの読み込みに失敗:', error);
    throw error;
  }
};

/**
 * 単一マイグレーションの実行
 * 
 * 💡 トランザクションを使用して、失敗時の自動ロールバックを実現
 * 
 * @param filename - 実行するマイグレーションファイル名
 */
const runMigration = async (filename: string): Promise<void> => {
  const migrationPath = path.join(__dirname, 'migrations', filename);
  
  try {
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');
    console.log(`🚀 マイグレーション実行中: ${filename}`);
    
    await withTransaction(async (client) => {
      // マイグレーションSQL実行
      await client.query(migrationSQL);
      
      // 実行記録を保存
      await client.query(
        'INSERT INTO migrations (filename) VALUES ($1)', 
        [filename]
      );
    });
    
    console.log(`✅ マイグレーション完了: ${filename}`);
  } catch (error) {
    console.error(`❌ マイグレーション失敗: ${filename}`, error);
    throw error;
  }
};

/**
 * メインマイグレーション実行関数
 * 
 * 💡 実行手順:
 * 1. マイグレーション管理テーブル作成
 * 2. 適用済みマイグレーション確認
 * 3. 未実行マイグレーションの特定
 * 4. 順次実行
 */
export const migrate = async (): Promise<MigrationResult> => {
  console.log('🚀 データベースマイグレーションを開始します...');
  
  try {
    // 1. マイグレーション管理テーブル作成
    await createMigrationsTable();

    // 2. 現在の状態確認
    const appliedMigrations = await getAppliedMigrations();
    const allMigrationFiles = await getMigrationFiles();

    // 3. 未実行マイグレーションの特定
    const pendingMigrations = allMigrationFiles.filter(
      file => !appliedMigrations.includes(file)
    );

    console.log(`📊 マイグレーション状況:`);
    console.log(`  - 全ファイル数: ${allMigrationFiles.length}`);
    console.log(`  - 適用済み: ${appliedMigrations.length}`);
    console.log(`  - 未実行: ${pendingMigrations.length}`);

    if (pendingMigrations.length === 0) {
      console.log('✨ 全てのマイグレーションが適用済みです');
      return { success: true, migrationsRun: 0 };
    }

    // 4. 順次実行
    console.log(`🎯 ${pendingMigrations.length}個のマイグレーションを実行します:`);
    for (const migration of pendingMigrations) {
      await runMigration(migration);
    }

    console.log(`🎉 ${pendingMigrations.length}個のマイグレーションが正常に完了しました！`);
    return {
      success: true,
      migrationsRun: pendingMigrations.length,
    };
  } catch (error) {
    console.error('❌ マイグレーション実行中にエラーが発生しました:', error);
    return {
      success: false,
      migrationsRun: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * マイグレーション状況の取得
 */
export const getMigrationStatus = async (): Promise<MigrationStatus[]> => {
  await createMigrationsTable();
  const result = await query<MigrationStatus>(
    'SELECT filename, applied_at FROM migrations ORDER BY applied_at'
  );
  return result.rows;
};

/**
 * マイグレーションのロールバック（テスト用）
 * 
 * ⚠️ 注意: データが失われる可能性があります
 * 
 * @param steps - ロールバックするステップ数
 */
export const rollback = async (steps: number = 1): Promise<void> => {
  console.log(`⚠️ ${steps}個のマイグレーションをロールバックします...`);
  
  const result = await query<{ filename: string }>(
    'SELECT filename FROM migrations ORDER BY applied_at DESC LIMIT $1',
    [steps]
  );

  await withTransaction(async (client) => {
    for (const row of result.rows) {
      await client.query('DELETE FROM migrations WHERE filename = $1', [
        row.filename,
      ]);
      console.log(`🔄 ロールバック完了: ${row.filename}`);
    }
  });
  
  console.log(`✅ ${result.rows.length}個のマイグレーションをロールバックしました`);
};

/**
 * CLI実行時のエントリーポイント
 * 
 * 💡 使用方法:
 * npm run db:migrate または tsx src/database/migrate.ts
 */
if (require.main === module) {
  migrate()
    .then(result => {
      if (result.success) {
        console.log('🎉 マイグレーションが正常に完了しました！');
        process.exit(0);
      } else {
        console.error('❌ マイグレーション失敗:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ マイグレーション実行エラー:', error);
      process.exit(1);
    })
    .finally(() => {
      // データベース接続のクリーンアップ
      import('./connection').then(({ closeDatabase }) => {
        closeDatabase().catch(console.error);
      });
    });
}

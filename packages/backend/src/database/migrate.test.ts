/**
 * データベースマイグレーション統合テスト
 * 
 * 💡 統合テストとは:
 * 実際のデータベースを使用して、システム全体の動作を検証するテスト
 * - 実際のSQL実行
 * - データベース状態の変更確認
 * - エラーハンドリング検証
 */

import { query, getPool, closeDatabase, testConnection } from './connection';
import { migrate, rollback, getMigrationStatus } from './migrate';
import { seedDatabase } from './seed';

describe('Database Migration Integration Tests', () => {
  beforeAll(async () => {
    console.log('🚀 統合テスト開始: データベース接続テスト');
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('テスト用データベースに接続できません');
    }
  });

  afterAll(async () => {
    console.log('🔌 統合テスト終了: データベース接続クリーンアップ');
    await closeDatabase();
  });

  beforeEach(async () => {
    console.log('🧹 テスト前クリーンアップ: スキーマリセット');
    
    // 各テスト前にスキーマをクリーンアップ
    try {
      await query('DROP SCHEMA IF EXISTS public CASCADE');
      await query('CREATE SCHEMA public');
      await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      console.log('✅ スキーマリセット完了');
    } catch (error) {
      console.error('❌ スキーマリセット失敗:', error);
      throw error;
    }
  });

  describe('migrate function', () => {
    test('should run all migrations successfully', async () => {
      console.log('🧪 テスト: 全マイグレーション実行');
      
      const result = await migrate();
      
      expect(result.success).toBe(true);
      expect(result.migrationsRun).toBeGreaterThan(0);
      console.log(`✅ ${result.migrationsRun}個のマイグレーションが実行されました`);
    }, 30000); // 30秒タイムアウト

    test('should create all required tables', async () => {
      console.log('🧪 テスト: 必要なテーブル作成確認');
      
      await migrate();

      const tables = await query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);

      const tableNames = tables.rows.map(row => row.table_name);
      const expectedTables = ['users', 'categories', 'tags', 'bookmarks', 'sync_jobs', 'search_history'];
      
      console.log('📋 作成されたテーブル:', tableNames);
      
      for (const expectedTable of expectedTables) {
        expect(tableNames).toContain(expectedTable);
      }
      
      console.log('✅ 全ての必要なテーブルが作成されました');
    }, 30000);

    test('should create migration status table', async () => {
      console.log('🧪 テスト: マイグレーション管理テーブル作成確認');
      
      await migrate();

      const result = await query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'migrations'
      `);

      expect(result.rows).toHaveLength(1);
      console.log('✅ マイグレーション管理テーブルが作成されました');
    }, 30000);

    test('should not re-run already applied migrations', async () => {
      console.log('🧪 テスト: 重複マイグレーション実行防止');
      
      // 初回実行
      const firstResult = await migrate();
      console.log(`📊 初回実行: ${firstResult.migrationsRun}個のマイグレーション`);
      
      // 2回目実行
      const secondResult = await migrate();
      console.log(`📊 2回目実行: ${secondResult.migrationsRun}個のマイグレーション`);
      
      expect(firstResult.success).toBe(true);
      expect(secondResult.success).toBe(true);
      expect(firstResult.migrationsRun).toBeGreaterThan(0);
      expect(secondResult.migrationsRun).toBe(0); // 2回目は0個
      
      console.log('✅ 重複マイグレーションが正しく防止されました');
    }, 45000);
  });

  describe('getMigrationStatus function', () => {
    test('should return migration status', async () => {
      console.log('🧪 テスト: マイグレーション状況取得');
      
      await migrate();
      const status = await getMigrationStatus();

      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBeGreaterThan(0);
      expect(status[0]).toHaveProperty('filename');
      expect(status[0]).toHaveProperty('applied_at');
      
      console.log(`📊 マイグレーション状況: ${status.length}個のマイグレーションが適用済み`);
      console.log('✅ マイグレーション状況取得テスト完了');
    }, 30000);
  });

  describe('seedDatabase function', () => {
    test('should create default categories when user is created', async () => {
      console.log('🧪 テスト: デフォルトカテゴリ自動作成');
      
      await migrate();

      // テストユーザー作成
      const userResult = await query<{ id: string }>(`
        INSERT INTO users (x_user_id, username, display_name, access_token, refresh_token, token_expires_at)
        VALUES ('test_user_123', 'testuser', 'Test User', 'access_token', 'refresh_token', NOW() + INTERVAL '7 days')
        RETURNING id
      `);

      const userId = userResult.rows[0].id;
      console.log(`👤 テストユーザー作成: ${userId}`);

      // トリガー実行の待機
      await new Promise(resolve => setTimeout(resolve, 100));

      // デフォルトカテゴリ確認
      const categories = await query<{ name: string }>(
        `SELECT name FROM categories WHERE user_id = $1 AND is_default = true`,
        [userId]
      );

      expect(categories.rows).toHaveLength(5);
      const categoryNames = categories.rows.map(row => row.name);
      const expectedCategories = ['技術・AI', '趣味・ゲーム', '料理・レシピ', '読書・書籍', '未分類'];
      
      console.log('📁 作成されたカテゴリ:', categoryNames);
      
      for (const expectedCategory of expectedCategories) {
        expect(categoryNames).toContain(expectedCategory);
      }
      
      console.log('✅ デフォルトカテゴリが正しく作成されました');
    }, 30000);

    test('should run full seed process successfully', async () => {
      console.log('🧪 テスト: フルシード処理');
      
      const result = await seedDatabase();
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('成功');
      
      // 作成されたデータの確認
      const userCount = await query<{ count: string }>('SELECT COUNT(*) FROM users');
      const categoryCount = await query<{ count: string }>('SELECT COUNT(*) FROM categories');
      const bookmarkCount = await query<{ count: string }>('SELECT COUNT(*) FROM bookmarks');
      
      console.log(`📊 作成されたデータ:`);
      console.log(`  - ユーザー: ${userCount.rows[0].count}件`);
      console.log(`  - カテゴリ: ${categoryCount.rows[0].count}件`);
      console.log(`  - ブックマーク: ${bookmarkCount.rows[0].count}件`);
      
      expect(parseInt(userCount.rows[0].count)).toBeGreaterThan(0);
      expect(parseInt(categoryCount.rows[0].count)).toBeGreaterThan(0);
      expect(parseInt(bookmarkCount.rows[0].count)).toBeGreaterThan(0);
      
      console.log('✅ フルシード処理が正常に完了しました');
    }, 45000);
  });
});

import { Pool } from 'pg';
import { migrate, rollback, getMigrationStatus } from './migrate';
import { seedDatabase } from './seed';

describe('Database Migration', () => {
  let pool: Pool;

  beforeAll(async () => {
    // Test database connection
    pool = new Pool({
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      database: process.env.DATABASE_NAME || 'x_bookmarker_test',
      user: process.env.DATABASE_USER || 'x_bookmarker',
      password: process.env.DATABASE_PASSWORD || 'x_bookmarker_dev',
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up before each test
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  });

  describe('migrate function', () => {
    test('should run all migrations successfully', async () => {
      const result = await migrate();
      expect(result.success).toBe(true);
      expect(result.migrationsRun).toBeGreaterThan(0);
    });

    test('should create all required tables', async () => {
      await migrate();

      // Check if all tables exist
      const tables = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);

      const tableNames = tables.rows.map(row => row.table_name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('categories');
      expect(tableNames).toContain('tags');
      expect(tableNames).toContain('bookmarks');
      expect(tableNames).toContain('sync_jobs');
      expect(tableNames).toContain('search_history');
    });

    test('should create migration status table', async () => {
      await migrate();

      const result = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'migrations'
      `);

      expect(result.rows).toHaveLength(1);
    });
  });

  describe('getMigrationStatus function', () => {
    test('should return migration status', async () => {
      await migrate();
      const status = await getMigrationStatus();

      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBeGreaterThan(0);
      expect(status[0]).toHaveProperty('filename');
      expect(status[0]).toHaveProperty('applied_at');
    });
  });

  describe('seedDatabase function', () => {
    test('should create default categories when user is created', async () => {
      await migrate();

      // Create a test user
      const userResult = await pool.query(`
        INSERT INTO users (x_user_id, username, display_name, access_token, refresh_token, token_expires_at)
        VALUES ('test_user_123', 'testuser', 'Test User', 'access_token', 'refresh_token', NOW() + INTERVAL '7 days')
        RETURNING id
      `);

      const userId = userResult.rows[0].id;

      // Check if default categories were created
      const categories = await pool.query(
        `
        SELECT name FROM categories WHERE user_id = $1 AND is_default = true
      `,
        [userId]
      );

      expect(categories.rows).toHaveLength(5);
      const categoryNames = categories.rows.map(row => row.name);
      expect(categoryNames).toContain('技術・AI');
      expect(categoryNames).toContain('趣味・ゲーム');
      expect(categoryNames).toContain('料理・レシピ');
      expect(categoryNames).toContain('読書・書籍');
      expect(categoryNames).toContain('未分類');
    });
  });
});

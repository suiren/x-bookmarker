import { migrate, getMigrationStatus } from './migrate';
import { seedDatabase } from './seed';

// Mock the pg module
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    end: jest.fn(),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
    on: jest.fn(),
  })),
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  readdir: jest.fn(),
  readFile: jest.fn(),
}));

// Mock config module
jest.mock('../config', () => ({
  config: {
    database: {
      host: 'localhost',
      port: 5432,
      name: 'test_db',
      user: 'test_user',
      password: 'test_password',
    },
    env: 'test',
  },
}));

describe('Database Migration (Unit Tests)', () => {
  let mockPool: any;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup pool mock
    mockQuery = jest.fn();
    const mockConnect = jest.fn().mockResolvedValue({
      query: mockQuery,
      release: jest.fn(),
    });
    
    mockPool = {
      query: mockQuery,
      end: jest.fn(),
      connect: mockConnect,
      on: jest.fn(),
    };

    // Mock Pool constructor
    const { Pool } = require('pg');
    (Pool as jest.Mock).mockImplementation(() => mockPool);

    // Mock fs operations
    const fs = require('fs/promises');
    (fs.readdir as jest.Mock).mockResolvedValue([
      '001_create_users.sql',
      '002_create_categories.sql',
      '003_create_tags.sql',
      '004_create_bookmarks.sql',
      '005_create_sync_jobs.sql',
      '006_create_search_history.sql',
      '007_create_default_categories.sql',
    ]);

    (fs.readFile as jest.Mock).mockResolvedValue('CREATE TABLE test_table();');
  });

  describe('migrate function', () => {
    test('should handle successful migration', async () => {
      // Mock successful responses
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE migrations table
        .mockResolvedValueOnce({ rows: [] }) // SELECT applied migrations
        // For each migration: BEGIN, SQL execution, INSERT, COMMIT
        .mockResolvedValue({ rows: [] }); // Default success response

      const result = await migrate();

      expect(result.success).toBe(true);
      expect(result.migrationsRun).toBe(7);
      expect(result.error).toBeUndefined();
    });

    test('should handle migration failure', async () => {
      // Mock failure during migration
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE migrations table
        .mockRejectedValueOnce(new Error('SQL error')); // SELECT applied migrations fails

      const result = await migrate();

      expect(result.success).toBe(false);
      expect(result.migrationsRun).toBe(0);
      expect(result.error).toBe('SQL error');
    });

    test('should skip already applied migrations', async () => {
      // Mock that some migrations are already applied
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE migrations table
        .mockResolvedValueOnce({
          rows: [
            { filename: '001_create_users.sql' },
            { filename: '002_create_categories.sql' },
          ],
        }) // SELECT applied migrations
        .mockResolvedValue({ rows: [] }); // Default success for remaining queries

      const result = await migrate();

      expect(result.success).toBe(true);
      expect(result.migrationsRun).toBe(5); // 7 total - 2 already applied
    });
  });

  describe('getMigrationStatus function', () => {
    test('should return migration status', async () => {
      const mockMigrations = [
        { filename: '001_create_users.sql', applied_at: new Date() },
        { filename: '002_create_categories.sql', applied_at: new Date() },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE migrations table
        .mockResolvedValueOnce({ rows: mockMigrations }); // SELECT migration status

      const status = await getMigrationStatus();

      expect(Array.isArray(status)).toBe(true);
      expect(status).toHaveLength(2);
      expect(status[0]).toHaveProperty('filename');
      expect(status[0]).toHaveProperty('applied_at');
    });
  });

  describe('seedDatabase function', () => {
    test('should handle successful seeding', async () => {
      // Reset mocks for this test
      jest.clearAllMocks();
      mockQuery.mockReset();

      // Mock migration success first
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE migrations table
        .mockResolvedValueOnce({ rows: [] }) // SELECT applied migrations
        .mockResolvedValue({ rows: [] }); // Migration queries

      // Reset for seeding phase
      mockQuery.mockReset();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // checkSeedStatus - no users
        .mockResolvedValueOnce({ rows: [{ id: 'user-123' }] }) // Create demo user
        .mockResolvedValueOnce({
          rows: [
            { id: 'cat-1', name: '技術・AI' },
            { id: 'cat-2', name: '趣味・ゲーム' },
            { id: 'cat-3', name: '料理・レシピ' },
            { id: 'cat-4', name: '読書・書籍' },
            { id: 'cat-5', name: '未分類' },
          ],
        }) // Get categories
        .mockResolvedValue({ rows: [] }); // Create bookmarks

      const result = await seedDatabase();

      expect(result.success).toBe(true);
      expect(result.message).toContain('successfully');
    });

    test('should skip seeding if data already exists', async () => {
      // Reset mocks for this test
      jest.clearAllMocks();
      mockQuery.mockReset();

      // Mock migration success
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE migrations table
        .mockResolvedValueOnce({ rows: [] }) // SELECT applied migrations
        .mockResolvedValue({ rows: [] }); // Migration queries

      // Reset for seeding phase
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] }); // Users exist

      const result = await seedDatabase();

      expect(result.success).toBe(true);
      expect(result.message).toContain('already contains data');
    });
  });
});

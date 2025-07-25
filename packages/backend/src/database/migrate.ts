import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';

interface MigrationResult {
  success: boolean;
  migrationsRun: number;
  error?: string;
}

interface MigrationStatus {
  filename: string;
  applied_at: Date;
}

// Database connection pool
let pool: Pool;

const getPool = (): Pool => {
  if (!pool) {
    pool = new Pool({
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      database: process.env.DATABASE_NAME || 'x_bookmarker',
      user: process.env.DATABASE_USER || 'x_bookmarker',
      password: process.env.DATABASE_PASSWORD || 'x_bookmarker_dev',
      ssl: process.env.DATABASE_SSL === 'true',
      max: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
    });
  }
  return pool;
};

// Create migrations table if it doesn't exist
const createMigrationsTable = async (): Promise<void> => {
  const client = getPool();
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
};

// Get list of applied migrations
const getAppliedMigrations = async (): Promise<string[]> => {
  const client = getPool();
  const result = await client.query(
    'SELECT filename FROM migrations ORDER BY applied_at'
  );
  return result.rows.map(row => row.filename);
};

// Get list of migration files
const getMigrationFiles = async (): Promise<string[]> => {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = await fs.readdir(migrationsDir);
  return files.filter(file => file.endsWith('.sql')).sort();
};

// Run a single migration
const runMigration = async (filename: string): Promise<void> => {
  const client = getPool();
  const migrationPath = path.join(__dirname, 'migrations', filename);
  const migrationSQL = await fs.readFile(migrationPath, 'utf-8');

  await client.query('BEGIN');
  try {
    // Execute migration
    await client.query(migrationSQL);

    // Record migration as applied
    await client.query('INSERT INTO migrations (filename) VALUES ($1)', [
      filename,
    ]);

    await client.query('COMMIT');
    console.log(`✅ Applied migration: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Failed to apply migration: ${filename}`, error);
    throw error;
  }
};

// Main migration function
export const migrate = async (): Promise<MigrationResult> => {
  try {
    await createMigrationsTable();

    const appliedMigrations = await getAppliedMigrations();
    const allMigrationFiles = await getMigrationFiles();

    const pendingMigrations = allMigrationFiles.filter(
      file => !appliedMigrations.includes(file)
    );

    console.log(`📋 Found ${pendingMigrations.length} pending migrations`);

    for (const migration of pendingMigrations) {
      await runMigration(migration);
    }

    console.log(
      `🎉 Successfully applied ${pendingMigrations.length} migrations`
    );

    return {
      success: true,
      migrationsRun: pendingMigrations.length,
    };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return {
      success: false,
      migrationsRun: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Get migration status
export const getMigrationStatus = async (): Promise<MigrationStatus[]> => {
  await createMigrationsTable();
  const client = getPool();
  const result = await client.query(
    'SELECT filename, applied_at FROM migrations ORDER BY applied_at'
  );
  return result.rows;
};

// Rollback function (for testing)
export const rollback = async (steps: number = 1): Promise<void> => {
  const client = getPool();
  const result = await client.query(
    'SELECT filename FROM migrations ORDER BY applied_at DESC LIMIT $1',
    [steps]
  );

  for (const row of result.rows) {
    await client.query('DELETE FROM migrations WHERE filename = $1', [
      row.filename,
    ]);
    console.log(`🔄 Rolled back migration: ${row.filename}`);
  }
};

// Close database connection
export const closeConnection = async (): Promise<void> => {
  if (pool) {
    await pool.end();
  }
};

// CLI runner
if (require.main === module) {
  migrate()
    .then(result => {
      if (result.success) {
        console.log('✅ Migration completed successfully');
        process.exit(0);
      } else {
        console.error('❌ Migration failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Migration error:', error);
      process.exit(1);
    });
}

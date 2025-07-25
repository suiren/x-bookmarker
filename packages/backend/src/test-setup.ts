// Test setup configuration for Jest
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set default test environment variables if not set
process.env.NODE_ENV = 'test';
process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'x_bookmarker_test';
process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
process.env.DATABASE_USER = process.env.DATABASE_USER || 'x_bookmarker';
process.env.DATABASE_PASSWORD =
  process.env.DATABASE_PASSWORD || 'x_bookmarker_dev';

// Increase test timeout for database operations
jest.setTimeout(30000);

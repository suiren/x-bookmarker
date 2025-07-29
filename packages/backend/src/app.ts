import express from 'express';
const cookieParser = require('cookie-parser');
import compression from 'compression';
import { Pool } from 'pg';
import { securityStack, apiSecurityStack } from './middleware/security';
import { apiRateLimit } from './middleware/rateLimit';
import authRoutes, { setDatabase as setAuthDatabase } from './routes/auth';
import syncRoutes from './routes/sync';
import sseRoutes from './routes/sse';
import suggestionsRoutes from './routes/suggestions';
import bookmarkRoutes, {
  setDatabase as setBookmarkDatabase,
} from './routes/bookmarks';
import categoryRoutes, {
  setDatabase as setCategoryDatabase,
} from './routes/categories';
import searchRoutes, {
  setDatabase as setSearchDatabase,
} from './routes/search';

const app = express();

// Database connection
const db = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'x_bookmarker',
  user: process.env.DATABASE_USER || 'x_bookmarker',
  password: process.env.DATABASE_PASSWORD || 'x_bookmarker_dev',
  ssl: process.env.DATABASE_SSL === 'true',
  max: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
});

// Test database connection
db.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Database connected successfully');
  }
});

// Inject dependencies into route handlers
setAuthDatabase(db);
setBookmarkDatabase(db);
setCategoryDatabase(db);
setSearchDatabase(db);

// Trust proxy (for accurate IP addresses behind reverse proxy)
app.set('trust proxy', 1);

// Basic middleware
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware for all routes
app.use(securityStack);

// Health check endpoint (before rate limiting)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
  });
});

// API routes with additional security and rate limiting
app.use('/api', apiSecurityStack);
app.use('/api', apiRateLimit);

// Authentication routes
app.use('/api/auth', authRoutes);

// Sync routes
app.use('/api/sync', syncRoutes);

// Server-Sent Events routes
app.use('/api/sync', sseRoutes);

// Bookmark routes
app.use('/api/bookmarks', bookmarkRoutes);

// Category routes
app.use('/api/categories', categoryRoutes);

// Search routes
app.use('/api/search', searchRoutes);

// Suggestions routes
app.use('/api/suggestions', suggestionsRoutes);

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'X Bookmarker API is running',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    code: 'ENDPOINT_NOT_FOUND',
    path: req.path,
  });
});

// Global error handler
app.use(
  (
    error: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error('❌ Unhandled error:', error);

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    const errorResponse = {
      success: false,
      error: isDevelopment ? error.message : 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(isDevelopment && { stack: error.stack }),
    };

    res.status(error.status || 500).json(errorResponse);
  }
);

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');

  try {
    // Close database connections
    await db.end();
    console.log('✅ Database connections closed');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');

  try {
    // Close database connections
    await db.end();
    console.log('✅ Database connections closed');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

export { app, db };
export default app;

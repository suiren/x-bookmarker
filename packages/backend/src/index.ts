import dotenv from 'dotenv';
import { app } from './app';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

// Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'X_CLIENT_ID',
  'X_CLIENT_SECRET',
  'X_REDIRECT_URI',
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`  - ${varName}`);
  });
  console.error(
    '\nPlease check your .env file and ensure all required variables are set.'
  );
  process.exit(1);
}

// Start server
const server = app.listen(PORT, () => {
  console.log('🚀 X Bookmarker API Server Started');
  console.log(`📍 Server running at: http://${HOST}:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? 'Set' : 'Not set'}`);
  console.log(
    `🐦 X API Client: ${process.env.X_CLIENT_ID ? 'Configured' : 'Not configured'}`
  );
  console.log(
    `📦 Redis URL: ${process.env.REDIS_URL || 'redis://localhost:6379'}`
  );
  console.log(`🗄️  Database: ${process.env.DATABASE_NAME || 'x_bookmarker'}`);
  console.log('');
  console.log('📚 Available endpoints:');
  console.log(`  GET  /health                    - Health check`);
  console.log(`  GET  /api/status                - API status`);
  console.log('');
  console.log('🔐 Authentication:');
  console.log(`  GET  /api/auth/x/oauth          - Start X OAuth flow`);
  console.log(`  GET  /api/auth/x/callback       - X OAuth callback`);
  console.log(`  POST /api/auth/refresh          - Refresh JWT token`);
  console.log(`  POST /api/auth/logout           - Logout user`);
  console.log(`  POST /api/auth/logout-all       - Logout from all devices`);
  console.log(`  GET  /api/auth/me               - Get current user info`);
  console.log('');
  console.log('📖 Bookmarks:');
  console.log(`  GET  /api/bookmarks             - List user bookmarks`);
  console.log(`  GET  /api/bookmarks/:id         - Get single bookmark`);
  console.log(`  POST /api/bookmarks             - Create bookmark`);
  console.log(`  PUT  /api/bookmarks/:id         - Update bookmark`);
  console.log(`  DELETE /api/bookmarks/:id       - Delete bookmark`);
  console.log(`  POST /api/bookmarks/bulk        - Bulk update bookmarks`);
  console.log('');
  console.log('🗂️  Categories:');
  console.log(`  GET  /api/categories            - List user categories`);
  console.log(`  GET  /api/categories/:id        - Get single category`);
  console.log(`  POST /api/categories            - Create category`);
  console.log(`  PUT  /api/categories/:id        - Update category`);
  console.log(`  DELETE /api/categories/:id      - Delete category`);
  console.log(`  PUT  /api/categories/order      - Reorder categories`);
  console.log('');
  console.log('🔄 Sync:');
  console.log(`  POST /api/sync/start            - Start bookmark sync`);
  console.log(`  GET  /api/sync/status/:id       - Get sync job status`);
  console.log('');
});

// Handle server errors
server.on('error', (error: any) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);

  server.close(err => {
    if (err) {
      console.error('❌ Error during server shutdown:', err);
      process.exit(1);
    }

    console.log('✅ Server closed successfully');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

export { server };

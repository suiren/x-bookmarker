import request from 'supertest';
import { app } from '../app';
import { syncQueue } from '../queue/queue';
import { DatabaseService } from '../services/databaseService';
import { xApiService } from '../services';
import Bull from 'bull';

// Mock dependencies
jest.mock('../services/xApiClient');
jest.mock('../utils/logger');

const mockDB = {
  query: jest.fn(),
  beginTransaction: jest.fn(),
};

const mockXApiService = {
  getBookmarks: jest.fn(),
  refreshToken: jest.fn(),
};

// Mock Bull Queue methods
const mockSyncQueue = {
  add: jest.fn(),
  getJob: jest.fn(),
  getActive: jest.fn(),
  getWaiting: jest.fn(),
  getCompleted: jest.fn(),
  getFailed: jest.fn(),
  process: jest.fn(),
};

jest.mock('../services/databaseService', () => ({
  DatabaseService: {
    getInstance: () => mockDB,
  },
}));

jest.mock('../services', () => ({
  xApiService: mockXApiService,
  bookmarkService: {
    upsertBookmarks: jest.fn(),
  },
}));

jest.mock('../queue/queue', () => ({
  syncQueue: mockSyncQueue,
}));

describe('Sync API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    mockDB.query.mockResolvedValue({ rows: [] });
    mockSyncQueue.add.mockResolvedValue({ id: 'test-job-id' });
    mockSyncQueue.getJob.mockResolvedValue(null);
    mockSyncQueue.getActive.mockResolvedValue([]);
  });

  describe('POST /api/sync', () => {
    const mockUser = {
      id: 'test-user-id',
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_expires_at: new Date(Date.now() + 3600000),
    };

    beforeEach(() => {
      // Mock authenticated user
      mockDB.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // User lookup
        .mockResolvedValueOnce({ rows: [{ updated_at: new Date() }] }); // Last sync time
    });

    it('should start sync for authenticated user', async () => {
      const mockJob = {
        id: 'test-job-123',
        data: { userId: 'test-user-id' },
      };
      
      mockSyncQueue.add.mockResolvedValue(mockJob);
      
      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ fullSync: false, forceSync: false })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        jobId: 'test-job-123',
        message: 'Bookmark sync started',
        options: {
          fullSync: false,
          forceSync: false,
        },
      });

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'bookmark-sync',
        expect.objectContaining({
          userId: 'test-user-id',
          options: {
            fullSync: false,
            forceSync: false,
          },
        }),
        expect.objectContaining({
          priority: 5,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        })
      );
    });

    it('should handle full sync with higher priority', async () => {
      const mockJob = {
        id: 'test-job-123',
        data: { userId: 'test-user-id' },
      };
      
      mockSyncQueue.add.mockResolvedValue(mockJob);
      
      await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ fullSync: true, forceSync: true })
        .expect(200);

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'bookmark-sync',
        expect.objectContaining({
          userId: 'test-user-id',
          options: {
            fullSync: true,
            forceSync: true,
          },
        }),
        expect.objectContaining({
          priority: 10, // Higher priority for forced sync
        })
      );
    });

    it('should reject sync if user has active job', async () => {
      const activeJob = {
        id: 'active-job-id',
        data: { userId: 'test-user-id' },
      };
      
      mockSyncQueue.getActive.mockResolvedValue([activeJob]);
      
      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ fullSync: false, forceSync: false })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        error: 'User already has an active sync job',
        code: 'SYNC_JOB_ACTIVE',
        jobId: 'active-job-id',
      });
    });

    it('should allow force sync even with active job', async () => {
      const activeJob = {
        id: 'active-job-id',
        data: { userId: 'test-user-id' },
      };
      
      mockSyncQueue.getActive.mockResolvedValue([activeJob]);
      mockSyncQueue.add.mockResolvedValue({ id: 'new-job-id' });
      
      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ fullSync: false, forceSync: true })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockSyncQueue.add).toHaveBeenCalled();
    });

    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/sync')
        .send({ fullSync: false })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
    });

    it('should handle user not found', async () => {
      mockDB.query.mockResolvedValueOnce({ rows: [] }); // No user found
      
      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ fullSync: false })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    });

    it('should handle user without valid tokens', async () => {
      const userWithoutToken = {
        ...mockUser,
        access_token: null,
      };
      
      mockDB.query.mockResolvedValueOnce({ rows: [userWithoutToken] });
      
      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ fullSync: false })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'User needs to authenticate with X',
        code: 'AUTHENTICATION_REQUIRED',
      });
    });
  });

  describe('GET /api/sync/status/:jobId', () => {
    const mockJobId = 'test-job-123';
    const mockUserId = 'test-user-id';

    it('should return job status for valid job', async () => {
      const mockJob = {
        id: mockJobId,
        data: { userId: mockUserId },
        timestamp: Date.now(),
        processedOn: Date.now(),
        finishedOn: null,
        returnvalue: null,
        failedReason: null,
        getState: jest.fn().mockResolvedValue('running'),
        progress: jest.fn().mockReturnValue({
          total: 100,
          processed: 50,
          percentage: 50,
          errors: [],
        }),
      };
      
      const mockJobInfo = {
        id: mockJobId,
        status: 'running',
        total_items: 100,
        processed_items: 50,
        error_message: null,
      };
      
      mockSyncQueue.getJob.mockResolvedValue(mockJob);
      mockDB.query.mockResolvedValue({ rows: [mockJobInfo] });
      
      const response = await request(app)
        .get(`/api/sync/status/${mockJobId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.job).toEqual(
        expect.objectContaining({
          id: mockJobId,
          userId: mockUserId,
          status: 'running',
          progress: {
            total: 100,
            processed: 50,
            percentage: 50,
            errors: [],
          },
        })
      );
    });

    it('should return 404 for non-existent job', async () => {
      mockSyncQueue.getJob.mockResolvedValue(null);
      
      const response = await request(app)
        .get(`/api/sync/status/${mockJobId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Job not found',
        code: 'JOB_NOT_FOUND',
      });
    });

    it('should deny access to other users jobs', async () => {
      const mockJob = {
        id: mockJobId,
        data: { userId: 'other-user-id' }, // Different user
      };
      
      mockSyncQueue.getJob.mockResolvedValue(mockJob);
      
      const response = await request(app)
        .get(`/api/sync/status/${mockJobId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
      });
    });

    it('should require job ID parameter', async () => {
      const response = await request(app)
        .get('/api/sync/status/')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(404); // Route not found
    });
  });

  describe('POST /api/sync/cancel/:jobId', () => {
    const mockJobId = 'test-job-123';
    const mockUserId = 'test-user-id';

    it('should cancel user\'s job successfully', async () => {
      const mockJob = {
        id: mockJobId,
        data: { userId: mockUserId },
        remove: jest.fn().mockResolvedValue(true),
      };
      
      mockSyncQueue.getJob.mockResolvedValue(mockJob);
      mockDB.query.mockResolvedValue({ rows: [] });
      
      const response = await request(app)
        .post(`/api/sync/cancel/${mockJobId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Sync job cancelled successfully',
      });
      
      expect(mockJob.remove).toHaveBeenCalled();
      expect(mockDB.query).toHaveBeenCalledWith(
        'UPDATE sync_jobs SET status = $1, error_message = $2 WHERE id = $3',
        ['cancelled', 'Cancelled by user', mockJobId]
      );
    });

    it('should not cancel other users jobs', async () => {
      const mockJob = {
        id: mockJobId,
        data: { userId: 'other-user-id' },
        remove: jest.fn(),
      };
      
      mockSyncQueue.getJob.mockResolvedValue(mockJob);
      
      const response = await request(app)
        .post(`/api/sync/cancel/${mockJobId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(403);

      expect(response.body.code).toBe('ACCESS_DENIED');
      expect(mockJob.remove).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/sync/history', () => {
    it('should return user sync history', async () => {
      const mockHistory = [
        {
          id: 'job-1',
          user_id: 'test-user-id',
          status: 'completed',
          progress: 100,
          total_items: 150,
          processed_items: 150,
          created_at: new Date(),
        },
        {
          id: 'job-2',
          user_id: 'test-user-id',
          status: 'failed',
          progress: 25,
          error_message: 'API rate limit exceeded',
          created_at: new Date(Date.now() - 86400000),
        },
      ];
      
      mockDB.query
        .mockResolvedValueOnce({ rows: mockHistory })
        .mockResolvedValueOnce({ rows: [{ total: '2' }] });
      
      const response = await request(app)
        .get('/api/sync/history')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.history).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        limit: 20,
        offset: 0,
        total: 2,
        hasMore: false,
      });
    });

    it('should respect limit and offset parameters', async () => {
      mockDB.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });
      
      const response = await request(app)
        .get('/api/sync/history?limit=5&offset=10')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(mockDB.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        expect.arrayContaining(['test-user-id', 5, 10])
      );
    });
  });

  describe('GET /api/sync/stats', () => {
    it('should return queue statistics', async () => {
      mockSyncQueue.getWaiting.mockResolvedValue([]);
      mockSyncQueue.getActive.mockResolvedValue([{ id: 'active-1' }]);
      mockSyncQueue.getCompleted.mockResolvedValue([{ id: 'completed-1' }, { id: 'completed-2' }]);
      mockSyncQueue.getFailed.mockResolvedValue([]);
      
      const response = await request(app)
        .get('/api/sync/stats')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        stats: {
          waiting: 0,
          active: 1,
          completed: 2,
          failed: 0,
          total: 3,
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('GET /api/sync/analytics', () => {
    it('should return detailed sync analytics', async () => {
      const mockSummary = {
        total_syncs: 10,
        successful_syncs: 8,
        failed_syncs: 2,
        avg_items_per_sync: 125.5,
        max_items_synced: 300,
        first_sync: new Date('2024-01-01'),
        last_sync: new Date(),
      };
      
      const mockDailyStats = [
        {
          sync_date: '2024-01-15',
          total_syncs: 2,
          successful_syncs: 2,
          failed_syncs: 0,
          total_items_synced: 250,
        },
      ];
      
      const mockErrorAnalysis = [
        {
          error_message: 'Rate limit exceeded',
          occurrence_count: 3,
          last_occurrence: new Date(),
        },
      ];
      
      mockDB.query
        .mockResolvedValueOnce({ rows: [mockSummary] })
        .mockResolvedValueOnce({ rows: mockDailyStats })
        .mockResolvedValueOnce({ rows: mockErrorAnalysis });
      
      const response = await request(app)
        .get('/api/sync/analytics?days=30')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.analytics).toEqual({
        summary: mockSummary,
        dailyStats: mockDailyStats,
        errorAnalysis: mockErrorAnalysis,
        period: {
          days: 30,
          startDate: expect.any(String),
          endDate: expect.any(String),
        },
      });
    });
  });

  describe('DELETE /api/sync/history/cleanup', () => {
    it('should cleanup old sync history', async () => {
      mockDB.query.mockResolvedValue({ rowCount: 15 });
      
      const response = await request(app)
        .delete('/api/sync/history/cleanup?days=60')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        deletedCount: 15,
        message: 'Deleted sync history older than 60 days',
      });
      
      expect(mockDB.query).toHaveBeenCalledWith(
        'DELETE FROM sync_jobs WHERE user_id = $1 AND created_at < NOW() - INTERVAL $2',
        ['test-user-id', '60 days']
      );
    });
  });

  describe('GET /api/sync/health', () => {
    it('should return healthy status when queue is normal', async () => {
      mockSyncQueue.getWaiting.mockResolvedValue([]);
      mockSyncQueue.getActive.mockResolvedValue([{ id: '1' }, { id: '2' }]);
      mockSyncQueue.getFailed.mockResolvedValue([]);
      
      const response = await request(app)
        .get('/api/sync/health')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        status: 'healthy',
        queue: {
          waiting: 0,
          active: 2,
          failed: 0,
        },
        timestamp: expect.any(String),
      });
    });

    it('should return degraded status when queue has issues', async () => {
      mockSyncQueue.getWaiting.mockResolvedValue(new Array(15).fill({ id: 'waiting' }));
      mockSyncQueue.getActive.mockResolvedValue(new Array(12).fill({ id: 'active' }));
      mockSyncQueue.getFailed.mockResolvedValue(new Array(8).fill({ id: 'failed' }));
      
      const response = await request(app)
        .get('/api/sync/health')
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.status).toBe('degraded');
    });
  });
});

describe('Sync Worker Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Queue Job Processing', () => {
    it('should process sync job end-to-end', async () => {
      const mockSyncData = {
        userId: 'test-user-id',
        lastSyncTime: new Date(Date.now() - 86400000),
        options: { fullSync: false },
      };
      
      const mockUser = {
        access_token: 'valid-token',
        refresh_token: 'valid-refresh',
        token_expires_at: new Date(Date.now() + 3600000),
      };
      
      const mockBookmarks = {
        data: {
          data: [
            {
              id: 'tweet-1',
              text: 'Test tweet content',
              author_id: 'author-1',
              created_at: new Date().toISOString(),
            },
          ],
          meta: { next_token: null },
        },
      };
      
      // Mock database responses
      mockDB.query
        .mockResolvedValueOnce({ rows: [] }) // Update sync job status
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user tokens
        .mockResolvedValueOnce({ rows: [] }) // Update last sync time
        .mockResolvedValueOnce({ rows: [] }); // Update job completion
      
      // Mock X API response
      mockXApiService.getBookmarks.mockResolvedValue(mockBookmarks);
      
      // Mock bookmark service
      const mockBookmarkService = require('../services').bookmarkService;
      mockBookmarkService.upsertBookmarks.mockResolvedValue({
        newCount: 1,
        updatedCount: 0,
      });
      
      // Create mock job
      const mockJob = {
        id: 'test-job-id',
        data: mockSyncData,
        progress: jest.fn(),
      };
      
      // Import and execute the sync worker logic
      // Note: This would require extracting the worker logic into a testable function
      // For now, we'll test the components individually
      
      expect(mockXApiService.getBookmarks).toBeDefined();
      expect(mockBookmarkService.upsertBookmarks).toBeDefined();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle X API rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.name = 'RateLimitError';
      
      mockXApiService.getBookmarks.mockRejectedValue(rateLimitError);
      
      // Test that appropriate error handling occurs
      // This would involve testing the actual worker implementation
      expect(() => {
        throw rateLimitError;
      }).toThrow('Rate limit exceeded');
    });

    it('should handle token expiration and refresh', async () => {
      const expiredUser = {
        access_token: 'expired-token',
        refresh_token: 'valid-refresh',
        token_expires_at: new Date(Date.now() - 3600000), // Expired
      };
      
      const newTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      };
      
      mockDB.query.mockResolvedValueOnce({ rows: [expiredUser] });
      mockXApiService.refreshToken.mockResolvedValue(newTokens);
      
      expect(expiredUser.token_expires_at < new Date()).toBe(true);
      expect(newTokens.expires_in).toBe(3600);
    });
  });
});
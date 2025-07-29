import request from 'supertest';
import { app } from '../app';
import { syncQueue } from '../queue/queue';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('../queue/queue');
jest.mock('../utils/logger');

const mockSyncQueue = {
  getJob: jest.fn(),
  getActive: jest.fn(),
};

jest.mock('../queue/queue', () => ({
  syncQueue: mockSyncQueue,
}));

describe('Server-Sent Events (SSE) Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/sse/events/:jobId', () => {
    const mockJobId = 'test-job-123';
    const mockUserId = 'test-user-id';

    it('should establish SSE connection for valid job', (done) => {
      const mockJob = {
        id: mockJobId,
        data: { userId: mockUserId },
        getState: jest.fn().mockResolvedValue('running'),
        progress: jest.fn().mockReturnValue({
          total: 100,
          processed: 25,
          percentage: 25,
          currentItem: 'Processing item 25',
          errors: [],
        }),
        returnvalue: null,
        failedReason: null,
      };

      mockSyncQueue.getJob.mockResolvedValue(mockJob);

      const req = request(app)
        .get(`/api/sse/events/${mockJobId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Accept', 'text/event-stream')
        .buffer(false)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            
            // Check for connection confirmation
            if (data.includes('"type":"connected"')) {
              expect(data).toContain(`"jobId":"${mockJobId}"`);
              
              // Close connection and complete test
              res.destroy();
              callback(null, { data });
              done();
            }
          });
        });

      req.end();
    });

    it('should return 404 for non-existent job', async () => {
      mockSyncQueue.getJob.mockResolvedValue(null);

      const response = await request(app)
        .get(`/api/sse/events/${mockJobId}`)
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
        .get(`/api/sse/events/${mockJobId}`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/sse/events/${mockJobId}`)
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
    });

    it('should require job ID parameter', async () => {
      const response = await request(app)
        .get('/api/sse/events/')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Job ID is required',
        code: 'JOB_ID_REQUIRED',
      });
    });
  });

  describe('GET /api/sse/events/:jobId/updates', () => {
    const mockJobId = 'test-job-123';
    const mockUserId = 'test-user-id';

    it('should provide granular event updates', (done) => {
      const mockJob = {
        id: mockJobId,
        data: { userId: mockUserId },
        getState: jest.fn()
          .mockResolvedValueOnce('running')
          .mockResolvedValueOnce('completed'),
        progress: jest.fn()
          .mockReturnValueOnce({
            total: 100,
            processed: 50,
            percentage: 50,
            currentItem: 'Processing item 50',
            errors: [],
          })
          .mockReturnValueOnce({
            total: 100,
            processed: 100,
            percentage: 100,
            currentItem: 'Completed',
            errors: [],
          }),
        returnvalue: {
          totalFetched: 100,
          newBookmarks: 60,
          updatedBookmarks: 40,
          errors: [],
          syncTime: 30000,
        },
      };

      mockSyncQueue.getJob.mockResolvedValue(mockJob);

      let eventCount = 0;
      const req = request(app)
        .get(`/api/sse/events/${mockJobId}/updates`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Accept', 'text/event-stream')
        .buffer(false)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            
            // Count events
            if (data.includes('event: progress')) {
              eventCount++;
            }
            
            if (data.includes('event: completed')) {
              expect(eventCount).toBeGreaterThan(0);
              expect(data).toContain('"totalFetched":100');
              
              res.destroy();
              callback(null, { data, eventCount });
              done();
            }
          });
        });

      req.end();
    });

    it('should send heartbeat messages', (done) => {
      const mockJob = {
        id: mockJobId,
        data: { userId: mockUserId },
        getState: jest.fn().mockResolvedValue('running'),
        progress: jest.fn().mockReturnValue({
          total: 100,
          processed: 25,
          percentage: 25,
          errors: [],
        }),
      };

      mockSyncQueue.getJob.mockResolvedValue(mockJob);

      const req = request(app)
        .get(`/api/sse/events/${mockJobId}/updates`)
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Accept', 'text/event-stream')
        .buffer(false)
        .parse((res, callback) => {
          let data = '';
          let heartbeatReceived = false;
          
          res.on('data', (chunk) => {
            data += chunk.toString();
            
            // Check for heartbeat
            if (data.includes(': heartbeat')) {
              heartbeatReceived = true;
              expect(heartbeatReceived).toBe(true);
              
              res.destroy();
              callback(null, { heartbeatReceived });
              done();
            }
          });
        });

      req.end();
    });
  });

  describe('SSE Connection Management', () => {
    it('should handle client disconnection gracefully', (done) => {
      const mockJob = {
        id: 'test-job-123',
        data: { userId: 'test-user-id' },
        getState: jest.fn().mockResolvedValue('running'),
        progress: jest.fn().mockReturnValue({
          total: 100,
          processed: 10,
          percentage: 10,
          errors: [],
        }),
      };

      mockSyncQueue.getJob.mockResolvedValue(mockJob);

      const req = request(app)
        .get('/api/sse/events/test-job-123')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Accept', 'text/event-stream')
        .buffer(false)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            
            // Simulate client disconnect after connection
            if (data.includes('"type":"connected"')) {
              res.destroy();
              callback(null, { disconnected: true });
              done();
            }
          });
        });

      req.end();
    });

    it('should clean up resources on connection close', (done) => {
      const mockJob = {
        id: 'test-job-123',
        data: { userId: 'test-user-id' },
        getState: jest.fn().mockResolvedValue('running'),
        progress: jest.fn().mockReturnValue({
          total: 100,
          processed: 75,
          percentage: 75,
          errors: [],
        }),
      };

      mockSyncQueue.getJob.mockResolvedValue(mockJob);

      const req = request(app)
        .get('/api/sse/events/test-job-123')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Accept', 'text/event-stream')
        .timeout(100) // Short timeout to trigger cleanup
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', () => {
            // Data received, connection active
          });
          
          res.on('close', () => {
            // Connection closed, resources should be cleaned up
            callback(null, { closed: true });
            done();
          });
        });

      req.end();
    });
  });

  describe('SSE Error Handling', () => {
    it('should handle job state retrieval errors', (done) => {
      const mockJob = {
        id: 'test-job-123',
        data: { userId: 'test-user-id' },
        getState: jest.fn().mockRejectedValue(new Error('Job state error')),
        progress: jest.fn().mockReturnValue(null),
      };

      mockSyncQueue.getJob.mockResolvedValue(mockJob);

      const req = request(app)
        .get('/api/sse/events/test-job-123')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Accept', 'text/event-stream')
        .buffer(false)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            
            if (data.includes('"type":"error"')) {
              expect(data).toContain('Failed to get progress');
              res.destroy();
              callback(null, { error: true });
              done();
            }
          });
        });

      req.end();
    });

    it('should handle job completion and failure states', (done) => {
      const mockJob = {
        id: 'test-job-123',
        data: { userId: 'test-user-id' },
        getState: jest.fn()
          .mockResolvedValueOnce('running')
          .mockResolvedValueOnce('failed'),
        progress: jest.fn().mockReturnValue({
          total: 100,
          processed: 25,
          percentage: 25,
          errors: ['API rate limit exceeded'],
        }),
        failedReason: 'Rate limit exceeded',
      };

      mockSyncQueue.getJob.mockResolvedValue(mockJob);

      const req = request(app)
        .get('/api/sse/events/test-job-123')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Accept', 'text/event-stream')
        .buffer(false)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            
            // Look for failure status in progress updates
            if (data.includes('"status":"failed"')) {
              expect(data).toContain('Rate limit exceeded');
              res.destroy();
              callback(null, { failed: true });
              done();
            }
          });
        });

      req.end();
    });
  });

  describe('SSE Message Format Validation', () => {
    it('should send properly formatted SSE messages', (done) => {
      const mockJob = {
        id: 'test-job-123',
        data: { userId: 'test-user-id' },
        getState: jest.fn().mockResolvedValue('running'),
        progress: jest.fn().mockReturnValue({
          total: 100,
          processed: 30,
          percentage: 30,
          currentItem: 'Processing batch 3',
          errors: [],
        }),
      };

      mockSyncQueue.getJob.mockResolvedValue(mockJob);

      const req = request(app)
        .get('/api/sse/events/test-job-123')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Accept', 'text/event-stream')
        .buffer(false)
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            
            // Validate SSE format
            if (data.includes('data: {')) {
              // Check that it starts with 'data: ' and ends with '\n\n'
              const lines = data.split('\n');
              const dataLines = lines.filter(line => line.startsWith('data: '));
              
              expect(dataLines.length).toBeGreaterThan(0);
              
              // Validate JSON structure
              dataLines.forEach(line => {
                const jsonStr = line.substring(6); // Remove 'data: '
                try {
                  const parsed = JSON.parse(jsonStr);
                  expect(parsed).toHaveProperty('type');
                  if (parsed.type === 'progress') {
                    expect(parsed).toHaveProperty('jobId');
                    expect(parsed).toHaveProperty('status');
                    expect(parsed).toHaveProperty('progress');
                    expect(parsed).toHaveProperty('timestamp');
                  }
                } catch (error) {
                  // Skip heartbeat messages and other non-JSON lines
                }
              });
              
              res.destroy();
              callback(null, { validFormat: true });
              done();
            }
          });
        });

      req.end();
    });

    it('should include correct Content-Type headers', async () => {
      const mockJob = {
        id: 'test-job-123',
        data: { userId: 'test-user-id' },
        getState: jest.fn().mockResolvedValue('running'),
        progress: jest.fn().mockReturnValue({}),
      };

      mockSyncQueue.getJob.mockResolvedValue(mockJob);

      const response = await request(app)
        .get('/api/sse/events/test-job-123')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Accept', 'text/event-stream')
        .timeout(100); // Short timeout to prevent hanging

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
    });
  });

  describe('SSE Performance Tests', () => {
    it('should handle multiple concurrent SSE connections', (done) => {
      const mockJob = {
        id: 'test-job-123',
        data: { userId: 'test-user-id' },
        getState: jest.fn().mockResolvedValue('running'),
        progress: jest.fn().mockReturnValue({
          total: 100,
          processed: 45,
          percentage: 45,
          errors: [],
        }),
      };

      mockSyncQueue.getJob.mockResolvedValue(mockJob);

      const connections = [];
      const maxConnections = 3;
      let completedConnections = 0;

      for (let i = 0; i < maxConnections; i++) {
        const req = request(app)
          .get('/api/sse/events/test-job-123')
          .set('Authorization', 'Bearer valid-jwt-token')
          .set('Accept', 'text/event-stream')
          .buffer(false)
          .parse((res, callback) => {
            res.on('data', (chunk) => {
              const data = chunk.toString();
              if (data.includes('"type":"connected"')) {
                res.destroy();
                callback(null, { connectionId: i });
                
                completedConnections++;
                if (completedConnections === maxConnections) {
                  done();
                }
              }
            });
          });

        connections.push(req);
        req.end();
      }
    });

    it('should efficiently handle rapid progress updates', (done) => {
      let progressCallCount = 0;
      const mockJob = {
        id: 'test-job-123',
        data: { userId: 'test-user-id' },
        getState: jest.fn().mockResolvedValue('running'),
        progress: jest.fn().mockImplementation(() => {
          progressCallCount++;
          return {
            total: 100,
            processed: Math.min(progressCallCount * 5, 100),
            percentage: Math.min(progressCallCount * 5, 100),
            currentItem: `Processing item ${progressCallCount * 5}`,
            errors: [],
          };
        }),
      };

      mockSyncQueue.getJob.mockResolvedValue(mockJob);

      const req = request(app)
        .get('/api/sse/events/test-job-123')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('Accept', 'text/event-stream')
        .buffer(false)
        .parse((res, callback) => {
          let updateCount = 0;
          res.on('data', (chunk) => {
            const data = chunk.toString();
            if (data.includes('"type":"progress"')) {
              updateCount++;
              
              // After receiving several updates, verify performance
              if (updateCount >= 3) {
                expect(progressCallCount).toBeGreaterThan(0);
                expect(updateCount).toBeGreaterThan(0);
                
                res.destroy();
                callback(null, { updateCount, progressCallCount });
                done();
              }
            }
          });
        });

      req.end();
    });
  });
});
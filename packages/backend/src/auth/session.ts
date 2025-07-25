import { createClient, RedisClientType } from 'redis';
import { SessionData, SessionDataSchema } from '@x-bookmarker/shared';

interface SessionConfig {
  redisUrl: string;
  sessionTimeout: number; // in seconds
  sessionPrefix: string;
}

class SessionService {
  private client: RedisClientType;
  private config: SessionConfig;
  private isConnected: boolean = false;

  constructor() {
    this.config = {
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600'), // 1 hour default
      sessionPrefix: 'session:',
    };

    this.client = createClient({
      url: this.config.redisUrl,
    });

    this.setupRedisClient();
  }

  private async setupRedisClient(): Promise<void> {
    this.client.on('error', error => {
      console.error('❌ Redis Client Error:', error);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('🔗 Redis Client Connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      console.log('🔌 Redis Client Disconnected');
      this.isConnected = false;
    });

    try {
      await this.client.connect();
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
    }
  }

  /**
   * Create a new session
   */
  async createSession(sessionId: string, data: SessionData): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    // Validate session data
    const validationResult = SessionDataSchema.safeParse(data);
    if (!validationResult.success) {
      throw new Error('Invalid session data structure');
    }

    const key = `${this.config.sessionPrefix}${sessionId}`;
    const serializedData = JSON.stringify(data);

    await this.client.setEx(key, this.config.sessionTimeout, serializedData);
    console.log(`✅ Session created: ${sessionId}`);
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const key = `${this.config.sessionPrefix}${sessionId}`;
    const data = await this.client.get(key);

    if (!data) {
      return null;
    }

    try {
      const parsedData = JSON.parse(data);
      const validationResult = SessionDataSchema.safeParse(parsedData);

      if (!validationResult.success) {
        console.error(
          '❌ Invalid session data format, removing session:',
          sessionId
        );
        await this.deleteSession(sessionId);
        return null;
      }

      // Update last active time
      const updatedData = {
        ...validationResult.data,
        lastActiveAt: new Date().toISOString(),
      };

      await this.updateSession(sessionId, updatedData);
      return updatedData;
    } catch (error) {
      console.error('❌ Error parsing session data:', error);
      await this.deleteSession(sessionId);
      return null;
    }
  }

  /**
   * Update session data
   */
  async updateSession(
    sessionId: string,
    data: Partial<SessionData>
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const existingSession = await this.getSessionRaw(sessionId);
    if (!existingSession) {
      throw new Error('Session not found');
    }

    const updatedData = { ...existingSession, ...data };
    const validationResult = SessionDataSchema.safeParse(updatedData);

    if (!validationResult.success) {
      throw new Error('Invalid updated session data structure');
    }

    const key = `${this.config.sessionPrefix}${sessionId}`;
    const serializedData = JSON.stringify(validationResult.data);

    await this.client.setEx(key, this.config.sessionTimeout, serializedData);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const key = `${this.config.sessionPrefix}${sessionId}`;
    await this.client.del(key);
    console.log(`🗑️  Session deleted: ${sessionId}`);
  }

  /**
   * Extend session timeout
   */
  async extendSession(
    sessionId: string,
    timeoutSeconds?: number
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const key = `${this.config.sessionPrefix}${sessionId}`;
    const timeout = timeoutSeconds || this.config.sessionTimeout;

    const exists = await this.client.expire(key, timeout);
    if (!exists) {
      throw new Error('Session not found');
    }
  }

  /**
   * Get session TTL (time to live)
   */
  async getSessionTTL(sessionId: string): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const key = `${this.config.sessionPrefix}${sessionId}`;
    return await this.client.ttl(key);
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(
    userId: string
  ): Promise<{ sessionId: string; data: SessionData }[]> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const pattern = `${this.config.sessionPrefix}*`;
    const keys = await this.client.keys(pattern);
    const sessions: { sessionId: string; data: SessionData }[] = [];

    for (const key of keys) {
      const data = await this.client.get(key);
      if (data) {
        try {
          const parsedData = JSON.parse(data);
          if (parsedData.userId === userId) {
            const sessionId = key.replace(this.config.sessionPrefix, '');
            sessions.push({ sessionId, data: parsedData });
          }
        } catch (error) {
          console.error('❌ Error parsing session data for key:', key);
        }
      }
    }

    return sessions;
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId: string): Promise<void> {
    const userSessions = await this.getUserSessions(userId);

    for (const session of userSessions) {
      await this.deleteSession(session.sessionId);
    }

    console.log(
      `🗑️  Deleted ${userSessions.length} sessions for user: ${userId}`
    );
  }

  /**
   * Get session data without updating last active time
   */
  private async getSessionRaw(sessionId: string): Promise<SessionData | null> {
    const key = `${this.config.sessionPrefix}${sessionId}`;
    const data = await this.client.get(key);

    if (!data) {
      return null;
    }

    try {
      const parsedData = JSON.parse(data);
      const validationResult = SessionDataSchema.safeParse(parsedData);
      return validationResult.success ? validationResult.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.client.disconnect();
  }
}

// Singleton instance
export const sessionService = new SessionService();

// Export for testing
export { SessionService };

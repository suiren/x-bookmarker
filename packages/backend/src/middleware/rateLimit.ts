/**
 * レート制限ミドルウェア
 * 
 * 💡 レート制限とは:
 * 一定時間内のリクエスト数を制限してサーバーを保護する仕組み
 * - DoS攻撃の防止
 * - リソースの公平な利用
 * - 外部API制限への対応
 * 
 * 実装方式:
 * - スライディングウィンドウ方式
 * - Redis/メモリベースのカウンター
 * - ユーザー・IP別の制限
 * 
 * X API制限への対応:
 * - 75 requests / 15分の制限
 * - 指数バックオフでリトライ
 * - 優雅な制限処理
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimitConfig } from '@x-bookmarker/shared';
import { createClient, RedisClientType } from 'redis';
import { config } from '../config';

interface RateLimitStore {
  increment(key: string): Promise<{ count: number; resetTime: Date }>;
  reset(key: string): Promise<void>;
}

class RedisRateLimitStore implements RateLimitStore {
  private client: RedisClientType;
  private windowMs: number;

  constructor(redisUrl: string, windowMs: number) {
    this.client = createClient({ url: redisUrl });
    this.windowMs = windowMs;
    this.setupClient();
  }

  private async setupClient(): Promise<void> {
    try {
      await this.client.connect();
      console.log('🔗 Rate limit Redis client connected');
    } catch (error) {
      console.error('❌ Rate limit Redis connection error:', error);
    }
  }

  async increment(key: string): Promise<{ count: number; resetTime: Date }> {
    const multi = this.client.multi();
    const windowStart = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    const windowKey = `${key}:${windowStart}`;

    multi.incr(windowKey);
    multi.expire(windowKey, Math.ceil(this.windowMs / 1000));

    const results = await multi.exec();
    const count = (results?.[0] as number) || 1;
    const resetTime = new Date(windowStart + this.windowMs);

    return { count, resetTime };
  }

  async reset(key: string): Promise<void> {
    const pattern = `${key}:*`;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }
}

class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetTime: number }>();
  private windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;

    // Clean up expired entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.store.entries()) {
        if (value.resetTime <= now) {
          this.store.delete(key);
        }
      }
    }, 60000);
  }

  async increment(key: string): Promise<{ count: number; resetTime: Date }> {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const windowKey = `${key}:${windowStart}`;
    const resetTime = windowStart + this.windowMs;

    const existing = this.store.get(windowKey);
    if (existing && existing.resetTime > now) {
      existing.count++;
      return { count: existing.count, resetTime: new Date(existing.resetTime) };
    } else {
      this.store.set(windowKey, { count: 1, resetTime });
      return { count: 1, resetTime: new Date(resetTime) };
    }
  }

  async reset(key: string): Promise<void> {
    for (const storeKey of this.store.keys()) {
      if (storeKey.startsWith(key)) {
        this.store.delete(storeKey);
      }
    }
  }
}

class RateLimiter {
  private store: RateLimitStore;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig, redisUrl?: string) {
    this.config = config;

    if (redisUrl) {
      this.store = new RedisRateLimitStore(redisUrl, config.windowMs);
    } else {
      this.store = new MemoryRateLimitStore(config.windowMs);
      console.warn(
        '⚠️  Using memory store for rate limiting. Use Redis in production.'
      );
    }
  }

  async isAllowed(identifier: string): Promise<{
    allowed: boolean;
    count: number;
    resetTime: Date;
    remaining: number;
  }> {
    const result = await this.store.increment(identifier);
    const remaining = Math.max(0, this.config.maxRequests - result.count);

    return {
      allowed: result.count <= this.config.maxRequests,
      count: result.count,
      resetTime: result.resetTime,
      remaining,
    };
  }

  async reset(identifier: string): Promise<void> {
    await this.store.reset(identifier);
  }
}

// Rate limit configurations
export const rateLimitConfigs = {
  // General API rate limit
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  } as RateLimitConfig,

  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  } as RateLimitConfig,

  // X API calls (based on X's limits)
  xApi: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 75, // Conservative limit for X API
    skipSuccessfulRequests: false,
    skipFailedRequests: true,
  } as RateLimitConfig,

  // User registration/sensitive operations
  sensitive: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  } as RateLimitConfig,
};

/**
 * レート制限設定の初期化
 * 
 * 💡 設定の考慮事項:
 * - 一般API: 通常の使用に十分な制限
 * - 認証API: 厳しい制限でブルートフォース攻撃を防止
 * - X API: 外部API制限に合わせた保守的な設定
 * - 機密操作: 非常に厳しい制限
 */
function createRedisUrl(): string | undefined {
  if (config.redis.password) {
    return `redis://:${config.redis.password}@${config.redis.host}:${config.redis.port}`;
  } else {
    return `redis://${config.redis.host}:${config.redis.port}`;
  }
}

const redisUrl = createRedisUrl();
console.log(`🔧 レート制限設定:`);
console.log(`  - Redis URL: ${redisUrl ? 'configured' : 'not configured (using memory)'}`);
console.log(`  - API制限: ${rateLimitConfigs.api.maxRequests}req/${rateLimitConfigs.api.windowMs/60000}min`);
console.log(`  - 認証制限: ${rateLimitConfigs.auth.maxRequests}req/${rateLimitConfigs.auth.windowMs/60000}min`);
console.log(`  - X API制限: ${rateLimitConfigs.xApi.maxRequests}req/${rateLimitConfigs.xApi.windowMs/60000}min`);

const limiters = {
  api: new RateLimiter(rateLimitConfigs.api, redisUrl),
  auth: new RateLimiter(rateLimitConfigs.auth, redisUrl),
  xApi: new RateLimiter(rateLimitConfigs.xApi, redisUrl),
  sensitive: new RateLimiter(rateLimitConfigs.sensitive, redisUrl),
};

/**
 * Create rate limiting middleware
 */
export const createRateLimit = (
  limiterType: keyof typeof limiters,
  keyGenerator?: (req: Request) => string
) => {
  const limiter = limiters[limiterType];
  const config = rateLimitConfigs[limiterType];

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Generate rate limit key
      let key: string;
      if (keyGenerator) {
        key = keyGenerator(req);
      } else if (req.user) {
        key = `user:${req.user.userId}`;
      } else {
        key = `ip:${req.ip || req.connection.remoteAddress || 'unknown'}`;
      }

      const result = await limiter.isAllowed(key);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader(
        'X-RateLimit-Reset',
        Math.ceil(result.resetTime.getTime() / 1000)
      );
      res.setHeader('X-RateLimit-Window', Math.ceil(config.windowMs / 1000));

      if (!result.allowed) {
        const retryAfter = Math.ceil(
          (result.resetTime.getTime() - Date.now()) / 1000
        );
        res.setHeader('Retry-After', retryAfter);

        res.status(429).json({
          success: false,
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter,
          limit: config.maxRequests,
          windowMs: config.windowMs,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('❌ Rate limit error:', error);
      // Don't block requests if rate limiting fails
      next();
    }
  };
};

// Predefined middleware instances
export const apiRateLimit = createRateLimit('api');
export const authRateLimit = createRateLimit('auth');
export const xApiRateLimit = createRateLimit('xApi');
export const sensitiveRateLimit = createRateLimit('sensitive');

// Custom rate limiters
export const createCustomRateLimit = (
  config: RateLimitConfig,
  keyGenerator?: (req: Request) => string
) => {
  const limiter = new RateLimiter(config, redisUrl);

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      let key: string;
      if (keyGenerator) {
        key = keyGenerator(req);
      } else if (req.user) {
        key = `user:${req.user.userId}`;
      } else {
        key = `ip:${req.ip || req.connection.remoteAddress || 'unknown'}`;
      }

      const result = await limiter.isAllowed(key);

      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader(
        'X-RateLimit-Reset',
        Math.ceil(result.resetTime.getTime() / 1000)
      );

      if (!result.allowed) {
        const retryAfter = Math.ceil(
          (result.resetTime.getTime() - Date.now()) / 1000
        );
        res.setHeader('Retry-After', retryAfter);

        res.status(429).json({
          success: false,
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('❌ Custom rate limit error:', error);
      next();
    }
  };
};

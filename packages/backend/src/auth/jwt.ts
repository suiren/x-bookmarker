import jwt, { SignOptions } from 'jsonwebtoken';
import { JWTPayload, JWTPayloadSchema } from '@x-bookmarker/shared';

interface JWTConfig {
  secret: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
}

class JWTService {
  private config: JWTConfig;

  constructor() {
    this.config = {
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
      accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
      refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    };

    // Validate required environment variables
    if (!process.env.JWT_SECRET) {
      console.warn(
        '⚠️  JWT_SECRET not set in environment variables. Using default (not secure for production)'
      );
    }

    if (this.config.secret.length < 32) {
      console.warn(
        '⚠️  JWT_SECRET should be at least 32 characters long for security'
      );
    }
  }

  /**
   * Generate an access token for the user
   */
  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload as any, this.config.secret, {
      expiresIn: this.config.accessTokenExpiry,
      issuer: 'x-bookmarker',
      audience: 'x-bookmarker-app',
    } as SignOptions);
  }

  /**
   * Generate a refresh token for the user
   */
  generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload as any, this.config.secret, {
      expiresIn: this.config.refreshTokenExpiry,
      issuer: 'x-bookmarker',
      audience: 'x-bookmarker-app',
    } as SignOptions);
  }

  /**
   * Generate both access and refresh tokens
   */
  generateTokens(payload: Omit<JWTPayload, 'iat' | 'exp'>): {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  } {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    // Calculate expiry time for access token
    const expiresAt = new Date();
    const expiryMs = this.parseExpiryToMs(this.config.accessTokenExpiry);
    expiresAt.setTime(expiresAt.getTime() + expiryMs);

    return {
      accessToken,
      refreshToken,
      expiresAt,
    };
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.config.secret, {
        issuer: 'x-bookmarker',
        audience: 'x-bookmarker-app',
      });

      // Validate the payload structure
      const result = JWTPayloadSchema.safeParse(decoded);
      if (!result.success) {
        throw new Error('Invalid token payload structure');
      }

      return result.data;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      if (error instanceof jwt.NotBeforeError) {
        throw new Error('Token not active');
      }
      throw error;
    }
  }

  /**
   * Decode token without verification (for debugging/logging)
   */
  decodeToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || typeof decoded === 'string') {
        return null;
      }

      const result = JWTPayloadSchema.safeParse(decoded);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired without throwing
   */
  isTokenExpired(token: string): boolean {
    try {
      this.verifyToken(token);
      return false;
    } catch (error) {
      return error instanceof Error && error.message === 'Token expired';
    }
  }

  /**
   * Get token expiry time
   */
  getTokenExpiry(token: string): Date | null {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    return new Date(decoded.exp * 1000);
  }

  /**
   * Parse expiry string to milliseconds
   */
  private parseExpiryToMs(expiry: string): number {
    const regex = /^(\d+)([smhd])$/;
    const match = expiry.match(regex);

    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * multipliers[unit as keyof typeof multipliers];
  }
}

// Singleton instance
export const jwtService = new JWTService();

// Export for testing
export { JWTService };

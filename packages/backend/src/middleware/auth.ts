/**
 * Express認証ミドルウェア
 * 
 * 💡 ミドルウェアとは:
 * リクエストとレスポンスの間で実行される関数
 * - リクエストの前処理
 * - 認証・認可のチェック
 * - ログ記録
 * - エラーハンドリング
 * 
 * セキュリティのベストプラクティス:
 * - トークンの適切な検証
 * - 詳細なエラー情報の非公開
 * - レート制限の実装
 * - セッションのセキュア管理
 */

import { Request, Response, NextFunction } from 'express';
import { JWTPayload } from '@x-bookmarker/shared';
import { jwtService } from '../auth/jwt';
import { sessionService } from '../auth/session';

// Express Request型を拡張してユーザー情報を追加
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      sessionId?: string;
      authMethod?: 'jwt' | 'session';
      clientIp?: string;
      userAgent?: string;
    }
  }
}

/**
 * JWT認証ミドルウェア
 * 
 * 💡 JWT認証の流れ:
 * 1. Authorizationヘッダーからトークンを抽出
 * 2. "Bearer "プレフィックスを除去
 * 3. トークンの署名と有効期限を検証
 * 4. ペイロードをリクエストオブジェクトに追加
 * 
 * セキュリティ考慮事項:
 * - トークンの改ざん検出
 * - 有効期限の厳密なチェック
 * - エラー情報の適切な制限
 */
export const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const startTime = Date.now();
  
  try {
    // クライアント情報の記録（セキュリティログ用）
    req.clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    req.userAgent = req.headers['user-agent'] || 'unknown';
    
    console.log(`🔐 JWT認証開始: ${req.method} ${req.path} from ${req.clientIp}`);

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      console.log('❌ 認証ヘッダーなし');
      res.status(401).json({
        success: false,
        error: 'Authorization header required',
        code: 'MISSING_AUTH_HEADER',
      });
      return;
    }

    // Bearer トークンの形式チェック
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      console.log('❌ 無効な認証ヘッダー形式');
      res.status(401).json({
        success: false,
        error: 'Invalid authorization header format',
        code: 'INVALID_AUTH_FORMAT',
      });
      return;
    }

    const token = parts[1];
    if (!token) {
      console.log('❌ トークンなし');
      res.status(401).json({
        success: false,
        error: 'Bearer token required',
        code: 'MISSING_TOKEN',
      });
      return;
    }

    try {
      // トークン検証
      const payload = jwtService.verifyToken(token);
      
      // リクエストオブジェクトにユーザー情報を追加
      req.user = payload;
      req.authMethod = 'jwt';
      
      const duration = Date.now() - startTime;
      console.log(`✅ JWT認証成功: user=${payload.userId} (${duration}ms)`);
      
      next();
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // エラーの種類に応じた詳細なログ記録
      let errorCode = 'INVALID_TOKEN';
      let errorMessage = 'Invalid token';
      let logLevel = '❌';

      if (error instanceof Error) {
        if (error.message === 'Token expired') {
          errorCode = 'TOKEN_EXPIRED';
          errorMessage = 'Token expired';
          logLevel = '⏰';
        } else if (error.message === 'Token not active') {
          errorCode = 'TOKEN_NOT_ACTIVE';
          errorMessage = 'Token not active';
        } else if (error.message === 'Invalid token') {
          errorCode = 'INVALID_TOKEN';
          errorMessage = 'Invalid token';
        }
      }

      console.log(`${logLevel} JWT認証失敗: ${errorMessage} from ${req.clientIp} (${duration}ms)`);

      res.status(401).json({
        success: false,
        error: errorMessage,
        code: errorCode,
      });
      return;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ JWT認証エラー (${duration}ms):`, error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
};

/**
 * Session Authentication Middleware
 * Verifies session using session ID from cookies or headers
 */
export const authenticateSession = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];

    if (!sessionId) {
      res.status(401).json({
        success: false,
        error: 'Session ID required',
        code: 'MISSING_SESSION_ID',
      });
      return;
    }

    try {
      const sessionData = await sessionService.getSession(sessionId);

      if (!sessionData) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired session',
          code: 'INVALID_SESSION',
        });
        return;
      }

      // Add user info to request
      req.user = {
        userId: sessionData.userId,
        xUserId: sessionData.xUserId,
        username: sessionData.username,
        iat: Math.floor(new Date(sessionData.createdAt).getTime() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      req.sessionId = sessionId;
      next();
    } catch (error) {
      console.error('❌ Session verification error:', error);
      res.status(401).json({
        success: false,
        error: 'Session verification failed',
        code: 'SESSION_ERROR',
      });
      return;
    }
  } catch (error) {
    console.error('❌ Session Authentication Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
};

/**
 * Optional Authentication Middleware
 * Adds user info if token is provided, but doesn't require authentication
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    if (token) {
      try {
        const payload = jwtService.verifyToken(token);
        req.user = payload;
      } catch (error) {
        // Silently ignore auth errors for optional auth
        console.log(
          '⚠️  Optional auth failed (ignored):',
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  next();
};

/**
 * Role-based Access Control Middleware
 * Checks if user has required permissions (for future use)
 */
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    // For now, all authenticated users have access
    // In the future, implement role checking logic here
    next();
  };
};

/**
 * User Ownership Middleware
 * Ensures user can only access their own resources
 */
export const requireOwnership = (userIdParam: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const resourceUserId = req.params[userIdParam];

    if (resourceUserId && resourceUserId !== req.user.userId) {
      res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    next();
  };
};

/**
 * Refresh Token Middleware
 * Automatically refreshes JWT token if it's close to expiry
 */
export const autoRefreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    next();
    return;
  }

  try {
    const tokenExpiry = new Date(req.user.exp * 1000);
    const now = new Date();
    const timeUntilExpiry = tokenExpiry.getTime() - now.getTime();

    // If token expires within 5 minutes, add refresh header
    if (timeUntilExpiry < 5 * 60 * 1000) {
      res.setHeader('X-Token-Refresh-Needed', 'true');
    }
  } catch (error) {
    // Ignore refresh check errors
    console.log('⚠️  Token refresh check failed:', error);
  }

  next();
};

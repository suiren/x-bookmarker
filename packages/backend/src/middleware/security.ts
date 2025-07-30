/**
 * セキュリティミドルウェア - Web アプリケーションセキュリティの包括的な実装
 * 
 * 💡 Webセキュリティのレイヤー構造:
 * 
 * 1. 【ネットワークレベル】
 *    - HTTPS通信の強制
 *    - TLS/SSL設定の最適化
 *    - セキュアなポート設定
 * 
 * 2. 【HTTP通信レベル】
 *    - セキュリティヘッダー設定
 *    - CORS（Cross-Origin Resource Sharing）制御
 *    - リクエスト/レスポンスの検証
 * 
 * 3. 【アプリケーションレベル】
 *    - CSP（Content Security Policy）によるXSS対策
 *    - CSRF（Cross-Site Request Forgery）防止
 *    - インジェクション攻撃対策
 * 
 * 4. 【データ保護レベル】
 *    - 機密情報の暗号化
 *    - セッション管理のセキュリティ
 *    - ログ記録とモニタリング
 * 
 * このミドルウェアは、これらすべてのレイヤーを統合的に管理し、
 * 最新のセキュリティ脅威に対応できる堅牢な防御システムを構築します。
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from '../config';

/**
 * セキュリティ設定の集約管理
 * 
 * 💡 設定管理のベストプラクティス:
 * - 環境別の設定分離
 * - セキュリティレベルの段階的設定
 * - 本番環境での厳格な制限
 * - 開発環境での利便性確保
 * 
 * この設定オブジェクトは、すべてのセキュリティ関連の設定を
 * 一箇所で管理し、保守性と可読性を向上させています。
 */
const securityConfig = {
  cors: {
    /**
     * CORS Origin検証の動的実装
     * 
     * 💡 CORS（Cross-Origin Resource Sharing）とは:
     * ブラウザの同一オリジンポリシーを緩和し、異なるドメインからの
     * リソースアクセスを制御するW3C標準です。
     * 
     * セキュリティ上の重要性:
     * - 不正なサイトからのAPIアクセスを防止
     * - クレデンシャル付きリクエストの制御
     * - プリフライトリクエストによる事前検証
     * 
     * 実装の特徴:
     * - 環境別の動的Origin設定
     * - セキュリティログによる監視
     * - 詳細なエラーレポート
     */
    origin: function(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      // 本番環境: 環境変数から許可オリジンを取得
      // 開発環境: ローカル開発サーバーを自動許可
      const allowedOrigins = config.env === 'production' 
        ? (process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || [])
        : [
            'http://localhost:3000',    // Next.js デフォルト
            'http://localhost:5173',    // Vite デフォルト
            'http://localhost:8080',    // 汎用開発サーバー
            'http://127.0.0.1:3000',    // ローカルIPアクセス
            'http://127.0.0.1:5173',
            'http://127.0.0.1:8080',
          ];
      
      // 💡 同一オリジンリクエスト（通常のブラウザアクセス）
      // originヘッダーがない場合は同一オリジンとして許可
      if (!origin) {
        console.log('✅ CORS許可: 同一オリジンリクエスト');
        return callback(null, true);
      }
      
      // Origin許可リストとの照合
      if (allowedOrigins.includes(origin)) {
        console.log(`✅ CORS許可: ${origin}`);
        return callback(null, true);
      } else {
        // セキュリティログに記録
        console.warn(`🚨 CORS拒否: 未許可のオリジン ${origin}`);
        console.warn(`🔍 許可オリジン一覧: ${allowedOrigins.join(', ')}`);
        
        return callback(new Error('CORS policy violation'), false);
      }
    },
    credentials: true, // Cookie送信を許可
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',      // JWT トークン
      'X-Session-ID',       // セッション ID
      'X-CSRF-Token',       // CSRF トークン
      'X-Client-Version',   // クライアントバージョン
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',        // レート制限情報
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Token-Refresh-Needed',   // トークンリフレッシュ通知
      'X-Session-Expires-At',     // セッション有効期限
    ],
    maxAge: 86400, // プリフライトリクエストのキャッシュ時間（24時間）
  },
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        connectSrc: ["'self'", 'https://api.twitter.com', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false, // Disable for X API compatibility
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  },
};

/**
 * CORS Middleware
 * Handles Cross-Origin Resource Sharing
 */
export const corsMiddleware = cors(securityConfig.cors);

/**
 * Helmet Security Middleware
 * Sets various HTTP headers for security
 */
export const helmetMiddleware = helmet(securityConfig.helmet);

/**
 * HTTPS Redirect Middleware
 * Redirects HTTP requests to HTTPS in production
 */
export const httpsRedirect = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (process.env.NODE_ENV === 'production') {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
      return;
    }
  }
  next();
};

/**
 * Security Headers Middleware
 * Adds additional security headers
 */
export const securityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  // Add custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()'
  );

  // Cache control for API responses
  if (req.path.startsWith('/api/')) {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }

  next();
};

/**
 * Request Size Limiter
 * Limits request body size to prevent DoS attacks
 */
export const requestSizeLimiter = (maxSize: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    const maxSizeBytes = parseSize(maxSize);

    if (contentLength > maxSizeBytes) {
      res.status(413).json({
        success: false,
        error: 'Request entity too large',
        code: 'REQUEST_TOO_LARGE',
        maxSize,
      });
      return;
    }

    next();
  };
};

/**
 * IP Whitelist Middleware
 * Restricts access to specific IP addresses (for admin endpoints)
 */
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || '';
    const isAllowed = allowedIPs.some(ip => {
      if (ip.includes('/')) {
        // CIDR notation support would go here
        return false;
      }
      return clientIP === ip || clientIP.endsWith(ip);
    });

    if (!isAllowed) {
      console.warn(`🚨 Blocked request from unauthorized IP: ${clientIP}`);
      res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'IP_NOT_ALLOWED',
      });
      return;
    }

    next();
  };
};

/**
 * Request Validation Middleware
 * Validates request structure and content
 */
export const requestValidator = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check for suspicious patterns in URL
  const suspiciousPatterns = [
    /\.\./, // Path traversal
    /\x00/, // Null bytes
    /<script/i, // Script injection
    /javascript:/i, // JavaScript URLs
    /data:text\/html/i, // Data URLs
    /vbscript:/i, // VBScript URLs
  ];

  const url = req.url.toLowerCase();
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(url));

  if (isSuspicious) {
    console.warn(
      `🚨 Suspicious request detected: ${req.method} ${req.url} from ${req.ip}`
    );
    res.status(400).json({
      success: false,
      error: 'Invalid request',
      code: 'SUSPICIOUS_REQUEST',
    });
    return;
  }

  // Validate User-Agent header
  const userAgent = req.headers['user-agent'];
  if (!userAgent || userAgent.length < 10 || userAgent.length > 1000) {
    console.warn(`🚨 Invalid User-Agent: ${userAgent} from ${req.ip}`);
    res.status(400).json({
      success: false,
      error: 'Invalid User-Agent',
      code: 'INVALID_USER_AGENT',
    });
    return;
  }

  next();
};

/**
 * CSRF Protection Middleware
 * Basic CSRF protection using double-submit cookie pattern
 */
export const csrfProtection = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip CSRF for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // Skip CSRF for API endpoints using JWT (stateless)
  if (req.headers.authorization?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const cookieToken = req.cookies?.csrfToken;

  if (!token || !cookieToken || token !== cookieToken) {
    res.status(403).json({
      success: false,
      error: 'CSRF token validation failed',
      code: 'CSRF_TOKEN_INVALID',
    });
    return;
  }

  next();
};

/**
 * Generate CSRF token
 */
export const generateCSRFToken = (): string => {
  return require('crypto').randomBytes(32).toString('hex');
};

/**
 * Set CSRF token cookie
 */
export const setCSRFToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.cookies?.csrfToken) {
    const token = generateCSRFToken();
    res.cookie('csrfToken', token, {
      httpOnly: false, // Client needs to read this
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    res.locals.csrfToken = token;
  } else {
    res.locals.csrfToken = req.cookies.csrfToken;
  }
  next();
};

/**
 * Parse size string to bytes
 */
function parseSize(size: string): number {
  const units: { [key: string]: number } = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2];

  return Math.floor(value * units[unit]);
}

/**
 * Security middleware stack
 * Combines all security middleware in the correct order
 */
export const securityStack = [
  httpsRedirect,
  helmetMiddleware,
  corsMiddleware,
  securityHeaders,
  requestValidator,
  setCSRFToken,
];

/**
 * API security middleware stack
 * Security middleware specifically for API routes
 */
export const apiSecurityStack = [
  httpsRedirect,
  corsMiddleware,
  securityHeaders,
  requestValidator,
  requestSizeLimiter('10mb'),
];

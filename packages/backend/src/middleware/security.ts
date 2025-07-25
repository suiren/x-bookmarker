import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';

// Security configuration
const securityConfig = {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Session-ID',
      'X-CSRF-Token',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Token-Refresh-Needed',
    ],
    maxAge: 86400, // 24 hours
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

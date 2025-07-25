import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';
import {
  AuthResponse,
  OAuthCallbackQuery,
  OAuthCallbackQuerySchema,
  RefreshTokenRequest,
  RefreshTokenRequestSchema,
  CreateUserSchema,
} from '@x-bookmarker/shared';
import { jwtService } from '../auth/jwt';
import { oauthService } from '../auth/oauth';
import { sessionService } from '../auth/session';
import { authRateLimit, sensitiveRateLimit } from '../middleware/rateLimit';
import { authenticateJWT, authenticateSession } from '../middleware/auth';

const router = Router();

// Database connection (will be injected from app)
let db: Pool;

export const setDatabase = (database: Pool): void => {
  db = database;
};

/**
 * Initiate X OAuth flow
 * GET /auth/x/oauth
 */
router.get('/x/oauth', authRateLimit, async (req: Request, res: Response) => {
  try {
    const redirectUrl = (req.query.redirect as string) || '/';

    // Validate redirect URL for security
    if (!isValidRedirectUrl(redirectUrl)) {
      res.status(400).json({
        success: false,
        error: 'Invalid redirect URL',
        code: 'INVALID_REDIRECT_URL',
      });
      return;
    }

    const authUrl = oauthService.generateAuthUrl(redirectUrl);

    res.json({
      success: true,
      authUrl,
      message: 'Redirect to X for authentication',
    });
  } catch (error) {
    console.error('❌ OAuth initiation error:', error);
    res.status(500).json({
      success: false,
      error: 'OAuth initiation failed',
      code: 'OAUTH_INIT_ERROR',
    });
  }
});

/**
 * Handle X OAuth callback
 * GET /auth/x/callback
 */
router.get(
  '/x/callback',
  authRateLimit,
  async (req: Request, res: Response) => {
    try {
      // Validate callback parameters
      const queryValidation = OAuthCallbackQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid callback parameters',
          code: 'INVALID_CALLBACK_PARAMS',
          details: queryValidation.error.issues,
        });
        return;
      }

      const { code, state, error, error_description } = queryValidation.data;

      // Handle OAuth errors
      if (error) {
        console.error('❌ OAuth callback error:', error, error_description);
        res.status(400).json({
          success: false,
          error: error_description || error,
          code: 'OAUTH_CALLBACK_ERROR',
        });
        return;
      }

      // Exchange code for tokens
      const { tokenResponse, stateData } =
        await oauthService.exchangeCodeForToken(code, state);

      // Get user info from X API
      const xUserInfo = await oauthService.getUserInfo(
        tokenResponse.access_token
      );

      // Check if user exists in database
      let user = await getUserByXUserId(xUserInfo.id);

      if (!user) {
        // Create new user
        const userData = {
          xUserId: xUserInfo.id,
          username: xUserInfo.username,
          displayName: xUserInfo.name,
          avatarUrl: xUserInfo.profile_image_url,
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          tokenExpiresAt: new Date(
            Date.now() + tokenResponse.expires_in * 1000
          ),
        };

        const userValidation = CreateUserSchema.safeParse(userData);
        if (!userValidation.success) {
          throw new Error('Invalid user data structure');
        }

        user = await createUser(userValidation.data);
      } else {
        // Update existing user tokens
        await updateUserTokens(user.id, {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          tokenExpiresAt: new Date(
            Date.now() + tokenResponse.expires_in * 1000
          ),
        });
      }

      // Generate JWT tokens
      const jwtTokens = jwtService.generateTokens({
        userId: user.id,
        xUserId: user.x_user_id,
        username: user.username,
      });

      // Create session
      const sessionId = crypto.randomUUID();
      await sessionService.createSession(sessionId, {
        userId: user.id,
        xUserId: user.x_user_id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiresAt: new Date(
          Date.now() + tokenResponse.expires_in * 1000
        ).toISOString(),
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      });

      // Set secure cookies
      res.cookie('sessionId', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Prepare response
      const authResponse: AuthResponse = {
        success: true,
        user: {
          id: user.id,
          xUserId: user.x_user_id,
          username: user.username,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
        },
        tokens: {
          accessToken: jwtTokens.accessToken,
          refreshToken: jwtTokens.refreshToken,
          expiresAt: jwtTokens.expiresAt.toISOString(),
        },
      };

      // For browser requests, redirect to frontend
      if (req.headers.accept?.includes('text/html')) {
        const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}${stateData.redirectUrl}?auth=success`;
        res.redirect(redirectUrl);
      } else {
        res.json(authResponse);
      }
    } catch (error) {
      console.error('❌ OAuth callback processing error:', error);

      if (req.headers.accept?.includes('text/html')) {
        const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_failed`;
        res.redirect(errorUrl);
      } else {
        res.status(500).json({
          success: false,
          error: 'Authentication failed',
          code: 'AUTH_PROCESSING_ERROR',
        });
      }
    }
  }
);

/**
 * Refresh JWT token
 * POST /auth/refresh
 */
router.post('/refresh', authRateLimit, async (req: Request, res: Response) => {
  try {
    const bodyValidation = RefreshTokenRequestSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        details: bodyValidation.error.issues,
      });
      return;
    }

    const { refreshToken } = bodyValidation.data;

    // Verify refresh token
    const payload = jwtService.verifyToken(refreshToken);

    // Get user from database
    const user = await getUserById(payload.userId);
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
      return;
    }

    // Generate new tokens
    const newTokens = jwtService.generateTokens({
      userId: user.id,
      xUserId: user.x_user_id,
      username: user.username,
    });

    res.json({
      success: true,
      tokens: {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresAt: newTokens.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Token refresh error:', error);

    if (error instanceof Error && error.message.includes('expired')) {
      res.status(401).json({
        success: false,
        error: 'Refresh token expired',
        code: 'REFRESH_TOKEN_EXPIRED',
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Token refresh failed',
        code: 'TOKEN_REFRESH_ERROR',
      });
    }
  }
});

/**
 * Logout user
 * POST /auth/logout
 */
router.post('/logout', authenticateJWT, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    // Get session ID from cookie or header
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];

    if (sessionId) {
      await sessionService.deleteSession(sessionId as string);
    }

    // Clear session cookie
    res.clearCookie('sessionId');

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      code: 'LOGOUT_ERROR',
    });
  }
});

/**
 * Logout from all devices
 * POST /auth/logout-all
 */
router.post(
  '/logout-all',
  sensitiveRateLimit,
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        });
        return;
      }

      // Delete all user sessions
      await sessionService.deleteUserSessions(req.user.userId);

      // Clear session cookie
      res.clearCookie('sessionId');

      res.json({
        success: true,
        message: 'Logged out from all devices successfully',
      });
    } catch (error) {
      console.error('❌ Logout all error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout from all devices failed',
        code: 'LOGOUT_ALL_ERROR',
      });
    }
  }
);

/**
 * Get current user info
 * GET /auth/me
 */
router.get('/me', authenticateJWT, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const user = await getUserById(req.user.userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
      return;
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        xUserId: user.x_user_id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        settings: user.settings,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error('❌ Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user info',
      code: 'GET_USER_ERROR',
    });
  }
});

// Database helper functions
async function getUserByXUserId(xUserId: string) {
  const result = await db.query('SELECT * FROM users WHERE x_user_id = $1', [
    xUserId,
  ]);
  return result.rows[0] || null;
}

async function getUserById(userId: string) {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
}

async function createUser(userData: any) {
  const result = await db.query(
    `
    INSERT INTO users (
      x_user_id, username, display_name, avatar_url, 
      access_token, refresh_token, token_expires_at, settings
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `,
    [
      userData.xUserId,
      userData.username,
      userData.displayName,
      userData.avatarUrl,
      userData.accessToken,
      userData.refreshToken,
      userData.tokenExpiresAt,
      JSON.stringify(userData.settings || {}),
    ]
  );

  return result.rows[0];
}

async function updateUserTokens(userId: string, tokenData: any) {
  await db.query(
    `
    UPDATE users 
    SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW()
    WHERE id = $4
  `,
    [
      tokenData.accessToken,
      tokenData.refreshToken,
      tokenData.tokenExpiresAt,
      userId,
    ]
  );
}

// Helper function to validate redirect URLs
function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'http://localhost');
    // Only allow relative URLs or same origin
    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      url.startsWith('/')
    );
  } catch {
    return url.startsWith('/');
  }
}

export default router;

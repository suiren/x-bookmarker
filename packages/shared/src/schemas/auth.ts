import { z } from 'zod';

// JWT Payload schema
export const JWTPayloadSchema = z.object({
  userId: z.string().uuid(),
  xUserId: z.string(),
  username: z.string(),
  jti: z.string().optional(),
  role: z.string().optional(),
  iat: z.number(),
  exp: z.number(),
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

// OAuth callback query parameters
export const OAuthCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export type OAuthCallbackQuery = z.infer<typeof OAuthCallbackQuerySchema>;

// OAuth state data (encrypted)
export const OAuthStateSchema = z.object({
  redirectUrl: z.string().url(),
  timestamp: z.number(),
  nonce: z.string(),
});

export type OAuthState = z.infer<typeof OAuthStateSchema>;

// X OAuth token response
export const XTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  token_type: z.literal('bearer'),
  scope: z.string(),
});

export type XTokenResponse = z.infer<typeof XTokenResponseSchema>;

// Authentication response
export const AuthResponseSchema = z.object({
  success: z.boolean(),
  user: z.object({
    id: z.string().uuid(),
    xUserId: z.string(),
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().optional(),
  }),
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresAt: z.string().datetime(),
  }),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// Refresh token request
export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string(),
});

export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

// Session data stored in Redis
export const SessionDataSchema = z.object({
  userId: z.string().uuid(),
  xUserId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenExpiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
});

export type SessionData = z.infer<typeof SessionDataSchema>;

// Rate limit configuration
export const RateLimitConfigSchema = z.object({
  windowMs: z.number().positive(),
  maxRequests: z.number().positive(),
  skipSuccessfulRequests: z.boolean().default(false),
  skipFailedRequests: z.boolean().default(false),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

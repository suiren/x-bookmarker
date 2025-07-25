import axios from 'axios';
import crypto from 'crypto';
import {
  OAuthState,
  OAuthStateSchema,
  XTokenResponse,
  XTokenResponseSchema,
} from '@x-bookmarker/shared';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
}

interface XUserInfo {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
}

class OAuthService {
  private config: OAuthConfig;
  private readonly AUTHORIZATION_URL = 'https://twitter.com/i/oauth2/authorize';
  private readonly TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
  private readonly USER_INFO_URL = 'https://api.twitter.com/2/users/me';

  constructor() {
    this.config = {
      clientId: process.env.X_CLIENT_ID || '',
      clientSecret: process.env.X_CLIENT_SECRET || '',
      redirectUri:
        process.env.X_REDIRECT_URI || 'http://localhost:3000/auth/x/callback',
      encryptionKey:
        process.env.OAUTH_ENCRYPTION_KEY ||
        'default-encryption-key-change-in-production',
    };

    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.clientId) {
      throw new Error('X_CLIENT_ID environment variable is required');
    }
    if (!this.config.clientSecret) {
      throw new Error('X_CLIENT_SECRET environment variable is required');
    }
    if (!this.config.redirectUri) {
      throw new Error('X_REDIRECT_URI environment variable is required');
    }
    if (
      this.config.encryptionKey ===
      'default-encryption-key-change-in-production'
    ) {
      console.warn(
        '⚠️  Using default OAuth encryption key. Set OAUTH_ENCRYPTION_KEY in production.'
      );
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(redirectUrl: string = '/'): string {
    const state = this.encryptState({
      redirectUrl,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
    });

    const codeChallenge = this.generateCodeChallenge();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: 'tweet.read users.read bookmark.read offline.access',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${this.AUTHORIZATION_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    state: string
  ): Promise<{
    tokenResponse: XTokenResponse;
    stateData: OAuthState;
  }> {
    // Decrypt and validate state
    const stateData = this.decryptState(state);

    // Check state timestamp (max 10 minutes old)
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      throw new Error('OAuth state expired');
    }

    const codeVerifier = this.getCodeVerifier();

    const tokenData = {
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: codeVerifier,
    };

    try {
      const response = await axios.post(this.TOKEN_URL, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const validationResult = XTokenResponseSchema.safeParse(response.data);
      if (!validationResult.success) {
        throw new Error('Invalid token response format');
      }

      return {
        tokenResponse: validationResult.data,
        stateData,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ X API Token Exchange Error:', error.response?.data);
        throw new Error(
          `Token exchange failed: ${error.response?.data?.error_description || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<XTokenResponse> {
    const tokenData = {
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: refreshToken,
    };

    try {
      const response = await axios.post(this.TOKEN_URL, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const validationResult = XTokenResponseSchema.safeParse(response.data);
      if (!validationResult.success) {
        throw new Error('Invalid refresh token response format');
      }

      return validationResult.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ X API Token Refresh Error:', error.response?.data);
        throw new Error(
          `Token refresh failed: ${error.response?.data?.error_description || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Get user information from X API
   */
  async getUserInfo(accessToken: string): Promise<XUserInfo> {
    try {
      const response = await axios.get(this.USER_INFO_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          'user.fields': 'profile_image_url',
        },
      });

      if (!response.data?.data) {
        throw new Error('Invalid user info response format');
      }

      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ X API User Info Error:', error.response?.data);
        throw new Error(
          `Failed to get user info: ${error.response?.data?.error || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Encrypt OAuth state data
   */
  private encryptState(state: OAuthState): string {
    const validationResult = OAuthStateSchema.safeParse(state);
    if (!validationResult.success) {
      throw new Error('Invalid OAuth state data');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(
      'aes-256-cbc',
      this.config.encryptionKey
    );

    let encrypted = cipher.update(
      JSON.stringify(validationResult.data),
      'utf8',
      'hex'
    );
    encrypted += cipher.final('hex');

    return Buffer.from(iv.toString('hex') + ':' + encrypted).toString('base64');
  }

  /**
   * Decrypt OAuth state data
   */
  private decryptState(encryptedState: string): OAuthState {
    try {
      const decoded = Buffer.from(encryptedState, 'base64').toString('utf8');
      const [ivHex, encrypted] = decoded.split(':');

      const decipher = crypto.createDecipher(
        'aes-256-cbc',
        this.config.encryptionKey
      );
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const parsedState = JSON.parse(decrypted);
      const validationResult = OAuthStateSchema.safeParse(parsedState);

      if (!validationResult.success) {
        throw new Error('Invalid decrypted state format');
      }

      return validationResult.data;
    } catch (error) {
      throw new Error('Failed to decrypt OAuth state');
    }
  }

  /**
   * Generate PKCE code challenge
   */
  private generateCodeChallenge(): string {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    // Store code verifier (in production, use Redis or secure storage)
    process.env._CODE_VERIFIER = codeVerifier;

    return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  }

  /**
   * Get PKCE code verifier
   */
  private getCodeVerifier(): string {
    const codeVerifier = process.env._CODE_VERIFIER;
    if (!codeVerifier) {
      throw new Error('Code verifier not found');
    }
    return codeVerifier;
  }

  /**
   * Revoke access token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      await axios.post(
        'https://api.twitter.com/2/oauth2/revoke',
        {
          token,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ X API Token Revoke Error:', error.response?.data);
        // Don't throw error for revoke failures as it's not critical
      }
    }
  }
}

// Singleton instance
export const oauthService = new OAuthService();

// Export for testing
export { OAuthService };

/**
 * X (Twitter) OAuth 2.0 認証サービス
 * 
 * 💡 OAuth 2.0とは:
 * アプリケーションが第三者の代わりにリソースにアクセスするための標準
 * - 認証コード付与フロー（Authorization Code Grant）
 * - PKCE（Proof Key for Code Exchange）でセキュリティ強化
 * - リフレッシュトークンでの継続アクセス
 * 
 * X API OAuth 2.0の特徴:
 * - スコープベースの権限制御
 * - 短期間のアクセストークン
 * - 長期間のリフレッシュトークン
 * - レート制限の厳格な管理
 * 
 * セキュリティ対策:
 * - state パラメータでCSRF攻撃防止
 * - PKCE でコード インターセプト攻撃防止
 * - 暗号化された状態管理
 */

import axios from 'axios';
import crypto from 'crypto';
import {
  OAuthState,
  OAuthStateSchema,
  XTokenResponse,
  XTokenResponseSchema,
} from '@x-bookmarker/shared';
// import { config } from '../config';

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
  private readonly REVOKE_URL = 'https://api.twitter.com/2/oauth2/revoke';
  
  // PKCEコードのセキュアな保存用（本番環境ではRedisを使用）
  private codeVerifierStore = new Map<string, { verifier: string; timestamp: number }>();

  constructor() {
    this.config = {
      clientId: process.env.X_CLIENT_ID || '',
      clientSecret: process.env.X_CLIENT_SECRET || '',
      redirectUri: process.env.X_REDIRECT_URI || '',
      encryptionKey: process.env.OAUTH_ENCRYPTION_KEY || 'x-bookmarker-oauth-key-change-in-production',
    };

    this.validateConfig();
    this.setupCleanup();
    console.log('🔐 X OAuth 2.0 サービスを初期化しました');
  }

  /**
   * 設定の検証
   * 
   * 💡 OAuth設定の重要性:
   * - クライアントID: アプリケーションの識別子
   * - クライアントシークレット: 機密情報（サーバーのみ）
   * - リダイレクトURI: セキュリティのために事前登録が必要
   */
  private validateConfig(): void {
    const missingFields: string[] = [];
    
    if (!this.config.clientId) missingFields.push('X_CLIENT_ID');
    if (!this.config.clientSecret) missingFields.push('X_CLIENT_SECRET');
    if (!this.config.redirectUri) missingFields.push('X_CALLBACK_URL');
    
    if (missingFields.length > 0) {
      throw new Error(`必須のX OAuth設定が不足しています: ${missingFields.join(', ')}`);
    }
    
    if (this.config.encryptionKey === 'x-bookmarker-oauth-key-change-in-production') {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('本番環境ではOAUTH_ENCRYPTION_KEYを設定してください');
      } else {
        console.warn('⚠️ デフォルトのOAuth暗号化キーを使用中（開発環境のみ）');
      }
    }

    console.log('🔧 X OAuth設定:');
    console.log(`  - クライアントID: ${this.config.clientId.substring(0, 8)}...`);
    console.log(`  - リダイレクトURI: ${this.config.redirectUri}`);
  }

  /**
   * 古いコードベリファイアのクリーンアップ
   */
  private setupCleanup(): void {
    // 10分毎に古いコードベリファイアを削除
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.codeVerifierStore.entries()) {
        if (now - data.timestamp > 10 * 60 * 1000) {
          this.codeVerifierStore.delete(key);
        }
      }
    }, 10 * 60 * 1000);
  }

  /**
   * OAuth認証URLの生成
   * 
   * 💡 OAuth認証フローのステップ1:
   * 1. ユーザーをX認証ページにリダイレクト
   * 2. stateパラメータでCSRF攻撃を防止
   * 3. PKCEでコードインターセプト攻撃を防止
   * 4. 必要なスコープを指定
   * 
   * @param redirectUrl - 認証後のリダイレクト先
   * @param userId - ユーザーID（オプション、ログ用）
   */
  generateAuthUrl(redirectUrl: string = '/', userId?: string): string {
    console.log(`🔗 OAuth認証URL生成中: redirect=${redirectUrl}, user=${userId || 'anonymous'}`);
    
    // セキュアなランダム値でstateを生成
    const nonce = crypto.randomBytes(32).toString('hex');
    const state = this.encryptState({
      redirectUrl,
      timestamp: Date.now(),
      nonce,
    });

    // PKCEチャレンジとベリファイアを生成
    const { codeChallenge, challengeId } = this.generateCodeChallenge();

    // X APIで必要なスコープを指定
    const scopes = [
      'tweet.read',      // ツイート読み取り
      'users.read',      // ユーザー情報読み取り
      'bookmark.read',   // ブックマーク読み取り
      'offline.access'   // リフレッシュトークン取得
    ];

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${this.AUTHORIZATION_URL}?${params.toString()}`;
    console.log(`✅ OAuth認証URL生成完了: challenge_id=${challengeId}`);
    
    return authUrl;
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
    const cipher = crypto.createCipheriv('aes-256-gcm', this.config.encryptionKey, iv);

    let encrypted = cipher.update(
      JSON.stringify(validationResult.data),
      'utf8',
      'hex'
    );
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();

    return Buffer.from(
      iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
    ).toString('base64');
  }

  /**
   * Decrypt OAuth state data
   */
  private decryptState(encryptedState: string): OAuthState {
    try {
      const decoded = Buffer.from(encryptedState, 'base64').toString('utf8');
      const parts = decoded.split(':');
      
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted state format');
      }
      
      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.config.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
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
   * PKCEコードチャレンジの生成
   * 
   * 💡 PKCE（Proof Key for Code Exchange）とは:
   * OAuth 2.0の拡張仕様で、認証コードの傍受攻撃を防ぐ
   * 1. ランダムなcode_verifierを生成
   * 2. SHA256でハッシュ化してcode_challengeを作成
   * 3. 認証時にはcode_challenge、トークン交換時にはcode_verifierを使用
   */
  private generateCodeChallenge(): { codeChallenge: string; challengeId: string } {
    // セキュアなランダム値でコードベリファイアを生成（43-128文字）
    const codeVerifier = crypto.randomBytes(64).toString('base64url');
    
    // SHA256でハッシュ化してチャレンジを作成
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    // ユニークなIDでベリファイアを保存
    const challengeId = crypto.randomBytes(16).toString('hex');
    this.codeVerifierStore.set(challengeId, {
      verifier: codeVerifier,
      timestamp: Date.now()
    });
    
    console.log(`🔑 PKCEチャレンジ生成: id=${challengeId}`);
    
    return { codeChallenge, challengeId };
  }

  /**
   * PKCEコードベリファイアの取得
   * 
   * @param challengeId - チャレンジID
   */
  private getCodeVerifier(): string {
    // 現在はシンプルな実装（本番環境では改良が必要）
    // TODO: challengeIdベースの実装に変更
    const entries = Array.from(this.codeVerifierStore.entries());
    if (entries.length === 0) {
      throw new Error('Code verifier not found or expired');
    }
    
    // 最新のベリファイアを使用
    const [challengeId, stored] = entries[entries.length - 1];
    
    // 使用済みのベリファイアを削除（ワンタイム使用）
    this.codeVerifierStore.delete(challengeId);
    
    // 10分以内のもののみ有効
    if (Date.now() - stored.timestamp > 10 * 60 * 1000) {
      throw new Error('Code verifier expired');
    }
    
    console.log(`🔓 PKCEベリファイア取得: id=${challengeId}`);
    return stored.verifier;
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

// Singleton instance (conditionally created in development)
let oauthService: OAuthService | null = null;

try {
  oauthService = new OAuthService();
} catch (error) {
  if (process.env.NODE_ENV === 'development') {
    console.warn('⚠️ OAuth service disabled in development mode:', (error as Error).message);
    oauthService = null;
  } else {
    throw error;
  }
}

export { oauthService };

// Export for testing
export { OAuthService };

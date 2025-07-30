/**
 * JWT認証サービス
 * 
 * 💡 JWTとは:
 * JSON Web Token - ユーザー認証情報を安全に伝送するための標準
 * - ヘッダー: トークンの種類とアルゴリズム
 * - ペイロード: ユーザー情報とクレーム
 * - シグネチャ: データの改ざん検出
 * 
 * セキュリティの重要ポイント:
 * - 強力な秘密鍵の使用
 * - 適切な有効期限設定
 * - トークンの安全な保存
 */

import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import { JWTPayload, JWTPayloadSchema } from '@x-bookmarker/shared';
import { config } from '../config';

interface JWTConfig {
  secret: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  issuer: string;
  audience: string;
}

class JWTService {
  private config: JWTConfig;

  constructor() {
    this.config = {
      secret: config.jwt.secret,
      accessTokenExpiry: config.jwt.expiresIn,
      refreshTokenExpiry: '7d', // リフレッシュトークンは長期間有効
      issuer: 'x-bookmarker',
      audience: 'x-bookmarker-app',
    };

    this.validateConfiguration();
    console.log('🔐 JWT認証サービスを初期化しました');
  }

  /**
   * 設定の検証
   * 
   * 💡 セキュリティチェック:
   * - 秘密鍵の強度確認
   * - 本番環境での必須設定確認
   */
  private validateConfiguration(): void {
    if (config.env === 'production') {
      if (this.config.secret === 'your-jwt-secret-key') {
        throw new Error('本番環境では強力なJWT_SECRETを設定してください');
      }
      
      if (this.config.secret.length < 32) {
        throw new Error('JWT_SECRETは32文字以上にしてください');
      }
    } else {
      if (this.config.secret === 'your-jwt-secret-key') {
        console.warn('⚠️ デフォルトのJWT秘密鍵を使用中（開発環境のみ）');
      }
    }

    console.log(`🔧 JWT設定:`);
    console.log(`  - アクセストークン有効期限: ${this.config.accessTokenExpiry}`);
    console.log(`  - リフレッシュトークン有効期限: ${this.config.refreshTokenExpiry}`);
    console.log(`  - 発行者: ${this.config.issuer}`);
  }

  /**
   * アクセストークンの生成
   * 
   * 💡 アクセストークンとは:
   * - 短期間有効（通常15分〜1時間）
   * - API呼び出し時に使用
   * - 漏洩リスクを最小化
   */
  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    console.log(`🎫 アクセストークン生成中: user=${payload.userId}`);
    
    const options = {
      expiresIn: this.config.accessTokenExpiry,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: 'HS256' as const,
      jwtid: `access_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    return jwt.sign(payload as any, this.config.secret, options);
  }

  /**
   * リフレッシュトークンの生成
   * 
   * 💡 リフレッシュトークンとは:
   * - 長期間有効（通常7日〜30日）
   * - アクセストークンの更新に使用
   * - より厳重に管理する必要がある
   */
  generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    console.log(`🔄 リフレッシュトークン生成中: user=${payload.userId}`);
    
    const options = {
      expiresIn: this.config.refreshTokenExpiry,
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithm: 'HS256' as const,
      jwtid: `refresh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    return jwt.sign(payload as any, this.config.secret, options);
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
   * トークンの検証とデコード
   * 
   * 💡 検証プロセス:
   * 1. シグネチャの確認
   * 2. 有効期限の確認
   * 3. 発行者・受信者の確認
   * 4. ペイロード構造の検証
   */
  verifyToken(token: string): JWTPayload {
    try {
      console.log('🔍 トークン検証中...');
      
      const options: VerifyOptions = {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['HS256'], // 許可するアルゴリズムを明示的に指定
      };

      const decoded = jwt.verify(token, this.config.secret, options);

      // ペイロード構造の検証
      const result = JWTPayloadSchema.safeParse(decoded);
      if (!result.success) {
        console.error('❌ 無効なトークンペイロード構造:', result.error);
        throw new Error('Invalid token payload structure');
      }

      console.log(`✅ トークン検証成功: user=${result.data.userId}`);
      return result.data;
    } catch (error) {
      console.log('❌ トークン検証失敗:', error instanceof Error ? error.message : error);
      
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
   * トークンの失効（ブラックリスト追加）
   * 
   * 💡 トークン失効の仕組み:
   * JWTはステートレスなため、通常は失効させることができません。
   * そのため、失効させたいトークンのIDをブラックリストに保存します。
   * 
   * @param token - 失効させるトークン
   * @param reason - 失効理由
   */
  async revokeToken(token: string, reason: string = 'User logout'): Promise<void> {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.jti) {
        throw new Error('Invalid token for revocation');
      }

      // TODO: Redisまたはデータベースにブラックリストを保存
      // この実装は後でセッション管理と連携して実装予定
      console.log(`🚫 トークン失効: ${decoded.jti} (理由: ${reason})`);
      
    } catch (error) {
      console.error('❌ トークン失効エラー:', error);
      throw error;
    }
  }

  /**
   * リフレッシュトークンでアクセストークンを更新
   * 
   * 💡 トークンリフレッシュの流れ:
   * 1. リフレッシュトークンの検証
   * 2. 新しいアクセストークンの生成
   * 3. 古いリフレッシュトークンの失効（セキュリティ向上）
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }> {
    try {
      console.log('🔄 アクセストークンをリフレッシュ中...');
      
      // リフレッシュトークンの検証
      const payload = this.verifyToken(refreshToken);
      
      // リフレッシュトークンかどうか確認
      if (!payload.jti?.startsWith('refresh_')) {
        throw new Error('Invalid refresh token');
      }

      // 新しいトークンペアを生成
      const newTokens = this.generateTokens({
        userId: payload.userId,
        xUserId: payload.xUserId,
        username: payload.username,
        role: payload.role,
      });

      // 古いリフレッシュトークンを失効
      await this.revokeToken(refreshToken, 'Token refresh');

      console.log(`✅ トークンリフレッシュ完了: user=${payload.userId}`);
      return newTokens;
      
    } catch (error) {
      console.error('❌ トークンリフレッシュ失敗:', error);
      throw error;
    }
  }

  /**
   * 有効期限文字列をミリ秒に変換
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

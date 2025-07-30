/**
 * Redisベースセッション管理サービス
 * 
 * 💡 セッション管理とは:
 * ユーザーの認証状態とアプリケーション状態を維持する仕組み
 * - ステートフルな認証の実現
 * - JWTの補完としての役割
 * - リアルタイムな権限取り消し
 * - 複数デバイス対応
 * 
 * Redisを使用する理由:
 * - 高速なインメモリーストレージ
 * - 自動的な有効期限管理
 * - 分散環境での共有可能
 * - 豊富なデータ構造サポート
 * 
 * セキュリティ考慮事項:
 * - セッションIDの暗号学的安全性
 * - セッションハイジャック対策
 * - 適切なタイムアウト設定
 * - セッション固定攻撃の防止
 */

import { createClient, RedisClientType } from 'redis';
import { SessionData, SessionDataSchema } from '@x-bookmarker/shared';
import { config } from '../config';
import crypto from 'crypto';

interface SessionConfig {
  redisUrl: string;
  sessionTimeout: number; // 秒単位
  sessionPrefix: string;
  maxSessionsPerUser: number;
  encryptionKey: string;
}

class SessionService {
  private client: RedisClientType;
  private config: SessionConfig;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    this.config = {
      redisUrl: this.createRedisUrl(),
      sessionTimeout: 24 * 60 * 60, // 24時間
      sessionPrefix: 'x-bookmarker:session:',
      maxSessionsPerUser: 10, // ユーザーあたりの最大セッション数
      encryptionKey: process.env.SESSION_ENCRYPTION_KEY || 'x-bookmarker-session-key-change-in-production',
    };

    this.client = createClient({
      url: this.config.redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          // 最大30秒まで指数バックオフでリトライ
          return Math.min(retries * 50, 30000);
        }
      }
    });

    this.setupRedisClient();
    console.log('🗄️ Redisセッション管理サービスを初期化しました');
  }

  /**
   * Redis接続URLの生成
   */
  private createRedisUrl(): string {
    if (config.redis.password) {
      return `redis://:${config.redis.password}@${config.redis.host}:${config.redis.port}`;
    } else {
      return `redis://${config.redis.host}:${config.redis.port}`;
    }
  }

  /**
   * Redis接続の設定と初期化
   * 
   * 💡 接続管理のベストプラクティス:
   * - 自動再接続機能
   * - 接続状態の監視
   * - エラーハンドリング
   * - 設定の検証
   */
  private async setupRedisClient(): Promise<void> {
    // 設定の検証
    this.validateConfig();
    
    // イベントリスナーの設定
    this.client.on('error', (error) => {
      console.error('❌ Redis接続エラー:', error);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('🔗 Redis接続成功');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      console.log('✅ Redis準備完了');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      console.log('🔌 Redis接続切断');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis再接続中...');
    });

    // 接続の試行
    if (!this.connectionPromise) {
      this.connectionPromise = this.connectWithRetry();
    }
    
    await this.connectionPromise;
  }

  /**
   * リトライ機能付きRedis接続
   */
  private async connectWithRetry(maxRetries: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.client.connect();
        console.log(`✅ Redis接続成功 (試行 ${attempt}/${maxRetries})`);
        return;
      } catch (error) {
        console.error(`❌ Redis接続失敗 (試行 ${attempt}/${maxRetries}):`, error);
        
        if (attempt === maxRetries) {
          throw new Error(`Redis接続に失敗しました (${maxRetries}回試行後): ${error}`);
        }
        
        // 指数バックオフで待機
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * 設定の検証
   */
  private validateConfig(): void {
    if (this.config.encryptionKey === 'x-bookmarker-session-key-change-in-production') {
      if (config.env === 'production') {
        throw new Error('本番環境ではSESSION_ENCRYPTION_KEYを設定してください');
      } else {
        console.warn('⚠️ デフォルトのセッション暗号化キーを使用中（開発環境のみ）');
      }
    }

    console.log(`🔧 セッション設定:`);
    console.log(`  - Redis URL: ${this.config.redisUrl}`);
    console.log(`  - タイムアウト: ${this.config.sessionTimeout}秒`);
    console.log(`  - プレフィックス: ${this.config.sessionPrefix}`);
    console.log(`  - ユーザーあたり最大セッション数: ${this.config.maxSessionsPerUser}`);
  }

  /**
   * セキュアなセッションIDの生成
   * 
   * 💡 セッションIDの要件:
   * - 暗号学的に安全なランダム性
   * - 十分な長さ（推測困難）
   * - URL安全な文字のみ使用
   * - 衝突の可能性を最小化
   */
  generateSecureSessionId(): string {
    // 32バイト（256ビット）の暗号学的に安全なランダム値
    const randomBytes = crypto.randomBytes(32);
    
    // Base64URL形式でエンコード（URL安全）
    const sessionId = randomBytes.toString('base64url');
    
    console.log(`🔑 セキュアなセッションID生成: ${sessionId.substring(0, 8)}...`);
    return sessionId;
  }

  /**
   * セッションデータの暗号化
   * 
   * 💡 セッションデータ暗号化の目的:
   * - 機密情報の保護
   * - Redisへの不正アクセス対策
   * - データ漏洩時の影響最小化
   */
  private encryptSessionData(data: SessionData): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.config.encryptionKey, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // IV、認証タグ、暗号化データを結合
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  /**
   * セッションデータの復号化
   */
  private decryptSessionData(encryptedData: string): SessionData {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }
      
      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.config.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error('セッションデータの復号化に失敗しました');
    }
  }

  /**
   * 新しいセッションの作成
   * 
   * 💡 セッション作成の流れ:
   * 1. セッションデータの検証
   * 2. ユーザーの既存セッション数チェック
   * 3. データの暗号化
   * 4. Redisへの保存
   * 5. セッション制限の適用
   * 
   * @param sessionId - セッションID
   * @param data - セッションデータ
   */
  async createSession(sessionId: string, data: SessionData): Promise<void> {
    await this.ensureConnected();

    console.log(`🆕 セッション作成開始: ${sessionId.substring(0, 8)}... (user: ${data.userId})`);

    // セッションデータの検証
    const validationResult = SessionDataSchema.safeParse(data);
    if (!validationResult.success) {
      console.error('❌ 無効なセッションデータ構造:', validationResult.error);
      throw new Error('Invalid session data structure');
    }

    // セッション作成時刻とIPアドレスを追加
    const enhancedData: SessionData = {
      ...validationResult.data,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    // ユーザーの既存セッション数をチェック
    await this.enforceSessionLimit(enhancedData.userId);

    // データの暗号化と保存
    const key = `${this.config.sessionPrefix}${sessionId}`;
    const encryptedData = this.encryptSessionData(enhancedData);

    await this.client.setEx(key, this.config.sessionTimeout, encryptedData);
    
    // ユーザーのセッション一覧を更新
    await this.addToUserSessionList(enhancedData.userId, sessionId);

    console.log(`✅ セッション作成完了: ${sessionId.substring(0, 8)}... (TTL: ${this.config.sessionTimeout}秒)`);
  }

  /**
   * Redis接続の確認
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      if (this.connectionPromise) {
        await this.connectionPromise;
      } else {
        throw new Error('Redis接続が確立されていません');
      }
    }
  }

  /**
   * ユーザーのセッション数制限の適用
   * 
   * 💡 セッション制限の目的:
   * - リソース保護
   * - セキュリティ向上
   * - 古いセッションの自動削除
   */
  private async enforceSessionLimit(userId: string): Promise<void> {
    const userSessions = await this.getUserSessions(userId);
    
    if (userSessions.length >= this.config.maxSessionsPerUser) {
      // 最も古いセッションを削除
      const sortedSessions = userSessions.sort((a, b) => 
        new Date(a.data.lastActiveAt || a.data.createdAt).getTime() - 
        new Date(b.data.lastActiveAt || b.data.createdAt).getTime()
      );

      const sessionsToDelete = sortedSessions.slice(0, userSessions.length - this.config.maxSessionsPerUser + 1);
      
      for (const session of sessionsToDelete) {
        await this.deleteSession(session.sessionId);
        console.log(`🗑️ 古いセッションを削除: ${session.sessionId.substring(0, 8)}... (user: ${userId})`);
      }
    }
  }

  /**
   * ユーザーのセッション一覧に追加
   */
  private async addToUserSessionList(userId: string, sessionId: string): Promise<void> {
    const userSessionsKey = `${this.config.sessionPrefix}user:${userId}:sessions`;
    await this.client.sAdd(userSessionsKey, sessionId);
    await this.client.expire(userSessionsKey, this.config.sessionTimeout + 3600); // セッションより1時間長く保持
  }

  /**
   * セッションデータの取得
   * 
   * 💡 セッション取得の流れ:
   * 1. Redisからデータ取得
   * 2. データの復号化
   * 3. 構造の検証
   * 4. 最終アクセス時刻の更新
   * 5. セッションの延長
   * 
   * @param sessionId - セッションID
   * @param updateLastActive - 最終アクセス時刻を更新するか（デフォルト: true）
   */
  async getSession(sessionId: string, updateLastActive: boolean = true): Promise<SessionData | null> {
    await this.ensureConnected();

    const key = `${this.config.sessionPrefix}${sessionId}`;
    const encryptedData = await this.client.get(key);

    if (!encryptedData) {
      console.log(`📭 セッションが見つかりません: ${sessionId.substring(0, 8)}...`);
      return null;
    }

    try {
      // データの復号化
      const decryptedData = this.decryptSessionData(encryptedData);
      
      // 構造の検証
      const validationResult = SessionDataSchema.safeParse(decryptedData);
      if (!validationResult.success) {
        console.error(`❌ 無効なセッションデータ形式, セッション削除: ${sessionId.substring(0, 8)}...`);
        await this.deleteSession(sessionId);
        return null;
      }

      const sessionData = validationResult.data;

      // 最終アクセス時刻の更新
      if (updateLastActive) {
        const updatedData = {
          ...sessionData,
          lastActiveAt: new Date().toISOString(),
        };

        // 非同期で更新（レスポンス時間を短縮）
        this.updateSessionData(sessionId, updatedData).catch(error => {
          console.error(`⚠️ セッション更新エラー: ${sessionId.substring(0, 8)}...`, error);
        });

        console.log(`📖 セッション取得・更新: ${sessionId.substring(0, 8)}... (user: ${sessionData.userId})`);
        return updatedData;
      }

      console.log(`📖 セッション取得: ${sessionId.substring(0, 8)}... (user: ${sessionData.userId})`);
      return sessionData;
    } catch (error) {
      console.error(`❌ セッションデータ解析エラー: ${sessionId.substring(0, 8)}...`, error);
      await this.deleteSession(sessionId);
      return null;
    }
  }

  /**
   * セッションデータの更新（内部用）
   */
  private async updateSessionData(sessionId: string, data: SessionData): Promise<void> {
    const key = `${this.config.sessionPrefix}${sessionId}`;
    const encryptedData = this.encryptSessionData(data);
    await this.client.setEx(key, this.config.sessionTimeout, encryptedData);
  }

  /**
   * Update session data
   */
  async updateSession(
    sessionId: string,
    data: Partial<SessionData>
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const existingSession = await this.getSessionRaw(sessionId);
    if (!existingSession) {
      throw new Error('Session not found');
    }

    const updatedData = { ...existingSession, ...data };
    const validationResult = SessionDataSchema.safeParse(updatedData);

    if (!validationResult.success) {
      throw new Error('Invalid updated session data structure');
    }

    const key = `${this.config.sessionPrefix}${sessionId}`;
    const serializedData = JSON.stringify(validationResult.data);

    await this.client.setEx(key, this.config.sessionTimeout, serializedData);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const key = `${this.config.sessionPrefix}${sessionId}`;
    await this.client.del(key);
    console.log(`🗑️  Session deleted: ${sessionId}`);
  }

  /**
   * Extend session timeout
   */
  async extendSession(
    sessionId: string,
    timeoutSeconds?: number
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const key = `${this.config.sessionPrefix}${sessionId}`;
    const timeout = timeoutSeconds || this.config.sessionTimeout;

    const exists = await this.client.expire(key, timeout);
    if (!exists) {
      throw new Error('Session not found');
    }
  }

  /**
   * Get session TTL (time to live)
   */
  async getSessionTTL(sessionId: string): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const key = `${this.config.sessionPrefix}${sessionId}`;
    return await this.client.ttl(key);
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(
    userId: string
  ): Promise<{ sessionId: string; data: SessionData }[]> {
    if (!this.isConnected) {
      throw new Error('Redis client not connected');
    }

    const pattern = `${this.config.sessionPrefix}*`;
    const keys = await this.client.keys(pattern);
    const sessions: { sessionId: string; data: SessionData }[] = [];

    for (const key of keys) {
      const data = await this.client.get(key);
      if (data) {
        try {
          const parsedData = JSON.parse(data);
          if (parsedData.userId === userId) {
            const sessionId = key.replace(this.config.sessionPrefix, '');
            sessions.push({ sessionId, data: parsedData });
          }
        } catch (error) {
          console.error('❌ Error parsing session data for key:', key);
        }
      }
    }

    return sessions;
  }

  /**
   * Delete all sessions for a user
   */
  async deleteUserSessions(userId: string): Promise<void> {
    const userSessions = await this.getUserSessions(userId);

    for (const session of userSessions) {
      await this.deleteSession(session.sessionId);
    }

    console.log(
      `🗑️  Deleted ${userSessions.length} sessions for user: ${userId}`
    );
  }

  /**
   * Get session data without updating last active time
   */
  private async getSessionRaw(sessionId: string): Promise<SessionData | null> {
    const key = `${this.config.sessionPrefix}${sessionId}`;
    const data = await this.client.get(key);

    if (!data) {
      return null;
    }

    try {
      const parsedData = JSON.parse(data);
      const validationResult = SessionDataSchema.safeParse(parsedData);
      return validationResult.success ? validationResult.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * セッション統計の取得
   * 
   * 💡 監視とメンテナンスのための情報収集
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    activeUsers: number;
    averageSessionAge: number;
    oldestSession: string | null;
    newestSession: string | null;
  }> {
    await this.ensureConnected();

    const pattern = `${this.config.sessionPrefix}*`;
    const keys = await this.client.keys(pattern);
    
    // ユーザーセッション一覧キーを除外
    const sessionKeys = keys.filter(key => !key.includes(':sessions'));
    
    if (sessionKeys.length === 0) {
      return {
        totalSessions: 0,
        activeUsers: 0,
        averageSessionAge: 0,
        oldestSession: null,
        newestSession: null
      };
    }

    const userIds = new Set<string>();
    const sessionAges: number[] = [];
    let oldestTime = Date.now();
    let newestTime = 0;
    let oldestSession: string | null = null;
    let newestSession: string | null = null;

    for (const key of sessionKeys) {
      try {
        const data = await this.client.get(key);
        if (data) {
          const decrypted = this.decryptSessionData(data);
          const createdAt = new Date(decrypted.createdAt || Date.now()).getTime();
          
          userIds.add(decrypted.userId);
          sessionAges.push(Date.now() - createdAt);
          
          if (createdAt < oldestTime) {
            oldestTime = createdAt;
            oldestSession = key.replace(this.config.sessionPrefix, '');
          }
          
          if (createdAt > newestTime) {
            newestTime = createdAt;
            newestSession = key.replace(this.config.sessionPrefix, '');
          }
        }
      } catch (error) {
        console.warn(`⚠️ セッション統計取得中にエラー: ${key}`, error);
      }
    }

    const averageSessionAge = sessionAges.length > 0 
      ? sessionAges.reduce((sum, age) => sum + age, 0) / sessionAges.length 
      : 0;

    return {
      totalSessions: sessionKeys.length,
      activeUsers: userIds.size,
      averageSessionAge: Math.round(averageSessionAge / 1000), // 秒単位
      oldestSession,
      newestSession
    };
  }

  /**
   * 期限切れセッションのクリーンアップ
   * 
   * 💡 定期的なメンテナンス機能
   * - 孤立したセッションデータの削除
   * - ユーザーセッション一覧の同期
   */
  async cleanupExpiredSessions(): Promise<number> {
    await this.ensureConnected();

    console.log('🧹 期限切れセッションのクリーンアップを開始...');
    
    const pattern = `${this.config.sessionPrefix}*`;
    const keys = await this.client.keys(pattern);
    let cleanedCount = 0;

    for (const key of keys) {
      try {
        const ttl = await this.client.ttl(key);
        
        // TTLが-2（キーが存在しない）または0以下の場合は削除
        if (ttl <= 0) {
          await this.client.del(key);
          cleanedCount++;
          console.log(`🗑️ 期限切れセッション削除: ${key}`);
        }
      } catch (error) {
        console.warn(`⚠️ セッションクリーンアップ中にエラー: ${key}`, error);
      }
    }

    console.log(`✅ クリーンアップ完了: ${cleanedCount}個のセッションを削除`);
    return cleanedCount;
  }

  /**
   * セキュリティ監査ログの記録
   * 
   * @param sessionId - セッションID
   * @param action - アクション
   * @param details - 詳細情報
   */
  async logSecurityEvent(
    sessionId: string, 
    action: 'create' | 'access' | 'update' | 'delete' | 'expired',
    details?: Record<string, any>
  ): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      sessionId: sessionId.substring(0, 8) + '...', // セキュリティのため部分的にマスク
      action,
      details,
    };

    // 本番環境では外部ログサービスに送信
    console.log('🔒 セキュリティログ:', JSON.stringify(logEntry));
  }

  /**
   * Redis接続の終了
   */
  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.disconnect();
      console.log('🔌 Redisセッション管理サービスを終了しました');
    }
  }
}

// Singleton instance
export const sessionService = new SessionService();

// Export for testing
export { SessionService };

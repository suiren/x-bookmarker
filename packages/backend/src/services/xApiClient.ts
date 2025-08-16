/**
 * X (Twitter) API v2クライアント - ブックマーク取得とレート制限管理
 * 
 * 💡 X API v2の特徴と制約:
 * 
 * 1. 【API制限とレート制限】
 *    - ブックマークAPI: 75 requests/15分（ユーザー認証）
 *    - OAuth 2.0認証が必須
 *    - スコープ: bookmark.read, tweet.read, users.read
 * 
 * 2. 【データ構造】
 *    - ツイートデータ: id, text, author_id, created_at, public_metrics
 *    - ユーザーデータ: id, username, name, profile_image_url
 *    - メディアデータ: media_key, type, url, preview_image_url
 * 
 * 3. 【ページネーション】
 *    - max_results: 1-100（デフォルト10）
 *    - pagination_token: 次ページ取得用トークン
 *    - next_token/previous_token: 双方向ナビゲーション
 * 
 * 4. 【エラーハンドリング】
 *    - 401: 認証エラー（トークン無効・期限切れ）
 *    - 403: 権限エラー（スコープ不足・アカウント制限）
 *    - 429: レート制限超過（Retry-Afterヘッダー参照）
 *    - 5xx: サーバーエラー（指数バックオフでリトライ）
 * 
 * このクライアントは、これらの制約を考慮して安全で効率的な
 * X APIアクセスを提供し、アプリケーションの安定性を確保します。
 */

import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import {
  XApiClientConfig,
  XBookmarksResponse,
  XBookmarksResponseSchema,
  XApiError,
  XApiErrorSchema,
  RateLimitInfo,
  RateLimitInfoSchema,
} from '@x-bookmarker/shared';
import { CircuitBreaker, ExponentialBackoff, retryWithBackoff, CircuitBreakerError } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';

interface XApiRequestConfig {
  endpoint: string;
  params?: Record<string, any>;
  headers?: Record<string, string>;
  retryCount?: number;
  useCircuitBreaker?: boolean;
}

interface XApiErrorWithRetry extends XApiError {
  shouldRetry: boolean;
  retryAfter?: number;
}

interface XApiResponse<T> {
  data: T;
  rateLimit: RateLimitInfo;
  success: boolean;
}

/**
 * X API v2クライアントクラス
 * 
 * 💡 設計思想:
 * - レート制限の自動管理（プロアクティブな制限チェック）
 * - 指数バックオフによる智的リトライ
 * - 型安全なレスポンス処理（Zodバリデーション）
 * - 詳細なエラーコンテキスト提供
 * - 監視可能なログ出力
 * 
 * 使用例:
 * ```typescript
 * const client = new XApiClient({
 *   baseURL: 'https://api.twitter.com/2',
 *   bearerToken: 'your-token',
 *   timeout: 30000,
 *   retryAttempts: 3,
 *   retryDelay: 1000,
 *   rateLimitBuffer: 5
 * });
 * 
 * // ブックマーク取得
 * const bookmarks = await client.getBookmarks({
 *   userId: 'user123',
 *   maxResults: 100,
 *   tweetFields: ['created_at', 'public_metrics'],
 *   expansions: ['author_id', 'attachments.media_keys']
 * });
 * ```
 */
class XApiClient {
  private client: AxiosInstance;
  private config: XApiClientConfig;
  private rateLimitInfo: RateLimitInfo | null = null;
  private circuitBreaker: CircuitBreaker;

  constructor(config: XApiClientConfig) {
    this.config = config;

    logger.info('X APIクライアント初期化', {
      baseURL: config.baseURL,
      timeout: config.timeout,
      retryAttempts: config.retryAttempts,
      rateLimitBuffer: config.rateLimitBuffer,
    });

    // サーキットブレーカーを初期化
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5, // 5回失敗でOPEN
      successThreshold: 3, // 3回成功でCLOSED
      timeout: 60000, // 60秒後にHALF_OPEN
      monitoringPeriod: 300000, // 5分間の監視期間
      name: 'X-API-Client',
    });

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: {
        Authorization: `Bearer ${config.bearerToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'X-Bookmarker/1.0.0',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Axiosインターセプターの設定
   * 
   * 💡 インターセプターパターンの活用:
   * 
   * 【リクエストインターセプター】
   * - レート制限の事前チェック
   * - リクエストログの記録
   * - 認証ヘッダーの自動設定
   * 
   * 【レスポンスインターセプター】
   * - レート制限情報の更新
   * - エラーレスポンスの統一処理
   * - 自動リトライの制御
   */
  private setupInterceptors(): void {
    // Request interceptor for rate limit checking
    this.client.interceptors.request.use(
      async config => {
        console.log(`📤 X API リクエスト: ${config.method?.toUpperCase()} ${config.url}`);
        await this.checkRateLimit();
        return config;
      },
      error => {
        console.error(`❌ リクエストインターセプターエラー:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for rate limit tracking
    this.client.interceptors.response.use(
      response => {
        console.log(`📥 X API レスポンス: ${response.status} ${response.config.url}`);
        this.updateRateLimitInfo(response);
        this.logRateLimitInfo();
        return response;
      },
      async (error: AxiosError) => {
        const status = error.response?.status;
        const url = error.config?.url;
        
        console.error(`❌ X API エラー: ${status} ${url}`);
        
        this.updateRateLimitInfo(error.response);

        // Handle rate limit exceeded
        if (status === 429) {
          const retryAfter = this.getRetryAfter(error.response!);
          console.warn(`🚨 レート制限超過: ${retryAfter}ms後にリトライ`);
          throw new XApiRateLimitError(retryAfter, this.rateLimitInfo);
        }

        // Handle authentication errors
        if (status === 401) {
          console.error(`🔒 認証エラー: トークンが無効または期限切れ`);
          const apiError = this.parseXApiError(error.response?.data) || {
            type: 'authentication_error',
            title: 'Authentication Failed',
            detail: 'Bearer token is invalid or expired',
            value: null
          };
          throw new XApiRequestError(
            'errors' in apiError ? apiError : { ...apiError, errors: [] }, 
            status
          );
        }

        // Handle authorization errors
        if (status === 403) {
          console.error(`🚫 権限エラー: スコープまたは権限が不足`);
          const apiError = this.parseXApiError(error.response?.data) || {
            type: 'authorization_error',
            title: 'Insufficient Permissions',
            detail: 'Required scopes or permissions are missing',
            value: null
          };
          throw new XApiRequestError(
            'errors' in apiError ? apiError : { ...apiError, errors: [] }, 
            status
          );
        }

        // Handle other X API errors
        if (error.response?.data) {
          const apiError = this.parseXApiError(error.response.data);
          if (apiError) {
            console.error(`🐛 X API エラー: ${apiError.title} - ${apiError.detail}`);
            throw new XApiRequestError(apiError, status!);
          }
        }

        // Log unexpected errors
        console.error(`💥 予期しないエラー:`, error.message);
        throw error;
      }
    );
  }

  /**
   * ユーザーのブックマーク取得（ページネーション対応）
   * 
   * 💡 ブックマークAPI（/2/users/:id/bookmarks）の詳細:
   * 
   * 【取得可能なデータ】
   * - ツイート本文、作成日時、メトリクス
   * - 作者情報、プロフィール画像
   * - 添付メディア（画像、動画）
   * - リツイート、引用ツイート情報
   * 
   * 【フィールド指定のベストプラクティス】
   * - tweet.fields: created_at,public_metrics,author_id,lang
   * - user.fields: username,name,profile_image_url
   * - media.fields: url,preview_image_url,type,width,height
   * - expansions: author_id,attachments.media_keys
   * 
   * 【制限事項】
   * - 最大800件/リクエスト（ページネーション必須）
   * - プライベートアカウントのツイートは取得不可
   * - 削除されたツイートは除外される
   * 
   * 使用例:
   * ```typescript
   * const bookmarks = await client.getBookmarks({
   *   userId: 'user123',
   *   maxResults: 100,
   *   tweetFields: ['created_at', 'public_metrics', 'lang'],
   *   userFields: ['username', 'name', 'profile_image_url'],
   *   expansions: ['author_id', 'attachments.media_keys']
   * });
   * ```
   */
  async getBookmarks(params: {
    userId: string;
    maxResults?: number;
    paginationToken?: string;
    tweetFields?: string[];
    userFields?: string[];
    mediaFields?: string[];
    expansions?: string[];
  }): Promise<XApiResponse<XBookmarksResponse>> {
    const queryParams: Record<string, any> = {
      max_results: Math.min(params.maxResults || 100, 100), // 最大100件
    };

    if (params.paginationToken) {
      queryParams.pagination_token = params.paginationToken;
    }

    if (params.tweetFields?.length) {
      queryParams['tweet.fields'] = params.tweetFields.join(',');
    }

    if (params.userFields?.length) {
      queryParams['user.fields'] = params.userFields.join(',');
    }

    if (params.mediaFields?.length) {
      queryParams['media.fields'] = params.mediaFields.join(',');
    }

    if (params.expansions?.length) {
      queryParams.expansions = params.expansions.join(',');
    }

    logger.info('ブックマーク取得開始', {
      userId: params.userId,
      maxResults: queryParams.max_results,
      hasPagination: !!params.paginationToken,
      fields: {
        tweet: params.tweetFields?.length || 0,
        user: params.userFields?.length || 0,
        media: params.mediaFields?.length || 0,
        expansions: params.expansions?.length || 0,
      },
    });

    const response = await this.makeRequest<XBookmarksResponse>({
      endpoint: `/users/${params.userId}/bookmarks`,
      params: queryParams,
      useCircuitBreaker: true,
    });

    // Validate response structure
    const validationResult = XBookmarksResponseSchema.safeParse(response.data);
    if (!validationResult.success) {
      logger.error('X API レスポンス形式エラー', {
        userId: params.userId,
        error: validationResult.error.issues,
        responseStructure: Object.keys(response.data || {}),
      });
      throw new Error('Invalid X API bookmarks response format');
    }

    const bookmarksCount = validationResult.data.data?.length || 0;
    const hasNextPage = !!validationResult.data.meta?.next_token;
    
    logger.info('ブックマーク取得完了', {
      userId: params.userId,
      bookmarksCount,
      hasNextPage,
      nextToken: validationResult.data.meta?.next_token?.substring(0, 20),
      circuitBreakerState: this.circuitBreaker.getState(),
    });

    return {
      data: validationResult.data,
      rateLimit: response.rateLimit,
      success: true,
    };
  }

  /**
   * Get user information
   */
  async getUser(
    userId: string,
    userFields?: string[]
  ): Promise<XApiResponse<any>> {
    const queryParams: Record<string, any> = {};

    if (userFields?.length) {
      queryParams['user.fields'] = userFields.join(',');
    }

    return this.makeRequest({
      endpoint: `/users/${userId}`,
      params: queryParams,
      useCircuitBreaker: true,
    });
  }

  /**
   * Get multiple users by IDs
   */
  async getUsers(
    userIds: string[],
    userFields?: string[]
  ): Promise<XApiResponse<any>> {
    const queryParams: Record<string, any> = {
      ids: userIds.join(','),
    };

    if (userFields?.length) {
      queryParams['user.fields'] = userFields.join(',');
    }

    return this.makeRequest({
      endpoint: '/users',
      params: queryParams,
      useCircuitBreaker: true,
    });
  }

  /**
   * Get tweets by IDs
   */
  async getTweets(
    tweetIds: string[],
    tweetFields?: string[],
    expansions?: string[]
  ): Promise<XApiResponse<any>> {
    const queryParams: Record<string, any> = {
      ids: tweetIds.join(','),
    };

    if (tweetFields?.length) {
      queryParams['tweet.fields'] = tweetFields.join(',');
    }

    if (expansions?.length) {
      queryParams.expansions = expansions.join(',');
    }

    return this.makeRequest({
      endpoint: '/tweets',
      params: queryParams,
      useCircuitBreaker: true,
    });
  }

  /**
   * Make a generic API request with enhanced error recovery
   */
  private async makeRequest<T>(
    config: XApiRequestConfig
  ): Promise<XApiResponse<T>> {
    const operation = async (): Promise<XApiResponse<T>> => {
      const response = await this.client.get(config.endpoint, {
        params: config.params,
        headers: config.headers,
      });

      return {
        data: response.data,
        rateLimit: this.rateLimitInfo!,
        success: true,
      };
    };

    // Execute operation with retry logic
    for (let attempt = 1; attempt <= (config.retryCount || this.config.retryAttempts); attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === (config.retryCount || this.config.retryAttempts)) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt));
      }
    }
    
    // This should never be reached, but TypeScript requires it
    throw new Error('Retry attempts exhausted');
  }

  /**
   * Check if we need to wait due to rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    if (!this.rateLimitInfo) {
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const { remaining, reset } = this.rateLimitInfo;

    // If we have remaining requests and haven't reached reset time, continue
    if (remaining > this.config.rateLimitBuffer && reset > now) {
      return;
    }

    // If rate limit has reset, continue
    if (reset <= now) {
      this.rateLimitInfo = null;
      return;
    }

    // Wait until rate limit resets
    const waitTime = (reset - now) * 1000;
    console.log(
      `⏳ Rate limit exceeded, waiting ${Math.round(waitTime / 1000)}s until reset...`
    );
    await this.sleep(waitTime + 1000); // Add 1 second buffer
  }

  /**
   * レート制限情報をレスポンスヘッダーから更新
   * 
   * 💡 X API レート制限ヘッダー:
   * - x-rate-limit-limit: 制限値（75 requests/15分）
   * - x-rate-limit-remaining: 残りリクエスト数
   * - x-rate-limit-reset: 制限リセット時刻（UNIX timestamp）
   */
  private updateRateLimitInfo(response?: AxiosResponse): void {
    if (!response?.headers) {
      return;
    }

    const limit = parseInt(response.headers['x-rate-limit-limit'] || '0');
    const remaining = parseInt(
      response.headers['x-rate-limit-remaining'] || '0'
    );
    const reset = parseInt(response.headers['x-rate-limit-reset'] || '0');

    if (limit && reset) {
      const rateLimitData = { limit, remaining, reset };
      const validationResult = RateLimitInfoSchema.safeParse(rateLimitData);

      if (validationResult.success) {
        this.rateLimitInfo = validationResult.data;
      }
    }
  }

  /**
   * レート制限情報をログ出力
   */
  private logRateLimitInfo(): void {
    if (!this.rateLimitInfo) {
      return;
    }

    const { limit, remaining, reset } = this.rateLimitInfo;
    const now = Math.floor(Date.now() / 1000);
    const resetIn = Math.max(0, reset - now);
    const resetTime = new Date(reset * 1000).toLocaleTimeString('ja-JP');
    
    const percentage = ((remaining / limit) * 100).toFixed(1);
    
    if (remaining <= 10) {
      console.warn(`🚨 レート制限警告: ${remaining}/${limit} (${percentage}%) - ${resetTime}にリセット`);
    } else if (remaining <= 30) {
      console.log(`⚠️ レート制限注意: ${remaining}/${limit} (${percentage}%) - ${resetTime}にリセット`);
    } else {
      console.log(`📊 レート制限: ${remaining}/${limit} (${percentage}%) - ${resetTime}にリセット`);
    }
    
    if (resetIn <= 300) { // 5分以内
      console.log(`⏰ リセットまで: ${Math.floor(resetIn / 60)}分${resetIn % 60}秒`);
    }
  }

  /**
   * Get retry-after value from response headers
   */
  private getRetryAfter(response: AxiosResponse): number {
    const retryAfter = response.headers['retry-after'];
    if (retryAfter) {
      return parseInt(retryAfter) * 1000; // Convert to milliseconds
    }
    return 60000; // Default to 60 seconds
  }

  /**
   * Parse X API error response
   */
  private parseXApiError(data: any): XApiError | null {
    const validationResult = XApiErrorSchema.safeParse(data);
    return validationResult.success ? validationResult.data : null;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Update bearer token (for token refresh)
   */
  updateBearerToken(bearerToken: string): void {
    this.config.bearerToken = bearerToken;
    this.client.defaults.headers['Authorization'] = `Bearer ${bearerToken}`;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    console.log('🔄 アクセストークンを更新中...');

    try {
      const response = await axios.post('https://api.twitter.com/2/oauth2/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId,
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
        },
        transformRequest: [(data) => {
          return Object.keys(data)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
            .join('&');
        }],
      });

      console.log('✅ トークン更新成功');
      
      // Update the client's bearer token
      this.updateBearerToken(response.data.access_token);

      return response.data;
    } catch (error) {
      console.error('❌ トークン更新失敗:', error);
      
      if (axios.isAxiosError(error) && error.response) {
        throw new XApiRequestError(
          error.response.data,
          error.response.status
        );
      }
      
      throw error;
    }
  }
}

// Custom error classes
export class XApiRateLimitError extends Error {
  constructor(
    public retryAfter: number,
    public rateLimitInfo: RateLimitInfo | null
  ) {
    super(`X API rate limit exceeded. Retry after ${retryAfter}ms`);
    this.name = 'XApiRateLimitError';
  }
}

export class XApiRequestError extends Error {
  constructor(
    public apiError: XApiError,
    public status: number
  ) {
    super(`X API request failed: ${apiError.detail}`);
    this.name = 'XApiRequestError';
  }
}

// Factory function for creating X API client
export function createXApiClient(config: XApiClientConfig): XApiClient {
  return new XApiClient(config);
}

export { XApiClient };

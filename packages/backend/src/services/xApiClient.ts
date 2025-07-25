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

interface XApiRequestConfig {
  endpoint: string;
  params?: Record<string, any>;
  headers?: Record<string, string>;
  retryCount?: number;
}

interface XApiResponse<T> {
  data: T;
  rateLimit: RateLimitInfo;
  success: boolean;
}

class XApiClient {
  private client: AxiosInstance;
  private config: XApiClientConfig;
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(config: XApiClientConfig) {
    this.config = config;

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

  private setupInterceptors(): void {
    // Request interceptor for rate limit checking
    this.client.interceptors.request.use(
      async config => {
        await this.checkRateLimit();
        return config;
      },
      error => Promise.reject(error)
    );

    // Response interceptor for rate limit tracking
    this.client.interceptors.response.use(
      response => {
        this.updateRateLimitInfo(response);
        return response;
      },
      async (error: AxiosError) => {
        this.updateRateLimitInfo(error.response);

        // Handle rate limit exceeded
        if (error.response?.status === 429) {
          const retryAfter = this.getRetryAfter(error.response);
          throw new XApiRateLimitError(retryAfter, this.rateLimitInfo);
        }

        // Handle other X API errors
        if (error.response?.data) {
          const apiError = this.parseXApiError(error.response.data);
          if (apiError) {
            throw new XApiRequestError(apiError, error.response.status);
          }
        }

        throw error;
      }
    );
  }

  /**
   * Get user's bookmarks with pagination
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
      max_results: params.maxResults || 100,
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

    const response = await this.makeRequest<XBookmarksResponse>({
      endpoint: `/users/${params.userId}/bookmarks`,
      params: queryParams,
    });

    // Validate response structure
    const validationResult = XBookmarksResponseSchema.safeParse(response.data);
    if (!validationResult.success) {
      throw new Error('Invalid X API bookmarks response format');
    }

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
    });
  }

  /**
   * Make a generic API request with retry logic
   */
  private async makeRequest<T>(
    config: XApiRequestConfig
  ): Promise<XApiResponse<T>> {
    const maxRetries = config.retryCount || this.config.retryAttempts;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.get(config.endpoint, {
          params: config.params,
          headers: config.headers,
        });

        return {
          data: response.data,
          rateLimit: this.rateLimitInfo!,
          success: true,
        };
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx except 429)
        if (
          error instanceof XApiRequestError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 429
        ) {
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Calculate exponential backoff delay
        const baseDelay = this.config.retryDelay;
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const jitterDelay = exponentialDelay + Math.random() * 1000;
        const delay = Math.min(jitterDelay, 60000); // Cap at 60 seconds

        console.log(
          `🔄 X API request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms...`
        );
        await this.sleep(delay);
      }
    }

    throw lastError!;
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
   * Update rate limit information from response headers
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

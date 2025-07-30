import { Pool } from 'pg';
import { XApiClient, XApiRateLimitError, XApiRequestError } from './xApiClient';
import {
  XBookmarksResponse,
  XTweet,
  XUser,
  XMedia,
  SyncJobConfig,
  SyncJobStatus,
  SyncJobResult,
  CreateBookmark,
} from '@x-bookmarker/shared';

interface BookmarkSyncStats {
  tweetsProcessed: number;
  bookmarksAdded: number;
  bookmarksUpdated: number;
  bookmarksSkipped: number;
  errors: number;
}

interface ProcessedBookmark {
  xTweetId: string;
  content: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  mediaUrls: string[];
  links: string[];
  hashtags: string[];
  mentions: string[];
  bookmarkedAt: Date;
  isProcessed: boolean;
  error?: string;
}

class BookmarkService {
  constructor(
    private db: Pool,
    private xApiClient: XApiClient
  ) {}

  /**
   * Sync user's bookmarks from X API
   */
  async *syncUserBookmarks(
    userId: string,
    config: SyncJobConfig
  ): AsyncGenerator<SyncJobStatus, SyncJobResult, unknown> {
    const jobId = crypto.randomUUID();
    const stats: BookmarkSyncStats = {
      tweetsProcessed: 0,
      bookmarksAdded: 0,
      bookmarksUpdated: 0,
      bookmarksSkipped: 0,
      errors: 0,
    };

    let paginationToken: string | undefined;
    let hasMoreData = true;
    const startTime = Date.now();

    try {
      // Get user's X user ID
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      while (hasMoreData && stats.tweetsProcessed < config.maxTweets) {
        // Yield current status
        yield this.createJobStatus(jobId, userId, 'running', stats, startTime);

        try {
          // Fetch bookmarks from X API
          const response = await this.fetchBookmarksBatch(user.x_user_id, {
            maxResults: Math.min(
              config.batchSize,
              config.maxTweets - stats.tweetsProcessed
            ),
            paginationToken,
          });

          if (!response.data.data || response.data.data.length === 0) {
            hasMoreData = false;
            break;
          }

          // Process bookmarks batch
          const processedBookmarks = await this.processBookmarksBatch(
            response.data,
            userId
          );

          // Save bookmarks to database
          const batchStats = await this.saveBookmarksBatch(processedBookmarks);

          // Update stats
          stats.tweetsProcessed += response.data.data.length;
          stats.bookmarksAdded += batchStats.added;
          stats.bookmarksUpdated += batchStats.updated;
          stats.bookmarksSkipped += batchStats.skipped;
          stats.errors += batchStats.errors;

          // Check for next page
          paginationToken = response.data.meta.next_token;
          hasMoreData = !!paginationToken;

          // Rate limit handling
          if (response.rateLimit.remaining <= 5) {
            const resetTime = new Date(response.rateLimit.reset * 1000);
            yield this.createJobStatus(
              jobId,
              userId,
              'running',
              stats,
              startTime,
              {
                remaining: response.rateLimit.remaining,
                resetAt: resetTime.toISOString(),
                retryAfter: Math.max(
                  0,
                  response.rateLimit.reset * 1000 - Date.now()
                ),
              }
            );
          }
        } catch (error) {
          if (error instanceof XApiRateLimitError) {
            // Handle rate limiting
            const resetTime = new Date(Date.now() + error.retryAfter);
            yield this.createJobStatus(
              jobId,
              userId,
              'running',
              stats,
              startTime,
              {
                remaining: 0,
                resetAt: resetTime.toISOString(),
                retryAfter: error.retryAfter,
              }
            );

            // Wait for rate limit to reset
            await this.sleep(error.retryAfter);
            continue;
          } else if (error instanceof XApiRequestError) {
            stats.errors++;
            console.error('❌ X API request error:', error.apiError);

            // Continue with next batch for non-fatal errors
            if (error.status >= 500) {
              await this.sleep(5000); // Wait 5 seconds for server errors
              continue;
            } else {
              throw error; // Fatal client error
            }
          } else {
            throw error;
          }
        }
      }

      // Final status
      const duration = Date.now() - startTime;
      yield this.createJobStatus(jobId, userId, 'completed', stats, startTime);

      return {
        success: true,
        jobId,
        stats: {
          ...stats,
          duration,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorInfo = {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: error instanceof XApiRequestError ? 'X_API_ERROR' : 'SYNC_ERROR',
      };

      yield this.createJobStatus(
        jobId,
        userId,
        'failed',
        stats,
        startTime,
        undefined,
        errorInfo
      );

      return {
        success: false,
        jobId,
        stats: {
          ...stats,
          duration,
        },
        error: errorInfo,
      };
    }
  }

  /**
   * Fetch a batch of bookmarks from X API
   */
  private async fetchBookmarksBatch(
    xUserId: string,
    options: {
      maxResults: number;
      paginationToken?: string;
    }
  ) {
    return await this.xApiClient.getBookmarks({
      userId: xUserId,
      maxResults: options.maxResults,
      paginationToken: options.paginationToken,
      tweetFields: [
        'id',
        'text',
        'author_id',
        'created_at',
        'public_metrics',
        'entities',
        'attachments',
        'context_annotations',
        'conversation_id',
        'lang',
        'possibly_sensitive',
        'referenced_tweets',
        'source',
      ],
      userFields: [
        'id',
        'name',
        'username',
        'profile_image_url',
        'verified',
        'verified_type',
      ],
      mediaFields: [
        'media_key',
        'type',
        'url',
        'preview_image_url',
        'alt_text',
        'width',
        'height',
      ],
      expansions: [
        'author_id',
        'attachments.media_keys',
        'referenced_tweets.id',
      ],
    });
  }

  /**
   * Process a batch of bookmarks from X API response
   */
  private async processBookmarksBatch(
    response: XBookmarksResponse,
    userId: string
  ): Promise<ProcessedBookmark[]> {
    const tweets = response.data || [];
    const users = response.includes?.users || [];
    const media = response.includes?.media || [];

    // Create lookup maps
    const userMap = new Map(users.map(user => [user.id, user]));
    const mediaMap = new Map(media.map(m => [m.media_key, m]));

    const processedBookmarks: ProcessedBookmark[] = [];

    for (const tweet of tweets) {
      try {
        const author = userMap.get(tweet.author_id);
        if (!author) {
          console.warn(`⚠️  Author not found for tweet ${tweet.id}`);
          continue;
        }

        const mediaUrls = this.extractMediaUrls(tweet, mediaMap);
        const links = this.extractLinks(tweet);
        const hashtags = this.extractHashtags(tweet);
        const mentions = this.extractMentions(tweet);

        processedBookmarks.push({
          xTweetId: tweet.id,
          content: tweet.text,
          authorUsername: author.username,
          authorDisplayName: author.name,
          authorAvatarUrl: author.profile_image_url,
          mediaUrls,
          links,
          hashtags,
          mentions,
          bookmarkedAt: new Date(tweet.created_at),
          isProcessed: true,
        });
      } catch (error) {
        console.error(`❌ Error processing tweet ${tweet.id}:`, error);
        processedBookmarks.push({
          xTweetId: tweet.id,
          content: tweet.text || '',
          authorUsername: 'unknown',
          authorDisplayName: 'Unknown User',
          mediaUrls: [],
          links: [],
          hashtags: [],
          mentions: [],
          bookmarkedAt: new Date(tweet.created_at),
          isProcessed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return processedBookmarks;
  }

  /**
   * Save processed bookmarks to database
   */
  private async saveBookmarksBatch(
    processedBookmarks: ProcessedBookmark[]
  ): Promise<{
    added: number;
    updated: number;
    skipped: number;
    errors: number;
  }> {
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const bookmark of processedBookmarks) {
      if (!bookmark.isProcessed) {
        errors++;
        continue;
      }

      try {
        // Check if bookmark already exists
        const existing = await this.getBookmarkByXTweetId(bookmark.xTweetId);

        if (existing) {
          // Update existing bookmark if content changed
          if (existing.content !== bookmark.content) {
            await this.updateBookmark(existing.id, {
              content: bookmark.content,
              mediaUrls: bookmark.mediaUrls,
              links: bookmark.links,
              hashtags: bookmark.hashtags,
              mentions: bookmark.mentions,
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Create new bookmark
          await this.createBookmark({
            xTweetId: bookmark.xTweetId,
            content: bookmark.content,
            authorUsername: bookmark.authorUsername,
            authorDisplayName: bookmark.authorDisplayName,
            authorAvatarUrl: bookmark.authorAvatarUrl,
            mediaUrls: bookmark.mediaUrls,
            links: bookmark.links,
            hashtags: bookmark.hashtags,
            mentions: bookmark.mentions,
            tags: [], // Add empty tags array
            bookmarkedAt: bookmark.bookmarkedAt,
          });
          added++;
        }
      } catch (error) {
        console.error(`❌ Error saving bookmark ${bookmark.xTweetId}:`, error);
        errors++;
      }
    }

    return { added, updated, skipped, errors };
  }

  /**
   * Extract media URLs from tweet
   */
  private extractMediaUrls(
    tweet: XTweet,
    mediaMap: Map<string, XMedia>
  ): string[] {
    const mediaUrls: string[] = [];

    if (tweet.attachments?.media_keys) {
      for (const mediaKey of tweet.attachments.media_keys) {
        const media = mediaMap.get(mediaKey);
        if (media?.url) {
          mediaUrls.push(media.url);
        } else if (media?.preview_image_url) {
          mediaUrls.push(media.preview_image_url);
        }
      }
    }

    return mediaUrls;
  }

  /**
   * Extract links from tweet entities
   */
  private extractLinks(tweet: XTweet): string[] {
    return tweet.entities?.urls?.map(url => url.expanded_url) || [];
  }

  /**
   * Extract hashtags from tweet entities
   */
  private extractHashtags(tweet: XTweet): string[] {
    return tweet.entities?.hashtags?.map(hashtag => hashtag.tag) || [];
  }

  /**
   * Extract mentions from tweet entities
   */
  private extractMentions(tweet: XTweet): string[] {
    return tweet.entities?.mentions?.map(mention => mention.username) || [];
  }

  /**
   * Create job status object
   */
  private createJobStatus(
    jobId: string,
    userId: string,
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
    stats: BookmarkSyncStats,
    startTime: number,
    rateLimit?: {
      remaining: number;
      resetAt: string;
      retryAfter?: number;
    },
    error?: {
      message: string;
      code: string;
    }
  ): SyncJobStatus {
    const now = new Date().toISOString();
    const progress = {
      current: stats.tweetsProcessed,
      total: stats.tweetsProcessed, // We don't know total beforehand
      percentage: 0, // Can't calculate without knowing total
    };

    return {
      id: jobId,
      userId,
      status,
      progress,
      stats,
      rateLimit,
      error,
      startedAt: new Date(startTime).toISOString(),
      completedAt:
        status === 'completed' || status === 'failed' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  // Database helper methods
  private async getUserById(userId: string) {
    const result = await this.db.query('SELECT * FROM users WHERE id = $1', [
      userId,
    ]);
    return result.rows[0] || null;
  }

  // Public CRUD methods for API endpoints

  /**
   * Get user bookmarks with pagination and filtering
   */
  async getUserBookmarks(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      categoryId?: string;
      tags?: string[];
      text?: string;
      includeArchived?: boolean;
    } = {}
  ) {
    const {
      limit = 20,
      offset = 0,
      categoryId,
      tags,
      text,
      includeArchived = false,
    } = options;

    let query = `
      SELECT 
        b.*,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon
      FROM bookmarks b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1
    `;

    const params: any[] = [userId];
    let paramIndex = 2;

    if (!includeArchived) {
      query += ` AND b.is_archived = FALSE`;
    }

    if (categoryId) {
      query += ` AND b.category_id = $${paramIndex}`;
      params.push(categoryId);
      paramIndex++;
    }

    if (tags && tags.length > 0) {
      query += ` AND b.tags && $${paramIndex}`;
      params.push(tags);
      paramIndex++;
    }

    if (text) {
      query += ` AND b.search_vector @@ plainto_tsquery('english_unaccent', $${paramIndex})`;
      params.push(text);
      paramIndex++;
    }

    query += ` ORDER BY b.bookmarked_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Get single bookmark by ID
   */
  async getBookmarkById(bookmarkId: string, userId: string) {
    const result = await this.db.query(
      `
      SELECT 
        b.*,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon
      FROM bookmarks b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.id = $1 AND b.user_id = $2
    `,
      [bookmarkId, userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Create a new bookmark
   */
  async createBookmarkForUser(
    userId: string,
    data: CreateBookmark & { xTweetId: string }
  ) {
    const result = await this.db.query(
      `
      INSERT INTO bookmarks (
        user_id, x_tweet_id, content, author_username, author_display_name,
        author_avatar_url, media_urls, links, hashtags, mentions, 
        category_id, tags, bookmarked_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `,
      [
        userId,
        data.xTweetId,
        data.content,
        data.authorUsername,
        data.authorDisplayName,
        data.authorAvatarUrl,
        data.mediaUrls,
        data.links,
        data.hashtags,
        data.mentions,
        data.categoryId,
        data.tags,
        data.bookmarkedAt,
      ]
    );

    return result.rows[0];
  }

  /**
   * Update a bookmark
   */
  async updateBookmarkById(
    bookmarkId: string,
    userId: string,
    updates: {
      categoryId?: string;
      tags?: string[];
      isArchived?: boolean;
    }
  ) {
    const updateEntries = Object.entries(updates).filter(
      ([, value]) => value !== undefined
    );
    if (updateEntries.length === 0) return null;

    const setClause = updateEntries
      .map(([field], index) => `${field} = $${index + 3}`)
      .join(', ');
    const values = updateEntries.map(([, value]) => value);

    const result = await this.db.query(
      `
      UPDATE bookmarks 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `,
      [bookmarkId, userId, ...values]
    );

    return result.rows[0] || null;
  }

  /**
   * Delete a bookmark
   */
  async deleteBookmarkById(bookmarkId: string, userId: string) {
    const result = await this.db.query(
      'DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING id',
      [bookmarkId, userId]
    );

    return result.rows.length > 0;
  }

  /**
   * Bulk update bookmarks
   */
  async bulkUpdateBookmarks(
    bookmarkIds: string[],
    userId: string,
    updates: {
      categoryId?: string;
      tags?: string[];
      isArchived?: boolean;
    }
  ) {
    const updateEntries = Object.entries(updates).filter(
      ([, value]) => value !== undefined
    );
    if (updateEntries.length === 0) return [];

    const setClause = updateEntries
      .map(([field], index) => `${field} = $${index + 3}`)
      .join(', ');
    const values = updateEntries.map(([, value]) => value);

    const result = await this.db.query(
      `
      UPDATE bookmarks 
      SET ${setClause}, updated_at = NOW()
      WHERE id = ANY($1) AND user_id = $2
      RETURNING id
    `,
      [bookmarkIds, userId, ...values]
    );

    return result.rows;
  }

  private async getBookmarkByXTweetId(xTweetId: string) {
    const result = await this.db.query(
      'SELECT * FROM bookmarks WHERE x_tweet_id = $1',
      [xTweetId]
    );
    return result.rows[0] || null;
  }

  private async createBookmark(data: CreateBookmark & { xTweetId: string }) {
    const result = await this.db.query(
      `
      INSERT INTO bookmarks (
        user_id, x_tweet_id, content, author_username, author_display_name,
        author_avatar_url, media_urls, links, hashtags, mentions, bookmarked_at
      )
      VALUES (
        (SELECT id FROM users WHERE x_user_id = $1), 
        $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )
      RETURNING id
    `,
      [
        data.authorUsername, // Temporary: need to pass user_id properly
        data.xTweetId,
        data.content,
        data.authorUsername,
        data.authorDisplayName,
        data.authorAvatarUrl,
        data.mediaUrls,
        data.links,
        data.hashtags,
        data.mentions,
        data.bookmarkedAt,
      ]
    );

    return result.rows[0];
  }

  private async updateBookmark(
    bookmarkId: string,
    updates: Partial<CreateBookmark>
  ) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields
      .map((field, index) => `${field} = $${index + 2}`)
      .join(', ');

    await this.db.query(
      `
      UPDATE bookmarks 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
    `,
      [bookmarkId, ...values]
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Upsert bookmarks from X API data for sync worker
   */
  async upsertBookmarks(
    userId: string,
    bookmarksData: any[]
  ): Promise<{ newCount: number; updatedCount: number }> {
    let newCount = 0;
    let updatedCount = 0;

    for (const tweet of bookmarksData) {
      try {
        // Extract user info from included data (assuming it's included)
        const author = tweet.author || {
          username: 'unknown',
          name: 'Unknown User',
          profile_image_url: null,
        };

        // Extract media URLs, links, hashtags, mentions
        const mediaUrls = tweet.attachments?.media_keys?.map((key: string) => {
          const media = tweet.media?.find((m: any) => m.media_key === key);
          return media?.url || media?.preview_image_url;
        }).filter(Boolean) || [];

        const links = tweet.entities?.urls?.map((url: any) => url.expanded_url) || [];
        const hashtags = tweet.entities?.hashtags?.map((tag: any) => tag.tag) || [];
        const mentions = tweet.entities?.mentions?.map((mention: any) => mention.username) || [];

        // Check if bookmark already exists
        const existing = await this.getBookmarkByXTweetId(tweet.id);

        if (existing) {
          // Update if content differs
          if (existing.content !== tweet.text) {
            await this.updateBookmark(existing.id, {
              content: tweet.text,
              mediaUrls,
              links,
              hashtags,
              mentions,
            });
            updatedCount++;
          }
        } else {
          // Create new bookmark
          await this.db.query(
            `
            INSERT INTO bookmarks (
              user_id, x_tweet_id, content, author_username, author_display_name,
              author_avatar_url, media_urls, links, hashtags, mentions, 
              bookmarked_at, tags
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
            [
              userId,
              tweet.id,
              tweet.text,
              author.username,
              author.name,
              author.profile_image_url,
              mediaUrls,
              links,
              hashtags,
              mentions,
              new Date(tweet.created_at),
              [], // empty tags array
            ]
          );
          newCount++;
        }
      } catch (error) {
        console.error(`Error upserting bookmark ${tweet.id}:`, error);
        // Continue with next bookmark
      }
    }

    return { newCount, updatedCount };
  }
}

export { BookmarkService };

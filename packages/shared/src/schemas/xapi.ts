import { z } from 'zod';

// X API v2 Tweet object schema
export const XTweetSchema = z.object({
  id: z.string(),
  text: z.string(),
  author_id: z.string(),
  created_at: z.string().datetime(),
  public_metrics: z
    .object({
      like_count: z.number(),
      retweet_count: z.number(),
      reply_count: z.number(),
      quote_count: z.number(),
      bookmark_count: z.number().optional(),
      impression_count: z.number().optional(),
    })
    .optional(),
  entities: z
    .object({
      urls: z
        .array(
          z.object({
            start: z.number(),
            end: z.number(),
            url: z.string(),
            expanded_url: z.string(),
            display_url: z.string(),
            unwound_url: z.string().optional(),
          })
        )
        .optional(),
      hashtags: z
        .array(
          z.object({
            start: z.number(),
            end: z.number(),
            tag: z.string(),
          })
        )
        .optional(),
      mentions: z
        .array(
          z.object({
            start: z.number(),
            end: z.number(),
            username: z.string(),
            id: z.string(),
          })
        )
        .optional(),
      annotations: z
        .array(
          z.object({
            start: z.number(),
            end: z.number(),
            probability: z.number(),
            type: z.string(),
            normalized_text: z.string(),
          })
        )
        .optional(),
    })
    .optional(),
  attachments: z
    .object({
      media_keys: z.array(z.string()).optional(),
      poll_ids: z.array(z.string()).optional(),
    })
    .optional(),
  context_annotations: z
    .array(
      z.object({
        domain: z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().optional(),
        }),
        entity: z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().optional(),
        }),
      })
    )
    .optional(),
  conversation_id: z.string().optional(),
  in_reply_to_user_id: z.string().optional(),
  lang: z.string().optional(),
  possibly_sensitive: z.boolean().optional(),
  referenced_tweets: z
    .array(
      z.object({
        type: z.enum(['retweeted', 'quoted', 'replied_to']),
        id: z.string(),
      })
    )
    .optional(),
  reply_settings: z
    .enum(['everyone', 'mentionedUsers', 'followers'])
    .optional(),
  source: z.string().optional(),
});

export type XTweet = z.infer<typeof XTweetSchema>;

// X API v2 User object schema
export const XUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  created_at: z.string().datetime().optional(),
  description: z.string().optional(),
  entities: z
    .object({
      url: z
        .object({
          urls: z.array(
            z.object({
              start: z.number(),
              end: z.number(),
              url: z.string(),
              expanded_url: z.string(),
              display_url: z.string(),
            })
          ),
        })
        .optional(),
      description: z
        .object({
          urls: z.array(
            z.object({
              start: z.number(),
              end: z.number(),
              url: z.string(),
              expanded_url: z.string(),
              display_url: z.string(),
            })
          ),
          hashtags: z.array(
            z.object({
              start: z.number(),
              end: z.number(),
              tag: z.string(),
            })
          ),
          mentions: z.array(
            z.object({
              start: z.number(),
              end: z.number(),
              username: z.string(),
              id: z.string(),
            })
          ),
        })
        .optional(),
    })
    .optional(),
  location: z.string().optional(),
  pinned_tweet_id: z.string().optional(),
  profile_image_url: z.string().url().optional(),
  protected: z.boolean().optional(),
  public_metrics: z
    .object({
      followers_count: z.number(),
      following_count: z.number(),
      tweet_count: z.number(),
      listed_count: z.number(),
      like_count: z.number().optional(),
    })
    .optional(),
  url: z.string().url().optional(),
  verified: z.boolean().optional(),
  verified_type: z.enum(['blue', 'business', 'government']).optional(),
  withheld: z
    .object({
      country_codes: z.array(z.string()),
      scope: z.enum(['tweet', 'user']),
    })
    .optional(),
});

export type XUser = z.infer<typeof XUserSchema>;

// X API v2 Media object schema
export const XMediaSchema = z.object({
  media_key: z.string(),
  type: z.enum(['photo', 'video', 'animated_gif']),
  url: z.string().url().optional(),
  duration_ms: z.number().optional(),
  height: z.number().optional(),
  preview_image_url: z.string().url().optional(),
  public_metrics: z
    .object({
      view_count: z.number().optional(),
    })
    .optional(),
  width: z.number().optional(),
  alt_text: z.string().optional(),
  variants: z
    .array(
      z.object({
        bit_rate: z.number().optional(),
        content_type: z.string(),
        url: z.string().url(),
      })
    )
    .optional(),
});

export type XMedia = z.infer<typeof XMediaSchema>;

// X API v2 Bookmarks response schema
export const XBookmarksResponseSchema = z.object({
  data: z.array(XTweetSchema).optional(),
  includes: z
    .object({
      users: z.array(XUserSchema).optional(),
      media: z.array(XMediaSchema).optional(),
      tweets: z.array(XTweetSchema).optional(),
    })
    .optional(),
  meta: z.object({
    result_count: z.number(),
    next_token: z.string().optional(),
    previous_token: z.string().optional(),
  }),
  errors: z
    .array(
      z.object({
        detail: z.string(),
        title: z.string(),
        resource_type: z.string(),
        parameter: z.string(),
        value: z.string(),
        type: z.string().url(),
      })
    )
    .optional(),
});

export type XBookmarksResponse = z.infer<typeof XBookmarksResponseSchema>;

// X API error response schema
export const XApiErrorSchema = z.object({
  errors: z.array(
    z.object({
      message: z.string(),
      code: z.number(),
    })
  ),
  title: z.string(),
  detail: z.string(),
  type: z.string().url(),
});

export type XApiError = z.infer<typeof XApiErrorSchema>;

// Rate limit info schema
export const RateLimitInfoSchema = z.object({
  limit: z.number(),
  remaining: z.number(),
  reset: z.number(), // Unix timestamp
});

export type RateLimitInfo = z.infer<typeof RateLimitInfoSchema>;

// Sync job configuration schema
export const SyncJobConfigSchema = z.object({
  userId: z.string().uuid(),
  fullSync: z.boolean().default(false),
  maxTweets: z.number().int().min(1).max(3200).default(200),
  batchSize: z.number().int().min(1).max(100).default(50),
  includeRetweets: z.boolean().default(true),
  includeReplies: z.boolean().default(true),
  sinceId: z.string().optional(),
  untilId: z.string().optional(),
  webhookUrl: z.string().url().optional(),
});

export type SyncJobConfig = z.infer<typeof SyncJobConfigSchema>;

// Sync job status schema
export const SyncJobStatusSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  progress: z.object({
    current: z.number().int().min(0),
    total: z.number().int().min(0),
    percentage: z.number().min(0).max(100),
  }),
  stats: z.object({
    tweetsProcessed: z.number().int().min(0),
    bookmarksAdded: z.number().int().min(0),
    bookmarksUpdated: z.number().int().min(0),
    bookmarksSkipped: z.number().int().min(0),
    errors: z.number().int().min(0),
  }),
  rateLimit: z
    .object({
      remaining: z.number().int().min(0),
      resetAt: z.string().datetime(),
      retryAfter: z.number().int().min(0).optional(),
    })
    .optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string(),
      details: z.record(z.any()).optional(),
    })
    .optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  estimatedCompletionAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SyncJobStatus = z.infer<typeof SyncJobStatusSchema>;

// Sync job result schema
export const SyncJobResultSchema = z.object({
  success: z.boolean(),
  jobId: z.string().uuid(),
  stats: z.object({
    tweetsProcessed: z.number().int().min(0),
    bookmarksAdded: z.number().int().min(0),
    bookmarksUpdated: z.number().int().min(0),
    bookmarksSkipped: z.number().int().min(0),
    errors: z.number().int().min(0),
    duration: z.number().int().min(0), // milliseconds
  }),
  error: z
    .object({
      message: z.string(),
      code: z.string(),
    })
    .optional(),
});

export type SyncJobResult = z.infer<typeof SyncJobResultSchema>;

// X API client configuration schema
export const XApiClientConfigSchema = z.object({
  bearerToken: z.string(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  accessToken: z.string().optional(),
  accessTokenSecret: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  baseURL: z.string().url().default('https://api.twitter.com/2'),
  timeout: z.number().int().min(1000).default(30000),
  retryAttempts: z.number().int().min(0).max(5).default(3),
  retryDelay: z.number().int().min(100).default(1000),
  rateLimitBuffer: z.number().int().min(0).max(10).default(5), // Keep 5 requests in buffer
});

export type XApiClientConfig = z.infer<typeof XApiClientConfigSchema>;

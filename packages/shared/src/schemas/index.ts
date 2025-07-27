import { z } from 'zod';

export const UserSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  viewMode: z.enum(['grid', 'list']).default('grid'),
  defaultCategory: z.string().optional(),
  autoSync: z.boolean().default(true),
  aiSuggestions: z.boolean().default(true),
});

export const CreateUserSchema = z.object({
  xUserId: z.string(),
  username: z.string().min(1).max(50),
  displayName: z.string().min(1).max(100),
  avatarUrl: z.string().url().optional(),
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenExpiresAt: z.date(),
  settings: UserSettingsSchema.optional(),
});

export const UpdateUserSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  settings: UserSettingsSchema.optional(),
});

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  icon: z.string().min(1).max(50),
  parentId: z.string().uuid().optional(),
  order: z.number().int().min(0).optional(),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .optional(),
  icon: z.string().min(1).max(50).optional(),
  parentId: z.string().uuid().optional(),
  order: z.number().int().min(0).optional(),
});

export const CreateBookmarkSchema = z.object({
  xTweetId: z.string(),
  content: z.string(),
  authorUsername: z.string(),
  authorDisplayName: z.string(),
  authorAvatarUrl: z.string().url().optional(),
  mediaUrls: z.array(z.string().url()).default([]),
  links: z.array(z.string().url()).default([]),
  hashtags: z.array(z.string()).default([]),
  mentions: z.array(z.string()).default([]),
  categoryId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
  bookmarkedAt: z.date(),
});

export const UpdateBookmarkSchema = z.object({
  categoryId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  isArchived: z.boolean().optional(),
});

export const SearchQuerySchema = z.object({
  text: z.string().optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string()).optional(),
  authorUsername: z.string().optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  hasMedia: z.boolean().optional(),
  hasLinks: z.boolean().optional(),
  sortBy: z.enum(['relevance', 'date', 'author']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .optional(),
});

export const UpdateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .optional(),
});

export const BulkUpdateBookmarksSchema = z.object({
  bookmarkIds: z.array(z.string().uuid()).min(1),
  updates: z.object({
    categoryId: z.string().uuid().optional(),
    tags: z.array(z.string()).optional(),
    isArchived: z.boolean().optional(),
  }),
});

export const ExportOptionsSchema = z.object({
  format: z.enum(['json', 'csv']),
  includeMedia: z.boolean().default(false),
  categoryIds: z.array(z.string().uuid()).optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
});

export const SyncOptionsSchema = z.object({
  fullSync: z.boolean().default(false),
  includeMedia: z.boolean().default(true),
  batchSize: z.number().int().min(1).max(100).default(50),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const RegisterSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type UserSettings = z.infer<typeof UserSettingsSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type CreateCategory = z.infer<typeof CreateCategorySchema>;
export type UpdateCategory = z.infer<typeof UpdateCategorySchema>;
export type CreateBookmark = z.infer<typeof CreateBookmarkSchema>;
export type UpdateBookmark = z.infer<typeof UpdateBookmarkSchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type CreateTag = z.infer<typeof CreateTagSchema>;
export type UpdateTag = z.infer<typeof UpdateTagSchema>;
export type BulkUpdateBookmarks = z.infer<typeof BulkUpdateBookmarksSchema>;
export type ExportOptions = z.infer<typeof ExportOptionsSchema>;
export type SyncOptions = z.infer<typeof SyncOptionsSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type Register = z.infer<typeof RegisterSchema>;
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

// Re-export auth schemas
export * from './auth';

// API Response and Error schemas
export const APIErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.any()).optional(),
  field: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

export const ValidationErrorSchema = z.object({
  code: z.literal('VALIDATION_ERROR'),
  message: z.string(),
  errors: z.array(
    z.object({
      field: z.string(),
      message: z.string(),
      code: z.string(),
      value: z.any().optional(),
    })
  ),
});

export const APIResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: APIErrorSchema.optional(),
  message: z.string().optional(),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
});

export const PaginatedResponseSchema = z.object({
  success: z.boolean().default(true),
  data: z.array(z.any()),
  pagination: z.object({
    totalCount: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    totalPages: z.number().int().min(0),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
  error: APIErrorSchema.optional(),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
});

export type APIError = z.infer<typeof APIErrorSchema>;
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type APIResponseType<T = any> = Omit<z.infer<typeof APIResponseSchema>, 'data'> & {
  data?: T;
};
export type PaginatedResponseType<T = any> = Omit<z.infer<typeof PaginatedResponseSchema>, 'data'> & {
  data: T[];
};

// Re-export auth schemas
export * from './auth';

// Re-export validation utilities
export * from './validation';

// Re-export X API schemas
export * from './xapi';

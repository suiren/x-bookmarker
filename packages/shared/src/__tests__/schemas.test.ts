import {
  CreateUserSchema,
  CreateBookmarkSchema,
  CreateCategorySchema,
  SearchQuerySchema,
  APIResponseSchema,
  PaginatedResponseSchema,
  ValidationErrorSchema,
} from '../schemas';

describe('Schema Validation', () => {
  describe('CreateUserSchema', () => {
    it('should validate valid user data', () => {
      const validUser = {
        xUserId: '123456789',
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        tokenExpiresAt: new Date(),
      };

      expect(() => CreateUserSchema.parse(validUser)).not.toThrow();
    });

    it('should reject invalid user data', () => {
      const invalidUser = {
        xUserId: '123456789',
        username: '', // Empty username should fail
        displayName: 'Test User',
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        tokenExpiresAt: new Date(),
      };

      expect(() => CreateUserSchema.parse(invalidUser)).toThrow();
    });

    it('should handle optional fields', () => {
      const userWithoutOptionals = {
        xUserId: '123456789',
        username: 'testuser',
        displayName: 'Test User',
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        tokenExpiresAt: new Date(),
      };

      expect(() => CreateUserSchema.parse(userWithoutOptionals)).not.toThrow();
    });
  });

  describe('CreateBookmarkSchema', () => {
    it('should validate valid bookmark data', () => {
      const validBookmark = {
        xTweetId: '1234567890123456789',
        content: 'This is a test tweet content',
        authorUsername: 'testauthor',
        authorDisplayName: 'Test Author',
        authorAvatarUrl: 'https://example.com/author.jpg',
        mediaUrls: ['https://example.com/media1.jpg'],
        links: ['https://example.com/link1'],
        hashtags: ['test', 'bookmark'],
        mentions: ['testuser'],
        categoryId: '550e8400-e29b-41d4-a716-446655440000',
        tags: ['important', 'reference'],
        bookmarkedAt: new Date(),
      };

      expect(() => CreateBookmarkSchema.parse(validBookmark)).not.toThrow();
    });

    it('should handle empty arrays as defaults', () => {
      const minimalBookmark = {
        xTweetId: '1234567890123456789',
        content: 'Minimal tweet content',
        authorUsername: 'testauthor',
        authorDisplayName: 'Test Author',
        bookmarkedAt: new Date(),
      };

      const parsed = CreateBookmarkSchema.parse(minimalBookmark);
      expect(parsed.mediaUrls).toEqual([]);
      expect(parsed.links).toEqual([]);
      expect(parsed.hashtags).toEqual([]);
      expect(parsed.mentions).toEqual([]);
      expect(parsed.tags).toEqual([]);
    });
  });

  describe('CreateCategorySchema', () => {
    it('should validate valid category data', () => {
      const validCategory = {
        name: 'Tech Articles',
        description: 'Technology related bookmarks',
        color: '#3B82F6',
        icon: 'laptop',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
        order: 1,
      };

      expect(() => CreateCategorySchema.parse(validCategory)).not.toThrow();
    });

    it('should reject invalid color format', () => {
      const invalidCategory = {
        name: 'Tech Articles',
        color: 'blue', // Invalid color format
        icon: 'laptop',
      };

      expect(() => CreateCategorySchema.parse(invalidCategory)).toThrow();
    });

    it('should require valid UUID for parentId', () => {
      const invalidCategory = {
        name: 'Tech Articles',
        color: '#3B82F6',
        icon: 'laptop',
        parentId: 'invalid-uuid',
      };

      expect(() => CreateCategorySchema.parse(invalidCategory)).toThrow();
    });
  });

  describe('SearchQuerySchema', () => {
    it('should validate valid search query', () => {
      const validQuery = {
        text: 'react typescript',
        categoryIds: ['550e8400-e29b-41d4-a716-446655440000'],
        tags: ['react', 'typescript'],
        authorUsername: 'testuser',
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-12-31'),
        hasMedia: true,
        hasLinks: false,
        sortBy: 'date',
        sortOrder: 'desc',
        limit: 50,
        offset: 0,
      };

      expect(() => SearchQuerySchema.parse(validQuery)).not.toThrow();
    });

    it('should apply default values', () => {
      const minimalQuery = {};
      const parsed = SearchQuerySchema.parse(minimalQuery);

      expect(parsed.sortBy).toBe('relevance');
      expect(parsed.sortOrder).toBe('desc');
      expect(parsed.limit).toBe(20);
      expect(parsed.offset).toBe(0);
    });

    it('should enforce limit constraints', () => {
      const invalidQuery = {
        limit: 200, // Exceeds max of 100
      };

      expect(() => SearchQuerySchema.parse(invalidQuery)).toThrow();
    });
  });

  describe('APIResponseSchema', () => {
    it('should validate valid API response', () => {
      const validResponse = {
        success: true,
        data: { id: '123', name: 'test' },
        message: 'Success',
      };

      const parsed = APIResponseSchema.parse(validResponse);
      expect(parsed.success).toBe(true);
      expect(parsed.timestamp).toBeDefined();
    });

    it('should validate error response', () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
      };

      expect(() => APIResponseSchema.parse(errorResponse)).not.toThrow();
    });
  });

  describe('PaginatedResponseSchema', () => {
    it('should validate valid paginated response', () => {
      const validResponse = {
        success: true,
        data: [{ id: '1' }, { id: '2' }],
        pagination: {
          totalCount: 100,
          page: 1,
          limit: 20,
          totalPages: 5,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      };

      const parsed = PaginatedResponseSchema.parse(validResponse);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toHaveLength(2);
      expect(parsed.pagination.totalCount).toBe(100);
    });

    it('should enforce pagination constraints', () => {
      const invalidResponse = {
        data: [],
        pagination: {
          totalCount: -1, // Negative total count should fail
          page: 0, // Page should be at least 1
          limit: 0, // Limit should be at least 1
          totalPages: -1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      expect(() => PaginatedResponseSchema.parse(invalidResponse)).toThrow();
    });
  });

  describe('ValidationErrorSchema', () => {
    it('should validate validation error format', () => {
      const validationError = {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: [
          {
            field: 'username',
            message: 'Username is required',
            code: 'required',
            value: '',
          },
          {
            field: 'email',
            message: 'Invalid email format',
            code: 'invalid_format',
          },
        ],
      };

      expect(() => ValidationErrorSchema.parse(validationError)).not.toThrow();
    });

    it('should require VALIDATION_ERROR code', () => {
      const invalidError = {
        code: 'GENERIC_ERROR', // Should be 'VALIDATION_ERROR'
        message: 'Validation failed',
        errors: [],
      };

      expect(() => ValidationErrorSchema.parse(invalidError)).toThrow();
    });
  });
});
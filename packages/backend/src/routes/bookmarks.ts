import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import {
  SearchQuerySchema,
  UpdateBookmarkSchema,
  BulkUpdateBookmarksSchema,
  CreateBookmarkSchema,
} from '@x-bookmarker/shared';
import { authenticateJWT } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';

const router = Router();

// Database connection (will be injected from app)
let db: Pool;

export const setDatabase = (database: Pool): void => {
  db = database;
};

// Apply authentication to all bookmark routes
router.use(authenticateJWT);

/**
 * Get user's bookmarks with pagination and filtering
 * GET /bookmarks
 */
router.get('/', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    // Parse and validate query parameters
    const queryValidation = SearchQuerySchema.safeParse({
      ...req.query,
      // Convert string values to appropriate types
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset
        ? parseInt(req.query.offset as string)
        : undefined,
      hasMedia:
        req.query.hasMedia === 'true'
          ? true
          : req.query.hasMedia === 'false'
            ? false
            : undefined,
      hasLinks:
        req.query.hasLinks === 'true'
          ? true
          : req.query.hasLinks === 'false'
            ? false
            : undefined,
      categoryIds: req.query.categoryIds
        ? Array.isArray(req.query.categoryIds)
          ? req.query.categoryIds
          : [req.query.categoryIds]
        : undefined,
      tags: req.query.tags
        ? Array.isArray(req.query.tags)
          ? req.query.tags
          : [req.query.tags]
        : undefined,
      dateFrom: req.query.dateFrom
        ? new Date(req.query.dateFrom as string)
        : undefined,
      dateTo: req.query.dateTo
        ? new Date(req.query.dateTo as string)
        : undefined,
    });

    if (!queryValidation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        code: 'INVALID_QUERY_PARAMS',
        details: queryValidation.error.issues,
      });
      return;
    }

    const query = queryValidation.data;

    // Build SQL query with filters
    let sqlQuery = `
      SELECT 
        b.*,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon
      FROM bookmarks b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $1
    `;

    const queryParams: any[] = [req.user.userId];
    let paramIndex = 2;

    // Add filters
    if (query.text) {
      sqlQuery += ` AND b.search_vector @@ plainto_tsquery('english_unaccent', $${paramIndex})`;
      queryParams.push(query.text);
      paramIndex++;
    }

    if (query.categoryIds && query.categoryIds.length > 0) {
      sqlQuery += ` AND b.category_id = ANY($${paramIndex})`;
      queryParams.push(query.categoryIds);
      paramIndex++;
    }

    if (query.tags && query.tags.length > 0) {
      sqlQuery += ` AND b.tags && $${paramIndex}`;
      queryParams.push(query.tags);
      paramIndex++;
    }

    if (query.authorUsername) {
      sqlQuery += ` AND b.author_username ILIKE $${paramIndex}`;
      queryParams.push(`%${query.authorUsername}%`);
      paramIndex++;
    }

    if (query.dateFrom) {
      sqlQuery += ` AND b.bookmarked_at >= $${paramIndex}`;
      queryParams.push(query.dateFrom);
      paramIndex++;
    }

    if (query.dateTo) {
      sqlQuery += ` AND b.bookmarked_at <= $${paramIndex}`;
      queryParams.push(query.dateTo);
      paramIndex++;
    }

    if (query.hasMedia !== undefined) {
      if (query.hasMedia) {
        sqlQuery += ` AND array_length(b.media_urls, 1) > 0`;
      } else {
        sqlQuery += ` AND (array_length(b.media_urls, 1) IS NULL OR array_length(b.media_urls, 1) = 0)`;
      }
    }

    if (query.hasLinks !== undefined) {
      if (query.hasLinks) {
        sqlQuery += ` AND array_length(b.links, 1) > 0`;
      } else {
        sqlQuery += ` AND (array_length(b.links, 1) IS NULL OR array_length(b.links, 1) = 0)`;
      }
    }

    // Add archived filter (default to non-archived only)
    const includeArchived = req.query.includeArchived === 'true';
    if (!includeArchived) {
      sqlQuery += ` AND b.is_archived = FALSE`;
    }

    // Add sorting
    switch (query.sortBy) {
      case 'date':
        sqlQuery += ` ORDER BY b.bookmarked_at ${query.sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
        break;
      case 'author':
        sqlQuery += ` ORDER BY b.author_display_name ${query.sortOrder === 'asc' ? 'ASC' : 'DESC'}, b.bookmarked_at DESC`;
        break;
      case 'relevance':
      default:
        if (query.text) {
          sqlQuery += ` ORDER BY ts_rank(b.search_vector, plainto_tsquery('english_unaccent', $1)) DESC, b.bookmarked_at DESC`;
        } else {
          sqlQuery += ` ORDER BY b.bookmarked_at DESC`;
        }
        break;
    }

    // Get total count for pagination
    const countQuery = sqlQuery
      .replace(/SELECT.*?FROM/, 'SELECT COUNT(*) FROM')
      .replace(/ORDER BY.*$/, '');
    const countResult = await db.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Add pagination
    sqlQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(query.limit, query.offset);

    // Execute main query
    const result = await db.query(sqlQuery, queryParams);

    res.json({
      success: true,
      data: {
        bookmarks: result.rows.map(formatBookmark),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: totalCount,
          hasMore: query.offset + query.limit < totalCount,
        },
        query: {
          ...query,
          executionTime: Date.now(),
        },
      },
    });
  } catch (error) {
    console.error('❌ Get bookmarks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve bookmarks',
      code: 'GET_BOOKMARKS_ERROR',
    });
  }
});

/**
 * Get single bookmark by ID
 * GET /bookmarks/:id
 */
router.get('/:id', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const bookmarkId = req.params.id;

    const result = await db.query(
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
      [bookmarkId, req.user.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Bookmark not found',
        code: 'BOOKMARK_NOT_FOUND',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        bookmark: formatBookmark(result.rows[0]),
      },
    });
  } catch (error) {
    console.error('❌ Get bookmark error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve bookmark',
      code: 'GET_BOOKMARK_ERROR',
    });
  }
});

/**
 * Create new bookmark manually
 * POST /bookmarks
 */
router.post('/', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    // Validate request body
    const bodyValidation = CreateBookmarkSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid bookmark data',
        code: 'INVALID_BOOKMARK_DATA',
        details: bodyValidation.error.issues,
      });
      return;
    }

    const data = bodyValidation.data;

    // Check if bookmark with same X tweet ID already exists for this user
    const existingBookmark = await db.query(
      'SELECT id FROM bookmarks WHERE user_id = $1 AND x_tweet_id = $2',
      [req.user.userId, data.xTweetId]
    );

    if (existingBookmark.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: 'Bookmark with this tweet ID already exists',
        code: 'BOOKMARK_ALREADY_EXISTS',
      });
      return;
    }

    // Verify category exists if provided
    if (data.categoryId) {
      const categoryResult = await db.query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [data.categoryId, req.user.userId]
      );

      if (categoryResult.rows.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Category not found',
          code: 'CATEGORY_NOT_FOUND',
        });
        return;
      }
    }

    // Create bookmark
    const result = await db.query(
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
        req.user.userId,
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

    res.status(201).json({
      success: true,
      data: {
        bookmark: formatBookmark(result.rows[0]),
      },
      message: 'Bookmark created successfully',
    });
  } catch (error) {
    console.error('❌ Create bookmark error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bookmark',
      code: 'CREATE_BOOKMARK_ERROR',
    });
  }
});

/**
 * Update bookmark
 * PUT /bookmarks/:id
 */
router.put('/:id', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const bookmarkId = req.params.id;

    // Validate request body
    const bodyValidation = UpdateBookmarkSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid update data',
        code: 'INVALID_UPDATE_DATA',
        details: bodyValidation.error.issues,
      });
      return;
    }

    const updates = bodyValidation.data;

    // Check if bookmark exists and belongs to user
    const existingBookmark = await db.query(
      'SELECT id FROM bookmarks WHERE id = $1 AND user_id = $2',
      [bookmarkId, req.user.userId]
    );

    if (existingBookmark.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Bookmark not found',
        code: 'BOOKMARK_NOT_FOUND',
      });
      return;
    }

    // Verify category exists if provided
    if (updates.categoryId) {
      const categoryResult = await db.query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [updates.categoryId, req.user.userId]
      );

      if (categoryResult.rows.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Category not found',
          code: 'CATEGORY_NOT_FOUND',
        });
        return;
      }
    }

    // Build update query
    const updateEntries = Object.entries(updates).filter(
      ([, value]) => value !== undefined
    );
    if (updateEntries.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid fields to update',
        code: 'NO_UPDATE_FIELDS',
      });
      return;
    }

    const updateEntries = Object.entries(updates).filter(
      ([, value]) => value !== undefined
    );
    const setClause = updateEntries
      .map(([field], index) => `${field} = $${index + 3}`)
      .join(', ');
    const values = updateEntries.map(([, value]) => value);

    const result = await db.query(
      `
      UPDATE bookmarks 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `,
      [bookmarkId, req.user.userId, ...values]
    );

    res.json({
      success: true,
      data: {
        bookmark: formatBookmark(result.rows[0]),
      },
      message: 'Bookmark updated successfully',
    });
  } catch (error) {
    console.error('❌ Update bookmark error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update bookmark',
      code: 'UPDATE_BOOKMARK_ERROR',
    });
  }
});

/**
 * Delete bookmark
 * DELETE /bookmarks/:id
 */
router.delete('/:id', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const bookmarkId = req.params.id;

    // Check if bookmark exists and belongs to user
    const result = await db.query(
      'DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING id',
      [bookmarkId, req.user.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Bookmark not found',
        code: 'BOOKMARK_NOT_FOUND',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Bookmark deleted successfully',
    });
  } catch (error) {
    console.error('❌ Delete bookmark error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete bookmark',
      code: 'DELETE_BOOKMARK_ERROR',
    });
  }
});

/**
 * Bulk update bookmarks
 * POST /bookmarks/bulk
 */
router.post('/bulk', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    // Validate request body
    const bodyValidation = BulkUpdateBookmarksSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid bulk update data',
        code: 'INVALID_BULK_UPDATE_DATA',
        details: bodyValidation.error.issues,
      });
      return;
    }

    const { bookmarkIds, updates } = bodyValidation.data;

    // Verify all bookmarks belong to user
    const ownershipCheck = await db.query(
      'SELECT id FROM bookmarks WHERE id = ANY($1) AND user_id = $2',
      [bookmarkIds, req.user.userId]
    );

    if (ownershipCheck.rows.length !== bookmarkIds.length) {
      res.status(400).json({
        success: false,
        error: 'Some bookmarks do not exist or do not belong to user',
        code: 'INVALID_BOOKMARK_OWNERSHIP',
      });
      return;
    }

    // Verify category exists if provided
    if (updates.categoryId) {
      const categoryResult = await db.query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [updates.categoryId, req.user.userId]
      );

      if (categoryResult.rows.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Category not found',
          code: 'CATEGORY_NOT_FOUND',
        });
        return;
      }
    }

    // Build update query
    const updateEntries = Object.entries(updates).filter(
      ([, value]) => value !== undefined
    );
    if (updateEntries.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid fields to update',
        code: 'NO_UPDATE_FIELDS',
      });
      return;
    }

    const updateEntries = Object.entries(updates).filter(
      ([, value]) => value !== undefined
    );
    const setClause = updateEntries
      .map(([field], index) => `${field} = $${index + 3}`)
      .join(', ');
    const values = updateEntries.map(([, value]) => value);

    const result = await db.query(
      `
      UPDATE bookmarks 
      SET ${setClause}, updated_at = NOW()
      WHERE id = ANY($1) AND user_id = $2
      RETURNING id
    `,
      [bookmarkIds, req.user.userId, ...values]
    );

    res.json({
      success: true,
      data: {
        updatedCount: result.rows.length,
        updatedIds: result.rows.map(row => row.id),
      },
      message: `${result.rows.length} bookmarks updated successfully`,
    });
  } catch (error) {
    console.error('❌ Bulk update bookmarks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk update bookmarks',
      code: 'BULK_UPDATE_BOOKMARKS_ERROR',
    });
  }
});

// Helper function to format bookmark data
function formatBookmark(row: any) {
  return {
    id: row.id,
    xTweetId: row.x_tweet_id,
    content: row.content,
    authorUsername: row.author_username,
    authorDisplayName: row.author_display_name,
    authorAvatarUrl: row.author_avatar_url,
    mediaUrls: row.media_urls || [],
    links: row.links || [],
    hashtags: row.hashtags || [],
    mentions: row.mentions || [],
    categoryId: row.category_id,
    category: row.category_name
      ? {
          id: row.category_id,
          name: row.category_name,
          color: row.category_color,
          icon: row.category_icon,
        }
      : null,
    tags: row.tags || [],
    isArchived: row.is_archived,
    bookmarkedAt: row.bookmarked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;

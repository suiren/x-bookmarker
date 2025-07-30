import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { authenticateJWT } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { logger } from '../utils/logger';

const router = Router();
const db = DatabaseService.getInstance();

// Apply authentication to all suggestion routes
router.use(authenticateJWT);

/**
 * Get search suggestions for autocomplete
 * GET /suggestions/search?q=keyword&type=tags,categories,authors
 */
router.get(
  '/search',
  apiRateLimit,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        });
        return;
      }

      const userId = req.user.userId;
      const query = (req.query.q as string) || '';
      const types = (req.query.type as string)?.split(',') || ['tags', 'categories', 'authors'];
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);

      if (query.length < 2) {
        res.json({
          success: true,
          suggestions: {
            tags: [],
            categories: [],
            authors: [],
          },
        });
        return;
      }

      const suggestions: {
        tags: Array<{ value: string; count: number }>;
        categories: Array<{ id: string; name: string; color: string; count: number }>;
        authors: Array<{ username: string; displayName: string; avatarUrl?: string; count: number }>;
      } = {
        tags: [],
        categories: [],
        authors: [],
      };

      // Get tag suggestions
      if (types.includes('tags')) {
        const tagResults = await db.query(
          `SELECT 
             tag, 
             COUNT(*) as count
           FROM (
             SELECT UNNEST(tags) as tag
             FROM bookmarks 
             WHERE user_id = $1 
             AND array_length(tags, 1) > 0
           ) tag_list
           WHERE LOWER(tag) LIKE LOWER($2)
           GROUP BY tag
           ORDER BY count DESC, tag ASC
           LIMIT $3`,
          [userId, `%${query}%`, limit]
        );

        suggestions.tags = tagResults.rows.map(row => ({
          value: row.tag,
          count: parseInt(row.count),
        }));
      }

      // Get category suggestions
      if (types.includes('categories')) {
        const categoryResults = await db.query(
          `SELECT 
             c.id,
             c.name,
             c.color,
             COUNT(b.id) as count
           FROM categories c
           LEFT JOIN bookmarks b ON c.id = b.category_id AND b.user_id = $1
           WHERE c.user_id = $1 
           AND LOWER(c.name) LIKE LOWER($2)
           GROUP BY c.id, c.name, c.color
           ORDER BY count DESC, c.name ASC
           LIMIT $3`,
          [userId, `%${query}%`, limit]
        );

        suggestions.categories = categoryResults.rows.map(row => ({
          id: row.id,
          name: row.name,
          color: row.color,
          count: parseInt(row.count),
        }));
      }

      // Get author suggestions
      if (types.includes('authors')) {
        const authorResults = await db.query(
          `SELECT 
             author_username,
             author_display_name,
             author_avatar_url,
             COUNT(*) as count
           FROM bookmarks 
           WHERE user_id = $1 
           AND (
             LOWER(author_username) LIKE LOWER($2) OR 
             LOWER(author_display_name) LIKE LOWER($2)
           )
           GROUP BY author_username, author_display_name, author_avatar_url
           ORDER BY count DESC, author_display_name ASC
           LIMIT $3`,
          [userId, `%${query}%`, limit]
        );

        suggestions.authors = authorResults.rows.map(row => ({
          username: row.author_username,
          displayName: row.author_display_name,
          avatarUrl: row.author_avatar_url,
          count: parseInt(row.count),
        }));
      }

      res.json({
        success: true,
        suggestions,
        query,
      });
    } catch (error) {
      logger.error('検索候補取得エラー', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.userId,
        query: req.query,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get search suggestions',
        code: 'SUGGESTIONS_ERROR',
      });
    }
  }
);

/**
 * Get popular search terms
 * GET /suggestions/popular?type=tags,categories,authors
 */
router.get(
  '/popular',
  apiRateLimit,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        });
        return;
      }

      const userId = req.user.userId;
      const types = (req.query.type as string)?.split(',') || ['tags', 'categories', 'authors'];
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      const popular: {
        tags: Array<{ value: string; count: number }>;
        categories: Array<{ id: string; name: string; color: string; count: number }>;
        authors: Array<{ username: string; displayName: string; avatarUrl?: string; count: number }>;
      } = {
        tags: [],
        categories: [],
        authors: [],
      };

      // Get popular tags
      if (types.includes('tags')) {
        const tagResults = await db.query(
          `SELECT 
             tag, 
             COUNT(*) as count
           FROM (
             SELECT UNNEST(tags) as tag
             FROM bookmarks 
             WHERE user_id = $1 
             AND array_length(tags, 1) > 0
             AND created_at >= NOW() - INTERVAL '30 days'
           ) tag_list
           GROUP BY tag
           ORDER BY count DESC, tag ASC
           LIMIT $2`,
          [userId, limit]
        );

        popular.tags = tagResults.rows.map(row => ({
          value: row.tag,
          count: parseInt(row.count),
        }));
      }

      // Get popular categories
      if (types.includes('categories')) {
        const categoryResults = await db.query(
          `SELECT 
             c.id,
             c.name,
             c.color,
             COUNT(b.id) as count
           FROM categories c
           LEFT JOIN bookmarks b ON c.id = b.category_id 
             AND b.user_id = $1 
             AND b.created_at >= NOW() - INTERVAL '30 days'
           WHERE c.user_id = $1
           GROUP BY c.id, c.name, c.color
           ORDER BY count DESC, c.name ASC
           LIMIT $2`,
          [userId, limit]
        );

        popular.categories = categoryResults.rows.map(row => ({
          id: row.id,
          name: row.name,
          color: row.color,
          count: parseInt(row.count),
        }));
      }

      // Get popular authors
      if (types.includes('authors')) {
        const authorResults = await db.query(
          `SELECT 
             author_username,
             author_display_name,
             author_avatar_url,
             COUNT(*) as count
           FROM bookmarks 
           WHERE user_id = $1 
           AND created_at >= NOW() - INTERVAL '30 days'
           GROUP BY author_username, author_display_name, author_avatar_url
           ORDER BY count DESC, author_display_name ASC
           LIMIT $2`,
          [userId, limit]
        );

        popular.authors = authorResults.rows.map(row => ({
          username: row.author_username,
          displayName: row.author_display_name,
          avatarUrl: row.author_avatar_url,
          count: parseInt(row.count),
        }));
      }

      res.json({
        success: true,
        popular,
      });
    } catch (error) {
      logger.error('人気検索候補取得エラー', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.userId,
        query: req.query,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get popular suggestions',
        code: 'POPULAR_SUGGESTIONS_ERROR',
      });
    }
  }
);

/**
 * Get search facets for current query
 * POST /suggestions/facets
 */
router.post(
  '/facets',
  apiRateLimit,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        });
        return;
      }

      const userId = req.user.userId;
      const { q, categoryId, tags, dateFrom, dateTo, author } = req.body;

      // Build base query conditions
      const conditions: string[] = ['user_id = $1'];
      const params: any[] = [userId];
      let paramIndex = 2;

      if (q) {
        conditions.push(`search_vector @@ plainto_tsquery('english_unaccent', $${paramIndex})`);
        params.push(q);
        paramIndex++;
      }

      if (categoryId) {
        conditions.push(`category_id = $${paramIndex}`);
        params.push(categoryId);
        paramIndex++;
      }

      if (tags && tags.length > 0) {
        conditions.push(`tags && $${paramIndex}`);
        params.push(tags);
        paramIndex++;
      }

      if (dateFrom) {
        conditions.push(`bookmarked_at >= $${paramIndex}`);
        params.push(dateFrom);
        paramIndex++;
      }

      if (dateTo) {
        conditions.push(`bookmarked_at <= $${paramIndex}`);
        params.push(dateTo);
        paramIndex++;
      }

      if (author) {
        conditions.push(`(author_username ILIKE $${paramIndex} OR author_display_name ILIKE $${paramIndex})`);
        params.push(`%${author}%`);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get facet counts
      const [categoryFacets, tagFacets, authorFacets] = await Promise.all([
        // Category facets
        db.query(
          `SELECT 
             c.id,
             c.name,
             c.color,
             COUNT(b.id) as count
           FROM categories c
           LEFT JOIN bookmarks b ON c.id = b.category_id AND (${conditions.join(' AND ')})
           WHERE c.user_id = $1
           GROUP BY c.id, c.name, c.color
           HAVING COUNT(b.id) > 0
           ORDER BY count DESC, c.name ASC
           LIMIT 20`,
          params
        ),

        // Tag facets
        db.query(
          `SELECT 
             tag, 
             COUNT(*) as count
           FROM (
             SELECT UNNEST(tags) as tag
             FROM bookmarks 
             ${whereClause}
             AND array_length(tags, 1) > 0
           ) tag_list
           GROUP BY tag
           ORDER BY count DESC, tag ASC
           LIMIT 30`,
          params
        ),

        // Author facets
        db.query(
          `SELECT 
             author_username,
             author_display_name,
             author_avatar_url,
             COUNT(*) as count
           FROM bookmarks 
           ${whereClause}
           GROUP BY author_username, author_display_name, author_avatar_url
           ORDER BY count DESC, author_display_name ASC
           LIMIT 20`,
          params
        ),
      ]);

      const facets = {
        categories: categoryFacets.rows.map(row => ({
          id: row.id,
          name: row.name,
          color: row.color,
          count: parseInt(row.count),
        })),
        tags: tagFacets.rows.map(row => ({
          value: row.tag,
          count: parseInt(row.count),
        })),
        authors: authorFacets.rows.map(row => ({
          username: row.author_username,
          displayName: row.author_display_name,
          avatarUrl: row.author_avatar_url,
          count: parseInt(row.count),
        })),
      };

      res.json({
        success: true,
        facets,
        query: { q, categoryId, tags, dateFrom, dateTo, author },
      });
    } catch (error) {
      logger.error('ファセット取得エラー', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.userId,
        body: req.body,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get search facets',
        code: 'FACETS_ERROR',
      });
    }
  }
);

export default router;
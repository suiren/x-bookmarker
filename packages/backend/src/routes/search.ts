import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { SearchQuerySchema } from '@x-bookmarker/shared';
import { authenticateJWT } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';
import { SearchService } from '../services/searchService';

const router = Router();

// Database connection and search service (will be injected from app)
let db: Pool;
let searchService: SearchService;

export const setDatabase = (database: Pool): void => {
  db = database;
  searchService = new SearchService(database);
};

// Apply authentication to all search routes
router.use(authenticateJWT);

/**
 * Advanced search with multiple criteria and facets
 * GET /search
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
        error: 'Invalid search parameters',
        code: 'INVALID_SEARCH_PARAMS',
        details: queryValidation.error.issues,
      });
      return;
    }

    const query = queryValidation.data;
    const includeFacets = req.query.includeFacets !== 'false';

    // Execute search using SearchService
    const searchResult = await searchService.search(
      req.user.userId,
      query,
      includeFacets
    );

    // Save to history if it's a meaningful search
    if (query.text || query.categoryIds?.length || query.tags?.length) {
      try {
        await searchService.saveToHistory(
          req.user.userId,
          query,
          searchResult.totalCount,
          searchResult.executionTime
        );
      } catch (error) {
        // Don't fail the search if history saving fails
        console.warn('Failed to save search history:', error);
      }
    }

    res.json({
      success: true,
      data: {
        bookmarks: searchResult.bookmarks,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: searchResult.totalCount,
          hasMore: query.offset + query.limit < searchResult.totalCount,
        },
        facets: includeFacets ? searchResult.facets : undefined,
        query: {
          ...query,
          executionTime: searchResult.executionTime,
        },
      },
    });
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      code: 'SEARCH_ERROR',
    });
  }
});

/**
 * Get search history for user
 * GET /search/history
 */
router.get('/history', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const historyResult = await searchService.getSearchHistory(
      req.user.userId,
      limit,
      offset
    );

    res.json({
      success: true,
      data: {
        history: historyResult.history,
        pagination: {
          limit,
          offset,
          total: historyResult.totalCount,
          hasMore: offset + limit < historyResult.totalCount,
        },
      },
    });
  } catch (error) {
    console.error('❌ Get search history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve search history',
      code: 'GET_SEARCH_HISTORY_ERROR',
    });
  }
});

/**
 * Save a search query to history
 * POST /search/history
 */
router.post('/history', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const { query, resultCount, executionTime } = req.body;

    if (!query) {
      res.status(400).json({
        success: false,
        error: 'Query is required',
        code: 'QUERY_REQUIRED',
      });
      return;
    }

    const historyId = await searchService.saveToHistory(
      req.user.userId,
      query,
      resultCount || 0,
      executionTime || 0
    );

    res.status(201).json({
      success: true,
      data: {
        id: historyId,
      },
      message: 'Search query saved to history',
    });
  } catch (error) {
    console.error('❌ Save search history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save search history',
      code: 'SAVE_SEARCH_HISTORY_ERROR',
    });
  }
});

/**
 * Delete search history
 * DELETE /search/history/:id
 */
router.delete(
  '/history/:id',
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

      const historyId = req.params.id;

      const deleted = await searchService.deleteSearchHistoryEntry(
        req.user.userId,
        historyId
      );

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Search history entry not found',
          code: 'SEARCH_HISTORY_NOT_FOUND',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Search history entry deleted',
      });
    } catch (error) {
      console.error('❌ Delete search history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete search history',
        code: 'DELETE_SEARCH_HISTORY_ERROR',
      });
    }
  }
);

/**
 * Clear all search history for user
 * DELETE /search/history
 */
router.delete('/history', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const deletedCount = await searchService.clearSearchHistory(
      req.user.userId
    );

    res.json({
      success: true,
      data: {
        deletedCount,
      },
      message: 'Search history cleared',
    });
  } catch (error) {
    console.error('❌ Clear search history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear search history',
      code: 'CLEAR_SEARCH_HISTORY_ERROR',
    });
  }
});

/**
 * Get search suggestions for autocomplete
 * GET /search/suggestions
 */
router.get(
  '/suggestions',
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

      const queryText = req.query.q as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);

      if (!queryText || queryText.trim().length < 2) {
        res.status(400).json({
          success: false,
          error: 'Query text must be at least 2 characters',
          code: 'INVALID_QUERY_TEXT',
        });
        return;
      }

      const suggestions = await searchService.getSearchSuggestions(
        req.user.userId,
        queryText.trim(),
        limit
      );

      res.json({
        success: true,
        data: {
          suggestions,
          query: queryText.trim(),
        },
      });
    } catch (error) {
      console.error('❌ Get search suggestions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get search suggestions',
        code: 'GET_SUGGESTIONS_ERROR',
      });
    }
  }
);

/**
 * Get search analytics for user
 * GET /search/analytics
 */
router.get('/analytics', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);

    const analytics = await searchService.getSearchAnalytics(
      req.user.userId,
      days
    );

    res.json({
      success: true,
      data: {
        ...analytics,
        period: {
          days,
          from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('❌ Get search analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get search analytics',
      code: 'GET_ANALYTICS_ERROR',
    });
  }
});

export default router;

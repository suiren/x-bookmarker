import { Pool } from 'pg';
import { SearchQuery } from '@x-bookmarker/shared';

interface SearchFacets {
  categories: {
    id: string;
    name: string;
    color: string;
    icon: string;
    count: number;
  }[];
  tags: {
    name: string;
    count: number;
  }[];
  authors: {
    username: string;
    displayName: string;
    avatarUrl?: string;
    count: number;
  }[];
}

interface SearchResult {
  bookmarks: any[];
  totalCount: number;
  facets?: SearchFacets;
  executionTime: number;
}

interface SearchHistoryEntry {
  id: string;
  query: SearchQuery;
  resultCount: number;
  executionTime: number;
  createdAt: Date;
}

class SearchService {
  constructor(private db: Pool) {}

  /**
   * Perform advanced search with faceted results
   */
  async search(
    userId: string,
    query: SearchQuery,
    includeFacets: boolean = true
  ): Promise<SearchResult> {
    const startTime = Date.now();

    // Build main search query
    const searchQueryBuilder = this.buildSearchQuery(userId, query);

    // Execute search with pagination
    const searchResult = await this.db.query(
      searchQueryBuilder.query +
        ` LIMIT $${searchQueryBuilder.paramIndex} OFFSET $${searchQueryBuilder.paramIndex + 1}`,
      [...searchQueryBuilder.params, query.limit, query.offset]
    );

    // Get total count
    const countQuery = searchQueryBuilder.query
      .replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')
      .replace(/ORDER BY[\s\S]*$/, '');

    const countResult = await this.db.query(
      countQuery,
      searchQueryBuilder.params
    );
    const totalCount = parseInt(countResult.rows[0].count);

    // Build facets if requested
    let facets: SearchFacets | undefined;
    if (includeFacets) {
      facets = await this.buildFacets(userId, query);
    }

    const executionTime = Date.now() - startTime;

    return {
      bookmarks: searchResult.rows.map(this.formatBookmark),
      totalCount,
      facets,
      executionTime,
    };
  }

  /**
   * Build the search query with all filters
   */
  private buildSearchQuery(userId: string, query: SearchQuery) {
    let searchQuery = `
      SELECT 
        b.id,
        b.x_tweet_id,
        b.content,
        b.author_username,
        b.author_display_name,
        b.author_avatar_url,
        b.media_urls,
        b.links,
        b.hashtags,
        b.mentions,
        b.category_id,
        b.tags,
        b.is_archived,
        b.bookmarked_at,
        b.created_at,
        b.updated_at,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon,
        ${query.text ? "ts_rank(b.search_vector, plainto_tsquery('english_unaccent', $1)) as relevance_score" : '0 as relevance_score'}
      FROM bookmarks b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = $${query.text ? '2' : '1'}
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // Add text search parameter first if present
    if (query.text) {
      params.push(query.text);
      paramIndex++;
    }

    // Add user ID parameter
    params.push(userId);
    paramIndex++;

    // Add filters
    if (query.text) {
      searchQuery += ` AND b.search_vector @@ plainto_tsquery('english_unaccent', $1)`;
    }

    if (query.categoryIds && query.categoryIds.length > 0) {
      searchQuery += ` AND b.category_id = ANY($${paramIndex})`;
      params.push(query.categoryIds);
      paramIndex++;
    }

    if (query.tags && query.tags.length > 0) {
      searchQuery += ` AND b.tags && $${paramIndex}`;
      params.push(query.tags);
      paramIndex++;
    }

    if (query.authorUsername) {
      searchQuery += ` AND b.author_username ILIKE $${paramIndex}`;
      params.push(`%${query.authorUsername}%`);
      paramIndex++;
    }

    if (query.dateFrom) {
      searchQuery += ` AND b.bookmarked_at >= $${paramIndex}`;
      params.push(query.dateFrom);
      paramIndex++;
    }

    if (query.dateTo) {
      searchQuery += ` AND b.bookmarked_at <= $${paramIndex}`;
      params.push(query.dateTo);
      paramIndex++;
    }

    if (query.hasMedia !== undefined) {
      if (query.hasMedia) {
        searchQuery += ` AND array_length(b.media_urls, 1) > 0`;
      } else {
        searchQuery += ` AND (array_length(b.media_urls, 1) IS NULL OR array_length(b.media_urls, 1) = 0)`;
      }
    }

    if (query.hasLinks !== undefined) {
      if (query.hasLinks) {
        searchQuery += ` AND array_length(b.links, 1) > 0`;
      } else {
        searchQuery += ` AND (array_length(b.links, 1) IS NULL OR array_length(b.links, 1) = 0)`;
      }
    }

    // Always filter out archived by default
    searchQuery += ` AND b.is_archived = FALSE`;

    // Add sorting
    switch (query.sortBy) {
      case 'date':
        searchQuery += ` ORDER BY b.bookmarked_at ${query.sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
        break;
      case 'author':
        searchQuery += ` ORDER BY b.author_display_name ${query.sortOrder === 'asc' ? 'ASC' : 'DESC'}, b.bookmarked_at DESC`;
        break;
      case 'relevance':
      default:
        if (query.text) {
          searchQuery += ` ORDER BY relevance_score DESC, b.bookmarked_at DESC`;
        } else {
          searchQuery += ` ORDER BY b.bookmarked_at DESC`;
        }
        break;
    }

    return {
      query: searchQuery,
      params,
      paramIndex,
    };
  }

  /**
   * Build faceted search aggregations
   */
  private async buildFacets(
    userId: string,
    query: SearchQuery
  ): Promise<SearchFacets> {
    const baseConditions = this.buildBaseConditions(userId, query);

    // Get category facets
    const categoryFacetQuery = `
      SELECT 
        c.id,
        c.name,
        c.color,
        c.icon,
        COUNT(b.id) as count
      FROM categories c
      LEFT JOIN bookmarks b ON c.id = b.category_id 
        AND b.user_id = $1 
        AND b.is_archived = FALSE
        ${baseConditions.textCondition}
      WHERE c.user_id = $1
      GROUP BY c.id, c.name, c.color, c.icon
      HAVING COUNT(b.id) > 0
      ORDER BY count DESC, c.name ASC
      LIMIT 20
    `;

    const categoryFacets = await this.db.query(
      categoryFacetQuery,
      baseConditions.params
    );

    // Get tag facets
    const tagFacetQuery = `
      SELECT 
        tag,
        COUNT(*) as count
      FROM (
        SELECT UNNEST(tags) as tag
        FROM bookmarks b
        WHERE b.user_id = $1 
          AND b.is_archived = FALSE
          ${baseConditions.textCondition}
      ) tag_list
      WHERE tag IS NOT NULL AND tag != ''
      GROUP BY tag
      ORDER BY count DESC, tag ASC
      LIMIT 20
    `;

    const tagFacets = await this.db.query(tagFacetQuery, baseConditions.params);

    // Get author facets
    const authorFacetQuery = `
      SELECT 
        b.author_username,
        b.author_display_name,
        MAX(b.author_avatar_url) as author_avatar_url,
        COUNT(*) as count
      FROM bookmarks b
      WHERE b.user_id = $1 
        AND b.is_archived = FALSE
        ${baseConditions.textCondition}
      GROUP BY b.author_username, b.author_display_name
      ORDER BY count DESC, b.author_display_name ASC
      LIMIT 20
    `;

    const authorFacets = await this.db.query(
      authorFacetQuery,
      baseConditions.params
    );

    return {
      categories: categoryFacets.rows.map(row => ({
        id: row.id,
        name: row.name,
        color: row.color,
        icon: row.icon,
        count: parseInt(row.count),
      })),
      tags: tagFacets.rows.map(row => ({
        name: row.tag,
        count: parseInt(row.count),
      })),
      authors: authorFacets.rows.map(row => ({
        username: row.author_username,
        displayName: row.author_display_name,
        avatarUrl: row.author_avatar_url,
        count: parseInt(row.count),
      })),
    };
  }

  /**
   * Build base conditions for facet queries
   */
  private buildBaseConditions(userId: string, query: SearchQuery) {
    const params = [userId];
    let textCondition = '';

    if (query.text) {
      textCondition =
        "AND b.search_vector @@ plainto_tsquery('english_unaccent', $2)";
      params.push(query.text);
    }

    return {
      params,
      textCondition,
    };
  }

  /**
   * Save search query to history
   */
  async saveToHistory(
    userId: string,
    query: SearchQuery,
    resultCount: number,
    executionTime: number
  ): Promise<string> {
    // Only save meaningful searches to history
    if (!query.text && !query.categoryIds?.length && !query.tags?.length) {
      return '';
    }

    const result = await this.db.query(
      `
      INSERT INTO search_history (user_id, query, result_count, execution_time)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
      [userId, JSON.stringify(query), resultCount, executionTime]
    );

    return result.rows[0].id;
  }

  /**
   * Get user's search history
   */
  async getSearchHistory(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    history: SearchHistoryEntry[];
    totalCount: number;
  }> {
    const result = await this.db.query(
      `
      SELECT 
        id,
        query,
        result_count,
        execution_time,
        created_at
      FROM search_history
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
      [userId, limit, offset]
    );

    // Get total count
    const countResult = await this.db.query(
      'SELECT COUNT(*) FROM search_history WHERE user_id = $1',
      [userId]
    );

    return {
      history: result.rows.map(row => ({
        id: row.id,
        query: JSON.parse(row.query),
        resultCount: row.result_count,
        executionTime: row.execution_time,
        createdAt: row.created_at,
      })),
      totalCount: parseInt(countResult.rows[0].count),
    };
  }

  /**
   * Delete search history entry
   */
  async deleteSearchHistoryEntry(
    userId: string,
    historyId: string
  ): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM search_history WHERE id = $1 AND user_id = $2',
      [historyId, userId]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Clear all search history for user
   */
  async clearSearchHistory(userId: string): Promise<number> {
    const result = await this.db.query(
      'DELETE FROM search_history WHERE user_id = $1',
      [userId]
    );

    return result.rowCount || 0;
  }

  /**
   * Get search suggestions based on query text
   */
  async getSearchSuggestions(
    userId: string,
    queryText: string,
    limit: number = 10
  ): Promise<{
    tags: string[];
    authors: string[];
    categories: string[];
  }> {
    const searchTerm = `%${queryText.toLowerCase()}%`;

    // Get tag suggestions
    const tagSuggestions = await this.db.query(
      `
      SELECT DISTINCT tag, COUNT(*) as usage_count
      FROM (
        SELECT UNNEST(tags) as tag
        FROM bookmarks
        WHERE user_id = $1 AND is_archived = FALSE
      ) tag_list
      WHERE LOWER(tag) LIKE $2
      GROUP BY tag
      ORDER BY usage_count DESC, tag ASC
      LIMIT $3
    `,
      [userId, searchTerm, limit]
    );

    // Get author suggestions
    const authorSuggestions = await this.db.query(
      `
      SELECT DISTINCT author_display_name, COUNT(*) as usage_count
      FROM bookmarks
      WHERE user_id = $1 
        AND is_archived = FALSE
        AND LOWER(author_display_name) LIKE $2
      GROUP BY author_display_name
      ORDER BY usage_count DESC, author_display_name ASC
      LIMIT $3
    `,
      [userId, searchTerm, limit]
    );

    // Get category suggestions
    const categorySuggestions = await this.db.query(
      `
      SELECT DISTINCT c.name, COUNT(b.id) as usage_count
      FROM categories c
      LEFT JOIN bookmarks b ON c.id = b.category_id AND b.is_archived = FALSE
      WHERE c.user_id = $1 
        AND LOWER(c.name) LIKE $2
      GROUP BY c.name
      ORDER BY usage_count DESC, c.name ASC
      LIMIT $3
    `,
      [userId, searchTerm, limit]
    );

    return {
      tags: tagSuggestions.rows.map(row => row.tag),
      authors: authorSuggestions.rows.map(row => row.author_display_name),
      categories: categorySuggestions.rows.map(row => row.name),
    };
  }

  /**
   * Get search analytics for user
   */
  async getSearchAnalytics(
    userId: string,
    days: number = 30
  ): Promise<{
    totalSearches: number;
    avgExecutionTime: number;
    mostSearchedTerms: { query: string; count: number }[];
    searchTrends: { date: string; count: number }[];
  }> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    // Get total searches and avg execution time
    const statsResult = await this.db.query(
      `
      SELECT 
        COUNT(*) as total_searches,
        AVG(execution_time) as avg_execution_time
      FROM search_history
      WHERE user_id = $1 AND created_at >= $2
    `,
      [userId, fromDate]
    );

    // Get most searched terms (extract text from query JSON)
    const termsResult = await this.db.query(
      `
      SELECT 
        query->>'text' as search_term,
        COUNT(*) as count
      FROM search_history
      WHERE user_id = $1 
        AND created_at >= $2
        AND query->>'text' IS NOT NULL
        AND query->>'text' != ''
      GROUP BY query->>'text'
      ORDER BY count DESC
      LIMIT 10
    `,
      [userId, fromDate]
    );

    // Get search trends by day
    const trendsResult = await this.db.query(
      `
      SELECT 
        DATE(created_at) as search_date,
        COUNT(*) as count
      FROM search_history
      WHERE user_id = $1 AND created_at >= $2
      GROUP BY DATE(created_at)
      ORDER BY search_date ASC
    `,
      [userId, fromDate]
    );

    return {
      totalSearches: parseInt(statsResult.rows[0]?.total_searches || '0'),
      avgExecutionTime: parseFloat(
        statsResult.rows[0]?.avg_execution_time || '0'
      ),
      mostSearchedTerms: termsResult.rows.map(row => ({
        query: row.search_term,
        count: parseInt(row.count),
      })),
      searchTrends: trendsResult.rows.map(row => ({
        date: row.search_date,
        count: parseInt(row.count),
      })),
    };
  }

  /**
   * Format bookmark data for API response
   */
  private formatBookmark(row: any): any {
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
      relevanceScore: parseFloat(row.relevance_score) || 0,
    };
  }
}

export { SearchService };
export type { SearchResult, SearchFacets, SearchHistoryEntry };

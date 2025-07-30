import { api } from '../lib/api';
import type {
  Bookmark,
  CreateBookmarkInput,
  UpdateBookmarkInput,
  SearchQuery,
  SearchResult,
  PaginatedResponse,
} from '../types';

export const bookmarkService = {
  // Get user's bookmarks with pagination and filtering
  getBookmarks: async (params: Partial<SearchQuery> = {}): Promise<PaginatedResponse<Bookmark>> => {
    const defaultParams = {
      limit: 20,
      offset: 0,
      sortBy: 'date' as const,
      sortOrder: 'desc' as const,
    };
    
    const queryParams = { ...defaultParams, ...params };
    return api.get<PaginatedResponse<Bookmark>>('/bookmarks', queryParams);
  },

  // Get a single bookmark by ID
  getBookmark: async (id: string): Promise<Bookmark> => {
    return api.get<Bookmark>(`/bookmarks/${id}`);
  },

  // Create a new bookmark
  createBookmark: async (input: CreateBookmarkInput): Promise<Bookmark> => {
    return api.post<Bookmark>('/bookmarks', input);
  },

  // Update an existing bookmark
  updateBookmark: async (id: string, input: UpdateBookmarkInput): Promise<Bookmark> => {
    return api.put<Bookmark>(`/bookmarks/${id}`, input);
  },

  // Delete a bookmark
  deleteBookmark: async (id: string): Promise<void> => {
    return api.delete(`/bookmarks/${id}`);
  },

  // Bulk update bookmarks
  bulkUpdateBookmarks: async (bookmarkIds: string[], input: UpdateBookmarkInput): Promise<void> => {
    return api.put('/bookmarks/bulk', {
      bookmarkIds,
      ...input,
    });
  },

  // Bulk delete bookmarks
  bulkDeleteBookmarks: async (bookmarkIds: string[]): Promise<void> => {
    return api.delete('/bookmarks/bulk', {
      data: { bookmarkIds },
    });
  },

  // Search bookmarks
  searchBookmarks: async (query: SearchQuery): Promise<SearchResult> => {
    return api.post<SearchResult>('/search', query);
  },

  // Get search suggestions
  getSearchSuggestions: async (query: string): Promise<string[]> => {
    return api.get<string[]>('/search/suggestions', { q: query });
  },

  // Get search history
  getSearchHistory: async (): Promise<SearchQuery[]> => {
    return api.get<SearchQuery[]>('/search/history');
  },

  // Save search to history
  saveSearchHistory: async (query: SearchQuery): Promise<void> => {
    return api.post('/search/history', query);
  },

  // Archive/unarchive bookmark
  toggleBookmarkArchive: async (id: string): Promise<Bookmark> => {
    return api.put<Bookmark>(`/bookmarks/${id}/archive`);
  },

  // Get bookmarks by category
  getBookmarksByCategory: async (categoryId: string, params: Partial<SearchQuery> = {}): Promise<PaginatedResponse<Bookmark>> => {
    const queryParams = {
      ...params,
      categoryIds: [categoryId],
    };
    return bookmarkService.getBookmarks(queryParams);
  },

  // Get bookmarks by tag
  getBookmarksByTag: async (tag: string, params: Partial<SearchQuery> = {}): Promise<PaginatedResponse<Bookmark>> => {
    const queryParams = {
      ...params,
      tags: [tag],
    };
    return bookmarkService.getBookmarks(queryParams);
  },
};
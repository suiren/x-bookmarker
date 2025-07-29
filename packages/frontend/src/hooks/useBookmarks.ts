import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookmarkService } from '../services/bookmarkService';
import type {
  Bookmark,
  CreateBookmarkInput,
  UpdateBookmarkInput,
  SearchQuery,
} from '../types';

// Query keys
export const bookmarkKeys = {
  all: ['bookmarks'] as const,
  lists: () => [...bookmarkKeys.all, 'list'] as const,
  list: (params: Partial<SearchQuery>) => [...bookmarkKeys.lists(), params] as const,
  details: () => [...bookmarkKeys.all, 'detail'] as const,
  detail: (id: string) => [...bookmarkKeys.details(), id] as const,
  search: (query: SearchQuery) => [...bookmarkKeys.all, 'search', query] as const,
  history: () => [...bookmarkKeys.all, 'history'] as const,
  suggestions: (query: string) => [...bookmarkKeys.all, 'suggestions', query] as const,
};

// Get bookmarks with pagination and filtering
export const useBookmarks = (params: Partial<SearchQuery> = {}) => {
  return useQuery({
    queryKey: bookmarkKeys.list(params),
    queryFn: () => bookmarkService.getBookmarks(params),
    staleTime: 3 * 60 * 1000, // 3分 - ブックマークは比較的頻繁に更新される
    gcTime: 10 * 60 * 1000, // 10分
  });
};

// Get single bookmark
export const useBookmark = (id: string) => {
  return useQuery({
    queryKey: bookmarkKeys.detail(id),
    queryFn: () => bookmarkService.getBookmark(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Search bookmarks
export const useSearchBookmarks = (query: SearchQuery) => {
  return useQuery({
    queryKey: bookmarkKeys.search(query),
    queryFn: () => bookmarkService.searchBookmarks(query),
    enabled: !!query.text || !!query.categoryIds?.length || !!query.tags?.length,
    staleTime: 1 * 60 * 1000, // 1分 - 検索結果は短時間キャッシュ
    gcTime: 5 * 60 * 1000, // 5分
  });
};

// Get search history
export const useSearchHistory = () => {
  return useQuery({
    queryKey: bookmarkKeys.history(),
    queryFn: () => bookmarkService.getSearchHistory(),
    staleTime: 30 * 60 * 1000, // 30分 - 検索履歴は変更頻度が低い
    gcTime: 60 * 60 * 1000, // 1時間
  });
};

// Get search suggestions
export const useSearchSuggestions = (query: string) => {
  return useQuery({
    queryKey: bookmarkKeys.suggestions(query),
    queryFn: () => bookmarkService.getSearchSuggestions(query),
    enabled: query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
};

// Create bookmark mutation
export const useCreateBookmark = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBookmarkInput) => bookmarkService.createBookmark(input),
    onSuccess: () => {
      // Invalidate and refetch bookmark lists
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.lists() });
    },
  });
};

// Update bookmark mutation
export const useUpdateBookmark = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBookmarkInput }) => 
      bookmarkService.updateBookmark(id, input),
    onSuccess: (updatedBookmark) => {
      // Update specific bookmark in cache
      queryClient.setQueryData(
        bookmarkKeys.detail(updatedBookmark.id),
        updatedBookmark
      );
      
      // Invalidate bookmark lists to reflect changes
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.lists() });
    },
  });
};

// Delete bookmark mutation
export const useDeleteBookmark = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => bookmarkService.deleteBookmark(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: bookmarkKeys.detail(deletedId) });
      
      // Invalidate bookmark lists
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.lists() });
    },
  });
};

// Bulk update bookmarks mutation
export const useBulkUpdateBookmarks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookmarkIds, input }: { bookmarkIds: string[]; input: UpdateBookmarkInput }) =>
      bookmarkService.bulkUpdateBookmarks(bookmarkIds, input),
    onSuccess: () => {
      // Invalidate all bookmark-related queries
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.all });
    },
  });
};

// Bulk delete bookmarks mutation
export const useBulkDeleteBookmarks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookmarkIds: string[]) => bookmarkService.bulkDeleteBookmarks(bookmarkIds),
    onSuccess: (_, deletedIds) => {
      // Remove individual bookmarks from cache
      deletedIds.forEach(id => {
        queryClient.removeQueries({ queryKey: bookmarkKeys.detail(id) });
      });
      
      // Invalidate bookmark lists
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.lists() });
    },
  });
};

// Toggle bookmark archive mutation
export const useToggleBookmarkArchive = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => bookmarkService.toggleBookmarkArchive(id),
    onSuccess: (updatedBookmark) => {
      // Update specific bookmark in cache
      queryClient.setQueryData(
        bookmarkKeys.detail(updatedBookmark.id),
        updatedBookmark
      );
      
      // Invalidate bookmark lists
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.lists() });
    },
  });
};

// Save search to history mutation
export const useSaveSearchHistory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (query: SearchQuery) => bookmarkService.saveSearchHistory(query),
    onSuccess: () => {
      // Invalidate search history
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.history() });
    },
  });
};
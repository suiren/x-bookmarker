/**
 * オフライン検索hook
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bookmark } from '@x-bookmarker/shared';
import { offlineService } from '../services/offlineService';
import { useNetworkState } from './useNetworkState';
import { useAuth } from './useAuth';

interface UseOfflineSearchOptions {
  query: string;
  categoryId?: string;
  limit?: number;
  enabled?: boolean;
}

interface OfflineSearchResult {
  bookmarks: Bookmark[];
  isLoading: boolean;
  error: Error | null;
  isOffline: boolean;
  totalCount: number;
}

export function useOfflineSearch({
  query,
  categoryId,
  limit = 30,
  enabled = true
}: UseOfflineSearchOptions): OfflineSearchResult {
  const { user } = useAuth();
  const { isOffline } = useNetworkState();
  const [offlineError, setOfflineError] = useState<Error | null>(null);

  // クエリを正規化
  const normalizedQuery = useMemo(() => {
    return query.trim().toLowerCase();
  }, [query]);

  // オンライン検索（React Query）
  const onlineQuery = useQuery({
    queryKey: ['search', user?.id, normalizedQuery, categoryId],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const params = new URLSearchParams({
        q: normalizedQuery,
        limit: limit.toString(),
        ...(categoryId && { categoryId })
      });
      
      const response = await fetch(`/api/search?${params}`);
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      return response.json();
    },
    enabled: enabled && !!user?.id && !!normalizedQuery && !isOffline,
    staleTime: 2 * 60 * 1000, // 2分間キャッシュ
  });

  // オフライン検索
  const [offlineResults, setOfflineResults] = useState<{
    bookmarks: Bookmark[];
    totalCount: number;
  }>({
    bookmarks: [],
    totalCount: 0
  });

  const [isOfflineLoading, setIsOfflineLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const performOfflineSearch = async () => {
      if (!enabled || !user?.id || !normalizedQuery || !isOffline) {
        return;
      }

      setIsOfflineLoading(true);
      setOfflineError(null);

      try {
        await offlineService.init();
        
        const results = await offlineService.searchBookmarks({
          userId: user.id,
          query: normalizedQuery,
          categoryId,
          limit
        });

        if (!isCancelled) {
          setOfflineResults({
            bookmarks: results,
            totalCount: results.length
          });
        }
      } catch (error) {
        if (!isCancelled) {
          setOfflineError(error as Error);
          setOfflineResults({ bookmarks: [], totalCount: 0 });
        }
      } finally {
        if (!isCancelled) {
          setIsOfflineLoading(false);
        }
      }
    };

    performOfflineSearch();

    return () => {
      isCancelled = true;
    };
  }, [enabled, user?.id, normalizedQuery, categoryId, limit, isOffline]);

  // 結果を統合
  const result: OfflineSearchResult = useMemo(() => {
    if (isOffline) {
      return {
        bookmarks: offlineResults.bookmarks,
        isLoading: isOfflineLoading,
        error: offlineError,
        isOffline: true,
        totalCount: offlineResults.totalCount
      };
    } else {
      return {
        bookmarks: onlineQuery.data?.bookmarks || [],
        isLoading: onlineQuery.isLoading,
        error: onlineQuery.error as Error | null,
        isOffline: false,
        totalCount: onlineQuery.data?.total || 0
      };
    }
  }, [
    isOffline,
    offlineResults,
    isOfflineLoading,
    offlineError,
    onlineQuery.data,
    onlineQuery.isLoading,
    onlineQuery.error
  ]);

  return result;
}

/**
 * オフライン検索候補を取得するhook
 */
export function useOfflineSearchSuggestions(query: string, limit: number = 5) {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const getSuggestions = async () => {
      if (!user?.id || !query.trim() || query.length < 2) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);

      try {
        await offlineService.init();
        
        // 簡単な候補生成ロジック（実際の実装では、より高度なロジックを使用）
        const bookmarks = await offlineService.searchBookmarks({
          userId: user.id,
          query: query.trim(),
          limit: limit * 2
        });

        // タイトルやタグから候補を抽出
        const suggestionSet = new Set<string>();
        
        for (const bookmark of bookmarks) {
          // タイトルから単語を抽出
          if (bookmark.title) {
            const titleWords = bookmark.title.toLowerCase().split(/\s+/);
            titleWords.forEach(word => {
              if (word.includes(query.toLowerCase()) && word.length >= query.length) {
                suggestionSet.add(word);
              }
            });
          }
          
          // タグを追加
          bookmark.tags.forEach(tag => {
            if (tag.toLowerCase().includes(query.toLowerCase())) {
              suggestionSet.add(tag);
            }
          });
          
          if (suggestionSet.size >= limit) break;
        }

        if (!isCancelled) {
          setSuggestions(Array.from(suggestionSet).slice(0, limit));
        }
      } catch (error) {
        console.error('Failed to get offline search suggestions:', error);
        if (!isCancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    getSuggestions();

    return () => {
      isCancelled = true;
    };
  }, [user?.id, query, limit]);

  return { suggestions, isLoading };
}
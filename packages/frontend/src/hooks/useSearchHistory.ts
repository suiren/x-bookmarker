import { useState, useEffect } from 'react';
import type { SearchQuery } from '../types';

const SEARCH_HISTORY_KEY = 'x-bookmarker-search-history';
const MAX_HISTORY_ITEMS = 20;

export const useSearchHistory = () => {
  const [searchHistory, setSearchHistory] = useState<SearchQuery[]>([]);

  // Load search history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Migrate old format to new format
          const migrated = parsed.map((item: any) => ({
            ...item,
            text: item.text || item.q || '',
            categoryIds: item.categoryIds || (item.categoryId ? [item.categoryId] : []),
            authorUsername: item.authorUsername || item.author || '',
            // Convert date strings to Date objects if needed
            dateFrom: item.dateFrom ? (typeof item.dateFrom === 'string' ? new Date(item.dateFrom) : item.dateFrom) : undefined,
            dateTo: item.dateTo ? (typeof item.dateTo === 'string' ? new Date(item.dateTo) : item.dateTo) : undefined,
          }));
          setSearchHistory(migrated);
        }
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
      setSearchHistory([]);
    }
  }, []);

  // Save search history to localStorage
  const saveToStorage = (history: SearchQuery[]) => {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  };

  const addToHistory = (query: SearchQuery) => {
    // Don't save empty queries
    if (!query.text && (!query.categoryIds || query.categoryIds.length === 0) && 
        (!query.tags || query.tags.length === 0) && 
        !query.authorUsername && !query.dateFrom && !query.dateTo) {
      return;
    }

    setSearchHistory(prevHistory => {
      // Remove duplicate if exists (based on query content)
      const filtered = prevHistory.filter(item => 
        !(item.text === query.text && 
          JSON.stringify(item.categoryIds?.sort()) === JSON.stringify(query.categoryIds?.sort()) &&
          JSON.stringify(item.tags?.sort()) === JSON.stringify(query.tags?.sort()) &&
          item.authorUsername === query.authorUsername &&
          item.dateFrom === query.dateFrom &&
          item.dateTo === query.dateTo)
      );

      // Add to beginning and limit to MAX_HISTORY_ITEMS
      const newHistory = [
        {
          ...query,
          searchedAt: new Date().toISOString()
        },
        ...filtered
      ].slice(0, MAX_HISTORY_ITEMS);

      saveToStorage(newHistory);
      return newHistory;
    });
  };

  const removeFromHistory = (index: number) => {
    setSearchHistory(prevHistory => {
      const newHistory = prevHistory.filter((_, i) => i !== index);
      saveToStorage(newHistory);
      return newHistory;
    });
  };

  const clearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  };

  // Get popular tags from search history
  const getPopularTags = (limit = 10): string[] => {
    const tagCounts = searchHistory
      .flatMap(query => query.tags || [])
      .reduce((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag]) => tag);
  };

  // Get recent searches by category
  const getRecentSearchesByCategory = (categoryId?: string, limit = 5): SearchQuery[] => {
    return searchHistory
      .filter(query => query.categoryIds?.includes(categoryId || ''))
      .slice(0, limit);
  };

  // Get recent searches for quick access
  const getRecentSearches = (limit = 5) => {
    return searchHistory.slice(0, limit).map(query => ({
      id: crypto.randomUUID(),
      query: query.text || '',
      categoryIds: query.categoryIds || [],
      tags: query.tags || [],
      timestamp: new Date(query.searchedAt || Date.now()),
      resultCount: 0, // This will be updated after actual search
    }));
  };

  return {
    data: searchHistory,
    searchHistory, // for backwards compatibility
    addToHistory,
    removeFromHistory,
    clearHistory,
    getPopularTags,
    getRecentSearchesByCategory,
    getRecentSearches,
  };
};
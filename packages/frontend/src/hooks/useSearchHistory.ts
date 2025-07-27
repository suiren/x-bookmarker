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
        setSearchHistory(Array.isArray(parsed) ? parsed : []);
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
    if (!query.q && !query.categoryId && (!query.tags || query.tags.length === 0) && 
        !query.author && !query.dateFrom && !query.dateTo) {
      return;
    }

    setSearchHistory(prevHistory => {
      // Remove duplicate if exists (based on query content)
      const filtered = prevHistory.filter(item => 
        !(item.q === query.q && 
          item.categoryId === query.categoryId &&
          JSON.stringify(item.tags?.sort()) === JSON.stringify(query.tags?.sort()) &&
          item.author === query.author &&
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
      .filter(query => query.categoryId === categoryId)
      .slice(0, limit);
  };

  return {
    data: searchHistory,
    searchHistory, // for backwards compatibility
    addToHistory,
    removeFromHistory,
    clearHistory,
    getPopularTags,
    getRecentSearchesByCategory,
  };
};
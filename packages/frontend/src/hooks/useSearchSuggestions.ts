import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface TagSuggestion {
  value: string;
  count: number;
}

interface CategorySuggestion {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface AuthorSuggestion {
  username: string;
  displayName: string;
  avatarUrl?: string;
  count: number;
}

interface SearchSuggestions {
  tags: TagSuggestion[];
  categories: CategorySuggestion[];
  authors: AuthorSuggestion[];
}

interface PopularSuggestions {
  tags: TagSuggestion[];
  categories: CategorySuggestion[];
  authors: AuthorSuggestion[];
}

interface SearchFacets {
  categories: CategorySuggestion[];
  tags: TagSuggestion[];
  authors: AuthorSuggestion[];
}

export const useSearchSuggestions = (
  query: string,
  types: string[] = ['tags', 'categories', 'authors'],
  enabled: boolean = true
) => {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return useQuery({
    queryKey: ['searchSuggestions', debouncedQuery, types.sort().join(',')],
    queryFn: async (): Promise<SearchSuggestions> => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        return { tags: [], categories: [], authors: [] };
      }

      const response = await api.get('/suggestions/search', {
        params: {
          q: debouncedQuery,
          type: types.join(','),
          limit: 10,
        },
      });

      return response.data.suggestions;
    },
    enabled: enabled && debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const usePopularSuggestions = (
  types: string[] = ['tags', 'categories', 'authors'],
  limit: number = 10
) => {
  return useQuery({
    queryKey: ['popularSuggestions', types.sort().join(','), limit],
    queryFn: async (): Promise<PopularSuggestions> => {
      const response = await api.get('/suggestions/popular', {
        params: {
          type: types.join(','),
          limit,
        },
      });

      return response.data.popular;
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });
};

export const useSearchFacets = (searchQuery: {
  q?: string;
  categoryId?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  author?: string;
}) => {
  const hasQuery = Boolean(
    searchQuery.q ||
    searchQuery.categoryId ||
    (searchQuery.tags && searchQuery.tags.length > 0) ||
    searchQuery.dateFrom ||
    searchQuery.dateTo ||
    searchQuery.author
  );

  return useQuery({
    queryKey: ['searchFacets', searchQuery],
    queryFn: async (): Promise<SearchFacets> => {
      const response = await api.post('/suggestions/facets', searchQuery);
      return response.data.facets;
    },
    enabled: hasQuery,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Type exports for use in components
export type {
  TagSuggestion,
  CategorySuggestion,
  AuthorSuggestion,
  SearchSuggestions,
  PopularSuggestions,
  SearchFacets,
};
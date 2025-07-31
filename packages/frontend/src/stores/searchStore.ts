import { create } from 'zustand';
import { SearchResult } from '@x-bookmarker/shared';

interface SearchHistoryEntry {
  id: string;
  query: string;
  categoryIds: string[];
  tags: string[];
  timestamp: Date;
  resultCount: number;
}

interface SearchState {
  query: string;
  categoryIds: string[];
  tags: string[];
  dateFrom?: Date;
  dateTo?: Date;
  authorUsername?: string;
  hasMedia?: boolean;
  hasLinks?: boolean;
  sortBy: 'relevance' | 'date' | 'author';
  sortOrder: 'asc' | 'desc';
  results: SearchResult | null;
  isLoading: boolean;
  error: string | null;
  history: SearchHistoryEntry[];
  suggestions: string[];
  isSearchModalOpen: boolean;
}

interface SearchActions {
  // Search query management
  setQuery: (query: string) => void;
  setCategoryIds: (categoryIds: string[]) => void;
  setTags: (tags: string[]) => void;
  setDateRange: (dateFrom?: Date, dateTo?: Date) => void;
  setAuthorUsername: (username?: string) => void;
  setHasMedia: (hasMedia?: boolean) => void;
  setHasLinks: (hasLinks?: boolean) => void;
  setSortBy: (sortBy: 'relevance' | 'date' | 'author') => void;
  setSortOrder: (sortOrder: 'asc' | 'desc') => void;
  clearFilters: () => void;
  
  // Search execution
  setResults: (results: SearchResult | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Search history
  addToHistory: (entry: Omit<SearchHistoryEntry, 'id' | 'timestamp'>) => void;
  removeFromHistory: (id: string) => void;
  clearHistory: () => void;
  
  // Suggestions
  setSuggestions: (suggestions: string[]) => void;

  // Search Modal
  setIsSearchModalOpen: (isOpen: boolean) => void;
}

export const useSearchStore = create<SearchState & SearchActions>((set, get) => ({
  // Initial state
  query: '',
  categoryIds: [],
  tags: [],
  dateFrom: undefined,
  dateTo: undefined,
  authorUsername: undefined,
  hasMedia: undefined,
  hasLinks: undefined,
  sortBy: 'relevance',
  sortOrder: 'desc',
  results: null,
  isLoading: false,
  error: null,
  history: [],
  suggestions: [],
  isSearchModalOpen: false,

  // Search query management
  setQuery: (query: string) => set({ query }),
  setCategoryIds: (categoryIds: string[]) => set({ categoryIds }),
  setTags: (tags: string[]) => set({ tags }),
  setDateRange: (dateFrom?: Date, dateTo?: Date) => set({ dateFrom, dateTo }),
  setAuthorUsername: (authorUsername?: string) => set({ authorUsername }),
  setHasMedia: (hasMedia?: boolean) => set({ hasMedia }),
  setHasLinks: (hasLinks?: boolean) => set({ hasLinks }),
  setSortBy: (sortBy: 'relevance' | 'date' | 'author') => set({ sortBy }),
  setSortOrder: (sortOrder: 'asc' | 'desc') => set({ sortOrder }),
  clearFilters: () =>
    set({
      query: '',
      categoryIds: [],
      tags: [],
      dateFrom: undefined,
      dateTo: undefined,
      authorUsername: undefined,
      hasMedia: undefined,
      hasLinks: undefined,
      sortBy: 'relevance',
      sortOrder: 'desc',
    }),

  // Search execution
  setResults: (results: SearchResult | null) => set({ results }),
  setIsLoading: (isLoading: boolean) => set({ isLoading }),
  setError: (error: string | null) => set({ error }),

  // Search history
  addToHistory: (entry: Omit<SearchHistoryEntry, 'id' | 'timestamp'>) => {
    const { history } = get();
    const newEntry: SearchHistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    
    // 重複する検索クエリは削除し、新しいものを先頭に追加
    const filteredHistory = history.filter(
      h => h.query !== entry.query || 
      JSON.stringify(h.categoryIds) !== JSON.stringify(entry.categoryIds) ||
      JSON.stringify(h.tags) !== JSON.stringify(entry.tags)
    );
    
    const updatedHistory = [newEntry, ...filteredHistory].slice(0, 50); // 最大50件保持
    
    set({ history: updatedHistory });
  },

  removeFromHistory: (id: string) => {
    const { history } = get();
    set({ history: history.filter(h => h.id !== id) });
  },

  clearHistory: () => set({ history: [] }),

  // Suggestions
  setSuggestions: (suggestions: string[]) =>
    set({ suggestions }),

  // Search Modal
  setIsSearchModalOpen: (isOpen: boolean) =>
    set({ isSearchModalOpen: isOpen }),
}));
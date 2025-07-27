import { create } from 'zustand';
import type { FrontendBookmark, FrontendCategory, SortDirection, ViewMode } from '../types';

interface BookmarkState {
  // Data
  bookmarks: FrontendBookmark[];
  categories: FrontendCategory[];
  
  // UI State
  selectedBookmarks: string[];
  viewMode: ViewMode;
  filterCategory?: string;
  searchQuery: string;
  sortBy: 'date' | 'relevance' | 'author';
  sortOrder: SortDirection;
  
  // Pagination
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  isLoading: boolean;
  error?: string;
  
  // Actions - Data Management
  setBookmarks: (bookmarks: FrontendBookmark[]) => void;
  addBookmark: (bookmark: FrontendBookmark) => void;
  updateBookmark: (id: string, updates: Partial<FrontendBookmark>) => void;
  deleteBookmark: (id: string) => void;
  setCategories: (categories: FrontendCategory[]) => void;
  addCategory: (category: FrontendCategory) => void;
  updateCategory: (id: string, updates: Partial<FrontendCategory>) => void;
  deleteCategory: (id: string) => void;
  
  // Actions - UI State
  setSelectedBookmarks: (ids: string[]) => void;
  toggleBookmarkSelection: (id: string) => void;
  clearSelection: () => void;
  setViewMode: (mode: ViewMode) => void;
  setFilterCategory: (categoryId?: string) => void;
  setSearchQuery: (query: string) => void;
  setSorting: (sortBy: 'date' | 'relevance' | 'author', order: SortDirection) => void;
  
  // Actions - Pagination & Loading
  setPagination: (page: number, totalPages: number, totalItems: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error?: string) => void;
  resetFilters: () => void;
}

export const useBookmarkStore = create<BookmarkState>((set) => ({
  // Initial Data State
  bookmarks: [],
  categories: [],
  
  // Initial UI State
  selectedBookmarks: [],
  viewMode: 'grid',
  searchQuery: '',
  sortBy: 'date',
  sortOrder: 'desc',
  
  // Initial Pagination State
  currentPage: 1,
  totalPages: 1,
  totalItems: 0,
  itemsPerPage: 20,
  isLoading: false,
  error: undefined,

  // Data Management Actions
  setBookmarks: (bookmarks) => set({ bookmarks, isLoading: false, error: undefined }),
  
  addBookmark: (bookmark) => set((state) => ({
    bookmarks: [bookmark, ...state.bookmarks],
    totalItems: state.totalItems + 1,
  })),
  
  updateBookmark: (id, updates) => set((state) => ({
    bookmarks: state.bookmarks.map(bookmark =>
      bookmark.id === id ? { ...bookmark, ...updates } : bookmark
    ),
  })),
  
  deleteBookmark: (id) => set((state) => ({
    bookmarks: state.bookmarks.filter(bookmark => bookmark.id !== id),
    selectedBookmarks: state.selectedBookmarks.filter(selectedId => selectedId !== id),
    totalItems: Math.max(0, state.totalItems - 1),
  })),
  
  setCategories: (categories) => set({ categories }),
  
  addCategory: (category) => set((state) => ({
    categories: [...state.categories, category],
  })),
  
  updateCategory: (id, updates) => set((state) => ({
    categories: state.categories.map(category =>
      category.id === id ? { ...category, ...updates } : category
    ),
  })),
  
  deleteCategory: (id) => set((state) => ({
    categories: state.categories.filter(category => category.id !== id),
    // ブックマークからも削除されたカテゴリIDを除去
    bookmarks: state.bookmarks.map(bookmark => 
      bookmark.categoryId === id ? { ...bookmark, categoryId: undefined } : bookmark
    ),
  })),
  
  // UI State Actions
  setSelectedBookmarks: (ids) => set({ selectedBookmarks: ids }),
  
  toggleBookmarkSelection: (id) => set((state) => ({
    selectedBookmarks: state.selectedBookmarks.includes(id)
      ? state.selectedBookmarks.filter(selectedId => selectedId !== id)
      : [...state.selectedBookmarks, id],
  })),
  
  clearSelection: () => set({ selectedBookmarks: [] }),
  
  setViewMode: (mode) => set({ viewMode: mode }),
  
  setFilterCategory: (categoryId) => set({ 
    filterCategory: categoryId,
    currentPage: 1, // フィルター変更時はページをリセット
  }),
  
  setSearchQuery: (query) => set({ 
    searchQuery: query,
    currentPage: 1, // 検索時はページをリセット
  }),
  
  setSorting: (sortBy, order) => set({ 
    sortBy, 
    sortOrder: order,
    currentPage: 1, // ソート変更時はページをリセット
  }),
  
  // Pagination & Loading Actions
  setPagination: (page, totalPages, totalItems) => set({ 
    currentPage: page, 
    totalPages, 
    totalItems 
  }),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error, isLoading: false }),
  
  resetFilters: () => set({
    filterCategory: undefined,
    searchQuery: '',
    sortBy: 'date',
    sortOrder: 'desc',
    currentPage: 1,
    selectedBookmarks: [],
  }),
}));
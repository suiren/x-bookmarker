import { create } from 'zustand';

interface Bookmark {
  id: string;
  xTweetId: string;
  content: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  mediaUrls: string[];
  links: string[];
  hashtags: string[];
  mentions: string[];
  categoryId?: string;
  tags: string[];
  isArchived: boolean;
  bookmarkedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface Category {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  parentId?: string;
  order: number;
  isDefault: boolean;
}

interface BookmarkState {
  bookmarks: Bookmark[];
  categories: Category[];
  selectedBookmarks: string[];
  viewMode: 'grid' | 'list';
  filterCategory?: string;
  searchQuery: string;
  sortBy: 'date' | 'relevance' | 'author';
  sortOrder: 'asc' | 'desc';
  
  // Actions
  setBookmarks: (bookmarks: Bookmark[]) => void;
  addBookmark: (bookmark: Bookmark) => void;
  updateBookmark: (id: string, updates: Partial<Bookmark>) => void;
  deleteBookmark: (id: string) => void;
  setCategories: (categories: Category[]) => void;
  addCategory: (category: Category) => void;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  setSelectedBookmarks: (ids: string[]) => void;
  toggleBookmarkSelection: (id: string) => void;
  clearSelection: () => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setFilterCategory: (categoryId?: string) => void;
  setSearchQuery: (query: string) => void;
  setSorting: (sortBy: 'date' | 'relevance' | 'author', order: 'asc' | 'desc') => void;
}

export const useBookmarkStore = create<BookmarkState>((set) => ({
  bookmarks: [],
  categories: [],
  selectedBookmarks: [],
  viewMode: 'grid',
  searchQuery: '',
  sortBy: 'date',
  sortOrder: 'desc',

  setBookmarks: (bookmarks) => set({ bookmarks }),
  
  addBookmark: (bookmark) => set((state) => ({
    bookmarks: [bookmark, ...state.bookmarks],
  })),
  
  updateBookmark: (id, updates) => set((state) => ({
    bookmarks: state.bookmarks.map(bookmark =>
      bookmark.id === id ? { ...bookmark, ...updates } : bookmark
    ),
  })),
  
  deleteBookmark: (id) => set((state) => ({
    bookmarks: state.bookmarks.filter(bookmark => bookmark.id !== id),
    selectedBookmarks: state.selectedBookmarks.filter(selectedId => selectedId !== id),
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
  })),
  
  setSelectedBookmarks: (ids) => set({ selectedBookmarks: ids }),
  
  toggleBookmarkSelection: (id) => set((state) => ({
    selectedBookmarks: state.selectedBookmarks.includes(id)
      ? state.selectedBookmarks.filter(selectedId => selectedId !== id)
      : [...state.selectedBookmarks, id],
  })),
  
  clearSelection: () => set({ selectedBookmarks: [] }),
  
  setViewMode: (mode) => set({ viewMode: mode }),
  
  setFilterCategory: (categoryId) => set({ filterCategory: categoryId }),
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  setSorting: (sortBy, order) => set({ sortBy, sortOrder: order }),
}));
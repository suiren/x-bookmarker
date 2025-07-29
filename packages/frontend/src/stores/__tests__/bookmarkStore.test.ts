/**
 * BookmarkStore のテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBookmarkStore } from '../bookmarkStore';
import { createMockBookmark, createMockCategory } from '../../test/helpers';

// Zustandストアをリセットするヘルパー
const resetStore = () => {
  useBookmarkStore.setState({
    bookmarks: [],
    categories: [],
    selectedBookmarks: [],
    viewMode: 'grid',
    filterCategory: undefined,
    searchQuery: '',
    sortBy: 'date',
    sortOrder: 'desc',
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 20,
    isLoading: false,
    error: undefined,
  });
};

describe('useBookmarkStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useBookmarkStore.getState();
      
      expect(state.bookmarks).toEqual([]);
      expect(state.categories).toEqual([]);
      expect(state.selectedBookmarks).toEqual([]);
      expect(state.viewMode).toBe('grid');
      expect(state.filterCategory).toBeUndefined();
      expect(state.searchQuery).toBe('');
      expect(state.sortBy).toBe('date');
      expect(state.sortOrder).toBe('desc');
      expect(state.currentPage).toBe(1);
      expect(state.totalPages).toBe(1);
      expect(state.totalItems).toBe(0);
      expect(state.itemsPerPage).toBe(20);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeUndefined();
    });
  });

  describe('bookmark management', () => {
    it('should set bookmarks and clear loading/error state', () => {
      const bookmarks = [createMockBookmark(), createMockBookmark({ id: 'bookmark-2' })];
      
      // ローディング状態とエラーを設定
      useBookmarkStore.setState({ isLoading: true, error: 'テストエラー' });
      
      useBookmarkStore.getState().setBookmarks(bookmarks);
      
      const state = useBookmarkStore.getState();
      expect(state.bookmarks).toEqual(bookmarks);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeUndefined();
    });

    it('should add bookmark to the beginning of list', () => {
      const existingBookmark = createMockBookmark({ id: 'existing' });
      const newBookmark = createMockBookmark({ id: 'new' });
      
      useBookmarkStore.setState({ bookmarks: [existingBookmark], totalItems: 1 });
      useBookmarkStore.getState().addBookmark(newBookmark);
      
      const state = useBookmarkStore.getState();
      expect(state.bookmarks).toEqual([newBookmark, existingBookmark]);
      expect(state.totalItems).toBe(2);
    });

    it('should update bookmark by id', () => {
      const bookmark = createMockBookmark({ content: '元の内容' });
      useBookmarkStore.setState({ bookmarks: [bookmark] });
      
      useBookmarkStore.getState().updateBookmark('bookmark-1', { content: '更新された内容' });
      
      const state = useBookmarkStore.getState();
      expect(state.bookmarks[0].content).toBe('更新された内容');
      expect(state.bookmarks[0].id).toBe('bookmark-1');
    });

    it('should delete bookmark and remove from selection', () => {
      const bookmark1 = createMockBookmark({ id: 'bookmark-1' });
      const bookmark2 = createMockBookmark({ id: 'bookmark-2' });
      
      useBookmarkStore.setState({
        bookmarks: [bookmark1, bookmark2],
        selectedBookmarks: ['bookmark-1', 'bookmark-2'],
        totalItems: 2,
      });
      
      useBookmarkStore.getState().deleteBookmark('bookmark-1');
      
      const state = useBookmarkStore.getState();
      expect(state.bookmarks).toEqual([bookmark2]);
      expect(state.selectedBookmarks).toEqual(['bookmark-2']);
      expect(state.totalItems).toBe(1);
    });

    it('should not allow totalItems to go below 0', () => {
      useBookmarkStore.setState({ totalItems: 0 });
      useBookmarkStore.getState().deleteBookmark('nonexistent');
      
      const state = useBookmarkStore.getState();
      expect(state.totalItems).toBe(0);
    });
  });

  describe('category management', () => {
    it('should set categories', () => {
      const categories = [createMockCategory(), createMockCategory({ id: 'category-2' })];
      
      useBookmarkStore.getState().setCategories(categories);
      
      const state = useBookmarkStore.getState();
      expect(state.categories).toEqual(categories);
    });

    it('should add category', () => {
      const existingCategory = createMockCategory({ id: 'existing' });
      const newCategory = createMockCategory({ id: 'new' });
      
      useBookmarkStore.setState({ categories: [existingCategory] });
      useBookmarkStore.getState().addCategory(newCategory);
      
      const state = useBookmarkStore.getState();
      expect(state.categories).toEqual([existingCategory, newCategory]);
    });

    it('should update category by id', () => {
      const category = createMockCategory({ name: '元のカテゴリ' });
      useBookmarkStore.setState({ categories: [category] });
      
      useBookmarkStore.getState().updateCategory('category-1', { name: '更新されたカテゴリ' });
      
      const state = useBookmarkStore.getState();
      expect(state.categories[0].name).toBe('更新されたカテゴリ');
    });

    it('should delete category and remove categoryId from bookmarks', () => {
      const category = createMockCategory({ id: 'category-to-delete' });
      const bookmark1 = createMockBookmark({ id: 'bookmark-1', categoryId: 'category-to-delete' });
      const bookmark2 = createMockBookmark({ id: 'bookmark-2', categoryId: 'other-category' });
      
      useBookmarkStore.setState({
        categories: [category],
        bookmarks: [bookmark1, bookmark2],
      });
      
      useBookmarkStore.getState().deleteCategory('category-to-delete');
      
      const state = useBookmarkStore.getState();
      expect(state.categories).toEqual([]);
      expect(state.bookmarks[0].categoryId).toBeUndefined();
      expect(state.bookmarks[1].categoryId).toBe('other-category');
    });
  });

  describe('selection management', () => {
    it('should set selected bookmarks', () => {
      const ids = ['bookmark-1', 'bookmark-2'];
      
      useBookmarkStore.getState().setSelectedBookmarks(ids);
      
      const state = useBookmarkStore.getState();
      expect(state.selectedBookmarks).toEqual(ids);
    });

    it('should toggle bookmark selection - add if not selected', () => {
      useBookmarkStore.setState({ selectedBookmarks: ['bookmark-1'] });
      
      useBookmarkStore.getState().toggleBookmarkSelection('bookmark-2');
      
      const state = useBookmarkStore.getState();
      expect(state.selectedBookmarks).toEqual(['bookmark-1', 'bookmark-2']);
    });

    it('should toggle bookmark selection - remove if selected', () => {
      useBookmarkStore.setState({ selectedBookmarks: ['bookmark-1', 'bookmark-2'] });
      
      useBookmarkStore.getState().toggleBookmarkSelection('bookmark-1');
      
      const state = useBookmarkStore.getState();
      expect(state.selectedBookmarks).toEqual(['bookmark-2']);
    });

    it('should clear selection', () => {
      useBookmarkStore.setState({ selectedBookmarks: ['bookmark-1', 'bookmark-2'] });
      
      useBookmarkStore.getState().clearSelection();
      
      const state = useBookmarkStore.getState();
      expect(state.selectedBookmarks).toEqual([]);
    });
  });

  describe('UI state management', () => {
    it('should set view mode', () => {
      useBookmarkStore.getState().setViewMode('list');
      
      const state = useBookmarkStore.getState();
      expect(state.viewMode).toBe('list');
    });

    it('should set filter category and reset page', () => {
      useBookmarkStore.setState({ currentPage: 3 });
      
      useBookmarkStore.getState().setFilterCategory('category-1');
      
      const state = useBookmarkStore.getState();
      expect(state.filterCategory).toBe('category-1');
      expect(state.currentPage).toBe(1);
    });

    it('should clear filter category', () => {
      useBookmarkStore.setState({ filterCategory: 'category-1' });
      
      useBookmarkStore.getState().setFilterCategory(undefined);
      
      const state = useBookmarkStore.getState();
      expect(state.filterCategory).toBeUndefined();
    });

    it('should set search query and reset page', () => {
      useBookmarkStore.setState({ currentPage: 3 });
      
      useBookmarkStore.getState().setSearchQuery('テスト検索');
      
      const state = useBookmarkStore.getState();
      expect(state.searchQuery).toBe('テスト検索');
      expect(state.currentPage).toBe(1);
    });

    it('should set sorting and reset page', () => {
      useBookmarkStore.setState({ currentPage: 3 });
      
      useBookmarkStore.getState().setSorting('author', 'asc');
      
      const state = useBookmarkStore.getState();
      expect(state.sortBy).toBe('author');
      expect(state.sortOrder).toBe('asc');
      expect(state.currentPage).toBe(1);
    });
  });

  describe('pagination and loading', () => {
    it('should set pagination', () => {
      useBookmarkStore.getState().setPagination(3, 10, 200);
      
      const state = useBookmarkStore.getState();
      expect(state.currentPage).toBe(3);
      expect(state.totalPages).toBe(10);
      expect(state.totalItems).toBe(200);
    });

    it('should set loading state', () => {
      useBookmarkStore.getState().setLoading(true);
      
      const state = useBookmarkStore.getState();
      expect(state.isLoading).toBe(true);
    });

    it('should set error and clear loading state', () => {
      useBookmarkStore.setState({ isLoading: true });
      
      useBookmarkStore.getState().setError('エラーメッセージ');
      
      const state = useBookmarkStore.getState();
      expect(state.error).toBe('エラーメッセージ');
      expect(state.isLoading).toBe(false);
    });

    it('should clear error', () => {
      useBookmarkStore.setState({ error: 'エラーメッセージ' });
      
      useBookmarkStore.getState().setError(undefined);
      
      const state = useBookmarkStore.getState();
      expect(state.error).toBeUndefined();
    });
  });

  describe('resetFilters', () => {
    it('should reset all filters and UI state', () => {
      useBookmarkStore.setState({
        filterCategory: 'category-1',
        searchQuery: 'テスト',
        sortBy: 'author',
        sortOrder: 'asc',
        currentPage: 5,
        selectedBookmarks: ['bookmark-1', 'bookmark-2'],
      });
      
      useBookmarkStore.getState().resetFilters();
      
      const state = useBookmarkStore.getState();
      expect(state.filterCategory).toBeUndefined();
      expect(state.searchQuery).toBe('');
      expect(state.sortBy).toBe('date');
      expect(state.sortOrder).toBe('desc');
      expect(state.currentPage).toBe(1);
      expect(state.selectedBookmarks).toEqual([]);
    });
  });
});
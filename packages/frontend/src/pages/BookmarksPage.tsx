import { useState, useCallback, useMemo, memo } from 'react';
import { Grid, List, Filter, Loader2, RefreshCw, Search } from 'lucide-react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useBookmarkStore } from '../stores/bookmarkStore';
import { useBookmarks, useBulkUpdateBookmarks, useBulkDeleteBookmarks } from '../hooks/useBookmarks';
import { useCategories } from '../hooks/useCategories';
import SearchModal from '../components/SearchModal';
import BookmarkCard from '../components/BookmarkCard';
import VirtualBookmarkList from '../components/VirtualBookmarkList';
import { bookmarksToFrontend, categoriesToFrontend } from '../utils/typeUtils';
import { clsx } from 'clsx';
import type { SearchQuery } from '../types';

const BookmarksPage = () => {
  const {
    viewMode,
    setViewMode,
    selectedBookmarks,
    toggleBookmarkSelection,
    clearSelection,
    filterCategory,
    searchQuery,
    sortBy,
    sortOrder,
  } = useBookmarkStore();

  const [showFilters, setShowFilters] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [currentSearchQuery, setCurrentSearchQuery] = useState<Partial<SearchQuery>>({});
  const [page, setPage] = useState(1);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const limit = 20;

  // API queries
  const {
    data: bookmarksData,
    isLoading,
    isError,
    error,
    refetch,
  } = useBookmarks({
    categoryIds: currentSearchQuery.categoryIds || 
                 (filterCategory ? [filterCategory] : undefined),
    text: currentSearchQuery.text || searchQuery || undefined,
    tags: currentSearchQuery.tags,
    dateFrom: currentSearchQuery.dateFrom,
    dateTo: currentSearchQuery.dateTo,
    authorUsername: currentSearchQuery.authorUsername,
    sortBy: currentSearchQuery.sortBy || sortBy,
    sortOrder: currentSearchQuery.sortOrder || sortOrder,
    limit,
    offset: (page - 1) * limit,
  });

  const { data: categories = [] } = useCategories();
  
  // Mutations
  const bulkUpdateMutation = useBulkUpdateBookmarks();
  const bulkDeleteMutation = useBulkDeleteBookmarks();

  // 型変換してからフロントエンドで使用（memoized to prevent unnecessary recalculations）
  const bookmarks = useMemo(() => 
    bookmarksData?.data ? bookmarksToFrontend(bookmarksData.data) : [], 
    [bookmarksData?.data]
  );
  
  const frontendCategories = useMemo(() => 
    categoriesToFrontend(categories), 
    [categories]
  );
  
  const totalCount = bookmarksData?.pagination?.total || 0;
  
  // Computed values
  const hasActiveSearch = useMemo(() => 
    Boolean(currentSearchQuery.text) || 
    Object.keys(currentSearchQuery).some(key => {
      const value = currentSearchQuery[key as keyof SearchQuery];
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(value);
    }), 
    [currentSearchQuery]
  );

  // Event handlers (memoized to prevent unnecessary re-renders)
  const handleBulkCategoryChange = useCallback(async (categoryId: string) => {
    if (selectedBookmarks.length === 0) return;
    
    try {
      await bulkUpdateMutation.mutateAsync({
        bookmarkIds: selectedBookmarks,
        input: { categoryId },
      });
      clearSelection();
    } catch (err) {
      console.error('Failed to update bookmarks:', err);
    }
  }, [selectedBookmarks, bulkUpdateMutation, clearSelection]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedBookmarks.length === 0) return;
    
    if (!confirm(`${selectedBookmarks.length}件のブックマークを削除しますか？`)) {
      return;
    }
    
    try {
      await bulkDeleteMutation.mutateAsync(selectedBookmarks);
      clearSelection();
    } catch (err) {
      console.error('Failed to delete bookmarks:', err);
    }
  }, [selectedBookmarks, bulkDeleteMutation, clearSelection]);

  const handleSearch = useCallback((query: SearchQuery) => {
    setCurrentSearchQuery(query);
    setPage(1); // Reset to first page on new search
  }, []);

  const clearSearch = useCallback(() => {
    setCurrentSearchQuery({});
    setPage(1);
  }, []);

  // Shift+Click対応の選択処理
  const handleBookmarkSelection = useCallback((bookmarkId: string, event?: React.MouseEvent) => {
    const currentIndex = bookmarks.findIndex(bookmark => bookmark.id === bookmarkId);
    
    if (event?.shiftKey && lastSelectedIndex !== null) {
      // Shift+Clickの場合：範囲選択
      const startIndex = Math.min(lastSelectedIndex, currentIndex);
      const endIndex = Math.max(lastSelectedIndex, currentIndex);
      
      const rangeBookmarkIds = bookmarks
        .slice(startIndex, endIndex + 1)
        .map(bookmark => bookmark.id);
      
      // 現在の選択状態を基に範囲選択を処理
      const shouldSelect = !selectedBookmarks.includes(bookmarkId);
      rangeBookmarkIds.forEach(id => {
        if (shouldSelect && !selectedBookmarks.includes(id)) {
          toggleBookmarkSelection(id);
        } else if (!shouldSelect && selectedBookmarks.includes(id)) {
          toggleBookmarkSelection(id);
        }
      });
    } else {
      // 通常のクリック
      toggleBookmarkSelection(bookmarkId);
      setLastSelectedIndex(currentIndex);
    }
  }, [bookmarks, selectedBookmarks, lastSelectedIndex, toggleBookmarkSelection]);

  // ドラッグ&ドロップ処理
  const handleDragStart = useCallback((bookmarkId: string) => {
    setIsDragging(true);
    // ドラッグ中のブックマークが選択されていない場合は選択する
    if (!selectedBookmarks.includes(bookmarkId)) {
      toggleBookmarkSelection(bookmarkId);
    }
  }, [selectedBookmarks, toggleBookmarkSelection]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (targetCategoryId: string, droppedBookmarkIds: string[]) => {
    if (droppedBookmarkIds.length === 0) return;
    
    try {
      await bulkUpdateMutation.mutateAsync({
        bookmarkIds: droppedBookmarkIds,
        input: { categoryId: targetCategoryId },
      });
      clearSelection();
    } catch (err) {
      console.error('Failed to move bookmarks:', err);
    }
  }, [bulkUpdateMutation, clearSelection]);

  // その他のアクション処理
  const handleMoreActions = useCallback((bookmarkId: string) => {
    // TODO: ブックマークの詳細アクションメニューを実装
    console.log('ブックマークアクション:', bookmarkId);
  }, []);

  // Remove duplicate hasActiveSearch declaration (already exists above with useMemo)

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">
          ブックマークを読み込み中...
        </span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="text-center py-12">
        <div className="max-w-sm mx-auto">
          <div className="mb-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto">
              <RefreshCw className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            読み込みエラー
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {error?.message || 'ブックマークの読み込みに失敗しました'}
          </p>
          <button onClick={() => refetch()} className="btn-primary">
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            ブックマーク
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {totalCount} 件のブックマーク
            {(filterCategory || hasActiveSearch) && (
              <span className="ml-2 text-primary-600 dark:text-primary-400">
                (フィルター適用中)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center space-x-4">
          {/* Search Button */}
          <button
            onClick={() => setShowSearchModal(true)}
            className="btn-secondary flex items-center space-x-2"
          >
            <Search className="w-4 h-4" />
            <span>検索</span>
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={clsx(
                'p-2 rounded transition-colors',
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              )}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx(
                'p-2 rounded transition-colors',
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Filters Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary flex items-center space-x-2"
          >
            <Filter className="w-4 h-4" />
            <span>フィルター</span>
          </button>
        </div>
      </div>

      {/* Selection Bar */}
      {selectedBookmarks.length > 0 && (
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-primary-800 dark:text-primary-200">
              {selectedBookmarks.length} 件選択中
            </span>
            <div className="flex items-center space-x-2">
              {/* Category Change Dropdown */}
              <div className="relative group">
                <button className="btn-primary text-sm py-1 px-3">
                  カテゴリ変更
                </button>
                <div className="absolute left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <div className="py-1 max-h-48 overflow-y-auto">
                    {frontendCategories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => handleBulkCategoryChange(category.id)}
                        disabled={bulkUpdateMutation.isPending}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
                      >
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: category.color }}
                        />
                        <span>{category.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
                className="btn-secondary text-sm py-1 px-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                {bulkDeleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  '削除'
                )}
              </button>
              
              <button
                onClick={clearSelection}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                選択解除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Search Indicator */}
      {hasActiveSearch && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Search className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-blue-800 dark:text-blue-200">
                検索条件が適用されています
                {currentSearchQuery.text && (
                  <span className="ml-2 font-medium">
                    キーワード: "{currentSearchQuery.text}"
                  </span>
                )}
                {currentSearchQuery.tags && currentSearchQuery.tags.length > 0 && (
                  <span className="ml-2 font-medium">
                    タグ: {currentSearchQuery.tags.join(', ')}
                  </span>
                )}
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowSearchModal(true)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
              >
                編集
              </button>
              <button
                onClick={clearSearch}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
              >
                クリア
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bookmarks Virtual List */}
      {bookmarks.length > 0 ? (
        totalCount > 100 ? (
          // Use virtual scrolling for large datasets (>100 items)
          <VirtualBookmarkList
            bookmarks={bookmarks}
            height={600}
            itemHeight={viewMode === 'grid' ? 280 : 180}
            viewMode={viewMode}
            isLoading={isLoading}
            searchTerms={currentSearchQuery.text ? [currentSearchQuery.text] : []}
            className="rounded-lg border border-gray-200 dark:border-gray-700"
          />
        ) : (
          // Use regular rendering for small datasets
          <div
            className={clsx(
              'gap-6',
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                : 'space-y-4'
            )}
          >
            {bookmarks.map((bookmark, index) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                categories={frontendCategories}
                isSelected={selectedBookmarks.includes(bookmark.id)}
                viewMode={viewMode}
                onToggleSelection={(id, event) => handleBookmarkSelection(id, event)}
                onMoreActions={handleMoreActions}
                onDragStart={() => handleDragStart(bookmark.id)}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                isDragging={isDragging}
                selectedBookmarks={selectedBookmarks}
                index={index}
              />
            ))}
          </div>
        )
      ) : (
        <div className="text-center py-12">
          <div className="max-w-sm mx-auto">
            <div className="mb-4">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto">
                <Grid className="w-8 h-8 text-gray-400" />
              </div>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              ブックマークがありません
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Xからブックマークを同期して始めましょう
            </p>
            <button 
              className="btn-primary"
              onClick={() => window.location.pathname = '/sync'}
            >
              ブックマークを同期
            </button>
          </div>
        </div>
      )}

        {/* Search Modal */}
        <SearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSearch={handleSearch}
          initialQuery={currentSearchQuery}
        />
      </div>
    </DndProvider>
  );
};

export default BookmarksPage;
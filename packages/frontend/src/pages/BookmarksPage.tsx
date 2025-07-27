import { useState } from 'react';
import { Grid, List, Filter, MoreHorizontal, Loader2, RefreshCw, Search } from 'lucide-react';
import { useBookmarkStore } from '../stores/bookmarkStore';
import { useBookmarks, useBulkUpdateBookmarks, useBulkDeleteBookmarks } from '../hooks/useBookmarks';
import { useCategories } from '../hooks/useCategories';
import SearchModal from '../components/SearchModal';
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
  const limit = 20;

  // API queries
  const {
    data: bookmarksData,
    isLoading,
    isError,
    error,
    refetch,
  } = useBookmarks({
    categoryIds: currentSearchQuery.categoryId ? [currentSearchQuery.categoryId] : 
                 filterCategory ? [filterCategory] : undefined,
    text: currentSearchQuery.q || searchQuery || undefined,
    tags: currentSearchQuery.tags,
    dateFrom: currentSearchQuery.dateFrom,
    dateTo: currentSearchQuery.dateTo,
    author: currentSearchQuery.author,
    sortBy: currentSearchQuery.sortBy || sortBy,
    sortOrder: currentSearchQuery.sortOrder || sortOrder,
    limit,
    offset: (page - 1) * limit,
  });

  const { data: categories = [] } = useCategories();
  
  // Mutations
  const bulkUpdateMutation = useBulkUpdateBookmarks();
  const bulkDeleteMutation = useBulkDeleteBookmarks();

  const bookmarks = bookmarksData?.data || [];
  const totalCount = bookmarksData?.pagination?.total || 0;

  // Event handlers
  const handleBulkCategoryChange = async (categoryId: string) => {
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
  };

  const handleBulkDelete = async () => {
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
  };

  const handleSearch = (query: SearchQuery) => {
    setCurrentSearchQuery(query);
    setPage(1); // Reset to first page on new search
  };

  const clearSearch = () => {
    setCurrentSearchQuery({});
    setPage(1);
  };

  // Check if there's an active search
  const hasActiveSearch = Object.keys(currentSearchQuery).some(key => {
    const value = currentSearchQuery[key as keyof SearchQuery];
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });

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
                    {categories.map((category) => (
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
                {currentSearchQuery.q && (
                  <span className="ml-2 font-medium">
                    キーワード: "{currentSearchQuery.q}"
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

      {/* Bookmarks Grid/List */}
      {bookmarks.length > 0 ? (
        <div
          className={clsx(
            'gap-6',
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              : 'space-y-4'
          )}
        >
          {bookmarks.map((bookmark) => (
            <div
              key={bookmark.id}
              className={clsx(
                'card p-4 cursor-pointer transition-all duration-200 hover:shadow-md',
                selectedBookmarks.includes(bookmark.id)
                  ? 'ring-2 ring-primary-500 border-primary-300 dark:border-primary-600'
                  : 'hover:border-gray-300 dark:hover:border-gray-600'
              )}
              onClick={() => toggleBookmarkSelection(bookmark.id)}
            >
              {/* Author Info */}
              <div className="flex items-center space-x-3 mb-3">
                {bookmark.authorAvatarUrl ? (
                  <img
                    src={bookmark.authorAvatarUrl}
                    alt={bookmark.authorDisplayName}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {bookmark.authorDisplayName}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    @{bookmark.authorUsername}
                  </p>
                </div>
                <button className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              {/* Content */}
              <div className="mb-3">
                <p className="text-gray-900 dark:text-gray-100 line-clamp-3">
                  {bookmark.content}
                </p>
              </div>

              {/* Media Preview */}
              {bookmark.mediaUrls.length > 0 && (
                <div className="mb-3">
                  <div className="grid grid-cols-2 gap-2">
                    {bookmark.mediaUrls.slice(0, 4).map((url, index) => (
                      <img
                        key={index}
                        src={url}
                        alt=""
                        className="w-full h-20 object-cover rounded"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {bookmark.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {bookmark.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                <span>
                  {new Date(bookmark.bookmarkedAt).toLocaleDateString('ja-JP')}
                </span>
                {bookmark.categoryId && (
                  (() => {
                    const category = categories.find(c => c.id === bookmark.categoryId);
                    return category ? (
                      <span 
                        className="px-2 py-1 rounded text-xs flex items-center space-x-1"
                        style={{ 
                          backgroundColor: category.color + '20',
                          color: category.color 
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded"
                          style={{ backgroundColor: category.color }}
                        />
                        <span>{category.name}</span>
                      </span>
                    ) : null;
                  })()
                )}
              </div>
            </div>
          ))}
        </div>
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
  );
};

export default BookmarksPage;
import { useState, useEffect } from 'react';
import { Search, Filter, TrendingUp, Clock, Tag, Grid, List, Loader2, RefreshCw } from 'lucide-react';
import { useBookmarks } from '../hooks/useBookmarks';
import { useCategories } from '../hooks/useCategories';
import { useSearchHistory } from '../hooks/useSearchHistory';
import SearchModal from '../components/SearchModal';
import { clsx } from 'clsx';
import type { SearchQuery, Bookmark } from '../types';

const SearchPage = () => {
  const [searchQuery, setSearchQuery] = useState<Partial<SearchQuery>>({});
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: categories = [] } = useCategories();
  const { data: searchHistory, getPopularTags } = useSearchHistory();

  // API query for search results
  const {
    data: searchResults,
    isLoading,
    isError,
    error,
    refetch,
  } = useBookmarks({
    text: searchQuery.q || quickSearch || undefined,
    categoryIds: searchQuery.categoryId ? [searchQuery.categoryId] : undefined,
    tags: searchQuery.tags,
    dateFrom: searchQuery.dateFrom,
    dateTo: searchQuery.dateTo,
    author: searchQuery.author,
    sortBy: searchQuery.sortBy || 'relevance',
    sortOrder: searchQuery.sortOrder || 'desc',
    limit,
    offset: (page - 1) * limit,
  });

  const bookmarks = searchResults?.data || [];
  const totalCount = searchResults?.pagination?.total || 0;
  const popularTags = getPopularTags(15);

  // Check if there's an active search
  const hasActiveSearch = Boolean(quickSearch) || Object.keys(searchQuery).some(key => {
    const value = searchQuery[key as keyof SearchQuery];
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });

  const handleAdvancedSearch = (query: SearchQuery) => {
    setSearchQuery(query);
    setQuickSearch('');
    setPage(1);
  };

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery({});
    setPage(1);
  };

  const handleTagClick = (tag: string) => {
    setSearchQuery({ tags: [tag] });
    setQuickSearch('');
    setPage(1);
  };

  const handleCategoryClick = (categoryId: string) => {
    setSearchQuery({ categoryId });
    setQuickSearch('');
    setPage(1);
  };

  const clearSearch = () => {
    setSearchQuery({});
    setQuickSearch('');
    setPage(1);
  };

  const recentSearches = searchHistory.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          ブックマーク検索
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          高度な検索機能でブックマークを効率的に見つけましょう
        </p>
      </div>

      {/* Quick Search */}
      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleQuickSearch} className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder="キーワードを入力してブックマークを検索..."
            className="w-full pl-12 pr-32 py-4 text-lg border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex space-x-2">
            <button
              type="button"
              onClick={() => setShowSearchModal(true)}
              className="px-4 py-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 border border-primary-300 dark:border-primary-600 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20"
            >
              詳細検索
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
            >
              検索
            </button>
          </div>
        </form>
      </div>

      {/* Popular Tags & Categories */}
      {!hasActiveSearch && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Popular Tags */}
          <div className="card p-6">
            <div className="flex items-center space-x-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                人気のタグ
              </h3>
            </div>
            {popularTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {popularTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTagClick(tag)}
                    className="inline-flex items-center px-3 py-2 rounded-full text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-primary-100 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                  >
                    <Tag className="w-3 h-3 mr-1" />
                    {tag}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                まだ使用されているタグがありません
              </p>
            )}
          </div>

          {/* Categories */}
          <div className="card p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Filter className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                カテゴリで検索
              </h3>
            </div>
            {categories.length > 0 ? (
              <div className="space-y-2">
                {categories.slice(0, 6).map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryClick(category.id)}
                    className="w-full flex items-center space-x-3 p-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="text-gray-900 dark:text-gray-100">
                      {category.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                カテゴリがまだ作成されていません
              </p>
            )}
          </div>
        </div>
      )}

      {/* Recent Searches */}
      {!hasActiveSearch && recentSearches.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Clock className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              最近の検索
            </h3>
          </div>
          <div className="space-y-2">
            {recentSearches.map((search, index) => (
              <button
                key={index}
                onClick={() => handleAdvancedSearch(search)}
                className="w-full text-left p-3 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  {search.q || '(キーワードなし)'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {search.categoryId && categories.find(c => c.id === search.categoryId)?.name}
                  {search.tags && search.tags.length > 0 && (
                    <span className="ml-2">
                      タグ: {search.tags.join(', ')}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      {hasActiveSearch && (
        <div className="space-y-6">
          {/* Search Results Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                検索結果
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {totalCount} 件のブックマークが見つかりました
              </p>
            </div>

            <div className="flex items-center space-x-4">
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

              <button
                onClick={clearSearch}
                className="btn-secondary"
              >
                検索をクリア
              </button>
            </div>
          </div>

          {/* Results */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              <span className="ml-2 text-gray-600 dark:text-gray-400">
                検索中...
              </span>
            </div>
          ) : isError ? (
            <div className="text-center py-12">
              <div className="max-w-sm mx-auto">
                <div className="mb-4">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto">
                    <RefreshCw className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  検索エラー
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  {error?.message || '検索中にエラーが発生しました'}
                </p>
                <button onClick={() => refetch()} className="btn-primary">
                  再試行
                </button>
              </div>
            </div>
          ) : bookmarks.length > 0 ? (
            <div
              className={clsx(
                'gap-6',
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                  : 'space-y-4'
              )}
            >
              {bookmarks.map((bookmark: Bookmark) => (
                <div
                  key={bookmark.id}
                  className="card p-4 hover:shadow-md transition-shadow"
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
                  </div>

                  {/* Content */}
                  <div className="mb-3">
                    <p className="text-gray-900 dark:text-gray-100 line-clamp-3">
                      {bookmark.content}
                    </p>
                  </div>

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
                    <Search className="w-8 h-8 text-gray-400" />
                  </div>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  検索結果がありません
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  検索条件を変更して再度お試しください
                </p>
                <button
                  onClick={() => setShowSearchModal(true)}
                  className="btn-primary"
                >
                  検索条件を変更
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Modal */}
      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSearch={handleAdvancedSearch}
        initialQuery={searchQuery}
      />
    </div>
  );
};

export default SearchPage;
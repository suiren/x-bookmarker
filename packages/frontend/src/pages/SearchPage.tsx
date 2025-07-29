import { useState } from 'react';
import { Search, Filter, TrendingUp, Clock, Tag, Grid, List, Loader2, RefreshCw } from 'lucide-react';
import { useBookmarks } from '../hooks/useBookmarks';
import { useCategories } from '../hooks/useCategories';
import { useSearchHistory } from '../hooks/useSearchHistory';
import SearchModal from '../components/SearchModal';
import SearchBar from '../components/search/SearchBar';
import SearchFacets from '../components/search/SearchFacets';
import SearchBookmarkCard from '../components/search/SearchBookmarkCard';
import SearchHistory from '../components/search/SearchHistory';
import SortControls from '../components/search/SortControls';
import Pagination from '../components/common/Pagination';
import { useSearchHighlight } from '../hooks/useSearchHighlight';
import { clsx } from 'clsx';
import type { SearchQuery, Bookmark } from '../types';

const SearchPage = () => {
  const [searchQuery, setSearchQuery] = useState<Partial<SearchQuery>>({});
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [selectedFacets, setSelectedFacets] = useState<{
    categories?: string[];
    tags?: string[];
    authors?: string[];
  }>({});
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
  const totalPages = Math.ceil(totalCount / limit);
  const popularTags = getPopularTags(15);

  // Get search terms for highlighting
  const { searchTerms } = useSearchHighlight(
    {
      q: searchQuery.q,
      categoryId: searchQuery.categoryId,
      tags: searchQuery.tags,
      dateFrom: searchQuery.dateFrom,
      dateTo: searchQuery.dateTo,
      author: searchQuery.author,
    },
    quickSearch
  );

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

  const handleQuickSearch = (query: string) => {
    setSearchQuery({ q: query });
    setQuickSearch(query);
    setPage(1);
  };

  const handleSuggestionSelect = (suggestion: {
    type: 'tag' | 'category' | 'author';
    value: string;
    data?: any;
  }) => {
    switch (suggestion.type) {
      case 'tag':
        setSearchQuery({ tags: [suggestion.value] });
        break;
      case 'category':
        setSearchQuery({ categoryId: suggestion.data?.id || suggestion.value });
        break;
      case 'author':
        setSearchQuery({ author: suggestion.value });
        break;
    }
    setQuickSearch('');
    setPage(1);
  };

  const handleFacetSelect = (facet: {
    type: 'category' | 'tag' | 'author';
    value: string;
    data?: any;
  }) => {
    const newQuery = { ...searchQuery };
    const newFacets = { ...selectedFacets };

    switch (facet.type) {
      case 'category':
        newQuery.categoryId = facet.value;
        newFacets.categories = [facet.value];
        break;
      case 'tag':
        const currentTags = newQuery.tags || [];
        if (currentTags.includes(facet.value)) {
          newQuery.tags = currentTags.filter(t => t !== facet.value);
          newFacets.tags = newFacets.tags?.filter(t => t !== facet.value) || [];
        } else {
          newQuery.tags = [...currentTags, facet.value];
          newFacets.tags = [...(newFacets.tags || []), facet.value];
        }
        break;
      case 'author':
        newQuery.author = facet.value;
        newFacets.authors = [facet.value];
        break;
    }

    setSearchQuery(newQuery);
    setSelectedFacets(newFacets);
    setQuickSearch('');
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
    setSelectedFacets({});
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

      {/* Search Bar */}
      <div className="max-w-2xl mx-auto">
        <SearchBar
          value={quickSearch}
          onChange={setQuickSearch}
          onSearch={handleQuickSearch}
          onSuggestionSelect={handleSuggestionSelect}
          onAdvancedClick={() => setShowSearchModal(true)}
          autoFocus
        />
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

      {/* Search History */}
      {!hasActiveSearch && (
        <div className="card p-6">
          <SearchHistory
            onSearchSelect={handleAdvancedSearch}
            currentQuery={searchQuery}
            maxItems={5}
            showHeader={true}
          />
        </div>
      )}

      {/* Search Results */}
      {hasActiveSearch && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Search Facets Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <SearchFacets
              searchQuery={{
                q: searchQuery.q || quickSearch || undefined,
                categoryId: searchQuery.categoryId,
                tags: searchQuery.tags,
                dateFrom: searchQuery.dateFrom,
                dateTo: searchQuery.dateTo,
                author: searchQuery.author,
              }}
              onFacetSelect={handleFacetSelect}
              selectedFacets={selectedFacets}
            />
            
            {/* Search History in Sidebar */}
            <div className="card p-4">
              <SearchHistory
                onSearchSelect={handleAdvancedSearch}
                currentQuery={searchQuery}
                maxItems={3}
                showHeader={true}
              />
            </div>
          </div>

          {/* Main Results Area */}
          <div className="lg:col-span-3 space-y-6">
          {/* Search Results Header */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  検索結果
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {totalCount.toLocaleString()} 件のブックマークが見つかりました
                </p>
              </div>

              <button
                onClick={clearSearch}
                className="btn-secondary sm:self-start"
              >
                検索をクリア
              </button>
            </div>

            {/* Controls Row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Sort Controls */}
              <SortControls
                sortBy={searchQuery.sortBy || 'relevance'}
                sortOrder={searchQuery.sortOrder || 'desc'}
                onSortChange={(sortBy, sortOrder) => {
                  setSearchQuery(prev => ({ ...prev, sortBy, sortOrder }));
                  setPage(1);
                }}
                disabled={isLoading}
              />

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
                  title="グリッド表示"
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
                  title="リスト表示"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
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
                <SearchBookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  searchTerms={searchTerms}
                  viewMode={viewMode}
                  onTagClick={handleTagClick}
                  onAuthorClick={(username) => {
                    setSearchQuery({ author: username });
                    setQuickSearch('');
                    setPage(1);
                  }}
                  onCategoryClick={handleCategoryClick}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalCount > limit && (
              <div className="mt-8">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  itemsPerPage={limit}
                  onPageChange={setPage}
                  showInfo={true}
                />
              </div>
            )}
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
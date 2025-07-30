import { useState, useEffect, memo } from 'react';
import { X, Search, Filter, Tag, User } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { useSearchHistory } from '../hooks/useSearchHistory';
import type { SearchQuery, Category } from '../types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: SearchQuery) => void;
  initialQuery?: Partial<SearchQuery>;
}

const SearchModal = memo<SearchModalProps>(({ isOpen, onClose, onSearch, initialQuery = {} }) => {
  const { data: categories = [] } = useCategories();
  const { data: searchHistory = [], addToHistory } = useSearchHistory();

  const [query, setQuery] = useState<Partial<SearchQuery>>({
    text: '',
    categoryIds: [],
    tags: [],
    dateFrom: undefined,
    dateTo: undefined,
    authorUsername: '',
    sortBy: 'relevance',
    sortOrder: 'desc',
    ...initialQuery,
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>(query.tags || []);
  const [tagInput, setTagInput] = useState('');

  // Popular tags from search history
  const popularTags = searchHistory
    .flatMap(h => h.tags || [])
    .reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const sortedPopularTags = Object.entries(popularTags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);

  useEffect(() => {
    if (isOpen) {
      setQuery({ ...query, ...initialQuery });
      setSelectedTags(initialQuery.tags || []);
    }
  }, [isOpen, initialQuery]);

  const handleAddTag = (tag: string) => {
    if (tag && !selectedTags.includes(tag)) {
      const newTags = [...selectedTags, tag];
      setSelectedTags(newTags);
      setQuery(prev => ({ ...prev, tags: newTags }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = selectedTags.filter(t => t !== tag);
    setSelectedTags(newTags);
    setQuery(prev => ({ ...prev, tags: newTags }));
  };

  const handleSearch = () => {
    const searchQuery: SearchQuery = {
      text: query.text || '',
      categoryIds: query.categoryIds || [],
      tags: selectedTags,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      authorUsername: query.authorUsername,
      sortBy: query.sortBy || 'relevance',
      sortOrder: query.sortOrder || 'desc',
      limit: 20,
      offset: 0,
    };

    // Save to search history
    addToHistory(searchQuery);
    
    onSearch(searchQuery);
    onClose();
  };

  const handleHistoryItemClick = (historyItem: SearchQuery) => {
    setQuery(historyItem);
    setSelectedTags(historyItem.tags || []);
  };

  const clearQuery = () => {
    setQuery({
      text: '',
      categoryIds: [],
      tags: [],
      dateFrom: undefined,
      dateTo: undefined,
      authorUsername: '',
      sortBy: 'relevance',
      sortOrder: 'desc',
    });
    setSelectedTags([]);
    setTagInput('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            高度な検索
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              キーワード検索
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={query.text || ''}
                onChange={(e) => setQuery(prev => ({ ...prev, text: e.target.value }))}
                placeholder="タイトル、説明、URLを検索..."
                className="input pl-10 w-full"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              カテゴリ
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-2">
              {categories.map((category: Category) => (
                <label key={category.id} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={query.categoryIds?.includes(category.id) || false}
                    onChange={(e) => {
                      const currentIds = query.categoryIds || [];
                      const newIds = e.target.checked
                        ? [...currentIds, category.id]
                        : currentIds.filter(id => id !== category.id);
                      setQuery(prev => ({ ...prev, categoryIds: newIds }));
                    }}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {category.name}
                  </span>
                </label>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  カテゴリがありません
                </p>
              )}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              タグ
            </label>
            
            {/* Selected Tags */}
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200"
                  >
                    <Tag className="w-3 h-3 mr-1" />
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-2 text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Tag Input */}
            <div className="flex space-x-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag(tagInput.trim());
                  }
                }}
                placeholder="タグを入力してEnterキー"
                className="input flex-1"
              />
              <button
                onClick={() => handleAddTag(tagInput.trim())}
                disabled={!tagInput.trim()}
                className="btn-secondary"
              >
                追加
              </button>
            </div>

            {/* Popular Tags */}
            {sortedPopularTags.length > 0 && (
              <div className="mt-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  よく使われるタグ:
                </p>
                <div className="flex flex-wrap gap-2">
                  {sortedPopularTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleAddTag(tag)}
                      className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      <Tag className="w-3 h-3 mr-1" />
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            <Filter className="w-4 h-4" />
            <span>{showAdvanced ? '詳細フィルターを隠す' : '詳細フィルターを表示'}</span>
          </button>

          {/* Advanced Filters */}
          {showAdvanced && (
            <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  日付範囲
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      開始日
                    </label>
                    <input
                      type="date"
                      value={query.dateFrom ? query.dateFrom.toISOString().split('T')[0] : ''}
                      onChange={(e) => setQuery(prev => ({ 
                        ...prev, 
                        dateFrom: e.target.value ? new Date(e.target.value) : undefined 
                      }))}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      終了日
                    </label>
                    <input
                      type="date"
                      value={query.dateTo ? query.dateTo.toISOString().split('T')[0] : ''}
                      onChange={(e) => setQuery(prev => ({ 
                        ...prev, 
                        dateTo: e.target.value ? new Date(e.target.value) : undefined 
                      }))}
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Author */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  作成者
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={query.authorUsername || ''}
                    onChange={(e) => setQuery(prev => ({ ...prev, authorUsername: e.target.value }))}
                    placeholder="Xユーザー名"
                    className="input pl-10 w-full"
                  />
                </div>
              </div>

              {/* Sort Options */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  並び順
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={query.sortBy || 'relevance'}
                    onChange={(e) => setQuery(prev => ({ 
                      ...prev, 
                      sortBy: e.target.value as 'relevance' | 'date' | 'author'
                    }))}
                    className="input"
                  >
                    <option value="relevance">関連度</option>
                    <option value="date">日付</option>
                    <option value="author">作成者</option>
                  </select>
                  <select
                    value={query.sortOrder || 'desc'}
                    onChange={(e) => setQuery(prev => ({ 
                      ...prev, 
                      sortOrder: e.target.value as 'asc' | 'desc'
                    }))}
                    className="input"
                  >
                    <option value="desc">降順</option>
                    <option value="asc">昇順</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Search History */}
          {searchHistory.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                検索履歴
              </h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {searchHistory.slice(0, 5).map((item, index) => (
                  <button
                    key={index}
                    onClick={() => handleHistoryItemClick(item)}
                    className="w-full text-left p-2 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {item.text || '(キーワードなし)'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {item.categoryIds && item.categoryIds.length > 0 && (
                        <span>
                          カテゴリ: {item.categoryIds.map(id => 
                            categories.find(c => c.id === id)?.name
                          ).filter(Boolean).join(', ')}
                        </span>
                      )}
                      {item.tags && item.tags.length > 0 && (
                        <span className={item.categoryIds && item.categoryIds.length > 0 ? "ml-2" : ""}>
                          タグ: {item.tags.join(', ')}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={clearQuery}
            className="btn-secondary"
          >
            クリア
          </button>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="btn-secondary"
            >
              キャンセル
            </button>
            <button
              onClick={handleSearch}
              className="btn-primary"
            >
              検索
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

SearchModal.displayName = 'SearchModal';

export default SearchModal;
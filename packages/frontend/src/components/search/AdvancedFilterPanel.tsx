import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Filter, Calendar, Tag, User, Image, Link as LinkIcon } from 'lucide-react';
import { useSearchStore } from '../../stores/searchStore';
import { useCategories } from '../../hooks/useCategories';

interface SavedFilter {
  id: string;
  name: string;
  query: string;
  categoryIds: string[];
  tags: string[];
  dateFrom?: Date;
  dateTo?: Date;
  authorUsername?: string;
  hasMedia?: boolean;
  hasLinks?: boolean;
  createdAt: Date;
}

interface AdvancedFilterPanelProps {
  open: boolean;
  onClose: () => void;
}

export const AdvancedFilterPanel: React.FC<AdvancedFilterPanelProps> = ({
  open,
  onClose,
}) => {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);

  const {
    query,
    setQuery,
    categoryIds,
    setCategoryIds,
    tags,
    setTags,
    dateFrom,
    dateTo,
    setDateRange,
    authorUsername,
    setAuthorUsername,
    hasMedia,
    setHasMedia,
    hasLinks,
    setHasLinks,
    clearFilters,
  } = useSearchStore();

  const { data: categories = [] } = useCategories();

  // Load saved filters from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('x-bookmarker-saved-filters');
      if (saved) {
        const parsed = JSON.parse(saved);
        setSavedFilters(parsed.map((filter: any) => ({
          ...filter,
          dateFrom: filter.dateFrom ? new Date(filter.dateFrom) : undefined,
          dateTo: filter.dateTo ? new Date(filter.dateTo) : undefined,
          createdAt: new Date(filter.createdAt),
        })));
      }
    } catch (error) {
      console.error('Failed to load saved filters:', error);
    }
  }, []);

  // Save filters to localStorage
  const saveFiltersToStorage = (filters: SavedFilter[]) => {
    try {
      localStorage.setItem('x-bookmarker-saved-filters', JSON.stringify(filters));
    } catch (error) {
      console.error('Failed to save filters:', error);
    }
  };

  const handleSaveFilter = () => {
    if (!filterName.trim()) return;

    const newFilter: SavedFilter = {
      id: crypto.randomUUID(),
      name: filterName.trim(),
      query,
      categoryIds,
      tags,
      dateFrom,
      dateTo,
      authorUsername,
      hasMedia,
      hasLinks,
      createdAt: new Date(),
    };

    const updatedFilters = [newFilter, ...savedFilters];
    setSavedFilters(updatedFilters);
    saveFiltersToStorage(updatedFilters);
    setFilterName('');
    setShowSaveDialog(false);
  };

  const handleLoadFilter = (filter: SavedFilter) => {
    setQuery(filter.query);
    setCategoryIds(filter.categoryIds);
    setTags(filter.tags);
    setDateRange(filter.dateFrom, filter.dateTo);
    setAuthorUsername(filter.authorUsername);
    setHasMedia(filter.hasMedia);
    setHasLinks(filter.hasLinks);
  };

  const handleDeleteFilter = (filterId: string) => {
    const updatedFilters = savedFilters.filter(f => f.id !== filterId);
    setSavedFilters(updatedFilters);
    saveFiltersToStorage(updatedFilters);
  };

  const handleCategoryToggle = (categoryId: string) => {
    const newCategoryIds = categoryIds.includes(categoryId)
      ? categoryIds.filter(id => id !== categoryId)
      : [...categoryIds, categoryId];
    setCategoryIds(newCategoryIds);
  };

  const handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      const newTag = e.currentTarget.value.trim();
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      e.currentTarget.value = '';
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* パネルコンテンツ */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Filter className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              高度なフィルター
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaveDialog(true)}
              className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Save className="h-4 w-4 mr-1 inline" />
              保存
            </button>
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              <Trash2 className="h-4 w-4 mr-1 inline" />
              クリア
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="閉じる"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex h-[calc(90vh-80px)]">
          {/* 保存されたフィルター */}
          <div className="w-1/3 p-6 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              保存されたフィルター
            </h3>
            
            {savedFilters.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                保存されたフィルターはありません
              </p>
            ) : (
              <div className="space-y-2">
                {savedFilters.map((filter) => (
                  <div 
                    key={filter.id}
                    className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                        {filter.name}
                      </h4>
                      <button
                        onClick={() => handleDeleteFilter(filter.id)}
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {filter.createdAt.toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                      {filter.query && `"${filter.query}"`}
                      {filter.categoryIds.length > 0 && ` • ${filter.categoryIds.length}カテゴリ`}
                      {filter.tags.length > 0 && ` • ${filter.tags.length}タグ`}
                    </div>
                    <button
                      onClick={() => handleLoadFilter(filter)}
                      className="w-full px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    >
                      適用
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* フィルター設定 */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="grid gap-6">
              {/* テキスト検索 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  テキスト検索
                </label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="検索キーワードを入力..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* カテゴリ選択 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  カテゴリ
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {categories.map((category) => (
                    <label
                      key={category.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={categoryIds.includes(category.id)}
                        onChange={() => handleCategoryToggle(category.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {category.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* タグ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  タグ
                </label>
                <input
                  type="text"
                  placeholder="タグを入力してEnterキーを押す..."
                  onKeyDown={handleTagInput}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full"
                      >
                        <Tag className="h-3 w-3" />
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 日付範囲 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Calendar className="h-4 w-4 inline mr-1" />
                    開始日
                  </label>
                  <input
                    type="date"
                    value={dateFrom ? dateFrom.toISOString().split('T')[0] : ''}
                    onChange={(e) => setDateRange(e.target.value ? new Date(e.target.value) : undefined, dateTo)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Calendar className="h-4 w-4 inline mr-1" />
                    終了日
                  </label>
                  <input
                    type="date"
                    value={dateTo ? dateTo.toISOString().split('T')[0] : ''}
                    onChange={(e) => setDateRange(dateFrom, e.target.value ? new Date(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* 作者 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <User className="h-4 w-4 inline mr-1" />
                  作者
                </label>
                <input
                  type="text"
                  value={authorUsername || ''}
                  onChange={(e) => setAuthorUsername(e.target.value || undefined)}
                  placeholder="@username"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* メディア・リンクフィルター */}
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={hasMedia || false}
                    onChange={(e) => setHasMedia(e.target.checked ? true : undefined)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <Image className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    画像・動画あり
                  </span>
                </label>
                <label className="flex items-center gap-2 p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={hasLinks || false}
                    onChange={(e) => setHasLinks(e.target.checked ? true : undefined)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <LinkIcon className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    リンクあり
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 保存ダイアログ */}
      {showSaveDialog && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              フィルターを保存
            </h3>
            <input
              autoFocus
              type="text"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              placeholder="フィルター名を入力..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveFilter()}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveFilter}
                disabled={!filterName.trim()}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
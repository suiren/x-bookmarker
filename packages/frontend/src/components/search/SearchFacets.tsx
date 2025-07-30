import { useState } from 'react';
import { ChevronDown, ChevronRight, Tag, Folder, User, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useSearchFacets } from '../../hooks/useSearchSuggestions';
import type { SearchFacets as SearchFacetsType } from '../../hooks/useSearchSuggestions';

interface SearchQuery {
  text?: string;
  categoryIds?: string[];
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  authorUsername?: string;
}

interface SearchFacetsProps {
  searchQuery: SearchQuery;
  onFacetSelect: (facet: {
    type: 'category' | 'tag' | 'author';
    value: string;
    data?: any;
  }) => void;
  selectedFacets?: {
    categories?: string[];
    tags?: string[];
    authors?: string[];
  };
  className?: string;
}

interface FacetSectionProps {
  title: string;
  icon: React.ReactNode;
  items: Array<{
    id?: string;
    name?: string;
    value?: string;
    username?: string;
    displayName?: string;
    color?: string;
    count: number;
  }>;
  type: 'category' | 'tag' | 'author';
  selectedValues?: string[];
  onSelect: (value: string, data?: any) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  maxItems?: number;
}

const FacetSection = ({
  title,
  icon,
  items,
  type,
  selectedValues = [],
  onSelect,
  isCollapsed,
  onToggle,
  maxItems = 10,
}: FacetSectionProps) => {
  const [showAll, setShowAll] = useState(false);
  const displayItems = showAll ? items : items.slice(0, maxItems);
  const hasMore = items.length > maxItems;

  const formatLabel = (item: any) => {
    switch (type) {
      case 'tag':
        return `#${item.name || item.value}`;
      case 'author':
        return item.displayName || item.username;
      case 'category':
      default:
        return item.name;
    }
  };

  const getValueForSelection = (item: any) => {
    switch (type) {
      case 'author':
        return item.username;
      case 'category':
        return item.id;
      case 'tag':
      default:
        return item.name || item.value;
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <div className="flex items-center space-x-3">
          <div className="text-gray-500 dark:text-gray-400">
            {icon}
          </div>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {title}
          </span>
          <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
            {items.length}
          </span>
        </div>
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {!isCollapsed && (
        <div className="px-4 pb-3">
          <div className="space-y-2">
            {displayItems.map((item) => {
              const value = getValueForSelection(item);
              const isSelected = selectedValues.includes(value);
              
              return (
                <button
                  key={`${type}-${value}`}
                  onClick={() => onSelect(value, item)}
                  className={clsx(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors',
                    isSelected
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  )}
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      {type === 'category' && item.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {formatLabel(item)}
                      </div>
                      {type === 'author' && item.username && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          @{item.username}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded-full">
                        {item.count}
                      </span>
                      {isSelected && (
                        <X className="w-3 h-3 text-primary-600 dark:text-primary-400" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {hasMore && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full mt-3 px-3 py-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            >
              {showAll ? '表示を減らす' : `さらに${items.length - maxItems}件表示`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const SearchFacets = ({
  searchQuery,
  onFacetSelect,
  selectedFacets = {},
  className,
}: SearchFacetsProps) => {
  const [collapsedSections, setCollapsedSections] = useState<{
    categories: boolean;
    tags: boolean;
    authors: boolean;
  }>({
    categories: false,
    tags: false,
    authors: false,
  });

  const { data: facets, isLoading, error } = useSearchFacets(searchQuery);

  const toggleSection = (section: 'categories' | 'tags' | 'authors') => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleFacetSelect = (
    type: 'category' | 'tag' | 'author',
    value: string,
    data?: any
  ) => {
    onFacetSelect({ type, value, data });
  };

  if (isLoading) {
    return (
      <div className={clsx('bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700', className)}>
        <div className="p-4">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              ファセットを読み込み中...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={clsx('bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700', className)}>
        <div className="p-4">
          <div className="text-sm text-red-600 dark:text-red-400">
            ファセットの読み込みに失敗しました
          </div>
        </div>
      </div>
    );
  }

  if (!facets || (
    facets.categories.length === 0 &&
    facets.tags.length === 0 &&
    facets.authors.length === 0
  )) {
    return (
      <div className={clsx('bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700', className)}>
        <div className="p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
            検索結果に基づくフィルタはありません
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700', className)}>
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
          検索フィルタ
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          クリックして結果を絞り込み
        </p>
      </div>

      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {facets.categories.length > 0 && (
          <FacetSection
            title="カテゴリ"
            icon={<Folder className="w-4 h-4" />}
            items={facets.categories}
            type="category"
            selectedValues={selectedFacets.categories}
            onSelect={(value, data) => handleFacetSelect('category', value, data)}
            isCollapsed={collapsedSections.categories}
            onToggle={() => toggleSection('categories')}
            maxItems={8}
          />
        )}

        {facets.tags.length > 0 && (
          <FacetSection
            title="タグ"
            icon={<Tag className="w-4 h-4" />}
            items={facets.tags}
            type="tag"
            selectedValues={selectedFacets.tags}
            onSelect={(value, data) => handleFacetSelect('tag', value, data)}
            isCollapsed={collapsedSections.tags}
            onToggle={() => toggleSection('tags')}
            maxItems={10}
          />
        )}

        {facets.authors.length > 0 && (
          <FacetSection
            title="作成者"
            icon={<User className="w-4 h-4" />}
            items={facets.authors}
            type="author"
            selectedValues={selectedFacets.authors}
            onSelect={(value, data) => handleFacetSelect('author', value, data)}
            isCollapsed={collapsedSections.authors}
            onToggle={() => toggleSection('authors')}
            maxItems={8}
          />
        )}
      </div>
    </div>
  );
};

export default SearchFacets;
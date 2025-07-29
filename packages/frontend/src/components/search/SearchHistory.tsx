import { useState } from 'react';
import { Clock, Search, Tag, Folder, User, Calendar, Trash2, RotateCcw, X, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';
import { useSearchHistory } from '../../hooks/useSearchHistory';
import type { SearchQuery } from '../../types';

interface SearchHistoryProps {
  onSearchSelect: (query: SearchQuery) => void;
  currentQuery?: SearchQuery;
  className?: string;
  maxItems?: number;
  showHeader?: boolean;
}

interface SearchHistoryItemProps {
  query: SearchQuery;
  timestamp: Date;
  resultCount: number;
  executionTime: number;
  isActive?: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const SearchHistoryItem = ({
  query,
  timestamp,
  resultCount,
  executionTime,
  isActive,
  onSelect,
  onDelete,
}: SearchHistoryItemProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) {
      const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
      return diffMinutes < 1 ? 'たった今' : `${diffMinutes}分前`;
    } else if (diffHours < 24) {
      return `${diffHours}時間前`;
    } else {
      return date.toLocaleDateString('ja-JP', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  const getQueryDescription = () => {
    const parts = [];
    
    if (query.q) {
      parts.push(`"${query.q}"`);
    }
    
    if (query.categoryId) {
      parts.push(`カテゴリ指定`);
    }
    
    if (query.tags && query.tags.length > 0) {
      parts.push(`タグ: ${query.tags.join(', ')}`);
    }
    
    if (query.author) {
      parts.push(`作成者: ${query.author}`);
    }
    
    if (query.dateFrom || query.dateTo) {
      parts.push('日付範囲指定');
    }
    
    return parts.length > 0 ? parts.join(' • ') : 'すべて';
  };

  const hasFilters = Boolean(
    query.categoryId || 
    (query.tags && query.tags.length > 0) || 
    query.author || 
    query.dateFrom || 
    query.dateTo
  );

  return (
    <div
      className={clsx(
        'group relative border rounded-lg transition-all',
        isActive
          ? 'border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
      )}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <button
            onClick={onSelect}
            className="flex-1 text-left group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
          >
            <div className="flex items-center space-x-2 mb-1">
              <Search className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {query.q || '(キーワードなし)'}
              </span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
              {getQueryDescription()}
            </div>
          </button>
          
          <div className="flex items-center space-x-2 ml-4">
            {hasFilters && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                title="詳細を表示"
              >
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="履歴から削除"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && hasFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
            {query.categoryId && (
              <div className="flex items-center space-x-2 text-sm">
                <Folder className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">
                  カテゴリID: {query.categoryId}
                </span>
              </div>
            )}
            
            {query.tags && query.tags.length > 0 && (
              <div className="flex items-start space-x-2 text-sm">
                <Tag className="w-4 h-4 text-gray-400 mt-0.5" />
                <div className="flex flex-wrap gap-1">
                  {query.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {query.author && (
              <div className="flex items-center space-x-2 text-sm">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">
                  作成者: @{query.author}
                </span>
              </div>
            )}
            
            {(query.dateFrom || query.dateTo) && (
              <div className="flex items-center space-x-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">
                  期間: {query.dateFrom ? new Date(query.dateFrom).toLocaleDateString('ja-JP') : '開始日なし'} 〜 {query.dateTo ? new Date(query.dateTo).toLocaleDateString('ja-JP') : '終了日なし'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>{formatTimestamp(timestamp)}</span>
            </span>
            
            <span>{resultCount.toLocaleString()}件</span>
            
            <span>{executionTime.toFixed(0)}ms</span>
          </div>
          
          <button
            onClick={onSelect}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
          >
            再実行
          </button>
        </div>
      </div>
    </div>
  );
};

const SearchHistory = ({
  onSearchSelect,
  currentQuery,
  className,
  maxItems = 10,
  showHeader = true,
}: SearchHistoryProps) => {
  const { 
    data: historyData, 
    deleteSearchHistory, 
    clearAllSearchHistory,
    isLoading 
  } = useSearchHistory();

  const [showAll, setShowAll] = useState(false);
  
  const history = historyData?.history || [];
  const displayHistory = showAll ? history : history.slice(0, maxItems);
  
  const handleSearchSelect = (query: SearchQuery) => {
    onSearchSelect(query);
  };

  const handleDeleteItem = async (index: number) => {
    const item = history[index];
    if (item?.id) {
      await deleteSearchHistory(item.id);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('すべての検索履歴を削除しますか？この操作は元に戻せません。')) {
      await clearAllSearchHistory();
    }
  };

  if (isLoading) {
    return (
      <div className={clsx('animate-pulse', className)}>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className={clsx('text-center py-8', className)}>
        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          検索履歴がありません
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          検索を実行すると、ここに履歴が表示されます
        </p>
      </div>
    );
  }

  const isCurrentQuery = (query: SearchQuery) => {
    if (!currentQuery) return false;
    
    return (
      query.q === currentQuery.q &&
      query.categoryId === currentQuery.categoryId &&
      JSON.stringify(query.tags?.sort()) === JSON.stringify(currentQuery.tags?.sort()) &&
      query.author === currentQuery.author &&
      query.dateFrom === currentQuery.dateFrom &&
      query.dateTo === currentQuery.dateTo
    );
  };

  return (
    <div className={className}>
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              検索履歴
            </h3>
            <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
              {history.length}
            </span>
          </div>
          
          {history.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center space-x-1 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>すべて削除</span>
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {displayHistory.map((item, index) => (
          <SearchHistoryItem
            key={item.id || index}
            query={item.query}
            timestamp={new Date(item.createdAt)}
            resultCount={item.resultCount}
            executionTime={item.executionTime}
            isActive={isCurrentQuery(item.query)}
            onSelect={() => handleSearchSelect(item.query)}
            onDelete={() => handleDeleteItem(index)}
          />
        ))}
      </div>

      {history.length > maxItems && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="inline-flex items-center space-x-2 px-4 py-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
          >
            {showAll ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span>表示を減らす</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>さらに{history.length - maxItems}件表示</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default SearchHistory;
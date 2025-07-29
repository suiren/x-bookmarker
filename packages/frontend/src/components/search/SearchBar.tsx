import { useState, useRef, useEffect } from 'react';
import { Search, X, Tag, Folder, User, TrendingUp, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useSearchSuggestions, usePopularSuggestions } from '../../hooks/useSearchSuggestions';
import type { SearchSuggestions } from '../../hooks/useSearchSuggestions';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  onSuggestionSelect?: (suggestion: {
    type: 'tag' | 'category' | 'author';
    value: string;
    data?: any;
  }) => void;
  placeholder?: string;
  showAdvancedButton?: boolean;
  onAdvancedClick?: () => void;
  className?: string;
  autoFocus?: boolean;
}

interface SuggestionItemProps {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  count?: number;
  color?: string;
  onClick: () => void;
  isHighlighted: boolean;
}

const SuggestionItem = ({
  icon,
  label,
  sublabel,
  count,
  color,
  onClick,
  isHighlighted,
}: SuggestionItemProps) => (
  <button
    onClick={onClick}
    className={clsx(
      'w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors',
      isHighlighted && 'bg-primary-50 dark:bg-primary-900/20'
    )}
  >
    <div className="flex items-center space-x-3 flex-1 min-w-0">
      <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
          {label}
        </div>
        {sublabel && (
          <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {sublabel}
          </div>
        )}
      </div>
      {color && (
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      {count !== undefined && (
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded-full">
          {count}
        </div>
      )}
    </div>
  </button>
);

const SearchBar = ({
  value,
  onChange,
  onSearch,
  onSuggestionSelect,
  placeholder = 'キーワードを入力してブックマークを検索...',
  showAdvancedButton = true,
  onAdvancedClick,
  className,
  autoFocus = false,
}: SearchBarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Get suggestions based on current input
  const { data: suggestions, isLoading: suggestionsLoading } = useSearchSuggestions(
    value,
    ['tags', 'categories', 'authors'],
    isOpen && value.length >= 2
  );

  // Get popular suggestions when input is empty
  const { data: popularSuggestions } = usePopularSuggestions(
    ['tags', 'categories'],
    8
  );

  // Flatten suggestions for keyboard navigation
  const allSuggestions = suggestions ? [
    ...suggestions.tags.map(tag => ({
      type: 'tag' as const,
      value: tag.value,
      label: tag.value,
      count: tag.count,
      data: tag,
    })),
    ...suggestions.categories.map(category => ({
      type: 'category' as const,
      value: category.name,
      label: category.name,
      count: category.count,
      color: category.color,
      data: category,
    })),
    ...suggestions.authors.map(author => ({
      type: 'author' as const,
      value: author.username,
      label: author.displayName,
      sublabel: `@${author.username}`,
      count: author.count,
      data: author,
    })),
  ] : [];

  const popularItems = popularSuggestions ? [
    ...popularSuggestions.tags.slice(0, 4).map(tag => ({
      type: 'tag' as const,
      value: tag.value,
      label: tag.value,
      count: tag.count,
      data: tag,
    })),
    ...popularSuggestions.categories.slice(0, 4).map(category => ({
      type: 'category' as const,
      value: category.name,
      label: category.name,
      count: category.count,
      color: category.color,
      data: category,
    })),
  ] : [];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setHighlightedIndex(-1);
    
    if (newValue.length >= 2 || newValue.length === 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    const items = value.length >= 2 ? allSuggestions : popularItems;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < items.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();  
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < items.length) {
          const item = items[highlightedIndex];
          handleSuggestionClick(item);
        } else {
          handleSearch();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSuggestionClick = (suggestion: {
    type: 'tag' | 'category' | 'author';
    value: string;
    data?: any;
  }) => {
    if (onSuggestionSelect) {
      onSuggestionSelect(suggestion);
    } else {
      onChange(suggestion.value);
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleSearch = () => {
    onSearch(value);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Delay closing to allow for suggestion clicks
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(document.activeElement)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }, 150);
  };

  const clearInput = () => {
    onChange('');
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  // Show suggestions if input has content or if focused with no content (popular)
  const showSuggestions = isOpen && (
    (value.length >= 2 && suggestions && (
      suggestions.tags.length > 0 ||
      suggestions.categories.length > 0 ||
      suggestions.authors.length > 0
    )) ||
    (value.length === 0 && popularSuggestions && (
      popularSuggestions.tags.length > 0 ||
      popularSuggestions.categories.length > 0
    ))
  );

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  return (
    <div className={clsx('relative', className)}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          className="w-full pl-12 pr-32 py-4 text-lg border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
          {value && (
            <button
              onClick={clearInput}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          
          {showAdvancedButton && onAdvancedClick && (
            <button
              onClick={onAdvancedClick}
              className="px-3 py-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 border border-primary-300 dark:border-primary-600 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20"
            >
              詳細検索
            </button>
          )}
          
          <button
            onClick={handleSearch}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
          >
            検索
          </button>
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-y-auto"
        >
          {value.length >= 2 ? (
            // Search suggestions
            <>
              {suggestionsLoading ? (
                <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  <div className="inline-flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
                    <span>検索中...</span>
                  </div>
                </div>
              ) : (
                <>
                  {suggestions?.tags && suggestions.tags.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600">
                        タグ
                      </div>
                      {suggestions.tags.map((tag, index) => (
                        <SuggestionItem
                          key={`tag-${tag.value}`}
                          icon={<Tag className="w-4 h-4" />}
                          label={`#${tag.value}`}
                          count={tag.count}
                          onClick={() => handleSuggestionClick({
                            type: 'tag',
                            value: tag.value,
                            data: tag,
                          })}
                          isHighlighted={highlightedIndex === index}
                        />
                      ))}
                    </div>
                  )}

                  {suggestions?.categories && suggestions.categories.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600">
                        カテゴリ
                      </div>
                      {suggestions.categories.map((category, index) => {
                        const itemIndex = (suggestions?.tags?.length || 0) + index;
                        return (
                          <SuggestionItem
                            key={`category-${category.id}`}
                            icon={<Folder className="w-4 h-4" />}
                            label={category.name}
                            count={category.count}
                            color={category.color}
                            onClick={() => handleSuggestionClick({
                              type: 'category',
                              value: category.name,
                              data: category,
                            })}
                            isHighlighted={highlightedIndex === itemIndex}
                          />
                        );
                      })}
                    </div>
                  )}

                  {suggestions?.authors && suggestions.authors.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600">
                        作成者
                      </div>
                      {suggestions.authors.map((author, index) => {
                        const itemIndex = (suggestions?.tags?.length || 0) + (suggestions?.categories?.length || 0) + index;
                        return (
                          <SuggestionItem
                            key={`author-${author.username}`}
                            icon={<User className="w-4 h-4" />}
                            label={author.displayName}
                            sublabel={`@${author.username}`}
                            count={author.count}
                            onClick={() => handleSuggestionClick({
                              type: 'author',
                              value: author.username,
                              data: author,
                            })}
                            isHighlighted={highlightedIndex === itemIndex}
                          />
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            // Popular suggestions when no input
            <>
              <div className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-b border-gray-100 dark:border-gray-600 flex items-center space-x-1">
                <TrendingUp className="w-3 h-3" />
                <span>人気の検索</span>
              </div>
              {popularItems.map((item, index) => (
                <SuggestionItem
                  key={`popular-${item.type}-${item.value}`}
                  icon={item.type === 'tag' ? <Tag className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                  label={item.type === 'tag' ? `#${item.label}` : item.label}
                  count={item.count}
                  color={item.color}
                  onClick={() => handleSuggestionClick(item)}
                  isHighlighted={highlightedIndex === index}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;